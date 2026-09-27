<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireAuth();
Api::json(['ok' => true, 'lot' => GameService::usedLot(), 'cars' => GameService::carCatalog()]);
