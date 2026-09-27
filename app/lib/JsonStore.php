<?php
declare(strict_types=1);

final class JsonStore
{
    public static function read(string $path, mixed $default = []): mixed
    {
        if (!is_file($path)) {
            return $default;
        }

        $raw = file_get_contents($path);
        if ($raw === false || trim($raw) === '') {
            return $default;
        }

        $decoded = json_decode($raw, true);
        return json_last_error() === JSON_ERROR_NONE ? $decoded : $default;
    }

    public static function write(string $path, mixed $data): void
    {
        self::ensureDirectory(dirname($path));
        $lockPath = $path . '.lock';
        $lock = fopen($lockPath, 'c+');
        if ($lock === false) {
            throw new RuntimeException('Unable to open data lock.');
        }

        try {
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Unable to lock data file.');
            }
            self::atomicWrite($path, $data);
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public static function mutate(string $path, mixed $default, callable $mutator): mixed
    {
        self::ensureDirectory(dirname($path));
        $lockPath = $path . '.lock';
        $lock = fopen($lockPath, 'c+');
        if ($lock === false) {
            throw new RuntimeException('Unable to open data lock.');
        }

        try {
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Unable to lock data file.');
            }

            $current = self::read($path, $default);
            $updated = $mutator($current);
            self::atomicWrite($path, $updated);
            return $updated;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    private static function atomicWrite(string $path, mixed $data): void
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Unable to encode JSON.');
        }

        $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $json . PHP_EOL, LOCK_EX) === false) {
            throw new RuntimeException('Unable to write temporary data file.');
        }

        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException('Unable to replace data file.');
        }
    }

    private static function ensureDirectory(string $dir): void
    {
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Unable to create data directory.');
        }
    }
}
