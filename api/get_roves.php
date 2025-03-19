<?php
// Enable error reporting for debugging
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Set headers to allow CORS from your domain
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Get API key from request
$apiKey = isset($_GET['key']) ? $_GET['key'] : '';

if (empty($apiKey)) {
    echo json_encode(['error' => 'API key is required']);
    exit();
}

// Log request (for debugging - remove in production)
file_put_contents('debug_log.txt', date('Y-m-d H:i:s') . " - Request received with key: " . substr($apiKey, 0, 5) . "...\n", FILE_APPEND);

// Initialize cURL session
$ch = curl_init();

// Set cURL options
curl_setopt($ch, CURLOPT_URL, 'https://hams.at/api/alerts/upcoming');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $apiKey
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 10); // 10-second timeout
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);

// Execute cURL request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// Log response info (for debugging - remove in production)
file_put_contents('debug_log.txt', date('Y-m-d H:i:s') . " - Response code: $httpCode\n", FILE_APPEND);

// Check for errors
if (curl_errno($ch)) {
    $error = curl_error($ch);
    file_put_contents('debug_log.txt', date('Y-m-d H:i:s') . " - cURL error: $error\n", FILE_APPEND);
    echo json_encode(['error' => 'cURL error: ' . $error]);
    exit();
}

// Close cURL session
curl_close($ch);

// Check for valid JSON response
json_decode($response);
if (json_last_error() !== JSON_ERROR_NONE) {
    file_put_contents('debug_log.txt', date('Y-m-d H:i:s') . " - Invalid JSON response: " . substr($response, 0, 100) . "...\n", FILE_APPEND);
    echo json_encode(['error' => 'Invalid JSON response from API']);
    exit();
}

// Return the API response with original status code
http_response_code($httpCode);
echo $response;
?>
