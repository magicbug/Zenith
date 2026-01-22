<?php
/**
 * Admin API Directory Index
 * Returns 403 Forbidden to prevent directory listing
 */

http_response_code(403);
header('Content-Type: application/json; charset=utf-8');

echo json_encode([
    'error' => 'Forbidden',
    'message' => 'Admin API directory access is restricted.'
], JSON_PRETTY_PRINT);
