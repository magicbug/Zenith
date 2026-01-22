<?php
/**
 * Cleanup Expired Magic Links Script
 * Removes expired or used magic links from the database
 * 
 * Usage: php cleanup.php [--dry-run]
 * 
 * Options:
 *   --dry-run   Show what would be deleted without actually deleting
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// Parse command line arguments
$dryRun = false;

foreach ($argv as $arg) {
    if ($arg === '--dry-run') {
        $dryRun = true;
    }
}

echo "Zenith Settings Sync - Cleanup Expired Magic Links\n";
echo "==================================================\n\n";
if ($dryRun) {
    echo "DRY RUN MODE - No changes will be made\n";
}
echo "\n";

try {
    $db = DB::getInstance();
    
    // Count expired or used magic links
    $countStmt = $db->query(
        "SELECT COUNT(*) as count FROM magic_links 
         WHERE expires_at < NOW() OR used = 1"
    );
    $countData = $countStmt->fetch();
    $totalRecords = (int)$countData['count'];
    
    if ($totalRecords === 0) {
        echo "No expired or used magic links to clean up.\n";
        exit(0);
    }
    
    echo "Found {$totalRecords} expired or used magic links\n";
    
    if (!$dryRun) {
        // Delete expired or used magic links
        $deleteStmt = $db->query(
            "DELETE FROM magic_links WHERE expires_at < NOW() OR used = 1"
        );
        $deleted = $deleteStmt->rowCount();
        echo "Deleted {$deleted} magic link records\n";
    } else {
        echo "Would delete {$totalRecords} magic link records\n";
    }
    
    echo "\n";
    echo "==================================================\n";
    if ($dryRun) {
        echo "DRY RUN: Would delete {$totalRecords} records\n";
    } else {
        echo "Deleted {$deleted} records\n";
    }
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
