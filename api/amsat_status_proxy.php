<?php
// File: api/amsat-status-proxy.php

// Get POST data
$postData = json_decode(file_get_contents('php://input'), true);

// Validate required fields
$requiredFields = ['date', 'satName', 'callsign', 'status', 'gridSquare'];
$missingFields = [];
foreach ($requiredFields as $field) {
    if (!isset($postData[$field]) || empty($postData[$field])) {
        $missingFields[] = $field;
    }
}

if (!empty($missingFields)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Missing required fields',
        'missing' => $missingFields,
        'received' => $postData
    ]);
    exit;
}

// Extract time components directly from the frontend time string
$timeParts = explode(' ', $postData['date']);
$dateParts = explode('-', $timeParts[0]);
$timeComponents = explode(':', $timeParts[1]);

// Debug the incoming time
error_log("Incoming time from frontend: " . $postData['date']);

// Build the AMSAT status URL
$url = 'https://amsat.org/status/submit.php?' . http_build_query([
    'SatSubmit' => 'yes',
    'Confirm' => 'yes',
    'SatName' => $postData['satName'],
<<<<<<< HEAD
    'SatYear' => $dateParts[0],
    'SatMonth' => str_pad($dateParts[1], 2, '0', STR_PAD_LEFT),
    'SatDay' => str_pad($dateParts[2], 2, '0', STR_PAD_LEFT),
    'SatHour' => str_pad($timeComponents[0], 2, '0', STR_PAD_LEFT),
    'SatPeriod' => (intdiv((int)$timeComponents[1] - 1, 15)),
=======
    'SatYear' => date('Y', strtotime($postData['date'])),
    'SatMonth' => date('m', strtotime($postData['date'])),
    'SatDay' => date('d', strtotime($postData['date'])),
    'SatHour' => date('H', strtotime($postData['date'])),
    'SatPeriod' => $postData['period'],
>>>>>>> parent of 77609b6 (fix utc reporting time error)
    'SatCall' => $postData['callsign'],
    'SatReport' => $postData['status'],
    'SatGridSquare' => $postData['gridSquare']
]);

error_log("Final URL with time components: " . $url);

// Initialize cURL session
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // For testing only
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

// Return result to the client
http_response_code($httpCode);
echo json_encode([
    'status' => $httpCode,
    'url' => $url,
    'response' => $response,
    'error' => $error,
    'data' => $postData
]);