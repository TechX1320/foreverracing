<?php
declare(strict_types=1);

final class RaceSimulator
{
    public function __construct(private readonly array $config)
    {
    }

    public function distance(string $key): array
    {
        $row = $this->config['distances'][$key] ?? null;
        if (!is_array($row)) {
            throw new GameException('Unsupported race distance.');
        }
        return $row;
    }

    public function randomWeather(): array
    {
        return $this->weighted(is_array($this->config['weather'] ?? null) ? $this->config['weather'] : []);
    }

    public function randomLocation(): array
    {
        return $this->weighted(is_array($this->config['locations'] ?? null) ? $this->config['locations'] : []);
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

        $reaction = $this->reaction($level, $torque, $weight, (float)($context['reactionOffset'] ?? 0));
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

        return [
            'reactionTime' => round($reaction, 3),
            'elapsedTime' => round($et, 3),
            'trapSpeed' => round($trap, 2),
            'totalTime' => round($total, 3),
            'foul' => $foul,
        ];
    }

    private function reaction(int $level, float $torque, float $weight, float $offset): float
    {
        $skillBias = self::clamp($level / 100.0, 0.0, 1.0);
        $skewed = pow($this->random(0, 1), 2.0 - $skillBias);
        $rt = 0.050 + (0.450 * $skewed);
        $rt += ($torque > 300 && $weight < 2500) ? $this->random(0, 0.035) : $this->random(0, 0.010);
        $rt += $offset;
        $foulChance = max(0.02, 0.10 - ($level * 0.001));
        if ($this->random(0, 1) < $foulChance) {
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
        return $min + ((mt_rand() / mt_getrandmax()) * ($max - $min));
    }

    private static function clamp(float $value, float $min, float $max): float
    {
        return min($max, max($min, $value));
    }
}
