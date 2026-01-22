<?php
/**
 * Request Magic Link Endpoint
 * POST: { "email": "user@example.com" }
 * Generates and sends a magic link via AWS SES
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/rate_limit.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/utils.php';

// Set headers
setCorsHeaders();
setSecurityHeaders();

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}

// Get request body
$data = getJsonBody();

// Validate email
if (empty($data['email']) || !validateEmail($data['email'])) {
    sendErrorResponse('Valid email address required', 400, 'INVALID_EMAIL');
}

$email = strtolower(trim($data['email']));

// Check rate limit
$rateLimiter = new RateLimiter();
$rateLimitCheck = $rateLimiter->checkMagicLinkLimit($email);

if (!$rateLimitCheck['allowed']) {
    header('Retry-After: ' . $rateLimitCheck['retry_after']);
    sendErrorResponse('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
}

// Generate token
$token = Auth::generateToken(32);
$expiresAt = date('Y-m-d H:i:s', time() + (MAGIC_LINK_EXPIRY_MINUTES * 60));

// Store magic link in database
$db = DB::getInstance();
try {
    $db->query(
        "INSERT INTO magic_links (email, token, expires_at) VALUES (?, ?, ?)",
        [$email, $token, $expiresAt]
    );
} catch (Exception $e) {
    logError("Failed to create magic link", ['email' => $email, 'error' => $e->getMessage()]);
    sendErrorResponse('Failed to create magic link', 500, 'DATABASE_ERROR');
}

// Send email via AWS SES
$magicLink = SYNC_BASE_URL . '/verify.php?token=' . urlencode($token);

// Load email template
$emailTemplate = file_get_contents(__DIR__ . '/../email_template.html');
$emailBody = str_replace('{{MAGIC_LINK}}', $magicLink, $emailTemplate);

// Plain text version
$plainTextBody = "Your Zenith Settings Sync Magic Link\n\n";
$plainTextBody .= "Click this link to verify your email and get your API key:\n";
$plainTextBody .= $magicLink . "\n\n";
$plainTextBody .= "This link expires in 15 minutes.\n\n";
$plainTextBody .= "If you didn't request this link, you can safely ignore this email.\n";

// Send email using AWS SES
try {
    if (TEST_MODE) {
        // In test mode, just log the email
        logError("TEST MODE: Would send email", [
            'to' => $email,
            'subject' => 'Your Zenith Settings Sync Magic Link',
            'link' => $magicLink
        ]);
    } else {
        // Check if AWS SDK is available
        if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
            require_once __DIR__ . '/../vendor/autoload.php';
            
            $sesClient = new Aws\Ses\SesClient([
                'version' => 'latest',
                'region' => AWS_SES_REGION,
                'credentials' => [
                    'key' => AWS_SES_ACCESS_KEY_ID,
                    'secret' => AWS_SES_SECRET_ACCESS_KEY,
                ],
            ]);
            
            $result = $sesClient->sendEmail([
                'Source' => AWS_SES_FROM_EMAIL,
                'Destination' => [
                    'ToAddresses' => [$email],
                ],
                'Message' => [
                    'Subject' => [
                        'Data' => 'Your Zenith Settings Sync Magic Link',
                        'Charset' => 'UTF-8',
                    ],
                    'Body' => [
                        'Html' => [
                            'Data' => $emailBody,
                            'Charset' => 'UTF-8',
                        ],
                        'Text' => [
                            'Data' => $plainTextBody,
                            'Charset' => 'UTF-8',
                        ],
                    ],
                ],
            ]);
        } else {
            // Fallback: Use mail() function if AWS SDK not available
            $headers = "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
            $headers .= "From: " . AWS_SES_FROM_EMAIL . "\r\n";
            mail($email, 'Your Zenith Settings Sync Magic Link', $emailBody, $headers);
        }
    }
} catch (Exception $e) {
    logError("Failed to send email", ['email' => $email, 'error' => $e->getMessage()]);
    // Don't expose error to user, but log it
    // Still return success to prevent email enumeration
}

sendSuccessResponse(['message' => 'Magic link sent to your email']);
