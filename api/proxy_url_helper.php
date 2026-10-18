<?php
/**
 * Shared URL validation and SSRF hardening for api/* proxy endpoints.
 */

declare(strict_types=1);

/**
 * @return array{base_url: string, host: string, port: int, scheme: string, resolve_ip: string}|array{error: string}
 */
function proxy_validate_base_url(string $input): array
{
    $input = trim($input);
    if ($input === '') {
        return ['error' => 'URL is required'];
    }

    if (preg_match('/[\x00-\x20]/', $input)) {
        return ['error' => 'Invalid URL'];
    }

    if (proxy_url_contains_fragment_or_query($input)) {
        return ['error' => 'Invalid URL'];
    }

    $decoded = proxy_url_decode_for_inspection($input);
    if (proxy_url_contains_fragment_or_query($decoded)) {
        return ['error' => 'Invalid URL'];
    }

    if (!preg_match('#^([a-zA-Z][a-zA-Z0-9+.-]*:)//#', $decoded)) {
        return ['error' => 'Invalid URL'];
    }

    $parts = parse_url($decoded);
    if ($parts === false || !isset($parts['scheme'], $parts['host']) || $parts['host'] === '') {
        return ['error' => 'Invalid URL'];
    }

    if (isset($parts['user']) || isset($parts['pass'])) {
        return ['error' => 'Invalid URL'];
    }

    if (isset($parts['query']) || isset($parts['fragment'])) {
        return ['error' => 'Invalid URL'];
    }

    $scheme = strtolower($parts['scheme']);
    if ($scheme !== 'http' && $scheme !== 'https') {
        return ['error' => 'URL must use http or https'];
    }

    $host = $parts['host'];
    if (!proxy_is_valid_host($host)) {
        return ['error' => 'Invalid URL'];
    }

    $port = isset($parts['port']) ? (int) $parts['port'] : ($scheme === 'https' ? 443 : 80);
    if ($port < 1 || $port > 65535) {
        return ['error' => 'Invalid URL'];
    }

    $rawPath = isset($parts['path']) ? $parts['path'] : '';
    $path = proxy_normalize_path(proxy_url_decode_for_inspection($rawPath));
    if (!proxy_validate_path_chars($path)) {
        return ['error' => 'Invalid URL'];
    }

    $resolve = proxy_resolve_and_filter_host($host);
    if (isset($resolve['error'])) {
        return $resolve;
    }

    $authority = $host;
    if (isset($parts['port'])) {
        $authority .= ':' . $parts['port'];
    }

    $baseUrl = $scheme . '://' . $authority . $path;

    return [
        'base_url' => rtrim($baseUrl, '/'),
        'host' => $host,
        'port' => $port,
        'scheme' => $scheme,
        'resolve_ip' => $resolve['resolve_ip'],
    ];
}

function proxy_url_contains_fragment_or_query(string $url): bool
{
    if (strpbrk($url, "#?") !== false) {
        return true;
    }

    return (bool) preg_match('/%(23|3f)/i', $url);
}

function proxy_url_decode_for_inspection(string $url): string
{
    $current = $url;
    for ($i = 0; $i < 5; $i++) {
        $next = rawurldecode($current);
        if ($next === $current) {
            break;
        }
        $current = $next;
    }

    return $current;
}

function proxy_normalize_path(string $path): string
{
    if ($path === '' || $path === '/') {
        return '';
    }

    $segments = explode('/', $path);
    $out = [];
    foreach ($segments as $segment) {
        if ($segment === '' || $segment === '.') {
            continue;
        }
        if ($segment === '..') {
            array_pop($out);
            continue;
        }
        $out[] = $segment;
    }

    return '/' . implode('/', $out);
}

function proxy_is_valid_host(string $host): bool
{
    if ($host === '' || strlen($host) > 253) {
        return false;
    }

    if (strpbrk($host, "\\@") !== false) {
        return false;
    }

    if (proxy_host_uses_obfuscated_ipv4($host)) {
        return false;
    }

    if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        return !proxy_is_blocked_ip($host);
    }

    if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        return !proxy_is_blocked_ip($host);
    }

    return (bool) preg_match('/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/', $host);
}

function proxy_validate_path_chars(string $path): bool
{
    if ($path === '') {
        return true;
    }

    return (bool) preg_match('#^/[a-zA-Z0-9\-._~]*(/[a-zA-Z0-9\-._~]*)*$#', $path);
}

function proxy_host_uses_obfuscated_ipv4(string $host): bool
{
    if (preg_match('/^\d+$/', $host)) {
        return true;
    }

    if (!str_contains($host, '.')) {
        return false;
    }

    foreach (explode('.', $host) as $label) {
        if ($label === '') {
            return true;
        }
        if (preg_match('/^0x[0-9a-fA-F]+$/', $label)) {
            return true;
        }
        if (preg_match('/^0[0-7]+$/', $label)) {
            return true;
        }
        if (preg_match('/^0\d+$/', $label)) {
            return true;
        }
    }

    return false;
}

