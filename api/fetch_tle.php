<?php
// Allow requests from any origin - adjust for security in production
header("Access-Control-Allow-Origin: *");
header("Content-Type: text/plain");

// URL for TLE data - updated to specifically target amateur radio satellites
$url = "https://tle.oscarwatch.org/";

// Create debug log
$debug = "Debug info:\n";
$debug .= "Fetching from URL: " . $url . "\n";

// Use cURL to get TLE data
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);  // For testing only - consider enabling in production
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);  // For testing only - consider enabling in production
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
curl_setopt($ch, CURLOPT_TIMEOUT, 30); // Set timeout to 30 seconds

$response = curl_exec($ch);
$error = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

// Add debug information
$debug .= "HTTP Code: " . $httpCode . "\n";
$debug .= "Content Type: " . $contentType . "\n";
$debug .= "Error: " . ($error ? $error : "None") . "\n";
$debug .= "Response Length: " . strlen($response) . " bytes\n";
$debug .= "First 100 chars of response: " . substr($response, 0, 100) . "...\n";

// Check for errors
if ($error) {
    header("HTTP/1.1 500 Internal Server Error");
    echo "Error fetching TLE data: " . $error . "\n\n" . $debug;
} else if ($httpCode != 200) {
    header("HTTP/1.1 " . $httpCode);
    echo "Error: Received HTTP status code " . $httpCode . " from TLE source\n\n" . $debug;
} else {
    // We'll skip the validation since we now see that the data is valid
    // Just return the TLE data as-is
    echo $response;
}
?>