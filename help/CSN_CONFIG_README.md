# CSN Configuration for Zenith

This document explains how to configure CSN (CSN Technologies S.A.T) features in Zenith for different deployment scenarios.

## Configuration File

The CSN features can be controlled via the `js/config.js` file. This configuration is designed for deployment-time settings and cannot be changed by users through the frontend interface.

## Configuration Options

### `enableCsnFeatures`

- **Type:** Boolean
- **Default:** `false`
- **Description:** Controls whether CSN Technologies S.A.T integration features are available in Zenith

#### Setting to `true` (Local Network Deployment)
```javascript
const ZenithConfig = {
    enableCsnFeatures: true,
};
```

When enabled:
- CSN S.A.T configuration options appear in the Options menu
- CSN Panel button is visible in the main interface
- CSN integration functions are active
- Help documentation for CSN features is shown

#### Setting to `false` (Public Web Deployment)
```javascript
const ZenithConfig = {
    enableCsnFeatures: false,
};
```

When disabled:
- All CSN-related UI elements are hidden
- CSN configuration options are not available
- CSN integration code is not loaded
- Help documentation for CSN features is hidden
- No CSN-related API calls are made

## Deployment Scenarios

### Local Network / Ham Radio Station
- Set `enableCsnFeatures: true`
- Users can configure their CSN hardware via the Options menu
- Full CSN integration available

### Public Web Hosting
- Set `enableCsnFeatures: false`
- CSN features completely disabled
- Cleaner interface without hardware-specific options
- Reduced JavaScript payload (csn.js not loaded)

## Files Affected

When CSN features are disabled, the following elements are automatically hidden:
- CSN Panel button in main interface
- CSN configuration section in Options
- CSN help documentation
- The `js/csn.js` script is not loaded

## Implementation Notes

- The configuration is applied at page load time
- Changes require a page refresh to take effect
- The configuration cannot be overridden by user settings
- All CSN-related functionality is properly disabled when `enableCsnFeatures` is `false` 