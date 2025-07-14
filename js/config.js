// Zenith Configuration
// This file contains deployment-specific settings that should not be changed by users

const ZenithConfig = {
    // Set to false to disable CSN S.A.T hardware integration features
    // This should be set to false for public web deployments where CSN hardware is not available
    enableCsnFeatures: true,
    
    // Future configuration options can be added here
    // enableOtherFeature: true,
};

// Make config available globally
window.ZenithConfig = ZenithConfig;

// Function to hide/show CSN-related UI elements based on config
function configureCsnUI() {
    if (!ZenithConfig.enableCsnFeatures) {
        // Hide CSN-related UI elements
        const csnElements = [
            'open-sat-panel-btn', // CSN Panel button
            'sat-panel', // CSN Panel itself
            'csn-sat-config-section', // CSN configuration section in options
        ];
        
        csnElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'none';
            }
        });
        
        // Hide CSN configuration section by class if it has one
        const csnConfigSections = document.querySelectorAll('[data-csn-config]');
        csnConfigSections.forEach(section => {
            section.style.display = 'none';
        });
        
        // Also hide any help text mentioning CSN
        const csnHelpSections = document.querySelectorAll('[data-csn-help]');
        csnHelpSections.forEach(section => {
            section.style.display = 'none';
        });
    }
}

// Apply CSN UI configuration when DOM is ready
document.addEventListener('DOMContentLoaded', configureCsnUI); 