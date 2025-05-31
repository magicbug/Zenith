// Partner View Feature for Zenith
// Handles modal, overlay, and elevation calculation for a partner's location

(function() {
    // Utility: Maidenhead grid to lat/lon (center)
    function gridToLatLon(grid) {
        // Basic 4/6/8 char Maidenhead conversion
        if (!grid || typeof grid !== 'string' || grid.length < 4) return null;
        grid = grid.toUpperCase();
        let lon = (grid.charCodeAt(0) - 65) * 20 - 180;
        let lat = (grid.charCodeAt(1) - 65) * 10 - 90;
        lon += parseInt(grid[2]) * 2;
        lat += parseInt(grid[3]) * 1;
        if (grid.length >= 6) {
            lon += (grid.charCodeAt(4) - 65) * 5 / 60;
            lat += (grid.charCodeAt(5) - 65) * 2.5 / 60;
        }
        if (grid.length >= 8) {
            lon += parseInt(grid[6]) * 5 / 600;
            lat += parseInt(grid[7]) * 2.5 / 600;
        }
        // Center of the square
        lon += 1;
        lat += 0.5;
        return { lat, lon };
    }

    // DOM Elements
    const openBtn = document.getElementById('open-partner-view');
    const modal = document.getElementById('partner-view-modal');
    const closeModalBtn = modal.querySelector('.partner-view-close');
    const cancelBtn = document.getElementById('cancel-partner-view');
    const showBtn = document.getElementById('show-partner-on-map');
    const gridInput = document.getElementById('partner-grid');
    const labelInput = document.getElementById('partner-label');
    const errorDiv = document.getElementById('partner-view-error');
    const overlay = document.getElementById('partner-elevation-overlay');
    const overlayLabel = document.getElementById('partner-overlay-label');
    const overlayGrid = document.getElementById('partner-overlay-grid');
    const overlayElevation = document.getElementById('partner-overlay-elevation');
    const closeOverlayBtn = document.getElementById('close-partner-overlay');

    let partnerLocation = null;
    let partnerLabel = '';
    let updateInterval = null;

    // Modal open/close
    openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        errorDiv.textContent = '';
        gridInput.value = '';
        labelInput.value = '';
    });
    closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Overlay close
    closeOverlayBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
        partnerLocation = null;
        if (updateInterval) clearInterval(updateInterval);
    });

    // Show on Map logic
    showBtn.addEventListener('click', () => {
        const grid = gridInput.value.trim();
        const label = labelInput.value.trim();
        const loc = gridToLatLon(grid);
        if (!loc) {
            errorDiv.textContent = 'Invalid grid square.';
            return;
        }
        partnerLocation = loc;
        partnerLabel = label || 'Partner';
        overlayLabel.textContent = partnerLabel;
        overlayGrid.textContent = grid.toUpperCase();
        overlay.style.display = 'block';
        modal.style.display = 'none';
        errorDiv.textContent = '';
        updatePartnerElevation();
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(updatePartnerElevation, 2000); // update every 2s
    });

    // Elevation calculation using satellite.js
    function updatePartnerElevation() {
        if (!partnerLocation) return;
        let satrec = null;
        if (window.selectedSatellite && window.tleData && window.tleData[window.selectedSatellite]) {
            satrec = window.tleData[window.selectedSatellite].satrec;
        } else if (window.satrec) {
            satrec = window.satrec;
        }
        if (!satrec || typeof satellite === 'undefined') {
            console.log('No satrec or satellite.js not loaded');
            overlayElevation.textContent = '--';
            return;
        }
        const now = new Date();
        const gmst = satellite.gstime(now);
        const eci = satellite.propagate(satrec, now);
        if (!eci.position) {
            console.log('No ECI position for satellite');
            overlayElevation.textContent = '--';
            return;
        }
        const observerGd = {
            longitude: partnerLocation.lon * Math.PI / 180,
            latitude: partnerLocation.lat * Math.PI / 180,
            height: 0 // meters
        };
        try {
            const lookAngles = satellite.ecfToLookAngles(
                observerGd,
                satellite.eciToEcf(eci.position, gmst)
            );
            const elevation = lookAngles.elevation * 180 / Math.PI;
            console.log('Partner overlay elevation:', elevation);
            if (isNaN(elevation)) {
                overlayElevation.textContent = '--';
            } else {
                overlayElevation.textContent = elevation.toFixed(1);
            }
        } catch (err) {
            console.log('Error calculating partner overlay elevation:', err);
            overlayElevation.textContent = '--';
        }
    }
})(); 