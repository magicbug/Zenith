<?php
/**
 * Cleanup Old Rate Limit Records Script
 * Removes old rate limit records from the database
 * 
 * Usage: php cleanup_rate_limits.php [--days=N] [--dry-run]
 * 
 * Options:
 *   --days=N    Delete records older than N days (default: 7)
 *   --dry-run   Show what would be deleted without actually deleting
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// Parse command line arguments
$daysOld = 7;
$dryRun = false;

foreach ($argv as $arg) {
    if (preg_match('/--days=(\d+)/', $arg, $matches)) {
        $daysOld = (int)$matches[1];
    } elseif ($arg === '--dry-run') {
        $dryRun = true;
    }
}

echo "Zenith Settings Sync - Cleanup Old Rate Limit Records\n";
echo "=====================================================\n\n";
echo "Deleting records older than {$daysOld} days\n";
if ($dryRun) {
    echo "DRY RUN MODE - No changes will be made\n";
}
echo "\n";

try {
    $db = DB::getInstance();
    
    // Calculate cutoff date
    $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$daysOld} days"));
    
    // Count old rate limit records
    $countStmt = $db->query(
        "SELECT COUNT(*) as count FROM rate_limits WHERE window_start < ?",
        [$cutoffDate]
    );
    $countData = $countStmt->fetch();
    $totalRecords = (int)$countData['count'];
    
    if ($totalRecords === 0) {
        echo "No old rate limit records to clean up.\n";
        exit(0);
    }
    
    echo "Found {$totalRecords} old rate limit records (older than {$daysOld} days)\n";
    
    if (!$dryRun) {
        // Delete old rate limit records
        $deleteStmt = $db->query(
            "DELETE FROM rate_limits WHERE window_start < ?",
            [$cutoffDate]
        );
        $deleted = $deleteStmt->rowCount();
        echo "Deleted {$deleted} rate limit records\n";
    } else {
        echo "Would delete {$totalRecords} rate limit records\n";
    }
    
    echo "\n";
    echo "=====================================================\n";
    if ($dryRun) {
        echo "DRY RUN: Would delete {$totalRecords} records\n";
    } else {
        echo "Deleted {$deleted} records\n";
    }
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
