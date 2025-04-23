const satellite = window.satellite;
const d3 = window.d3;

// Module pattern for encapsulation and namespacing
const MapD3 = (() => {
    // Module state
    let canvas, ctx, projection, geoPathGenerator;
    let canvasWidth, canvasHeight;
    let observerLocation = { latitude: 0, longitude: 0 };
    let allTleData = {}; // TLEs passed from app.js
    let activeSatellites = {}; // Currently drawn satellites: { name: { satrec, color, positionGd, canvasPos, footprintGeoJson }, ... }
    let animationFrameId = null;
    let sunCanvasPos = null;
    let observerCanvasPos = null;
    let highlightedSatellite = null;
    let highlightTimer = null;
    let sunPosition = null;
    let lastFrameTime = 0;
    let frameInterval = 600; // Min 300ms to prevent performance issues

    // Visual configuration
    const earthRadiusKm = 6371;
    const satelliteRadius = 5;
    const labelOffset = satelliteRadius + 2;
    const MIN_ELEVATION_DEGREES = 0.0;
    const observerMarkerRadius = 4;
    const observerMarkerColor = '#ff7800';
    const observerMarkerStrokeColor = '#FFFFFF';
    const highlightColor = '#FFFF00';
    const highlightDuration = 3000; // 3 seconds highlight
    const sunSize = 15;
    const sunColor = '#FFD700';

    function init(canvasId, obsData, tleData, selectedSatNames) {
        canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error("Canvas element not found:", canvasId);
            return;
        }
        ctx = canvas.getContext('2d');
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        observerLocation = obsData;
        allTleData = tleData;

        // Configure D3 projection
        projection = d3.geoEquirectangular()
            .scale(canvasWidth / (2 * Math.PI))
            .translate([canvasWidth / 2, canvasHeight / 2]);
        geoPathGenerator = d3.geoPath(projection, ctx);

        // Initialize active satellites based on initial selection
        updateSatellites(selectedSatNames.map(name => allTleData[name]));

        canvas.addEventListener('click', handleCanvasClick);
        startAnimation();
        console.log("MapD3 Initialized");
    }

    // Update active satellites based on new data from app.js
    function updateSatellites(appSatelliteData) {
        // appSatelliteData is an array: [{ name, color, positionGd, satrec }, ...]
        const currentActiveNames = {};
        
        appSatelliteData.forEach(satData => {
            if (satData && satData.name) {
                currentActiveNames[satData.name] = true;
                let sat = activeSatellites[satData.name];

                // Update existing satellite or add new one
                if (sat) {
                    sat.positionGd = satData.positionGd;
                    sat.color = satData.color;
                    sat.satrec = satData.satrec;
                } else {
                    if (satData.satrec) {
                        sat = {
                            name: satData.name,
                            satrec: satData.satrec,
                            color: satData.color,
                            positionGd: satData.positionGd,
                            canvasPos: null,
                            footprintGeoJson: null
                        };
                        activeSatellites[satData.name] = sat;
                    } else {
                        console.error(`MapD3: Received data for new satellite ${satData.name} WITHOUT a satrec object.`);
                        return;
                    }
                }

                // Calculate satellite's visibility footprint
                sat.footprintGeoJson = null;
                if (sat && sat.positionGd) {
                    const heightKm = sat.positionGd.height;
                    if (heightKm > 0 && typeof sat.positionGd.latitude === 'number' && typeof sat.positionGd.longitude === 'number') {
                        const footprintPoints = calculateFootprint(sat.positionGd);
                        if (footprintPoints.length > 0) {
                            sat.footprintGeoJson = {
                                type: "Polygon",
                                coordinates: [footprintPoints]
                            };
                        }
                    }
                }
            }
        });
        
        // Clean up satellites no longer active
        Object.keys(activeSatellites).forEach(name => {
            if (!currentActiveNames[name]) {
                delete activeSatellites[name];
            }
        });
    }
    
    function clearCanvas() {
        if (ctx) {
             ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        }
    }

    function drawSatellite(sat) {
        if (!sat.canvasPos || !ctx) return;
        const [x, y] = sat.canvasPos;

        const isHighlighted = (sat.name === highlightedSatellite);
        const satColor = isHighlighted ? highlightColor : sat.color;

        // Draw satellite dot
        ctx.fillStyle = satColor;
        ctx.beginPath();
        ctx.arc(x, y, isHighlighted ? satelliteRadius * 1.5 : satelliteRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Draw name label with improved visibility for highlighted satellites
        ctx.font = isHighlighted ? 'bold 45px sans-serif' : 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = isHighlighted ? 6 : 5;
        ctx.strokeText(sat.name, x, y - labelOffset);
        ctx.fillStyle = isHighlighted ? highlightColor : 'white';
        ctx.fillText(sat.name, x, y - labelOffset);
        
        // Add pulsing effect for highlighted satellites
        if (isHighlighted) {
            const pulseRadius = satelliteRadius * 3;
            const now = Date.now();
            const pulseOpacity = 0.5 + 0.5 * Math.sin(now / 200);
            
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 2;
            ctx.globalAlpha = pulseOpacity;
            ctx.beginPath();
            ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    // Draw the sun icon
    function drawSun(canvasPos) {
        if (!canvasPos || !ctx) return;
        const [x, y] = canvasPos;

        // Draw sun circle
        ctx.fillStyle = sunColor;
        ctx.beginPath();
        ctx.arc(x, y, sunSize, 0, 2 * Math.PI);
        ctx.fill();

        // Draw sun rays
        ctx.strokeStyle = sunColor;
        ctx.lineWidth = 2;
        const rayLength = sunSize * 0.7;
        const numRays = 8;
        
        for (let i = 0; i < numRays; i++) {
            const angle = (i * 2 * Math.PI) / numRays;
            const startX = x + Math.cos(angle) * sunSize;
            const startY = y + Math.sin(angle) * sunSize;
            const endX = x + Math.cos(angle) * (sunSize + rayLength);
            const endY = y + Math.sin(angle) * (sunSize + rayLength);
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        // Draw label
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 5;
        ctx.strokeText('SUN', x, y - sunSize - 10);
        ctx.fillStyle = 'white';
        ctx.fillText('SUN', x, y - sunSize - 10);
    }

    function drawFootprint(sat) {
        if (!sat.footprintGeoJson || !ctx) return;
        ctx.strokeStyle = sat.color; 
        ctx.lineWidth = 8;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        geoPathGenerator(sat.footprintGeoJson);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    function drawObserverMarker(canvasPos) {
        if (!ctx || !canvasPos) return;
        const [obsX, obsY] = canvasPos;

        if (isNaN(obsX) || isNaN(obsY)) return;

        ctx.fillStyle = observerMarkerColor;
        ctx.strokeStyle = observerMarkerStrokeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(obsX, obsY, observerMarkerRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    // Get current sun position for visualization
    function calculateSunPosition() {
        if (!window.getSunPositionEci) return null;
        
        const now = new Date();
        const sunEci = window.getSunPositionEci(now);
        
        if (!sunEci) return null;
        
        // Convert ECI to geodetic coordinates
        const gmst = satellite.gstime(now);
        const sunGd = satellite.eciToGeodetic(sunEci, gmst);
        
        return {
            latitude: satellite.degreesLat(sunGd.latitude),
            longitude: satellite.degreesLong(sunGd.longitude),
            height: sunGd.height
        };
    }

    // Main rendering loop - throttled for performance
    function update(timestamp) {
        animationFrameId = requestAnimationFrame(update);
        
        // Throttle frames for performance
        if (!timestamp || timestamp - lastFrameTime < frameInterval) {
            return;
        }
        
        lastFrameTime = timestamp;
        
        if (!ctx || !projection) {
            console.error("Canvas context or D3 projection not initialized!");
            return;
        }
        
        clearCanvas();

        // Project observer location to canvas
        observerCanvasPos = projection([observerLocation.longitude, observerLocation.latitude]);
        if (observerCanvasPos && !isNaN(observerCanvasPos[0])) {
            drawObserverMarker(observerCanvasPos);
        }

        // Calculate and project sun position
        const sunGeoPos = calculateSunPosition();
        sunCanvasPos = null;
        if (sunGeoPos) {
            sunCanvasPos = projection([sunGeoPos.longitude, sunGeoPos.latitude]);
        }

        // Draw satellite footprints
        Object.values(activeSatellites).forEach(sat => {
            if (sat.footprintGeoJson) {
                drawFootprint(sat);
            }
        });

        // Draw the sun
        if (sunCanvasPos && !isNaN(sunCanvasPos[0])) {
            drawSun(sunCanvasPos);
        }

        // Draw satellites and labels
        Object.values(activeSatellites).forEach(sat => {
            if (sat.positionGd) {
                sat.canvasPos = projection([sat.positionGd.longitude, sat.positionGd.latitude]);
                if (sat.canvasPos && !isNaN(sat.canvasPos[0])) {
                    drawSatellite(sat);
                }
            } else {
                sat.canvasPos = null;
            }
        });
    }
    
    // Calculate satellite visibility footprint based on height and min elevation
    function calculateFootprint(positionGd) {
        const heightKm = positionGd.height;
        const subLatRad = satellite.degreesToRadians(positionGd.latitude);
        const subLonRad = satellite.degreesToRadians(positionGd.longitude);
        let footprintGeographicPoints = [];

        const minElevationRad = satellite.degreesToRadians(MIN_ELEVATION_DEGREES);
        const cosAngularRadiusGeometric = earthRadiusKm / (earthRadiusKm + heightKm);
        
        if (cosAngularRadiusGeometric < -1 || cosAngularRadiusGeometric > 1) {
            console.warn("Invalid geometric angular radius for footprint.");
            return [];
        }

        let angularRadiusToUseRad = 0;
        const visibilityLimitAngleRad = Math.acos(cosAngularRadiusGeometric);
        
        if (minElevationRad > visibilityLimitAngleRad) {
            // Minimum elevation is beyond the geometric horizon - empty footprint
             return [];
        } else {
            // Adjust radius based on minimum elevation constraint using spherical law of sines
            const sinHorizonAngle = (earthRadiusKm * Math.sin(Math.PI/2 + minElevationRad)) / (earthRadiusKm + heightKm);
             if(sinHorizonAngle < -1 || sinHorizonAngle > 1){
                console.warn("Invalid sine value in footprint calculation");
                return [];
             }
            const horizonAngleRad = Math.asin(sinHorizonAngle);
            angularRadiusToUseRad = Math.PI/2 - horizonAngleRad - minElevationRad;
        }

        if (!isNaN(angularRadiusToUseRad) && angularRadiusToUseRad > 0) {
            // Generate points around the satellite in 10-degree steps
            for (let azimuthDegrees = 0; azimuthDegrees <= 360; azimuthDegrees += 10) {
                const azimuthRad = satellite.degreesToRadians(azimuthDegrees);
                const latRad = Math.asin(
                    Math.sin(subLatRad) * Math.cos(angularRadiusToUseRad) +
                    Math.cos(subLatRad) * Math.sin(angularRadiusToUseRad) * Math.cos(azimuthRad)
                );
                let lonRad = subLonRad + Math.atan2(
                    Math.sin(azimuthRad) * Math.sin(angularRadiusToUseRad) * Math.cos(subLatRad),
                    Math.cos(angularRadiusToUseRad) - Math.sin(subLatRad) * Math.sin(latRad)
                );

                let longitude = satellite.radiansToDegrees(lonRad);
                let latitude = satellite.radiansToDegrees(latRad);
                longitude = ((longitude + 540) % 360) - 180; // Normalize longitude
                footprintGeographicPoints.push([longitude, latitude]);
            }
             if (footprintGeographicPoints.length > 0) {
                 footprintGeographicPoints.push(footprintGeographicPoints[0]); // Close polygon
             }
        } else {
             console.warn(`Footprint calculation failed: Angular radius issue (${angularRadiusToUseRad}).`);
             return [];
        }
        return footprintGeographicPoints;
    }

    function startAnimation() {
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(update);
        }
    }

    function stopAnimation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    // Handle clicks on the map - detect clicks on satellites or their footprints
    function handleCanvasClick(event) {
        if (!projection || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        // Adjust for canvas scaling
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;

        // Convert canvas coords to geographic coords
        const [lon, lat] = projection.invert([canvasX, canvasY]);
        
        console.log(`Canvas click at (${canvasX.toFixed(0)}, ${canvasY.toFixed(0)}), inverted to Geo: (${lon.toFixed(2)}, ${lat.toFixed(2)})`);

        let clickedSatName = null;
        let minDistanceSq = Infinity;

        // Find closest satellite to click point
        Object.values(activeSatellites).forEach(sat => {
            if (sat.canvasPos) {
                const dx = sat.canvasPos[0] - canvasX;
                const dy = sat.canvasPos[1] - canvasY;
                const distSq = dx * dx + dy * dy;
                const clickRadius = satelliteRadius + 5; // Extend click hit area

                if (distSq < clickRadius * clickRadius && distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    clickedSatName = sat.name;
                }
            }
            
            // Check for clicks inside footprint
            if (!clickedSatName && sat.footprintGeoJson) {
                if (d3.geoContains(sat.footprintGeoJson, [lon, lat])) {
                    clickedSatName = sat.name;
                }
            }
        });

        if (clickedSatName) {
             console.log(`Satellite clicked: ${clickedSatName}`);
            if (typeof window.showSatelliteInfo === 'function') {
                window.showSatelliteInfo(clickedSatName);
            } else {
                console.error('window.showSatelliteInfo function not found!');
            }
        } else {
            console.log("No satellite clicked.");
        }
    }
    
    // Temporarily highlight a satellite on the map
    function highlightSatellite(satName) {
        if (highlightTimer) {
            clearTimeout(highlightTimer);
            highlightTimer = null;
        }
        
        highlightedSatellite = satName;
        
        highlightTimer = setTimeout(() => {
            highlightedSatellite = null;
            highlightTimer = null;
        }, highlightDuration);
    }

    // Public API
    return {
        init: init,
        updateSatellites: updateSatellites,
        start: startAnimation,
        stop: stopAnimation,
        highlightSatellite: highlightSatellite
    };

})();

// Make MapD3 available globally
window.MapD3 = MapD3;