<?php
declare(strict_types=1);

final class GameException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400)
    {
        parent::__construct($message);
    }
}

final class GameService
{
    public static function playerPath(): string
    {
        return FR_DATA . '/players/admin.json';
    }

    public static function defaultPlayer(): array
    {
        $now = time();
        return [
            'schemaVersion' => 2,
            'user' => [
                'id' => 1,
                'username' => 'Admin',
                'createdAt' => $now,
            ],
            'wallet' => ['credits' => (int)app_config()['starting_credits']],
            'stats' => [
                'races' => 0,
                'wins' => 0,
                'losses' => 0,
                'bestReaction' => null,
                'showroomPurchases' => 0,
                'usedPurchases' => 0,
                'partsPurchased' => 0,
            ],
            'selectedCarId' => null,
            'garage' => [],
            'inventory' => ['parts' => []],
            'roguelike' => [
                'activeRun' => null,
                'bestStage' => 0,
                'runsStarted' => 0,
                'runsCompleted' => 0,
            ],
            'transactions' => [],
            'meta' => [
                'createdAt' => $now,
                'updatedAt' => $now,
            ],
        ];
    }

    public static function getPlayer(): array
    {
        $path = self::playerPath();
        $player = JsonStore::read($path, self::defaultPlayer());
        $normalized = self::normalizePlayer(is_array($player) ? $player : []);
        if (!is_file($path) || $normalized !== $player) {
            JsonStore::write($path, $normalized);
        }
        return $normalized;
    }

    public static function normalizePlayer(array $player): array
    {
        $default = self::defaultPlayer();
        $player['schemaVersion'] = 2;
        $player['user'] = array_replace($default['user'], is_array($player['user'] ?? null) ? $player['user'] : []);
        $player['wallet'] = array_replace($default['wallet'], is_array($player['wallet'] ?? null) ? $player['wallet'] : []);
        $player['stats'] = array_replace($default['stats'], is_array($player['stats'] ?? null) ? $player['stats'] : []);
        $player['garage'] = array_values(is_array($player['garage'] ?? null) ? $player['garage'] : []);
        $player['inventory'] = is_array($player['inventory'] ?? null) ? $player['inventory'] : $default['inventory'];
        $player['inventory']['parts'] = array_values(is_array($player['inventory']['parts'] ?? null) ? $player['inventory']['parts'] : []);
        $player['roguelike'] = array_replace($default['roguelike'], is_array($player['roguelike'] ?? null) ? $player['roguelike'] : []);
        $player['transactions'] = array_values(is_array($player['transactions'] ?? null) ? $player['transactions'] : []);
        $player['meta'] = array_replace($default['meta'], is_array($player['meta'] ?? null) ? $player['meta'] : []);
        $player['selectedCarId'] = $player['selectedCarId'] ?? null;
        $player['stats']['carsOwned'] = count($player['garage']);
        return $player;
    }

    public static function carCatalog(): array
    {
        $data = JsonStore::read(FR_DATA . '/catalog/cars.json', []);
        return is_array($data) ? array_values($data) : [];
    }

    public static function partsCatalog(): array
    {
        $data = JsonStore::read(FR_DATA . '/catalog/parts.json', []);
        return is_array($data) ? array_values($data) : [];
    }

    public static function purchaseNewCar(int $stockId): array
    {
        $catalog = self::carCatalog();
        $spec = self::findBy($catalog, 'stockId', $stockId);
        if (!$spec) {
            throw new GameException('That showroom car does not exist.', 404);
        }

        return self::mutatePlayer(function (array $player) use ($spec): array {
            $price = (int)$spec['price'];
            self::requireCredits($player, $price);
            $player['wallet']['credits'] -= $price;

            $car = self::createOwnedCar($spec, 'new', 0, 100, $price);
            $player['garage'][] = $car;
            $player['stats']['showroomPurchases'] = (int)$player['stats']['showroomPurchases'] + 1;
            if (!$player['selectedCarId']) {
                $player['selectedCarId'] = $car['carId'];
            }
            self::addTransaction($player, 'showroom_purchase', -$price, $car['displayName']);
            return $player;
        });
    }

