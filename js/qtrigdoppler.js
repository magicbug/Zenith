class QTRigDopplerPanel {
    constructor() {
        this.panel = document.getElementById('qtrigdoppler-panel');
        this.minimizeBtn = document.getElementById('minimize-qtrigdoppler-panel');
        this.closeBtn = document.getElementById('close-qtrigdoppler-panel');
        this.statusMessage = document.getElementById('qtrigdoppler-status-message');
        this.connectionBadge = document.getElementById('qtrigdoppler-connection-badge');
        this.serverStatusText = document.getElementById('qtrigdoppler-server-status');
        
        // Control elements
        this.startTrackingBtn = document.getElementById('qtrigdoppler-start-tracking');
        this.stopTrackingBtn = document.getElementById('qtrigdoppler-stop-tracking');
        this.satelliteSelect = document.getElementById('qtrigdoppler-satellite');
        this.selectSatelliteBtn = document.getElementById('qtrigdoppler-select-satellite');
        this.refreshSatellitesBtn = document.getElementById('qtrigdoppler-refresh-sats');
        this.transponderSelect = document.getElementById('qtrigdoppler-transponder');
        this.selectTransponderBtn = document.getElementById('qtrigdoppler-select-transponder');
        this.refreshTranspondersBtn = document.getElementById('qtrigdoppler-refresh-transponders');
        this.subtoneSelect = document.getElementById('qtrigdoppler-subtone');
        this.rxOffsetInput = document.getElementById('qtrigdoppler-rxoffset');
        
        // Frequency display elements
        this.downlinkFreqElement = document.getElementById('qtrigdoppler-downlink-freq');
        this.downlinkModeElement = document.getElementById('qtrigdoppler-downlink-mode');
        this.uplinkFreqElement = document.getElementById('qtrigdoppler-uplink-freq');
        this.uplinkModeElement = document.getElementById('qtrigdoppler-uplink-mode');
        this.dopplerElement = document.getElementById('qtrigdoppler-doppler');
        
        // State variables
        this.isMinimized = false;
        this.isDragging = false;
        this.currentX = 0;
        this.currentY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;
        this.subtoneDirty = false;
        this.rxOffsetDirty = false;
        this.transponderDirty = false;
        
        // Tracking current selections to avoid duplicate requests
        this.currentSelectedSatellite = null;
        this.currentSelectedTransponder = null;
        this.currentSelectedSubtone = null;
        
        // Debounce timers
        this.satSelectTimer = null;
        this.transponderSelectTimer = null;
        this.subtoneSelectTimer = null;
        this.rxOffsetTimer = null;
        this.debounceDelay = 300; // 300ms debounce delay
        
        // Load QTRigDoppler settings from localStorage
        const savedSettings = localStorage.getItem('qtrigdopplerSettings');
        this.settings = savedSettings ? JSON.parse(savedSettings) : {
            enableQTRigDoppler: false,
            serverAddress: 'localhost:5000'
        };
        
        // Initialize WebSocket and event listeners
        this.initializeWebSocket();
        this.initializeEventListeners();
    }
    
    initializeWebSocket() {
        if (!this.settings.enableQTRigDoppler || !this.settings.serverAddress) {
            this.updateStatus('QTRigDoppler is disabled or not configured', 'error');
            this.serverStatusText.textContent = 'Disabled';
            return;
        }
        
        try {
            this.socket = io(this.settings.serverAddress);
            
            this.socket.on('connect', () => {
                this.updateStatus('Connected to QTRigDoppler server', 'success');
                this.connectionBadge.classList.add('connected');
                this.serverStatusText.textContent = 'Connected';
                this.enableControls(true);
                
                // Get current status and satellite list when connected, but only once
                this.getStatus();
                this.getSatelliteList();
                
                // Remove the automatic transponder fetching to reduce server load
                // We'll now only fetch transponders when the user explicitly selects a satellite
            });
            
            this.socket.on('disconnect', () => {
                this.updateStatus('Disconnected from QTRigDoppler server', 'error');
                this.connectionBadge.classList.remove('connected');
                this.serverStatusText.textContent = 'Disconnected';
                this.enableControls(false);
            });
            
            this.socket.on('status', (data) => {
                this.handleStatusUpdate(data);
            });
            
            this.socket.on('satellite_list', (data) => {
                this.updateSatelliteDropdown(data.satellites, data.current);
            });
            
            this.socket.on('transponder_list', (data) => {
                this.updateTransponderDropdown(data.transponders, data.current);
            });
            
        } catch (e) {
            console.error('Error creating socket:', e);
            this.updateStatus('Failed to connect to QTRigDoppler server: ' + e.message, 'error');
            this.serverStatusText.textContent = 'Error';
        }
    }
    
    initializeEventListeners() {
        // Panel controls
        this.minimizeBtn.addEventListener('click', () => this.toggleMinimize());
        this.closeBtn.addEventListener('click', () => this.hide());
        
        // Make panel draggable
        const header = this.panel.querySelector('.info-header');
        header.addEventListener('mousedown', (e) => {
            if (e.target === this.minimizeBtn || e.target === this.closeBtn) {
                return;
            }
            this.isDragging = true;
            this.initialX = e.clientX - this.xOffset;
            this.initialY = e.clientY - this.yOffset;
            header.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                e.preventDefault();
                this.currentX = e.clientX - this.initialX;
                this.currentY = e.clientY - this.initialY;
                this.xOffset = this.currentX;
                this.yOffset = this.currentY;
                this.panel.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                const header = this.panel.querySelector('.info-header');
                header.style.cursor = 'grab';
            }
        });
        
        // Control buttons
        this.startTrackingBtn.addEventListener('click', () => this.startTracking());
        this.stopTrackingBtn.addEventListener('click', () => this.stopTracking());
        this.selectSatelliteBtn.addEventListener('click', () => this.selectSatellite(true));
        this.selectTransponderBtn.addEventListener('click', () => this.selectTransponder());
        
        // Refresh buttons
        this.refreshSatellitesBtn.addEventListener('click', () => {
            if (this.socket?.connected) {
                this.satelliteSelect.classList.add('select-loading');
                this.getSatelliteList();
                this.updateStatus('Refreshing satellite list...', 'info');
            } else {
                this.updateStatus('Not connected to server', 'error');
            }
        });
        
        this.refreshTranspondersBtn.addEventListener('click', () => {
            if (this.socket?.connected && this.currentSelectedSatellite) {
                this.getTransponderList();
                this.updateStatus('Refreshing transponder list...', 'info');
            } else if (!this.currentSelectedSatellite) {
                this.updateStatus('Select a satellite first', 'error');
            } else {
                this.updateStatus('Not connected to server', 'error');
            }
        });
        
        // Dropdown change events
        this.satelliteSelect.addEventListener('change', () => {
            // If a satellite is selected, debounce the satellite selection
            if (this.satelliteSelect.value) {
                // Set loading indicator immediately for better UX
                this.satelliteSelect.classList.add('select-loading');
                this.selectSatelliteBtn.disabled = true;
                this.transponderSelect.innerHTML = '<option value="">Loading transponders...</option>';
                this.selectTransponderBtn.disabled = true;
                
                // Clear any existing timer
                if (this.satSelectTimer) {
                    clearTimeout(this.satSelectTimer);
                }
                
                // Set a new timer for debouncing
                this.satSelectTimer = setTimeout(() => {
                    this.selectSatellite(true);
                    this.satSelectTimer = null;
                }, this.debounceDelay);
            } else {
                this.selectSatelliteBtn.disabled = true;
                this.transponderSelect.innerHTML = '<option value="">Select a satellite first...</option>';
                this.selectTransponderBtn.disabled = true;
            }
        });
        
        this.transponderSelect.addEventListener('change', () => {
            // If a transponder is selected, debounce the transponder selection
            if (this.transponderSelect.value) {
                // Set loading indicator immediately for better UX
                this.transponderSelect.classList.add('select-loading');
                this.selectTransponderBtn.disabled = true;
                
                // Clear any existing timer
                if (this.transponderSelectTimer) {
                    clearTimeout(this.transponderSelectTimer);
                }
                
                // Set a new timer for debouncing
                this.transponderSelectTimer = setTimeout(() => {
                    this.selectTransponder();
                    this.transponderSelectTimer = null;
                }, this.debounceDelay);
            } else {
                this.selectTransponderBtn.disabled = true;
            }
            this.transponderDirty = true;
        });
        
        this.subtoneSelect.addEventListener('change', () => {
            this.subtoneDirty = true;
            console.log('Subtone changed to: ' + this.subtoneSelect.value);
            
            // Clear any existing timer
            if (this.subtoneSelectTimer) {
                clearTimeout(this.subtoneSelectTimer);
            }
            
            // Set a new timer for debouncing
            this.subtoneSelectTimer = setTimeout(() => {
                this.setSubtone();
                this.subtoneSelectTimer = null;
            }, this.debounceDelay);
        });
        
        this.rxOffsetInput.addEventListener('input', () => {
            this.rxOffsetDirty = true;
            
            // Clear any existing timer
            if (this.rxOffsetTimer) {
                clearTimeout(this.rxOffsetTimer);
            }
        });
    }
    
    show() {
        this.panel.style.display = 'flex';
        
        // If we're connected and there's a currently selected satellite in the dropdown,
        // fetch its transponders when the panel is opened
        if (this.socket && this.socket.connected && this.satelliteSelect.value) {
            // Always trigger a satellite selection when the panel is opened
            // and a satellite is already selected in the dropdown
            this.selectSatellite(true);
        } else {
            // If not connected or no satellite selected, refresh status
            this.getStatus();
        }
    }
    
    hide() {
        this.panel.style.display = 'none';
    }
    
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.panel.classList.toggle('minimized', this.isMinimized);
        this.minimizeBtn.innerHTML = this.isMinimized ? '+' : '−';
    }
    
    updateStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = 'qtrigdoppler-status ' + type;
    }
    
    enableControls(enabled) {
        this.startTrackingBtn.disabled = !enabled;
        this.stopTrackingBtn.disabled = !enabled;
        this.selectSatelliteBtn.disabled = !enabled || !this.satelliteSelect.value;
        this.selectTransponderBtn.disabled = !enabled || !this.transponderSelect.value;
    }
    
    handleStatusUpdate(data) {
        if (data.error) {
            this.updateStatus(data.error, 'error');
            // Clear loading indicators in case of errors
            this.satelliteSelect.classList.remove('select-loading');
            this.transponderSelect.classList.remove('select-loading');
            return;
        }
        
        // Update tracking state
        const isTracking = data.tracking === true;
        this.startTrackingBtn.disabled = isTracking;
        this.stopTrackingBtn.disabled = !isTracking;
        this.updateStatus(isTracking ? 'Tracking active' : 'Not tracking', isTracking ? 'success' : 'info');
        
        // Update satellite selection
        if (data.satellite && !this.transponderDirty) {
            for (let i = 0; i < this.satelliteSelect.options.length; i++) {
                if (this.satelliteSelect.options[i].value === data.satellite) {
                    this.satelliteSelect.selectedIndex = i;
                    this.selectSatelliteBtn.disabled = false;
                    this.currentSelectedSatellite = data.satellite;
                    break;
                }
            }
            
            // If we have a satellite but no transponders loaded yet, trigger a satellite selection
            // This ensures transponders get loaded when panel is first opened
            if (data.satellite && this.transponderSelect.options.length <= 1) {
                // Use setTimeout to avoid potential loops in socket communication
                setTimeout(() => this.selectSatellite(false), 100);
            }
        }
        
        // Update transponder selection
        if (data.transponder && !this.transponderDirty) {
            for (let i = 0; i < this.transponderSelect.options.length; i++) {
                if (this.transponderSelect.options[i].value === data.transponder) {
                    this.transponderSelect.selectedIndex = i;
                    this.selectTransponderBtn.disabled = false;
                    this.currentSelectedTransponder = data.transponder;
                    break;
                }
            }
        }
        
        // Log the complete data structure to inspect it
        console.log('QTRigDoppler status update received:', JSON.stringify(data, null, 2));

        // Update frequency display - with null checks
        this.updateFrequencyDisplay(data);
        
        // Update subtone
        if (data.subtone && !this.subtoneDirty) {
            for (let i = 0; i < this.subtoneSelect.options.length; i++) {
                if (this.subtoneSelect.options[i].value === data.subtone) {
                    this.subtoneSelect.selectedIndex = i;
                    this.currentSelectedSubtone = data.subtone;
                    break;
                }
            }
        }
        
        // Update RX offset
        if (data.rx_offset !== undefined && !this.rxOffsetDirty) {
            this.rxOffsetInput.value = data.rx_offset;
        }
    }
    
    // Helper method to update frequency display based on server data
    updateFrequencyDisplay(data) {
        // Based on the console output, we know the frequency data is in data.satellite_info
        const satelliteInfo = data.satellite_info || {};
        
        // Get frequency and mode information from satellite_info
        const downlinkFreq = satelliteInfo.downlink_freq;
        const downlinkMode = satelliteInfo.downlink_mode;
        const uplinkFreq = satelliteInfo.uplink_freq;
        const uplinkMode = satelliteInfo.uplink_mode;
        
        // Update the UI elements with frequency data - with null checks
        if (this.downlinkFreqElement) {
            this.downlinkFreqElement.textContent = downlinkFreq ? this.formatFreq(downlinkFreq) : '--';
        }
        
        if (this.downlinkModeElement) {
            this.downlinkModeElement.textContent = downlinkMode || '--';
        }
        
        if (this.uplinkFreqElement) {
            this.uplinkFreqElement.textContent = uplinkFreq ? this.formatFreq(uplinkFreq) : '--';
        }
        
        if (this.uplinkModeElement) {
            this.uplinkModeElement.textContent = uplinkMode || '--';
        }
        
        // We removed the doppler element from HTML, so skip updating it
        // But keep the property check in case we want to add it again later
        if (this.dopplerElement) {
            if (data.doppler) {
                const dopplerText = [];
                if (data.doppler.downlink) dopplerText.push(`Down: ${data.doppler.downlink}`);
                if (data.doppler.uplink) dopplerText.push(`Up: ${data.doppler.uplink}`);
                
                this.dopplerElement.textContent = dopplerText.length > 0 ? dopplerText.join(' | ') : '--';
            } else {
                this.dopplerElement.textContent = '--';
            }
        }
    }
    
    // Format frequency in MHz
    formatFreq(freq) {
        if (typeof freq === 'number') {
            return (freq / 1000000).toFixed(3) + ' MHz';
        }
        return freq;
    }
    
    updateSatelliteDropdown(satellites, currentSatellite) {
        this.satelliteSelect.classList.remove('select-loading');
        
        const currentSelection = this.satelliteSelect.value;
        
        this.satelliteSelect.innerHTML = '<option value="">Select a satellite...</option>';
        
        satellites.forEach(sat => {
            const option = document.createElement('option');
            option.value = sat;
            option.text = sat;
            this.satelliteSelect.add(option);
            
            if (sat === currentSatellite) {
                this.satelliteSelect.value = sat;
                this.selectSatelliteBtn.disabled = false;
            }
        });
        
        if (currentSelection && satellites.includes(currentSelection)) {
            this.satelliteSelect.value = currentSelection;
            this.selectSatelliteBtn.disabled = false;
        }
        
        // Remove the automatic satellite emit to reduce server load
        // We'll let the user click the button to select the satellite instead
    }
    
    updateTransponderDropdown(transponders, currentTransponder) {
        this.transponderSelect.classList.remove('select-loading');
        
        const currentSelection = this.transponderSelect.value;
        
        this.transponderSelect.innerHTML = '<option value="">Select a transponder...</option>';
        
        transponders.forEach(tpx => {
            const option = document.createElement('option');
            option.value = tpx;
            option.text = tpx;
            this.transponderSelect.add(option);
            
            if (tpx === currentTransponder) {
                this.transponderSelect.value = tpx;
                this.selectTransponderBtn.disabled = false;
            }
        });
        
        if (currentSelection && transponders.includes(currentSelection)) {
            this.transponderSelect.value = currentSelection;
            this.selectTransponderBtn.disabled = false;
        }
        
        this.transponderDirty = false;
    }
    
    // Socket emit functions
    getStatus() {
        if (!this.socket?.connected) return;
        this.socket.emit('get_status');
    }
    
    getSatelliteList() {
        if (!this.socket?.connected) return;
        this.socket.emit('get_satellite_list');
    }
    
    getTransponderList(satellite = null) {
        if (!this.socket?.connected) return;
        
        // Use provided satellite or current selected satellite
        const sat = satellite || this.currentSelectedSatellite;
        if (!sat) return;
        
        this.transponderSelect.classList.add('select-loading');
        this.socket.emit('get_transponder_list', { satellite: sat });
    }
    
    startTracking() {
        if (!this.socket?.connected) return;
        this.socket.emit('start_tracking');
        this.startTrackingBtn.disabled = true;
    }
    
    stopTracking() {
        if (!this.socket?.connected) return;
        this.socket.emit('stop_tracking');
        this.stopTrackingBtn.disabled = true;
    }
    
    selectSatellite(fromUserClick = false) {
        if (!this.socket?.connected) return;
        
        const sat = this.satelliteSelect.value;
        if (!sat) return;
        
        // Add tracking to avoid multiple requests for the same satellite
        if (this.currentSelectedSatellite === sat && !fromUserClick) {
            this.satelliteSelect.classList.remove('select-loading');
            return;
        }
        
        // Update current selected satellite
        this.currentSelectedSatellite = sat;
        
        // UI updates and socket emission are the same
        this.satelliteSelect.classList.add('select-loading');
        this.selectSatelliteBtn.disabled = true;
        this.transponderSelect.innerHTML = '<option value="">Loading transponders...</option>';
        
        this.socket.emit('select_satellite', { satellite: sat });
        
        // Only reset subtone and RX Offset if this was triggered by a user click
        if (fromUserClick) {
            // Reset subtone and RX Offset
            this.subtoneSelect.value = 'None';
            this.subtoneDirty = false;
            this.rxOffsetInput.value = 0;
            this.rxOffsetDirty = false;
        }
    }
    
    selectTransponder() {
        if (!this.socket?.connected) return;
        
        const tpx = this.transponderSelect.value;
        if (!tpx) return;
        
        // Add tracking to avoid multiple requests for the same transponder
        if (this.currentSelectedTransponder === tpx) {
            this.transponderSelect.classList.remove('select-loading');
            return;
        }
        
        // Update current selected transponder
        this.currentSelectedTransponder = tpx;
        
        // UI updates and socket emission
        this.transponderSelect.classList.add('select-loading');
        this.selectTransponderBtn.disabled = true;
        this.socket.emit('select_transponder', { transponder: tpx });
        this.transponderDirty = false;
    }
    
    setSubtone() {
        if (!this.socket?.connected) {
            console.error('Cannot set subtone: Socket not connected');
            return;
        }
        
        const tone = this.subtoneSelect.value;
        console.log('Emitting set_subtone with value:', tone);
        
        // Check if this is the same subtone we already have set
        if (this.currentSelectedSubtone === tone) {
            console.log('Skipping subtone update - already set to', tone);
            this.subtoneDirty = false;
            return;
        }
        
        try {
            this.socket.emit('set_subtone', { subtone: tone });
            this.updateStatus('Sending subtone: ' + tone, 'info');
            this.currentSelectedSubtone = tone; // Track the currently selected subtone
        } catch (error) {
            console.error('Error sending subtone:', error);
            this.updateStatus('Error setting subtone', 'error');
        }
        
        this.subtoneDirty = false;
    }
    
    setRxOffset() {
        if (!this.socket?.connected) return;
        const offset = parseInt(this.rxOffsetInput.value, 10);
        this.socket.emit('set_rx_offset', { offset: offset });
        this.rxOffsetDirty = false;
    }
    
    resetRxOffset() {
        this.rxOffsetInput.value = 0;
        this.rxOffsetDirty = false;
        this.setRxOffset();
    }
    
    adjustRxOffset(amount) {
        const current = parseInt(this.rxOffsetInput.value, 10) || 0;
        this.rxOffsetInput.value = current + amount;
        this.rxOffsetDirty = true;
        this.setRxOffset();
    }
}

