const satellite = window.satellite;
const d3 = window.d3;

// --- Configuration ---
const satellitesData = [
    { name: "AO-07", tle1: '1 07530U 74089B   25109.50856499 -.00000038  00000-0  55888-4 0  9996', tle2: '2 07530 101.9950 113.2265 0011997 218.1047 264.0596 12.53688327307425', color: 'blue' },
    { name: "SO-50",  tle1: '1 27607U 02058C   25108.84739171  .00002490  00000-0  32885-3 0  9997', tle2: '2 27607  64.5558   0.2033 0050138 346.3279  13.6464 14.81443943201778', color: 'red' },
    { name: "AO-73",  tle1: '1 39444U 13066AE  25109.11390779  .00010620  00000-0  81334-3 0  9995', tle2: '2 39444  97.7717  70.8839 0040615 198.7030 161.2704 15.01386194616454', color: 'lime' },
    { name: "IO-86",  tle1: '1 40931U 15052B   25038.81889873  .00001817  00000-0  15548-3 0  9993', tle2: '2 40931   6.0001 108.1159 0012838 187.7041 172.2889 14.78568669506492', color: 'orange' },
    { name: "AO-91",  tle1: '1 43017U 17073E   25108.44273200  .00012357  00000-0  64507-3 0  9994', tle2: '2 43017  97.5327 340.5433 0174855 344.7667  14.8331 15.03725432401376', color: 'magenta' },
    { name: "PO-101", tle1: '1 43678U 18084H   25109.49620154  .00004760  00000-0  40778-3 0  9993', tle2: '2 43678  98.1015 283.6865 0010229  97.9826 262.2556 14.98027250352733', color: 'yellow' },
];

// Initialize satellite records from TLE data
const satellites = satellitesData.map(satData => ({
    ...satData,
    satrec: satellite.twoline2satrec(satData.tle1, satData.tle2),
    positionGd: null,      // Geodetic position { latitude, longitude, height }
    canvasPos: null,       // Projected [x, y] on canvas
    footprintGeoJson: null // GeoJSON Polygon for footprint
}));

const canvas = document.getElementById('satellite-canvas');
const ctx = canvas.getContext('2d');

// Use the canvas dimensions defined in HTML or CSS
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

// --- D3 Setup ---
// Equirectangular projection maps longitude/latitude directly to x/y
const projection = d3.geoEquirectangular()
    .scale(canvasWidth / (2 * Math.PI)) // Scale projection to fit canvas width
    .translate([canvasWidth / 2, canvasHeight / 2]); // Center the projection

// GeoPath generator using the projection and canvas context
const geoPathGenerator = d3.geoPath(projection, ctx);

// --- Constants ---
const earthRadiusKm = 6371; // For footprint calculation
const satelliteRadius = 15; // Visual radius on canvas
const labelOffset = satelliteRadius + 2; // Vertical offset for name label
const MIN_ELEVATION_DEGREES = 0.0; // Minimum elevation angle for footprint calculation

// --- Drawing Functions ---

/** Clears the entire canvas. */
function clearCanvas() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
}

