class QTRigDopplerPanel {
    constructor() {
        this.initializeElements();
        this.initializeState();
        this.initializeWebSocket();
        this.initializeEventListeners();
    }

    initializeElements() {
        // Panel elements
        this.panel = document.getElementById('qtrigdoppler-panel');
        this.minimizeBtn = document.getElementById('minimize-qtrigdoppler-panel');
        this.closeBtn = document.getElementById('close-qtrigdoppler-panel');
        this.configureBtn = document.getElementById('configure-server');
        this.statusMessage = document.getElementById('qtrigdoppler-status-message');
        this.connectionBadge = document.getElementById('qtrigdoppler-connection-badge');
        this.serverStatusText = document.getElementById('qtrigdoppler-server-status');

        // Control elements
        this.startTrackingBtn = document.getElementById('qtrigdoppler-start-tracking');
        this.stopTrackingBtn = document.getElementById('qtrigdoppler-stop-tracking');
        this.getStatusBtn = document.getElementById('qtrigdoppler-get-status');
        this.satelliteSelect = document.getElementById('qtrigdoppler-satellite');
        this.selectSatelliteBtn = document.getElementById('qtrigdoppler-select-satellite');
        this.refreshSatellitesBtn = document.getElementById('qtrigdoppler-refresh-sats');
        this.transponderSelect = document.getElementById('qtrigdoppler-transponder');
        this.selectTransponderBtn = document.getElementById('qtrigdoppler-select-transponder');
        this.refreshTranspondersBtn = document.getElementById('qtrigdoppler-refresh-transponders');
        this.subtoneSelect = document.getElementById('qtrigdoppler-subtone');
        this.rxOffsetInput = document.getElementById('qtrigdoppler-rxoffset');
        
        // Rotator controls
        this.parkRotatorBtn = document.getElementById('qtrigdoppler-park-rotator');
        this.stopRotatorBtn = document.getElementById('qtrigdoppler-stop-rotator');

        // Frequency display elements
        this.downlinkFreqElement = document.getElementById('qtrigdoppler-downlink-freq');
        this.downlinkModeElement = document.getElementById('qtrigdoppler-downlink-mode');
        this.uplinkFreqElement = document.getElementById('qtrigdoppler-uplink-freq');
        this.uplinkModeElement = document.getElementById('qtrigdoppler-uplink-mode');
        this.dopplerElement = document.getElementById('qtrigdoppler-doppler');
    }

    initializeState() {
        // Panel state
        this.isMinimized = false;
        this.isDragging = false;
        this.currentX = 0;
        this.currentY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;

        // Selection tracking
        this.currentSelectedSatellite = null;
        this.currentSelectedTransponder = null;
        this.currentSelectedSubtone = null;

        // Dirty flags
        this.satelliteDirty = false;
        this.transponderDirty = false;
        this.subtoneDirty = false;
        this.rxOffsetDirty = false;

        // Load settings from localStorage
        const savedSettings = localStorage.getItem('qtrigdopplerSettings');
        this.settings = savedSettings ? JSON.parse(savedSettings) : {
            enableQTRigDoppler: false,
            serverAddress: 'http://localhost:5001'
        };

        this.satelliteListLoaded = false;
    }