// Initialize QTRigDoppler panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.qtrigdopplerPanel = new QTRigDopplerPanel();
    
    // Add button to header
    const openQTRigDopplerBtn = document.createElement('button');
    openQTRigDopplerBtn.id = 'open-qtrigdoppler';
    openQTRigDopplerBtn.className = 'options-button';
    openQTRigDopplerBtn.textContent = 'QTRigDoppler';
    openQTRigDopplerBtn.addEventListener('click', () => {
        if (window.qtrigdopplerPanel.settings.enableQTRigDoppler) {
            window.qtrigdopplerPanel.show();
        } else {
            alert('QTRigDoppler is not enabled. Please check your settings in the Options panel under the Radio tab.');
            const optionsModal = document.getElementById('options-modal');
            if (optionsModal) {
                optionsModal.style.display = 'block';
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                const radioTabButton = document.querySelector('.tab-button[data-tab="radio"]');
                if (radioTabButton) {
                    radioTabButton.classList.add('active');
                    document.getElementById('radio-tab').classList.add('active');
                }
            }
        }
    });
    
    const headerButtons = document.querySelector('.header-buttons');
    if (headerButtons) {
        headerButtons.appendChild(openQTRigDopplerBtn);
    }
    
    // Automatically open the panel if it's enabled in localStorage
    if (window.qtrigdopplerPanel.settings.enableQTRigDoppler === true) {
        // Small delay to ensure everything is properly initialized
        setTimeout(() => {
            window.qtrigdopplerPanel.show();
        }, 500);
    }
});

// Global functions to handle RX offset buttons
function setQTRigDopplerRxOffset() {
    if (window.qtrigdopplerPanel) {
        window.qtrigdopplerPanel.setRxOffset();
    }
}

function resetQTRigDopplerRxOffset() {
    if (window.qtrigdopplerPanel) {
        window.qtrigdopplerPanel.resetRxOffset();
    }
}

function adjustQTRigDopplerRxOffset(amount) {
    if (window.qtrigdopplerPanel) {
        window.qtrigdopplerPanel.adjustRxOffset(amount);
    }
} 