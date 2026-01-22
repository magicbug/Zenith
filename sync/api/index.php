<?php
/**
 * API Directory Index
 * Returns 403 Forbidden to prevent directory listing
 */

http_response_code(403);
header('Content-Type: application/json; charset=utf-8');

echo json_encode([
    'error' => 'Forbidden',
    'message' => 'Direct access to API directory is not allowed. Use specific endpoints.',
    'endpoints' => [
        'health' => '/api/health.php',
        'request_magic_link' => '/api/request_magic_link.php',
        'get_settings' => '/api/get_settings.php',
        'save_settings' => '/api/save_settings.php'
    ]
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
