/**
 * Zenith Settings Sync Module
 * Handles synchronization of localStorage settings across devices
 */

const SettingsSync = {
    // Configuration
    // Use config value if available, otherwise default to production
    get API_BASE_URL() {
        if (typeof window.ZenithConfig !== 'undefined' && window.ZenithConfig.syncBaseUrl) {
            return window.ZenithConfig.syncBaseUrl;
        }
        return 'https://sync.zenithtracker.org/api';
    },
    
    // Keys excluded from sync (device-specific)
    EXCLUDED_KEYS: ['notifiedPasses', 'syncApiKey', 'syncAutoEnabled', 'lastSyncTime', 'syncLastError'],
    
    // State
    syncApiKey: null,
    syncAutoEnabled: true,
    lastSyncTime: null,
    syncInProgress: false,
    syncDebounceTimer: null,
    
    /**
     * Initialize settings sync
     */
    init() {
        // Load sync settings from localStorage
        this.syncApiKey = localStorage.getItem('syncApiKey');
        const autoSync = localStorage.getItem('syncAutoEnabled');
        this.syncAutoEnabled = autoSync !== null ? autoSync === 'true' : true;
        this.lastSyncTime = localStorage.getItem('lastSyncTime');
        
        // Check for API key in URL fragment (from verify.php redirect)
        if (window.location.hash) {
            const match = window.location.hash.match(/sync-api-key=([^&]+)/);
            if (match) {
                this.setApiKey(decodeURIComponent(match[1]));
                // Clean up URL
                window.location.hash = window.location.hash.replace(/sync-api-key=[^&]*&?/, '').replace(/^#/, '');
            }
        }
        
        // Auto-sync on load if enabled
        if (this.isSyncEnabled() && this.isAutoSyncEnabled()) {
            this.syncSettingsFromServer();
        }
    },
    
    /**
     * Check if sync is enabled (has API key)
     */
    isSyncEnabled() {
        return !!this.syncApiKey;
    },
    
    /**
     * Check if auto-sync is enabled
     */
    isAutoSyncEnabled() {
        return this.syncAutoEnabled;
    },
    
    /**
     * Set API key
     */
    async setApiKey(key) {
        this.syncApiKey = key;
        localStorage.setItem('syncApiKey', key);
        
        // Update UI immediately to show connected state
        if (typeof window.updateSyncUI === 'function') {
            window.updateSyncUI();
        }
        
        // Sync immediately after setting key
        if (this.isAutoSyncEnabled()) {
            try {
                // First, try to get settings from server
                const serverData = await this.syncSettingsFromServer();
                
                // If server has no settings but we have local settings, upload them
                if ((!serverData.settings || Object.keys(serverData.settings).length === 0)) {
                    const localSettings = this.getAllSettings();
                    if (Object.keys(localSettings).length > 0) {
                        // Server is empty, upload local settings
                        await this.syncSettingsToServer();
                    }
                }
            } catch (error) {
                // If server fetch fails, check if it's an auth error
                if (error.message && (error.message.includes('Invalid') || error.message.includes('revoked'))) {
                    // Auth error - remove the key and re-throw
                    this.removeApiKey();
                    throw error;
                }
                
                // For other errors, try uploading if we have local settings
                const localSettings = this.getAllSettings();
                if (Object.keys(localSettings).length > 0) {
                    try {
                        await this.syncSettingsToServer();
                    } catch (uploadError) {
                        console.error('Failed to upload settings after API key setup:', uploadError);
                        // If upload also fails with auth error, remove key
                        if (uploadError.message && (uploadError.message.includes('Invalid') || uploadError.message.includes('revoked'))) {
                            this.removeApiKey();
                            throw uploadError;
                        }
                        // For other errors, don't fail completely - key is valid
                    }
                }
            }
        }
        
        // Update UI again after sync completes
        if (typeof window.updateSyncUI === 'function') {
            window.updateSyncUI();
        }
    },
    
    /**
     * Remove API key (disconnect)
     */
    removeApiKey() {
        this.syncApiKey = null;
        localStorage.removeItem('syncApiKey');
        localStorage.removeItem('lastSyncTime');
        this.updateSyncUI();
    },
    
    /**
     * Request magic link
     */
    async requestMagicLink(email) {
        if (!this.validateEmail(email)) {
            throw new Error('Invalid email address');
        }
        
        try {
            const response = await fetch(`${this.API_BASE_URL}/request_magic_link.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: email.toLowerCase().trim() }),
                mode: 'cors' // Explicitly enable CORS
            });
            
            // Check if response is ok before trying to parse JSON
            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
                }
                throw new Error(errorData.error || `Failed to request magic link (${response.status})`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error requesting magic link:', error);
            // Provide more helpful error messages
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                const syncUrl = this.API_BASE_URL.replace('/api', '');
                throw new Error(`Network error: Unable to connect to sync server at ${syncUrl}. Please check your connection and CORS settings.`);
            }
            throw error;
        }
    },
    
    /**
     * Sync settings to server
     */
    async syncSettingsToServer() {
        if (!this.isSyncEnabled() || this.syncInProgress) {
            return;
        }
        
        this.syncInProgress = true;
        
        try {
            const settings = this.getAllSettings();
            
            const response = await fetch(`${this.API_BASE_URL}/save_settings.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.syncApiKey
                },
                body: JSON.stringify({
                    api_key: this.syncApiKey,
                    settings: settings
                }),
                mode: 'cors' // Explicitly enable CORS
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // Invalid or revoked API key
                    this.removeApiKey();
                    throw new Error('API key invalid or revoked. Please reconnect.');
                }
                throw new Error(data.error || 'Failed to sync settings');
            }
            
            this.lastSyncTime = new Date().toISOString();
            localStorage.setItem('lastSyncTime', this.lastSyncTime);
            this.updateSyncUI();
            
            return data;
        } catch (error) {
            console.error('Error syncing settings to server:', error);
            localStorage.setItem('syncLastError', error.message);
            
            // Provide more helpful error messages
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                const syncUrl = this.API_BASE_URL.replace('/api', '');
                throw new Error(`Network error: Unable to connect to sync server at ${syncUrl}. Please check your connection and CORS settings.`);
            }
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    },
    
    /**
     * Sync settings from server
     */
    async syncSettingsFromServer() {
        if (!this.isSyncEnabled() || this.syncInProgress) {
            return;
        }
        
        this.syncInProgress = true;
        
        try {
            const response = await fetch(`${this.API_BASE_URL}/get_settings.php?api_key=${encodeURIComponent(this.syncApiKey)}`, {
                method: 'GET',
                headers: {
                    'X-API-Key': this.syncApiKey
                },
                mode: 'cors' // Explicitly enable CORS
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // Invalid or revoked API key
                    this.removeApiKey();
                    throw new Error('API key invalid or revoked. Please reconnect.');
                }
                throw new Error(data.error || 'Failed to sync settings');
            }
            
            if (data.settings && Object.keys(data.settings).length > 0) {
                // Check if we have local settings that might conflict
                const localSettings = this.getAllSettings();
                const hasLocalSettings = Object.keys(localSettings).length > 0;
                
                // Check for conflicts
                const localVersion = this.getLocalVersion();
                const serverVersion = data.version || 0;
                
                if (hasLocalSettings && localVersion > 0 && localVersion !== serverVersion) {
                    // Conflict detected - let user decide
                    const useServer = await this.handleSyncConflict(localVersion, serverVersion);
                    if (useServer) {
                        this.applyAllSettings(data.settings);
                    }
                    // If user chose to keep local, we don't apply server settings
                } else if (hasLocalSettings && !this.lastSyncTime) {
                    // New device with local settings but no previous sync
                    // Ask user what to do
                    const useServer = confirm(
                        'You have local settings and server settings available.\n\n' +
                        'Click OK to use server settings (will overwrite local).\n' +
                        'Click Cancel to keep local settings and upload them to server.'
                    );
                    if (useServer) {
                        this.applyAllSettings(data.settings);
                    } else {
                        // Upload local settings to server
                        await this.syncSettingsToServer();
                    }
                } else {
                    // No conflict or no local settings, apply server settings
                    this.applyAllSettings(data.settings);
                }
            }
            
            this.lastSyncTime = new Date().toISOString();
            localStorage.setItem('lastSyncTime', this.lastSyncTime);
            this.updateSyncUI();
            
            return data;
        } catch (error) {
            console.error('Error syncing settings from server:', error);
            localStorage.setItem('syncLastError', error.message);
            
            // Provide more helpful error messages
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                const syncUrl = this.API_BASE_URL.replace('/api', '');
                throw new Error(`Network error: Unable to connect to sync server at ${syncUrl}. Please check your connection and CORS settings.`);
            }
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    },
    
    /**
     * Get all settings from localStorage (excluding device-specific keys)
     */
    getAllSettings() {
        const settings = {};
        const excludedKeys = [...this.EXCLUDED_KEYS, 'syncApiKey', 'syncAutoEnabled', 'lastSyncTime', 'syncLastError'];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (excludedKeys.includes(key)) {
                continue;
            }
            
            try {
                const value = localStorage.getItem(key);
                // Try to parse as JSON, fallback to string
                try {
                    settings[key] = JSON.parse(value);
                } catch {
                    settings[key] = value;
                }
            } catch (error) {
                console.warn(`Failed to read setting ${key}:`, error);
            }
        }
        
        return settings;
    },
    
    /**
     * Apply all settings to localStorage
     */
    applyAllSettings(settings) {
        for (const [key, value] of Object.entries(settings)) {
            if (this.EXCLUDED_KEYS.includes(key)) {
                continue; // Skip device-specific keys
            }
            
            try {
                if (typeof value === 'object' && value !== null) {
                    localStorage.setItem(key, JSON.stringify(value));
                } else {
                    localStorage.setItem(key, value);
                }
            } catch (error) {
                console.warn(`Failed to apply setting ${key}:`, error);
            }
        }
        
        // Trigger settings reload in app
        if (typeof window.reloadSettings === 'function') {
            window.reloadSettings();
        }
    },
    
    /**
     * Handle sync conflict
     */
    async handleSyncConflict(localVersion, serverVersion) {
        return new Promise((resolve) => {
            const message = `Settings conflict detected.\n\n` +
                `Local version: ${localVersion}\n` +
                `Server version: ${serverVersion}\n\n` +
                `Use server settings? (Click OK to use server, Cancel to keep local)`;
            
            const useServer = confirm(message);
            resolve(useServer);
        });
    },
    
    /**
     * Get local version (stored in a special key or calculated)
     */
    getLocalVersion() {
        // For now, return 0 (no version tracking locally)
        // In a full implementation, you might store a version number
        return 0;
    },
    
    /**
     * Debounced sync (for auto-sync on settings changes)
     */
    debouncedSync() {
        if (!this.isSyncEnabled() || !this.isAutoSyncEnabled()) {
            return;
        }
        
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }
        
        this.syncDebounceTimer = setTimeout(() => {
            this.syncSettingsToServer().catch(error => {
                console.error('Auto-sync failed:', error);
            });
        }, 2000); // 2 second debounce
    },
    
    /**
     * Update sync UI (called from app.js)
     */
    updateSyncUI() {
        // This will be called from the UI to update status
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
            if (typeof window.updateSyncUI === 'function') {
                window.updateSyncUI();
            }
        }, 0);
    },
    
    /**
     * Validate email
     */
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    /**
     * Revoke API key
     */
    async revokeApiKey() {
        if (!this.isSyncEnabled()) {
            return;
        }
        
        try {
            const response = await fetch(`${this.API_BASE_URL}/revoke_api_key.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.syncApiKey
                },
                body: JSON.stringify({
                    api_key: this.syncApiKey
                }),
                mode: 'cors' // Explicitly enable CORS
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to revoke API key');
            }
            
            this.removeApiKey();
            return data;
        } catch (error) {
            console.error('Error revoking API key:', error);
            throw error;
        }
    }
};

// Make SettingsSync globally accessible
window.SettingsSync = SettingsSync;
