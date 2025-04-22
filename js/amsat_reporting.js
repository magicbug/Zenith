// AMSAT Status Reporting
function initAmsatStatusReporting() {
    const amsatButton = document.getElementById('amsat-status-button');
    const amsatDialog = document.getElementById('amsat-status-dialog');
    const amsatClose = document.querySelector('.amsat-close');
    const amsatSubmit = document.getElementById('submit-amsat-status');
    const amsatSatelliteName = document.getElementById('amsat-satellite-name');
    const amsatStatusSelect = document.getElementById('amsat-status-select');
    const amsatCallsign = document.getElementById('amsat-callsign');
    const amsatGridsquare = document.getElementById('amsat-gridsquare');
    const amsatTime = document.getElementById('amsat-time');
    const amsatMessage = document.getElementById('amsat-status-message');

    // Convert lat/long to Maidenhead grid square
    function getGridSquare(lat, lon) {
        // Ensure lat/lon are within valid ranges
        lat = Math.max(-90, Math.min(90, lat));
        lon = Math.max(-180, Math.min(180, lon));
        
        // Convert to positive values
        lat += 90;
        lon += 180;
        
        // Calculate first two letters
        const field1 = Math.floor(lon / 20);
        const field2 = Math.floor(lat / 10);
        const square1 = Math.floor((lon % 20) / 2);
        const square2 = Math.floor(lat % 10);
        
        // Calculate subsquare
        const subsquare1 = Math.floor((lon % 2) * 12);
        const subsquare2 = Math.floor((lat % 1) * 24);
        
        // Convert to characters
        const grid = String.fromCharCode(65 + field1) + 
                    String.fromCharCode(65 + field2) + 
                    square1 + 
                    square2 + 
                    String.fromCharCode(97 + subsquare1) + 
                    String.fromCharCode(97 + subsquare2);
        
        return grid;
    }

    // Update time display
    function updateTime() {
        const now = new Date();
        amsatTime.textContent = now.toISOString().replace('T', ' ').substring(0, 19);
    }

    // Show dialog
    amsatButton.addEventListener('click', () => {
        const satelliteName = document.getElementById('info-satellite-name').textContent;
        if (!satelliteName || satelliteName === 'Satellite Info') {
            amsatMessage.textContent = 'Please select a satellite first';
            amsatMessage.className = 'status-message error';
            return;
        }

        // Get observer data from localStorage
        const observerData = JSON.parse(localStorage.getItem('observer'));
        if (!observerData || !observerData.callsign) {
            amsatMessage.textContent = 'Please set your callsign and location in the Options menu first';
            amsatMessage.className = 'status-message error';
            return;
        }

        // Set callsign and grid square
        amsatCallsign.value = observerData.callsign;
        amsatGridsquare.textContent = getGridSquare(observerData.latitude, observerData.longitude);

        amsatSatelliteName.textContent = satelliteName;
        updateTime();
        amsatDialog.style.display = 'block';
    });

    // Close dialog
    amsatClose.addEventListener('click', () => {
        amsatDialog.style.display = 'none';
        amsatMessage.textContent = '';
        amsatMessage.className = '';
    });

    // Submit report
    amsatSubmit.addEventListener('click', () => {
        const observerData = JSON.parse(localStorage.getItem('observer'));
        if (!observerData || !observerData.callsign) {
            amsatMessage.textContent = 'Please set your callsign and location in the Options menu first';
            amsatMessage.className = 'status-message error';
            return;
        }

        const reportData = {
            satelliteName: amsatSatelliteName.textContent,
            status: amsatStatusSelect.value,
            timeOn: amsatTime.textContent,
            stationCallsign: observerData.callsign,
            myGridsquare: amsatGridsquare.textContent
        };

        uploadAmsatStatus(reportData)
            .then(() => {
                amsatMessage.textContent = 'Status report submitted successfully';
                amsatMessage.className = 'status-message success';
                setTimeout(() => {
                    amsatDialog.style.display = 'none';
                    amsatMessage.textContent = '';
                    amsatMessage.className = '';
                }, 2000);
            })
            .catch(error => {
                amsatMessage.textContent = `Error submitting report: ${error.message}`;
                amsatMessage.className = 'status-message error';
            });
    });
}

