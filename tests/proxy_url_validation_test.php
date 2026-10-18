<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/proxy_url_helper.php';

$passed = 0;
$failed = 0;

function test_reject(string $url, string $name): void
{
    global $passed, $failed;
    $result = proxy_validate_base_url($url);
    if (isset($result['error'])) {
        echo "PASS reject: $name\n";
        $passed++;
        return;
    }
    echo "FAIL reject: $name (expected error, got base_url={$result['base_url']})\n";
    $failed++;
}

function test_accept(string $url, string $expectedBase, string $name): void
{
    global $passed, $failed;
    $result = proxy_validate_base_url($url);
    if (isset($result['error'])) {
        echo "FAIL accept: $name (error: {$result['error']})\n";
        $failed++;
        return;
    }
    if ($result['base_url'] !== $expectedBase) {
        echo "FAIL accept: $name (expected base $expectedBase, got {$result['base_url']})\n";
        $failed++;
        return;
    }
    echo "PASS accept: $name\n";
    $passed++;
}

function test_ip_blocked(string $ip, string $name): void
{
    global $passed, $failed;
    if (proxy_is_blocked_ip($ip)) {
        echo "PASS blocked ip: $name\n";
        $passed++;
        return;
    }
    echo "FAIL blocked ip: $name (expected blocked)\n";
    $failed++;
}

function test_ip_allowed(string $ip, string $name): void
{
    global $passed, $failed;
    if (!proxy_is_blocked_ip($ip)) {
        echo "PASS allowed ip: $name\n";
        $passed++;
        return;
    }
    echo "FAIL allowed ip: $name (expected allowed)\n";
    $failed++;
}

test_reject('file:///etc/passwd', 'file scheme');
test_reject('file:///etc/passwd#', 'file scheme with fragment');
test_reject('gopher://127.0.0.1:70/', 'gopher scheme');
test_reject('https://example.com/cloudlog#', 'fragment bypass');
test_reject('https://example.com/cloudlog?', 'query bypass');
test_reject('https://example.com/cloudlog%23', 'encoded fragment');
test_reject('https://example.com/cloudlog%3F', 'encoded query');
test_reject('https://127.0.0.1/cloudlog', 'loopback IPv4');
test_reject('https://[::1]/cloudlog', 'loopback IPv6');
test_reject('http://169.254.169.254/', 'link-local metadata');
test_reject('http://user:pass@192.168.1.1/', 'userinfo in URL');
test_reject('ftp://192.168.1.1/', 'ftp scheme');
test_reject('http://0.1.2.3/', '0.0.0.0/8');
test_reject('http://2130706433/', 'decimal loopback host');
test_reject('http://0x7f.0.0.1/', 'hex octet host');
test_reject('http://0177.0.0.1/', 'octal octet host');
test_reject('http://0x7f.1/', 'hex dotted host');
test_reject('https://example.com/foo%5Cbar', 'backslash in decoded path');
test_reject('https://example.com/foo%20bar', 'space in decoded path');
test_reject('https://example.com/foo@bar', 'at-sign in path');

test_ip_blocked('::ffff:127.0.0.1', 'mapped loopback');
test_ip_blocked('::ffff:169.254.169.254', 'mapped link-local');
test_ip_blocked('::127.0.0.1', 'compatible loopback');
test_ip_allowed('64:ff9b::192.0.2.1', 'NAT64 public embed');
test_ip_blocked('64:ff9b::127.0.0.1', 'NAT64 loopback embed');

test_accept('https://192.168.1.50/cloudlog/', 'https://192.168.1.50/cloudlog', 'LAN IPv4 with subdirectory');
test_accept('http://10.0.0.5', 'http://10.0.0.5', 'LAN 10/8');
test_accept('https://example.com/cloudlog/', 'https://example.com/cloudlog', 'public host with subdirectory');

echo "\nResults: $passed passed, $failed failed\n";
exit($failed > 0 ? 1 : 0);