/** Draws a single satellite marker and its name label. */
function drawSatellite(sat) {
    if (!sat.canvasPos) return; // Skip if canvas position is not calculated

    const [x, y] = sat.canvasPos; // Get coordinates calculated by D3 projection

    // Draw satellite dot
    ctx.fillStyle = sat.color;
    ctx.beginPath();
    ctx.arc(x, y, satelliteRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Draw satellite name label with outline for readability
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.strokeText(sat.name, x, y - labelOffset);
    ctx.fillStyle = 'white';
    ctx.fillText(sat.name, x, y - labelOffset);
}

/** Draws the footprint outline for a single satellite using D3 geoPath. */
function drawFootprint(sat) {
    if (!sat.footprintGeoJson) return; // Skip if footprint GeoJSON is not calculated

    // Style for the footprint outline
    ctx.strokeStyle = sat.color; 
    ctx.lineWidth = 4; // Make the outline thicker
    ctx.globalAlpha = 1.0; // Full opacity for stroke

    ctx.beginPath();
    geoPathGenerator(sat.footprintGeoJson); // Use D3 to draw the projected path
    ctx.stroke(); // Render the outline
}

// --- Main Update Loop ---

/** Updates satellite positions, footprints, and redraws the canvas. */
function update() {
    if (!d3) {
        console.error("D3 library not loaded!");
        return; // Stop if D3 isn't available
    }
    const now = new Date();
    const gmst = satellite.gstime(now); // Greenwich Mean Sidereal Time needed for ECI<->Geodetic conversion

    clearCanvas();

    // Update satellite data and draw footprints
    satellites.forEach(sat => {
        // Get current ECI position from TLE data
        const positionAndVelocity = satellite.propagate(sat.satrec, now);
        const positionEci = positionAndVelocity.position;

        sat.footprintGeoJson = null; // Reset footprint for this frame
        sat.canvasPos = null;        // Reset canvas position for this frame

        if (!positionEci) {
            console.warn(`Propagation failed for ${sat.name}. TLE might be outdated.`);
            sat.positionGd = null;
            return; // Skip processing this satellite
        }

        // Convert Earth-Centered Inertial (ECI) coordinates to Geodetic (latitude, longitude, height)
        const positionGdRad = satellite.eciToGeodetic(positionEci, gmst);
        sat.positionGd = {
            latitude: satellite.radiansToDegrees(positionGdRad.latitude),
            longitude: satellite.radiansToDegrees(positionGdRad.longitude),
            height: positionGdRad.height // Height is in km
        };

        // Project geodetic coordinates to canvas [x, y] using D3
        sat.canvasPos = projection([sat.positionGd.longitude, sat.positionGd.latitude]);

        // Calculate geographic coordinates for the satellite's footprint polygon
        const heightKm = sat.positionGd.height;
        let footprintGeographicPoints = []; // Stores [longitude, latitude] pairs

        if (heightKm > 0) {
            const subLatRad = positionGdRad.latitude; // Satellite sublunar latitude in radians
            const subLonRad = positionGdRad.longitude; // Satellite sublunar longitude in radians
            const minElevationRad = satellite.degreesToRadians(MIN_ELEVATION_DEGREES);

            // Calculate the maximum angular radius of the footprint on the Earth's surface
            const cosAngularRadiusGeometric = earthRadiusKm / (earthRadiusKm + heightKm);
            let angularRadiusToUseRad;

            // Adjust radius based on minimum elevation constraint
            if (cosAngularRadiusGeometric >= Math.cos(minElevationRad)) {
                angularRadiusToUseRad = Math.acos(cosAngularRadiusGeometric);
            } else {
                angularRadiusToUseRad = Math.acos(cosAngularRadiusGeometric / Math.cos(minElevationRad));
            }

            if (!isNaN(angularRadiusToUseRad)) {
                // Calculate points around the footprint circle using spherical trigonometry
                for (let azimuthDegrees = 0; azimuthDegrees <= 360; azimuthDegrees += 5) { // 5 degree step for resolution
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

                    // Normalize longitude to the range [-180, 180] for GeoJSON
                    longitude = ((longitude + 540) % 360) - 180;

                    footprintGeographicPoints.push([longitude, latitude]);
                }

                // Ensure the polygon is closed for GeoJSON
                if (footprintGeographicPoints.length > 0) {
                     footprintGeographicPoints.push(footprintGeographicPoints[0]); // Repeat first point

                     // Create GeoJSON Polygon object (requires coordinates nested in an array)
                     sat.footprintGeoJson = {
                         type: "Polygon",
                         coordinates: [footprintGeographicPoints]
                     };
                }

            } else {
                console.error(`Footprint calculation failed for ${sat.name}: Angular radius is NaN.`);
            }
        }

        // Draw footprint (drawn first so satellites appear on top)
        drawFootprint(sat);
    });

    // Draw satellite dots and labels *after* all footprints are drawn
     satellites.forEach(sat => {
         drawSatellite(sat);
     });

    // Update the info panel with the latest data for the selected satellite
    updateSatelliteInfoPanel();

    // Schedule the next frame update
    requestAnimationFrame(update);
}

// --- Initialization and Event Listeners ---

// Store the name of the currently selected satellite
let currentSelectedSatelliteName = null;

/** Updates the selection state and triggers info panel update. */
function selectSatellite(name) {
    currentSelectedSatelliteName = name;
    updateSatelliteInfoPanel();
}

/** Updates the info panel with details of the selected satellite. */
function updateSatelliteInfoPanel() {
    const infoPanel = document.getElementById('satellite-info');
    if (!infoPanel) {
        console.warn("Info panel element with ID 'satellite-info' not found.");
        return;
    }

    // Find the satellite object matching the selected name
    const selectedSat = satellites.find(sat => sat.name === currentSelectedSatelliteName);

    if (selectedSat) {
        let latStr = 'N/A';
        let lonStr = 'N/A';
        let altStr = 'N/A';

        // Format position data if available
        if (selectedSat.positionGd) {
            latStr = selectedSat.positionGd.latitude.toFixed(2) + '°';
            lonStr = selectedSat.positionGd.longitude.toFixed(2) + '°';
            altStr = selectedSat.positionGd.height.toFixed(0) + ' km';
        }

        // Populate and show the info panel
        infoPanel.innerHTML = `
            <h2>${selectedSat.name}</h2>
            <p>Latitude: ${latStr}</p>
            <p>Longitude: ${lonStr}</p>
            <p>Altitude: ${altStr}</p>
            <p><i>Azimuth/Elevation require observer location.</i></p>
        `;
        infoPanel.style.display = 'block';
    } else {
        // Hide the info panel if no satellite is selected
        infoPanel.style.display = 'none';
    }
}

/** Sets up the click listener for satellite/footprint selection. */
function setupClickListener() {
    canvas.addEventListener('click', function(event) {
        const rect = canvas.getBoundingClientRect();
        // Adjust click coordinates for canvas scaling and offset
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;
        const clickPointCanvas = [canvasX, canvasY]; // Canvas coordinates [x, y]

        let hitDetected = false;
        let selectedSatName = null;

        // Check satellites in reverse draw order (top ones first) for marker hits
        for (let i = satellites.length - 1; i >= 0; i--) {
            const sat = satellites[i];
            if (sat.canvasPos) {
                // Simple distance check against the satellite marker's center
                const dx = clickPointCanvas[0] - sat.canvasPos[0];
                const dy = clickPointCanvas[1] - sat.canvasPos[1];
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= satelliteRadius) {
                    // console.log(`Satellite dot selected: ${sat.name}`); // Keep for debugging if needed
                    selectedSatName = sat.name;
                    hitDetected = true;
                    break; // Stop after the first (topmost) hit
                }
            }
        }

        // If no marker was hit, check footprints using geographic coordinates
        if (!hitDetected) {
             // Convert canvas click coordinates back to geographic [lon, lat]
             const clickPointGeo = projection.invert(clickPointCanvas);

             // Ensure the inverted coordinates are valid
             if (clickPointGeo && !isNaN(clickPointGeo[0]) && !isNaN(clickPointGeo[1])) {
                 // Check footprints in reverse draw order
                 for (let i = satellites.length - 1; i >= 0; i--) {
                     const sat = satellites[i];
                     // Use d3.geoContains for accurate point-in-polygon test on the sphere
                     if (sat.footprintGeoJson && d3.geoContains(sat.footprintGeoJson, clickPointGeo)) {
                         // console.log(`Footprint selected: ${sat.name}`); // Keep for debugging if needed
                         selectedSatName = sat.name;
                         hitDetected = true;
                         break; // Stop after the first (topmost) hit
                     }
                 }
             }
        }

        // Update the selected satellite state (will be null if no hit)
        selectSatellite(selectedSatName);
    });
}


// --- Application Start ---
// Ensure required libraries are loaded before starting
if (satellite && d3) {
    console.log("Satellite.js and D3.js libraries loaded successfully.");
    setupClickListener(); // Initialize the click handler
    update(); // Start the main animation loop
} else {
    // Log errors if libraries are missing
    if (!satellite) console.error("Satellite.js library not found! Check HTML includes.");
    if (!d3) console.error("D3.js library not found! Check HTML includes.");
}