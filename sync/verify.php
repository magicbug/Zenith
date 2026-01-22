<?php
/**
 * Magic Link Verification Page
 * Web UI for verifying tokens and displaying API keys
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/api/auth.php';

$error = null;
$success = false;
$apiKey = null;
$email = null;
$token = $_GET['token'] ?? '';

// Handle POST (contact permission update)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($token)) {
    $allowContact = isset($_POST['allow_contact']) && $_POST['allow_contact'] === '1';
    
    $db = DB::getInstance();
    $auth = new Auth();
    
    // Verify token
    $stmt = $db->query(
        "SELECT email, used, expires_at FROM magic_links WHERE token = ?",
        [$token]
    );
    $magicLink = $stmt->fetch();
    
    if ($magicLink && !$magicLink['used'] && strtotime($magicLink['expires_at']) > time()) {
        $email = $magicLink['email'];
        
        // Mark token as used
        $db->query("UPDATE magic_links SET used = 1 WHERE token = ?", [$token]);
        
        // Generate API key
        $apiKey = Auth::generateApiKey();
        
        // Create or update user
        $userId = $auth->createOrUpdateUser($email, $apiKey, $allowContact);
        
        $success = true;
    } else {
        $error = 'Invalid or expired token';
    }
}

// Handle GET (initial verification)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && !empty($token) && !$success) {
    $db = DB::getInstance();
    
    $stmt = $db->query(
        "SELECT email, used, expires_at FROM magic_links WHERE token = ?",
        [$token]
    );
    $magicLink = $stmt->fetch();
    
    if (!$magicLink) {
        $error = 'Invalid token';
    } else if ($magicLink['used']) {
        $error = 'This magic link has already been used';
    } else if (strtotime($magicLink['expires_at']) <= time()) {
        $error = 'This magic link has expired';
    } else {
        $email = $magicLink['email'];
        // Show form to accept contact permission
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zenith Settings Sync - Verify Email</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            background-color: #f4f4f4;
        }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-lg max-w-md w-full p-8">
        <div class="bg-[#2c3e50] text-white p-6 rounded-t-lg -m-8 mb-6">
            <h1 class="text-2xl font-bold text-center">Zenith Settings Sync</h1>
        </div>

        <?php if ($error): ?>
            <div class="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                <div class="flex">
                    <i class="fas fa-exclamation-circle text-red-500 mr-3 mt-1"></i>
                    <div>
                        <p class="text-red-700 font-semibold">Error</p>
                        <p class="text-red-600"><?php echo htmlspecialchars($error); ?></p>
                    </div>
                </div>
            </div>
            <div class="text-center">
                <a href="<?php echo htmlspecialchars(MAIN_APP_URL); ?>" class="text-[#4a90e2] hover:underline">
                    Return to Zenith
                </a>
            </div>
        <?php elseif ($success && $apiKey): ?>
            <div class="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                <div class="flex">
                    <i class="fas fa-check-circle text-green-500 mr-3 mt-1"></i>
                    <div>
                        <p class="text-green-700 font-semibold">Success!</p>
                        <p class="text-green-600">Your email has been verified.</p>
                    </div>
                </div>
            </div>

            <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Your API Key
                </label>
                <div class="flex items-center space-x-2">
                    <input 
                        type="password" 
                        id="api-key-input" 
                        value="<?php echo htmlspecialchars($apiKey); ?>" 
                        readonly
                        class="flex-1 px-4 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                    >
                    <button 
                        onclick="toggleApiKey()" 
                        class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
                        title="Show/Hide API Key"
                    >
                        <i class="fas fa-eye" id="toggle-icon"></i>
                    </button>
                    <button 
                        onclick="copyApiKey()" 
                        class="px-4 py-2 bg-[#4a90e2] hover:bg-[#357abd] text-white rounded-md"
                        title="Copy API Key"
                    >
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <p class="mt-2 text-sm text-gray-500">
                    Copy this API key and paste it into the Zenith app to enable settings sync.
                </p>
            </div>

            <div class="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                <p class="text-blue-700 text-sm">
                    <i class="fas fa-info-circle mr-2"></i>
                    <strong>Important:</strong> Save this API key securely. You'll need it to sync your settings across devices.
                </p>
            </div>

            <div class="text-center space-y-3">
                <a 
                    href="<?php echo htmlspecialchars(MAIN_APP_URL); ?>#sync-api-key=<?php echo urlencode($apiKey); ?>" 
                    class="block w-full px-4 py-2 bg-[#4a90e2] hover:bg-[#357abd] text-white rounded-md font-semibold"
                >
                    Open Zenith App
                </a>
                <a href="<?php echo htmlspecialchars(MAIN_APP_URL); ?>" class="text-[#4a90e2] hover:underline text-sm">
                    Return to Zenith
                </a>
            </div>
        <?php else: ?>
            <form method="POST" action="">
                <input type="hidden" name="token" value="<?php echo htmlspecialchars($token); ?>">
                
                <div class="mb-6">
                    <p class="text-gray-700 mb-4">
                        Verify your email address to enable settings sync for <strong><?php echo htmlspecialchars($email); ?></strong>
                    </p>
                </div>

                <div class="mb-6">
                    <label class="flex items-start">
                        <input 
                            type="checkbox" 
                            name="allow_contact" 
                            value="1"
                            class="mt-1 mr-3"
                        >
                        <span class="text-sm text-gray-700">
                            Allow Zenith to contact me about updates and new features
                            <span class="text-gray-500 block mt-1">(Optional - you can change this later)</span>
                        </span>
                    </label>
                </div>

                <button 
                    type="submit"
                    class="w-full px-4 py-2 bg-[#4a90e2] hover:bg-[#357abd] text-white rounded-md font-semibold"
                >
                    Verify Email & Get API Key
                </button>
            </form>
        <?php endif; ?>
    </div>

    <script>
        function toggleApiKey() {
            const input = document.getElementById('api-key-input');
            const icon = document.getElementById('toggle-icon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }

        function copyApiKey() {
            const input = document.getElementById('api-key-input');
            input.select();
            input.setSelectionRange(0, 99999); // For mobile devices
            document.execCommand('copy');
            
            // Show feedback
            const button = event.target.closest('button');
            const originalHTML = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i>';
            button.classList.add('bg-green-500');
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.classList.remove('bg-green-500');
            }, 2000);
        }

        // Auto-fill API key from URL fragment if present
        if (window.location.hash) {
            const match = window.location.hash.match(/sync-api-key=([^&]+)/);
            if (match) {
                // API key is in URL, could auto-fill if needed
            }
        }
    </script>
</body>
</html>
