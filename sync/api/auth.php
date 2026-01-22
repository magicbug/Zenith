<?php
/**
 * Authentication Helper
 * Handles API key validation and user lookup
 */

require_once __DIR__ . '/../db.php';

class Auth {
    private $db;

    public function __construct() {
        $this->db = DB::getInstance();
    }

    /**
     * Validate API key and get user
     * @param string $apiKey Plain text API key
     * @return array|false User data or false if invalid
     */
    public function validateApiKey($apiKey) {
        if (empty($apiKey)) {
            return false;
        }

        // Get all users (we need to check each hash)
        $stmt = $this->db->query(
            "SELECT id, email, api_key_hash, api_key_active, allow_contact, created_at, last_sync_at 
             FROM users WHERE api_key_active = 1"
        );
        
        $users = $stmt->fetchAll();
        
        foreach ($users as $user) {
            if (password_verify($apiKey, $user['api_key_hash'])) {
                return $user;
            }
        }
        
        return false;
    }

    /**
     * Get user by email
     * @param string $email
     * @return array|false
     */
    public function getUserByEmail($email) {
        $stmt = $this->db->query(
            "SELECT id, email, api_key_hash, api_key_active, api_key_created_at, allow_contact, created_at, last_sync_at 
             FROM users WHERE email = ?",
            [$email]
        );
        
        return $stmt->fetch() ?: false;
    }

    /**
     * Create or update user
     * @param string $email
     * @param string $apiKey Plain text API key (will be hashed)
     * @param bool $allowContact
     * @return int User ID
     */
    public function createOrUpdateUser($email, $apiKey, $allowContact = false) {
        $apiKeyHash = password_hash($apiKey, PASSWORD_DEFAULT);
        $user = $this->getUserByEmail($email);
        
        if ($user) {
            // Update existing user
            $this->db->query(
                "UPDATE users SET api_key_hash = ?, api_key_active = 1, api_key_created_at = NOW(), allow_contact = ? 
                 WHERE email = ?",
                [$apiKeyHash, $allowContact ? 1 : 0, $email]
            );
            return $user['id'];
        } else {
            // Create new user
            $this->db->query(
                "INSERT INTO users (email, api_key_hash, allow_contact) VALUES (?, ?, ?)",
                [$email, $apiKeyHash, $allowContact ? 1 : 0]
            );
            return $this->db->lastInsertId();
        }
    }

    /**
     * Generate a secure random API key
     * @param int $length
     * @return string
     */
    public static function generateApiKey($length = 64) {
        return bin2hex(random_bytes($length / 2));
    }

    /**
     * Generate a secure random token
     * @param int $length
     * @return string
     */
    public static function generateToken($length = 32) {
        return bin2hex(random_bytes($length / 2));
    }
}
