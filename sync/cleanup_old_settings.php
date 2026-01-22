<?php
/**
 * Cleanup Old Settings Script
 * Removes old user_settings records, keeping only the most recent N versions per user
 * 
 * Usage: php cleanup_old_settings.php [--keep=N] [--dry-run]
 * 
 * Options:
 *   --keep=N    Keep the last N versions per user (default: 10)
 *   --dry-run   Show what would be deleted without actually deleting
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// Parse command line arguments
$keepVersions = 10;
$dryRun = false;

foreach ($argv as $arg) {
    if (preg_match('/--keep=(\d+)/', $arg, $matches)) {
        $keepVersions = (int)$matches[1];
    } elseif ($arg === '--dry-run') {
        $dryRun = true;
    }
}

echo "Zenith Settings Sync - Cleanup Old Settings\n";
echo "===========================================\n\n";
echo "Keeping last {$keepVersions} versions per user\n";
if ($dryRun) {
    echo "DRY RUN MODE - No changes will be made\n";
}
echo "\n";

try {
    $db = DB::getInstance();
    
    // Get all users
    $usersStmt = $db->query("SELECT id, email FROM users");
    $users = $usersStmt->fetchAll();
    
    $totalDeleted = 0;
    $totalUsers = count($users);
    
    foreach ($users as $user) {
        // Get count of settings records for this user
        $countStmt = $db->query(
            "SELECT COUNT(*) as count FROM user_settings WHERE user_id = ?",
            [$user['id']]
        );
        $countData = $countStmt->fetch();
        $totalRecords = (int)$countData['count'];
        
        if ($totalRecords <= $keepVersions) {
            echo "User {$user['email']}: {$totalRecords} records (no cleanup needed)\n";
            continue;
        }
        
        // Get IDs to keep
        $keepStmt = $db->query(
            "SELECT id FROM user_settings WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            [$user['id'], $keepVersions]
        );
        $keepRows = $keepStmt->fetchAll();
        $keepIds = array_column($keepRows, 'id');
        
        $toDelete = $totalRecords - count($keepIds);
        
        if ($toDelete > 0) {
            echo "User {$user['email']}: {$totalRecords} records, keeping {$keepVersions}, deleting {$toDelete}\n";
            
            if (!$dryRun) {
                $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
                $deleteStmt = $db->query(
                    "DELETE FROM user_settings WHERE user_id = ? AND id NOT IN ($placeholders)",
                    array_merge([$user['id']], $keepIds)
                );
                $deleted = $deleteStmt->rowCount();
                $totalDeleted += $deleted;
                echo "  → Deleted {$deleted} records\n";
            } else {
                $totalDeleted += $toDelete;
                echo "  → Would delete {$toDelete} records\n";
            }
        }
    }
    
    echo "\n";
    echo "===========================================\n";
    if ($dryRun) {
        echo "DRY RUN: Would delete {$totalDeleted} records total\n";
    } else {
        echo "Deleted {$totalDeleted} records total from {$totalUsers} users\n";
    }
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