    initializeWebSocket() {
        if (!this.settings.enableQTRigDoppler || !this.settings.serverAddress) {
            this.updateStatus('QTRigDoppler is disabled or not configured', 'error');
            this.serverStatusText.textContent = 'Disabled';
            return;
        }

        try {
            if (this.socket) {
                this.socket.close();
            }

            this.socket = io(this.settings.serverAddress);

            // Connection events
            this.socket.on('connect', () => {
                this.handleConnect();
            });

            this.socket.on('disconnect', () => {
                this.handleDisconnect();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                this.updateStatus('Connection error: ' + error.message, 'error');
            });

            // Status updates
            this.socket.on('status', (data) => {
                this.handleStatusUpdate(data);
            });

            // List updates
            this.socket.on('satellite_list', (data) => {
                this.updateSatelliteDropdown(data.satellites, data.current);
            });

            this.socket.on('transponder_list', (data) => {
                this.updateTransponderDropdown(data.transponders, data.current);
            });

            // Selection events
            this.socket.on('satellite_selected', (data) => {
                this.satelliteSelect.classList.remove('select-loading');
                this.selectSatelliteBtn.disabled = false;
                if (data.error) {
                    this.updateStatus(data.error, 'error');
                }
            });

            this.socket.on('transponder_selected', (data) => {
                this.transponderSelect.classList.remove('select-loading');
                this.selectTransponderBtn.disabled = false;
                if (data.error) {
                    this.updateStatus(data.error, 'error');
                } else {
                    this.currentSelectedTransponder = this.transponderSelect.value;
                    this.transponderDirty = false;
                }
            });

            // Tracking events
            this.socket.on('tracking_started', () => {
                this.startTrackingBtn.disabled = true;
                this.stopTrackingBtn.disabled = false;
                this.updateStatus('Tracking active', 'success');
            });

            this.socket.on('tracking_stopped', () => {
                this.startTrackingBtn.disabled = false;
                this.stopTrackingBtn.disabled = true;
                this.updateStatus('Tracking stopped', 'info');
            });

        } catch (e) {
            console.error('Error creating socket:', e);
            this.updateStatus('Failed to connect to QTRigDoppler server: ' + e.message, 'error');
            this.serverStatusText.textContent = 'Error';
        }
    }

    handleConnect() {
        this.updateStatus('Connected to QTRigDoppler server', 'success');
        this.connectionBadge.classList.add('connected');
        this.serverStatusText.textContent = 'Connected';
        this.enableControls(true);
        
        // Get current status and satellite list
        this.getStatus();
        this.getSatelliteList();
    }

    handleDisconnect() {
        this.updateStatus('Disconnected from QTRigDoppler server', 'error');
        this.connectionBadge.classList.remove('connected');
        this.serverStatusText.textContent = 'Disconnected';
        this.enableControls(false);
    }

