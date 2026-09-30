<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
Api::requireAuth();
Api::requireCsrf();
api_game(fn() => ['player' => GameService::circuitAbandon()]);
