<?php
// Set headers to allow CORS
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Return a simple JSON response
echo json_encode([
    'status' => 'success',
    'message' => 'PHP is working correctly',
    'server_info' => [
        'php_version' => phpversion(),
        'curl_enabled' => function_exists('curl_init'),
        'json_enabled' => function_exists('json_encode'),
        'time' => date('Y-m-d H:i:s')
    ]
]);
?>
