<?php
declare(strict_types=1);

const FR_ROOT = __DIR__ . '/..';
const FR_DATA = FR_ROOT . '/data';

function app_config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config/app.php';
    }
    return $config;
}

$config = app_config();
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name((string)$config['session_name']);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

require_once __DIR__ . '/lib/JsonStore.php';
require_once __DIR__ . '/lib/Auth.php';
require_once __DIR__ . '/lib/Api.php';
require_once __DIR__ . '/lib/RaceSimulator.php';
require_once __DIR__ . '/lib/PerformanceIndex.php';
require_once __DIR__ . '/lib/PowerModel.php';
require_once __DIR__ . '/lib/EngineSwap.php';
require_once __DIR__ . '/lib/Tuning.php';
require_once __DIR__ . '/lib/GameService.php';
