<?php
// File: api/amsat-status-proxy.php

// Get POST data
$postData = json_decode(file_get_contents('php://input'), true);

// Build the AMSAT status URL
$dateTime = new DateTime($postData['timeOn'], new DateTimeZone('UTC'));
$url = 'https://amsat.org/status/submit.php?' . http_build_query([
    'SatSubmit' => 'yes',
    'Confirm' => 'yes',
    'SatName' => $postData['satName'],
    'SatYear' => $dateTime->format('Y'),
    'SatMonth' => str_pad($dateTime->format('m'), 2, '0', STR_PAD_LEFT),
    'SatDay' => str_pad($dateTime->format('d'), 2, '0', STR_PAD_LEFT),
    'SatHour' => str_pad($dateTime->format('H'), 2, '0', STR_PAD_LEFT),
    'SatPeriod' => (intdiv((int)$dateTime->format('i') - 1, 15)),
    'SatCall' => $postData['callsign'],
    'SatReport' => $postData['status'],
    'SatGridSquare' => $postData['gridSquare']
]);

// Initialize cURL session
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Return result to the client
http_response_code($httpCode);
echo $response;