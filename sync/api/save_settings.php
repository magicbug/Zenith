<?php
/**
 * Save Settings Endpoint
 * POST: { "api_key": "key123", "settings": {...} }
 * Saves user settings
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/rate_limit.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/utils.php';

// Set headers
setCorsHeaders();
setSecurityHeaders();

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}

// Get request body
$data = getJsonBody();

// Get API key
$apiKey = $data['api_key'] ?? getApiKey();
if (empty($apiKey)) {
    sendErrorResponse('API key required', 401, 'API_KEY_REQUIRED');
}

// Validate API key
$auth = new Auth();
$user = $auth->validateApiKey($apiKey);

if (!$user) {
    logError("Invalid API key attempt", ['ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
    sendErrorResponse('Invalid API key', 401, 'INVALID_API_KEY');
}

// Check if API key is active
if (!$user['api_key_active']) {
    sendErrorResponse('API key revoked', 403, 'API_KEY_REVOKED');
}

// Check rate limit
$rateLimiter = new RateLimiter();
$rateLimitCheck = $rateLimiter->checkApiCallLimit($apiKey);

if (!$rateLimitCheck['allowed']) {
    header('Retry-After: ' . $rateLimitCheck['retry_after']);
    sendErrorResponse('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
}

// Validate settings
if (!isset($data['settings']) || !is_array($data['settings'])) {
    sendErrorResponse('Settings object required', 400, 'SETTINGS_REQUIRED');
}

// Exclude device-specific keys
$excludedKeys = ['notifiedPasses', 'syncApiKey', 'syncAutoEnabled', 'lastSyncTime'];
foreach ($excludedKeys as $key) {
    unset($data['settings'][$key]);
}

// Validate JSON size
$settingsJson = json_encode($data['settings'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (strlen($settingsJson) > SETTINGS_MAX_SIZE_BYTES) {
    sendErrorResponse('Settings too large', 400, 'SETTINGS_TOO_LARGE');
}

// Validate JSON structure
if (json_last_error() !== JSON_ERROR_NONE) {
    sendErrorResponse('Invalid JSON structure', 400, 'INVALID_JSON');
}

// Get current version
$db = DB::getInstance();
$stmt = $db->query(
    "SELECT version FROM user_settings WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [$user['id']]
);
$currentData = $stmt->fetch();
$newVersion = $currentData ? ((int)$currentData['version']) + 1 : 1;

// Save settings
try {
    $db->beginTransaction();
    
    // Insert new settings record
    $db->query(
        "INSERT INTO user_settings (user_id, settings_json, version) VALUES (?, ?, ?)",
        [$user['id'], $settingsJson, $newVersion]
    );
    
    // Update last_sync_at
    $db->query(
        "UPDATE users SET last_sync_at = NOW() WHERE id = ?",
        [$user['id']]
    );
    
    $db->commit();
} catch (Exception $e) {
    $db->rollback();
    logError("Failed to save settings", ['user_id' => $user['id'], 'error' => $e->getMessage()]);
    sendErrorResponse('Failed to save settings', 500, 'SAVE_ERROR');
}

sendSuccessResponse([
    'version' => $newVersion,
    'last_sync_at' => date('Y-m-d\TH:i:s\Z')
]);
