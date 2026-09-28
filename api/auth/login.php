<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
$body = Api::body();
$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');

try {
    $loggedIn = Auth::login($username, $password);
} catch (AuthSessionException $e) {
    Api::json(['ok' => false, 'error' => $e->getMessage(), 'code' => 'ACCOUNT_ALREADY_ACTIVE'], $e->status);
}

if (!$loggedIn) {
    usleep(250000);
    Api::json(['ok' => false, 'error' => 'Invalid username or password.'], 401);
}

Api::json([
    'ok' => true,
    'authenticated' => true,
    'csrf' => Auth::csrf(),
    'player' => GameService::getPlayer(),
]);