    public static function selectCar(string $carId): array
    {
        return self::mutatePlayer(function (array $player) use ($carId): array {
            self::requireOwnedCar($player, $carId);
            $player['selectedCarId'] = $carId;
            return $player;
        });
    }

    public static function renameCar(string $carId, string $name): array
    {
        $name = trim(preg_replace('/\s+/', ' ', $name) ?? '');
        if ($name === '' || strlen($name) > 32) {
            throw new GameException('Car name must be between 1 and 32 characters.');
        }

        return self::mutatePlayer(function (array $player) use ($carId, $name): array {
            $index = self::requireOwnedCarIndex($player, $carId);
            $player['garage'][$index]['nickname'] = $name;
            return $player;
        });
    }

    public static function purchasePart(string $catalogId): array
    {
        $spec = self::findBy(self::partsCatalog(), 'catalogId', $catalogId);
        if (!$spec) {
            throw new GameException('That part does not exist.', 404);
        }

        return self::mutatePlayer(function (array $player) use ($spec): array {
            $price = (int)$spec['price'];
            self::requireCredits($player, $price);
            $player['wallet']['credits'] -= $price;
            $instance = [
                'inventoryId' => self::id('part'),
                'catalogId' => (string)$spec['catalogId'],
                'installedOnCarId' => null,
                'purchasedAt' => time(),
            ];
            $player['inventory']['parts'][] = $instance;
            $player['stats']['partsPurchased'] = (int)$player['stats']['partsPurchased'] + 1;
            self::addTransaction($player, 'part_purchase', -$price, (string)$spec['name']);
            return $player;
        });
    }

    public static function installPart(string $inventoryId, string $carId): array
    {
        $catalog = self::partsCatalog();
        return self::mutatePlayer(function (array $player) use ($inventoryId, $carId, $catalog): array {
            $carIndex = self::requireOwnedCarIndex($player, $carId);
            $partIndex = self::requireOwnedPartIndex($player, $inventoryId);
            $instance = $player['inventory']['parts'][$partIndex];
            $previousCarId = $instance['installedOnCarId'] ?? null;
            $spec = self::findBy($catalog, 'catalogId', (string)$instance['catalogId']);
            if (!$spec) {
                throw new GameException('Part catalog entry is missing.', 500);
            }

            $slot = (string)$spec['slot'];
            foreach ($player['inventory']['parts'] as &$ownedPart) {
                if (($ownedPart['installedOnCarId'] ?? null) !== $carId) {
                    continue;
                }
                $installedSpec = self::findBy($catalog, 'catalogId', (string)($ownedPart['catalogId'] ?? ''));
                if ($installedSpec && (string)$installedSpec['slot'] === $slot) {
                    $ownedPart['installedOnCarId'] = null;
                }
            }
            unset($ownedPart);

            $player['inventory']['parts'][$partIndex]['installedOnCarId'] = $carId;
            $player['garage'][$carIndex] = self::recalculateCar($player['garage'][$carIndex], $player['inventory']['parts'], $catalog);
            if ($previousCarId && (string)$previousCarId !== (string)$carId) {
                $previousCarIndex = self::requireOwnedCarIndex($player, (string)$previousCarId);
                $player['garage'][$previousCarIndex] = self::recalculateCar($player['garage'][$previousCarIndex], $player['inventory']['parts'], $catalog);
            }
            return $player;
        });
    }