/**
 * @return array{resolve_ip: string}|array{error: string}
 */
function proxy_resolve_and_filter_host(string $host): array
{
    $ips = [];

    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips[] = $host;
    } else {
        $records = @dns_get_record($host, DNS_A + DNS_AAAA);
        if (is_array($records)) {
            foreach ($records as $record) {
                if (!empty($record['ip'])) {
                    $ips[] = $record['ip'];
                }
                if (!empty($record['ipv6'])) {
                    $ips[] = $record['ipv6'];
                }
            }
        }

        if ($ips === []) {
            $fallback = @gethostbynamel($host);
            if (is_array($fallback)) {
                $ips = array_merge($ips, $fallback);
            }
        }
    }

    if ($ips === []) {
        return ['error' => 'Could not resolve host'];
    }

    $ips = array_values(array_unique($ips));
    foreach ($ips as $ip) {
        if (proxy_is_blocked_ip($ip)) {
            return ['error' => 'URL host is not allowed'];
        }
    }

    $resolveIp = proxy_pick_resolve_ip($ips);

    return ['resolve_ip' => $resolveIp];
}

function proxy_pick_resolve_ip(array $ips): string
{
    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return $ip;
        }
    }

    return $ips[0];
}

function proxy_is_blocked_ip(string $ip): bool
{
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        return proxy_is_blocked_ipv4($ip);
    }

    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        return proxy_is_blocked_ipv6($ip);
    }

    return true;
}

function proxy_is_blocked_ipv4(string $ip): bool
{
    $packed = inet_pton($ip);
    if ($packed === false || strlen($packed) !== 4) {
        return true;
    }

    $long = unpack('N', $packed)[1];

    // 0.0.0.0/8
    if (($long & 0xFF000000) === 0) {
        return true;
    }

    // 127.0.0.0/8
    if (($long & 0xFF000000) === 0x7F000000) {
        return true;
    }

    // 169.254.0.0/16 (link-local / cloud metadata)
    if (($long & 0xFFFF0000) === 0xA9FE0000) {
        return true;
    }

    return false;
}

function proxy_is_blocked_ipv6(string $ip): bool
{
    $bin = inet_pton($ip);
    if ($bin === false || strlen($bin) !== 16) {
        return true;
    }

    if ($bin === inet_pton('::1') || $bin === inet_pton('::')) {
        return true;
    }

    $bytes = array_values(unpack('C*', $bin));

    // fe80::/10
    if ($bytes[0] === 0xfe && ($bytes[1] & 0xc0) === 0x80) {
        return true;
    }

    $embedded = proxy_extract_embedded_ipv4_from_ipv6_bytes($bytes);
    if ($embedded !== null && proxy_is_blocked_ipv4($embedded)) {
        return true;
    }

    return false;
}

/**
 * @param list<int> $bytes 16 byte values 0-255
 */
function proxy_extract_embedded_ipv4_from_ipv6_bytes(array $bytes): ?string
{
    if (count($bytes) !== 16) {
        return null;
    }

    $v4Bytes = null;

    // IPv4-mapped: ::ffff:x.x.x.x (80 zero bits + 16-bit ffff prefix + IPv4)
    if (array_slice($bytes, 0, 10) === array_fill(0, 10, 0)
        && $bytes[10] === 0xff
        && $bytes[11] === 0xff) {
        $v4Bytes = array_slice($bytes, 12, 4);
    }

    // NAT64 well-known prefix 64:ff9b::/96
    $nat64Prefix = [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0];
    if ($v4Bytes === null && array_slice($bytes, 0, 12) === $nat64Prefix) {
        $v4Bytes = array_slice($bytes, 12, 4);
    }

    // IPv4-compatible (deprecated): ::w.x.y.z (exclude :: and ::1 handled above)
    if ($v4Bytes === null && array_slice($bytes, 0, 12) === array_fill(0, 12, 0)) {
        $tail = array_slice($bytes, 12, 4);
        if ($tail !== [0, 0, 0, 0] && $tail !== [0, 0, 0, 1]) {
            $v4Bytes = $tail;
        }
    }

    if ($v4Bytes === null) {
        return null;
    }

    return implode('.', array_map('strval', $v4Bytes));
}

function proxy_apply_curl_http_restrictions($ch): void
{
    if (defined('CURLOPT_PROTOCOLS_STR')) {
        curl_setopt($ch, CURLOPT_PROTOCOLS_STR, 'http,https');
        curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS_STR, 'http,https');
    } else {
        curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
        curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
    }

    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 0);
}

/**
 * @param array{host: string, port: int, resolve_ip: string} $validated
 */
function proxy_apply_curl_resolve($ch, array $validated): void
{
    $resolveIp = $validated['resolve_ip'];
    if (filter_var($resolveIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $address = '[' . $resolveIp . ']';
    } else {
        $address = $resolveIp;
    }

    $entry = $validated['host'] . ':' . $validated['port'] . ':' . $address;
    curl_setopt($ch, CURLOPT_RESOLVE, [$entry]);
}
