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

    $path = isset($parts['path']) ? proxy_normalize_path($parts['path']) : '';

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

    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return true;
    }

    return (bool) preg_match('/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/', $host);
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
        $long = ip2long($ip);
        if ($long === false) {
            return true;
        }

        if ($long === 0) {
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

    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $bin = inet_pton($ip);
        if ($bin === false) {
            return true;
        }

        if ($bin === inet_pton('::1') || $bin === inet_pton('::')) {
            return true;
        }

        $bytes = unpack('C*', $bin);
        if ($bytes === false) {
            return true;
        }

        // fe80::/10
        if ($bytes[1] === 0xfe && ($bytes[2] & 0xc0) === 0x80) {
            return true;
        }

        return false;
    }

    return true;
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
    $entry = $validated['host'] . ':' . $validated['port'] . ':' . $validated['resolve_ip'];
    curl_setopt($ch, CURLOPT_RESOLVE, [$entry]);
}
