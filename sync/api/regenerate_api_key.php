<?php
/**
 * Regenerate API Key Endpoint
 * POST: { "api_key": "key123" }
 * Revokes old key and generates a new one
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
    logError("Invalid API key attempt for regeneration", ['ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
    sendErrorResponse('Invalid API key', 401, 'INVALID_API_KEY');
}

// Generate new API key
$newApiKey = Auth::generateApiKey();
$newApiKeyHash = password_hash($newApiKey, PASSWORD_DEFAULT);

// Update user with new key
$db = DB::getInstance();
$db->query(
    "UPDATE users SET api_key_hash = ?, api_key_active = 1, api_key_created_at = NOW() WHERE id = ?",
    [$newApiKeyHash, $user['id']]
);

logError("API key regenerated", ['user_id' => $user['id'], 'email' => $user['email']]);

sendSuccessResponse([
    'new_api_key' => $newApiKey,
    'message' => 'API key regenerated'
]);
