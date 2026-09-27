<?php
$gameConfigPath = __DIR__ . '/../../data/config/game.json';
$gameConfig = [];
if (is_file($gameConfigPath)) {
    $decoded = json_decode((string)file_get_contents($gameConfigPath), true);
    if (is_array($decoded)) {
        $gameConfig = $decoded;
    }
}

return [
    'app_name' => 'Forever Racing',
    'build' => '0.2.0-dev.2',
    'admin_username' => 'Admin',
    'admin_password' => '12345',
    'session_name' => 'forever_racing_session',
    'starting_credits' => (int)($gameConfig['startingCredits'] ?? 75000),
    'used_lot_refresh_seconds' => (int)($gameConfig['usedLotRefreshSeconds'] ?? 1800),
];
