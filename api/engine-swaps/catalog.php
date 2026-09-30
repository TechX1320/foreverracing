<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireAuth();
Api::json(['ok' => true, 'engines' => GameService::engineCatalog()]);
