<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/bootstrap.php';

function api_game(callable $callback): never
{
    try {
        $payload = $callback();
        Api::json(['ok' => true] + (is_array($payload) ? $payload : ['data' => $payload]));
    } catch (GameException $e) {
        Api::json(['ok' => false, 'error' => $e->getMessage()], $e->status);
    } catch (Throwable $e) {
        error_log('[Forever Racing] ' . $e->getMessage() . "\n" . $e->getTraceAsString());
        Api::json(['ok' => false, 'error' => 'Server error. Check the PHP error log for details.'], 500);
    }
}
