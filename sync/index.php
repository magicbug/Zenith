<?php
/**
 * Index page for sync.zenithtracker.org
 * Landing page for the Zenith Settings Sync service
 */

require_once __DIR__ . '/config.php';

$mainAppUrl = defined('MAIN_APP_URL') ? MAIN_APP_URL : 'https://zenithtracker.org';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zenith Settings Sync</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            background-color: #f4f4f4;
        }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-lg max-w-2xl w-full p-8">
        <div class="bg-[#2c3e50] text-white p-6 rounded-t-lg -m-8 mb-6">
            <h1 class="text-3xl font-bold text-center">Zenith Settings Sync</h1>
        </div>

        <div class="mb-6">
            <div class="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
                <div class="flex">
                    <i class="fas fa-check-circle text-green-500 mr-3 mt-1"></i>
                    <div>
                        <p class="text-green-700 font-semibold">Service is Running</p>
                        <p class="text-green-600 text-sm">Backend API for syncing Zenith settings across devices</p>
                    </div>
                </div>
            </div>

            <div class="prose max-w-none">
                <h3 class="text-lg font-semibold mb-3">How to Use</h3>
                <ol class="list-decimal list-inside space-y-2 mb-6">
                    <li>Open the <a href="<?php echo htmlspecialchars($mainAppUrl); ?>" target="_blank" class="text-[#4a90e2] hover:underline">Zenith Satellite Tracker app</a></li>
                    <li>Go to <strong>Options</strong> → <strong>General</strong> tab</li>
                    <li>Find the <strong>"Settings Sync"</strong> section</li>
                    <li>Enter your email address and click <strong>"Request Magic Link"</strong></li>
                    <li>Check your email and click the magic link</li>
                    <li>Copy your API key and paste it into the Zenith app</li>
                </ol>

                <h3 class="text-lg font-semibold mb-3">API Endpoints</h3>
                <ul class="list-disc list-inside space-y-2 mb-6">
                    <li><a href="api/health.php" class="text-[#4a90e2] hover:underline">Health Check</a> - System status</li>
                    <li><a href="verify.php" class="text-[#4a90e2] hover:underline">Verify Magic Link</a> - Email verification page</li>
                </ul>

                <div class="bg-blue-50 border-l-4 border-blue-500 p-4">
                    <p class="text-blue-700 text-sm">
                        <i class="fas fa-info-circle mr-2"></i>
                        <strong>Note:</strong> This is a backend API service. To sync your settings, use the Zenith app interface.
                    </p>
                </div>
            </div>
        </div>

        <div class="text-center">
            <a 
                href="<?php echo htmlspecialchars($mainAppUrl); ?>" 
                class="inline-block px-6 py-3 bg-[#4a90e2] hover:bg-[#357abd] text-white rounded-md font-semibold"
            >
                <i class="fas fa-arrow-left mr-2"></i>
                Go to Zenith App
            </a>
        </div>
    </div>
</body>
</html>
