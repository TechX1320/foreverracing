<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('GET');
Api::requireAuth();
api_game(fn() => ['preview' => GameService::quickRacePreview()]);
