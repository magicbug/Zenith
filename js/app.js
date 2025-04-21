// Global variables
// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('New service worker installing...');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New content is available; please refresh.');
                            // You could show a "New version available" notification here
                        }
                    });
                });
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// let map; // Remove Leaflet map instance
// let satelliteMarkers = {}; // Remove Leaflet markers store
// let satelliteFootprints = {}; // Remove Leaflet footprints store
let selectedSatellites = [];
let observer = {
    latitude: 51.5074,
    longitude: -0.1278,
    elevation: 0,
    callsign: '',  // Add callsign to observer object
    minElevation: 0  // Add minimum elevation to observer object
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
const TLE_URL = 'api/fetch_tle.php';  // Changed to use our PHP proxy script
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

// Cloudlog API settings
let enableCloudlog = false;
let cloudlogUrl = '';
let cloudlogApiKey = '';

// APRS settings
let enableAPRS = false;
let aprsServer = 'localhost';
let aprsPort = 8765;

// --- Make showSatelliteInfo globally accessible for D3 map clicks ---
window.showSatelliteInfo = function(satName) {
    currentInfoSatellite = satName;
    // Find the satellite object to get TLE data if needed for display
    const satData = window.tleData[satName];
    if (!satData) {
        console.error("Satellite data not found for:", satName);
        hideSatelliteInfoPanel();
        return;
    }

    // Select the satellite in the options list (visual feedback)
    const checkbox = document.getElementById(`sat-${satName}`);
    if (checkbox) {
        // Optional: Add visual indication without changing selection state
        // Maybe highlight the row or similar?
    }

    // Display the info panel
    const infoPanel = document.getElementById('satellite-info-panel');
    const infoName = document.getElementById('info-satellite-name');
    const infoContent = document.getElementById('info-content');

    if (infoPanel && infoName && infoContent) {
        infoName.textContent = satName;
        infoPanel.style.display = 'block';
        updateSatelliteInfoDisplay(satName); // Populate with initial data

        // Start interval to update info panel data regularly
        if (satInfoUpdateInterval) {
            clearInterval(satInfoUpdateInterval);
        }
        satInfoUpdateInterval = setInterval(() => {
            if (currentInfoSatellite === satName) { // Check if still the selected sat
                updateSatelliteInfoDisplay(satName);
            } else {
                clearInterval(satInfoUpdateInterval); // Stop if different sat selected
            }
        }, SAT_INFO_UPDATE_INTERVAL_MS);

        // Also update the S.A.T Panel if enabled
        if (enableCsnSat && satAPIAvailable) {
            updateSatPanelForSelection(satName);
        }
        
        // Also update the Polar Plot if visible and the function exists
        if (typeof updatePolarPlotForSatellite === 'function') {
            updatePolarPlotForSatellite(satName);
        }
        
    } else {
        console.error("Satellite info panel elements not found.");
    }
};

// Function to send satellite selection to the CSN S.A.T interface
function updateSatPanelForSelection(satName) {
    if (typeof selectSatelliteForSAT !== 'function') {
        console.error('selectSatelliteForSAT function not available');
        return;
    }
    
    // Set a status indicator if available
    const satStatusIndicator = document.getElementById('sat-status-indicator');
    if (satStatusIndicator) {
        satStatusIndicator.textContent = 'Connecting...';
        satStatusIndicator.className = 'status-connecting';
    }
    
    // Call the CSN integration to select the satellite
    selectSatelliteForSAT(satName)
        .then(success => {
            // Update status indicator
            if (satStatusIndicator) {
                satStatusIndicator.textContent = success ? 'Connected' : 'Connection Error';
                satStatusIndicator.className = success ? 'status-connected' : 'status-error';
            }
            
            // If there's consistent connection issues, suggest checking settings
            if (!success) {
                // Increment error counter (reset after 1 hour)
                if (!window.satConnectionErrors) {
                    window.satConnectionErrors = 0;
                    window.satConnectionErrorTimer = setTimeout(() => {
                        window.satConnectionErrors = 0;
                    }, 3600000); // 1 hour
                }
                window.satConnectionErrors++;
                
                // After 3 errors, suggest checking settings
                if (window.satConnectionErrors >= 3) {
                    console.warn('Multiple CSN connection failures detected. Suggesting settings check.');
                    const message = `Having trouble connecting to your S.A.T controller. Please check the address in Settings → CSN S.A.T.`;
                    
                    // Show notification or console message
                    if (typeof showNotification === 'function') {
                        showNotification('Connection Issues', message);
                    } else {
                        console.warn(message);
                    }
                    
                    // Reset counter to avoid spamming the user
                    window.satConnectionErrors = 0;
                }
            } else {
                // Reset error counter on success
                window.satConnectionErrors = 0;
                if (window.satConnectionErrorTimer) {
                    clearTimeout(window.satConnectionErrorTimer);
                }
            }
        })
        .catch(err => {
            console.error('Error in satellite selection:', err);
            if (satStatusIndicator) {
                satStatusIndicator.textContent = 'Error';
                satStatusIndicator.className = 'status-error';
            }
        });
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load settings from local storage first, before map initialization
    loadObserverFromLocalStorage();
    loadSelectedSatellitesFromLocalStorage();
    loadHamsAtSettingsFromLocalStorage();
    loadCsnSatSettingsFromLocalStorage();
    loadCloudlogSettingsFromLocalStorage();
    loadAPRSSettingsFromLocalStorage();
    
    // Update button visibility based on loaded settings
    updateSatPanelButtonVisibility();
    updateAPRSButtonVisibility(); // Add call for APRS button
    
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
        updateSatPanelButtonVisibility(); // Update button visibility when setting changes
        
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

    // Load Cloudlog settings
    loadCloudlogSettingsFromLocalStorage();

    // Add event listeners for Cloudlog settings
    document.getElementById('enable-cloudlog').addEventListener('change', function() {
        enableCloudlog = this.checked;
        saveCloudlogSettingsToLocalStorage();
    });

    document.getElementById('cloudlog-url').addEventListener('input', function() {
        cloudlogUrl = this.value.trim();
        saveCloudlogSettingsToLocalStorage();
    });

    document.getElementById('cloudlog-api-key').addEventListener('input', function() {
        cloudlogApiKey = this.value.trim();
        saveCloudlogSettingsToLocalStorage();
    });

    // Add event listeners for frequency and mode changes
    const frequencyInputs = ['uplink-freq', 'downlink-freq', 'uplink-mode', 'downlink-mode'];
    frequencyInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', updateCloudlogData);
        }
    });

    // Add event listeners for APRS settings
    document.getElementById('enable-aprs').addEventListener('change', function() {
        enableAPRS = this.checked;
        saveAPRSSettingsToLocalStorage();
        updateAPRSButtonVisibility(); // Update button visibility when setting changes
    });

    document.getElementById('aprs-server').addEventListener('input', function() {
        aprsServer = this.value.trim();
        saveAPRSSettingsToLocalStorage();
    });

    document.getElementById('aprs-port').addEventListener('input', function() {
        aprsPort = parseInt(this.value) || 8765;
        saveAPRSSettingsToLocalStorage();
    });

    // Update APRS button state
    document.getElementById('open-aprs').addEventListener('click', function() {
        if (!enableAPRS) {
            alert('APRS is not enabled. Please enable it in the Options menu first.');
            return;
        }
    });
});

