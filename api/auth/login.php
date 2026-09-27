<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
$body = Api::body();
$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');

if (!Auth::login($username, $password)) {
    usleep(250000);
    Api::json(['ok' => false, 'error' => 'Invalid username or password.'], 401);
}

Api::json([
    'ok' => true,
    'authenticated' => true,
    'csrf' => Auth::csrf(),
    'player' => GameService::getPlayer(),
]);
