<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
Api::requireAuth();
Api::requireCsrf();
$body = Api::body();
$tune = is_array($body['tune'] ?? null) ? $body['tune'] : [];
api_game(fn() => ['player' => GameService::saveTune((string)($body['carId'] ?? ''), $tune)]);
