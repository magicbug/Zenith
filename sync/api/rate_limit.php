<?php
/**
 * Rate Limiting Helper
 * Checks and enforces rate limits for API endpoints
 */

require_once __DIR__ . '/../db.php';

class RateLimiter {
    private $db;

    public function __construct() {
        $this->db = DB::getInstance();
    }

    /**
     * Check if request is within rate limit
     * @param string $identifier Email or API key
     * @param string $requestType 'magic_link' or 'api_call'
     * @param int $maxRequests Maximum requests allowed
     * @param int $windowSeconds Time window in seconds
     * @return array ['allowed' => bool, 'retry_after' => int|null]
     */
    public function checkRateLimit($identifier, $requestType, $maxRequests, $windowSeconds) {
        // Skip rate limiting in test mode
        if (defined('TEST_MODE') && TEST_MODE) {
            return ['allowed' => true, 'retry_after' => null];
        }

        $windowStart = date('Y-m-d H:i:s', time() - $windowSeconds);
        
        // Get or create rate limit record
        $stmt = $this->db->query(
            "SELECT count, window_start FROM rate_limits 
             WHERE identifier = ? AND request_type = ? AND window_start >= ? 
             ORDER BY window_start DESC LIMIT 1",
            [$identifier, $requestType, $windowStart]
        );
        
        $record = $stmt->fetch();
        
        if ($record) {
            // Existing window, check count
            if ($record['count'] >= $maxRequests) {
                $retryAfter = strtotime($record['window_start']) + $windowSeconds - time();
                return [
                    'allowed' => false,
                    'retry_after' => max(0, $retryAfter)
                ];
            }
            
            // Increment count
            $this->db->query(
                "UPDATE rate_limits SET count = count + 1 
                 WHERE identifier = ? AND request_type = ? AND window_start = ?",
                [$identifier, $requestType, $record['window_start']]
            );
        } else {
            // New window, create record
            $this->db->query(
                "INSERT INTO rate_limits (identifier, request_type, count, window_start) 
                 VALUES (?, ?, 1, NOW())",
                [$identifier, $requestType]
            );
        }
        
        return ['allowed' => true, 'retry_after' => null];
    }

    /**
     * Check magic link rate limit
     * @param string $email
     * @return array
     */
    public function checkMagicLinkLimit($email) {
        return $this->checkRateLimit(
            $email,
            'magic_link',
            RATE_LIMIT_MAGIC_LINK_PER_HOUR,
            3600 // 1 hour
        );
    }

    /**
     * Check API call rate limit
     * @param string $apiKey
     * @return array
     */
    public function checkApiCallLimit($apiKey) {
        return $this->checkRateLimit(
            $apiKey,
            'api_call',
            RATE_LIMIT_API_CALLS_PER_MINUTE,
            60 // 1 minute
        );
    }
}