// Function to initialize the map
function initMap() {
    console.log("Initializing D3 Map...");
    // --- Leaflet Initialization Removed ---
    
    // --- Add D3 Map Initialization ---
    if (typeof MapD3 !== 'undefined' && MapD3.init) {
        // Pass canvas ID, observer object, TLE data, and selected satellites array
        MapD3.init('satellite-canvas', observer, window.tleData, selectedSatellites);
        console.log("MapD3.init called.");
    } else {
        console.error("MapD3 object or init function not found! Cannot initialize D3 map.");
    }
}

// Remove Leaflet observer marker function
/*
function addObserverMarker() {
    if (!map) return;
    // Remove existing marker if it exists
    if (window.observerMarker) {
        map.removeLayer(window.observerMarker);
    }

    // Create a simple circle marker for the observer
    window.observerMarker = L.circleMarker([observer.latitude, observer.longitude], {
        radius: 5,
        fillColor: "#ff7800",
        color: "#000",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);

    // Add tooltip with observer info
    const tooltipContent = `<b>Observer</b><br>Lat: ${observer.latitude.toFixed(4)}<br>Lon: ${observer.longitude.toFixed(4)}<br>Grid: ${latLonToGridSquare(observer.latitude, observer.longitude)}`;
    window.observerMarker.bindTooltip(tooltipContent);
}
*/

