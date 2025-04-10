<?php
// File: api/amsat-status-proxy.php

// Get POST data
$postData = json_decode(file_get_contents('php://input'), true);

// Map frontend field names to expected field names
$mappedData = [
    'date' => $postData['timeOn'],
    'satName' => $postData['satelliteName'],
    'callsign' => $postData['stationCallsign'],
    'status' => $postData['status'],
    'gridSquare' => $postData['myGridsquare']
];

// Validate required fields
$requiredFields = ['date', 'satName', 'callsign', 'status', 'gridSquare'];
$missingFields = [];
foreach ($requiredFields as $field) {
    if (!isset($mappedData[$field]) || empty($mappedData[$field])) {
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

// Parse the UTC time string directly
$timeParts = explode(' ', $mappedData['date']);
$dateParts = explode('-', $timeParts[0]);
$timeComponents = explode(':', $timeParts[1]);

// Debug the time handling
error_log("Original UTC time from frontend: " . $mappedData['date']);
error_log("Parsed components - Year: {$dateParts[0]}, Month: {$dateParts[1]}, Day: {$dateParts[2]}, Hour: {$timeComponents[0]}, Minute: {$timeComponents[1]}");

// Build the AMSAT status URL
$url = 'https://amsat.org/status/submit.php?' . http_build_query([
    'SatSubmit' => 'yes',
    'Confirm' => 'yes',
    'SatName' => $mappedData['satName'],
    'SatYear' => $dateParts[0],
    'SatMonth' => str_pad($dateParts[1], 2, '0', STR_PAD_LEFT),
    'SatDay' => str_pad($dateParts[2], 2, '0', STR_PAD_LEFT),
    'SatHour' => str_pad($timeComponents[0], 2, '0', STR_PAD_LEFT),
    'SatPeriod' => (intdiv((int)$timeComponents[1] - 1, 15)),
    'SatCall' => $mappedData['callsign'],
    'SatReport' => $mappedData['status'],
    'SatGridSquare' => $mappedData['gridSquare']
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