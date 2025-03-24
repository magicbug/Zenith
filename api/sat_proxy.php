<?php
// Set headers to allow cross-origin requests and specify JSON response
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET');

// Function to log debug information
function debug_log($message) {
    $log_file = __DIR__ . '/debug_log.txt';
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($log_file, "[$timestamp] [SAT_PROXY] $message\n", FILE_APPEND);
}

// Get parameters from the request
$sat_address = isset($_GET['address']) ? $_GET['address'] : '';
$action = isset($_GET['action']) ? $_GET['action'] : '';
$satellite = isset($_GET['satellite']) ? $_GET['satellite'] : '';
$command = isset($_GET['command']) ? $_GET['command'] : '';

// Check if required parameters are provided
if (empty($sat_address)) {
    debug_log("Error: Missing required parameter 'address'");
    echo json_encode(['error' => 'Missing required parameter: address']);
    exit;
}

// Properly format the address if needed
if (!preg_match('/^https?:\/\//', $sat_address)) {
    $sat_address = 'http://' . $sat_address;
}

// Determine the API endpoint based on the action
$api_url = $sat_address;
if ($action === 'status') {
    // For status check, append 'status' to the URL if not already present
    if (!preg_match('/\/status$/', $api_url)) {
        $api_url = rtrim($api_url, '/') . '/status';
    }
} elseif ($action === 'select' && !empty($satellite)) {
    // For satellite selection, construct the proper URL parameter
    $api_url = $api_url . '?a=U|' . urlencode($satellite);
} elseif ($action === 'cmd' && !empty($command)) {
    // For command actions (r, v, d, etc.)
    $api_url = $api_url . '/cmd?a=' . urlencode($command);
} elseif ($action === 'track') {
    // For tracking data (get current az/el and other status)
    $api_url = $api_url . '/track';
} else {
    // Default to status check if action is invalid
    debug_log("Warning: Invalid action '$action', defaulting to status check");
    if (!preg_match('/\/status$/', $api_url)) {
        $api_url = rtrim($api_url, '/') . '/status';
    }
}

debug_log("Making request to: $api_url");

// Initialize cURL session
$ch = curl_init();

// Set cURL options
curl_setopt($ch, CURLOPT_URL, $api_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5); // 5 seconds connection timeout
curl_setopt($ch, CURLOPT_TIMEOUT, 10); // 10 seconds total timeout

// Execute cURL request
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// Check for cURL errors
if (curl_errno($ch)) {
    debug_log("cURL Error: " . curl_error($ch));
    echo json_encode([
        'error' => 'Connection error: ' . curl_error($ch),
        'success' => false
    ]);
    curl_close($ch);
    exit;
}

curl_close($ch);

// Check HTTP response code
if ($http_code >= 400) {
    debug_log("HTTP Error: $http_code, Response: $response");
    echo json_encode([
        'error' => "HTTP Error $http_code",
        'response' => $response,
        'success' => false
    ]);
    exit;
}

// Try to parse JSON response
$data = json_decode($response, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    debug_log("JSON parsing error: " . json_last_error_msg() . ", Raw response: $response");
    
    // If not valid JSON but we got a response, it might be a success indication
    // for satellite selection or command which doesn't always return JSON
    if (($action === 'select' || $action === 'cmd') && !empty($response)) {
        echo json_encode([
            'message' => 'Request sent successfully',
            'response' => $response,
            'success' => true
        ]);
    } else {
        echo json_encode([
            'error' => 'Invalid response format: ' . json_last_error_msg(),
            'response' => $response,
            'success' => false
        ]);
    }
    exit;
}

// Return the successful response
debug_log("Success: " . substr(json_encode($data), 0, 100) . "...");
echo json_encode([
    'data' => $data,
    'success' => true
]);