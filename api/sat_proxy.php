<?php

require_once __DIR__ . '/proxy_url_helper.php';

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET');

$sat_address = isset($_GET['address']) ? (string) $_GET['address'] : '';
$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
$satellite = isset($_GET['satellite']) ? (string) $_GET['satellite'] : '';
$command = isset($_GET['command']) ? (string) $_GET['command'] : '';

if ($sat_address === '') {
    echo json_encode(['error' => 'Missing required parameter: address']);
    exit;
}

if (!preg_match('#^https?://#i', $sat_address)) {
    $sat_address = 'http://' . $sat_address;
}

$validated = proxy_validate_base_url($sat_address);
if (isset($validated['error'])) {
    http_response_code(400);
    echo json_encode(['error' => $validated['error'], 'success' => false]);
    exit;
}

$api_url = $validated['base_url'];
if ($action === 'status') {
    if (!preg_match('#/status$#', $api_url)) {
        $api_url = $api_url . '/status';
    }
} elseif ($action === 'select' && $satellite !== '') {
    $api_url = $api_url . '?a=U|' . rawurlencode($satellite);
} elseif ($action === 'cmd' && $command !== '') {
    $api_url = $api_url . '/cmd?a=' . rawurlencode($command);
} elseif ($action === 'track') {
    $api_url = $api_url . '/track';
} else {
    if (!preg_match('#/status$#', $api_url)) {
        $api_url = $api_url . '/status';
    }
}

$ch = curl_init($api_url);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);

proxy_apply_curl_http_restrictions($ch);
proxy_apply_curl_resolve($ch, $validated);

$response = curl_exec($ch);
$http_code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    echo json_encode([
        'error' => 'Connection error: ' . curl_error($ch),
        'success' => false,
    ]);
    curl_close($ch);
    exit;
}

curl_close($ch);

if ($http_code >= 400) {
    echo json_encode([
        'error' => "HTTP Error $http_code",
        'response' => $response,
        'success' => false,
    ]);
    exit;
}

$data = json_decode($response, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    if (($action === 'select' || $action === 'cmd') && $response !== '') {
        echo json_encode([
            'message' => 'Request sent successfully',
            'response' => $response,
            'success' => true,
        ]);
    } else {
        echo json_encode([
            'error' => 'Invalid response format: ' . json_last_error_msg(),
            'response' => $response,
            'success' => false,
        ]);
    }
    exit;
}

echo json_encode([
    'data' => $data,
    'success' => true,
]);
