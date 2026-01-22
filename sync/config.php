<?php
/**
 * Zenith Settings Sync Configuration
 * 
 * Loads configuration from environment variables or .env file
 * For production, use environment variables or a secure config file outside web root
 */

// Load .env file if it exists (for local development)
if (file_exists(__DIR__ . '/.env')) {
    $envFile = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envFile as $line) {
        if (strpos(trim($line), '#') === 0) continue; // Skip comments
        if (strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (!isset($_ENV[$key])) {
            $_ENV[$key] = $value;
        }
    }
}

// Database Configuration
define('DB_HOST', $_ENV['DB_HOST'] ?? 'localhost');
define('DB_NAME', $_ENV['DB_NAME'] ?? 'zenith_sync');
define('DB_USER', $_ENV['DB_USER'] ?? 'zenith_sync_user');
define('DB_PASS', $_ENV['DB_PASS'] ?? '');
define('DB_CHARSET', $_ENV['DB_CHARSET'] ?? 'utf8mb4');

// AWS SES Configuration
define('AWS_SES_ACCESS_KEY_ID', $_ENV['AWS_SES_ACCESS_KEY_ID'] ?? '');
define('AWS_SES_SECRET_ACCESS_KEY', $_ENV['AWS_SES_SECRET_ACCESS_KEY'] ?? '');
define('AWS_SES_REGION', $_ENV['AWS_SES_REGION'] ?? 'us-east-1');
define('AWS_SES_FROM_EMAIL', $_ENV['AWS_SES_FROM_EMAIL'] ?? 'noreply@zenithtracker.org');

// Application URLs
define('SYNC_BASE_URL', $_ENV['SYNC_BASE_URL'] ?? 'https://sync.zenithtracker.org');
define('MAIN_APP_URL', $_ENV['MAIN_APP_URL'] ?? 'https://zenithtracker.org');

// Security Settings
define('MAGIC_LINK_EXPIRY_MINUTES', (int)($_ENV['MAGIC_LINK_EXPIRY_MINUTES'] ?? 15));
define('RATE_LIMIT_MAGIC_LINK_PER_HOUR', (int)($_ENV['RATE_LIMIT_MAGIC_LINK_PER_HOUR'] ?? 3));
define('RATE_LIMIT_API_CALLS_PER_MINUTE', (int)($_ENV['RATE_LIMIT_API_CALLS_PER_MINUTE'] ?? 100));
define('SETTINGS_MAX_SIZE_MB', (int)($_ENV['SETTINGS_MAX_SIZE_MB'] ?? 1));
define('SETTINGS_MAX_SIZE_BYTES', SETTINGS_MAX_SIZE_MB * 1024 * 1024);

// Admin Configuration
define('ADMIN_KEY', $_ENV['ADMIN_KEY'] ?? '');

// CORS Configuration
// Default includes common localhost ports for development
$corsOrigins = $_ENV['CORS_ALLOWED_ORIGINS'] ?? 'https://zenithtracker.org,https://www.zenithtracker.org';
define('CORS_ALLOWED_ORIGINS', array_map('trim', explode(',', $corsOrigins)));

// Development/Testing
define('ENVIRONMENT', $_ENV['ENVIRONMENT'] ?? 'production');
define('TEST_MODE', filter_var($_ENV['TEST_MODE'] ?? 'false', FILTER_VALIDATE_BOOLEAN));
define('LOG_ERRORS', filter_var($_ENV['LOG_ERRORS'] ?? 'true', FILTER_VALIDATE_BOOLEAN));
define('LOG_FILE_PATH', $_ENV['LOG_FILE_PATH'] ?? __DIR__ . '/logs/errors.log');

// Ensure log directory exists
if (LOG_ERRORS && !is_dir(dirname(LOG_FILE_PATH))) {
    @mkdir(dirname(LOG_FILE_PATH), 0755, true);
}