// Set up event listeners
function setupEventListeners() {
    const modal = document.getElementById('options-modal');
    const openModalBtn = document.getElementById('open-options');
    const closeBtn = modal.querySelector('.close');  // Changed to specifically target the close button within the options modal
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

    // Update save button to use saveOptions function
    saveBtn.addEventListener('click', saveOptions);

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
    // Update selected satellites after selecting all
    updateSelectedSatellites();
}

// Deselect all satellites
function deselectAllSatellites() {
    const checkboxes = document.querySelectorAll('#satellite-list input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    // Update selected satellites after deselecting all
    updateSelectedSatellites();
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
    const lines = data.split('\n');
    window.tleData = {};
    let tleCount = 0;
    let failedTLEs = []; // Keep track of satellites that failed parsing

    for (let i = 0; i < lines.length; i += 3) {
        if (i + 2 < lines.length) {
            const satelliteName = lines[i].trim();
            const tle1 = lines[i + 1].trim();
            const tle2 = lines[i + 2].trim();
            
            if (satelliteName && tle1 && tle2) {
                // Updated regex to support both 4 and 5 digit catalog numbers
                // Format: Line 1 starts with '1 ' followed by catalog number (4-5 digits), followed by classification (U,C,S) and space
                const validLine1 = /^1 +\d{4,5}[UCS] /.test(tle1);
                // Format: Line 2 starts with '2 ' followed by catalog number (4-5 digits) and space
                const validLine2 = /^2 +\d{4,5} /.test(tle2);
                
                if (validLine1 && validLine2) {
                    try {
                        const satrec = satellite.twoline2satrec(tle1, tle2);
                        
                        // Optional validation: test propagation with current time
                        const now = new Date();
                        const positionAndVelocity = satellite.propagate(satrec, now);
                        
                        // Store satellite data if propagation succeeds (or skip this check to be more lenient)
                        if (positionAndVelocity.position) {
                            window.tleData[satelliteName] = {
                                name: satelliteName,
                                tle1: tle1,
                                tle2: tle2,
                                satrec: satrec // Store the parsed object
                            };
                            tleCount++;
                        } else {
                            console.warn(`Propagation failed for ${satelliteName}, skipping`);
                            failedTLEs.push(`${satelliteName} (Propagation Failed)`);
                        }
                    } catch (e) {
                        console.warn(`Error parsing TLE for ${satelliteName}: ${e.message}`);
                        failedTLEs.push(satelliteName); // Add to failed list
                    }
                } else if (satelliteName) {
                    // Provide more detailed error for diagnostic purposes
                    let reason = "";
                    if (!validLine1 && !validLine2) reason = "Both lines invalid";
                    else if (!validLine1) reason = "Line 1 invalid";
                    else reason = "Line 2 invalid";
                    
                    console.warn(`Invalid TLE format for "${satelliteName}": ${reason}`);
                    console.warn(`Line 1: ${tle1}`);
                    console.warn(`Line 2: ${tle2}`);
                    failedTLEs.push(`${satelliteName} (Bad Format)`);
                }
            }
        }
    }
    
    console.log(`Processed ${tleCount} valid satellites into window.tleData`);
    if (failedTLEs.length > 0) {
        console.warn(`Failed to parse TLEs for ${failedTLEs.length} satellites:`, failedTLEs.join(', '));
        // Optional: Display this to the user in a less intrusive way?
    }

    // Assign random colors
    Object.values(window.tleData).forEach(sat => {
        if (sat.satrec) {
            sat.color = getRandomColor();
        }
    });
    
    populateSatelliteList();
    
    // Restore selection, considering potential failures
    let actuallySelected = [];
    if (selectedSatellites.length > 0) {
        console.log('Restoring selected satellites:', selectedSatellites);
        selectedSatellites.forEach(satName => {
            const checkbox = document.querySelector(`input[data-satellite="${satName}"]`);
            if (checkbox) {
                // Only check it if the TLE was processed successfully
                if (window.tleData[satName] && window.tleData[satName].satrec) {
                    checkbox.checked = true;
                    actuallySelected.push(satName);
                } else {
                    checkbox.checked = false; // Uncheck if TLE failed
                }
            } else {
                 console.warn(`Checkbox not found for previously selected satellite: ${satName}`);
            }
        });
        selectedSatellites = actuallySelected; // Update the main list
        localStorage.setItem('selectedSatellites', JSON.stringify(selectedSatellites)); // Save updated selection
        console.log('Successfully restored:', selectedSatellites);
    } else {
        // If no prior selection, ensure selectedSatellites is empty and update display
        updateSelectedSatellites(); 
    }
    
    startSatelliteTracking();
}

// Update calculateSatellitePosition to expect satrec directly
function calculateSatellitePosition(satrec, time) { // Changed first argument from sat object to satrec
    if (!satrec) {
        console.error("calculateSatellitePosition called with null satrec");
        return null;
    }
    try {
        // Get position using the provided satrec
        const positionAndVelocity = satellite.propagate(satrec, time);
        
        // Convert position to geodetic coordinates
        if (positionAndVelocity.position) {
            const gmst = satellite.gstime(time);
            const positionEci = positionAndVelocity.position;
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);
            
            // Convert to degrees and return structure needed by updateSatellitePositions
            return {
                 positionGd: {
                    latitude: satellite.degreesLat(positionGd.latitude),
                    longitude: satellite.degreesLong(positionGd.longitude),
                    height: positionGd.height // Keep height in km
                },
                velocity: positionAndVelocity.velocity // Keep velocity if needed later
            };
        } else {
             console.warn("Propagation returned no position.");
             return null;
        }
    } catch (error) {
        // Using console.warn as errors during propagation might be expected for old TLEs
        console.warn(`Error calculating position:`, error);
        return null;
    }
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
        
        // Add change event listener to update selected satellites
        checkbox.addEventListener('change', (e) => {
            console.log('Checkbox changed for satellite:', satName, 'checked:', e.target.checked);
            updateSelectedSatellites();
        });
        
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
    console.log('updateSelectedSatellites called');
    // Clear current selection
    selectedSatellites = [];
    console.log('Cleared selectedSatellites array');
    
    // Get all checked satellites
    const checkedBoxes = document.querySelectorAll('#satellite-list input[type="checkbox"]:checked');
    console.log('Found checked boxes:', checkedBoxes.length);
    
    checkedBoxes.forEach(checkbox => {
        const satName = checkbox.getAttribute('data-satellite');
        console.log('Processing checkbox for satellite:', satName);
        if (satName && window.tleData[satName]) {  // Use window.tleData consistently
            selectedSatellites.push(satName);
            console.log('Added satellite to selection:', satName);
        }
    });
    
    console.log('Final selected satellites:', selectedSatellites);
    
    // Save to localStorage
    localStorage.setItem('selectedSatellites', JSON.stringify(selectedSatellites));
    console.log('Saved to localStorage:', localStorage.getItem('selectedSatellites'));
    
    // Update satellite display on map
    updateSatelliteDisplay();
}

