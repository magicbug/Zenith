// Global variables
let map;
let satelliteMarkers = {};
let satelliteFootprints = {};
let selectedSatellites = [];
let observer = {
    latitude: 51.5074,
    longitude: -0.1278,
    elevation: 0
};
let observer2 = {
    latitude: 0,
    longitude: 0,
    elevation: 0,
    gridSquare: ""
};
let updateInterval;
let passesUpdateInterval;
let allSkedPasses = [];
let SKED_PREDICTION_DAYS = 1;
let SKED_MIN_ELEVATION = 5;
// Notification-related variables
let notifiedPasses = new Map(); // Store IDs of passes we've notified for
let notificationCheckInterval;
let notificationsEnabled = false;
const NOTIFICATION_THRESHOLD_MINUTES = 15; // Minutes before pass to show notification

// Make tleData a true window-level variable to avoid scope issues
window.tleData = {};

// Constants
const TLE_URL = 'fetch_tle.php';  // Changed to use our PHP proxy script
const UPDATE_INTERVAL_MS = 5000; // Update satellite positions every 5 seconds
const PASS_UPDATE_INTERVAL_MS = 60000; // Update passes every minute
const PASS_PREDICTION_HOURS = 24; // Predict passes for the next 24 hours
const FOOTPRINT_POINTS = 36; // Number of points to draw the footprint circle

// Add to your global variables at the top of the file
let satInfoUpdateInterval = null;
const SAT_INFO_UPDATE_INTERVAL_MS = 1000; // Update info every second
let currentInfoSatellite = null;

// Hams.at API configuration
let hamsAtApiKey = '';
let enableRoves = true;
let upcomingRoves = [];
let showUnworkableRoves = false;

// CSN Technologies S.A.T configuration
let enableCsnSat = false;
let csnSatAddress = '';
let satAPIAvailable = false;
let currentSelectedSatelliteForSAT = '';

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load settings from local storage first, before map initialization
    loadObserverFromLocalStorage();
    loadSelectedSatellitesFromLocalStorage();
    loadHamsAtSettingsFromLocalStorage();
    loadCsnSatSettingsFromLocalStorage();
    
    // Check S.A.T API availability
    if (enableCsnSat && csnSatAddress) {
        checkSATAPIAvailability();
    }
    
    // Initialize map after observer location is loaded
    initMap();
    
    updateObserverDisplay();
    setupEventListeners();
    fetchTLEs();

    // Make sure the modal is properly initialized
    const optionsModal = document.getElementById('options-modal');
    if (optionsModal) {
        optionsModal.style.display = 'none';
    }

    const manualTleModal = document.getElementById('manual-tle-input');
    if (manualTleModal) {
        manualTleModal.style.display = 'none';
    }

    // Create and add the satellite info panel
    const infoPanel = document.createElement('div');
    infoPanel.id = 'satellite-info-panel';
    infoPanel.className = 'info-panel';
    infoPanel.style.display = 'none';
    
    const mapContainer = document.querySelector('.map-container');
    mapContainer.appendChild(infoPanel);

    // Load Hams.at API settings
    loadApiSettings();
    
    // Setup Roves panel if enabled
    if (enableRoves) {
        fetchUpcomingRoves();
    }
    
    // Add event listeners for API settings
    document.getElementById('hams-at-api-key').addEventListener('input', function() {
        hamsAtApiKey = this.value.trim();
        saveHamsAtSettingsToLocalStorage();
        if (enableRoves && hamsAtApiKey) {
            fetchUpcomingRoves();
        }
    });
    
    document.getElementById('enable-roves').addEventListener('change', function() {
        enableRoves = this.checked;
        saveHamsAtSettingsToLocalStorage();
        if (enableRoves && hamsAtApiKey) {
            fetchUpcomingRoves();
        } else {
            document.getElementById('upcoming-roves').innerHTML = 
                '<div class="rove-item">Roves display is disabled</div>';
        }
    });

    // Add event listener for the unworkable roves toggle
    document.getElementById('show-unworkable-roves').addEventListener('change', function() {
        showUnworkableRoves = this.checked;
        saveHamsAtSettingsToLocalStorage();
        if (enableRoves && hamsAtApiKey) {
            displayUpcomingRoves();
        }
    });

    // Add event listeners for CSN SAT settings
    document.getElementById('enable-csn-sat').addEventListener('change', function() {
        enableCsnSat = this.checked;
        saveCsnSatSettingsToLocalStorage();
        
        // Check API availability when enabled
        if (enableCsnSat && csnSatAddress) {
            checkSATAPIAvailability();
        }
    });
    
    document.getElementById('csn-sat-address').addEventListener('input', function() {
        csnSatAddress = this.value.trim();
        saveCsnSatSettingsToLocalStorage();
        
        // Check API availability if enabled and address field has content
        if (enableCsnSat && csnSatAddress) {
            // Use debounce to avoid making too many API calls while typing
            clearTimeout(window.satAddressTimeout);
            window.satAddressTimeout = setTimeout(() => {
                checkSATAPIAvailability();
            }, 1000); // Wait 1 second after typing stops
        }
    });

    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and panes
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Get the tab ID and activate the corresponding pane
            const tabId = button.getAttribute('data-tab');
            document.getElementById(tabId + '-tab').classList.add('active');
        });
    });

    // Initialize notifications
    initNotifications();
    
    // Test notification button
    const testNotificationBtn = document.getElementById('test-notification');
    if (testNotificationBtn) {
        testNotificationBtn.addEventListener('click', showTestNotification);
    }
    
    // Initialize S.A.T control buttons
    initSatControlButtons();

    // Help modal functionality
    const helpModal = document.getElementById('help-modal');
    const openHelpBtn = document.getElementById('open-help');
    const helpCloseBtn = document.querySelector('.help-close');

    openHelpBtn.addEventListener('click', () => {
        helpModal.style.display = 'block';
    });

    helpCloseBtn.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });

    // Close help modal if clicked outside
    window.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.style.display = 'none';
        }
    });

    // Tab switching functionality
});

// Initialize the Leaflet map
function initMap() {
    // Initialize map with the observer location loaded from localStorage
    map = L.map('satellite-map').setView([observer.latitude, observer.longitude], 3);
    
    // Create a custom pane for satellite footprints that sits below markers
    map.createPane('footprints');
    map.getPane('footprints').style.zIndex = 350; // Between tile layer and overlay pane
    
    // Add the base map layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(map);
    
    // Add observer marker as just a dot (no popup)
    addObserverMarker();
}

// Add or update the observer marker
function addObserverMarker() {
    // Remove existing observer marker if it exists
    if (window.observerMarker) {
        map.removeLayer(window.observerMarker);
    }
    
    // Create a circle marker for the observer location
    window.observerMarker = L.circleMarker([observer.latitude, observer.longitude], {
        radius: 5,
        fillColor: '#3388ff',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);
}

// Set up event listeners
function setupEventListeners() {
    const modal = document.getElementById('options-modal');
    const openModalBtn = document.getElementById('open-options');
    const closeBtn = document.querySelector('.close');
    const saveBtn = document.getElementById('save-options');
    const selectAllBtn = document.getElementById('select-all');
    const deselectAllBtn = document.getElementById('deselect-all');
    const refreshTleBtn = document.getElementById('refresh-tle');
    const satelliteSearch = document.getElementById('satellite-search');
    
    // Manual TLE elements
    const manualTleModal = document.getElementById('manual-tle-input');
    const showManualTleBtn = document.getElementById('show-manual-tle');
    const submitManualTleBtn = document.getElementById('submit-manual-tle');
    const cancelManualTleBtn = document.getElementById('cancel-manual-tle');
    const manualCloseBtn = document.querySelector('.manual-close');

    // Modal open/close functionality
    openModalBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        // Force repopulate satellite list when opening modal
        populateSatelliteList();
        
        // Set the notification checkbox state based on current setting
        const notificationCheckbox = document.getElementById('enable-notifications');
        if (notificationCheckbox) {
            const savedNotificationsEnabled = localStorage.getItem('notificationsEnabled');
            notificationCheckbox.checked = savedNotificationsEnabled === 'true';
        }
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    saveBtn.addEventListener('click', () => {
        updateObserverLocation();
        updateSelectedSatellites();
        
        // Save notification preferences when closing the modal
        const notificationsEnabled = document.getElementById('enable-notifications').checked;
        localStorage.setItem('notificationsEnabled', notificationsEnabled.toString());
        
        if (notificationsEnabled) {
            initNotifications();
        } else {
            if (notificationCheckInterval) {
                clearInterval(notificationCheckInterval);
                notificationCheckInterval = null;
            }
        }
        
        // Save API settings
        saveApiSettings();
        
        // Save CSN SAT settings
        saveCsnSatSettingsToLocalStorage();
        
        // Check the S.A.T API availability after saving settings
        if (enableCsnSat && csnSatAddress) {
            checkSATAPIAvailability();
        }
        
        // Update roves if enabled
        if (enableRoves && hamsAtApiKey) {
            fetchUpcomingRoves();
        } else {
            document.getElementById('upcoming-roves').innerHTML = 
                '<div class="rove-item">Roves display is disabled or API key is missing.</div>';
        }
        
        modal.style.display = 'none';
    });

    // Close modal if clicked outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
        if (e.target === manualTleModal) {
            manualTleModal.style.display = 'none';
        }
    });

    // Satellite selection
    selectAllBtn.addEventListener('click', selectAllSatellites);
    deselectAllBtn.addEventListener('click', deselectAllSatellites);
    refreshTleBtn.addEventListener('click', fetchTLEs);

    // Manual TLE input
    showManualTleBtn.addEventListener('click', () => {
        manualTleModal.style.display = 'block';
        document.getElementById('manual-tle-error').style.display = 'none';
    });
    
    submitManualTleBtn.addEventListener('click', () => {
        const tleData = document.getElementById('tles-textarea').value;
        if (tleData.trim()) {
            processTLEs(tleData);
            manualTleModal.style.display = 'none';
        } else {
            document.getElementById('manual-tle-error').textContent = 'Please enter valid TLE data';
            document.getElementById('manual-tle-error').style.display = 'block';
        }
    });
    
    cancelManualTleBtn.addEventListener('click', () => {
        manualTleModal.style.display = 'none';
    });
    
    manualCloseBtn.addEventListener('click', () => {
        manualTleModal.style.display = 'none';
    });

    // Search functionality
    satelliteSearch.addEventListener('input', filterSatellites);

    // Geolocation
    const geoLocationBtn = document.getElementById('use-geolocation');
    if (geoLocationBtn) {
        geoLocationBtn.addEventListener('click', useGeolocation);
    }
}

