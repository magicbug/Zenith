<?php
/**
 * Health Check Endpoint
 * GET: No authentication required
 * Returns system health status
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';

header('Content-Type: application/json; charset=utf-8');

$status = [
    'status' => 'ok',
    'version' => '1.0',
    'timestamp' => date('Y-m-d\TH:i:s\Z')
];

// Check database connection
try {
    $db = DB::getInstance();
    $db->getConnection();
    $status['database'] = 'connected';
} catch (Exception $e) {
    $status['database'] = 'disconnected';
    $status['status'] = 'error';
    http_response_code(503);
}

echo json_encode($status, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
