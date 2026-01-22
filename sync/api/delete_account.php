<?php
/**
 * Delete Account Endpoint
 * POST: { "api_key": "key123" }
 * Deletes user account and all associated data
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
    logError("Invalid API key attempt for account deletion", ['ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
    sendErrorResponse('Invalid API key', 401, 'INVALID_API_KEY');
}

// Delete user (cascade will delete settings)
$db = DB::getInstance();
$db->query("DELETE FROM users WHERE id = ?", [$user['id']]);

logError("Account deleted", ['user_id' => $user['id'], 'email' => $user['email']]);

sendSuccessResponse(['message' => 'Account deleted']);
