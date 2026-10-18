<?php

require_once __DIR__ . '/proxy_url_helper.php';

error_reporting(E_ALL);
ini_set('display_errors', '0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

$rawData = file_get_contents('php://input');
$data = json_decode($rawData, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit();
}

if (!isset($data['key']) || !isset($data['radio']) || !isset($data['frequency']) ||
    !isset($data['mode'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required fields']);
    exit();
}

$cloudlogUrl = isset($data['cloudlog_url']) ? (string) $data['cloudlog_url'] : '';
unset($data['cloudlog_url']);

if ($cloudlogUrl === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Cloudlog URL is required']);
    exit();
}

$validated = proxy_validate_base_url($cloudlogUrl);
if (isset($validated['error'])) {
    http_response_code(400);
    echo json_encode(['error' => $validated['error']]);
    exit();
}

$apiEndpoint = $validated['base_url'] . '/index.php/api/radio';

$ch = curl_init($apiEndpoint);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
]);
proxy_apply_cloudlog_tls_verify($ch);

proxy_apply_curl_http_restrictions($ch);
proxy_apply_curl_resolve($ch, $validated);

$response = curl_exec($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    curl_close($ch);
    http_response_code(502);
    echo json_encode(['error' => 'Unable to reach Cloudlog']);
    exit();
}

curl_close($ch);

http_response_code($httpCode);
echo $response;
