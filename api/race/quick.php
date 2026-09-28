<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
Api::requireAuth();
Api::requireCsrf();
$body = Api::body();
$distance = (string)($body['distance'] ?? '1/4');
api_game(fn() => GameService::quickRace($distance));
