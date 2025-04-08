<?php
// Enable error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Log the request
$logFile = __DIR__ . '/debug_log.txt';
$logMessage = date('Y-m-d H:i:s') . " - Request received\n";
file_put_contents($logFile, $logMessage, FILE_APPEND);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

// Get the raw POST data
$rawData = file_get_contents('php://input');
$data = json_decode($rawData, true);

// Log the received data
$logMessage = date('Y-m-d H:i:s') . " - Received data: " . $rawData . "\n";
file_put_contents($logFile, $logMessage, FILE_APPEND);

// Validate required fields
if (!isset($data['key']) || !isset($data['radio']) || !isset($data['frequency']) || 
    !isset($data['mode'])) {
    $error = 'Missing required fields';
    $logMessage = date('Y-m-d H:i:s') . " - Error: " . $error . "\n";
    file_put_contents($logFile, $logMessage, FILE_APPEND);
    http_response_code(400);
    echo json_encode(['error' => $error]);
    exit();
}

// Get the Cloudlog URL from the request
$cloudlogUrl = isset($data['cloudlog_url']) ? $data['cloudlog_url'] : '';

// Remove the cloudlog_url from the data before sending
unset($data['cloudlog_url']);

// Validate Cloudlog URL
if (empty($cloudlogUrl)) {
    $error = 'Cloudlog URL is required';
    $logMessage = date('Y-m-d H:i:s') . " - Error: " . $error . "\n";
    file_put_contents($logFile, $logMessage, FILE_APPEND);
    http_response_code(400);
    echo json_encode(['error' => $error]);
    exit();
}

// Clean up the URL
$cloudlogUrl = rtrim($cloudlogUrl, '/');

// Construct the full API endpoint
$apiEndpoint = $cloudlogUrl . '/index.php/api/radio';

// Log the API endpoint
$logMessage = date('Y-m-d H:i:s') . " - Sending to API endpoint: " . $apiEndpoint . "\n";
file_put_contents($logFile, $logMessage, FILE_APPEND);

// Initialize cURL
$ch = curl_init($apiEndpoint);

// Set cURL options
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Only for testing, remove in production
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // Only for testing, remove in production

// Execute the request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// Log the response
$logMessage = date('Y-m-d H:i:s') . " - API response code: " . $httpCode . "\n";
$logMessage .= date('Y-m-d H:i:s') . " - API response: " . $response . "\n";
file_put_contents($logFile, $logMessage, FILE_APPEND);

// Check for cURL errors
if (curl_errno($ch)) {
    $error = 'CURL error: ' . curl_error($ch);
    $logMessage = date('Y-m-d H:i:s') . " - Error: " . $error . "\n";
    file_put_contents($logFile, $logMessage, FILE_APPEND);
    http_response_code(500);
    echo json_encode(['error' => $error]);
    curl_close($ch);
    exit();
}

curl_close($ch);

// Return the response from Cloudlog
http_response_code($httpCode);
echo $response; 