    public static function uninstallPart(string $inventoryId): array
    {
        $catalog = self::partsCatalog();
        return self::mutatePlayer(function (array $player) use ($inventoryId, $catalog): array {
            $partIndex = self::requireOwnedPartIndex($player, $inventoryId);
            $carId = $player['inventory']['parts'][$partIndex]['installedOnCarId'] ?? null;
            $player['inventory']['parts'][$partIndex]['installedOnCarId'] = null;
            if ($carId) {
                $carIndex = self::requireOwnedCarIndex($player, (string)$carId);
                $player['garage'][$carIndex] = self::recalculateCar($player['garage'][$carIndex], $player['inventory']['parts'], $catalog);
            }
            return $player;
        });
    }

    public static function usedLot(): array
    {
        $path = FR_DATA . '/runtime/used-lot.json';
        $refresh = (int)app_config()['used_lot_refresh_seconds'];
        $now = time();
        $state = JsonStore::read($path, []);
        if (!is_array($state) || ($state['expiresAt'] ?? 0) <= $now || !is_array($state['listings'] ?? null)) {
            $state = self::generateUsedLot($now, $refresh);
            JsonStore::write($path, $state);
        }
        return $state;
    }

    public static function refreshUsedLot(): array
    {
        $now = time();
        $state = self::generateUsedLot($now, (int)app_config()['used_lot_refresh_seconds']);
        JsonStore::write(FR_DATA . '/runtime/used-lot.json', $state);
        return $state;
    }

    public static function purchaseUsedCar(string $listingId): array
    {
        $lotPath = FR_DATA . '/runtime/used-lot.json';
        $lot = self::usedLot();
        $listing = self::findBy($lot['listings'], 'listingId', $listingId);
        if (!$listing) {
            throw new GameException('That used listing is no longer available.', 404);
        }
        $spec = self::findBy(self::carCatalog(), 'stockId', (int)$listing['stockId']);
        if (!$spec) {
            throw new GameException('Vehicle catalog entry is missing.', 500);
        }

        $player = self::mutatePlayer(function (array $player) use ($listing, $spec): array {
            $price = (int)$listing['price'];
            self::requireCredits($player, $price);
            $player['wallet']['credits'] -= $price;
            $car = self::createOwnedCar(
                $spec,
                'used',
                (int)$listing['mileage'],
                (int)$listing['condition'],
                $price
            );
            $player['garage'][] = $car;
            $player['stats']['usedPurchases'] = (int)$player['stats']['usedPurchases'] + 1;
            if (!$player['selectedCarId']) {
                $player['selectedCarId'] = $car['carId'];
            }
            self::addTransaction($player, 'used_purchase', -$price, $car['displayName']);
            return $player;
        });

        JsonStore::mutate($lotPath, $lot, function (array $state) use ($listingId): array {
            $state['listings'] = array_values(array_filter(
                is_array($state['listings'] ?? null) ? $state['listings'] : [],
                fn(array $row): bool => (string)($row['listingId'] ?? '') !== $listingId
            ));
            return $state;
        });

        return $player;
    }

