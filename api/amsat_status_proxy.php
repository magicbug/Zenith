<?php
// File: api/amsat-status-proxy.php

// Get POST data
$postData = json_decode(file_get_contents('php://input'), true);
file_put_contents('debug_log.txt', "Raw POST data: " . print_r($postData, true) . "\n", FILE_APPEND);

// Map frontend field names to expected field names
$mappedData = [
    'date' => $postData['timeOn'],
    'satName' => $postData['satelliteName'],
    'callsign' => $postData['stationCallsign'],
    'status' => $postData['status'],
    'gridSquare' => $postData['myGridsquare']
];
file_put_contents('debug_log.txt', "Mapped data: " . print_r($mappedData, true) . "\n", FILE_APPEND);

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
file_put_contents('debug_log.txt', "1. Original string: " . $mappedData['date'] . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "2. After space split: " . print_r($timeParts, true) . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "3. Date parts: " . print_r($dateParts, true) . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "4. Time components: " . print_r($timeComponents, true) . "\n", FILE_APPEND);

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

file_put_contents('debug_log.txt', "Final URL components:\n", FILE_APPEND);
file_put_contents('debug_log.txt', "Year: " . $dateParts[0] . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "Month: " . str_pad($dateParts[1], 2, '0', STR_PAD_LEFT) . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "Day: " . str_pad($dateParts[2], 2, '0', STR_PAD_LEFT) . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "Hour: " . str_pad($timeComponents[0], 2, '0', STR_PAD_LEFT) . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "Minute: " . $timeComponents[1] . "\n", FILE_APPEND);
file_put_contents('debug_log.txt', "Final URL: " . $url . "\n", FILE_APPEND);

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