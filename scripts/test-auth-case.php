<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$tests = ['Admin', 'admin', 'ADMIN', 'aDmIn'];
foreach ($tests as $username) {
    if (!Auth::credentialsValid($username, '12345')) {
        fwrite(STDERR, "Case-insensitive credential check failed for {$username}\n");
        exit(1);
    }
}
if (Auth::credentialsValid('NotAdmin', '12345')) {
    fwrite(STDERR, "Unexpected username accepted.\n");
    exit(1);
}
if (Auth::credentialsValid('Admin', 'wrong')) {
    fwrite(STDERR, "Unexpected password accepted.\n");
    exit(1);
}
fwrite(STDOUT, "Case-insensitive server credential test passed.\n");