// Update the observer location
function updateObserverLocation(location) {
    const lat = parseFloat(document.getElementById('latitude').value);
    const lon = parseFloat(document.getElementById('longitude').value);
    const elev = parseFloat(document.getElementById('elevation').value);
    const minElev = parseFloat(document.getElementById('min-elevation').value);
    const callsign = document.getElementById('callsign').value;
    
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
    
    if (isNaN(minElev) || minElev < 0 || minElev > 90) {
        alert('Minimum elevation must be between 0 and 90 degrees');
        return;
    }
    
    // Update observer data
    observer.latitude = lat;
    observer.longitude = lon;
    observer.elevation = elev;
    observer.minElevation = minElev;
    observer.callsign = callsign;
    
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
    // --- Remove Leaflet-specific clearing ---
    /*
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
    */
    
    // Update positions for selected satellites (this now implicitly handles clearing in MapD3)
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
    if (selectedSatellites.length === 0 || Object.keys(window.tleData).length === 0) {
        // Clear map if no satellites selected or no TLE data
        // TODO: Need a clear function in map_d3.js
        // Example: MapD3.clearSatellites();
        return;
    }

    const now = new Date();
    const updatedSatelliteData = [];
    
    selectedSatellites.forEach(satName => {
        const satData = window.tleData[satName];
        // Add extra check: Ensure satData itself exists before checking satrec
        if (satData && satData.satrec) { 
            const position = calculateSatellitePosition(satData.satrec, now);
            if (position) {
                // Add calculated position AND the satrec to the data for D3 map
                updatedSatelliteData.push({
                    name: satName,
                    // tle1: satData.tle1, // No longer needed by map_d3
                    // tle2: satData.tle2, // No longer needed by map_d3
                    color: satData.color || '#FFFFFF',
                    positionGd: position.positionGd, // Pass geodetic position
                    satrec: satData.satrec // *** Pass the satrec directly ***
                });
            } else {
                 // Propagation failed, do nothing (don't add to updatedSatelliteData)
            }
        } else {
             // TLE data or satrec missing, do nothing (don't add to updatedSatelliteData)
            // console.warn(`No TLE data or satrec found for selected satellite: ${satName}`); // Keep this commented unless debugging
        }
    });
    
    // --- Call D3 Map Update Function ---
    // Pass the array of updated satellite data (now including satrec) to the D3 map script
    if (typeof MapD3 !== 'undefined' && MapD3.updateSatellites) {
        MapD3.updateSatellites(updatedSatelliteData);
    } else {
        // console.warn("MapD3 object or updateSatellites function not available yet.");
    }

    // Update info for the currently selected satellite in the info panel
    if (currentInfoSatellite && selectedSatellites.includes(currentInfoSatellite)) {
        // updateSatelliteInfoDisplay(currentInfoSatellite); // This is handled by the interval now
    } else if (currentInfoSatellite && !selectedSatellites.includes(currentInfoSatellite)) {
        // If the satellite in the info panel is deselected, hide the panel
        // hideSatelliteInfoPanel(); // Or keep it open showing last known data?
    }
}

