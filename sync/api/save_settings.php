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

// Set headers first (before any output)
setCorsHeaders();
setSecurityHeaders();

// Wrap everything in try-catch to catch any unhandled exceptions
try {

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}

// Get request body (cache it so it can be reused)
$data = getJsonBody();

// Get API key (use from data first, then try getApiKey which will use cached body)
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

// Get current version and latest settings
$db = DB::getInstance();
$stmt = $db->query(
    "SELECT id, version, settings_json FROM user_settings WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [$user['id']]
);
$currentData = $stmt->fetch();
$newVersion = $currentData ? ((int)$currentData['version']) + 1 : 1;

// Save settings
try {
    $db->beginTransaction();
    
    // Check if settings actually changed (to avoid unnecessary version increments)
    $settingsChanged = true;
    if ($currentData) {
        $currentSettings = json_decode($currentData['settings_json'], true);
        if (json_last_error() === JSON_ERROR_NONE) {
            // Compare settings (excluding version/timestamp differences)
            // Use recursive ksort to sort keys manually (JSON_SORT_KEYS may not be available in older PHP)
            $currentSorted = $currentSettings;
            $newSorted = $data['settings'];
            $sortArray = function(&$array) use (&$sortArray) {
                if (is_array($array)) {
                    ksort($array);
                    foreach ($array as $key => $value) {
                        if (is_array($value)) {
                            $sortArray($array[$key]);
                        }
                    }
                }
            };
            $sortArray($currentSorted);
            $sortArray($newSorted);
            $currentNormalized = json_encode($currentSorted, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $newNormalized = json_encode($newSorted, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $settingsChanged = ($currentNormalized !== $newNormalized);
        }
    }
    
    if ($settingsChanged) {
        // Settings changed - insert new record
        $db->query(
            "INSERT INTO user_settings (user_id, settings_json, version) VALUES (?, ?, ?)",
            [$user['id'], $settingsJson, $newVersion]
        );
        
        // Cleanup: Keep only the last 10 versions per user to prevent unlimited growth
        // Only cleanup if we have more than 10 records
        try {
            $countStmt = $db->query(
                "SELECT COUNT(*) as count FROM user_settings WHERE user_id = ?",
                [$user['id']]
            );
            $countData = $countStmt->fetch();
            $totalRecords = (int)$countData['count'];
            
            if ($totalRecords > 10) {
                // Get IDs to keep
                $keepStmt = $db->query(
                    "SELECT id FROM user_settings WHERE user_id = ? ORDER BY id DESC LIMIT 10",
                    [$user['id']]
                );
                $keepRows = $keepStmt->fetchAll();
                $keepIds = array_column($keepRows, 'id');
                
                if (!empty($keepIds) && count($keepIds) > 0) {
                    $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
                    $db->query(
                        "DELETE FROM user_settings WHERE user_id = ? AND id NOT IN ($placeholders)",
                        array_merge([$user['id']], $keepIds)
                    );
                }
            }
        } catch (Exception $cleanupError) {
            // Log cleanup error but don't fail the save operation
            logError("Cleanup failed (non-fatal)", [
                'user_id' => $user['id'],
                'error' => $cleanupError->getMessage()
            ]);
            // Continue with the save operation even if cleanup fails
        }
    } else {
        // Settings unchanged - just update the timestamp of the latest record
        if ($currentData) {
            $db->query(
                "UPDATE user_settings SET updated_at = NOW() WHERE id = ?",
                [$currentData['id']]
            );
            $newVersion = $currentData['version']; // Keep same version
        } else {
            // No existing record, insert first one
            $db->query(
                "INSERT INTO user_settings (user_id, settings_json, version) VALUES (?, ?, ?)",
                [$user['id'], $settingsJson, $newVersion]
            );
        }
    }
    
    // Update last_sync_at
    $db->query(
        "UPDATE users SET last_sync_at = NOW() WHERE id = ?",
        [$user['id']]
    );
    
    // Commit transaction
    if (!$db->commit()) {
        throw new Exception('Failed to commit transaction');
    }
} catch (Exception $e) {
    $db->rollback();
    $errorMessage = $e->getMessage();
    $errorTrace = $e->getTraceAsString();
    logError("Failed to save settings", [
        'user_id' => $user['id'] ?? 'unknown',
        'error' => $errorMessage,
        'trace' => $errorTrace
    ]);
    
    // Send error response with more details in development, generic in production
    $errorResponse = 'Failed to save settings';
    if (defined('ENVIRONMENT') && ENVIRONMENT !== 'production') {
        $errorResponse .= ': ' . $errorMessage;
    }
    sendErrorResponse($errorResponse, 500, 'SAVE_ERROR');
}

    sendSuccessResponse([
        'version' => $newVersion,
        'last_sync_at' => date('Y-m-d\TH:i:s\Z')
    ]);
} catch (Throwable $e) {
    // Catch any unhandled exceptions or errors
    logError("Unhandled exception in save_settings.php", [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ]);
    
    $errorResponse = 'An unexpected error occurred';
    if (defined('ENVIRONMENT') && ENVIRONMENT !== 'production') {
        $errorResponse .= ': ' . $e->getMessage();
    }
    sendErrorResponse($errorResponse, 500, 'UNEXPECTED_ERROR');
}
