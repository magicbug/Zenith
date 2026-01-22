<?php
/**
 * Update Contact Preference Endpoint
 * POST: { "api_key": "key123", "allow_contact": true }
 * Updates user's contact permission preference
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
    logError("Invalid API key attempt", ['ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
    sendErrorResponse('Invalid API key', 401, 'INVALID_API_KEY');
}

// Check if API key is active
if (!$user['api_key_active']) {
    sendErrorResponse('API key revoked', 403, 'API_KEY_REVOKED');
}

// Validate allow_contact
$allowContact = isset($data['allow_contact']) ? (bool)$data['allow_contact'] : false;

// Update preference
$db = DB::getInstance();
$db->query(
    "UPDATE users SET allow_contact = ? WHERE id = ?",
    [$allowContact ? 1 : 0, $user['id']]
);

sendSuccessResponse(['allow_contact' => $allowContact]);
