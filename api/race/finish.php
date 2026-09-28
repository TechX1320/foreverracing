<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
Api::requireAuth();
Api::requireCsrf();
$body = Api::body();
$raceId = trim((string)($body['raceId'] ?? ''));
if ($raceId === '') {
    Api::json(['ok' => false, 'error' => 'Race ID is required.'], 422);
}
api_game(fn() => GameService::finishQuickRace($raceId));
