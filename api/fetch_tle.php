<?php

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Content-Type: text/plain');

$url = 'https://tle.oscarwatch.org/';

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_USERAGENT, 'Zenith-TLE-Proxy/1.0');
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$response = curl_exec($ch);
$curlErrno = curl_errno($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($curlErrno !== 0 || $response === false) {
    http_response_code(503);
    echo "Unable to fetch TLE data.\n";
    exit;
}

if ($httpCode !== 200) {
    http_response_code(502);
    echo "Unable to fetch TLE data.\n";
    exit;
}

echo $response;
