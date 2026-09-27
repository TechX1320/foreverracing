<?php
declare(strict_types=1);

final class Api
{
    public static function json(mixed $payload, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function body(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') {
            return [];
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            self::json(['ok' => false, 'error' => 'Invalid JSON body.'], 400);
        }
        return $data;
    }

    public static function requireMethod(string $method): void
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== strtoupper($method)) {
            self::json(['ok' => false, 'error' => 'Method not allowed.'], 405);
        }
    }

    public static function requireAuth(): void
    {
        if (!Auth::check()) {
            self::json(['ok' => false, 'error' => 'Authentication required.'], 401);
        }
    }

    public static function requireCsrf(): void
    {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!Auth::validateCsrf($token)) {
            self::json(['ok' => false, 'error' => 'Invalid security token. Refresh and try again.'], 419);
        }
    }
}