    public static function quickRace(): array
    {
        $result = null;
        $player = self::mutatePlayer(function (array $player) use (&$result): array {
            $car = self::selectedCar($player);
            if (!$car) {
                throw new GameException('Select a car before racing.');
            }

            $hp = max(1.0, (float)$car['derived']['hp']);
            $weight = max(500.0, (float)$car['derived']['weight']);
            $grip = max(0.5, (float)($car['derived']['grip'] ?? 1.0));
            $playerPwr = $hp / $weight;

            $difficulty = mt_rand(92, 108) / 100;
            $oppPwr = $playerPwr * $difficulty;
            $oppWeight = (int)round($weight * (mt_rand(92, 108) / 100));
            $oppHp = (int)round($oppPwr * $oppWeight);

            $reaction = mt_rand(80, 420) / 1000;
            $oppReaction = mt_rand(100, 450) / 1000;
            $playerEt = 17.6 - ($playerPwr * 38.0) - (($grip - 1.0) * 0.45) + $reaction + (mt_rand(-12, 12) / 100);
            $oppEt = 17.6 - ($oppPwr * 38.0) + $oppReaction + (mt_rand(-12, 12) / 100);
            $playerEt = max(6.2, round($playerEt, 3));
            $oppEt = max(6.2, round($oppEt, 3));
            $won = $playerEt < $oppEt;
            $reward = $won ? mt_rand(450, 850) : mt_rand(90, 220);

            $player['wallet']['credits'] += $reward;
            $player['stats']['races'] = (int)$player['stats']['races'] + 1;
            $player['stats'][$won ? 'wins' : 'losses'] = (int)$player['stats'][$won ? 'wins' : 'losses'] + 1;
            $bestReaction = $player['stats']['bestReaction'];
            if ($bestReaction === null || $reaction < (float)$bestReaction) {
                $player['stats']['bestReaction'] = $reaction;
            }
            self::addTransaction($player, 'race_reward', $reward, $won ? 'Quick Race win' : 'Quick Race participation');

            $result = [
                'won' => $won,
                'reaction' => $reaction,
                'playerEt' => $playerEt,
                'opponentEt' => $oppEt,
                'opponent' => [
                    'name' => self::opponentName(),
                    'hp' => $oppHp,
                    'weight' => $oppWeight,
                ],
                'reward' => $reward,
                'carName' => self::carName($car),
            ];
            return $player;
        });

        return ['player' => $player, 'race' => $result];
    }

    public static function roguelikeStart(): array
    {
        return self::mutatePlayer(function (array $player): array {
            if (!self::selectedCar($player)) {
                throw new GameException('Select a car before starting a RogueLike run.');
            }
            if (is_array($player['roguelike']['activeRun'] ?? null)) {
                throw new GameException('A RogueLike run is already active.');
            }
            $player['roguelike']['runsStarted'] = (int)$player['roguelike']['runsStarted'] + 1;
            $player['roguelike']['activeRun'] = [
                'runId' => self::id('run'),
                'stage' => 1,
                'maxStages' => 7,
                'runCredits' => 0,
                'boost' => 0,
                'startedAt' => time(),
                'lastResult' => null,
            ];
            return $player;
        });
    }

    public static function roguelikeStep(string $choice): array
    {
        if (!in_array($choice, ['safe', 'push'], true)) {
            throw new GameException('Unknown run choice.');
        }

        $step = null;
        $player = self::mutatePlayer(function (array $player) use ($choice, &$step): array {
            $run = $player['roguelike']['activeRun'] ?? null;
            if (!is_array($run)) {
                throw new GameException('No active RogueLike run.');
            }
            $car = self::selectedCar($player);
            if (!$car) {
                throw new GameException('Your selected car is missing.');
            }

            $stage = (int)$run['stage'];
            $risk = $choice === 'push' ? 1.09 : 0.99;
            $boost = (float)($run['boost'] ?? 0);
            $rating = ((float)$car['derived']['hp'] / max(500.0, (float)$car['derived']['weight'])) * (1 + $boost);
            $difficulty = $rating * (0.88 + $stage * 0.035) * $risk;
            $roll = (mt_rand(930, 1070) / 1000) * $rating;
            $won = $roll >= $difficulty;
            $reward = $won ? (int)round((420 + ($stage * 180)) * ($choice === 'push' ? 1.45 : 1.0)) : 0;

            if (!$won) {
                $banked = (int)floor(((int)$run['runCredits']) * 0.35);
                $player['wallet']['credits'] += $banked;
                self::addTransaction($player, 'roguelike_cashout', $banked, 'RogueLike consolation');
                $player['roguelike']['bestStage'] = max((int)$player['roguelike']['bestStage'], $stage);
                $player['roguelike']['activeRun'] = null;
                $step = ['won' => false, 'stage' => $stage, 'banked' => $banked, 'finished' => true];
                return $player;
            }

            $run['runCredits'] = (int)$run['runCredits'] + $reward;
            $run['boost'] = min(0.16, $boost + ($choice === 'push' ? 0.03 : 0.015));
            $finished = $stage >= (int)$run['maxStages'];
            if ($finished) {
                $banked = (int)$run['runCredits'];
                $player['wallet']['credits'] += $banked;
                self::addTransaction($player, 'roguelike_cashout', $banked, 'RogueLike complete');
                $player['roguelike']['runsCompleted'] = (int)$player['roguelike']['runsCompleted'] + 1;
                $player['roguelike']['bestStage'] = max((int)$player['roguelike']['bestStage'], $stage);
                $player['roguelike']['activeRun'] = null;
                $step = ['won' => true, 'stage' => $stage, 'reward' => $reward, 'banked' => $banked, 'finished' => true];
                return $player;
            }

            $run['lastResult'] = ['won' => true, 'stage' => $stage, 'reward' => $reward, 'choice' => $choice];
            $run['stage'] = $stage + 1;
            $player['roguelike']['bestStage'] = max((int)$player['roguelike']['bestStage'], $stage);
            $player['roguelike']['activeRun'] = $run;
            $step = ['won' => true, 'stage' => $stage, 'reward' => $reward, 'finished' => false];
            return $player;
        });

        return ['player' => $player, 'step' => $step];
    }

