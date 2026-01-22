<?php
/**
 * Admin Revoke User Key Endpoint
 * POST: { "admin_key": "admin_secret", "user_email": "user@example.com" } or { "admin_key": "admin_secret", "user_id": 123 }
 * Admin endpoint to revoke any user's API key
 */

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../db.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../utils.php';

// Set headers
setCorsHeaders();
setSecurityHeaders();

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}

// Get request body
$data = getJsonBody();

// Validate admin key
$adminKey = $data['admin_key'] ?? '';
if (empty($adminKey) || $adminKey !== ADMIN_KEY || empty(ADMIN_KEY)) {
    logError("Invalid admin key attempt", ['ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
    sendErrorResponse('Unauthorized', 403, 'UNAUTHORIZED');
}

// Get user identifier
$userEmail = $data['user_email'] ?? null;
$userId = $data['user_id'] ?? null;

if (empty($userEmail) && empty($userId)) {
    sendErrorResponse('user_email or user_id required', 400, 'USER_IDENTIFIER_REQUIRED');
}

// Get user
$db = DB::getInstance();
$auth = new Auth();

if ($userEmail) {
    $user = $auth->getUserByEmail($userEmail);
    if (!$user) {
        sendErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }
} else {
    $stmt = $db->query("SELECT id, email FROM users WHERE id = ?", [$userId]);
    $user = $stmt->fetch();
    if (!$user) {
        sendErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }
}

// Revoke API key
$db->query(
    "UPDATE users SET api_key_active = 0 WHERE id = ?",
    [$user['id']]
);

logError("API key revoked by admin", ['user_id' => $user['id'], 'email' => $user['email']]);

sendSuccessResponse(['message' => 'API key revoked for ' . $user['email']]);
