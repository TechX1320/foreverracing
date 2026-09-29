<?php
declare(strict_types=1);

const FR_STATIC_BUILD = true;

$root = dirname(__DIR__);
$docs = $root . '/docs';
$appConfig = require $root . '/app/config/app.php';
$build = (string)($appConfig['build'] ?? 'unknown');

function rrmdir(string $path): void
{
    if (!is_dir($path)) {
        return;
    }
    $items = scandir($path);
    if ($items === false) {
        throw new RuntimeException("Unable to read directory: {$path}");
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $target = $path . DIRECTORY_SEPARATOR . $item;
        if (is_dir($target)) {
            rrmdir($target);
        } else {
            unlink($target);
        }
    }
}

function copyTree(string $source, string $destination): void
{
    if (!is_dir($source)) {
        throw new RuntimeException("Missing source directory: {$source}");
    }
    if (!is_dir($destination) && !mkdir($destination, 0777, true) && !is_dir($destination)) {
        throw new RuntimeException("Unable to create directory: {$destination}");
    }
    $items = scandir($source);
    if ($items === false) {
        throw new RuntimeException("Unable to read directory: {$source}");
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $from = $source . DIRECTORY_SEPARATOR . $item;
        $to = $destination . DIRECTORY_SEPARATOR . $item;
        if (is_dir($from)) {
            copyTree($from, $to);
        } elseif (!copy($from, $to)) {
            throw new RuntimeException("Unable to copy {$from} to {$to}");
        }
    }
}

if (!is_dir($docs) && !mkdir($docs, 0777, true) && !is_dir($docs)) {
    throw new RuntimeException("Unable to create docs directory.");
}
rrmdir($docs);

copyTree($root . '/assets', $docs . '/assets');
copyTree($root . '/data/catalog', $docs . '/data/catalog');
copyTree($root . '/data/config', $docs . '/data/config');

foreach (['manifest.webmanifest', 'service-worker.js'] as $file) {
    if (!copy($root . '/' . $file, $docs . '/' . $file)) {
        throw new RuntimeException("Unable to copy {$file}");
    }
}

ob_start();
require $root . '/index.php';
$html = (string)ob_get_clean();
file_put_contents($docs . '/index.html', $html);
file_put_contents($docs . '/.nojekyll', "
");
file_put_contents($docs . '/BUILD_INFO.txt', "Generated from shared source for GitHub Pages.
Build: {$build}
Storage mode: local
Offline service worker: disabled in static development mode
Race presentation: persistent two-phase start/finish with blocking real-time playback
V0.4F.1: certified starter car visuals and direct Buy + Install parts flow
Do not edit docs/ by hand; run php scripts/build-static.php.
");

fwrite(STDOUT, "Built static GitHub Pages site in docs/.
");
