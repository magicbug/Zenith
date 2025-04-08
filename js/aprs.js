class APRSPanel {
    constructor() {
        this.panel = document.getElementById('aprs-panel');
        this.minimizeBtn = document.getElementById('minimize-aprs-panel');
        this.closeBtn = document.getElementById('close-aprs-panel');
        this.debugBtn = document.getElementById('aprs-toggle-debug');
        this.messages = document.getElementById('aprs-messages');
        this.packetsTable = null;
        this.isMinimized = false;
        this.isDragging = false;
        this.currentX = 0;
        this.currentY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;
        
        // Load observer location from localStorage
        const savedObserver = localStorage.getItem('observer');
        this.observerLocation = savedObserver ? JSON.parse(savedObserver) : null;

        // Add event listener for storage changes
        window.addEventListener('storage', (e) => {
            if (e.key === 'observer') {
                this.observerLocation = JSON.parse(e.newValue);
            }
        });

        this.initializeWebSocket();
        this.initializeTable();
        this.initializeEventListeners();
    }

    initializeWebSocket() {
        this.ws = new WebSocket('ws://localhost:8765');
        
        this.ws.onopen = () => {
            this.addMessage('Connected to WebSocket server', 'info');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.addMessage(`Received: ${JSON.stringify(data)}`, 'received');
            
            const fromCallsign = (data.from || data.source || '').toUpperCase();
            
            if (fromCallsign && fromCallsign !== 'NO SOURCE') {
                const toCallsign = (data.to ? data.to : (data.destination ? data.destination : 'Broadcast')).toUpperCase();
                const message = data.data ? data.data : (data.message ? data.message : JSON.stringify(data));
                
                this.packetsTable.row.add([
                    Date.now(),
                    `<span class="clickable-callsign" onclick="aprsPanel.setToCallsign('${fromCallsign}')">${fromCallsign}</span>`,
                    toCallsign,
                    message
                ]).draw(false);
            }
        };

        this.ws.onerror = (error) => {
            this.addMessage(`Error: ${error.message}`, 'error');
        };

        this.ws.onclose = () => {
            this.addMessage('Disconnected from WebSocket server', 'info');
        };
    }

    initializeTable() {
        this.packetsTable = $('#aprs-packets-table').DataTable({
            order: [[0, 'desc']],
            pageLength: 10,
            autoWidth: true,
            searching: false,
            columnDefs: [
                { 
                    targets: 0,
                    visible: false,
                    searchable: false
                }
            ],
            language: {
                emptyTable: "No packets received yet"
            }
        });

        // Adjust columns when window is resized
        $(window).on('resize', () => {
            this.packetsTable.columns.adjust();
        });
    }

    initializeEventListeners() {
        // Open APRS panel
        document.getElementById('open-aprs').addEventListener('click', () => this.show());

        // Minimize button
        this.minimizeBtn.addEventListener('click', () => {
            this.panel.classList.toggle('minimized');
            this.minimizeBtn.innerHTML = this.panel.classList.contains('minimized') ? '+' : '−';
        });

        // Close button
        this.closeBtn.addEventListener('click', () => this.hide());

        // Debug button
        this.debugBtn.addEventListener('click', () => {
            this.messages.style.display = this.messages.style.display === 'none' ? 'block' : 'none';
            this.debugBtn.textContent = this.messages.style.display === 'none' ? 'Show Debug' : 'Hide Debug';
        });

        // Dragging functionality
        const header = this.panel.querySelector('.info-header');
        
        header.addEventListener('mousedown', (e) => {
            if (e.target === this.minimizeBtn || e.target === this.closeBtn || e.target === this.debugBtn) {
                return;
            }
            this.isDragging = true;
            this.initialX = e.clientX - this.xOffset;
            this.initialY = e.clientY - this.yOffset;
            
            if (e.target === header) {
                header.style.cursor = 'grabbing';
            }
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
                header.style.cursor = 'move';
            }
        });

        // Message controls
        document.getElementById('aprs-send-message').addEventListener('click', () => this.sendMessage());
        document.getElementById('aprs-send-position').addEventListener('click', () => this.sendPosition());

        // Macros
        document.getElementById('aprs-cq').addEventListener('click', () => this.sendCQ());
        document.getElementById('aprs-call-rpt').addEventListener('click', () => this.sendCallRptGrid());
        document.getElementById('aprs-tu73').addEventListener('click', () => this.sendTu73());
    }

    show() {
        this.panel.style.display = 'flex';
    }

    hide() {
        this.panel.style.display = 'none';
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.panel.classList.toggle('minimized', this.isMinimized);
    }

    addMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `aprs-message ${type}`;
        messageDiv.textContent = message;
        this.messages.appendChild(messageDiv);
        this.messages.scrollTop = this.messages.scrollHeight;
    }

    setToCallsign(callsign) {
        document.getElementById('aprs-to').value = callsign.toUpperCase();
    }

    sendMessage() {
        const to = document.getElementById('aprs-to').value.toUpperCase();
        const via = document.getElementById('aprs-via').value.toUpperCase();
        const message = document.getElementById('aprs-message').value;
        
        if (!message) {
            alert('Please enter a message');
            return;
        }
        
        const packet = {
            to: to,
            via: via,
            data: message
        };
        
        this.ws.send(JSON.stringify(packet));
        this.addMessage(`Sent: ${JSON.stringify(packet)}`, 'sent');
    }

    sendPosition() {
        if (!this.observerLocation || !this.observerLocation.latitude || !this.observerLocation.longitude) {
            alert('Observer location not set. Please set your location in the Options menu first.');
            return;
        }

        const to = document.getElementById('aprs-to').value.toUpperCase();
        const via = document.getElementById('aprs-via').value.toUpperCase();
        const customMessage = document.getElementById('aprs-message').value.trim();
        
        // Convert lat/long to APRS format with proper padding
        const lat = this.observerLocation.latitude;
        const lon = this.observerLocation.longitude;
        
        // Calculate degrees and minutes with proper padding
        const latDeg = Math.abs(Math.floor(lat)).toString().padStart(2, '0');
        const latMin = (Math.abs((lat % 1) * 60)).toFixed(2).padStart(5, '0');
        const lonDeg = Math.abs(Math.floor(lon)).toString().padStart(3, '0');
        const lonMin = (Math.abs((lon % 1) * 60)).toFixed(2).padStart(5, '0');
        
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        
        // Format the position string, using custom message if provided
        const message = customMessage || `Test position from ${this.observerLocation.callsign || 'Unknown'}`;
        const data = `!${latDeg}${latMin}${latDir}/${lonDeg}${lonMin}${lonDir}_/A=000001 ${message}`;
        
        const packet = {
            to: to,
            via: via,
            data: data
        };
        
        this.ws.send(JSON.stringify(packet));
        this.addMessage(`Sent position: ${JSON.stringify(packet)}`, 'sent');
    }

    toggleDebug() {
        const messagesDiv = document.getElementById('aprs-messages');
        const debugButton = document.getElementById('aprs-toggle-debug');
        
        if (messagesDiv.style.display === 'none') {
            messagesDiv.style.display = 'block';
            debugButton.textContent = 'Hide Debug';
        } else {
            messagesDiv.style.display = 'none';
            debugButton.textContent = 'Show Debug';
        }
    }

    sendCQ() {
        document.getElementById('aprs-to').value = 'CQ';
        const gridSquare = this.observerLocation ? 
            this.getGridSquare(this.observerLocation.latitude, this.observerLocation.longitude) : 
            null;
        if (!gridSquare) {
            alert('Observer location not set. Please set your location in the Options menu first.');
            return;
        }
        document.getElementById('aprs-message').value = gridSquare;
        this.sendMessage();
    }

    sendCallRptGrid() {
        const to = document.getElementById('aprs-to').value;
        if (!to) {
            alert('Please enter a callsign first');
            return;
        }
        const gridSquare = this.observerLocation ? 
            this.getGridSquare(this.observerLocation.latitude, this.observerLocation.longitude) : 
            null;
        if (!gridSquare) {
            alert('Observer location not set. Please set your location in the Options menu first.');
            return;
        }
        document.getElementById('aprs-message').value = `599 ${gridSquare}`;
        this.sendMessage();
    }

    sendTu73() {
        const to = document.getElementById('aprs-to').value;
        if (!to) {
            alert('Please enter a callsign first');
            return;
        }
        document.getElementById('aprs-message').value = 'TU 73';
        this.sendMessage();
    }

    setObserverLocation(location) {
        this.observerLocation = location;
    }

    // Add grid square calculation function
    getGridSquare(lat, lon) {
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
}

// Initialize the APRS panel when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.aprsPanel = new APRSPanel();
}); 