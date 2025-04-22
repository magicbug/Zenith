const satellite = window.satellite;
const d3 = window.d3;

// --- Wrap code in an object/namespace ---
const MapD3 = (() => {
    // --- Module Variables ---
    let canvas, ctx, projection, geoPathGenerator;
    let canvasWidth, canvasHeight;
    let observerLocation = { latitude: 0, longitude: 0 }; // Store observer location
    let allTleData = {}; // Store all available TLEs passed from app.js
    let activeSatellites = {}; // Store satellite data for currently *drawn* satellites { name: { satrec, color, positionGd, canvasPos, footprintGeoJson }, ... }
    let animationFrameId = null;
    let sunCanvasPos = null;
    let observerCanvasPos = null;
    let highlightedSatellite = null;
    let highlightTimer = null;
    let sunPosition = null; // Store the sun's position
    let lastFrameTime = 0; // Store the time of the last frame render
    let frameInterval = 500;

    // --- Constants ---
    const earthRadiusKm = 6371;
    const satelliteRadius = 5; // Visual radius on canvas (smaller than mockup)
    const labelOffset = satelliteRadius + 2;
    const MIN_ELEVATION_DEGREES = 0.0;
    const observerMarkerRadius = 4;
    const observerMarkerColor = '#ff7800'; // Orange
    const observerMarkerStrokeColor = '#FFFFFF';
    const highlightColor = '#FFFF00'; // Bright yellow for highlighted satellite
    const highlightDuration = 3000; // 3 seconds highlight
    const sunSize = 15; // Size of the sun icon
    const sunColor = '#FFD700'; // Gold color for the sun

    // --- Initialization ---
    function init(canvasId, obsData, tleData, selectedSatNames) {
        canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error("Canvas element not found:", canvasId);
            return;
        }
        ctx = canvas.getContext('2d');
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        observerLocation = obsData; // Store observer data from app.js
        allTleData = tleData; // Store TLE reference from app.js

        // D3 Setup
        projection = d3.geoEquirectangular()
            .scale(canvasWidth / (2 * Math.PI))
            .translate([canvasWidth / 2, canvasHeight / 2]);
        geoPathGenerator = d3.geoPath(projection, ctx);

        // Initialize active satellites based on initial selection
        updateSatellites(selectedSatNames.map(name => allTleData[name])); // Initial population

        // Add click listener
        canvas.addEventListener('click', handleCanvasClick);

        // Start animation loop
        startAnimation();
        console.log("MapD3 Initialized");
    }

    // --- Public Function to Update Satellites from app.js ---
    function updateSatellites(appSatelliteData) {
        // `appSatelliteData` is an array: [{ name, color, positionGd, satrec }, ...]
        const currentActiveNames = {};
        
        appSatelliteData.forEach(satData => {
            if (satData && satData.name) {
                currentActiveNames[satData.name] = true;
                let sat = activeSatellites[satData.name];

                // If satellite already exists, update its data
                if (sat) {
                    sat.positionGd = satData.positionGd;
                    sat.color = satData.color;
                    sat.satrec = satData.satrec; // Ensure satrec is updated if it changes
                } else {
                    // If it's new, add it
                    if (satData.satrec) {
                        sat = {
                            name: satData.name,
                            satrec: satData.satrec,
                            color: satData.color,
                            positionGd: satData.positionGd,
                            canvasPos: null,
                            footprintGeoJson: null // Initialize footprint
                        };
                        activeSatellites[satData.name] = sat;
                    } else {
                        console.error(`MapD3: Received data for new satellite ${satData.name} WITHOUT a satrec object.`);
                        return; // Skip this satellite if no satrec
                    }
                }

                // --- Calculate Footprint Here (Runs every 5 seconds) ---
                sat.footprintGeoJson = null; // Reset footprint before calculation
                // Only calculate if position is valid and satellite object exists
                if (sat && sat.positionGd) {
                    const heightKm = sat.positionGd.height;
                    // Check for valid position data before calculating footprint
                    if (heightKm > 0 && typeof sat.positionGd.latitude === 'number' && typeof sat.positionGd.longitude === 'number') {
                        const footprintPoints = calculateFootprint(sat.positionGd);
                        if (footprintPoints.length > 0) {
                            sat.footprintGeoJson = {
                                type: "Polygon",
                                coordinates: [footprintPoints]
                            };
                        }
                    } else {
                         // Log if position data is invalid for footprint calculation
                         // console.warn(`MapD3: Invalid positionGd for footprint calculation for ${sat.name}`, sat.positionGd);
                    }
                }
                // --- End Footprint Calculation ---
            }
        });
        
        // Remove satellites no longer active
        Object.keys(activeSatellites).forEach(name => {
            if (!currentActiveNames[name]) {
                delete activeSatellites[name];
            }
        });
    }
    
    // --- Drawing Functions ---
    function clearCanvas() {
        if (ctx) {
             ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        }
    }

    function drawSatellite(sat) {
        if (!sat.canvasPos || !ctx) return;
        const [x, y] = sat.canvasPos;

        // Determine if this satellite is highlighted
        const isHighlighted = (sat.name === highlightedSatellite);
        
        // Use highlight color if satellite is highlighted, otherwise use normal color
        const satColor = isHighlighted ? highlightColor : sat.color;

        // Draw satellite dot
        ctx.fillStyle = satColor;
        ctx.beginPath();
        ctx.arc(x, y, isHighlighted ? satelliteRadius * 1.5 : satelliteRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Draw satellite name label - Increased visibility for highlighted satellites
        ctx.font = isHighlighted ? 'bold 45px sans-serif' : 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = isHighlighted ? 6 : 5;
        ctx.strokeText(sat.name, x, y - labelOffset);
        ctx.fillStyle = isHighlighted ? highlightColor : 'white';
        ctx.fillText(sat.name, x, y - labelOffset);
        
        // If highlighted, draw a pulsing circle around the satellite
        if (isHighlighted) {
            const pulseRadius = satelliteRadius * 3;
            const now = Date.now();
            const pulseOpacity = 0.5 + 0.5 * Math.sin(now / 200); // Pulsing effect
            
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 2;
            ctx.globalAlpha = pulseOpacity;
            ctx.beginPath();
            ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    // Draw the sun with an SVG-like icon
    function drawSun(canvasPos) {
        if (!canvasPos || !ctx) return;
        const [x, y] = canvasPos;

        // Draw sun circle
        ctx.fillStyle = sunColor;
        ctx.beginPath();
        ctx.arc(x, y, sunSize, 0, 2 * Math.PI);
        ctx.fill();

        // Draw sun rays (straight lines)
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

        // Draw "SUN" label
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
        // Increased visibility
        ctx.strokeStyle = sat.color; 
        ctx.lineWidth = 8; // Thicker footprint line
        ctx.globalAlpha = 0.85; // More opaque
        ctx.beginPath();
        geoPathGenerator(sat.footprintGeoJson);
        ctx.stroke();
        ctx.globalAlpha = 1.0; // Reset alpha
    }

    function drawObserverMarker(canvasPos) {
        if (!ctx || !canvasPos) return;
        const [obsX, obsY] = canvasPos;

        if (isNaN(obsX) || isNaN(obsY)) return; // Don't draw if projection failed

        // Draw observer dot (e.g., orange circle with white outline)
        ctx.fillStyle = observerMarkerColor;
        ctx.strokeStyle = observerMarkerStrokeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(obsX, obsY, observerMarkerRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    // Calculate the sun's position
    function calculateSunPosition() {
        if (!window.getSunPositionEci) return null;
        
        const now = new Date();
        
        // Use app.js's getSunPositionEci function to get the sun's position in ECI coordinates
        const sunEci = window.getSunPositionEci(now);
        
        if (!sunEci) return null;
        
        // Convert ECI to geodetic coordinates
        const gmst = satellite.gstime(now);
        const sunGd = satellite.eciToGeodetic(sunEci, gmst);
        
        // Convert to degrees and return structure
        return {
            latitude: satellite.degreesLat(sunGd.latitude),
            longitude: satellite.degreesLong(sunGd.longitude),
            height: sunGd.height // Keep height in km
        };
    }

    // --- Main Update Loop ---
    function update(timestamp) {
        // Always request next frame first to maintain the animation loop
        animationFrameId = requestAnimationFrame(update);
        
        // Check if enough time has passed since the last frame
        if (!timestamp || timestamp - lastFrameTime < frameInterval) {
            return; // Skip drawing this frame
        }
        
        // Update last frame time
        lastFrameTime = timestamp;
        
        if (!ctx || !projection) {
            console.error("Canvas context or D3 projection not initialized!");
            return;
        }
        
        clearCanvas();

        // --- Calculate Canvas Positions for Static/Slow Elements ---
        // Calculate observer canvas position
        observerCanvasPos = projection([observerLocation.longitude, observerLocation.latitude]);
        if (observerCanvasPos && !isNaN(observerCanvasPos[0])) {
            drawObserverMarker(observerCanvasPos); // Pass position
        }

        // Calculate sun position (Geo) and project to canvas
        const sunGeoPos = calculateSunPosition();
        sunCanvasPos = null;
        if (sunGeoPos) {
            sunCanvasPos = projection([sunGeoPos.longitude, sunGeoPos.latitude]);
        }

        // --- Draw Footprints (Using Pre-calculated GeoJSON) ---
        // Calculation moved to updateSatellites
        Object.values(activeSatellites).forEach(sat => {
            if (sat.footprintGeoJson) { // Check if footprint exists
                drawFootprint(sat); // Footprint drawing uses sat.footprintGeoJson
            }
        });
        // --- End Footprint Drawing ---

        // Draw the sun
        if (sunCanvasPos && !isNaN(sunCanvasPos[0])) {
            drawSun(sunCanvasPos); // Pass position
        }

        // --- Draw Satellites ---
        Object.values(activeSatellites).forEach(sat => {
            // Project current geodetic position to canvas coordinates
            if (sat.positionGd) {
                sat.canvasPos = projection([sat.positionGd.longitude, sat.positionGd.latitude]);
                // Draw the satellite if the projection was successful
                if (sat.canvasPos && !isNaN(sat.canvasPos[0])) {
                    drawSatellite(sat); // Draw uses sat.canvasPos
                }
            } else {
                sat.canvasPos = null; // Ensure no drawing if positionGd is missing
            }
        });
    }
    
    // --- Footprint Calculation ---
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
            // The required minimum elevation is beyond the geometric horizon - footprint is empty
             return [];
        } else {
            // Adjust radius based on minimum elevation constraint (using spherical law of sines)
            const sinHorizonAngle = (earthRadiusKm * Math.sin(Math.PI/2 + minElevationRad)) / (earthRadiusKm + heightKm);
             if(sinHorizonAngle < -1 || sinHorizonAngle > 1){
                console.warn("Invalid sine value in footprint calculation");
                return [];
             }
            const horizonAngleRad = Math.asin(sinHorizonAngle);
            angularRadiusToUseRad = Math.PI/2 - horizonAngleRad - minElevationRad;
        }

        if (!isNaN(angularRadiusToUseRad) && angularRadiusToUseRad > 0) {
            for (let azimuthDegrees = 0; azimuthDegrees <= 360; azimuthDegrees += 10) { // 10 degree step
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

    // --- Animation Control ---
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

    // --- Event Handling ---
    function handleCanvasClick(event) {
        if (!projection || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        // Adjust click coordinates for canvas scaling and offset
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;

        // Convert canvas click coordinates back to [longitude, latitude]
        const [lon, lat] = projection.invert([canvasX, canvasY]);
        
        console.log(`Canvas click at (${canvasX.toFixed(0)}, ${canvasY.toFixed(0)}), inverted to Geo: (${lon.toFixed(2)}, ${lat.toFixed(2)})`);

        let clickedSatName = null;
        let minDistanceSq = Infinity;

        // Find the visually closest satellite to the click (within a threshold)
        Object.values(activeSatellites).forEach(sat => {
            if (sat.canvasPos) {
                const dx = sat.canvasPos[0] - canvasX;
                const dy = sat.canvasPos[1] - canvasY;
                const distSq = dx * dx + dy * dy;
                const clickRadius = satelliteRadius + 5; // Allow slightly larger click area

                if (distSq < clickRadius * clickRadius && distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    clickedSatName = sat.name;
                }
            }
            
            // Check if click is within the satellite's footprint
            if (!clickedSatName && sat.footprintGeoJson) {
                // Use d3.geoContains to check if the click point is within the footprint polygon
                if (d3.geoContains(sat.footprintGeoJson, [lon, lat])) {
                    clickedSatName = sat.name;
                }
            }
        });

        if (clickedSatName) {
             console.log(`Satellite clicked: ${clickedSatName}`);
            // Call the globally exposed function from app.js
            if (typeof window.showSatelliteInfo === 'function') {
                window.showSatelliteInfo(clickedSatName);
            } else {
                console.error('window.showSatelliteInfo function not found!');
            }
        } else {
            console.log("No satellite clicked.");
             // Optionally, hide the info panel if background is clicked
             // if (typeof window.hideSatelliteInfoPanel === 'function') {
             //    window.hideSatelliteInfoPanel();
             // }
        }
    }
    
    // --- Highlight Satellite Function ---
    function highlightSatellite(satName) {
        // Clear any existing highlight timer
        if (highlightTimer) {
            clearTimeout(highlightTimer);
            highlightTimer = null;
        }
        
        // Set the highlighted satellite
        highlightedSatellite = satName;
        
        // Set a timer to clear the highlight after duration
        highlightTimer = setTimeout(() => {
            highlightedSatellite = null;
            highlightTimer = null;
        }, highlightDuration);
    }

    // --- Return Public API ---
    return {
        init: init,
        updateSatellites: updateSatellites,
        start: startAnimation,
        stop: stopAnimation,
        highlightSatellite: highlightSatellite
        // Expose other functions if needed by app.js
    };

})(); // Immediately invoke the function expression to create the MapD3 object

// --- Remove original mockup code outside the namespace ---
/*
// --- Configuration ---
const satellitesData = [ ... ]; // REMOVED
// Initialize satellite records from TLE data
const satellites = satellitesData.map(satData => ({ ... })); // REMOVED
const canvas = document.getElementById('satellite-canvas'); // Handled in init
const ctx = canvas.getContext('2d'); // Handled in init
const canvasWidth = canvas.width; // Handled in init
const canvasHeight = canvas.height; // Handled in init
// --- D3 Setup ---
const projection = d3.geoEquirectangular()...; // Handled in init
const geoPathGenerator = d3.geoPath(projection, ctx); // Handled in init
// --- Constants ---
// ... (Moved inside namespace)
// --- Drawing Functions ---
function clearCanvas() { ... } // Moved inside namespace
function drawSatellite(sat) { ... } // Moved inside namespace
function drawFootprint(sat) { ... } // Moved inside namespace
// --- Main Update Loop ---
function update() { ... } // Moved inside namespace and adapted
// --- Initialization and Event Listeners ---
let currentSelectedSatelliteName = null; // Handled by app.js
function selectSatellite(name) { ... } // Handled by app.js
function updateSatelliteInfoPanel() { ... } // Handled by app.js
function handleCanvasClick(event) { ... } // Moved inside namespace

// Initial call to start the animation loop
// requestAnimationFrame(update); // Started by init function

// Setup click listener for satellite selection
// canvas.addEventListener('click', handleCanvasClick); // Added in init
*/

// Make MapD3 available globally
window.MapD3 = MapD3;