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
    let highlightedSatellite = null;
    let highlightTimer = null;

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
        updateActiveSatellites(selectedSatNames.map(name => allTleData[name])); // Initial population

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

                // If satellite already exists in our D3 list, update its position and color
                if (activeSatellites[satData.name]) {
                    activeSatellites[satData.name].positionGd = satData.positionGd;
                    activeSatellites[satData.name].color = satData.color;
                    // Should already have the correct satrec, but update just in case
                    activeSatellites[satData.name].satrec = satData.satrec; 
                } else {
                    // If it's new, add it using the provided data (including satrec)
                    // We trust app.js has already filtered for valid satrec and position
                    if (satData.satrec) { // Double check satrec is provided
                         activeSatellites[satData.name] = { 
                            name: satData.name, 
                            satrec: satData.satrec, // Use the satrec passed directly
                            color: satData.color, 
                            positionGd: satData.positionGd,
                            canvasPos: null, 
                            footprintGeoJson: null 
                        };
                    } else {
                        // This case should be extremely rare now
                        console.error(`MapD3: Received data for new satellite ${satData.name} WITHOUT a satrec object.`);
                    }
                }
            }
        });
        
        // Remove satellites from our internal D3 list if they were NOT in the latest `appSatelliteData`
        Object.keys(activeSatellites).forEach(name => {
            if (!currentActiveNames[name]) {
                delete activeSatellites[name];
            }
        });
    }
    
    // --- Internal function to update satellite data for the animation loop ---
    // This replaces the direct use of app.js data in the original update loop
    function updateActiveSatellites(satDataArray) {
        const newActive = {};
        satDataArray.forEach(satData => {
            if (satData && satData.name && satData.satrec) {
                 newActive[satData.name] = {
                    name: satData.name,
                    satrec: satData.satrec,
                    color: satData.color || '#FFFFFF',
                    positionGd: null, // Position will be updated by app.js via updateSatellites
                    canvasPos: null,
                    footprintGeoJson: null
                };
            }
        });
        activeSatellites = newActive;
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

    function drawObserverMarker() {
        if (!ctx || !projection || !observerLocation) return;

        const [obsX, obsY] = projection([observerLocation.longitude, observerLocation.latitude]);

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

    // --- Main Update Loop ---
    function update() {
        if (!ctx || !projection) {
            console.error("Canvas context or D3 projection not initialized!");
            animationFrameId = requestAnimationFrame(update); // Keep trying?
            return;
        }
        
        clearCanvas();

        // Draw Observer Marker first (so it's potentially under footprints/sats)
        drawObserverMarker();

        // Iterate over the *active* satellites managed by this module
        Object.values(activeSatellites).forEach(sat => {
            // Position (positionGd) is now updated externally by app.js via updateSatellites
            if (sat.positionGd) {
                // Project geodetic coordinates to canvas [x, y]
                sat.canvasPos = projection([sat.positionGd.longitude, sat.positionGd.latitude]);

                // Calculate footprint if height is valid
                const heightKm = sat.positionGd.height;
                sat.footprintGeoJson = null; // Reset footprint
                if (heightKm > 0 && sat.positionGd.latitude !== undefined && sat.positionGd.longitude !== undefined) {
                    const footprintPoints = calculateFootprint(sat.positionGd);
                    if (footprintPoints.length > 0) {
                        sat.footprintGeoJson = {
                            type: "Polygon",
                            coordinates: [footprintPoints]
                        };
                    }
                }
                // Draw footprint (drawn first so satellites appear on top)
                drawFootprint(sat);
            } else {
                sat.canvasPos = null; // Ensure no drawing if position is missing
                sat.footprintGeoJson = null;
            }
        });

        // Draw satellite dots and labels *after* all footprints
        Object.values(activeSatellites).forEach(sat => {
            if (sat.canvasPos) { // Only draw if position was calculated
                drawSatellite(sat);
            }
        });

        // Schedule the next frame update
        animationFrameId = requestAnimationFrame(update);
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