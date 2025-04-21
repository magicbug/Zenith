// Add this to your document ready event listener
document.addEventListener('DOMContentLoaded', () => {    
    // Initialize CSN tracking to check for already selected satellites
    setTimeout(initializeCsnTracking, 1000); // Small delay to ensure everything is loaded
});

document.addEventListener('DOMContentLoaded', () => {

    const transponderDesc = document.getElementById('sat-transponder-desc');
    if (transponderDesc) {
        const transponderSelectContainer = document.createElement('div');
        transponderSelectContainer.className = 'sat-transponder-select-container';
        
        const transponderSelect = document.createElement('select');
        transponderSelect.id = 'sat-transponder-select';
        transponderSelect.className = 'sat-transponder-select';
        transponderSelect.innerHTML = '<option value="">Loading transponders...</option>';
        
        // Replace the transponder description with our select
        transponderSelectContainer.appendChild(transponderSelect);
        transponderDesc.parentNode.replaceChild(transponderSelectContainer, transponderDesc);
    }
    
});

// Update the checkSATAPIAvailability function to return a promise
function checkSATAPIAvailability() {
    if (!enableCsnSat || !csnSatAddress) {
        satAPIAvailable = false;
        return Promise.resolve(false);
    }

    console.log('Checking CSN S.A.T API availability through proxy for:', csnSatAddress);
    
    // Use our PHP proxy instead of direct API call
    const proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=status`;
    
    return fetch(proxyUrl)
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
        updateSatPanelButtonVisibility(); // Update button visibility when setting changes
        
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
    let proxyUrl;
    
    // Check if it's a transponder selection command (format: A|123)
    if (command.startsWith('A|')) {
        // Special format for transponder selection
        proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=cmd&command=${encodeURIComponent(command)}`;
    } else {
        // Regular single-character command
        proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=cmd&command=${command}`;
    }
    
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
            // If it was a transponder command, add custom message
            if (command.startsWith('A|')) {
                showSATPanel('Transponder changed successfully', 'success');
            } else {
                showSATPanel('Command sent successfully', 'success');
            }
            
            // Fetch updated tracking data after a short delay to see changes
            setTimeout(fetchSatTrackData, 500);
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

// Fetch S.A.T tracking data
function fetchSatTrackData() {
    if (!enableCsnSat || !csnSatAddress || !satAPIAvailable) {
        return;
    }
    
    // Use our PHP proxy for tracking data
    const proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=track`;
    
    fetch(proxyUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        if (result.data) {
            // Store the tracking data globally
            satTrackData = result.data;
            
            // Update rotator display
            updateSatRotatorDisplay();
            
            // If we have a satellite name in the tracking data, update it as the selected satellite
            if (satTrackData.satname && satTrackData.satname.trim() !== '') {
                // Only update if different from current selection to avoid unnecessary updates
                if (satTrackData.satname !== currentSelectedSatelliteForSAT) {
                    currentSelectedSatelliteForSAT = satTrackData.satname;
                    
                    // Update the selected satellite in the interface
                    updateSATSelectedSatellite(satTrackData.satname);
                    
                    // If the satellite is also in our TLE data, select it in the main app
                    if (window.tleData && window.tleData[satTrackData.satname]) {
                        // Only highlight the satellite if it hasn't been done before
                        if (!window.satHighlightedFromCSN) {
                            // Use the global showSatelliteInfo to show satellite data
                            if (typeof window.showSatelliteInfo === 'function') {
                                window.showSatelliteInfo(satTrackData.satname);
                            }
                            
                            // Use MapD3 highlight if available, otherwise fall back to app's function
                            if (typeof MapD3 !== 'undefined' && MapD3.highlightSatellite) {
                                MapD3.highlightSatellite(satTrackData.satname);
                            } else if (typeof window.highlightSatellite === 'function') {
                                window.highlightSatellite(satTrackData.satname);
                            }
                            
                            window.satHighlightedFromCSN = true;
                        }
                    }
                }
            }
            
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

// Add this function to initialize CSN tracking when app loads
function initializeCsnTracking() {
    if (enableCsnSat && csnSatAddress) {
        checkSATAPIAvailability()
            .then(available => {
                if (available) {
                    // First track data fetch - might contain an already selected satellite
                    fetchSatTrackData();
                    
                    // Reset the highlight flag when initializing
                    window.satHighlightedFromCSN = false;
                }
            });
    }
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
    
    const transponderSelect = document.getElementById('sat-transponder-select');
    const uplinkFreq = document.getElementById('sat-uplink-freq');
    const downlinkFreq = document.getElementById('sat-downlink-freq');
    const uplinkMode = document.getElementById('sat-uplink-mode');
    const downlinkMode = document.getElementById('sat-downlink-mode');
    const ctcssContainer = document.getElementById('sat-ctcss-container');
    const ctcssSelect = document.getElementById('sat-ctcss-select');
    
    // Check if we have frequency data to display
    if (!satTrackData.freq || !Array.isArray(satTrackData.freq)) {
        if (transponderSelect) {
            // Clear dropdown and add a placeholder option
            transponderSelect.innerHTML = '<option value="">No transponder data available</option>';
            transponderSelect.disabled = true;
        }
        return;
    }
    
    // Find the active frequency ID
    const activeFreqId = satTrackData.afreq;
    
    // Clear and rebuild the dropdown
    transponderSelect.innerHTML = '';
    transponderSelect.disabled = false;
    
    // Sort transponders for consistent display order
    const sortedFreqs = [...satTrackData.freq].sort((a, b) => {
        // Sort by sort field if available, otherwise by uid
        if (a.sort !== undefined && b.sort !== undefined) {
            return a.sort - b.sort;
        }
        return a.uid - b.uid;
    });
    
    // Populate dropdown with all available transponders
    sortedFreqs.forEach(freq => {
        const option = document.createElement('option');
        option.value = freq.uid;
        option.textContent = freq.descr.trim();
        option.selected = freq.uid === activeFreqId;
        transponderSelect.appendChild(option);
    });
    
    // Show/hide CTCSS selector based on uplink mode
    if (activeFreqId) {
        const activeFreq = satTrackData.freq.find(f => f.uid === activeFreqId);
        if (activeFreq && activeFreq.upMode.trim() === 'FM') {
            ctcssContainer.style.display = 'block';
            // Set the CTCSS value from track data if available
            if (satTrackData.pl_0 !== undefined) {
                ctcssSelect.value = satTrackData.pl_0.toString();
            }
        } else {
            ctcssContainer.style.display = 'none';
        }
    }

    // Add event listener for transponder selection changes
    transponderSelect.onchange = function() {
        const selectedValue = this.value;
        if (selectedValue) {
            // Send the transponder selection command to the API
            sendSatCommand(`A|${selectedValue}`);
        }
    };

    // Add event listener for CTCSS changes
    ctcssSelect.onchange = function() {
        const selectedValue = this.value;
        sendSatCommand(`h|${selectedValue}`);
    };
    
    // Display frequencies for the active transponder
    const activeFreq = satTrackData.freq.find(f => f.uid === activeFreqId);
    if (activeFreq) {
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