    public static function carName(array $car): string
    {
        $nickname = trim((string)($car['nickname'] ?? ''));
        return $nickname !== '' ? $nickname : (string)($car['displayName'] ?? 'Unknown Car');
    }

    private static function mutatePlayer(callable $mutator): array
    {
        return JsonStore::mutate(self::playerPath(), self::defaultPlayer(), function ($current) use ($mutator): array {
            $player = self::normalizePlayer(is_array($current) ? $current : []);
            $player = $mutator($player);
            $player = self::normalizePlayer($player);
            $player['meta']['updatedAt'] = time();
            return $player;
        });
    }

    private static function selectedCar(array $player): ?array
    {
        $id = $player['selectedCarId'] ?? null;
        if (!$id) {
            return null;
        }
        foreach ($player['garage'] as $car) {
            if ((string)($car['carId'] ?? '') === (string)$id) {
                return $car;
            }
        }
        return null;
    }

    private static function createOwnedCar(array $spec, string $source, int $mileage, int $condition, int $purchasePrice): array
    {
        $base = $spec['base'];
        return [
            'carId' => self::id('car'),
            'stockId' => (int)$spec['stockId'],
            'displayName' => sprintf('%d %s %s', (int)$spec['year'], (string)$spec['make'], (string)$spec['model']),
            'nickname' => '',
            'source' => $source,
            'purchasePrice' => $purchasePrice,
            'mileage' => $mileage,
            'condition' => $condition,
            'base' => [
                'hp' => (int)$base['hp'],
                'torque' => (int)$base['torque'],
                'weight' => (int)$base['weight'],
                'grip' => (float)($base['grip'] ?? 1.0),
                'drivetrain' => (string)($base['drivetrain'] ?? 'FWD'),
            ],
            'derived' => [
                'hp' => (int)$base['hp'],
                'torque' => (int)$base['torque'],
                'weight' => (int)$base['weight'],
                'grip' => (float)($base['grip'] ?? 1.0),
            ],
            'createdAt' => time(),
        ];
    }

    private static function recalculateCar(array $car, array $inventory, array $catalog): array
    {
        $derived = [
            'hp' => (float)$car['base']['hp'],
            'torque' => (float)$car['base']['torque'],
            'weight' => (float)$car['base']['weight'],
            'grip' => (float)($car['base']['grip'] ?? 1.0),
        ];

        foreach ($inventory as $instance) {
            if (($instance['installedOnCarId'] ?? null) !== ($car['carId'] ?? null)) {
                continue;
            }
            $spec = self::findBy($catalog, 'catalogId', (string)($instance['catalogId'] ?? ''));
            if (!$spec) {
                continue;
            }
            foreach (($spec['effects'] ?? []) as $effect) {
                $stat = (string)($effect['stat'] ?? '');
                if (!array_key_exists($stat, $derived)) {
                    continue;
                }
                $value = (float)($effect['value'] ?? 0);
                $op = (string)($effect['op'] ?? 'add');
                if ($op === 'mul') {
                    $derived[$stat] *= $value;
                } else {
                    $derived[$stat] += $value;
                }
            }
        }

        $car['derived'] = [
            'hp' => (int)round(max(1, $derived['hp'])),
            'torque' => (int)round(max(1, $derived['torque'])),
            'weight' => (int)round(max(500, $derived['weight'])),
            'grip' => round(max(0.5, $derived['grip']), 3),
        ];
        return $car;
    }

