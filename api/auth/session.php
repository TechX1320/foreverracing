<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';

if (!Auth::check()) {
    Api::json(['ok' => true, 'authenticated' => false]);
}

Api::json([
    'ok' => true,
    'authenticated' => true,
    'csrf' => Auth::csrf(),
    'player' => GameService::getPlayer(),
]);
