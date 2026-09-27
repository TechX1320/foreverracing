<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$tests = ['Admin', 'admin', 'ADMIN', 'aDmIn'];
foreach ($tests as $username) {
    if (!Auth::login($username, '12345')) {
        fwrite(STDERR, "Case-insensitive login failed for {$username}\n");
        exit(1);
    }
}
if (Auth::login('NotAdmin', '12345')) {
    fwrite(STDERR, "Unexpected username accepted.\n");
    exit(1);
}
fwrite(STDOUT, "Case-insensitive server login test passed.\n");