    initializeEventListeners() {
        // Panel controls
        this.minimizeBtn.addEventListener('click', () => this.toggleMinimize());
        this.closeBtn.addEventListener('click', () => this.hide());
        this.configureBtn.addEventListener('click', () => this.configureServer());

        // Make panel draggable
        const header = this.panel.querySelector('.info-header');
        this.initializeDragging(header);

        // Control buttons
        this.startTrackingBtn.addEventListener('click', () => this.startTracking());
        this.stopTrackingBtn.addEventListener('click', () => this.stopTracking());
        this.getStatusBtn.addEventListener('click', () => this.getStatus());
        this.selectSatelliteBtn.addEventListener('click', () => this.selectSatellite(true));
        this.selectTransponderBtn.addEventListener('click', () => this.selectTransponder());
        
        // Refresh buttons
        this.refreshSatellitesBtn.addEventListener('click', () => {
            if (this.socket?.connected) {
                this.satelliteListLoaded = false; // allow reload
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
        this.initializeSelectionEvents();

        // Rotator controls
        this.parkRotatorBtn.addEventListener('click', () => this.parkRotator());
        this.stopRotatorBtn.addEventListener('click', () => this.stopRotator());
    }

    initializeDragging(header) {
        header.addEventListener('mousedown', (e) => {
            if (e.target === this.minimizeBtn || e.target === this.closeBtn || e.target === this.configureBtn) {
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
                header.style.cursor = 'grab';
            }
        });
    }

    initializeSelectionEvents() {
        // Satellite selection
        this.satelliteSelect.addEventListener('change', () => {
            if (this.satelliteSelect.value) {
                this.selectSatelliteBtn.disabled = false;
            } else {
                this.selectSatelliteBtn.disabled = true;
                this.transponderSelect.innerHTML = '<option value="">Select a satellite first...</option>';
                this.selectTransponderBtn.disabled = true;
            }
        });

        // Transponder selection
        this.transponderSelect.addEventListener('change', () => {
            this.selectTransponderBtn.disabled = !this.transponderSelect.value;
            this.transponderDirty = true;
        });

        // Subtone selection and button
        this.subtoneSelect = document.getElementById('qtrigdoppler-subtone');
        this.setSubtoneBtn = document.getElementById('qtrigdoppler-set-subtone');
        
        this.subtoneSelect.addEventListener('change', () => {
            this.subtoneDirty = true;
        });

        this.setSubtoneBtn.addEventListener('click', () => {
            this.setSubtone();
        });

        // RX Offset input
        this.rxOffsetInput.addEventListener('input', () => {
            this.rxOffsetDirty = true;
        });

        this.rxOffsetInput.addEventListener('change', () => {
            this.setRxOffset();
        });
    }

    // Panel actions
    show() {
        this.panel.style.display = 'flex';
        if (!this.satelliteListLoaded) {
            this.getSatelliteList();
            this.satelliteListLoaded = true;
        }
        this.getStatus();
    }

    hide() {
        this.panel.style.display = 'none';
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.panel.classList.toggle('minimized', this.isMinimized);
        this.minimizeBtn.innerHTML = this.isMinimized ? '+' : '−';
    }

    configureServer() {
        const newAddress = prompt('Enter server URL (e.g., http://localhost:5001):', this.settings.serverAddress);
        if (newAddress) {
            this.settings.serverAddress = newAddress;
            localStorage.setItem('qtrigdopplerSettings', JSON.stringify(this.settings));
            this.updateStatus('Server address updated. Reconnecting...', 'info');
            this.initializeWebSocket();
        }
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
        this.getStatusBtn.disabled = !enabled;
        this.refreshSatellitesBtn.disabled = !enabled;
        this.refreshTranspondersBtn.disabled = !enabled;
        this.parkRotatorBtn.disabled = !enabled;
        this.stopRotatorBtn.disabled = !enabled;
    }

    // Socket event handlers
    handleStatusUpdate(data) {
        if (data.error) {
            this.updateStatus(data.error, 'error');
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
        if (data.satellite && !this.satelliteDirty) {
            this.updateSatelliteSelection(data.satellite);
        }

        // Update transponder selection
        if (data.transponder && !this.transponderDirty) {
            this.updateTransponderSelection(data.transponder);
        }

        // Update frequency display
        this.updateFrequencyDisplay(data);

        // Update subtone
        if (data.subtone && !this.subtoneDirty) {
            this.updateSubtoneSelection(data.subtone);
        }

        // Update RX offset
        if (data.rx_offset !== undefined && !this.rxOffsetDirty) {
            this.rxOffsetInput.value = data.rx_offset;
        }

        //console.log('Status update:', data);
    }

    updateSatelliteSelection(satellite) {
        for (let i = 0; i < this.satelliteSelect.options.length; i++) {
            if (this.satelliteSelect.options[i].value === satellite) {
                this.satelliteSelect.selectedIndex = i;
                this.selectSatelliteBtn.disabled = false;
                this.currentSelectedSatellite = satellite;
                
                // If we have no transponders loaded, fetch them
                if (this.transponderSelect.options.length <= 1) {
                    setTimeout(() => this.selectSatellite(false), 100);
                }
                break;
            }
        }
    }

    updateTransponderSelection(transponder) {
        for (let i = 0; i < this.transponderSelect.options.length; i++) {
            if (this.transponderSelect.options[i].value === transponder) {
                this.transponderSelect.selectedIndex = i;
                this.selectTransponderBtn.disabled = false;
                this.currentSelectedTransponder = transponder;
                break;
            }
        }
    }

    updateSubtoneSelection(subtone) {
        for (let i = 0; i < this.subtoneSelect.options.length; i++) {
            if (this.subtoneSelect.options[i].value === subtone) {
                this.subtoneSelect.selectedIndex = i;
                this.currentSelectedSubtone = subtone;
                break;
            }
        }
    }

    // Helper methods
    updateFrequencyDisplay(data) {
        const satInfo = data.satellite_info || {};
        const dopplerInfo = data.doppler || {};

        // Update downlink frequency and mode
        if (this.downlinkFreqElement) {
            let freqText = '--';
            if (satInfo.downlink_freq) {
                freqText = this.formatFreq(satInfo.downlink_freq);
                if (dopplerInfo.downlink) {
                    freqText += ` (${dopplerInfo.downlink > 0 ? '+' : ''}${dopplerInfo.downlink} Hz)`;
                }
            }
            this.downlinkFreqElement.textContent = freqText;
        }

        if (this.downlinkModeElement) {
            this.downlinkModeElement.textContent = satInfo.downlink_mode || '--';
        }

        // Update uplink frequency and mode
        if (this.uplinkFreqElement) {
            let freqText = '--';
            if (satInfo.uplink_freq) {
                freqText = this.formatFreq(satInfo.uplink_freq);
                if (dopplerInfo.uplink) {
                    freqText += ` (${dopplerInfo.uplink > 0 ? '+' : ''}${dopplerInfo.uplink} Hz)`;
                }
            }
            this.uplinkFreqElement.textContent = freqText;
        }

        if (this.uplinkModeElement) {
            this.uplinkModeElement.textContent = satInfo.uplink_mode || '--';
        }

        // Update doppler information
        if (this.dopplerElement) {
            if (dopplerInfo.downlink || dopplerInfo.uplink) {
                let dopplerText = '';
                if (dopplerInfo.downlink) {
                    dopplerText += `↓${dopplerInfo.downlink > 0 ? '+' : ''}${dopplerInfo.downlink} Hz `;
                }
                if (dopplerInfo.uplink) {
                    dopplerText += `↑${dopplerInfo.uplink > 0 ? '+' : ''}${dopplerInfo.uplink} Hz`;
                }
                this.dopplerElement.textContent = dopplerText.trim();
            } else {
                this.dopplerElement.textContent = '--';
            }
        }
    }

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
        });
        
        if (currentSatellite && satellites.includes(currentSatellite)) {
            this.satelliteSelect.value = currentSatellite;
            this.selectSatelliteBtn.disabled = false;
            this.currentSelectedSatellite = currentSatellite;
        } else if (currentSelection && satellites.includes(currentSelection)) {
            this.satelliteSelect.value = currentSelection;
            this.selectSatelliteBtn.disabled = false;
        }

        this.satelliteDirty = false;
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
        });
        
