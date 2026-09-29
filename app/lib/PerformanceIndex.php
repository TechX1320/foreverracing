<?php
declare(strict_types=1);

final class PerformanceIndex
{
    public const VERSION = 1;
    public const PASSES = 51;
    public const BASE_ET = 20.0;
    public const PER_TENTH = 8;

    public static function benchmark(array $context, array $racingConfig, int $passes = self::PASSES, int $seed = 0x46525049): array
    {
        $state = $seed & 0xFFFFFFFF;
        $rng = static function () use (&$state): float {
            $state = (int)((($state * 1664525) + 1013904223) & 0xFFFFFFFF);
            return $state / 4294967296.0;
        };

        $simulator = new RaceSimulator($racingConfig, $rng);
        $condition = ['name' => 'Benchmark', 'etModifier' => 0, 'mphModifier' => 0, 'weight' => 1];
        $sampleCount = max(3, $passes);
        $ets = [];
        $traps = [];

        for ($i = 0; $i < $sampleCount; $i++) {
            $run = $simulator->simulate([
                'hp' => (float)($context['hp'] ?? $context['horsepower'] ?? 1),
                'torque' => (float)($context['torque'] ?? 1),
                'weight' => (float)($context['weight'] ?? $context['weightLbs'] ?? 500),
                'grip' => (float)($context['grip'] ?? 1),
                'drivetrain' => (string)($context['drivetrain'] ?? ''),
                'level' => 100,
                'allowFoul' => false,
                'reactionOffset' => 0,
            ], '1/4', $condition);
            $ets[] = (float)$run['elapsedTime'];
            $traps[] = (float)$run['trapSpeed'];
        }

        sort($ets, SORT_NUMERIC);
        sort($traps, SORT_NUMERIC);
        $medianEt = round(self::median($ets), 3);
        $medianTrap = round(self::median($traps), 2);

        return [
            'quarterMileEt' => $medianEt,
            'quarterMileTrap' => $medianTrap,
            'performanceIndex' => self::fromEt($medianEt),
            'passes' => $sampleCount,
            'version' => self::VERSION,
        ];
    }

    public static function forCar(array $car, array $racingConfig): array
    {
        $context = is_array($car['derived'] ?? null)
            ? $car['derived']
            : (is_array($car['base'] ?? null) ? $car['base'] : $car);
        return self::benchmark($context, $racingConfig);
    }

    public static function fromEt(float $et): int
    {
        $value = (self::BASE_ET - $et) * (self::PER_TENTH * 10);
        return max(0, (int)round($value));
    }

    public static function classFromIndex(int $index): string
    {
        $pi = max(0, $index);
        if ($pi < 450) return 'D';
        if ($pi < 600) return 'C';
        if ($pi < 750) return 'B';
        if ($pi < 900) return 'A';
        if ($pi < 1100) return 'S';
        return 'X';
    }

    private static function median(array $values): float
    {
        $count = count($values);
        if ($count === 0) return 0.0;
        $middle = intdiv($count, 2);
        if ($count % 2 === 1) return (float)$values[$middle];
        return ((float)$values[$middle - 1] + (float)$values[$middle]) / 2.0;
    }
}