// Select all satellites
function selectAllSatellites() {
    const checkboxes = document.querySelectorAll('#satellite-list input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
}

// Deselect all satellites
function deselectAllSatellites() {
    const checkboxes = document.querySelectorAll('#satellite-list input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

// Filter satellites based on search
function filterSatellites() {
    const searchTerm = document.getElementById('satellite-search').value.toLowerCase();
    const satelliteItems = document.querySelectorAll('.satellite-item');
    
    satelliteItems.forEach(item => {
        const label = item.querySelector('label');
        const satelliteName = label.textContent.toLowerCase();
        
        if (satelliteName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Fetch TLE data from the source
function fetchTLEs() {
    showLoading('Fetching TLE data...');
    
    console.log('Fetching TLE data from:', TLE_URL);
    
    // Use our PHP proxy to fetch the TLE data
    fetch(TLE_URL)
        .then(response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();
        })
        .then(data => {
            console.log('TLE data received, length:', data.length);
            console.log('First 200 characters:', data.substring(0, 200));
            
            // Check if the data looks like valid TLE data
            if (data.length < 10 || !data.includes('1 ') || !data.includes('2 ')) {
                console.error('Invalid TLE data received');
                throw new Error('Invalid TLE data format');
            }
            
            // Check if this is an error message from our PHP script
            if (data.includes('Error:') || data.includes('WARNING:')) {
                console.error('Error from PHP script:', data.substring(0, 100));
                throw new Error('Error from PHP proxy');
            }
            
            processTLEs(data);
            hideLoading();
        })
        .catch(error => {
            console.error('Error fetching TLEs:', error);
            hideLoading();
            
            // Use fallback TLEs instead of showing manual input
            console.log('Using fallback TLEs due to error');
            useFallbackTLEs();
        });
}

// Process TLE data from the response
function processTLEs(data) {
    console.log('Processing TLE data...');
    
    // Parse TLE data
    const lines = data.split('\n');
    console.log('Number of lines:', lines.length);
    
    // Clear the existing data and start fresh
    window.tleData = {};
    let tleCount = 0;
    
    for (let i = 0; i < lines.length; i += 3) {
        if (i + 2 < lines.length) {
            const satelliteName = lines[i].trim();
            const tle1 = lines[i + 1].trim();
            const tle2 = lines[i + 2].trim();
            
            if (satelliteName && tle1 && tle2) {
                // More lenient validation: Line 1 often starts with '1 ' and line 2 with '2 '
                // But we'll check more broadly for digits in specific positions
                const validLine1 = /^\d/.test(tle1);
                const validLine2 = /^\d/.test(tle2);
                
                if (validLine1 && validLine2) {
                    window.tleData[satelliteName] = {
                        name: satelliteName,
                        tle1: tle1,
                        tle2: tle2
                    };
                    tleCount++;
                } else {
                    console.warn(`Skipping invalid TLE format for "${satelliteName}"`);
                    console.log('TLE line 1:', tle1);
                    console.log('TLE line 2:', tle2);
                }
            }
        }
    }
    
    console.log(`Found ${tleCount} valid satellites`);
    console.log(`Size of window.tleData:`, Object.keys(window.tleData).length);
    
    if (tleCount > 0) {
        console.log('First satellite example:', Object.keys(window.tleData)[0]);
        
        // DEBUGGING: Log the full contents
        console.log('Full window.tleData contents:', window.tleData);
    } else {
        console.warn('No valid satellites found!');
    }
    
    populateSatelliteList();
    
    // If we had selected satellites before, try to reselect them
    if (selectedSatellites.length > 0) {
        console.log('Restoring selected satellites:', selectedSatellites);
        selectedSatellites.forEach(satName => {
            const checkbox = document.querySelector(`input[data-satellite="${satName}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    }
    
    updateSelectedSatellites();
    startSatelliteTracking();
}

// Populate the satellite selection list
function populateSatelliteList() {
    console.log('Populating satellite list...');
    const satelliteList = document.getElementById('satellite-list');
    
    if (!satelliteList) {
        console.error('Could not find satellite-list element in DOM');
        return;
    }
    
    satelliteList.innerHTML = '';
    
    // Sort satellites alphabetically
    const satelliteNames = Object.keys(window.tleData).sort();
    console.log('Satellite names to display:', satelliteNames);
    
    if (satelliteNames.length === 0) {
        console.warn('No satellites found in window.tleData object');
        satelliteList.innerHTML = '<p>No satellites found</p>';
        return;
    }
    
    // Create checkbox for each satellite
    satelliteNames.forEach(satName => {
        const item = document.createElement('div');
        item.className = 'satellite-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `sat-${satName.replace(/\s+/g, '-').toLowerCase()}`;
        checkbox.setAttribute('data-satellite', satName);
        
        // Set checkbox state based on selectedSatellites array
        checkbox.checked = selectedSatellites.includes(satName);
        
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = satName;
        
        item.appendChild(checkbox);
        item.appendChild(label);
        satelliteList.appendChild(item);
    });
    
    console.log(`Added ${satelliteNames.length} satellites to the list`);
    console.log('Current selected satellites:', selectedSatellites);
}

// Load selected satellites from local storage
function loadSelectedSatellitesFromLocalStorage() {
    const saved = localStorage.getItem('selectedSatellites');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                selectedSatellites = parsed;
            }
        } catch (error) {
            console.error('Error loading selected satellites from local storage:', error);
        }
    }
}

// Update the list of selected satellites
function updateSelectedSatellites() {
    // Clear current selection
    selectedSatellites = [];
    
    // Get all checked satellites
    const checkedBoxes = document.querySelectorAll('#satellite-list input[type="checkbox"]:checked');
    checkedBoxes.forEach(checkbox => {
        const satName = checkbox.getAttribute('data-satellite');
        if (satName && window.tleData[satName]) {  // Use window.tleData consistently
            selectedSatellites.push(satName);
        }
    });
    
    // Update satellite display on map
    updateSatelliteDisplay();
    
    // Update upcoming passes
    calculateUpcomingPasses();
    
    // Save selection to local storage
    localStorage.setItem('selectedSatellites', JSON.stringify(selectedSatellites));
}

// Update the observer location
function updateObserverLocation() {
    const lat = parseFloat(document.getElementById('latitude').value);
    const lon = parseFloat(document.getElementById('longitude').value);
    const elev = parseFloat(document.getElementById('elevation').value);
    
    // Validate input values
    if (isNaN(lat) || lat < -90 || lat > 90) {
        alert('Latitude must be between -90 and 90 degrees');
        return;
    }
    
    if (isNaN(lon) || lon < -180 || lon > 180) {
        alert('Longitude must be between -180 and 180 degrees');
        return;
    }
    
    if (isNaN(elev)) {
        alert('Elevation must be a valid number');
        return;
    }
    
    // Update observer data
    observer.latitude = lat;
    observer.longitude = lon;
    observer.elevation = elev;
    
    // Update the observer marker on the map
    addObserverMarker();
    
    // Save to local storage
    saveObserverToLocalStorage();
    
    // Update map center
    map.setView([observer.latitude, observer.longitude], map.getZoom());
    
    // Recalculate passes with new location
    calculateUpcomingPasses();
}

// Update satellite display on map (marker and footprint)
function updateSatelliteDisplay() {
    // Clear all existing satellites from map
    Object.keys(satelliteMarkers).forEach(satName => {
        if (satelliteMarkers[satName]) {
            map.removeLayer(satelliteMarkers[satName]);
            delete satelliteMarkers[satName];
        }
        
        if (satelliteFootprints[satName]) {
            map.removeLayer(satelliteFootprints[satName]);
            delete satelliteFootprints[satName];
        }
    });
    
    // Update positions for selected satellites
    updateSatellitePositions();
}

// Start tracking selected satellites
function startSatelliteTracking() {
    // Clear any existing interval
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    
    // Update positions immediately
    updateSatellitePositions();
    
    // Set interval for regular updates
    updateInterval = setInterval(updateSatellitePositions, UPDATE_INTERVAL_MS);
    
    // Start pass prediction updates
    if (passesUpdateInterval) {
        clearInterval(passesUpdateInterval);
    }
    calculateUpcomingPasses();
    passesUpdateInterval = setInterval(calculateUpcomingPasses, PASS_UPDATE_INTERVAL_MS);
}

// Update positions of all selected satellites
function updateSatellitePositions() {
    const now = new Date();
    
    selectedSatellites.forEach(satName => {
        if (!window.tleData[satName]) return;
        
        const sat = window.tleData[satName];
        
        // Calculate position
        const positionAndVelocity = calculateSatellitePosition(sat, now);
        if (!positionAndVelocity) return;
        
        const { position } = positionAndVelocity;
        
        // Update or create marker
        updateSatelliteMarker(satName, position);
        
        // Update or create footprint
        updateSatelliteFootprint(satName, position);
    });
    
    // Remove markers and footprints for satellites no longer selected
    Object.keys(satelliteMarkers).forEach(satName => {
        if (!selectedSatellites.includes(satName)) {
            if (satelliteMarkers[satName]) {
                map.removeLayer(satelliteMarkers[satName]);
                delete satelliteMarkers[satName];
            }
            
            if (satelliteFootprints[satName]) {
                map.removeLayer(satelliteFootprints[satName]);
                delete satelliteFootprints[satName];
            }
        }
    });
}

// Calculate satellite position from TLE data
function calculateSatellitePosition(sat, time) {
    try {
        // Parse TLE data
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        
        // Get position
        const positionAndVelocity = satellite.propagate(satrec, time);
        
        // Convert position to geodetic coordinates
        if (positionAndVelocity.position) {
            const gmst = satellite.gstime(time);
            const positionEci = positionAndVelocity.position;
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);
            
            // Convert to degrees
            const longitude = satellite.degreesLong(positionGd.longitude);
            const latitude = satellite.degreesLat(positionGd.latitude);
            const altitude = positionGd.height;
            
            return {
                position: {
                    latitude,
                    longitude,
                    altitude
                },
                velocity: positionAndVelocity.velocity
            };
        }
        return null;
    } catch (error) {
        console.error(`Error calculating position for ${sat.name}:`, error);
        return null;
    }
}

// Update the satellite marker creation function
function updateSatelliteMarker(satName, position) {
    if (!position) return;
    
    const latLng = [position.latitude, position.longitude];
    
    // Calculate footprint radius
    const earthRadius = 6371000;
    const altitudeMeters = position.altitude * 1000;
    const footprintRadiusMeters = Math.acos(earthRadius / (earthRadius + altitudeMeters)) * earthRadius;
    
    // Create or update footprint and label
    if (!satelliteFootprints[satName]) {
        // Create footprint circle with label
        satelliteFootprints[satName] = L.circle(latLng, {
            radius: footprintRadiusMeters,
            color: getRandomColor(),
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.2,
            interactive: true // Make circle clickable
        }).addTo(map);
        
        // Add label in center of footprint
        const labelIcon = L.divIcon({
            className: 'satellite-label-container',
            html: `<div class="satellite-name-centered">${satName}</div>`,
            iconSize: [0, 0]
        });
        
        satelliteFootprints[satName].label = L.marker(latLng, {
            icon: labelIcon,
            interactive: false // Make label non-interactive
        }).addTo(map);
        
        // Add click handler to the footprint circle
        satelliteFootprints[satName].on('click', () => {
            showSatelliteInfo(satName);
        });
    } else {
        // Update positions and radius
        satelliteFootprints[satName].setLatLng(latLng);
        satelliteFootprints[satName].setRadius(footprintRadiusMeters);
        satelliteFootprints[satName].label.setLatLng(latLng);
    }
}

// Create satellite popup content
function createSatellitePopup(satName, position) {
    const popup = document.createElement('div');
    popup.className = 'satellite-popup';
    
    const name = document.createElement('h3');
    name.textContent = satName;
    popup.appendChild(name);
    
    const info = document.createElement('div');
    info.innerHTML = `
        <p><strong>Latitude:</strong> ${position.latitude.toFixed(4)}°</p>
        <p><strong>Longitude:</strong> ${position.longitude.toFixed(4)}°</p>
        <p><strong>Altitude:</strong> ${(position.altitude * 1000).toFixed(2)} meters</p>
    `;
    popup.appendChild(info);
    
    return popup;
}

// Make sure to add this event listener to your setup
document.addEventListener('DOMContentLoaded', () => {

    // Add close button for satellite info panel
    const infoCloseBtn = document.getElementById('close-info-panel');
    if (infoCloseBtn) {
        infoCloseBtn.addEventListener('click', () => {
            // Hide the panel
            document.getElementById('satellite-info-panel').style.display = 'none';
            
            // Clear the update interval
            if (satInfoUpdateInterval) {
                clearInterval(satInfoUpdateInterval);
                satInfoUpdateInterval = null;
            }
            
            // Reset currently selected satellite
            currentInfoSatellite = null;
        });
    }
    
});

// Update the showSatelliteInfo function to implement real-time updates
function showSatelliteInfo(satName) {
    const infoPanel = document.getElementById('satellite-info-panel');
    
    // Store the currently selected satellite for the update interval
    currentInfoSatellite = satName;
    
    // First update immediately
    updateSatelliteInfoDisplay(satName);
    
    // Ensure the panel is visible
    infoPanel.style.display = 'block';
    
    // Clear any existing update interval
    if (satInfoUpdateInterval) {
        clearInterval(satInfoUpdateInterval);
    }
    
    // Start a new update interval while the panel is visible
    satInfoUpdateInterval = setInterval(() => {
        if (infoPanel.style.display === 'block') {
            updateSatelliteInfoDisplay(currentInfoSatellite);
        } else {
            // If panel is hidden, clear the interval
            clearInterval(satInfoUpdateInterval);
            satInfoUpdateInterval = null;
        }
    }, SAT_INFO_UPDATE_INTERVAL_MS);
    
    // Send the satellite selection to the S.A.T system if enabled
    if (enableCsnSat && satAPIAvailable) {
        selectSatelliteForSAT(satName);
    }
}

// Add a new function that handles updating the satellite info display
function updateSatelliteInfoDisplay(satName) {
    if (!satName) return;
    
    const lookAngles = calculateLookAngles(satName);
    const position = getSatellitePosition(satName);
    const inEclipse = isInEclipse(satName);
    
    if (!position || !lookAngles) {
        console.error('Unable to get satellite position or look angles');
        return;
    }
    
    // Set the satellite name in the header
    document.getElementById('info-satellite-name').textContent = satName;
    
    // Format orbital parameters
    const orbitalSpeed = calculateOrbitalSpeed(satName);
    const orbitalPeriod = calculateOrbitalPeriod(satName);
    const nextPass = getNextPass(satName);
    
    // Set the panel content
    document.getElementById('info-content').innerHTML = `
        <div class="info-section">
            <h4>Current Position</h4>
            <div class="info-grid">
                <div>Latitude:</div><div>${position.latitude.toFixed(2)}°</div>
                <div>Longitude:</div><div>${position.longitude.toFixed(2)}°</div>
                <div>Altitude:</div><div>${(position.altitude * 1000).toFixed(0)} m</div>
                <div>Eclipse:</div><div>${inEclipse ? 
                    '<span class="eclipse-indicator">In Earth\'s Shadow</span>' : 
                    '<span class="sunlight-indicator">In Sunlight</span>'}</div>
            </div>
        </div>
        
        <div class="info-section">
            <h4>Look Angles from Observer</h4>
            <div class="info-grid">
                <div>Azimuth:</div><div>${lookAngles.azimuth.toFixed(1)}°</div>
                <div>Elevation:</div><div>${lookAngles.elevation.toFixed(1)}°</div>
                <div>Range:</div><div>${(lookAngles.range * 1000).toFixed(0)} km</div>
                <div>Visibility:</div><div>${lookAngles.visible ? 
                    '<span class="visible-indicator">Visible</span>' : 
                    '<span class="not-visible-indicator">Not visible</span>'}</div>
            </div>
        </div>
        
        <div class="info-section">
            <h4>Orbital Data</h4>
            <div class="info-grid">
                <div>Speed:</div><div>${orbitalSpeed.toFixed(2)} km/s</div>
                <div>Period:</div><div>${orbitalPeriod.toFixed(0)} min</div>
            </div>
        </div>
        
        ${nextPass ? `
        <div class="info-section">
            <h4>Next Pass</h4>
            <div class="info-grid">
                <div>Start:</div><div>${formatDateTime(nextPass.start)}</div>
                <div>Max Elevation:</div><div>${nextPass.maxElevation.toFixed(1)}°</div>
                <div>Duration:</div><div>${Math.round((nextPass.end - nextPass.start) / (60 * 1000))} min</div>
            </div>
        </div>
        ` : ''}
    `;
}

// Get satellite position
function getSatellitePosition(satName) {
    const now = new Date();
    if (!window.tleData[satName]) {
        console.error('TLE data not found for satellite:', satName);
        return null;
    }
    
    try {
        const sat = window.tleData[satName];
        const positionData = calculateSatellitePosition(sat, now);
        if (!positionData) {
            console.error('Failed to calculate position for satellite:', satName);
            return null;
        }
        return positionData.position;
    } catch (error) {
        console.error(`Error getting position for ${satName}:`, error);
        return null;
    }
}

// Calculate elevation and azimuth for satellite
function calculateLookAngles(satName) {
    if (!window.tleData[satName]) return null;
    
    const now = new Date();
    const sat = window.tleData[satName];
    
    try {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const positionAndVelocity = satellite.propagate(satrec, now);
        
        if (!positionAndVelocity.position) return null;
        
        // Convert observer coordinates to radians
        const observerGd = {
            latitude: observer.latitude * Math.PI / 180,
            longitude: observer.longitude * Math.PI / 180,
            height: observer.elevation / 1000 // km
        };
        
        // Get look angles from observer to satellite
        const gmst = satellite.gstime(now);
        const position = positionAndVelocity.position;
        const positionEcf = satellite.eciToEcf(position, gmst);
        const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
        
        // Convert to degrees
        const azimuth = lookAngles.azimuth * 180 / Math.PI;
        const elevation = lookAngles.elevation * 180 / Math.PI;
        const rangeSat = lookAngles.rangeSat;
        
        return {
            azimuth: (azimuth + 360) % 360, // Normalize to 0-360
            elevation: elevation,
            range: rangeSat,
            visible: elevation > 0
        };
    } catch (error) {
        console.error(`Error calculating look angles for ${satName}:`, error);
        return null;
    }
}

// Calculate orbital speed in km/s
function calculateOrbitalSpeed(satName) {
    if (!window.tleData[satName]) return 0;
    
    try {
        const sat = window.tleData[satName];
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const now = new Date();
        const positionAndVelocity = satellite.propagate(satrec, now);
        
        if (!positionAndVelocity.velocity) return 0;
        
        const velocity = positionAndVelocity.velocity;
        return Math.sqrt(
            Math.pow(velocity.x, 2) + 
            Math.pow(velocity.y, 2) + 
            Math.pow(velocity.z, 2)
        );
    } catch (error) {
        console.error(`Error calculating orbital speed for ${satName}:`, error);
        return 0;
    }
}

// Calculate orbital period in minutes
function calculateOrbitalPeriod(satName) {
    if (!window.tleData[satName]) return 0;
    
    try {
        const sat = window.tleData[satName];
        const tle2 = sat.tle2;
        
        // Extract mean motion from TLE line 2 (revolutions per day)
        const meanMotion = parseFloat(tle2.substring(52, 63).trim());
        
        // Convert to minutes per revolution
        return 1440 / meanMotion; // 1440 = minutes in a day
    } catch (error) {
        console.error(`Error calculating orbital period for ${satName}:`, error);
        return 0;
    }
}

// Get the next pass for a satellite
function getNextPass(satName) {
    const now = new Date();
    const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours ahead
    
    if (!window.tleData[satName]) return null;
    
    try {
        const sat = window.tleData[satName];
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const passes = predictPasses(satrec, observer, now, endTime);
        
        // Find the next pass that hasn't ended yet
        for (const pass of passes) {
            if (pass.end > now) {
                return pass;
            }
        }
        
        return null;
    } catch (error) {
        console.error(`Error getting next pass for ${satName}:`, error);
        return null;
    }
}

// Update the footprint creation function
function updateSatelliteFootprint(satName, position) {
    if (!position) return;
    
    // Calculate footprint radius in meters
    const earthRadius = 6371000;
    const altitudeMeters = position.altitude * 1000;
    const footprintRadiusMeters = Math.acos(earthRadius / (earthRadius + altitudeMeters)) * earthRadius;
    
    // Create or update the footprint circle
    if (!satelliteFootprints[satName]) {
        // Create footprint circle
        satelliteFootprints[satName] = L.circle([position.latitude, position.longitude], {
            radius: footprintRadiusMeters,
            color: getRandomColor(),
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.2,
            pane: 'footprints'  // Use the custom pane we created
        }).addTo(map);
        
        // Add label as a separate marker bound to the circle's center
        const labelIcon = L.divIcon({
            className: 'satellite-label-container',
            html: `<div class="satellite-name-centered">${satName}</div>`,
            iconSize: [0, 0]  // Size of 0 ensures no background
        });
        
        satelliteFootprints[satName].label = L.marker([position.latitude, position.longitude], {
            icon: labelIcon,
            zIndexOffset: 500  // Above footprints but below markers
        }).addTo(map);
        
        // Add click handler to the footprint circle
        satelliteFootprints[satName].on('click', () => {
            const infoPanel = document.getElementById('satellite-info-panel');
            infoPanel.style.display = 'block'; // Show the panel
            showSatelliteInfo(satName);
        });
    } else {
        // Update both footprint and label positions
        satelliteFootprints[satName].setLatLng([position.latitude, position.longitude]);
        satelliteFootprints[satName].setRadius(footprintRadiusMeters);
        satelliteFootprints[satName].label.setLatLng([position.latitude, position.longitude]);
    }
}

// Calculate upcoming passes for selected satellites
function calculateUpcomingPasses() {
    const passesContainer = document.getElementById('upcoming-passes');
    passesContainer.innerHTML = '';
    
    if (selectedSatellites.length === 0) {
        passesContainer.innerHTML = '<p>No satellites selected</p>';
        return;
    }
    
    // For each satellite, predict passes
    const now = new Date();
    const endTime = new Date(now.getTime() + PASS_PREDICTION_HOURS * 60 * 60 * 1000);
    const passes = [];
    
    selectedSatellites.forEach(satName => {
        if (!window.tleData[satName]) return;
        
        try {
            const sat = window.tleData[satName];
            const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
            
            // Predict passes (simplified algorithm)
            const satPasses = predictPasses(satrec, observer, now, endTime);
            
            satPasses.forEach(pass => {
                passes.push({
                    satellite: satName,
                    start: pass.start,
                    end: pass.end,
                    maxElevation: pass.maxElevation
                });
            });
        } catch (error) {
            console.error(`Error calculating passes for ${satName}:`, error);
        }
    });
    
    // Sort passes by start time
    passes.sort((a, b) => a.start - b.start);
    
    // Display passes
    if (passes.length === 0) {
        passesContainer.innerHTML = '<p>No passes found in the next 24 hours</p>';
        return;
    }
    
    passes.forEach(pass => {
        const passItem = document.createElement('div');
        passItem.className = 'pass-item';
        
        // Check if pass is active now
        const isActive = now >= pass.start && now <= pass.end;
        const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
        
        if (isActive) {
            passItem.classList.add('pass-active');
        } else if (timeToPass > 0 && timeToPass <= 15) {
            passItem.classList.add('pass-upcoming'); // Light orange for upcoming passes within 15 minutes
        }

        // Check if the satellite is within the observer's footprint
        const isWithinFootprint = isSatelliteWithinFootprint(pass.satellite);
        if (isWithinFootprint) {
            passItem.classList.add('pass-visible'); // Light green for visible passes
        }
        
        const startTime = formatDate(pass.start);
        const endTime = formatDate(pass.end);
        const duration = Math.round((pass.end - pass.start) / (60 * 1000));
        
        passItem.innerHTML = `
            <div class="pass-satellite-name">${pass.satellite}</div>
            <div class="pass-time">
                <span>${startTime}</span> to <span>${endTime}</span>
            </div>
            <div class="pass-details">
                Duration: ${duration} min | Max Elevation: ${Math.round(pass.maxElevation)}°
            </div>
        `;
        
        // Add click handler to show the satellite info
        passItem.addEventListener('click', () => {
            const satName = pass.satellite;
            
            // Verify satellite exists in TLE data
            if (!window.tleData[satName]) {
                console.error('Satellite TLE data not found:', satName);
                return;
            }
            
            // Get current position
            const position = getSatellitePosition(satName);
            if (position) {
                showSatelliteInfo(satName);
                showPolarRadarForPass(pass);
            } else {
                console.error('Unable to get satellite position:', satName);
            }
        });
        
        passesContainer.appendChild(passItem);
    });
}

// Function to highlight a satellite briefly
function highlightSatellite(satName) {
    if (!satelliteMarkers[satName]) return;
    
    // Store the original icon
    const marker = satelliteMarkers[satName];
    const originalIcon = marker.options.icon;
    
    // Create a highlighted icon
    const highlightedIcon = L.divIcon({
        className: 'satellite-icon highlighted',
        html: `<div class="satellite-dot highlight-pulse"></div><div class="satellite-label highlight">${satName}</div>`,
        iconSize: [100, 20],
        iconAnchor: [5, 5]
    });
    
    // Apply the highlighted icon
    marker.setIcon(highlightedIcon);
    
    // Restore the original icon after a delay
    setTimeout(() => {
        marker.setIcon(originalIcon);
    }, 3000); // 3 seconds
}

// Check if a satellite is within the observer's footprint
function isSatelliteWithinFootprint(satelliteName) {
    const now = new Date();
    const sat = window.tleData[satelliteName];
    if (!sat) return false;

    const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
    const positionAndVelocity = satellite.propagate(satrec, now);
    if (!positionAndVelocity.position) return false;

    const gmst = satellite.gstime(now);
    const positionEci = positionAndVelocity.position;
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);

    const satLat = satellite.degreesLat(positionGd.latitude);
    const satLon = satellite.degreesLong(positionGd.longitude);
    const satAlt = positionGd.height * 1000; // Altitude in meters

    const earthRadius = 6371000; // Earth radius in meters
    const footprintRadius = Math.acos(earthRadius / (earthRadius + satAlt)) * earthRadius;

    const distance = calculateHaversineDistance(observer.latitude, observer.longitude, satLat, satLon);
    return distance <= footprintRadius;
}

// Calculate the Haversine distance between two points
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg) => deg * (Math.PI / 180);

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon1 - lon2);
    const a =
Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Predict satellite passes (simple algorithm)
function predictPasses(satrec, observer, startTime, endTime) {
    const passes = [];
    const stepMinutes = 1; // Step size in minutes
    let currentPass = null;
    
    // Convert observer coordinates to radians
    const observerGd = {
        latitude: observer.latitude * Math.PI / 180,
        longitude: observer.longitude * Math.PI / 180,
        height: observer.elevation / 1000 // km
    };
    
    // Scan time period in steps
    for (let time = new Date(startTime); time <= endTime; time = new Date(time.getTime() + stepMinutes * 60 * 1000)) {
        try {
            // Get satellite position at this time
            const positionAndVelocity = satellite.propagate(satrec, time);
            
            if (!positionAndVelocity.position) {
                continue;
            }
            
            // Get look angles from observer to satellite
            const gmst = satellite.gstime(time);
            const lookAngles = satellite.ecfToLookAngles(observerGd, satellite.eciToEcf(positionAndVelocity.position, gmst));
            
            // Convert elevation to degrees
            const elevationDeg = lookAngles.elevation * 180 / Math.PI;
            
            // Check if satellite is visible (elevation > 0)
            if (elevationDeg > 0) {
                if (!currentPass) {
                    // Start of a new pass
                    currentPass = {
                        start: new Date(time),
                        maxElevation: elevationDeg
                    };
                } else if (elevationDeg > currentPass.maxElevation) {
                    // Update max elevation if higher
                    currentPass.maxElevation = elevationDeg;
                }
            } else if (currentPass) {
                // End of a pass
                currentPass.end = new Date(time);
                passes.push(currentPass);
                currentPass = null;
            }
        } catch (error) {
            console.error('Error in pass prediction:', error);
        }
    }
    
    // Handle a pass that might be ongoing at the end of the prediction period
    if (currentPass) {
        currentPass.end = new Date(endTime);
        passes.push(currentPass);
    }
    
    return passes;
}

// Format date for display
function formatDate(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Format date and time for display
function formatDateTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Get random color for satellite footprint
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Save observer location to local storage
function saveObserverToLocalStorage() {
    localStorage.setItem('observer', JSON.stringify(observer));
}

// Load observer location from local storage
function loadObserverFromLocalStorage() {
    const saved = localStorage.getItem('observer');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                observer.latitude = parsed.latitude || observer.latitude;
                observer.longitude = parsed.longitude || observer.longitude;
                observer.elevation = parsed.elevation || observer.elevation;
            }
        } catch (error) {
            console.error('Error loading observer from local storage:', error);
        }
    }
}

// Update observer display with current values
function updateObserverDisplay() {
    document.getElementById('latitude').value = observer.latitude;
    document.getElementById('longitude').value = observer.longitude;
    document.getElementById('elevation').value = observer.elevation;
}

// Show loading message
function showLoading(message) {
    // Create loading element if it doesn't exist
    let loadingEl = document.getElementById('loading-indicator');
    if (!loadingEl) {
        loadingEl = document.createElement('div');
        loadingEl.id = 'loading-indicator';
        loadingEl.className = 'loading';
        document.body.appendChild(loadingEl);
    }
    
    loadingEl.textContent = message || 'Loading...';
    loadingEl.style.display = 'flex';
}

// Hide loading message
function hideLoading() {
    const loadingEl = document.getElementById('loading-indicator');
    if (loadingEl) {
        loadingEl.style.display = 'none';
    }
}

// Function to use fallback TLE data for demo purposes
function useFallbackTLEs() {
    console.log('Using fallback TLE data for demo');
    
    // Sample TLEs for some popular amateur radio satellites
    const fallbackTLEs = `AO-91 (FOX-1B)
1 43017U 17073E   23150.09546759  .00001976  00000-0  15688-3 0  9996
2 43017  97.7000 182.9558 0025675  32.2147 328.1059 14.78059046296268
AO-92 (FOX-1D)
1 43137U 18004AC  23149.43012268  .00003452  00000-0  23781-3 0  9995
2 43137  97.5807 181.0904 0007575 348.2575  11.8517 14.84202560288065
SO-50
1 27607U 02058C   23150.41389181  .00000512  00000-0  27114-4 0  9992
2 27607  64.5555 308.9962 0072520 342.7423  17.1555 14.71818654 85000
ISS (ZARYA)
1 25544U 98067A   23150.53695899  .00016566  00000-0  30369-3 0  9990
2 25544  51.6431 331.8524 0004641  36.8562 338.1335 15.50127612399416`;
    
    processTLEs(fallbackTLEs);
}

// Use browser's geolocation API to get current location
function useGeolocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    showLoading('Getting your location...');

    navigator.geolocation.getCurrentPosition(
        // Success callback
        (position) => {
            hideLoading();
            document.getElementById('latitude').value = position.coords.latitude.toFixed(6);
            document.getElementById('longitude').value = position.coords.longitude.toFixed(6);
            
            // Try to get elevation using open-elevation API if available
            fetchElevation(position.coords.latitude, position.coords.longitude);
            
            // Update the observer location on the map
            updateObserverLocation();
        },
        // Error callback
        (error) => {
            hideLoading();
            let message = '';
            
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    message = 'User denied the request for geolocation.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    message = 'Location information is unavailable.';
                    break;
                case error.TIMEOUT:
                    message = 'The request to get user location timed out.';
                    break;
                case error.UNKNOWN_ERROR:
                    message = 'An unknown error occurred.';
                    break;
            }
            
            alert('Error getting location: ' + message);
        },
        // Options
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Fetch elevation data for a given latitude and longitude
function fetchElevation(lat, lon) {
    // We'll use a free elevation API
    // Note: This particular API may have usage limits
    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`)
        .then(response => response.json())
        .then(data => {
            if (data && data.results && data.results.length > 0) {
                const elevation = data.results[0].elevation;
                document.getElementById('elevation').value = Math.round(elevation);
            }
        })
        .catch(error => {
            console.error('Error fetching elevation:', error);
            // Silently fail - elevation is less critical than lat/lon
        });
}

// Add CSS for the loading indicator
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        .loading {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            z-index: 9999;
        }
        
        .satellite-dot {
            width: 10px;
            height: 10px;
            background-color: red;
            border-radius: 50%;
        }
        
        .satellite-label {
            font-size: 12px;
            white-space: nowrap;
            color: #fff;
            text-shadow: 1px 1px 1px #000;
            margin-left: 12px;
            margin-top: -10px;
        }
    `;
    document.head.appendChild(style);
    
    // Add CSS for eclipse and sunlight indicators
    const eclipseStyle = document.createElement('style');
    eclipseStyle.textContent = `
        .eclipse-indicator {
            background-color: #3c3c3c;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: bold;
            display: inline-block;
        }
        
        .sunlight-indicator {
            background-color: #ffc107;
            color: #333;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: bold;
            display: inline-block;
        }
        
        .visible-indicator {
            background-color: #4CAF50;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: bold;
            display: inline-block;
        }
        
        .not-visible-indicator {
            background-color: #f44336;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: bold;
            display: inline-block;
        }
    `;
    document.head.appendChild(eclipseStyle);
});

function updateUpcomingPasses() {
    // ...existing code...
    
    // Clear the current list
    const upcomingPassesElement = document.getElementById('upcoming-passes');
    upcomingPassesElement.innerHTML = '';
    
    // Add passes to the list
    passes.forEach(pass => {
        const passItem = document.createElement('div');
        passItem.className = `pass-item ${getPassStatusClass(pass)}`;
        
        // Format time range
        const startTime = formatTime(pass.start);
        const endTime = formatTime(pass.end);
        
        passItem.innerHTML = `
            <div class="pass-satellite-name">${pass.satName}</div>
            <div class="pass-time">${startTime} - ${endTime}</div>
            <div class="pass-details">
                Max Elevation: ${pass.maxElevation.toFixed(1)}°
                Duration: ${Math.round((pass.end - pass.start) / (60 * 1000))} min
            </div>
        `;
        
        // Add click handler to show the satellite info
        passItem.addEventListener('click', () => {
            showSatelliteInfo(pass.satName);
        });
        
        upcomingPassesElement.appendChild(passItem);
    });
}

// Helper to determine the class for a pass based on its status
function getPassStatusClass(pass) {
    const now = new Date();
    if (now >= pass.start && now <= pass.end) {
        return 'pass-active';
    } else if (pass.start > now && pass.start < new Date(now.getTime() + 60 * 60 * 1000)) {
        return 'pass-upcoming'; // Within the next hour
    } else if (pass.maxElevation > 10) {
        return 'pass-visible'; // High elevation passes
    }
    return '';
}

// Add the following code to your existing app.js file

// Add to your existing saveOptions function
function saveOptions() {
    // ...existing code...
    
    // Save API settings
    saveApiSettings();
    
    // Save CSN SAT settings
    saveCsnSatSettingsToLocalStorage();
    
    // Update roves if enabled
    if (enableRoves && hamsAtApiKey) {
        fetchUpcomingRoves();
    } else {
        document.getElementById('upcoming-roves').innerHTML = 
            '<div class="rove-item">Roves display is disabled or API key is missing.</div>';
    }
}

// Load API settings from local storage
function loadApiSettings() {
    const savedApiKey = localStorage.getItem('hamsAtApiKey');
    if (savedApiKey) {
        hamsAtApiKey = savedApiKey;
        document.getElementById('hams-at-api-key').value = hamsAtApiKey;
    }
    
    const rovesEnabled = localStorage.getItem('enableRoves');
    if (rovesEnabled !== null) {
        enableRoves = rovesEnabled === 'true';
        document.getElementById('enable-roves').checked = enableRoves;
    }

    const showUnworkable = localStorage.getItem('showUnworkableRoves');
    if (showUnworkable !== null) {
        showUnworkableRoves = showUnworkable === 'true';
        document.getElementById('show-unworkable-roves').checked = showUnworkableRoves;
    }
}

// Save API settings to local storage
function saveApiSettings() {
    localStorage.setItem('hamsAtApiKey', hamsAtApiKey);
    localStorage.setItem('enableRoves', enableRoves.toString());
    localStorage.setItem('showUnworkableRoves', showUnworkableRoves.toString());
}

// Fetch upcoming roves from the hams.at api
// This function will be called when the API key is set or changed
// and when the roves are enabled
function fetchUpcomingRoves() {

    const rovesContainer = document.getElementById('upcoming-roves');
    rovesContainer.innerHTML = '<div class="loading">Loading roves data...</div>';
    
    console.log('Fetching roves with API key:', hamsAtApiKey.substring(0, 5) + '...');
    
    fetch(`api/get_roves.php?key=${encodeURIComponent(hamsAtApiKey)}`)
    .then(response => {
        console.log('API response status:', response.status);
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        return response.json();
    })
}

// Display upcoming roves in the UI
function displayUpcomingRoves() {
    const rovesContainer = document.getElementById('upcoming-roves');
    
    // Filter roves based on workable preference
    const filteredRoves = upcomingRoves.filter(rove => 
        showUnworkableRoves ? true : rove.is_workable
    );
    
    if (!filteredRoves.length) {
        rovesContainer.innerHTML = '<div class="rove-item">No upcoming roves found.</div>';
        return;
    }
    
    rovesContainer.innerHTML = '';
    
    // Sort roves by start time
    filteredRoves.sort((a, b) => new Date(a.aos_at) - new Date(b.aos_at));
    
    filteredRoves.forEach(rove => {
        const aosDate = new Date(rove.aos_at);
        const losDate = new Date(rove.los_at);
        
        const roveElement = document.createElement('div');
        roveElement.className = 'rove-item';
        
        // Format the rove information
        const header = document.createElement('div');
        header.className = 'rove-header';
        
        const callsign = document.createElement('span');
        callsign.className = 'rove-callsign';
        callsign.textContent = rove.callsign;
        
        const grid = document.createElement('span');
        grid.className = 'rove-grid';
        grid.textContent = rove.grids.join(', ');
        
        header.appendChild(callsign);
        header.appendChild(grid);
        
        const details = document.createElement('div');
        details.className = 'rove-details';
        
        // Create a line with time and satellite name
        const timeAndSat = document.createElement('div');
        timeAndSat.className = 'rove-time-sat';
        
        const time = document.createElement('span');
        time.className = 'rove-time';
        time.textContent = `${formatDate(aosDate)} - ${formatDate(losDate)}`;
        
        const satellite = document.createElement('span');
        satellite.className = 'rove-satellite';
        satellite.textContent = `${rove.satellite.name}`;
        
        timeAndSat.appendChild(time);
        timeAndSat.appendChild(satellite);
        
        details.appendChild(timeAndSat);
        
        // Add comment if available
        if (rove.comment) {
            const comment = document.createElement('div');
            comment.className = 'rove-comment';
            comment.textContent = rove.comment;
            details.appendChild(comment);
        }
        
        roveElement.appendChild(header);
        roveElement.appendChild(details);
        
        // Add click handler to open the rove URL
        if (rove.url) {
            roveElement.style.cursor = 'pointer';
            roveElement.addEventListener('click', () => {
                window.open(rove.url, '_blank');
            });
        }
        
        rovesContainer.appendChild(roveElement);
    });
}

// Set up auto-refresh for roves data
function setupRovesAutoRefresh() {
    // Refresh roves data every 15 minutes
    setInterval(() => {
        if (enableRoves && hamsAtApiKey) {
            fetchUpcomingRoves();
        }
    }, 15 * 60 * 1000);
}

// Add this to your initialization
setupRovesAutoRefresh();

// Update the fetchUpcomingRoves function with better error handling and debugging
function fetchUpcomingRoves() {
    // ...existing code...
    
    const rovesContainer = document.getElementById('upcoming-roves');
    rovesContainer.innerHTML = '<div class="loading">Loading roves data...</div>';
    
    console.log('Fetching roves with API key:', hamsAtApiKey.substring(0, 5) + '...');
    
    // Add a timeout to the fetch to prevent it from hanging indefinitely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    // Use our PHP proxy instead of directly calling the API
    fetch(`api/get_roves.php?key=${encodeURIComponent(hamsAtApiKey)}`, {
        signal: controller.signal
    })
    .then(response => {
        console.log('API proxy response status:', response.status);
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Roves data received:', data);
        if (!data) {
            throw new Error('No data received from API');
        }
        if (data.error) {
            throw new Error(`API error: ${data.error}`);
        }
        if (!data.data) {
            throw new Error('Invalid data format received from API');
        }
        upcomingRoves = data.data || [];
        displayUpcomingRoves();
    })
    .catch(error => {
        clearTimeout(timeoutId);
        console.error('Error fetching roves data:', error);
        
        // Different message based on error type
        let errorMessage = 'Failed to load roves: ';
        if (error.name === 'AbortError') {
            errorMessage += 'Request timed out. Check your network or the API server status.';
        } else if (error.message.includes('NetworkError')) {
            errorMessage += 'Network error. Check if the PHP proxy file exists and is accessible.';
        } else {
            errorMessage += error.message;
        }
        
        rovesContainer.innerHTML = `<div class="rove-item error">${errorMessage}</div>`;
    });
}

// Fix the issue with satellite info panel reappearing after closing

// Find the close info panel event listener and modify it
document.getElementById('close-info-panel').addEventListener('click', function() {
    const infoPanel = document.getElementById('satellite-info-panel');
    infoPanel.style.display = 'none';
    
    // Set a flag to indicate panel was manually closed
    window.satelliteInfoPanelClosed = true;
    
    // Prevent event propagation
    event.stopPropagation();
});

// Find the function that displays the satellite info and modify it
function updateSatelliteInfo(satellite) {
    // ...existing code...
    
    // Check if panel was manually closed before showing
    if (window.satelliteInfoPanelClosed) {
        return;
    }
    
    // Show the info panel
    const infoPanel = document.getElementById('satellite-info-panel');
    infoPanel.style.display = 'block';
    
    // ...existing code...
}

// Add a reset for the closed flag when a satellite is clicked
function onSatelliteMarkerClick(e) {
    // Reset the closed flag when a satellite is manually selected
    window.satelliteInfoPanelClosed = false;
    
    // ...existing code...
}

// Update satellite marker creation to ensure proper label positioning

// Look for code similar to:
function createSatelliteMarker(satellite, position) {
    const icon = L.divIcon({
        className: 'satellite-marker-icon',
        html: `<div class="satellite-marker" style="background-color: ${satellite.color || '#1e88e5'}"></div>
               <div class="satellite-label">${satellite.name}</div>`,
        iconSize: [24, 24],     // Increased size to accommodate label
        iconAnchor: [12, 12]    // Center point of the icon
    });
    
    // ...existing code...
}

// ...existing code...

function createSatelliteMarker(satellite, position) {
    const icon = L.divIcon({
        className: 'satellite-marker-icon',
        html: `
            <div class="satellite-label">${satellite.name}</div>
            <div class="satellite-marker" style="background-color: ${satellite.color || '#1e88e5'}"></div>
        `,
        iconSize: null,  // Let the content determine the size
        iconAnchor: [0, 0],  // Align to top-left corner
        className: 'satellite-marker-container'  // New container class
    });
    
    // ...existing code...
}

// ...existing code...

// Add new function to load Hams.at settings
function loadHamsAtSettingsFromLocalStorage() {
    const savedKey = localStorage.getItem('hamsAtApiKey');
    if (savedKey) {
        hamsAtApiKey = savedKey;
        document.getElementById('hams-at-api-key').value = hamsAtApiKey;
    }

    const rovesEnabled = localStorage.getItem('enableRoves');
    if (rovesEnabled !== null) {
        enableRoves = rovesEnabled === 'true';
        document.getElementById('enable-roves').checked = enableRoves;
    }

    const showUnworkable = localStorage.getItem('showUnworkableRoves');
    if (showUnworkable !== null) {
        showUnworkableRoves = showUnworkable === 'true';
        document.getElementById('show-unworkable-roves').checked = showUnworkableRoves;
    }
}

// Add new function to save Hams.at settings
function saveHamsAtSettingsToLocalStorage() {
    localStorage.setItem('hamsAtApiKey', hamsAtApiKey);
    localStorage.setItem('enableRoves', enableRoves.toString());
    localStorage.setItem('showUnworkableRoves', showUnworkableRoves.toString());
}

// Load CSN SAT settings from local storage
function loadCsnSatSettingsFromLocalStorage() {
    const enabledSetting = localStorage.getItem('enableCsnSat');
    if (enabledSetting !== null) {
        enableCsnSat = enabledSetting === 'true';
        document.getElementById('enable-csn-sat').checked = enableCsnSat;
    }

    const address = localStorage.getItem('csnSatAddress');
    if (address) {
        csnSatAddress = address;
        document.getElementById('csn-sat-address').value = csnSatAddress;
    }
}

// Save CSN SAT settings to local storage
function saveCsnSatSettingsToLocalStorage() {
    localStorage.setItem('enableCsnSat', enableCsnSat.toString());
    localStorage.setItem('csnSatAddress', csnSatAddress);
}

// Schedule functionality
let allScheduledPasses = [];
let SCHEDULE_PREDICTION_DAYS = 1;

// Add event listeners for Schedule modal
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...

    // Initialize Schedule Modal
    const scheduleModal = document.getElementById('schedule-modal');
    const openScheduleBtn = document.getElementById('open-schedule');
    const scheduleCloseBtn = document.querySelector('.schedule-close');
    const refreshScheduleBtn = document.getElementById('refresh-schedule');
    const scheduleDaysSelect = document.getElementById('schedule-days');
    const satelliteFilterSelect = document.getElementById('schedule-satellite-filter');

    // Schedule Modal open/close functionality
    openScheduleBtn.addEventListener('click', () => {
        scheduleModal.style.display = 'block';
        populateSatelliteFilter();
        generateScheduleTable();
    });

    scheduleCloseBtn.addEventListener('click', () => {
        scheduleModal.style.display = 'none';
    });

    // Close schedule modal if clicked outside
    window.addEventListener('click', (e) => {
        if (e.target === scheduleModal) {
            scheduleModal.style.display = 'none';
        }
    });

    // Event listeners for schedule controls
    satelliteFilterSelect.addEventListener('change', filterScheduleTable);
    scheduleDaysSelect.addEventListener('change', () => {
        SCHEDULE_PREDICTION_DAYS = parseInt(scheduleDaysSelect.value);
        generateScheduleTable();
    });
    refreshScheduleBtn.addEventListener('click', generateScheduleTable);
});

// Populate the satellite filter dropdown
function populateSatelliteFilter() {
    const satelliteFilterSelect = document.getElementById('schedule-satellite-filter');
    
    // Clear existing options except "All Satellites"
    while (satelliteFilterSelect.options.length > 1) {
        satelliteFilterSelect.remove(1);
    }

    // Add selected satellites to dropdown
    selectedSatellites.forEach(satName => {
        const option = document.createElement('option');
        option.value = satName;
        option.textContent = satName;
        satelliteFilterSelect.appendChild(option);
    });
}

// Generate the schedule table with all upcoming passes
function generateScheduleTable() {
    const tableBody = document.getElementById('pass-schedule-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    // Show loading message
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading pass schedule...</td></tr>';
    
    // Get the prediction period in days
    const days = parseInt(document.getElementById('schedule-days').value) || 1;
    
    // Calculate passes for all selected satellites
    const now = new Date();
    const endTime = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    allScheduledPasses = [];
    
    if (selectedSatellites.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No satellites selected</td></tr>';
        return;
    }
    
    // For each satellite, predict passes
    selectedSatellites.forEach(satName => {
        if (!window.tleData[satName]) return;
        
        try {
            const sat = window.tleData[satName];
            const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
            
            // Predict passes
            const satPasses = predictPasses(satrec, observer, now, endTime);
            
            satPasses.forEach(pass => {
                allScheduledPasses.push({
                    satellite: satName,
                    start: pass.start,
                    end: pass.end,
                    maxElevation: pass.maxElevation,
                    duration: Math.round((pass.end - pass.start) / (60 * 1000)) // Duration in minutes
                });
            });
        } catch (error) {
            console.error(`Error calculating passes for ${satName}:`, error);
        }
    });
    
    // Sort passes by start time
    allScheduledPasses.sort((a, b) => a.start - b.start);
    
    // Display passes
    if (allScheduledPasses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No passes found in the next ${days} day(s)</td></tr>`;
        return;
    }
    
    // Apply the current filter
    filterScheduleTable();
}

// Filter the schedule table based on selected satellite
function filterScheduleTable() {
    const tableBody = document.getElementById('pass-schedule-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    const satelliteFilter = document.getElementById('schedule-satellite-filter').value;
    const now = new Date();
    
    // Filter passes by selected satellite
    const filteredPasses = satelliteFilter === 'all' 
        ? allScheduledPasses 
        : allScheduledPasses.filter(pass => pass.satellite === satelliteFilter);
    
    // Sort by start time
    filteredPasses.sort((a, b) => a.start - b.start);
    
    // Display filtered passes
    filteredPasses.forEach(pass => {
        const row = document.createElement('tr');
        
        // Check pass status
        const isActive = now >= pass.start && now <= pass.end;
        const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
        const isUpcoming = !isActive && timeToPass > 0 && timeToPass <= 60; // Within next hour
        const isWithinFootprint = isSatelliteWithinFootprint(pass.satellite);
        
        // Set row class based on pass status
        if (isActive) {
            row.classList.add('pass-active');
        } else if (isUpcoming) {
            row.classList.add('pass-upcoming');
        } else if (isWithinFootprint) {
            row.classList.add('pass-visible');
        }
        
        // Format dates
        const startDateTime = formatDateTimeWithDate(pass.start);
        const endDateTime = formatDateTimeWithDate(pass.end);
        const status = getPassStatusLabel(pass, now);
        
        // Create row cells
        row.innerHTML = `
            <td>${pass.satellite}</td>
            <td>${startDateTime}</td>
            <td>${endDateTime}</td>
            <td>${Math.round(pass.maxElevation)}°</td>
            <td>${pass.duration} min</td>
            <td>${status}</td>
        `;
        
        // Add click handler to show satellite info
        row.addEventListener('click', () => {
            const satName = pass.satellite;
            const position = getSatellitePosition(satName);
            if (position) {
                showSatelliteInfo(satName);
                showPolarRadarForPass(pass);
            }
            
            // Close the schedule modal
            document.getElementById('schedule-modal').style.display = 'none';
        });
        
        tableBody.appendChild(row);
    });
    
    // If no passes match filter
    if (filteredPasses.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" style="text-align: center;">No passes found for ${satelliteFilter}</td>`;
        tableBody.appendChild(row);
    }
}

// Format date and time for display with date included
function formatDateTimeWithDate(date) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = date.getDate() === now.getDate() && 
                    date.getMonth() === now.getMonth() && 
                    date.getFullYear() === now.getFullYear();
                    
    const isTomorrow = date.getDate() === tomorrow.getDate() && 
                      date.getMonth() === tomorrow.getMonth() && 
                      date.getFullYear() === tomorrow.getFullYear();
    
    const day = isToday ? 'Today' : 
               isTomorrow ? 'Tomorrow' : 
               `${date.getDate()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().substring(2)}`;
               
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day} ${hours}:${minutes}`;
}

// Get a styled status label for a pass
function getPassStatusLabel(pass, now) {
    const isActive = now >= pass.start && now <= pass.end;
    const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
    const isUpcoming = !isActive && timeToPass > 0 && timeToPass <= 60; // Within next hour
    const isWithinFootprint = isSatelliteWithinFootprint(pass.satellite);
    
    if (isActive) {
        return '<span class="status-label status-active">Active</span>';
    } else if (isUpcoming) {
        return '<span class="status-label status-upcoming">Upcoming</span>';
    } else if (isWithinFootprint) {
        return '<span class="status-label status-visible">Visible</span>';
    } else {
        return '<span class="status-label status-normal">Scheduled</span>';
    }
}

// Polar radar chart instance
let polarRadarChart = null;

// Initialize polar radar chart
function initPolarRadarChart() {
    const canvas = document.getElementById('polar-radar-chart');
    const ctx = canvas.getContext('2d');

    // Dynamically set canvas dimensions to match parent container
    const parent = canvas.parentElement;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    function drawCompassFace() {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        let radius = Math.min(centerX, centerY) - 30;

        // Ensure radius is non-negative
        if (radius <= 0) {
            console.warn('Canvas dimensions are too small to draw the compass.');
            return;
        }

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Draw outer compass ring
        ctx.beginPath();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw cardinal and intercardinal points
        const directions = [
            { label: 'N', angle: 0, isCardinal: true },
            { label: 'NE', angle: 45, isCardinal: false },
            { label: 'E', angle: 90, isCardinal: true },
            { label: 'SE', angle: 135, isCardinal: false },
            { label: 'S', angle: 180, isCardinal: true },
            { label: 'SW', angle: 225, isCardinal: false },
            { label: 'W', angle: 270, isCardinal: true },
            { label: 'NW', angle: 315, isCardinal: false }
        ];

        directions.forEach(dir => {
            const angleRad = (dir.angle - 90) * Math.PI / 180;
            ctx.beginPath();
            ctx.strokeStyle = dir.isCardinal ? '#333' : '#666';
            ctx.lineWidth = dir.isCardinal ? 2 : 1;
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + radius * Math.cos(angleRad),
                centerY + radius * Math.sin(angleRad)
            );
            ctx.stroke();

            ctx.fillStyle = dir.isCardinal ? '#333' : '#666';
            ctx.font = `${dir.isCardinal ? 'bold' : 'normal'} ${dir.isCardinal ? 16 : 14}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelRadius = radius + 20;
            ctx.fillText(
                dir.label,
                centerX + labelRadius * Math.cos(angleRad),
                centerY + labelRadius * Math.sin(angleRad)
            );
        });
        
        // Draw degree markings every 15 degrees
        for (let deg = 0; deg < 360; deg += 15) {
            // Skip where we already have cardinal/intercardinal labels
            if (deg % 45 !== 0) {
                const angleRad = (deg - 90) * Math.PI / 180;
                const markerLength = 10;
                
                // Draw degree marker
                ctx.beginPath();
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                const markerStart = radius - markerLength;
                ctx.moveTo(
                    centerX + radius * Math.cos(angleRad),
                    centerY + radius * Math.sin(angleRad)
                );
                ctx.lineTo(
                    centerX + markerStart * Math.cos(angleRad),
                    centerY + markerStart * Math.sin(angleRad)
                );
                ctx.stroke();
                
                // Add degree label
                ctx.fillStyle = '#666';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const textRadius = radius + 14;
                ctx.fillText(
                    `${deg}°`,
                    centerX + textRadius * Math.cos(angleRad),
                    centerY + textRadius * Math.sin(angleRad)
                );
            }
        }

        // Draw elevation circles every 10 degrees from horizon to zenith
        for (let el = 10; el < 90; el += 10) {
            const circleRadius = radius * (1 - el/90);
            ctx.beginPath();
            ctx.strokeStyle = el % 30 === 0 ? '#666' : '#999';
            ctx.lineWidth = el % 30 === 0 ? 1 : 0.5;
            ctx.setLineDash([2, 2]);
            ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Add elevation labels on east side
            if (el % 30 === 0) {
                ctx.fillStyle = '#666';
                ctx.font = '12px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(
                    el + '°',
                    centerX + circleRadius + 5,
                    centerY
                );
            }
        }
    }

    function drawPassTrack(points) {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) - 30;

        if (points && points.length > 0) {
            // Draw the path
            ctx.beginPath();
            ctx.strokeStyle = '#4a76ce';
            ctx.lineWidth = 2.5;

            points.forEach((point, index) => {
                // Convert from polar to cartesian coordinates
                const r = radius * (1 - point.elevation/90);
                const angle = (point.azimuth - 90) * Math.PI / 180;
                const x = centerX + r * Math.cos(angle);
                const y = centerY + r * Math.sin(angle);

                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();

            // Draw start and end points
            const start = points[0];
            const end = points[points.length - 1];

            // Draw start point (green) with AOS label
            const startR = radius * (1 - start.elevation/90);
            const startAngle = (start.azimuth - 90) * Math.PI / 180;
            const startX = centerX + startR * Math.cos(startAngle);
            const startY = centerY + startR * Math.sin(startAngle);
            
            ctx.beginPath();
            ctx.fillStyle = '#4CAF50';
            ctx.arc(startX, startY, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Add AOS label
            ctx.fillStyle = '#4CAF50';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            // Position the label slightly offset from the point
            const aosLabelX = startX + (startX > centerX ? -10 : 10);
            const aosLabelY = startY + (startY > centerY ? -10 : 10);
            ctx.fillText('AOS', aosLabelX, aosLabelY);

            // Draw end point (red) with LOS label
            const endR = radius * (1 - end.elevation/90);
            const endAngle = (end.azimuth - 90) * Math.PI / 180;
            const endX = centerX + endR * Math.cos(endAngle);
            const endY = centerY + endR * Math.sin(endAngle);
            
            ctx.beginPath();
            ctx.fillStyle = '#f44336';
            ctx.arc(endX, endY, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Add LOS label
            ctx.fillStyle = '#f44336';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            // Position the label slightly offset from the point
            const losLabelX = endX + (endX > centerX ? -10 : 10);
            const losLabelY = endY + (endY > centerY ? -10 : 10);
            ctx.fillText('LOS', losLabelX, losLabelY);
        }
    }

    canvas.addEventListener('mousemove', function(event) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 30;

        // Calculate distance from center
        const dx = mouseX - centerX;
        const dy = mouseY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= radius) {
            // Calculate azimuth (0° at North, clockwise)
            let azimuth = Math.atan2(dx, -dy) * 180 / Math.PI;
            if (azimuth < 0) azimuth += 360;

            // Calculate elevation (90° at center, 0° at edge)
            const elevation = 90 * (1 - distance/radius);

            canvas.title = `Az: ${azimuth.toFixed(1)}°, El: ${elevation.toFixed(1)}°`;
        } else {
            canvas.title = '';
        }
    });

    return {
        draw: (points) => {
            drawCompassFace();
            if (points && points.length > 0) {
                drawPassTrack(points);
            }
        }
    };
}

// Show the polar radar chart for a pass
function showPolarRadarForPass(pass) {
    if (!polarRadarChart) {
        polarRadarChart = initPolarRadarChart();
    }

    // Ensure the panel is visible before setting dimensions
    const panel = document.getElementById('polar-radar-panel');
    panel.style.display = 'block';

    // Dynamically resize the canvas to match the parent container
    const canvas = document.getElementById('polar-radar-chart');
    const parent = canvas.parentElement;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    // Check if dimensions are valid
    if (canvas.width <= 0 || canvas.height <= 0) {
        console.error('Canvas dimensions are invalid. Ensure the parent container has proper dimensions.');
        return;
    }

    // Get pass points
    const points = calculatePassPoints(pass);

    // Draw the chart
    polarRadarChart.draw(points);

    // Set chart title
    document.getElementById('polar-radar-title').textContent = `${pass.satellite} Pass Track`;
}

// Calculate points along the pass for visualization
function calculatePassPoints(pass) {
    const points = [];
    const numPoints = 50; // Number of points to calculate
    
    try {
        const satrec = satellite.twoline2satrec(
            window.tleData[pass.satellite].tle1,
            window.tleData[pass.satellite].tle2
        );
        
        // Convert observer coordinates to radians
        const observerGd = {
            latitude: observer.latitude * Math.PI / 180,
            longitude: observer.longitude * Math.PI / 180,
            height: observer.elevation / 1000 // km
        };
        
        // Calculate points along the pass
        for (let i = 0; i < numPoints; i++) {
            const time = new Date(pass.start.getTime() + (i / (numPoints - 1)) * (pass.end - pass.start));
            
            const positionAndVelocity = satellite.propagate(satrec, time);
            if (!positionAndVelocity.position) continue;
            
            const gmst = satellite.gstime(time);
            const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
            const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
            
            if (lookAngles.elevation >= 0) { // Only include points above horizon
                points.push({
                    azimuth: (lookAngles.azimuth * 180 / Math.PI + 360) % 360,
                    elevation: lookAngles.elevation * 180 / Math.PI
                });
            }
        }
    } catch (error) {
        console.error('Error calculating pass points:', error);
    }
    
    return points;
}

// Update the pass item click handler to show the polar radar
document.addEventListener('DOMContentLoaded', () => {
    // ... existing event listeners ...

    // Add close button handler for polar radar
    document.getElementById('close-polar-radar').addEventListener('click', () => {
        document.getElementById('polar-radar-panel').style.display = 'none';
    });
});

// Update the pass item creation to show both info and polar radar
function updateUpcomingPasses() {
    
    passes.forEach(pass => {
        const passItem = document.createElement('div');
        
        // Update click handler to show both info and polar radar
        passItem.addEventListener('click', () => {
            showSatelliteInfo(pass.satellite);
            showPolarRadarForPass(pass);
        });
        
        upcomingPassesElement.appendChild(passItem);
    });
}

// Filter the schedule table based on selected satellite
// This function is used to filter the schedule table based on the selected satellite
function filterScheduleTable() {
    const tableBody = document.getElementById('pass-schedule-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    const satelliteFilter = document.getElementById('schedule-satellite-filter').value;
    const now = new Date();
    
    // Filter passes by selected satellite
    const filteredPasses = satelliteFilter === 'all' 
        ? allScheduledPasses 
        : allScheduledPasses.filter(pass => pass.satellite === satelliteFilter);
    
    // Sort by start time
    filteredPasses.sort((a, b) => a.start - b.start);
    
    // Display filtered passes
    filteredPasses.forEach(pass => {
        const row = document.createElement('tr');
        
        // Check pass status
        const isActive = now >= pass.start && now <= pass.end;
        const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
        const isUpcoming = !isActive && timeToPass > 0 && timeToPass <= 60; // Within next hour
        const isWithinFootprint = isSatelliteWithinFootprint(pass.satellite);
        
        // Set row class based on pass status
        if (isActive) {
            row.classList.add('pass-active');
        } else if (isUpcoming) {
            row.classList.add('pass-upcoming');
        } else if (isWithinFootprint) {
            row.classList.add('pass-visible');
        }
        
        // Format dates
        const startDateTime = formatDateTimeWithDate(pass.start);
        const endDateTime = formatDateTimeWithDate(pass.end);
        const status = getPassStatusLabel(pass, now);
        
        // Create row cells
        row.innerHTML = `
            <td>${pass.satellite}</td>
            <td>${startDateTime}</td>
            <td>${endDateTime}</td>
            <td>${Math.round(pass.maxElevation)}°</td>
            <td>${pass.duration} min</td>
            <td>${status}</td>
        `;
        
        // Add click handler to show satellite info
        row.addEventListener('click', () => {
            const satName = pass.satellite;
            const position = getSatellitePosition(satName);
            if (position) {
                showSatelliteInfo(satName);
            }
            
            // Close the schedule modal
            document.getElementById('schedule-modal').style.display = 'none';
        });
        
        tableBody.appendChild(row);
    });
    
    // If no passes match filter
    if (filteredPasses.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" style="text-align: center;">No passes found for ${satelliteFilter}</td>`;
        tableBody.appendChild(row);
    }
}

// Format date and time for display with date included
// This function is used to format the date and time for the schedule table
function formatDateTimeWithDate(date) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = date.getDate() === now.getDate() && 
                    date.getMonth() === now.getMonth() && 
                    date.getFullYear() === now.getFullYear();
                    
    const isTomorrow = date.getDate() === tomorrow.getDate() && 
                      date.getMonth() === tomorrow.getMonth() && 
                      date.getFullYear() === tomorrow.getFullYear();
    
    const day = isToday ? 'Today' : 
               isTomorrow ? 'Tomorrow' : 
               `${date.getDate()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().substring(2)}`;
               
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day} ${hours}:${minutes}`;
}

// Get a styled status label for a pass
// This function is used to determine the status of a pass and return a styled label
function getPassStatusLabel(pass, now) {
    const isActive = now >= pass.start && now <= pass.end;
    const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
    const isUpcoming = !isActive && timeToPass > 0 && timeToPass <= 60; // Within next hour
    const isWithinFootprint = isSatelliteWithinFootprint(pass.satellite);
    
    if (isActive) {
        return '<span class="status-label status-active">Active</span>';
    } else if (isUpcoming) {
        return '<span class="status-label status-upcoming">Upcoming</span>';
    } else if (isWithinFootprint) {
        return '<span class="status-label status-visible">Visible</span>';
    } else {
        return '<span class="status-label status-normal">Scheduled</span>';
    }
}

// Add event listeners for Sked Planning modal
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Sked Planning Modal
    const skedPlanningModal = document.getElementById('sked-planning-modal');
    const openSkedPlanningBtn = document.getElementById('open-sked-planning');
    const skedPlanningCloseBtn = document.querySelector('.sked-planning-close');
    const refreshSkedPlanningBtn = document.getElementById('refresh-sked-planning');
    const skedDaysSelect = document.getElementById('sked-days');
    const skedSatelliteFilterSelect = document.getElementById('sked-satellite-filter');
    const skedMinElevationSelect = document.getElementById('sked-min-elevation');
    const skedObserver2Grid = document.getElementById('sked-observer2-grid');
    const skedObserver2Coords = document.getElementById('sked-observer2-coords');

    // Sked Planning Modal open/close functionality
    openSkedPlanningBtn.addEventListener('click', () => {
        skedPlanningModal.style.display = 'block';
        populateSkedSatelliteFilter();
        skedObserver2Grid.value = observer2.gridSquare || '';
        updateGridSquareCoords();
    });

    skedPlanningCloseBtn.addEventListener('click', () => {
        skedPlanningModal.style.display = 'none';
    });

    // Close sked planning modal if clicked outside
    window.addEventListener('click', (e) => {
        if (e.target === skedPlanningModal) {
            skedPlanningModal.style.display = 'none';
        }
    });

    // Grid square input handler
    skedObserver2Grid.addEventListener('input', () => {
        const gridSquare = skedObserver2Grid.value.trim();
        observer2.gridSquare = gridSquare;
        updateGridSquareCoords();
    });

    // Event listeners for sked planning controls
    skedSatelliteFilterSelect.addEventListener('change', filterSkedPlanningTable);
    skedDaysSelect.addEventListener('change', () => {
        SKED_PREDICTION_DAYS = parseInt(skedDaysSelect.value);
    });
    skedMinElevationSelect.addEventListener('change', () => {
        SKED_MIN_ELEVATION = parseInt(skedMinElevationSelect.value);
    });
    refreshSkedPlanningBtn.addEventListener('click', generateSkedPlanningTable);
});

// Populate the sked planning satellite filter dropdown
function populateSkedSatelliteFilter() {
    const satelliteFilterSelect = document.getElementById('sked-satellite-filter');
    
    // Clear existing options except "All Satellites"
    while (satelliteFilterSelect.options.length > 1) {
        satelliteFilterSelect.remove(1);
    }

    // Add selected satellites to dropdown
    selectedSatellites.forEach(satName => {
        const option = document.createElement('option');
        option.value = satName;
        option.textContent = satName;
        satelliteFilterSelect.appendChild(option);
    });
}

// Convert Maidenhead grid square to lat/lon
function gridSquareToLatLon(gridSquare) {
    if (!gridSquare || gridSquare.length < 4) {
        return { latitude: 0, longitude: 0 };
    }
    
    gridSquare = gridSquare.toUpperCase();
    
    // Basic validation - grid squares must be an even length of 2-8 characters
    if (gridSquare.length % 2 !== 0 || gridSquare.length > 8) {
        console.error('Invalid grid square format');
        return { latitude: 0, longitude: 0 };
    }
    
    try {
        // First pair (letters): 20° increments
        let longitude = (gridSquare.charCodeAt(0) - 65) * 20 - 180;
        let latitude = (gridSquare.charCodeAt(1) - 65) * 10 - 90;
        
        // Second pair (numbers): 2° and 1° increments
        if (gridSquare.length >= 4) {
            longitude += parseInt(gridSquare.charAt(2)) * 2;
            latitude += parseInt(gridSquare.charAt(3));
        }
        
        // Third pair (letters): 5 minute increments (0.0833°)
        if (gridSquare.length >= 6) {
            longitude += (gridSquare.charCodeAt(4) - 97) * 5 / 60;
            latitude += (gridSquare.charCodeAt(5) - 97) * 2.5 / 60;
        }
        
        // Fourth pair (numbers): 30 second and 15 second increments (0.0083°, 0.0042°)
        if (gridSquare.length === 8) {
            longitude += parseInt(gridSquare.charAt(6)) * (0.5 / 60);
            latitude += parseInt(gridSquare.charAt(7)) * (0.25 / 60);
        }
        
        // Center of the grid square
        if (gridSquare.length === 2) {
            longitude += 10;  // 20/2
            latitude += 5;    // 10/2
        } else if (gridSquare.length === 4) {
            longitude += 1;   // 2/2
            latitude += 0.5;  // 1/2
        } else if (gridSquare.length === 6) {
            longitude += 5/60/2;
            latitude += 2.5/60/2;
        } else if (gridSquare.length === 8) {
            longitude += 0.5/60/2;
            latitude += 0.25/60/2;
        }
        
        // Round to 5 decimal places (about 1 meter precision)
        longitude = Math.round(longitude * 100000) / 100000;
        latitude = Math.round(latitude * 100000) / 100000;
        
        return { latitude, longitude };
    } catch (error) {
        console.error('Error converting grid square:', error);
        return { latitude: 0, longitude: 0 };
    }
}

// Update observer2 coordinates based on grid square input
function updateGridSquareCoords() {
    const gridSquare = observer2.gridSquare;
    const coordsDisplay = document.getElementById('sked-observer2-coords');
    
    if (!gridSquare || gridSquare.length < 4) {
        coordsDisplay.textContent = 'Enter a valid grid square (e.g. IO91wm)';
        return;
    }
    
    const coords = gridSquareToLatLon(gridSquare);
    observer2.latitude = coords.latitude;
    observer2.longitude = coords.longitude;
    observer2.elevation = 0; // Default elevation
    
    coordsDisplay.textContent = `Lat: ${coords.latitude.toFixed(5)}°, Long: ${coords.longitude.toFixed(5)}°`;
}

// Generate the sked planning table with all mutual passes
function generateSkedPlanningTable() {
    const tableBody = document.getElementById('sked-planning-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    // Show loading message
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Finding mutual passes...</td></tr>';
    
    // Check if grid square is valid
    if (!observer2.gridSquare || observer2.gridSquare.length < 4) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Please enter a valid grid square</td></tr>';
        return;
    }
    
    // Get the prediction period in days
    const days = parseInt(document.getElementById('sked-days').value) || 1;
    const minElevation = parseInt(document.getElementById('sked-min-elevation').value) || 5;
    
    // Calculate passes for all selected satellites
    const now = new Date();
    const endTime = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    allSkedPasses = [];
    
    if (selectedSatellites.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No satellites selected</td></tr>';
        return;
    }
    
    // Convert observer2 coordinates
    updateGridSquareCoords();
    
    // Create observer2 object for satellite.js
    const observer2ForSat = {
        latitude: observer2.latitude * Math.PI / 180,
        longitude: observer2.longitude * Math.PI / 180,
        height: observer2.elevation / 1000 // km
    };
    
    // Create observer1 (primary user) object for satellite.js
    const observer1ForSat = {
        latitude: observer.latitude * Math.PI / 180,
        longitude: observer.longitude * Math.PI / 180,
        height: observer.elevation / 1000 // km
    };
    
    // For each satellite, predict passes
    selectedSatellites.forEach(satName => {
        if (!window.tleData[satName]) return;
        
        try {
            const sat = window.tleData[satName];
            const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
            
            // Predict passes for observer 1
            const passes1 = predictPassesWithMinElevation(satrec, observer1ForSat, now, endTime, minElevation);
            
            // Predict passes for observer 2
            const passes2 = predictPassesWithMinElevation(satrec, observer2ForSat, now, endTime, minElevation);
            
            // Find mutual visibility periods
            const mutualPasses = findMutualPasses(passes1, passes2, satName);
            
            // Add to all sked passes
            allSkedPasses = allSkedPasses.concat(mutualPasses);
        } catch (error) {
            console.error(`Error calculating mutual passes for ${satName}:`, error);
        }
    });
    
    // Sort passes by start time
    allSkedPasses.sort((a, b) => a.start - b.start);
    
    // Display passes
    if (allSkedPasses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No mutual passes found in the next ${days} day(s)</td></tr>`;
        return;
    }
    
    // Apply the current filter
    filterSkedPlanningTable();
}

// Find overlapping time periods for mutual visibility
function findMutualPasses(passes1, passes2, satName) {
    const mutualPasses = [];
    
    passes1.forEach(pass1 => {
        passes2.forEach(pass2 => {
            // Check for overlap
            const overlapStart = new Date(Math.max(pass1.start.getTime(), pass2.start.getTime()));
            const overlapEnd = new Date(Math.min(pass1.end.getTime(), pass2.end.getTime()));
            
            // If there's an overlap
            if (overlapStart < overlapEnd) {
                mutualPasses.push({
                    satellite: satName,
                    start: overlapStart,
                    end: overlapEnd,
                    maxElevation1: pass1.maxElevation,
                    maxElevation2: pass2.maxElevation,
                    duration: Math.round((overlapEnd - overlapStart) / (60 * 1000)) // Duration in minutes
                });
            }
        });
    });
    
    return mutualPasses;
}

// Predict satellite passes with minimum elevation filter
function predictPassesWithMinElevation(satrec, observerGd, startTime, endTime, minElevation) {
    const passes = [];
    const stepMinutes = 1; // Step size in minutes
    let currentPass = null;
    
    // Scan time period in steps
    for (let time = new Date(startTime); time <= endTime; time = new Date(time.getTime() + stepMinutes * 60 * 1000)) {
        try {
            // Get satellite position at this time
            const positionAndVelocity = satellite.propagate(satrec, time);
            
            if (!positionAndVelocity.position) {
                continue;
            }
            
            // Get look angles from observer to satellite
            const gmst = satellite.gstime(time);
            const lookAngles = satellite.ecfToLookAngles(observerGd, satellite.eciToEcf(positionAndVelocity.position, gmst));
            
            // Convert elevation to degrees
            const elevationDeg = lookAngles.elevation * 180 / Math.PI;
            
            // Check if satellite is visible above minimum elevation
            if (elevationDeg >= minElevation) {
                if (!currentPass) {
                    // Start of a new pass
                    currentPass = {
                        start: new Date(time),
                        maxElevation: elevationDeg
                    };
                } else if (elevationDeg > currentPass.maxElevation) {
                    // Update max elevation if higher
                    currentPass.maxElevation = elevationDeg;
                }
            } else if (currentPass) {
                // End of a pass
                currentPass.end = new Date(time);
                passes.push(currentPass);
                currentPass = null;
            }
        } catch (error) {
            console.error('Error in pass prediction:', error);
        }
    }
    
    // Handle a pass that might be ongoing at the end of the prediction period
    if (currentPass) {
        currentPass.end = new Date(endTime);
        passes.push(currentPass);
    }
    
    return passes;
}

// Filter the sked planning table based on selected satellite
function filterSkedPlanningTable() {
    const tableBody = document.getElementById('sked-planning-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    const satelliteFilter = document.getElementById('sked-satellite-filter').value;
    const now = new Date();
    
    // Filter passes by selected satellite
    const filteredPasses = satelliteFilter === 'all' 
        ? allSkedPasses 
        : allSkedPasses.filter(pass => pass.satellite === satelliteFilter);
    
    // Sort by start time
    filteredPasses.sort((a, b) => a.start - b.start);
    
    // Display filtered passes
    filteredPasses.forEach(pass => {
        const row = document.createElement('tr');
        
        // Check pass status
        const isActive = now >= pass.start && now <= pass.end;
        const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
        const isUpcoming = !isActive && timeToPass > 0 && timeToPass <= 60; // Within next hour
        
        // Set row class based on pass status
        if (isActive) {
            row.classList.add('pass-active');
        } else if (isUpcoming) {
            row.classList.add('pass-upcoming');
        }
        
        // Format dates
        const startDateTime = formatDateTimeWithDate(pass.start);
        const endDateTime = formatDateTimeWithDate(pass.end);
        
        // Create Google Calendar link
        const calendarLink = createGoogleCalendarLink(pass);
        
        // Create row cells
        row.innerHTML = `
            <td>${pass.satellite}</td>
            <td>${startDateTime}</td>
            <td>${endDateTime}</td>
            <td>${Math.round(pass.maxElevation1)}°</td>
            <td>${Math.round(pass.maxElevation2)}°</td>
            <td>${pass.duration} min</td>
            <td>
                <a href="${calendarLink}" target="_blank" class="calendar-link" title="Add to Google Calendar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                </a>
            </td>
        `;
        
        // Add click handler to show satellite info
        row.addEventListener('click', (e) => {
            // Don't trigger if clicking the calendar link
            if (e.target.closest('.calendar-link')) {
                e.stopPropagation();
                return;
            }

            const satName = pass.satellite;
            const position = getSatellitePosition(satName);
            if (position) {
                showSatelliteInfo(satName);
            }
            
            // Close the schedule modal
            document.getElementById('sked-planning-modal').style.display = 'none';
        });
        
        tableBody.appendChild(row);
    });
    
    // If no passes match filter
    if (filteredPasses.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="7" style="text-align: center;">No mutual passes found for ${satelliteFilter}</td>`;
        tableBody.appendChild(row);
    }
}

function createGoogleCalendarLink(pass) {
    // Format dates in the required format: YYYYMMDDTHHmmssZ
    const formatDateForCalendar = (date) => {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };

    const startTime = formatDateForCalendar(pass.start);
    const endTime = formatDateForCalendar(pass.end);
    
    // Create event title and description
    const title = `Satellite Pass: ${pass.satellite}`;
    const description = `Mutual visibility pass with remote station\n` +
        `Your maximum elevation: ${Math.round(pass.maxElevation1)}°\n` +
        `Their maximum elevation: ${Math.round(pass.maxElevation2)}°\n` +
        `Duration: ${pass.duration} minutes`;
    
    // Build calendar URL
    const calendarURL = new URL('https://calendar.google.com/calendar/render');
    calendarURL.searchParams.append('action', 'TEMPLATE');
    calendarURL.searchParams.append('text', title);
    calendarURL.searchParams.append('details', description);
    calendarURL.searchParams.append('dates', `${startTime}/${endTime}`);
    
    return calendarURL.toString();
}

// Initialize notification permissions and check interval
function initNotifications() {
    // Check if the browser supports notifications
    if (!("Notification" in window)) {
        console.log("This browser does not support desktop notifications");
        notificationsEnabled = false;
        return;
    }

    // Check if permission is already granted
    if (Notification.permission === "granted") {
        notificationsEnabled = true;
        startNotificationCheck();
    } else if (Notification.permission !== "denied") {
        // Request permission
        Notification.requestPermission().then(permission => {
            notificationsEnabled = (permission === "granted");
            if (notificationsEnabled) {
                startNotificationCheck();
            }
        });
    }
}

// Start checking for passes that need notifications
function startNotificationCheck() {
    // Clear any existing interval
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
    }
    
    // Check immediately
    checkUpcomingPassesForNotifications();
    
    // Then check every minute
    notificationCheckInterval = setInterval(checkUpcomingPassesForNotifications, 60000);
}

// Check for passes that need notifications
function checkUpcomingPassesForNotifications() {
    if (!notificationsEnabled) return;
    
    const now = new Date();
    
    // Go through all upcoming passes
    const upcomingPassesElement = document.getElementById('upcoming-passes');
    const passItems = upcomingPassesElement.querySelectorAll('.pass-item');
    
    passItems.forEach(passItem => {
        // Extract satellite info from the pass item
        const satelliteName = passItem.querySelector('.pass-satellite-name').textContent;
        const timeText = passItem.querySelector('.pass-time').textContent;
        const detailsText = passItem.querySelector('.pass-details').textContent;
        
        // Extract times (assuming format like "12:30 to 12:45")
        const timeMatch = timeText.match(/(\d+:\d+)/g);
        if (!timeMatch || timeMatch.length < 2) return;
        
        const startTimeStr = timeMatch[0];
        const endTimeStr = timeMatch[1];
        
        // Create a Date object for the start time
        const [hours, minutes] = startTimeStr.split(':').map(Number);
        const startTime = new Date(now);
        startTime.setHours(hours, minutes, 0, 0);
        
        // If the time has already passed today, it might be for tomorrow
        if (startTime < now && now.getHours() > hours) {
            startTime.setDate(startTime.getDate() + 1);
        }
        
        // Calculate minutes until the pass
        const minutesUntilPass = (startTime - now) / (60 * 1000);
        
        // Check if we're within the notification threshold
        if (minutesUntilPass > 0 && minutesUntilPass <= NOTIFICATION_THRESHOLD_MINUTES) {
            // Create a unique ID for this pass that includes the date to avoid duplicates
            // across multiple days at the same time
            const dateStr = startTime.toDateString();
            const passId = `${satelliteName}-${dateStr}-${startTimeStr}-${endTimeStr}`;
            
            // Check if we've already notified for this pass
            if (!notifiedPasses.has(passId)) {
                console.log(`Showing notification for pass: ${passId}`);
                
                // Create notification
                showPassNotification(satelliteName, startTimeStr, endTimeStr, detailsText, passId, startTime);
                
                // Mark this pass as notified
                notifiedPasses.set(passId, {
                    satellite: satelliteName,
                    startTime: startTime,
                    notification: null  // Will be set in showPassNotification
                });
            } else {
                console.log(`Already notified for pass: ${passId}`);
            }
        }
    });
    
    // Clean up old notified passes
    cleanupOldNotifications();
}

// Show a notification for an upcoming pass
function showPassNotification(satellite, startTime, endTime, details, passId, actualStartTime) {
    if (!notificationsEnabled) return;
    
    // Extract max elevation from details text
    let maxElevation = "unknown";
    const elevationMatch = details.match(/Max Elevation: (\d+)°/);
    if (elevationMatch && elevationMatch[1]) {
        maxElevation = elevationMatch[1] + "°";
    }
    
    // Extract duration from details text
    let duration = "unknown";
    const durationMatch = details.match(/Duration: (\d+) min/);
    if (durationMatch && durationMatch[1]) {
        duration = durationMatch[1] + " min";
    }
    
    // Create the notification
    const options = {
        body: `Pass from ${startTime} to ${endTime}\nDuration: ${duration}, Max Elevation: ${maxElevation}`,
        icon: '/favicon.ico',
        tag: passId,
        requireInteraction: true  // Keep notification visible until user dismisses it
    };
    
    const notification = new Notification(`Upcoming Pass: ${satellite}`, options);
    
    // Store the notification so we can close it later
    if (notifiedPasses.has(passId)) {
        notifiedPasses.get(passId).notification = notification;
    }
    
    // Add click handler to focus the app
    notification.onclick = function() {
        window.focus();
        
        // Highlight the satellite
        highlightSatellite(satellite);
        
        // Close notification
        this.close();
    };
    
    // Schedule automatic closing of notification after the pass ends
    // Add 5 minutes to account for potential delays
    const now = new Date();
    const endTimeDate = new Date(actualStartTime);
    
    // Parse duration and add to end time
    if (durationMatch && durationMatch[1]) {
        endTimeDate.setMinutes(endTimeDate.getMinutes() + parseInt(durationMatch[1]) + 5);
        
        // Schedule notification cleanup
        setTimeout(() => {
            if (notification) {
                notification.close();
            }
            
            // Remove from notified passes
            if (notifiedPasses.has(passId)) {
                notifiedPasses.delete(passId);
            }
        }, endTimeDate - now);
    }
}

// Clean up old notification entries
function cleanupOldNotifications() {
    const now = new Date();
    
    // Go through all notifications and remove the old ones
    for (const [passId, passInfo] of notifiedPasses.entries()) {
        const startTime = passInfo.startTime;
        
        // If the pass started more than 3 hours ago, remove it from the list
        if ((now - startTime) > 3 * 60 * 60 * 1000) {
            // Close notification if it exists
            if (passInfo.notification) {
                passInfo.notification.close();
            }
            
            // Remove from the map
            notifiedPasses.delete(passId);
        }
    }
}

// Add notification functionality to the document ready function
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    
    // Add notification toggle to settings
    const optionsForm = document.querySelector('#options-form');
    if (optionsForm) {
        const notificationsDiv = document.createElement('div');
        notificationsDiv.className = 'options-section';
        notificationsDiv.innerHTML = `
            <h3>Notifications</h3>
            <div class="form-group">
                <label for="enable-notifications">Enable pass notifications:</label>
                <input type="checkbox" id="enable-notifications">
                <span class="help-text">Get notified ${NOTIFICATION_THRESHOLD_MINUTES} minutes before a pass</span>
            </div>
        `;
        
        optionsForm.appendChild(notificationsDiv);
        
        // Add event listener for the notification toggle
        document.getElementById('enable-notifications').addEventListener('change', function() {
            if (this.checked) {
                initNotifications();
            } else {
                notificationsEnabled = false;
                if (notificationCheckInterval) {
                    clearInterval(notificationCheckInterval);
                    notificationCheckInterval = null;
                }
            }
            
            // Save setting
            localStorage.setItem('notificationsEnabled', notificationsEnabled.toString());
        });
        
        // Load setting from local storage
        const savedNotificationsEnabled = localStorage.getItem('notificationsEnabled');
        if (savedNotificationsEnabled === 'true') {
            document.getElementById('enable-notifications').checked = true;
            initNotifications();
        }
    }
});

// Add an event listener for the test notification button
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    
    // Test notification button
    const testNotificationBtn = document.getElementById('test-notification');
    if (testNotificationBtn) {
        testNotificationBtn.addEventListener('click', showTestNotification);
    }
    
    // ...existing code...
});

// Function to show a test notification
function showTestNotification() {
    // First check if notifications are enabled/available
    if (!("Notification" in window)) {
        alert("This browser does not support desktop notifications");
        return;
    }
    
    // Check if permission is already granted
    if (Notification.permission === "granted") {
        // Show a test notification
        createTestNotification();
    } else if (Notification.permission !== "denied") {
        // Request permission
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                createTestNotification();
            } else {
                alert("Notification permission denied. Please enable notifications in your browser settings.");
            }
        });
    } else {
        // Permission was previously denied
        alert("Notification permission was denied. Please enable notifications in your browser settings.");
    }
}

// Create and show a test notification
function createTestNotification() {
    // Get the current time plus 15 minutes for the demo
    const now = new Date();
    const passTime = new Date(now.getTime() + 15 * 60000);
    const hours = passTime.getHours().toString().padStart(2, '0');
    const minutes = passTime.getMinutes().toString().padStart(2, '0');
    const startTimeStr = `${hours}:${minutes}`;
    
    // End time 10 minutes later
    const endTime = new Date(passTime.getTime() + 10 * 60000);
    const endHours = endTime.getHours().toString().padStart(2, '0');
    const endMinutes = endTime.getMinutes().toString().padStart(2, '0');
    const endTimeStr = `${endHours}:${endMinutes}`;
    
    // Notification options
    const options = {
        body: `Pass from ${startTimeStr} to ${endTimeStr}\nDuration: 10 min, Max Elevation: 45°`,
        icon: '/favicon.ico',
        requireInteraction: true  // Keep notification visible until user dismisses it
    };
    
    // Create the notification
    const notification = new Notification('Test: Upcoming Pass: ISS', options);
    
    // Add click handler to focus the app
    notification.onclick = function() {
        window.focus();
        this.close();
        
        // Show a confirmation that the notification works
        alert('Success! Notifications are working correctly.');
    };
    
    // Auto-close after 10 seconds to avoid user confusion
    setTimeout(() => {
        notification.close();
    }, 10000);
}

// Check if the CSN Technologies S.A.T API is available
function checkSATAPIAvailability() {
    if (!enableCsnSat || !csnSatAddress) {
        satAPIAvailable = false;
        return;
    }

    console.log('Checking CSN S.A.T API availability through proxy for:', csnSatAddress);
    
    // Use our PHP proxy instead of direct API call
    const proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=status`;
    
    fetch(proxyUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('S.A.T API proxy response:', data);
        
        if (data.success) {
            satAPIAvailable = true;
            console.log('S.A.T API available through proxy');
            
            // Show the S.A.T panel with success message
            showSATPanel("S.A.T API is available and ready", "success");
            
            // Start fetching tracking data immediately
            startSatTrackPolling();
            return true;
        } else {
            console.error('S.A.T API error:', data.error);
            satAPIAvailable = false;
            showSATPanel(`S.A.T API error: ${data.error}`, "error");
            return false;
        }
    })
    .catch(error => {
        console.error('Error checking S.A.T API through proxy:', error);
        satAPIAvailable = false;
        showSATPanel(`Error connecting to S.A.T API: ${error.message}`, "error");
        return false;
    });
}

// Send satellite selection to the S.A.T API
function selectSatelliteForSAT(satName) {
    if (!enableCsnSat || !csnSatAddress || !satAPIAvailable) {
        return false;
    }

    console.log('Selecting satellite for S.A.T through proxy:', satName);
    
    // Use our PHP proxy for satellite selection
    const proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=select&satellite=${encodeURIComponent(satName)}`;
    
    // Show that we're sending the selection to the API
    showSATPanel(`Selecting satellite: ${satName}...`);
    
    return fetch(proxyUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('S.A.T selection response:', data);
        
        if (data.success) {
            currentSelectedSatelliteForSAT = satName;
            
            // Update the S.A.T panel with the successful selection
            showSATPanel(`Satellite selected: ${satName}`, 'success');
            updateSATSelectedSatellite(satName);
            return true;
        } else {
            console.error('S.A.T API selection error:', data.error);
            showSATPanel(`Failed to select satellite: ${satName}. Error: ${data.error}`, 'error');
            return false;
        }
    })
    .catch(error => {
        console.error('Error selecting satellite for S.A.T:', error);
        showSATPanel(`Error selecting satellite: ${error.message}`, 'error');
        return false;
    });
}

// Show/hide the S.A.T panel
function showSATPanel(message, status = 'pending') {
    const satPanel = document.getElementById('sat-panel');
    const satPanelContent = document.getElementById('sat-panel-content');
    
    // Create or update status message
    let statusElement = satPanelContent.querySelector('#sat-status-message');
    if (!statusElement) {
        statusElement = document.getElementById('sat-status-message');
    }
    
    if (statusElement) {
        statusElement.className = `sat-status ${status}`;
        statusElement.textContent = message;
    }
    
    // Show the panel
    satPanel.style.display = 'flex';
    
    // Start tracking data polling when panel is shown
    startSatTrackPolling();
}

// Update the selected satellite in the S.A.T panel
function updateSATSelectedSatellite(satName) {
    const satPanelContent = document.getElementById('sat-panel-content');
    
    // Create or update selected satellite display
    let selectedElement = satPanelContent.querySelector('.sat-selected');
    if (!selectedElement) {
        selectedElement = document.createElement('div');
        selectedElement.className = 'sat-selected';
        satPanelContent.appendChild(selectedElement);
    }
    
    selectedElement.innerHTML = `
        <div>
            <strong>Selected Satellite:</strong> ${satName}
        </div>
    `;
}

// Close the S.A.T panel
function closeSATPanel() {
    const satPanel = document.getElementById('sat-panel');
    satPanel.style.display = 'none';
    
    // Stop tracking data polling when panel is hidden
    stopSatTrackPolling();
}

// Add event listener for S.A.T panel close button
document.addEventListener('DOMContentLoaded', () => {
    // Existing event listeners...
    
    // S.A.T panel close button
    document.getElementById('close-sat-panel').addEventListener('click', closeSATPanel);
    
    // Add event listener for enable/disable S.A.T checkbox
    document.getElementById('enable-csn-sat').addEventListener('change', function() {
        enableCsnSat = this.checked;
        saveCsnSatSettingsToLocalStorage();
        
        // Check API availability when enabled
        if (enableCsnSat && csnSatAddress) {
            checkSATAPIAvailability();
        }
    });
    
    // Add event listener for S.A.T address input
    document.getElementById('csn-sat-address').addEventListener('input', function() {
        csnSatAddress = this.value.trim();
        saveCsnSatSettingsToLocalStorage();
    });
});

// Add these functions for the S.A.T panel buttons
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    
    // Initialize S.A.T control buttons
    initSatControlButtons();
});

// Initialize S.A.T control buttons with event listeners
function initSatControlButtons() {
    // Radio toggle button
    const radioToggleBtn = document.getElementById('sat-radio-toggle');
    if (radioToggleBtn) {
        // Default state is enabled (green)
        let radioEnabled = true;
        
        radioToggleBtn.addEventListener('click', () => {
            // Toggle the state
            radioEnabled = !radioEnabled;
            
            // Update button appearance
            if (radioEnabled) {
                radioToggleBtn.textContent = 'Radio Enabled';
                radioToggleBtn.classList.remove('sat-disabled');
                radioToggleBtn.classList.add('sat-enabled');
            } else {
                radioToggleBtn.textContent = 'Radio Disabled';
                radioToggleBtn.classList.remove('sat-enabled');
                radioToggleBtn.classList.add('sat-disabled');
            }
            
            // Send command to S.A.T
            sendSatCommand('r');
        });
    }
    
    // Lock VFO button
    const lockVfoBtn = document.getElementById('sat-lock-vfo');
    if (lockVfoBtn) {
        // Default state is enabled (green)
        let vfoLocked = true;
        
        lockVfoBtn.addEventListener('click', () => {
            // Toggle the state
            vfoLocked = !vfoLocked;
            
            // Update button appearance
            if (vfoLocked) {
                lockVfoBtn.textContent = 'Lock VFO';
                lockVfoBtn.classList.remove('sat-disabled');
                lockVfoBtn.classList.add('sat-enabled');
            } else {
                lockVfoBtn.textContent = 'Unlock VFO';
                lockVfoBtn.classList.remove('sat-enabled');
                lockVfoBtn.classList.add('sat-disabled');
            }
            
            // Send command to S.A.T
            sendSatCommand('v');
        });
    }
    
    // Center transponder button
    const centerBtn = document.getElementById('sat-center');
    if (centerBtn) {
        centerBtn.addEventListener('click', () => {
            // Send center command to S.A.T
            sendSatCommand('d');
            
            // Visual feedback that the button was pressed
            centerBtn.classList.add('button-pressed');
            setTimeout(() => {
                centerBtn.classList.remove('button-pressed');
            }, 200);
        });
    }
    
    // Park antennas button
    const parkBtn = document.getElementById('sat-park');
    if (parkBtn) {
        parkBtn.addEventListener('click', () => {
            // Show confirmation dialog
            if (confirm('This will park the antennas and stop tracking the current satellite. Continue?')) {
                // Send park command to S.A.T
                sendSatCommand('z');
                
                // Visual feedback that the button was pressed
                parkBtn.classList.add('button-pressed');
                setTimeout(() => {
                    parkBtn.classList.remove('button-pressed');
                }, 200);
                
                // Clear the selected satellite display
                updateSATSelectedSatellite('None - Antennas Parked');
                
                // Update the status message
                showSATPanel('Antennas parked successfully', 'success');
            }
        });
    }
}

// Send a command to the S.A.T system
function sendSatCommand(command) {
    if (!enableCsnSat || !csnSatAddress || !satAPIAvailable) {
        showSATPanel('Error: S.A.T is not available', 'error');
        return false;
    }

    console.log(`Sending ${command} command to S.A.T`);
    
    // Show sending status
    showSATPanel(`Sending command...`);
    
    // Use our proxy to avoid mixed content issues
    const proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=cmd&command=${command}`;
    
    // Send the command via our proxy
    return fetch(proxyUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('S.A.T command response:', data);
        
        if (data.success) {
            showSATPanel('Command sent successfully', 'success');
            return true;
        } else {
            console.error('S.A.T command error:', data.error);
            showSATPanel(`Command failed: ${data.error}`, 'error');
            return false;
        }
    })
    .catch(error => {
        console.error('Error sending S.A.T command:', error);
        showSATPanel(`Error: ${error.message}`, 'error');
        return false;
    });
}

// Add tracking API functionality to the S.A.T system
let satTrackInterval = null;
let satTrackData = null;
const SAT_TRACK_POLL_INTERVAL = 3000; // Poll every 3 seconds

// Function to start polling the tracking API
function startSatTrackPolling() {
    if (satTrackInterval) {
        clearInterval(satTrackInterval);
    }
    
    // Poll immediately
    fetchSatTrackData();
    
    // Then set up regular polling
    satTrackInterval = setInterval(fetchSatTrackData, SAT_TRACK_POLL_INTERVAL);
}

// Function to stop polling the tracking API
function stopSatTrackPolling() {
    if (satTrackInterval) {
        clearInterval(satTrackInterval);
        satTrackInterval = null;
    }
}

// Fetch tracking data from the S.A.T API
function fetchSatTrackData() {
    if (!enableCsnSat || !csnSatAddress || !satAPIAvailable) {
        return;
    }

    // Use our proxy to avoid mixed content issues
    const proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=track`;
    
    fetch(proxyUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        if (result.success && result.data) {
            // Store the tracking data
            satTrackData = result.data;
            
            // Update the rotator display
            updateSatRotatorDisplay();
            
            // Update button states
            updateSatButtonStates();
            
            // Debug log
            console.log('Updated S.A.T tracking data:', satTrackData);
        } else if (result.error) {
            console.error('S.A.T tracking error:', result.error);
        }
    })
    .catch(error => {
        console.error('Error fetching S.A.T tracking data:', error);
    });
}

// Update the rotator display with current azimuth and elevation
function updateSatRotatorDisplay() {
    if (!satTrackData) return;
    
    // Get the display elements
    const azElement = document.getElementById('sat-current-az');
    const elElement = document.getElementById('sat-current-el');
    
    if (azElement && satTrackData.az !== undefined) {
        // Format azimuth as whole number
        azElement.textContent = Math.round(satTrackData.az) + "°";
    }
    
    if (elElement && satTrackData.el !== undefined) {
        // Format elevation as whole number
        elElement.textContent = Math.round(satTrackData.el) + "°";
    }
    
    // Update selected satellite info if available
    if (satTrackData.satname) {
        updateSATSelectedSatellite(satTrackData.satname);
    }
    
    // Update transponder information
    updateTransponderInfo();
}

// Update the transponder information with frequency data - properly incorporating offsets and Doppler
function updateTransponderInfo() {
    if (!satTrackData) return;
    
    const transponderDesc = document.getElementById('sat-transponder-desc');
    const uplinkFreq = document.getElementById('sat-uplink-freq');
    const downlinkFreq = document.getElementById('sat-downlink-freq');
    const uplinkMode = document.getElementById('sat-uplink-mode');
    const downlinkMode = document.getElementById('sat-downlink-mode');
    
    // Check if we have frequency data to display
    if (!satTrackData.freq || !Array.isArray(satTrackData.freq)) {
        transponderDesc.textContent = "No transponder data available";
        return;
    }
    
    // Find the active frequency by matching the afreq field with the uid
    const activeFreqId = satTrackData.afreq;
    const activeFreq = satTrackData.freq.find(f => f.uid === activeFreqId);
    
    if (activeFreq) {
        // Format and display the transponder description
        transponderDesc.textContent = activeFreq.descr.trim();
        
        // Calculate and format uplink frequency with offset and Doppler in MHz
        if (activeFreq.upFreq > 0) {
            // Apply both offset and Doppler to the main frequency
            const offsetHz = activeFreq.off_up || 0;
            const dopplerHz = activeFreq.dop_up || 0;
            const totalUplinkHz = activeFreq.upFreq + offsetHz + dopplerHz;
            const totalUplinkMHz = (totalUplinkHz / 1000000).toFixed(4);
            
            // Show frequency with everything applied
            uplinkFreq.textContent = `${totalUplinkMHz} MHz`;
            
            // Show mode
            uplinkMode.textContent = activeFreq.upMode.trim() || "---";
        } else {
            uplinkFreq.textContent = "---";
            uplinkMode.textContent = "---";
        }
        
        // Calculate and format downlink frequency with offset and Doppler in MHz
        if (activeFreq.downFreq > 0) {
            // Apply both offset and Doppler to the main frequency
            const offsetHz = activeFreq.off_down || 0;
            const dopplerHz = activeFreq.dop_down || 0;
            const totalDownlinkHz = activeFreq.downFreq + offsetHz + dopplerHz;
            const totalDownlinkMHz = (totalDownlinkHz / 1000000).toFixed(4);
            
            // Show frequency with everything applied
            downlinkFreq.textContent = `${totalDownlinkMHz} MHz`;
            
            // Show mode
            downlinkMode.textContent = activeFreq.downMode.trim() || "---";
        } else {
            downlinkFreq.textContent = "---";
            downlinkMode.textContent = "---";
        }
    } else {
        // No active frequency found
        transponderDesc.textContent = "No active transponder";
        uplinkFreq.textContent = "---";
        downlinkFreq.textContent = "---";
        uplinkMode.textContent = "---";
        downlinkMode.textContent = "---";
    }
}

// Update button states based on tracking data
function updateSatButtonStates() {
    if (!satTrackData) return;
    
    // Radio toggle button
    const radioToggleBtn = document.getElementById('sat-radio-toggle');
    if (radioToggleBtn && satTrackData.rigEnabled !== undefined) {
        const radioEnabled = satTrackData.rigEnabled === 1;
        
        if (radioEnabled) {
            radioToggleBtn.textContent = 'Radio Enabled';
            radioToggleBtn.classList.remove('sat-disabled');
            radioToggleBtn.classList.add('sat-enabled');
        } else {
            radioToggleBtn.textContent = 'Radio Disabled';
            radioToggleBtn.classList.remove('sat-enabled');
            radioToggleBtn.classList.add('sat-disabled');
        }
    }
    
    // VFO lock button
    const lockVfoBtn = document.getElementById('sat-lock-vfo');
    if (lockVfoBtn && satTrackData.lockVFO !== undefined) {
        const vfoLocked = satTrackData.lockVFO === 1;
        
        if (vfoLocked) {
            lockVfoBtn.textContent = 'Lock VFO';
            lockVfoBtn.classList.remove('sat-disabled');
            lockVfoBtn.classList.add('sat-enabled');
        } else {
            lockVfoBtn.textContent = 'Unlock VFO';
            lockVfoBtn.classList.remove('sat-enabled');
            lockVfoBtn.classList.add('sat-disabled');
        }
    }
}

// Calculate if satellite is in eclipse (Earth's shadow)
function isInEclipse(satName) {
    if (!window.tleData[satName]) return false;
    
    const now = new Date();
    const sat = window.tleData[satName];
    
    try {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const positionAndVelocity = satellite.propagate(satrec, now);
        
        if (!positionAndVelocity.position) return false;
        
        // Get satellite position vector in ECI coordinates
        const satPos = positionAndVelocity.position;
        
        // Get Sun position vector in ECI coordinates (simplified model)
        const sunPos = getSunPositionEci(now);
        
        // Calculate Earth-Satellite vector
        const earthSatVector = {
            x: satPos.x,
            y: satPos.y,
            z: satPos.z
        };
        
        // Calculate Earth-Sun vector
        const earthSunVector = {
            x: sunPos.x,
            y: sunPos.y,
            z: sunPos.z
        };
        
        // Calculate the satellite orbit radius (distance from Earth center to satellite)
        const satOrbitRadius = Math.sqrt(
            Math.pow(earthSatVector.x, 2) + 
            Math.pow(earthSatVector.y, 2) + 
            Math.pow(earthSatVector.z, 2)
        );
        
        // Calculate the angle between Earth-Satellite and Earth-Sun vectors
        const dotProduct = earthSatVector.x * earthSunVector.x + 
                           earthSatVector.y * earthSunVector.y + 
                           earthSatVector.z * earthSunVector.z;
        
        const earthSatMagnitude = Math.sqrt(
            Math.pow(earthSatVector.x, 2) + 
            Math.pow(earthSatVector.y, 2) + 
            Math.pow(earthSatVector.z, 2)
        );
        
        const earthSunMagnitude = Math.sqrt(
            Math.pow(earthSunVector.x, 2) + 
            Math.pow(earthSunVector.y, 2) + 
            Math.pow(earthSunVector.z, 2)
        );
        
        const angle = Math.acos(dotProduct / (earthSatMagnitude * earthSunMagnitude));
        
        // Earth's radius in km
        const earthRadius = 6371;
        
        // Calculate the shadow's width at the satellite's orbit
        // Using simple geometry, the shadow forms a cone
        const shadowRadius = earthRadius;
        
        // If the angle is close to 180 degrees (π radians) and the distance from Earth's
        // shadow axis is less than Earth's radius, the satellite is in eclipse
        if (angle > Math.PI / 2) {
            // Calculate the perpendicular distance from the satellite to the Earth-Sun line
            const distance = earthSatMagnitude * Math.sin(Math.PI - angle);
            
            // Simplified eclipse check: satellite is in eclipse if it's in the shadow cone
            // and on the opposite side of Earth from the Sun
            return distance < shadowRadius;
        }
        
        return false;
    } catch (error) {
        console.error(`Error calculating eclipse for ${satName}:`, error);
        return false;
    }
}

// Calculate simplified Sun position in ECI coordinates
function getSunPositionEci(date) {
    // This is a simplified model of the Sun's position
    // For more accurate calculations, a full astronomical model would be needed
    
    // Get days since J2000 epoch
    const julianDate = (date.getTime() / 86400000) + 2440587.5;
    const t = (julianDate - 2451545.0) / 36525; // Julian centuries since J2000
    
    // Calculate Sun's mean longitude and mean anomaly
    let L0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
    L0 = (L0 % 360 + 360) % 360; // Normalize to 0-360
    
    let M = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
    M = (M % 360 + 360) % 360; // Normalize to 0-360
    
    // Convert to radians
    const Mrad = M * (Math.PI / 180);
    
    // Calculate Sun's ecliptic longitude
    let lambda = L0 + 1.914666471 * Math.sin(Mrad) + 0.019994643 * Math.sin(2 * Mrad);
    lambda = lambda % 360;
    const lambdaRad = lambda * (Math.PI / 180);
    
    // Mean distance to Sun in km (1 AU)
    const r = 149597870.7;
    
    // Simplified model - Sun in ecliptic plane
    // We need to transform to ECI coordinates
    
    // Get GMST (Greenwich Mean Sidereal Time)
    const gmst = satellite.gstime(date);
    
    // Calculate position in ECI coordinates
    const sunPos = {
        x: r * Math.cos(lambdaRad),
        y: r * Math.sin(lambdaRad) * Math.cos(23.43929111 * (Math.PI / 180)), // 23.4 degrees is Earth's axial tilt
        z: r * Math.sin(lambdaRad) * Math.sin(23.43929111 * (Math.PI / 180))
    };
    
    return sunPos;
}

// Add event listener for CSN panel button
document.addEventListener('DOMContentLoaded', () => {
    // Existing event listeners...
    
    // Add event listener for the CSN panel button in the header
    const openSatPanelBtn = document.getElementById('open-sat-panel-btn');
    if (openSatPanelBtn) {
        openSatPanelBtn.addEventListener('click', () => {
            const satPanel = document.getElementById('sat-panel');
            if (satPanel) {
                // Only show the panel if CSN S.A.T is enabled and the API is available
                if (enableCsnSat && satAPIAvailable) {
                    satPanel.style.display = 'flex';
                    
                    // Start tracking data polling when panel is shown
                    startSatTrackPolling();
                } else {
                    // If S.A.T is not enabled, show a message and direct them to options
                    alert('CSN Technologies S.A.T is not enabled or not available. Please check your settings in the Options panel under the Radio tab.');
                    
                    // Open the options modal to the Radio tab
                    const optionsModal = document.getElementById('options-modal');
                    if (optionsModal) {
                        optionsModal.style.display = 'block';
                        
                        // Switch to the Radio tab
                        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                        
                        const radioTabButton = document.querySelector('.tab-button[data-tab="radio"]');
                        if (radioTabButton) {
                            radioTabButton.classList.add('active');
                            document.getElementById('radio-tab').classList.add('active');
                        }
                    }
                }
            }
        });
    }
});