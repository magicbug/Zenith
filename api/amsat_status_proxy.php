<?php
// File: api/amsat-status-proxy.php

// Get POST data
$postData = json_decode(file_get_contents('php://input'), true);

// Extract time components directly from the frontend time string
$timeParts = explode(' ', $postData['timeOn']);
$dateParts = explode('-', $timeParts[0]);
$timeComponents = explode(':', $timeParts[1]);

// Debug the incoming time
error_log("Incoming time from frontend: " . $postData['timeOn']);

// Build the AMSAT status URL
$url = 'https://amsat.org/status/submit.php?' . http_build_query([
    'SatSubmit' => 'yes',
    'Confirm' => 'yes',
    'SatName' => $postData['satName'],
    'SatYear' => $dateParts[0],
    'SatMonth' => str_pad($dateParts[1], 2, '0', STR_PAD_LEFT),
    'SatDay' => str_pad($dateParts[2], 2, '0', STR_PAD_LEFT),
    'SatHour' => str_pad($timeComponents[0], 2, '0', STR_PAD_LEFT),
    'SatPeriod' => (intdiv((int)$timeComponents[1] - 1, 15)),
    'SatCall' => $postData['callsign'],
    'SatReport' => $postData['status'],
    'SatGridSquare' => $postData['gridSquare']
]);

error_log("Final URL with time components: " . $url);

// Initialize cURL session
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Return result to the client
http_response_code($httpCode);
echo $response;