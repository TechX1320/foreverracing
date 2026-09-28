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
    'build' => '0.3.0-a',
    'admin_username' => 'Admin',
    'admin_password' => '12345',
    'session_name' => 'forever_racing_session',
    'session_active_ttl_seconds' => (int)($gameConfig['sessionActiveTtlSeconds'] ?? 7200),
    'starting_credits' => (int)($gameConfig['startingCredits'] ?? 75000),
    'used_lot_refresh_seconds' => (int)($gameConfig['usedLotRefreshSeconds'] ?? 1800),
    'schema_version' => (int)($gameConfig['schemaVersion'] ?? 3),
    'tutorial_version' => (int)($gameConfig['tutorialVersion'] ?? 1),
    'tutorial_completion_credits' => (int)($gameConfig['tutorialCompletionCredits'] ?? 2500),
    'tutorial_completion_rep' => (int)($gameConfig['tutorialCompletionRep'] ?? 25),
];