// Update the satellite marker creation function
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

// Add a new function that handles updating the satellite info display
function updateSatelliteInfoDisplay(satName) {
    if (!satName) return;

    // Attempt to get current data
    const position = getSatellitePosition(satName);
    // *** CHANGE: Only calculate look angles if position is available ***
    const lookAngles = position ? calculateLookAngles(satName) : null;
    const inEclipse = position ? isInEclipse(satName) : null; // Only check eclipse if position is valid

    // Set the satellite name in the header (always possible)
    document.getElementById('info-satellite-name').textContent = satName;

    // Format orbital parameters (these depend only on TLE, not current position)
    const orbitalSpeed = calculateOrbitalSpeed(satName);
    const orbitalPeriod = calculateOrbitalPeriod(satName);
    const nextPass = getNextPass(satName); // Prediction might still work

    // Build panel content, handling potentially unavailable data
    const positionHtml = position ? `
        <div class="info-grid">
            <div>Latitude:</div><div>${position.latitude.toFixed(2)}°</div>
            <div>Longitude:</div><div>${position.longitude.toFixed(2)}°</div>
            <div>Altitude:</div><div>${(position.altitude * 1000).toFixed(0)} m</div>
            <div>Eclipse:</div><div>${inEclipse === null ? 'N/A' : (inEclipse ? '<span class="eclipse-indicator">In Shadow</span>' : '<span class="sunlight-indicator">In Sunlight</span>')}</div>
        </div>
    ` : `<div class="info-unavailable">Position data unavailable (TLE issue?)</div>`;

    const lookAnglesHtml = lookAngles ? `
        <div class="info-grid">
            <div>Azimuth:</div><div>${lookAngles.azimuth.toFixed(1)}°</div>
            <div>Elevation:</div><div>${lookAngles.elevation.toFixed(1)}°</div>
            <div>Range:</div><div>${(lookAngles.range * 1000).toFixed(0)} km</div>
            <div>Visibility:</div><div>${lookAngles.visible ? '<span class="visible-indicator">Visible</span>' : '<span class="not-visible-indicator">Not visible</span>'}</div>
        </div>
    ` : `<div class="info-unavailable">Look angles unavailable (TLE issue?)</div>`;

    const orbitalDataHtml = `
        <div class="info-grid">
            <div>Speed:</div><div>${orbitalSpeed > 0 ? orbitalSpeed.toFixed(2) + ' km/s' : 'Unavailable'}</div>
            <div>Period:</div><div>${orbitalPeriod > 0 ? orbitalPeriod.toFixed(0) + ' min' : 'Unavailable'}</div>
        </div>
    `;

    const nextPassHtml = nextPass ? `
        <div class="info-grid">
            <div>Start:</div><div>${formatDateTime(nextPass.start)}</div>
            <div>Max Elevation:</div><div>${nextPass.maxElevation.toFixed(1)}°</div>
            <div>Duration:</div><div>${Math.round((nextPass.end - nextPass.start) / (60 * 1000))} min</div>
        </div>
    ` : `<div class="info-unavailable">Next pass prediction unavailable</div>`;

    // Set the panel content
    document.getElementById('info-content').innerHTML = `
        <div class="info-section">
            <h4>Current Position</h4>
            ${positionHtml}
        </div>
        
        <div class="info-section">
            <h4>Look Angles from Observer</h4>
            ${lookAnglesHtml}
        </div>
        
        <div class="info-section">
            <h4>Orbital Data</h4>
            ${orbitalDataHtml}
        </div>
        
        <div class="info-section">
            <h4>Next Pass</h4>
            ${nextPassHtml}
        </div>
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
        const positionData = calculateSatellitePosition(sat.satrec, now);
        if (!positionData) {
            console.error('Failed to calculate position for satellite:', satName);
            return null;
        }
        return positionData.positionGd; // Changed from positionData.position to positionData.positionGd
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
        passesContainer.innerHTML = `<p>No passes found in the next ${PASS_PREDICTION_HOURS} hours above ${observer.minElevation}° elevation</p>`;
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
            
            // Verify satellite exists AND has valid TLE data (satrec)
            if (!window.tleData[satName] || !window.tleData[satName].satrec) {
                console.error('Satellite TLE data not found or invalid for:', satName);
                alert(`Cannot display info for ${satName}. TLE data might be missing, outdated, or invalid.`);
                return; // Stop execution if data is bad
            }
            
            // Get current position (This call already handles errors internally)
            // const position = getSatellitePosition(satName); // No longer needed to check here
            
            // Always call showSatelliteInfo, it will handle unavailable data internally
            showSatelliteInfo(satName); 
            
            // Check if showPolarRadarForPass exists before calling
            if (typeof showPolarRadarForPass === 'function') {
                showPolarRadarForPass(pass);
            } else {
                console.warn('showPolarRadarForPass function not found.');
            }
        });
        
        passesContainer.appendChild(passItem);
    });
}

// Function to highlight a satellite briefly
function highlightSatellite(satName) {
    // D3 map implementation
    if (typeof MapD3 !== 'undefined' && MapD3.highlightSatellite) {
        MapD3.highlightSatellite(satName);
        return;
    }
    
    // Fallback for Leaflet implementation (kept for backward compatibility)
    if (window.satelliteMarkers && window.satelliteMarkers[satName]) {
        // Store the original icon
        const marker = window.satelliteMarkers[satName];
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
}

// Make the highlightSatellite function globally available
window.highlightSatellite = highlightSatellite;

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
            
            // Check if satellite is visible above minimum elevation
            if (elevationDeg >= observer.minElevation) {
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
    
    // If we have an ongoing pass at the end time, add it
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
    const savedObserver = localStorage.getItem('observer');
    if (savedObserver) {
        const parsedObserver = JSON.parse(savedObserver);
        // Update the global observer object with saved values
        observer.latitude = parsedObserver.latitude;
        observer.longitude = parsedObserver.longitude;
        observer.elevation = parsedObserver.elevation;
        observer.callsign = parsedObserver.callsign || '';
        observer.minElevation = parsedObserver.minElevation || 0;
    } else {
        // Initialize with default values if no saved data exists
        observer = {
            latitude: 51.5074,
            longitude: -0.1278,
            elevation: 0,
            callsign: '',
            minElevation: 0
        };
    }
    // Always set the form values to match the current observer object
    document.getElementById('latitude').value = observer.latitude;
    document.getElementById('longitude').value = observer.longitude;
    document.getElementById('elevation').value = observer.elevation;
    document.getElementById('callsign').value = observer.callsign;
    document.getElementById('min-elevation').value = observer.minElevation;
}

// Update observer display with current values
function updateObserverDisplay() {
    document.getElementById('latitude').value = observer.latitude;
    document.getElementById('longitude').value = observer.longitude;
    document.getElementById('elevation').value = observer.elevation;
    document.getElementById('min-elevation').value = observer.minElevation || 0;
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
``;
</rewritten_file>
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
    // Get values from form
    const lat = parseFloat(document.getElementById('latitude').value);
    const lon = parseFloat(document.getElementById('longitude').value);
    const elev = parseFloat(document.getElementById('elevation').value);
    const minElev = parseFloat(document.getElementById('min-elevation').value);
    const callsign = document.getElementById('callsign').value;
    
    // Update observer data
    observer.latitude = lat;
    observer.longitude = lon;
    observer.elevation = elev;
    observer.minElevation = minElev;
    observer.callsign = callsign;
    
    // Save to local storage
    saveObserverToLocalStorage();
    
    // --- Remove Leaflet calls ---
    // Update the observer marker on the map
    // addObserverMarker(); 
    
    // Update map center
    // map.setView([observer.latitude, observer.longitude], map.getZoom());
    
    // Recalculate passes with new location
    calculateUpcomingPasses(); // Keep this
    
    // Save API settings
    saveApiSettings();
    
    // Save CSN SAT settings
    saveCsnSatSettingsToLocalStorage();
    
    // Save notification settings
    const notificationCheckbox = document.getElementById('enable-notifications');
    if (notificationCheckbox) {
        notificationsEnabled = notificationCheckbox.checked;
        localStorage.setItem('notificationsEnabled', notificationsEnabled.toString());
        if (notificationsEnabled) {
            initNotifications();
        } else {
            if (notificationCheckInterval) {
                clearInterval(notificationCheckInterval);
                notificationCheckInterval = null;
            }
        }
    }
    
    // Update roves if enabled
    if (enableRoves && hamsAtApiKey) {
        fetchUpcomingRoves();
    } else {
        document.getElementById('upcoming-roves').innerHTML = 
            '<div class="rove-item">Roves display is disabled or API key is missing.</div>';
    }
    
    // Update and save selected satellites
    updateSelectedSatellites();
    
    // Close the modal
    document.getElementById('options-modal').style.display = 'none';
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
        // Use formatDateTimeWithDate instead of formatDate to show full date and time
        time.textContent = `${formatDateTimeWithDate(aosDate)} - ${formatDateTimeWithDate(losDate)}`;
        
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
    
    // Check if panel was manually closed before showing
    if (window.satelliteInfoPanelClosed) {
        return;
    }
    
    // Show the info panel
    const infoPanel = document.getElementById('satellite-info-panel');
    infoPanel.style.display = 'block';
    
}

// Add a reset for the closed flag when a satellite is clicked
function onSatelliteMarkerClick(e) {
    // Reset the closed flag when a satellite is manually selected
    window.satelliteInfoPanelClosed = false;
    
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
    
}

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
    
}

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
    localStorage.setItem('enableCsnSat', enableCsnSat.toString()); // Reverted key to camelCase and ensure string conversion
    localStorage.setItem('csnSatAddress', csnSatAddress); // Reverted key to camelCase
}



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





// Add event listener for callsign input
document.addEventListener('DOMContentLoaded', () => {
    
    // Add event listener for callsign input
    document.getElementById('callsign').addEventListener('input', function() {
        observer.callsign = this.value.trim();
        saveObserverToLocalStorage();
    });
    
});

// Panel minimize/maximize functionality
document.getElementById('minimize-satellite-info').addEventListener('click', function() {
    document.getElementById('satellite-info-panel').classList.toggle('minimized');
});

document.getElementById('minimize-sat-panel').addEventListener('click', function() {
    document.getElementById('sat-panel').classList.toggle('minimized');
});

// Make panels draggable
function makeDraggable(element) {
    const header = element.querySelector('.info-header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === header || e.target.parentNode === header) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, element);
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }
}

// Make panels draggable
const panels = [
    document.getElementById('satellite-info-panel'),
    document.getElementById('sat-panel')
];

panels.forEach(panel => {
    if (panel) {
        makeDraggable(panel);
    }
});

// Add this function to handle observer location updates
function updateObserverLocation(location) {
    // Convert lat/long to grid square
    const gridSquare = latLonToGridSquare(location.latitude, location.longitude);
    
    // Create location object with grid square
    const observerLocation = {
        ...location,
        gridSquare: gridSquare
    };
    
    // Update APRS panel with observer location
    if (window.aprsPanel) {
        window.aprsPanel.setObserverLocation(observerLocation);
    }
}

// Add this function to convert lat/long to grid square
function latLonToGridSquare(lat, lon) {
    // Implementation of lat/long to grid square conversion
    // This is a simplified version - you may want to use a more accurate implementation
    const gridSize = 10; // 10 degrees per grid square
    const latOffset = 90;
    const lonOffset = 180;
    
    const latGrid = Math.floor((lat + latOffset) / gridSize);
    const lonGrid = Math.floor((lon + lonOffset) / gridSize);
    
    const latRemainder = ((lat + latOffset) % gridSize) / gridSize;
    const lonRemainder = ((lon + lonOffset) % gridSize) / gridSize;
    
    const subLat = Math.floor(latRemainder * 10);
    const subLon = Math.floor(lonRemainder * 10);
    
    const gridSquare = String.fromCharCode(65 + lonGrid) + 
                      String.fromCharCode(65 + latGrid) + 
                      subLon + subLat;
    
    return gridSquare;
}

// Update the location form submission handler
document.getElementById('save-options').addEventListener('click', function() {
    
    const location = {
        latitude: parseFloat(document.getElementById('latitude').value),
        longitude: parseFloat(document.getElementById('longitude').value),
        elevation: parseFloat(document.getElementById('elevation').value)
    };
    
    updateObserverLocation(location);
    
});

// Update the geolocation handler
document.getElementById('use-geolocation').addEventListener('click', function() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                elevation: position.coords.altitude || 0
            };
            
            document.getElementById('latitude').value = location.latitude;
            document.getElementById('longitude').value = location.longitude;
            document.getElementById('elevation').value = location.elevation;
            
            updateObserverLocation(location);
        });
    }
});

// APRS Settings functions
function loadAPRSSettingsFromLocalStorage() {
    const savedSettings = localStorage.getItem('aprsSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        enableAPRS = settings.enableAPRS || false;
        aprsServer = settings.aprsServer || 'localhost';
        aprsPort = settings.aprsPort || 8765;

        // Update UI
        document.getElementById('enable-aprs').checked = enableAPRS;
        document.getElementById('aprs-server').value = aprsServer;
        document.getElementById('aprs-port').value = aprsPort;
    }
}

function saveAPRSSettingsToLocalStorage() {
    const settings = {
        enableAPRS: enableAPRS,
        aprsServer: aprsServer,
        aprsPort: aprsPort
    };
    localStorage.setItem('aprsSettings', JSON.stringify(settings));
}

function updateAPRSObserverLocation(location) {
    // Convert lat/long to grid square
    const gridSquare = latLonToGridSquare(location.latitude, location.longitude);
    
    // Create location object with grid square
    const observerLocation = {
        ...location,
        gridSquare: gridSquare
    };
    
    // Update APRS panel with observer location
    if (window.aprsPanel) {
        window.aprsPanel.setObserverLocation(observerLocation);
    }
}

// Function to update the visibility of the S.A.T panel button based on settings
function updateSatPanelButtonVisibility() {
    const satPanelButton = document.getElementById('open-sat-panel-btn');
    if (!satPanelButton) {
        console.error("S.A.T Panel button not found.");
        return;
    }

    const isCsnSatEnabled = localStorage.getItem('enableCsnSat') === 'true'; // Read camelCase key
    
    if (isCsnSatEnabled) {
        satPanelButton.style.display = ''; // Show button (reset to default display)
    } else {
        satPanelButton.style.display = 'none'; // Hide button
    }
}

// Function to update the visibility of the APRS button based on settings
function updateAPRSButtonVisibility() {
    const aprsButton = document.getElementById('open-aprs');
    if (!aprsButton) {
        console.error("APRS button not found.");
        return;
    }

    let isAPRSEnabled = false;
    try {
        const savedSettings = localStorage.getItem('aprsSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            isAPRSEnabled = settings.enableAPRS === true;
        }
    } catch (error) {
        console.error("Error reading APRS settings from localStorage:", error);
        isAPRSEnabled = false; // Default to hidden if error
    }

    if (isAPRSEnabled) {
        aprsButton.style.display = ''; // Show button
    } else {
        aprsButton.style.display = 'none'; // Hide button
    }
}

// Function to update the polar plot for a specific satellite
function updatePolarPlotForSatellite(satName) {
    // First check if the polar plot functionality is available
    if (typeof showPolarRadarForPass !== 'function') {
        return; // Silently fail if the function doesn't exist
    }

    // Get the next pass for this satellite
    const nextPass = getNextPass(satName);
    if (!nextPass) {
        return; // No upcoming pass to display
    }

    // Prepare the pass data structure expected by showPolarRadarForPass
    const passData = {
        satellite: satName,
        start: nextPass.start,
        end: nextPass.end,
        maxElevation: nextPass.maxElevation
    };

    // Show the pass in the polar plot
    showPolarRadarForPass(passData);
}