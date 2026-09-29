<?php
declare(strict_types=1);

final class RaceSimulator
{
    /** @var callable|null */
    private $rng;

    public function __construct(private readonly array $config, ?callable $rng = null)
    {
        $this->rng = $rng;
    }

    public function distance(string $key): array
    {
        $row = $this->config['distances'][$key] ?? null;
        if (!is_array($row)) {
            throw new GameException('Unsupported race distance.');
        }
        return $row;
    }

    public function randomWeather(int $level = 1): array
    {
        $rows = array_values(array_filter(
            is_array($this->config['weather'] ?? null) ? $this->config['weather'] : [],
            fn(array $row): bool => ($row['quickRace'] ?? true) !== false
                && empty($row['nightmare'])
                && (int)($row['minLevel'] ?? 1) <= max(1, $level)
        ));
        return $this->weighted($rows ?: [['name' => 'Cool & Cloudy', 'weight' => 1, 'etModifier' => 0, 'mphModifier' => 0]]);
    }

    public function randomLocation(int $level = 1): array
    {
        $rows = array_values(array_filter(
            is_array($this->config['locations'] ?? null) ? $this->config['locations'] : [],
            fn(array $row): bool => empty($row['nightmare'])
                && (int)($row['minLevel'] ?? 1) <= max(1, $level)
        ));
        return $this->weighted($rows ?: [['name' => 'Local Test & Tune', 'weight' => 1]]);
    }

    public function simulate(array $context, string $distanceKey, ?array $weather = null): array
    {
        $distance = $this->distance($distanceKey);
        $condition = $weather ?? $this->randomWeather();
        $hp = max(1.0, (float)($context['hp'] ?? $context['horsepower'] ?? 1));
        $torque = max(1.0, (float)($context['torque'] ?? 1));
        $weight = max(500.0, (float)($context['weight'] ?? $context['weightLbs'] ?? 500));
        $grip = self::clamp((float)($context['grip'] ?? 1.0), 0.5, 2.0);
        $level = max(1, (int)($context['level'] ?? 1));
        $drivetrain = strtoupper((string)($context['drivetrain'] ?? ''));

        $reaction = $this->reaction(
            $level,
            $torque,
            $weight,
            (float)($context['reactionOffset'] ?? 0),
            ($context['allowFoul'] ?? true) !== false
        );
        $et = (float)$distance['etFactor'] * pow($weight / $hp, 1.0 / 3.0);
        $et += (float)($condition['etModifier'] ?? 0) + $this->random(-(float)($distance['etRandom'] ?? 0), (float)($distance['etRandom'] ?? 0));
        $et = self::clamp($et, (float)($distance['minEt'] ?? 1), (float)($distance['maxEt'] ?? 999));

        if ($torque > 300 && $weight < 2500) {
            $et *= 1.015 + $this->random(0, 0.02);
        } else {
            $et *= 1.0 + $this->random(-0.015, 0.025);
        }

        $et *= self::clamp(1.0 - (($grip - 1.0) * 0.035), 0.94, 1.06);

        $estimatedGears = 5 + ($hp > 400 ? 1 : 0);
        $shiftSkillFactor = self::clamp($level / 100.0, 0.0, 1.0);
        $et += $estimatedGears * 0.05 * (1.0 - ($shiftSkillFactor * 0.4)) + $this->random(-0.05, 0.08);

        if ($this->random(0, 1) < 0.10) {
            $et *= 1.0 + $this->random(0.005, 0.025);
        }

        if (!empty($condition['slippery'])) {
            $ttw = $torque / $weight;
            $name = (string)($condition['name'] ?? '');
            if ($name === 'Rainy' && $ttw > 0.12) $et *= 1.01 + $this->random(0, 0.015);
            if ($name === 'Snow' && $ttw > 0.10) $et *= 1.03 + $this->random(0, 0.03);
            if ($name === 'Ice' && $ttw > 0.08) $et *= 1.06 + $this->random(0.02, 0.04);
            if ($name === 'Oil Spill' && $ttw > 0.09) $et *= 1.02 + $this->random(0.01, 0.03);
            if (($name === 'Drizzle' || $name === 'Misty')) $et *= 1.005 + $this->random(0, 0.01);
        }

        $et = max((float)($distance['minEt'] ?? 1), $et);

        $baseTrap = 234.0 * pow($hp / $weight, 1.0 / 3.0);
        $trap = self::clamp(
            ($baseTrap * (float)($distance['trapMultiplier'] ?? 1)) + (float)($condition['mphModifier'] ?? 0) + $this->random(-1.25, 1.25),
            (float)($distance['minTrap'] ?? 20),
            (float)($distance['maxTrap'] ?? 300)
        );

        $foul = $reaction < 0;
        $total = $foul ? $et + 60 + abs($reaction) : $et + $reaction;

        $driveFactor = $drivetrain === 'AWD' ? 0.82 : ($drivetrain === 'FWD' ? 1.04 : 1.0);
        $surfaceFactor = !empty($condition['slippery']) ? 0.82 : 1.0;
        $tractionDemand = ((($torque / $weight) * 9.0) + (($hp / $weight) * 2.0)) * $driveFactor;
        $tractionCapacity = $grip * 0.72 * $surfaceFactor;
        $gripLoss = self::clamp(($tractionDemand - $tractionCapacity) / 0.42, 0.0, 1.0);
        $smokeLevel = self::clamp(($gripLoss - 0.06) / 0.6, 0.0, 1.0);

        return [
            'reactionTime' => round($reaction, 3),
            'elapsedTime' => round($et, 3),
            'trapSpeed' => round($trap, 2),
            'totalTime' => round($total, 3),
            'foul' => $foul,
            'traction' => [
                'gripLoss' => round($gripLoss, 3),
                'wheelSlip' => round(self::clamp($gripLoss * 1.2, 0.0, 1.0), 3),
                'smokeLevel' => round($smokeLevel, 3),
            ],
        ];
    }

    private function reaction(int $level, float $torque, float $weight, float $offset, bool $allowFoul = true): float
    {
        $skillBias = self::clamp($level / 100.0, 0.0, 1.0);
        $skewed = pow($this->random(0, 1), 2.0 - $skillBias);
        $rt = 0.050 + (0.450 * $skewed);
        $rt += ($torque > 300 && $weight < 2500) ? $this->random(0, 0.035) : $this->random(0, 0.010);
        $rt += $offset;
        $foulChance = max(0.02, 0.10 - ($level * 0.001));
        if ($allowFoul && $this->random(0, 1) < $foulChance) {
            $rt = -$this->random(0.015, 0.050);
        }
        return $rt;
    }

    private function weighted(array $rows): array
    {
        if (!$rows) return ['name' => 'Unknown', 'weight' => 1];
        $total = 0.0;
        foreach ($rows as $row) $total += max(0.0, (float)($row['weight'] ?? $row['rarityWeight'] ?? 0));
        if ($total <= 0) return $rows[0];
        $roll = $this->random(0, $total);
        foreach ($rows as $row) {
            $roll -= max(0.0, (float)($row['weight'] ?? $row['rarityWeight'] ?? 0));
            if ($roll <= 0) return $row;
        }
        return $rows[array_key_last($rows)];
    }

    private function random(float $min, float $max): float
    {
        $unit = $this->rng ? (float)call_user_func($this->rng) : (mt_rand() / mt_getrandmax());
        $unit = min(1.0, max(0.0, $unit));
        return $min + ($unit * ($max - $min));
    }

    private static function clamp(float $value, float $min, float $max): float
    {
        return min($max, max($min, $value));
    }
}
