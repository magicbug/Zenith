document.addEventListener('DOMContentLoaded', () => {    
    // Initial delay ensures DOM is fully loaded before checking for satellites
    setTimeout(initializeCsnTracking, 1000);
});

// Replace transponder description with a select element
document.addEventListener('DOMContentLoaded', () => {
    const transponderDesc = document.getElementById('sat-transponder-desc');
    if (transponderDesc) {
        const transponderSelectContainer = document.createElement('div');
        transponderSelectContainer.className = 'sat-transponder-select-container';
        
        const transponderSelect = document.createElement('select');
        transponderSelect.id = 'sat-transponder-select';
        transponderSelect.className = 'sat-transponder-select';
        transponderSelect.innerHTML = '<option value="">Loading transponders...</option>';
        
        transponderSelectContainer.appendChild(transponderSelect);
        transponderDesc.parentNode.replaceChild(transponderSelectContainer, transponderDesc);
    }
    
});

// Check if S.A.T API is available through our proxy
function checkSATAPIAvailability() {
    if (!enableCsnSat || !csnSatAddress) {
        satAPIAvailable = false;
        return Promise.resolve(false);
    }

    // Remove trailing slash from address if present
    csnSatAddress = csnSatAddress.replace(/\/+$/, '');

    console.log('Checking CSN S.A.T API availability through proxy for:', csnSatAddress);
    
    // Using PHP proxy to avoid CORS issues
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
            
            showSATPanel("S.A.T API is available and ready", "success");
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
        return Promise.resolve(false);
    }

    // Store pending selection to handle race conditions in UI updates
    window.pendingSatSelection = satName;
    
    console.log('Selecting satellite for S.A.T through proxy:', satName);
    
    const proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=select&satellite=${encodeURIComponent(satName)}`;
    
    showSATPanel(`Selecting satellite: ${satName}...`);
    
    // Set timeout to prevent indefinite waiting
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    return fetch(proxyUrl, {
        signal: controller.signal
    })
    .then(response => {
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        window.pendingSatSelection = null;
        
        console.log('S.A.T selection response:', data);
        
        if (data.success) {
            currentSelectedSatelliteForSAT = satName;
            
            showSATPanel(`Satellite selected: ${satName}`, 'success');
            updateSATSelectedSatellite(satName);
            return true;
        } else {
            console.error('S.A.T API selection error:', data.error);
            
            // Prevent UI updates if user has switched to a different satellite
            if (window.pendingSatSelection === satName || !window.pendingSatSelection) {
                showSATPanel(`Failed to select satellite: ${satName}. Error: ${data.error}`, 'error');
            } else {
                console.log(`Not showing error for ${satName} because user has selected ${window.pendingSatSelection}`);
            }
            
            return false;
        }
    })
    .catch(error => {
        window.pendingSatSelection = null;
        
        if (error.name === 'AbortError') {
            console.error(`Selection timeout for satellite ${satName}`);
            showSATPanel(`Connection to S.A.T timed out. Please check your network and controller.`, 'error');
        } else {
            console.error('Error selecting satellite for S.A.T:', error);
            showSATPanel(`Error selecting satellite: ${error.message}`, 'error');
        }
        
        return false;
    });
}

// Show/hide the S.A.T panel
function showSATPanel(message, status = 'pending') {
    const satPanel = document.getElementById('sat-panel');
    const satPanelContent = document.getElementById('sat-panel-content');
    
    let statusElement = satPanelContent.querySelector('#sat-status-message');
    if (!statusElement) {
        statusElement = document.getElementById('sat-status-message');
    }
    
    if (statusElement) {
        statusElement.className = `sat-status ${status}`;
        statusElement.textContent = message;
    }
    
    // Update connection status in header
    const connectionBadge = document.getElementById('sat-connection-badge');
    if (connectionBadge) {
        connectionBadge.textContent = satAPIAvailable ? 'Connected' : 'Not Connected';
        connectionBadge.className = satAPIAvailable ? 'status-badge status-connected' : 'status-badge status-error';
    }
    
    satPanel.style.display = 'flex';
    startSatTrackPolling();
}

// Update the selected satellite in the S.A.T panel
function updateSATSelectedSatellite(satName) {
    const satPanelContent = document.getElementById('sat-panel-content');
    
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
    stopSatTrackPolling();
}

// Initialize S.A.T control buttons with event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('close-sat-panel').addEventListener('click', closeSATPanel);
    
    document.getElementById('enable-csn-sat').addEventListener('change', function() {
        enableCsnSat = this.checked;
        saveCsnSatSettingsToLocalStorage();
        updateSatPanelButtonVisibility();
        
        if (enableCsnSat && csnSatAddress) {
            checkSATAPIAvailability();
        }
    });
    
    document.getElementById('csn-sat-address').addEventListener('input', function() {
        csnSatAddress = this.value.trim().replace(/\/+$/, ''); // Trim and remove trailing slashes
        saveCsnSatSettingsToLocalStorage();
    });
});

// Initialize S.A.T control buttons with event listeners
function initSatControlButtons() {
    // Radio toggle button
    const radioToggleBtn = document.getElementById('sat-radio-toggle');
    if (radioToggleBtn) {
        let radioEnabled = true;
        
        radioToggleBtn.addEventListener('click', () => {
            radioEnabled = !radioEnabled;
            
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
        let vfoLocked = true;
        
        lockVfoBtn.addEventListener('click', () => {
            vfoLocked = !vfoLocked;
            
            if (vfoLocked) {
                lockVfoBtn.textContent = 'Lock VFO';
                lockVfoBtn.classList.remove('sat-disabled');
                lockVfoBtn.classList.add('sat-enabled');
            } else {
                lockVfoBtn.textContent = 'Unlock VFO';
                lockVfoBtn.classList.remove('sat-enabled');
                lockVfoBtn.classList.add('sat-disabled');
            }
            
            sendSatCommand('v');
        });
    }
    
    // Center transponder button
    const centerBtn = document.getElementById('sat-center');
    if (centerBtn) {
        centerBtn.addEventListener('click', () => {
            sendSatCommand('d');
            
            // Visual feedback for button press
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
            if (confirm('This will park the antennas and stop tracking the current satellite. Continue?')) {
                sendSatCommand('z');
                
                // Visual feedback for button press
                parkBtn.classList.add('button-pressed');
                setTimeout(() => {
                    parkBtn.classList.remove('button-pressed');
                }, 200);
                
                updateSATSelectedSatellite('None - Antennas Parked');
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
    showSATPanel(`Sending command...`);
    
    let proxyUrl;
    
    // Handle special format for transponder selection vs simple commands
    if (command.startsWith('A|')) {
        proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=cmd&command=${encodeURIComponent(command)}`;
    } else {
        proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=cmd&command=${command}`;
    }
    
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
            if (command.startsWith('A|')) {
                showSATPanel('Transponder changed successfully', 'success');
            } else {
                showSATPanel('Command sent successfully', 'success');
            }
            
            // Fetch updated tracking data to reflect changes
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

let satTrackInterval = null; // Interval for polling tracking data
let satTrackData = null; // Current tracking data
const SAT_TRACK_POLL_INTERVAL = 3000; // Poll every 3 seconds

// Start polling for tracking data
function startSatTrackPolling() {
    if (satTrackInterval) {
        clearInterval(satTrackInterval);
    }
    
    fetchSatTrackData();
    satTrackInterval = setInterval(fetchSatTrackData, SAT_TRACK_POLL_INTERVAL);
}

// Stop polling for tracking data
function stopSatTrackPolling() {
    if (satTrackInterval) {
        clearInterval(satTrackInterval);
        satTrackInterval = null;
    }
}

// Fetch tracking data from the S.A.T system
function fetchSatTrackData() {
    if (!enableCsnSat || !csnSatAddress || !satAPIAvailable) {
        return;
    }
    
    const proxyUrl = `api/sat_proxy.php?address=${encodeURIComponent(csnSatAddress)}&action=track`;
    
    fetch(proxyUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        // Clone the response to log the raw text before parsing as JSON
        const clonedResponse = response.clone();
        clonedResponse.text().then(text => {
            console.log('Raw S.A.T tracking response:', text);
        });
        return response.json();
    })
    .then(result => {
        if (result.data) {
            satTrackData = result.data;
            updateSatRotatorDisplay();
            
            // Update selected satellite if changed
            if (satTrackData.satname && satTrackData.satname.trim() !== '') {
                if (satTrackData.satname !== currentSelectedSatelliteForSAT) {
                    currentSelectedSatelliteForSAT = satTrackData.satname;
                    updateSATSelectedSatellite(satTrackData.satname);
                    
                    // Synchronize S.A.T selection with main app if satellite exists in TLE data
                    if (window.tleData && window.tleData[satTrackData.satname]) {
                        if (!window.satHighlightedFromCSN) {
                            if (typeof window.showSatelliteInfo === 'function') {
                                window.showSatelliteInfo(satTrackData.satname);
                            }
                            
                            // Try MapD3 first, fall back to app's highlight function
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
            
            console.log('Updated S.A.T tracking data:', satTrackData);
        } else if (result.error) {
            console.error('S.A.T tracking error:', result.error);
        }
    })
    .catch(error => {
        console.error('Error fetching S.A.T tracking data:', error);
    });
}

// Initialize CSN tracking
function initializeCsnTracking() {
    if (enableCsnSat && csnSatAddress) {
        checkSATAPIAvailability()
            .then(available => {
                if (available) {
                    fetchSatTrackData();
                    window.satHighlightedFromCSN = false;
                }
            });
    }
}

// Update the rotator display with current azimuth and elevation
function updateSatRotatorDisplay() {
    if (!satTrackData) return;
    
    const azElement = document.getElementById('sat-current-az');
    const elElement = document.getElementById('sat-current-el');
    
    if (azElement && satTrackData.az !== undefined) {
        azElement.textContent = Math.round(satTrackData.az) + "°";
    }
    
    if (elElement && satTrackData.el !== undefined) {
        elElement.textContent = Math.round(satTrackData.el) + "°";
    }
    
    if (satTrackData.satname) {
        updateSATSelectedSatellite(satTrackData.satname);
    }
    
    updateTransponderInfo();
}

// Update the transponder info display
function updateTransponderInfo() {
    if (!satTrackData) return;
    
    const transponderSelect = document.getElementById('sat-transponder-select');
    const uplinkFreq = document.getElementById('sat-uplink-freq');
    const downlinkFreq = document.getElementById('sat-downlink-freq');
    const uplinkMode = document.getElementById('sat-uplink-mode');
    const downlinkMode = document.getElementById('sat-downlink-mode');
    const ctcssContainer = document.getElementById('sat-ctcss-container');
    const ctcssSelect = document.getElementById('sat-ctcss-select');
    
    if (!satTrackData.freq || !Array.isArray(satTrackData.freq)) {
        if (transponderSelect) {
            transponderSelect.innerHTML = '<option value="">No transponder data available</option>';
            transponderSelect.disabled = true;
        }
        return;
    }
    
    const activeFreqId = satTrackData.afreq;
    
    transponderSelect.innerHTML = '';
    transponderSelect.disabled = false;
    
    // Sort transponders for consistent display
    const sortedFreqs = [...satTrackData.freq].sort((a, b) => {
        if (a.sort !== undefined && b.sort !== undefined) {
            return a.sort - b.sort;
        }
        return a.uid - b.uid;
    });
    
    sortedFreqs.forEach(freq => {
        const option = document.createElement('option');
        option.value = freq.uid;
        option.textContent = freq.descr.trim();
        option.selected = freq.uid === activeFreqId;
        transponderSelect.appendChild(option);
    });
    
    // Show CTCSS selector only for FM uplink modes
    if (activeFreqId) {
        const activeFreq = satTrackData.freq.find(f => f.uid === activeFreqId);
        if (activeFreq && activeFreq.upMode.trim() === 'FM') {
            ctcssContainer.style.display = 'block';
            if (satTrackData.pl_0 !== undefined) {
                ctcssSelect.value = satTrackData.pl_0.toString();
            }
        } else {
            ctcssContainer.style.display = 'none';
        }
    }

    transponderSelect.onchange = function() {
        const selectedValue = this.value;
        if (selectedValue) {
            sendSatCommand(`A|${selectedValue}`);
        }
    };

    ctcssSelect.onchange = function() {
        const selectedValue = this.value;
        sendSatCommand(`h|${selectedValue}`);
    };
    
    const activeFreq = satTrackData.freq.find(f => f.uid === activeFreqId);
    if (activeFreq) {
        // Calculate uplink frequency with offset and Doppler correction
        if (activeFreq.upFreq > 0) {
            const offsetHz = activeFreq.off_up || 0;
            const dopplerHz = activeFreq.dop_up || 0;
            const totalUplinkHz = activeFreq.upFreq + offsetHz + dopplerHz;
            const totalUplinkMHz = (totalUplinkHz / 1000000).toFixed(4);
            
            uplinkFreq.textContent = `${totalUplinkMHz} MHz`;
            uplinkMode.textContent = activeFreq.upMode.trim() || "---";
        } else {
            uplinkFreq.textContent = "---";
            uplinkMode.textContent = "---";
        }
        
        // Calculate downlink frequency with offset and Doppler correction
        if (activeFreq.downFreq > 0) {
            const offsetHz = activeFreq.off_down || 0;
            const dopplerHz = activeFreq.dop_down || 0;
            const totalDownlinkHz = activeFreq.downFreq + offsetHz + dopplerHz;
            const totalDownlinkMHz = (totalDownlinkHz / 1000000).toFixed(4);
            
            downlinkFreq.textContent = `${totalDownlinkMHz} MHz`;
            downlinkMode.textContent = activeFreq.downMode.trim() || "---";
        } else {
            downlinkFreq.textContent = "---";
            downlinkMode.textContent = "---";
        }
    } else {
        uplinkFreq.textContent = "---";
        downlinkFreq.textContent = "---";
        uplinkMode.textContent = "---";
        downlinkMode.textContent = "---";
    }
}

// Update the button states based on the tracking data
function updateSatButtonStates() {
    if (!satTrackData) return;
    
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

// CSS for status indicator
document.addEventListener('DOMContentLoaded', () => {
    // CSS for status indicator
    const style = document.createElement('style');
    style.textContent = `
        #sat-status-indicator {
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 12px;
            margin-left: 10px;
            display: inline-block;
        }
        .status-connected {
            background-color: #4CAF50;
            color: white;
        }
        .status-error {
            background-color: #f44336;
            color: white;
        }
        .status-connecting {
            background-color: #2196F3;
            color: white;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
        }
    `;
    document.head.appendChild(style);
});
