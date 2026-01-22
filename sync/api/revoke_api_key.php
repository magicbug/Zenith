<?php
/**
 * Revoke API Key Endpoint
 * POST: { "api_key": "key123" }
 * Revokes the user's API key
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
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
    logError("Invalid API key attempt for revocation", ['ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
    sendErrorResponse('Invalid API key', 401, 'INVALID_API_KEY');
}

// Revoke API key
$db = DB::getInstance();
$db->query(
    "UPDATE users SET api_key_active = 0 WHERE id = ?",
    [$user['id']]
);

logError("API key revoked", ['user_id' => $user['id'], 'email' => $user['email']]);

sendSuccessResponse(['message' => 'API key revoked']);
