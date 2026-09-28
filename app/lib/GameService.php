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

    public static function resetPlayer(): void
    {
        $path = self::playerPath();
        if (is_file($path)) @unlink($path);
        if (is_file($path . '.lock')) @unlink($path . '.lock');
    }

    public static function defaultPlayer(): array
    {
        $now = time();
        $config = app_config();
        return [
            'schemaVersion' => (int)$config['schema_version'],
            'user' => ['id' => 1, 'username' => 'Admin', 'createdAt' => $now],
            'wallet' => ['credits' => (int)$config['starting_credits']],
            'progression' => ['level' => 1, 'exp' => 0, 'rep' => 0],
            'tutorial' => [
                'version' => (int)$config['tutorial_version'],
                'status' => 'active',
                'step' => 'welcome',
                'completedSteps' => [],
            ],
            'stats' => [
                'races' => 0, 'wins' => 0, 'losses' => 0, 'bestReaction' => null,
                'showroomPurchases' => 0, 'usedPurchases' => 0, 'partsPurchased' => 0,
            ],
            'selectedCarId' => null,
            'garage' => [],
            'inventory' => ['parts' => []],
            'roguelike' => ['activeRun' => null, 'bestStage' => 0, 'runsStarted' => 0, 'runsCompleted' => 0],
            'activeRace' => null,
            'raceHistory' => [],
            'transactions' => [],
            'meta' => ['createdAt' => $now, 'updatedAt' => $now],
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
        $player['schemaVersion'] = (int)app_config()['schema_version'];
        $player['user'] = array_replace($default['user'], is_array($player['user'] ?? null) ? $player['user'] : []);
        $player['wallet'] = array_replace($default['wallet'], is_array($player['wallet'] ?? null) ? $player['wallet'] : []);
        $player['progression'] = array_replace($default['progression'], is_array($player['progression'] ?? null) ? $player['progression'] : []);
        $player['tutorial'] = array_replace($default['tutorial'], is_array($player['tutorial'] ?? null) ? $player['tutorial'] : []);
        $player['tutorial']['completedSteps'] = array_values(is_array($player['tutorial']['completedSteps'] ?? null) ? $player['tutorial']['completedSteps'] : []);
        if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'build_stages') {
            $player['tutorial']['step'] = 'first_race';
        }
        $player['stats'] = array_replace($default['stats'], is_array($player['stats'] ?? null) ? $player['stats'] : []);
        $garage = array_values(is_array($player['garage'] ?? null) ? $player['garage'] : []);
        $player['garage'] = array_map(fn(array $car): array => self::normalizeCar($car), $garage);
        $player['inventory'] = is_array($player['inventory'] ?? null) ? $player['inventory'] : $default['inventory'];
        $player['inventory']['parts'] = array_values(is_array($player['inventory']['parts'] ?? null) ? $player['inventory']['parts'] : []);
        $player['roguelike'] = array_replace($default['roguelike'], is_array($player['roguelike'] ?? null) ? $player['roguelike'] : []);
        $player['activeRace'] = is_array($player['activeRace'] ?? null) ? $player['activeRace'] : null;
        $player['raceHistory'] = array_values(is_array($player['raceHistory'] ?? null) ? $player['raceHistory'] : []);
        $player['transactions'] = array_values(is_array($player['transactions'] ?? null) ? $player['transactions'] : []);
        $player['meta'] = array_replace($default['meta'], is_array($player['meta'] ?? null) ? $player['meta'] : []);
        $player['selectedCarId'] = $player['selectedCarId'] ?? null;
        $player['stats']['carsOwned'] = count($player['garage']);
        $player['progression']['rep'] = (int)($player['progression']['rep'] ?? 0);
        $player['progression']['exp'] = (int)($player['progression']['exp'] ?? $player['progression']['rep'] ?? 0);
        $player['progression']['level'] = self::levelFromExp((int)$player['progression']['exp']);
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

    public static function racingConfig(): array
    {
        $data = JsonStore::read(FR_DATA . '/config/racing.json', []);
        return is_array($data) ? $data : [];
    }

    public static function purchaseNewCar(int $stockId): array
    {
        $spec = self::findBy(self::carCatalog(), 'stockId', $stockId);
        if (!$spec) {
            throw new GameException('That showroom car does not exist.', 404);
        }

        return self::mutatePlayer(function (array $player) use ($spec): array {
            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'buy_first_car') {
                throw new GameException('Your first car comes from the Classifieds. Start with a D Class used car and work your way up.');
            }
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
            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'buy_first_car') {
                self::completeTutorialStep($player, 'buy_first_car', 'visit_garage');
            }
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
        $catalog = self::partsCatalog();
        $spec = self::findBy($catalog, 'catalogId', $catalogId);
        if (!$spec) {
            throw new GameException('That part does not exist.', 404);
        }

        return self::mutatePlayer(function (array $player) use ($spec, $catalog): array {
            $car = self::selectedCar($player);
            if (!$car) {
                throw new GameException('Select a car before buying build parts.');
            }
            self::requirePartCompatible($player, $car, $spec, $catalog, true);
            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'buy_first_upgrade' && (string)$spec['catalogId'] !== 's1_intake_1') {
                throw new GameException('For the tutorial, start with the Stage 1 Intake.');
            }
            $price = (int)$spec['price'];
            self::requireCredits($player, $price);
            $player['wallet']['credits'] -= $price;
            $player['inventory']['parts'][] = [
                'inventoryId' => self::id('part'),
                'catalogId' => (string)$spec['catalogId'],
                'purchasedForCarId' => (string)$car['carId'],
                'installedOnCarId' => null,
                'purchasedAt' => time(),
            ];
            $player['stats']['partsPurchased'] = (int)$player['stats']['partsPurchased'] + 1;
            self::addTransaction($player, 'part_purchase', -$price, (string)$spec['name']);
            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'buy_first_upgrade') {
                self::completeTutorialStep($player, 'buy_first_upgrade', 'install_first_upgrade');
            }
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
            $car = $player['garage'][$carIndex];
            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'install_first_upgrade' && (string)$spec['catalogId'] !== 's1_intake_1') {
                throw new GameException('Install the Stage 1 Intake to continue the tutorial.');
            }
            self::requirePartCompatible($player, $car, $spec, $catalog, false);

            $slot = (string)$spec['slot'];
            if ((int)($car['buildStage'] ?? 1) === 1 && (int)($spec['simpleTier'] ?? 0) > 0) {
                $currentTier = self::installedSimpleTier($player, $carId, (string)($spec['categoryKey'] ?? $slot), $catalog);
                if ((int)$spec['simpleTier'] < $currentTier) {
                    throw new GameException('Street Car upgrades cannot be downgraded.');
                }
            }

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
            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'install_first_upgrade') {
                self::completeTutorialStep($player, 'install_first_upgrade', 'first_race');
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
            $spec = self::findBy($catalog, 'catalogId', (string)($player['inventory']['parts'][$partIndex]['catalogId'] ?? ''));
            if ($carId && !empty($spec['simpleTier'])) {
                $car = self::requireOwnedCar($player, (string)$carId);
                if ((int)($car['buildStage'] ?? 1) === 1) {
                    throw new GameException('Street Car upgrades are permanent progression and cannot be downgraded.');
                }
            }
            $player['inventory']['parts'][$partIndex]['installedOnCarId'] = null;
            if ($carId) {
                $carIndex = self::requireOwnedCarIndex($player, (string)$carId);
                $player['garage'][$carIndex] = self::recalculateCar($player['garage'][$carIndex], $player['inventory']['parts'], $catalog);
            }
            return $player;
        });
    }

    public static function stageUp(string $carId): array
    {
        $catalog = self::partsCatalog();
        $stageConfig = JsonStore::read(FR_DATA . '/config/build-stages.json', []);
        $required = $stageConfig['stages'][0]['requiredCategories'] ?? ['intake','exhaust','ecu','fuel','drivetrain','suspension','tires','weight'];

        return self::mutatePlayer(function (array $player) use ($carId, $catalog, $required): array {
            $index = self::requireOwnedCarIndex($player, $carId);
            $car = $player['garage'][$index];
            if ((int)($car['buildStage'] ?? 1) !== 1) {
                throw new GameException('Only Street Car to Street Race Car conversion is enabled in this build.');
            }
            foreach ($required as $category) {
                if (self::installedSimpleTier($player, $carId, (string)$category, $catalog) < 3) {
                    throw new GameException('Max every Street Car upgrade category before converting to a Street Race Car.');
                }
            }
            $car['stageBaseline'] = $car['derived'];
            $car['buildStage'] = 2;
            foreach ($player['inventory']['parts'] as &$ownedPart) {
                if (($ownedPart['installedOnCarId'] ?? null) !== $carId) {
                    continue;
                }
                $partSpec = self::findBy($catalog, 'catalogId', (string)($ownedPart['catalogId'] ?? ''));
                if (!empty($partSpec['simpleTier'])) {
                    $ownedPart['installedOnCarId'] = null;
                }
            }
            unset($ownedPart);
            $player['garage'][$index] = self::recalculateCar($car, $player['inventory']['parts'], $catalog);
            self::addTransaction($player, 'stage_conversion', 0, self::carName($car) . ' converted to Street Race Car');
            return $player;
        });
    }

    public static function tutorialAdvance(string $action): array
    {
        return self::mutatePlayer(function (array $player) use ($action): array {
            $step = (string)($player['tutorial']['step'] ?? '');
            if ($action === 'welcome_complete' && $step === 'welcome') {
                self::completeTutorialStep($player, 'welcome', count($player['garage']) ? 'visit_garage' : 'buy_first_car');
            } elseif ($action === 'garage_explained' && $step === 'visit_garage') {
                self::completeTutorialStep($player, 'visit_garage', 'buy_first_upgrade');
            } elseif ($action === 'build_stages_explained' && $step === 'build_stages') {
                self::completeTutorialStep($player, 'build_stages', 'first_race');
            }
            return $player;
        });
    }

    public static function tutorialReset(): array
    {
        return self::mutatePlayer(function (array $player): array {
            $player['tutorial'] = [
                'version' => (int)app_config()['tutorial_version'],
                'status' => 'active',
                'step' => 'welcome',
                'completedSteps' => [],
            ];
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

    public static function startQuickRace(string $distance = '1/4', ?int $timestampMs = null): array
    {
        $activeRace = null;
        $racingConfig = self::racingConfig();
        $simulator = new RaceSimulator($racingConfig);
        $distanceConfig = $simulator->distance($distance);
        $timestampMs ??= (int)floor(microtime(true) * 1000);

        $player = self::mutatePlayer(function (array $player) use (&$activeRace, $distance, $distanceConfig, $racingConfig, $simulator, $timestampMs): array {
            if (is_array($player['activeRace'] ?? null)) {
                $activeRace = $player['activeRace'];
                return $player;
            }

            $carIndex = self::requireOwnedCarIndex($player, (string)($player['selectedCarId'] ?? ''));
            $car = $player['garage'][$carIndex];
            $level = max(1, (int)($player['progression']['level'] ?? 1));
            $weather = $simulator->randomWeather();
            $location = $simulator->randomLocation();

            $hp = max(1.0, (float)($car['derived']['hp'] ?? 1));
            $torque = max(1.0, (float)($car['derived']['torque'] ?? 1));
            $weight = max(500.0, (float)($car['derived']['weight'] ?? 500));
            $grip = max(0.5, (float)($car['derived']['grip'] ?? 1));
            $pwr = $hp / $weight;
            $difficulty = self::randomFloat(0.94, 1.08);
            $opponentWeight = max(1200, (int)round($weight * self::randomFloat(0.90, 1.10)));
            $opponentHp = max(55, (int)round($pwr * $difficulty * $opponentWeight));
            $opponentTorque = max(50, (int)round($torque * $difficulty * self::randomFloat(0.93, 1.07)));
            $opponentGrip = max(0.65, min(1.45, $grip + self::randomFloat(-0.06, 0.06)));
            $opponentLevel = max(1, $level + mt_rand(-3, 3));

            $playerRun = $simulator->simulate(['hp' => $hp, 'torque' => $torque, 'weight' => $weight, 'grip' => $grip, 'level' => $level], $distance, $weather);
            $opponentRun = $simulator->simulate([
                'hp' => $opponentHp, 'torque' => $opponentTorque, 'weight' => $opponentWeight, 'grip' => $opponentGrip, 'level' => $opponentLevel,
            ], $distance, $weather);

            $won = (float)$playerRun['totalTime'] < (float)$opponentRun['totalTime'];
            $creditMultiplier = (float)($distanceConfig['creditMultiplier'] ?? 1);
            $reward = $won
                ? (int)round(mt_rand(450, 850) * $creditMultiplier)
                : (int)round(mt_rand(90, 220) * $creditMultiplier);
            $expReward = self::raceExpReward($level, $opponentLevel, $won);
            $repReward = $won ? 5 : 2;
            $opponentVisual = self::opponentRaceVisual($opponentHp / max(1, $opponentWeight));
            $timeScale = self::raceTimeScale($racingConfig);
            $stagingMs = max(1800.0, (float)($racingConfig['presentation']['stagingMs'] ?? 2800)) * $timeScale;
            $greenAt = $timestampMs + $stagingMs;
            $playerFinishSeconds = max(0.1, (float)($playerRun['reactionTime'] ?? 0) + (float)($playerRun['elapsedTime'] ?? 0));
            $opponentFinishSeconds = max(0.1, (float)($opponentRun['reactionTime'] ?? 0) + (float)($opponentRun['elapsedTime'] ?? 0));
            $finishAt = $greenAt + (max($playerFinishSeconds, $opponentFinishSeconds) * 1000 * $timeScale);

            $race = [
                'raceId' => self::id('race'),
                'won' => $won,
                'distance' => $distance,
                'distanceLabel' => (string)($distanceConfig['label'] ?? $distance),
                'location' => $location,
                'weather' => $weather,
                'margin' => round(abs((float)$playerRun['totalTime'] - (float)$opponentRun['totalTime']), 3),
                'reward' => $reward,
                'expReward' => $expReward,
                'repReward' => $repReward,
                'newBest' => false,
                'playerCarId' => (string)$car['carId'],
                'carName' => self::carName($car),
                'playerVisualSrc' => self::raceVisualSrc($car),
                'player' => $playerRun,
                'opponent' => [
                    'name' => self::opponentName(),
                    'carName' => $opponentVisual['name'],
                    'visualSrc' => $opponentVisual['src'],
                    'hp' => $opponentHp,
                    'torque' => $opponentTorque,
                    'weight' => $opponentWeight,
                    'grip' => round($opponentGrip, 3),
                    'level' => $opponentLevel,
                ] + $opponentRun,
                'reaction' => (float)$playerRun['reactionTime'],
                'playerEt' => (float)$playerRun['elapsedTime'],
                'opponentEt' => (float)$opponentRun['elapsedTime'],
            ];

            $activeRace = [
                'raceId' => $race['raceId'],
                'status' => 'running',
                'startedAt' => $timestampMs,
                'greenAt' => $greenAt,
                'finishAt' => $finishAt,
                'timeScale' => $timeScale,
                'revealDelayMs' => max(0, (int)($racingConfig['presentation']['revealDelayMs'] ?? 650)),
                'progressExponent' => max(1.0, (float)($racingConfig['presentation']['progressExponent'] ?? 1.38)),
                'distance' => $distance,
                'race' => $race,
            ];
            $player['activeRace'] = $activeRace;
            return $player;
        });

        return ['player' => $player, 'activeRace' => $activeRace];
    }

    public static function finishQuickRace(string $raceId, ?int $timestampMs = null): array
    {
        $result = null;
        $racingConfig = self::racingConfig();
        $timestampMs ??= (int)floor(microtime(true) * 1000);

        $player = self::mutatePlayer(function (array $player) use (&$result, $raceId, $racingConfig, $timestampMs): array {
            $active = is_array($player['activeRace'] ?? null) ? $player['activeRace'] : null;
            if (!$active) {
                $history = array_reverse(array_values(is_array($player['raceHistory'] ?? null) ? $player['raceHistory'] : []));
                foreach ($history as $row) {
                    if ((string)($row['raceId'] ?? '') === $raceId) {
                        $result = $row;
                        return $player;
                    }
                }
                throw new GameException('No race is currently in progress.', 409);
            }

            if ((string)($active['raceId'] ?? '') !== $raceId) {
                throw new GameException('That race is no longer active.', 409);
            }
            if ($timestampMs < (int)round((float)($active['finishAt'] ?? 0))) {
                throw new GameException('The race is still in progress.', 409);
            }

            $result = is_array($active['race'] ?? null) ? $active['race'] : [];
            $carIndex = self::requireOwnedCarIndex($player, (string)($result['playerCarId'] ?? ''));
            $car = $player['garage'][$carIndex];
            $distance = (string)($result['distance'] ?? '1/4');
            $playerRun = is_array($result['player'] ?? null) ? $result['player'] : [];
            $won = !empty($result['won']);
            $reward = (int)($result['reward'] ?? 0);
            $expReward = (int)($result['expReward'] ?? 0);
            $repReward = (int)($result['repReward'] ?? 0);

            $player['wallet']['credits'] += $reward;
            $player['progression']['exp'] = (int)($player['progression']['exp'] ?? 0) + $expReward;
            $player['progression']['rep'] = (int)($player['progression']['rep'] ?? 0) + $repReward;
            $player['progression']['level'] = self::levelFromExp((int)$player['progression']['exp']);
            $player['stats']['races'] = (int)($player['stats']['races'] ?? 0) + 1;
            $player['stats'][$won ? 'wins' : 'losses'] = (int)($player['stats'][$won ? 'wins' : 'losses'] ?? 0) + 1;

            if (empty($playerRun['foul']) && (($player['stats']['bestReaction'] ?? null) === null || (float)($playerRun['reactionTime'] ?? 999) < (float)$player['stats']['bestReaction'])) {
                $player['stats']['bestReaction'] = (float)$playerRun['reactionTime'];
            }

            $records = is_array($car['raceRecords'] ?? null) ? $car['raceRecords'] : self::emptyRaceRecords();
            $record = is_array($records[$distance] ?? null) ? $records[$distance] : ['races' => 0, 'bestEt' => null, 'bestTrap' => null];
            $record['races'] = (int)($record['races'] ?? 0) + 1;
            $newBest = false;
            if (empty($playerRun['foul']) && (($record['bestEt'] ?? null) === null || (float)$playerRun['elapsedTime'] < (float)$record['bestEt'])) {
                $record['bestEt'] = (float)$playerRun['elapsedTime'];
                $newBest = true;
            }
            if (($record['bestTrap'] ?? null) === null || (float)$playerRun['trapSpeed'] > (float)$record['bestTrap']) {
                $record['bestTrap'] = (float)$playerRun['trapSpeed'];
            }
            $records[$distance] = $record;
            $player['garage'][$carIndex]['raceRecords'] = $records;
            $result['newBest'] = $newBest;

            self::addTransaction($player, 'race_reward', $reward, (string)($result['distanceLabel'] ?? $distance) . ($won ? ' win' : ' participation'));

            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'first_race') {
                $tutorialCredits = (int)app_config()['tutorial_completion_credits'];
                $tutorialRep = (int)app_config()['tutorial_completion_rep'];
                $player['wallet']['credits'] += $tutorialCredits;
                $player['progression']['rep'] += $tutorialRep;
                self::addTransaction($player, 'tutorial_reward', $tutorialCredits, 'FTUE completion reward');
                self::completeTutorialStep($player, 'first_race', null);
                $player['tutorial']['status'] = 'complete';
                $player['tutorial']['step'] = 'complete';
            }

            $result['completedAt'] = time();
            $player['raceHistory'][] = $result;
            $historyLimit = max(5, (int)($racingConfig['historyLimit'] ?? 25));
            if (count($player['raceHistory']) > $historyLimit) {
                $player['raceHistory'] = array_slice($player['raceHistory'], -$historyLimit);
            }
            $player['activeRace'] = null;
            return $player;
        });

        return ['player' => $player, 'race' => $result];
    }

    public static function quickRace(string $distance = '1/4'): array
    {
        return self::startQuickRace($distance);
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

    private static function normalizeCar(array $car): array
    {
        $spec = self::findBy(self::carCatalog(), 'stockId', (int)($car['stockId'] ?? 0));
        $car['buildStage'] = max(1, (int)($car['buildStage'] ?? 1));
        $car['stageBaseline'] = is_array($car['stageBaseline'] ?? null) ? $car['stageBaseline'] : null;
        $car['factoryEngineId'] = $car['factoryEngineId'] ?? ($spec['factoryEngineId'] ?? null);
        $car['engineId'] = $car['engineId'] ?? $car['factoryEngineId'];
        $car['engineBay'] = $car['engineBay'] ?? ($spec['engineBay'] ?? null);
        $catalogVisual = is_array($spec['visual'] ?? null) ? $spec['visual'] : ['profile' => 'sedan', 'color' => '#78838d'];
        $savedVisual = is_array($car['visual'] ?? null) ? $car['visual'] : [];
        $car['visual'] = array_replace($catalogVisual, $savedVisual);
        $car['visual']['sprites'] = array_replace(
            is_array($catalogVisual['sprites'] ?? null) ? $catalogVisual['sprites'] : [],
            is_array($savedVisual['sprites'] ?? null) ? $savedVisual['sprites'] : []
        );
        $car['raceRecords'] = array_replace(self::emptyRaceRecords(), is_array($car['raceRecords'] ?? null) ? $car['raceRecords'] : []);
        return $car;
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
            'buildStage' => 1,
            'stageBaseline' => null,
            'factoryEngineId' => $spec['factoryEngineId'] ?? null,
            'engineId' => $spec['factoryEngineId'] ?? null,
            'engineBay' => $spec['engineBay'] ?? null,
            'visual' => $spec['visual'] ?? ['profile' => 'sedan', 'color' => '#78838d'],
            'base' => [
                'hp' => (int)$base['hp'], 'torque' => (int)$base['torque'], 'weight' => (int)$base['weight'],
                'grip' => (float)($base['grip'] ?? 1.0), 'drivetrain' => (string)($base['drivetrain'] ?? 'FWD'),
            ],
            'derived' => [
                'hp' => (int)$base['hp'], 'torque' => (int)$base['torque'], 'weight' => (int)$base['weight'], 'grip' => (float)($base['grip'] ?? 1.0),
            ],
            'raceRecords' => self::emptyRaceRecords(),
            'createdAt' => time(),
        ];
    }

    private static function recalculateCar(array $car, array $inventory, array $catalog): array
    {
        $car = self::normalizeCar($car);
        $seed = (int)($car['buildStage'] ?? 1) >= 2 && is_array($car['stageBaseline'] ?? null) ? $car['stageBaseline'] : $car['base'];
        $derived = [
            'hp' => (float)$seed['hp'],
            'torque' => (float)$seed['torque'],
            'weight' => (float)$seed['weight'],
            'grip' => (float)($seed['grip'] ?? 1.0),
        ];
        $installedParts = [];

        foreach ($inventory as $instance) {
            if (($instance['installedOnCarId'] ?? null) !== ($car['carId'] ?? null)) {
                continue;
            }
            $spec = self::findBy($catalog, 'catalogId', (string)($instance['catalogId'] ?? ''));
            if (!$spec) {
                continue;
            }
            $installedParts[] = $instance['inventoryId'] ?? '';
            foreach (($spec['effects'] ?? []) as $effect) {
                $stat = (string)($effect['stat'] ?? '');
                if (!array_key_exists($stat, $derived)) {
                    continue;
                }
                $value = (float)($effect['value'] ?? 0);
                if ((string)($effect['op'] ?? 'add') === 'mul') {
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
        $car['installedParts'] = array_values(array_filter($installedParts));
        return $car;
    }

    private static function installedSimpleTier(array $player, string $carId, string $categoryKey, array $catalog): int
    {
        $tier = 0;
        foreach (($player['inventory']['parts'] ?? []) as $instance) {
            if ((string)($instance['installedOnCarId'] ?? '') !== $carId) {
                continue;
            }
            $spec = self::findBy($catalog, 'catalogId', (string)($instance['catalogId'] ?? ''));
            if ($spec && (string)($spec['categoryKey'] ?? '') === $categoryKey) {
                $tier = max($tier, (int)($spec['simpleTier'] ?? 0));
            }
        }
        return $tier;
    }

    private static function requirePartCompatible(array $player, array $car, array $spec, array $catalog, bool $purchasing): void
    {
        $stage = (int)($car['buildStage'] ?? 1);
        if ($stage === 1) {
            if ((int)($spec['buildStage'] ?? 1) !== 1 || (int)($spec['simpleTier'] ?? 0) <= 0) {
                throw new GameException('Street Cars use the simple three-level upgrade path.');
            }
            $currentTier = self::installedSimpleTier($player, (string)$car['carId'], (string)($spec['categoryKey'] ?? $spec['slot'] ?? ''), $catalog);
            if ($purchasing && (int)$spec['simpleTier'] !== $currentTier + 1) {
                throw new GameException('Complete the previous ' . (string)$spec['category'] . ' upgrade first.');
            }
            if (!$purchasing && (int)$spec['simpleTier'] < $currentTier) {
                throw new GameException('Street Car upgrades cannot be downgraded.');
            }
            return;
        }
        if (!empty($spec['simpleTier'])) {
            throw new GameException('Street Car ladder parts are incorporated when the car converts to a Street Race Car.');
        }
        if ((int)($spec['buildStage'] ?? 2) > $stage) {
            throw new GameException('This part requires a later Build Type.');
        }
        if ((int)($spec['persistentFromStage'] ?? $spec['buildStage'] ?? 2) > $stage) {
            throw new GameException('This part is not available for the current Build Type.');
        }
    }

    private static function completeTutorialStep(array &$player, string $completed, ?string $next): void
    {
        $completedSteps = is_array($player['tutorial']['completedSteps'] ?? null) ? $player['tutorial']['completedSteps'] : [];
        if (!in_array($completed, $completedSteps, true)) {
            $completedSteps[] = $completed;
        }
        $player['tutorial']['completedSteps'] = $completedSteps;
        if ($next !== null) {
            $player['tutorial']['step'] = $next;
        }
    }

    private static function generateUsedLot(int $now, int $refresh): array
    {
        $catalog = self::carCatalog();
        $currentYear = (int)date('Y');
        $candidates = array_values(array_filter(
            $catalog,
            fn(array $spec): bool => (int)($spec['year'] ?? 0) <= $currentYear - 3
        ));
        if (!$candidates) {
            $candidates = $catalog;
        }
        if (!$candidates) {
            return ['generatedAt' => $now, 'expiresAt' => $now + $refresh, 'listings' => []];
        }

        $listings = [];
        $count = min(8, max(4, count($candidates)));
        for ($i = 0; $i < $count; $i++) {
            $spec = $candidates[array_rand($candidates)];
            $mileage = mt_rand(2800, 195000);
            $condition = mt_rand(58, 98);
            $mileageFactor = max(0.46, 1.0 - ($mileage / 330000));
            $conditionFactor = 0.42 + (0.58 * pow($condition / 100.0, 1.7));
            $price = (int)round(((int)$spec['price']) * $mileageFactor * $conditionFactor / 50) * 50;
            $price = max(1200, $price);
            $listings[] = [
                'listingId' => self::id('used'),
                'stockId' => (int)$spec['stockId'],
                'price' => $price,
                'mileage' => $mileage,
                'condition' => $condition,
                'basePrice' => (int)$spec['price'],
                'mileageFactor' => round($mileageFactor, 3),
                'conditionFactor' => round($conditionFactor, 3),
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

    private static function expToReachLevel(int $level): int
    {
        return (int)floor(100 * pow(max(1, $level), 1.75));
    }

    private static function levelFromExp(int $exp): int
    {
        $level = 1;
        $exp = max(0, $exp);
        while ($level < 200 && $exp >= self::expToReachLevel($level + 1)) {
            $level++;
        }
        return $level;
    }

    private static function raceExpReward(int $playerLevel, int $opponentLevel, bool $won): int
    {
        $base = $won ? mt_rand(25, 74) : mt_rand(9, 19);
        $difference = $opponentLevel - $playerLevel;
        if ($won && $difference > 0) {
            $base = (int)round($base * (1.0 + min(0.5, $difference * 0.02)));
        } elseif ($won && $difference < 0) {
            $base = (int)round($base * max(0.5, 1.0 + ($difference * 0.015)));
        }
        return max(1, $base);
    }

    private static function emptyRaceRecords(): array
    {
        return [
            '1/4' => ['races' => 0, 'bestEt' => null, 'bestTrap' => null],
            '1/2' => ['races' => 0, 'bestEt' => null, 'bestTrap' => null],
            '1' => ['races' => 0, 'bestEt' => null, 'bestTrap' => null],
        ];
    }

    private static function randomFloat(float $min, float $max): float
    {
        return $min + ((mt_rand() / mt_getrandmax()) * ($max - $min));
    }

    private static function raceVisualSrc(array $car): string
    {
        $sprites = is_array($car['visual']['sprites'] ?? null) ? $car['visual']['sprites'] : [];
        return trim((string)($sprites['racePreview']['src'] ?? $sprites['topDown']['src'] ?? ''));
    }

    private static function opponentRaceVisual(float $targetRating): array
    {
        $candidates = [];
        foreach (self::carCatalog() as $spec) {
            $sprites = is_array($spec['visual']['sprites'] ?? null) ? $spec['visual']['sprites'] : [];
            $src = trim((string)($sprites['racePreview']['src'] ?? $sprites['topDown']['src'] ?? ''));
            $hp = (float)($spec['base']['hp'] ?? 0);
            $weight = max(1.0, (float)($spec['base']['weight'] ?? 0));
            if ($src === '' || $hp <= 0 || $weight <= 1) continue;
            $candidates[] = [
                'src' => $src,
                'name' => trim((string)($spec['displayName'] ?? implode(' ', array_filter([$spec['year'] ?? null, $spec['make'] ?? null, $spec['model'] ?? null])))) ?: 'Opponent',
                'delta' => abs(($hp / $weight) - $targetRating),
            ];
        }
        usort($candidates, fn(array $a, array $b): int => $a['delta'] <=> $b['delta']);
        if (!$candidates) return ['src' => '', 'name' => 'Opponent'];
        return ['src' => (string)$candidates[0]['src'], 'name' => (string)$candidates[0]['name']];
    }

    private static function raceTimeScale(array $racingConfig): float
    {
        $env = getenv('FR_RACE_TIME_SCALE');
        if ($env !== false && is_numeric($env) && (float)$env > 0) {
            return max(0.01, (float)$env);
        }
        return max(0.01, (float)($racingConfig['presentation']['timeScale'] ?? 1.0));
    }

    private static function opponentName(): string
    {
        $names = ['Night Shift', 'Redline', 'The Commuter', 'Left Lane', 'Cut Light', 'Sleeper', 'Boost Leak', 'Test Mule'];
        return $names[array_rand($names)];
    }
}
