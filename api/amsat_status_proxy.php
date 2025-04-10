<?php
// File: api/amsat-status-proxy.php

// Get POST data
$postData = json_decode(file_get_contents('php://input'), true);
file_put_contents('debug_log.txt', "=== New Request ===\n", FILE_APPEND);
file_put_contents('debug_log.txt', "Raw POST data: " . print_r($postData, true) . "\n", FILE_APPEND);

// Map frontend field names to expected field names
$mappedData = [
    'date' => $postData['timeOn'],
    'satName' => $postData['satelliteName'],
    'callsign' => $postData['stationCallsign'],
    'status' => $postData['status'],
    'gridSquare' => $postData['myGridsquare']
];
file_put_contents('debug_log.txt', "Mapped UTC time: " . $mappedData['date'] . "\n", FILE_APPEND);

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

// Parse the time string
$timeParts = explode(' ', $mappedData['date']);
$dateParts = explode('-', $timeParts[0]);
$timeComponents = explode(':', $timeParts[1]);

file_put_contents('debug_log.txt', "Time parsing steps:\n", FILE_APPEND);
file_put_contents('debug_log.txt', "1. Original UTC string: " . $mappedData['date'] . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "2. Split date/time: " . print_r($timeParts, true) . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "3. Date components: " . print_r($dateParts, true) . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "4. Time components: " . print_r($timeComponents, true) . "\n", FILE_APPEND);

// Calculate period
$minutes = (int)$timeComponents[1];
$period = intdiv($minutes - 1, 15);
file_put_contents('debug_log.txt', "Period calculation: minutes=$minutes, period=$period\n", FILE_APPEND);

// Build the AMSAT status URL
$urlParams = [
    'SatSubmit' => 'yes',
    'Confirm' => 'yes',
    'SatName' => $mappedData['satName'],
    'SatYear' => $dateParts[0],
    'SatMonth' => str_pad($dateParts[1], 2, '0', STR_PAD_LEFT),
    'SatDay' => str_pad($dateParts[2], 2, '0', STR_PAD_LEFT),
    'SatHour' => str_pad($timeComponents[0], 2, '0', STR_PAD_LEFT),
    'SatPeriod' => $period,
    'SatCall' => $mappedData['callsign'],
    'SatReport' => $mappedData['status'],
    'SatGridSquare' => $mappedData['gridSquare']
];

$url = 'https://amsat.org/status/submit.php?' . http_build_query($urlParams);

file_put_contents('debug_log.txt', "=== AMSAT URL Details ===\n", FILE_APPEND);
file_put_contents('debug_log.txt', "Full URL: " . $url . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "URL Parameters:\n", FILE_APPEND);
foreach ($urlParams as $key => $value) {
    file_put_contents('debug_log.txt', "$key: $value\n", FILE_APPEND);
}
file_put_contents('debug_log.txt', "========================\n", FILE_APPEND);

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