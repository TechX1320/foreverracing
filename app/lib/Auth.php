<?php
declare(strict_types=1);

final class AuthSessionException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 409)
    {
        parent::__construct($message);
    }
}

final class Auth
{
    public static function check(): bool
    {
        if (!isset($_SESSION['fr_user']) || !is_array($_SESSION['fr_user'])) {
            return false;
        }

        $token = (string)($_SESSION['fr_session_token'] ?? '');
        $username = (string)($_SESSION['fr_user']['username'] ?? '');
        if ($token === '' || $username === '') {
            self::clearSessionState();
            return false;
        }

        $key = self::accountKey($username);
        $sessions = JsonStore::read(self::activeSessionPath(), []);
        $record = is_array($sessions) ? ($sessions[$key] ?? null) : null;
        $ttl = max(300, (int)(app_config()['session_active_ttl_seconds'] ?? 7200));
        $now = time();

        if (!is_array($record)
            || !isset($record['token'])
            || !hash_equals((string)$record['token'], $token)
            || ($now - (int)($record['lastSeen'] ?? 0)) > $ttl) {
            self::clearSessionState();
            return false;
        }

        if (($now - (int)($record['lastSeen'] ?? 0)) >= 60) {
            JsonStore::mutate(self::activeSessionPath(), [], function ($current) use ($key, $token, $now): array {
                $rows = is_array($current) ? $current : [];
                if (isset($rows[$key]) && is_array($rows[$key]) && hash_equals((string)($rows[$key]['token'] ?? ''), $token)) {
                    $rows[$key]['lastSeen'] = $now;
                }
                return $rows;
            });
        }

        return true;
    }

    public static function user(): ?array
    {
        return self::check() ? $_SESSION['fr_user'] : null;
    }

    public static function credentialsValid(string $username, string $password): bool
    {
        $config = app_config();
        $validUser = hash_equals(strtolower((string)$config['admin_username']), strtolower(trim($username)));
        $validPass = hash_equals((string)$config['admin_password'], $password);
        return $validUser && $validPass;
    }

    public static function login(string $username, string $password): bool
    {
        if (!self::credentialsValid($username, $password)) {
            return false;
        }

        if (isset($_SESSION['fr_user']) && is_array($_SESSION['fr_user'])) {
            throw new AuthSessionException('This account is already signed in in this session.');
        }

        $config = app_config();
        $canonical = (string)$config['admin_username'];
        $key = self::accountKey($canonical);
        $ttl = max(300, (int)($config['session_active_ttl_seconds'] ?? 7200));
        $now = time();

        $token = bin2hex(random_bytes(24));
        JsonStore::mutate(self::activeSessionPath(), [], function ($current) use ($key, $canonical, $token, $now, $ttl): array {
            $rows = self::pruneSessions(is_array($current) ? $current : [], $ttl, $now);
            if (isset($rows[$key])) {
                throw new AuthSessionException('This account is already logged in. Sign out of the active session before logging in again.');
            }
            $rows[$key] = [
                'username' => $canonical,
                'token' => $token,
                'loginAt' => $now,
                'lastSeen' => $now,
            ];
            return $rows;
        });

        session_regenerate_id(true);
        $_SESSION['fr_user'] = ['id' => 1, 'username' => $canonical];
        $_SESSION['fr_csrf'] = bin2hex(random_bytes(32));
        $_SESSION['fr_login_at'] = $now;
        $_SESSION['fr_session_token'] = $token;

        return true;
    }

    public static function logout(): void
    {
        self::releaseActiveSession();
        self::clearSessionState();

        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
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

    private static function releaseActiveSession(): void
    {
        $username = (string)($_SESSION['fr_user']['username'] ?? '');
        $token = (string)($_SESSION['fr_session_token'] ?? '');
        if ($username === '' || $token === '') {
            return;
        }
        $key = self::accountKey($username);
        JsonStore::mutate(self::activeSessionPath(), [], function ($current) use ($key, $token): array {
            $rows = is_array($current) ? $current : [];
            if (isset($rows[$key]) && is_array($rows[$key]) && hash_equals((string)($rows[$key]['token'] ?? ''), $token)) {
                unset($rows[$key]);
            }
            return $rows;
        });
    }

    private static function clearSessionState(): void
    {
        unset($_SESSION['fr_user'], $_SESSION['fr_csrf'], $_SESSION['fr_login_at'], $_SESSION['fr_session_token']);
    }

    private static function activeSessionPath(): string
    {
        return FR_DATA . '/runtime/active-sessions.json';
    }

    private static function accountKey(string $username): string
    {
        return strtolower(trim($username));
    }

    private static function pruneSessions(array $rows, int $ttl, int $now): array
    {
        foreach ($rows as $key => $record) {
            if (!is_array($record) || ($now - (int)($record['lastSeen'] ?? 0)) > $ttl) {
                unset($rows[$key]);
            }
        }
        return $rows;
    }
}
