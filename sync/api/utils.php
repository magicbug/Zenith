<?php
/**
 * Utility Functions
 * Common helper functions for API endpoints
 */

require_once __DIR__ . '/../config.php';

/**
 * Send JSON response
 */
function sendJsonResponse($data, $statusCode = 200) {
    // Clear any previous output
    if (ob_get_level() > 0) {
        ob_clean();
    }
    
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        // Fallback if JSON encoding fails
        $json = json_encode([
            'success' => false,
            'error' => 'Failed to encode response',
            'code' => 'JSON_ENCODE_ERROR'
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    
    echo $json;
    exit;
}

/**
 * Send error response
 */
function sendErrorResponse($message, $statusCode = 400, $code = null) {
    // Ensure message is not empty
    if (empty($message)) {
        $message = 'An error occurred';
    }
    $response = ['success' => false, 'error' => $message];
    if ($code !== null) {
        $response['code'] = $code;
    }
    sendJsonResponse($response, $statusCode);
}

/**
 * Send success response
 */
function sendSuccessResponse($data = [], $statusCode = 200) {
    $response = array_merge(['success' => true], $data);
    sendJsonResponse($response, $statusCode);
}

/**
 * Set CORS headers
 */
function setCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = defined('CORS_ALLOWED_ORIGINS') ? CORS_ALLOWED_ORIGINS : [];
    
    // Normalize origins (remove trailing slashes)
    $allowedOrigins = array_map(function($o) {
        return rtrim(trim($o), '/');
    }, $allowedOrigins);
    $origin = rtrim(trim($origin), '/');
    
    // Check for localhost (any port) - allow for development
    // Simple check: if origin starts with http://localhost or https://localhost
    $isLocalhost = !empty($origin) && (
        strpos($origin, 'http://localhost') === 0 || 
        strpos($origin, 'https://localhost') === 0 ||
        strpos($origin, 'http://127.0.0.1') === 0 ||
        strpos($origin, 'https://127.0.0.1') === 0
    );
    
    // Check for .local domains (common for local network deployments)
    // Matches: http://satellites.local, http://app.local, etc.
    $isLocalDomain = false;
    if (!empty($origin)) {
        // Extract the host part (remove protocol)
        $hostPart = preg_replace('#^https?://#', '', $origin);
        // Remove port if present
        $hostPart = preg_replace('/:\d+$/', '', $hostPart);
        // Check if it ends with .local
        if (substr($hostPart, -6) === '.local') {
            $isLocalDomain = true;
        }
    }
    
    // Check for IP address origins (common for local network deployments)
    // Matches: http://192.168.x.x, http://10.x.x.x, http://172.16-31.x.x, etc.
    $isIpAddress = false;
    if (!empty($origin)) {
        // Extract the host part (remove protocol)
        $hostPart = preg_replace('#^https?://#', '', $origin);
        // Remove port if present
        $hostPart = preg_replace('/:\d+$/', '', $hostPart);
        // Check if it's an IP address (IPv4)
        if (filter_var($hostPart, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $isIpAddress = true;
        }
    }
    
    // Check for zenithtracker.org subdomains (web.zenithtracker.org, app.zenithtracker.org, etc.)
    $isZenithSubdomain = false;
    if (!empty($origin)) {
        $hostPart = preg_replace('#^https?://#', '', $origin);
        $hostPart = preg_replace('/:\d+$/', '', $hostPart);
        // Check if it's a subdomain of zenithtracker.org
        if (preg_match('/^([a-z0-9-]+\.)?zenithtracker\.org$/i', $hostPart)) {
            $isZenithSubdomain = true;
        }
    }
    
    // Determine if origin should be allowed
    $allowOrigin = false;
    if (!empty($origin)) {
        if (in_array($origin, $allowedOrigins)) {
            $allowOrigin = true;
        } else if ($isLocalhost || $isLocalDomain || $isIpAddress || $isZenithSubdomain) {
            // Always allow localhost, .local domains, IP addresses, and zenithtracker.org subdomains
            $allowOrigin = true;
        } else if (defined('ENVIRONMENT') && ENVIRONMENT !== 'production') {
            // In non-production, allow all origins for easier development
            $allowOrigin = true;
        }
    }
    
    // Set CORS headers - MUST set the exact origin for preflight to work
    if ($allowOrigin && !empty($origin)) {
        header("Access-Control-Allow-Origin: $origin");
    } else if (defined('ENVIRONMENT') && ENVIRONMENT !== 'production' && empty($origin)) {
        // Development fallback when no origin header
        header("Access-Control-Allow-Origin: *");
    } else if (!empty($allowedOrigins)) {
        // Production: only allow configured origins
        header("Access-Control-Allow-Origin: " . $allowedOrigins[0]);
    }
    
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');
    header('Access-Control-Allow-Credentials: false');
    header('Access-Control-Max-Age: 86400');
    
    // Handle preflight requests - MUST return the same origin in the response
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        // For preflight, we MUST return the exact origin that was requested
        // Re-check since this is a separate request
        if (!empty($origin)) {
            $isLocalhostCheck = (
                strpos($origin, 'http://localhost') === 0 || 
                strpos($origin, 'https://localhost') === 0 ||
                strpos($origin, 'http://127.0.0.1') === 0 ||
                strpos($origin, 'https://127.0.0.1') === 0
            );
            
            // Check for .local domain
            $isLocalDomainCheck = false;
            $hostPart = preg_replace('#^https?://#', '', $origin);
            $hostPart = preg_replace('/:\d+$/', '', $hostPart);
            if (substr($hostPart, -6) === '.local') {
                $isLocalDomainCheck = true;
            }
            
            // Check for IP address
            $isIpAddressCheck = false;
            if (filter_var($hostPart, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                $isIpAddressCheck = true;
            }
            
            // Check for zenithtracker.org subdomains
            $isZenithSubdomainCheck = false;
            if (preg_match('/^([a-z0-9-]+\.)?zenithtracker\.org$/i', $hostPart)) {
                $isZenithSubdomainCheck = true;
            }
            
            $isAllowed = in_array($origin, $allowedOrigins) || $isLocalhostCheck || $isLocalDomainCheck || $isIpAddressCheck || $isZenithSubdomainCheck || (defined('ENVIRONMENT') && ENVIRONMENT !== 'production');
            
            if ($isAllowed) {
                // Return the exact origin for preflight
                header("Access-Control-Allow-Origin: $origin");
            }
        }
        http_response_code(200);
        exit;
    }
}

/**
 * Set security headers
 */
function setSecurityHeaders() {
    // Require HTTPS in production
    if (ENVIRONMENT === 'production' && (!isset($_SERVER['HTTPS']) || $_SERVER['HTTPS'] !== 'on')) {
        sendErrorResponse('HTTPS required', 403, 'HTTPS_REQUIRED');
    }
    
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');
}

/**
 * Validate email format
 */
function validateEmail($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * Sanitize input
 */
function sanitizeInput($input) {
    if (is_array($input)) {
        return array_map('sanitizeInput', $input);
    }
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}

/**
 * Log error
 */
function logError($message, $context = []) {
    if (!LOG_ERRORS) {
        return;
    }
    
    $logEntry = [
        'timestamp' => date('Y-m-d H:i:s'),
        'message' => $message,
        'context' => $context,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
    ];
    
    $logLine = date('Y-m-d H:i:s') . " | " . $message;
    if (!empty($context)) {
        $logLine .= " | " . json_encode($context);
    }
    $logLine .= " | IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n";
    
    @error_log($logLine, 3, LOG_FILE_PATH);
}

/**
 * Get JSON request body
 * Note: php://input can only be read once, so we cache the result
 */
function getJsonBody() {
    static $cachedJsonBody = null;
    
    // Return cached body if already read
    if ($cachedJsonBody !== null) {
        return $cachedJsonBody;
    }
    
    $body = file_get_contents('php://input');
    if ($body === false || $body === '') {
        sendErrorResponse('Empty request body', 400, 'EMPTY_BODY');
    }
    
    $data = json_decode($body, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendErrorResponse('Invalid JSON: ' . json_last_error_msg(), 400, 'INVALID_JSON');
    }
    
    // Cache the result
    $cachedJsonBody = $data;
    
    return $data;
}

/**
 * Get API key from request
 */
function getApiKey() {
    // Check header first
    if (isset($_SERVER['HTTP_X_API_KEY'])) {
        return $_SERVER['HTTP_X_API_KEY'];
    }
    
    // Check query parameter
    if (isset($_GET['api_key'])) {
        return $_GET['api_key'];
    }
    
    // Check POST body (will use cached body if already read)
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = getJsonBody();
        if (isset($body['api_key'])) {
            return $body['api_key'];
        }
    }
    
    return null;
}
