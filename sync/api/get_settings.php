<?php
/**
 * Get Settings Endpoint
 * GET: ?api_key=key123 or Header: X-API-Key: key123
 * Returns user settings
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/rate_limit.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/utils.php';

// Set headers
setCorsHeaders();
setSecurityHeaders();

// Only allow GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}

// Get API key
$apiKey = getApiKey();
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

// Get user settings
$db = DB::getInstance();
$stmt = $db->query(
    "SELECT settings_json, version, updated_at FROM user_settings WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [$user['id']]
);

$settingsData = $stmt->fetch();

if ($settingsData) {
    $settings = json_decode($settingsData['settings_json'], true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        logError("Failed to decode settings JSON", ['user_id' => $user['id']]);
        sendErrorResponse('Failed to retrieve settings', 500, 'JSON_DECODE_ERROR');
    }
    
    sendSuccessResponse([
        'settings' => $settings,
        'version' => (int)$settingsData['version'],
        'updated_at' => $settingsData['updated_at']
    ]);
} else {
    // No settings yet, return empty object
    sendSuccessResponse([
        'settings' => (object)[],
        'version' => 0,
        'updated_at' => null
    ]);
}