    private static function generateUsedLot(int $now, int $refresh): array
    {
        $catalog = self::carCatalog();
        if (!$catalog) {
            return ['generatedAt' => $now, 'expiresAt' => $now + $refresh, 'listings' => []];
        }

        $listings = [];
        $count = min(8, max(4, count($catalog)));
        for ($i = 0; $i < $count; $i++) {
            $spec = $catalog[array_rand($catalog)];
            $mileage = mt_rand(2800, 195000);
            $condition = mt_rand(62, 96);
            $ageDiscount = min(0.55, $mileage / 360000);
            $conditionFactor = 0.55 + ($condition / 220);
            $price = (int)round(((int)$spec['price']) * (1 - $ageDiscount) * $conditionFactor / 50) * 50;
            $price = max(1200, $price);
            $listings[] = [
                'listingId' => self::id('used'),
                'stockId' => (int)$spec['stockId'],
                'price' => $price,
                'mileage' => $mileage,
                'condition' => $condition,
            ];
        }

        return ['generatedAt' => $now, 'expiresAt' => $now + $refresh, 'listings' => $listings];
    }

    private static function requireCredits(array $player, int $amount): void
    {
        if ((int)($player['wallet']['credits'] ?? 0) < $amount) {
            throw new GameException('Not enough credits.');
        }
    }

    private static function requireOwnedCar(array $player, string $carId): array
    {
        foreach ($player['garage'] as $car) {
            if ((string)($car['carId'] ?? '') === $carId) {
                return $car;
            }
        }
        throw new GameException('You do not own that car.', 404);
    }

    private static function requireOwnedCarIndex(array $player, string $carId): int
    {
        foreach ($player['garage'] as $index => $car) {
            if ((string)($car['carId'] ?? '') === $carId) {
                return (int)$index;
            }
        }
        throw new GameException('You do not own that car.', 404);
    }

    private static function requireOwnedPartIndex(array $player, string $inventoryId): int
    {
        foreach ($player['inventory']['parts'] as $index => $part) {
            if ((string)($part['inventoryId'] ?? '') === $inventoryId) {
                return (int)$index;
            }
        }
        throw new GameException('You do not own that part.', 404);
    }

    private static function addTransaction(array &$player, string $type, int $amount, string $description): void
    {
        $player['transactions'][] = [
            'transactionId' => self::id('txn'),
            'type' => $type,
            'amount' => $amount,
            'description' => $description,
            'createdAt' => time(),
        ];
        if (count($player['transactions']) > 75) {
            $player['transactions'] = array_slice($player['transactions'], -75);
        }
    }

    private static function findBy(array $rows, string $key, string|int $value): ?array
    {
        foreach ($rows as $row) {
            if ((string)($row[$key] ?? '') === (string)$value) {
                return $row;
            }
        }
        return null;
    }

    private static function id(string $prefix): string
    {
        return $prefix . '_' . dechex(time()) . '_' . bin2hex(random_bytes(4));
    }

    private static function opponentName(): string
    {
        $names = ['Night Shift', 'Redline', 'The Commuter', 'Left Lane', 'Cut Light', 'Sleeper', 'Boost Leak', 'Test Mule'];
        return $names[array_rand($names)];
    }
}
