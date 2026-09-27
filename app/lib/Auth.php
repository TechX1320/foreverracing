<?php
declare(strict_types=1);

final class Auth
{
    public static function check(): bool
    {
        return isset($_SESSION['fr_user']) && is_array($_SESSION['fr_user']);
    }

    public static function user(): ?array
    {
        return self::check() ? $_SESSION['fr_user'] : null;
    }

    public static function login(string $username, string $password): bool
    {
        $config = app_config();
        $validUser = hash_equals((string)$config['admin_username'], $username);
        $validPass = hash_equals((string)$config['admin_password'], $password);
        if (!$validUser || !$validPass) {
            return false;
        }

        session_regenerate_id(true);
        $_SESSION['fr_user'] = ['id' => 1, 'username' => $config['admin_username']];
        $_SESSION['fr_csrf'] = bin2hex(random_bytes(32));
        $_SESSION['fr_login_at'] = time();
        return true;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
    }

    public static function csrf(): string
    {
        if (!isset($_SESSION['fr_csrf'])) {
            $_SESSION['fr_csrf'] = bin2hex(random_bytes(32));
        }
        return (string)$_SESSION['fr_csrf'];
    }

    public static function validateCsrf(string $token): bool
    {
        return self::check() && $token !== '' && isset($_SESSION['fr_csrf']) && hash_equals((string)$_SESSION['fr_csrf'], $token);
    }
}
