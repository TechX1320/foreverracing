<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
Api::requireAuth();
Api::requireCsrf();
$body = Api::body();
api_game(fn() => ['player' => GameService::renameCar((string)($body['carId'] ?? ''), (string)($body['name'] ?? ''))]);
