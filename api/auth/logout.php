<?php
declare(strict_types=1);
require_once __DIR__ . '/../_bootstrap.php';
Api::requireMethod('POST');
Api::requireAuth();
Api::requireCsrf();
Auth::logout();
Api::json(['ok' => true]);
