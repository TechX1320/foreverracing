<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
Api::requireAuth();
Api::requireCsrf();

$user = Auth::user();
$reset = false;
if (is_array($user) && strcasecmp((string)($user['username'] ?? ''), (string)app_config()['admin_username']) === 0) {
    GameService::resetPlayer();
    $reset = true;
}

Auth::logout();
Api::json(['ok' => true, 'reset' => $reset]);
