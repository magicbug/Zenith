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

// Load Cloudlog settings from local storage
function loadCloudlogSettingsFromLocalStorage() {
    const enabledSetting = localStorage.getItem('enableCloudlog');
    if (enabledSetting !== null) {
        enableCloudlog = enabledSetting === 'true';
        document.getElementById('enable-cloudlog').checked = enableCloudlog;
    }

    const url = localStorage.getItem('cloudlogUrl');
    if (url) {
        cloudlogUrl = url;
        document.getElementById('cloudlog-url').value = cloudlogUrl;
    }

    const apiKey = localStorage.getItem('cloudlogApiKey');
    if (apiKey) {
        cloudlogApiKey = apiKey;
        document.getElementById('cloudlog-api-key').value = cloudlogApiKey;
    }
}

// Save Cloudlog settings to local storage
function saveCloudlogSettingsToLocalStorage() {
    localStorage.setItem('enableCloudlog', enableCloudlog.toString());
    localStorage.setItem('cloudlogUrl', cloudlogUrl);
    localStorage.setItem('cloudlogApiKey', cloudlogApiKey);
}

// Send data to Cloudlog API
async function sendToCloudlog(data) {
    if (!enableCloudlog || !cloudlogUrl || !cloudlogApiKey) {
        console.log('Cloudlog API is not configured');
        return;
    }

    const proxyUrl = '/api/cloudlog_proxy.php';
    console.log('Sending request to proxy:', proxyUrl);
    console.log('Request data:', {
        key: cloudlogApiKey,
        radio: "Zenith Satellite Tracker",
        ...data,
        cloudlog_url: cloudlogUrl
    });

    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                key: cloudlogApiKey,
                radio: "Zenith Satellite Tracker",
                ...data,
                cloudlog_url: cloudlogUrl
            })
        });

        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response text:', responseText);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = JSON.parse(responseText);
        console.log('Cloudlog API response:', result);
    } catch (error) {
        console.error('Error sending data to Cloudlog:', error);
    }
}

// Update Cloudlog when frequencies or modes change
function updateCloudlogData() {
    if (!enableCloudlog) return;

    const uplinkFreq = document.getElementById('sat-uplink-freq')?.textContent;
    const downlinkFreq = document.getElementById('sat-downlink-freq')?.textContent;
    const uplinkMode = document.getElementById('sat-uplink-mode')?.textContent;
    const downlinkMode = document.getElementById('sat-downlink-mode')?.textContent;
    const satelliteName = document.getElementById('info-satellite-name')?.textContent;

    console.log('Raw frequency values:', {
        uplinkFreq,
        downlinkFreq,
        uplinkMode,
        downlinkMode,
        satelliteName
    });

    // Validate frequencies and modes
    if (!uplinkFreq || !downlinkFreq || !uplinkMode || !downlinkMode || !satelliteName ||
        uplinkFreq === '---' || downlinkFreq === '---' ||
        uplinkMode === '---' || downlinkMode === '---' ||
        satelliteName === 'Satellite Info') {
        console.log('Invalid frequency, mode, or satellite data, skipping Cloudlog update');
        return;
    }

    // Convert MHz to Hz
    // Remove MHz suffix and any spaces, then convert to number
    const uplinkFreqMHz = parseFloat(uplinkFreq.replace('MHz', '').trim());
    const downlinkFreqMHz = parseFloat(downlinkFreq.replace('MHz', '').trim());

    console.log('Parsed frequency values (MHz):', {
        uplinkFreqMHz,
        downlinkFreqMHz
    });

    // Convert MHz to Hz (multiply by 1,000,000)
    const uplinkFreqHz = Math.round(uplinkFreqMHz * 1000000);
    const downlinkFreqHz = Math.round(downlinkFreqMHz * 1000000);

    console.log('Converted frequency values (Hz):', {
        uplinkFreqHz,
        downlinkFreqHz
    });

    // Validate frequency conversion
    if (isNaN(uplinkFreqHz) || isNaN(downlinkFreqHz)) {
        console.log('Invalid frequency values, skipping Cloudlog update');
        return;
    }

    // Calculate satmode based on frequency bands
    let satmode = '';
    
    // Define frequency band boundaries in Hz
    const VHF_MAX = 300000000;  // 300 MHz
    const UHF_MAX = 1000000000;
    const L_BAND_MAX = 2000000000; // 2 GHz
    const S_BAND_MAX = 4000000000; // 4 GHz
    const C_BAND_MAX = 8000000000; // 8 GHz
    const X_BAND_MAX = 12000000000; // 12 GHz

    // Determine uplink band
    let uplinkBand = '';
    if (uplinkFreqHz <= VHF_MAX) {
        uplinkBand = 'V';
    } else if (uplinkFreqHz <= UHF_MAX) {
        uplinkBand = 'U';
    } else if (uplinkFreqHz <= L_BAND_MAX) {
        uplinkBand = 'L';
    } else if (uplinkFreqHz <= S_BAND_MAX) {
        uplinkBand = 'S';
    } else if (uplinkFreqHz <= C_BAND_MAX) {
        uplinkBand = 'C';
    } else if (uplinkFreqHz <= X_BAND_MAX) {
        uplinkBand = 'X';
    } else {
        uplinkBand = 'K';
    }

    // Determine downlink band
    let downlinkBand = '';
    if (downlinkFreqHz <= VHF_MAX) {
        downlinkBand = 'V';
    } else if (downlinkFreqHz <= UHF_MAX) {
        downlinkBand = 'U';
    } else if (downlinkFreqHz <= L_BAND_MAX) {
        downlinkBand = 'L';
    } else if (downlinkFreqHz <= S_BAND_MAX) {
        downlinkBand = 'S';
    } else if (downlinkFreqHz <= C_BAND_MAX) {
        downlinkBand = 'C';
    } else if (downlinkFreqHz <= X_BAND_MAX) {
        downlinkBand = 'X';
    } else {
        downlinkBand = 'K';
    }

    // Combine bands for satmode
    satmode = `${uplinkBand}/${downlinkBand}`;

    console.log('Calculated satmode:', {
        uplinkBand,
        downlinkBand,
        satmode
    });

    const data = {
        key: cloudlogApiKey,
        radio: "Zenith Satellite Tracker",
        frequency: uplinkFreqHz.toString(),
        mode: uplinkMode,
        frequency_rx: downlinkFreqHz.toString(),
        mode_rx: downlinkMode,
        prop_mode: "SAT",
        sat_name: satelliteName
    };

    console.log('Final data being sent to Cloudlog:', data);
    sendToCloudlog(data);
}

// Add Cloudlog event listeners
document.addEventListener('DOMContentLoaded', () => {

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

    // Add event listeners for CSN S.A.T panel updates
    const satPanelContent = document.getElementById('sat-panel-content');
    if (satPanelContent) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    // Check if the change was in frequency or mode elements
                    const target = mutation.target;
                    if (target.id && (
                        target.id === 'sat-uplink-freq' ||
                        target.id === 'sat-downlink-freq' ||
                        target.id === 'sat-uplink-mode' ||
                        target.id === 'sat-downlink-mode'
                    )) {
                        updateCloudlogData();
                    }
                }
            });
        });

        observer.observe(satPanelContent, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
});