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

// Create DateTime object from the input time (already in UTC)
$dateTime = new DateTime($mappedData['date'], new DateTimeZone('UTC'));

// Extract components from the DateTime object
$year = $dateTime->format('Y');
$month = $dateTime->format('m');
$day = $dateTime->format('d');
$hour = $dateTime->format('H');
$minute = $dateTime->format('i');

// Debug the time handling
error_log("Input time (UTC): " . $mappedData['date']);
error_log("Processed time (UTC): " . $dateTime->format('Y-m-d H:i:s'));

// Build the AMSAT status URL
$url = 'https://amsat.org/status/submit.php?' . http_build_query([
    'SatSubmit' => 'yes',
    'Confirm' => 'yes',
    'SatName' => $mappedData['satName'],
    'SatYear' => $year,
    'SatMonth' => $month,
    'SatDay' => $day,
    'SatHour' => $hour,
    'SatPeriod' => (intdiv((int)$minute - 1, 15)),
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