        if (currentTransponder && transponders.includes(currentTransponder)) {
            this.transponderSelect.value = currentTransponder;
            this.selectTransponderBtn.disabled = false;
            this.currentSelectedTransponder = currentTransponder;
        } else if (currentSelection && transponders.includes(currentSelection)) {
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
        
        // Skip if reselecting without user interaction
        if (this.currentSelectedSatellite === sat && !fromUserClick) {
            return;
        }
        
        this.currentSelectedSatellite = sat;
        this.transponderSelect.innerHTML = '<option value="">Loading transponders...</option>';
        this.transponderSelect.classList.add('select-loading');
        this.selectTransponderBtn.disabled = true;
        
        this.socket.emit('select_satellite', { satellite: sat });
        
        // Reset controls if user initiated
        if (fromUserClick) {
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
        
        // Skip if already selected
        if (this.currentSelectedTransponder === tpx) {
            this.transponderSelect.classList.remove('select-loading');
            return;
        }
        
        this.currentSelectedTransponder = tpx;
        this.transponderSelect.classList.add('select-loading');
        this.selectTransponderBtn.disabled = true;
        this.socket.emit('select_transponder', { transponder: tpx });
        this.transponderDirty = false;
    }

    setSubtone() {
        if (!this.socket?.connected) {
            this.updateStatus('Not connected to server', 'error');
            return;
        }
        
        const tone = this.subtoneSelect.value;
        if (this.currentSelectedSubtone === tone) {
            this.subtoneDirty = false;
            return;
        }
        
        this.updateStatus('Setting subtone to ' + tone, 'info');
        this.socket.emit('set_subtone', { subtone: tone });
        this.currentSelectedSubtone = tone;
        this.subtoneDirty = false;
    }

    setRxOffset() {
        if (!this.socket?.connected) return;
        const offset = parseInt(this.rxOffsetInput.value, 10) || 0;
        this.socket.emit('set_rx_offset', { offset });
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

    parkRotator() {
        if (!this.socket?.connected) return;
        this.socket.emit('park_rotator');
    }

    stopRotator() {
        if (!this.socket?.connected) return;
        this.socket.emit('stop_rotator');
    }
}

// Initialize QTRigDoppler panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.qtrigdopplerPanel = new QTRigDopplerPanel();
    
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

    // Auto-open panel if enabled
    if (window.qtrigdopplerPanel.settings.enableQTRigDoppler) {
        setTimeout(() => window.qtrigdopplerPanel.show(), 500);
    }
});