// Initialize AMSAT status reporting when the page loads
document.addEventListener('DOMContentLoaded', initAmsatStatusReporting);

/**
 * Uploads satellite status to AMSAT.org via proxy
 * @param {Object} data Object containing satellite contact data
 * @returns {Promise} Promise that resolves when submission is complete
 */
function uploadAmsatStatus(data) {
    console.log('Uploading AMSAT status:', data);
    
    // Determine satellite name based on AMSAT's naming conventions
    let satName = '';
    
    if (data.satelliteName === 'AO-7') {
        if (data.band === '2m' && data.bandRx === '10m') {
            satName = 'AO-7[A]';
        } else {
            satName = 'AO-7[B]';
        }
        if (data.band === '70cm' && data.bandRx === '2m') {
            satName = 'AO-7[B]';
        } else {
            satName = 'AO-7[B]';
        }
    } else if (data.satelliteName === 'MESAT-1') {
        satName = 'MESAT1';
    } else if (data.satelliteName === 'SONATE-2') {
        satName = 'SONATE-2 APRS';
    } else if (data.satelliteName === 'QO-100') {
        satName = 'QO-100_NB';
    } else if (data.satelliteName === 'AO-92') {
        if (data.band === '70cm' && data.bandRx === '2m') {
            satName = 'AO-92_U/v';
        } else {
            satName = 'AO-92_U/v';
        }
        if (data.band === '23cm' && data.bandRx === '2m') {
            satName = 'AO-92_L/v';
        } else {
            satName = 'AO-92_U/v';
        }
    } else if (data.satelliteName === 'AO-95') {
        if (data.band === '70cm' && data.bandRx === '2m') {
            satName = 'AO-95_U/v';
        } else {
            satName = 'AO-95_U/v';
        }
        if (data.band === '23cm' && data.bandRx === '2m') {
            satName = 'AO-95_L/v';
        } else {
            satName = 'AO-95_U/v';
        }
    } else if (data.satelliteName === 'PO-101') {
        if (data.mode === 'PKT') {
            satName = 'PO-101[APRS]';
        } else {
            satName = 'PO-101[FM]';
        }
    } else if (data.satelliteName === 'FO-118') {
        if (data.band === '2m') {
            if (data.mode === 'FM') {
                satName = 'FO-118[V/u FM]';
            } else if (data.mode === 'SSB') {
                satName = 'FO-118[V/u]';
            } else {
                satName = 'FO-118[V/u FM]';
            }
        } else if (data.band === '15m') {
            satName = 'FO-118[H/u]';
        }
    } else if (data.satelliteName === 'ARISS' || data.satelliteName === 'ISS') {
        if (data.mode === 'FM') {
            satName = 'ISS-FM';
        } else if (data.mode === 'PKT') {
            satName = 'ISS-DATA';
        } else {
            satName = 'ISS-FM';
        }
    } else if (data.satelliteName === 'CAS-3H') {
        satName = 'LilacSat-2';
    } else {
        satName = data.satelliteName;
    }
    
    // Instead of fetching directly from amsat.org, use your own proxy
    return fetch('/api/amsat_status_proxy.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            satName: satName,
            status: data.status,
            date: data.timeOn,
            period: Math.floor((new Date(data.timeOn).getMinutes() - 1) / 15),
            callsign: data.stationCallsign,
            gridSquare: data.myGridsquare
        })
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json().then(data => {
            console.log('Response data:', data);
            if (!response.ok) {
                throw new Error('Failed to submit to AMSAT Status: ' + JSON.stringify(data));
            }
            return data;
        });
    })
    .catch(error => {
        console.error('Error submitting to AMSAT:', error);
        throw error;
    });
}