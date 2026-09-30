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
            'progression' => ['level' => 1, 'exp' => 0, 'rep' => 0, 'unlockedClasses' => ['D']],
            'tutorial' => [
                'version' => (int)$config['tutorial_version'],
                'status' => 'active',
                'step' => 'welcome',
                'completedSteps' => [],
            ],
            'stats' => [
                'races' => 0, 'wins' => 0, 'losses' => 0, 'bestReaction' => null,
                'showroomPurchases' => 0, 'usedPurchases' => 0, 'partsPurchased' => 0,
                'enginesPurchased' => 0, 'engineSwaps' => 0,
            ],
            'selectedCarId' => null,
            'garage' => [],
            'inventory' => ['parts' => [], 'engines' => []],
            'circuits' => ['activeRun' => null, 'progress' => []],
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
        $previousSchemaVersion = (int)($player['schemaVersion'] ?? 0);
        $currentSchemaVersion = (int)app_config()['schema_version'];
        $player['schemaVersion'] = $currentSchemaVersion;
        $player['user'] = array_replace($default['user'], is_array($player['user'] ?? null) ? $player['user'] : []);
        $player['wallet'] = array_replace($default['wallet'], is_array($player['wallet'] ?? null) ? $player['wallet'] : []);
        if (strcasecmp((string)($player['user']['username'] ?? ''), (string)(app_config()['admin_username'] ?? 'Admin')) === 0) {
            $player['wallet']['credits'] = max((int)($player['wallet']['credits'] ?? 0), (int)(app_config()['local_dev_credits'] ?? 10000000));
        }
        $player['progression'] = array_replace($default['progression'], is_array($player['progression'] ?? null) ? $player['progression'] : []);
        $classes = array_values(array_unique(array_filter(array_map(
            fn($value): string => strtoupper(trim((string)$value)),
            is_array($player['progression']['unlockedClasses'] ?? null) ? $player['progression']['unlockedClasses'] : ['D']
        ))));
        if (!in_array('D', $classes, true)) array_unshift($classes, 'D');
        $player['progression']['unlockedClasses'] = $classes;
        $player['tutorial'] = array_replace($default['tutorial'], is_array($player['tutorial'] ?? null) ? $player['tutorial'] : []);
        $player['tutorial']['completedSteps'] = array_values(is_array($player['tutorial']['completedSteps'] ?? null) ? $player['tutorial']['completedSteps'] : []);
        if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'build_stages') {
            $player['tutorial']['step'] = 'first_race';
        }
        $player['stats'] = array_replace($default['stats'], is_array($player['stats'] ?? null) ? $player['stats'] : []);
        $garage = array_values(is_array($player['garage'] ?? null) ? $player['garage'] : []);
        $player['garage'] = array_map(fn(array $car): array => self::normalizeCar($car), $garage);
        $player['inventory'] = is_array($player['inventory'] ?? null) ? $player['inventory'] : $default['inventory'];
        $partInventory = array_values(is_array($player['inventory']['parts'] ?? null) ? $player['inventory']['parts'] : []);
        $player['inventory']['parts'] = array_values(array_filter(array_map(function ($item): array {
            $item = is_array($item) ? $item : [];
            $item['inventoryId'] = (string)($item['inventoryId'] ?? self::id('part'));
            $item['catalogId'] = (string)($item['catalogId'] ?? '');
            $item['installedOnCarId'] = !empty($item['installedOnCarId']) ? (string)$item['installedOnCarId'] : null;
            $item['installedOnEngineInventoryId'] = !empty($item['installedOnEngineInventoryId']) ? (string)$item['installedOnEngineInventoryId'] : null;
            return $item;
        }, $partInventory), fn(array $item): bool => $item['catalogId'] !== ''));

        $engineInventory = array_values(is_array($player['inventory']['engines'] ?? null) ? $player['inventory']['engines'] : []);
        $player['inventory']['engines'] = array_values(array_filter(array_map(function ($item): array {
            $normalized = EngineSwap::normalizeAssembly(is_array($item) ? $item : []);
            if ($normalized['inventoryId'] === '') $normalized['inventoryId'] = self::id('engine');
            if ((int)$normalized['acquiredAt'] <= 0) $normalized['acquiredAt'] = time();
            return $normalized;
        }, $engineInventory), fn(array $item): bool => $item['engineId'] !== ''));

        $partsCatalog = self::partsCatalog();
        foreach (array_keys($player['inventory']['engines']) as $assemblyIndex) {
            self::sanitizeEngineAssemblyParts($player, (int)$assemblyIndex, $partsCatalog);
        }

        if ($previousSchemaVersion > 0 && $previousSchemaVersion < 11) {
            foreach ($player['garage'] as $car) {
                $previousEngineId = (string)($car['engineSwap']['lastFromEngineId'] ?? '');
                $previousNames = array_values(array_map('strval', is_array($car['engineSwap']['lastUninstalledParts'] ?? null) ? $car['engineSwap']['lastUninstalledParts'] : []));
                if ($previousEngineId === '' || !$previousNames) continue;
                $storedIndex = null;
                foreach ($player['inventory']['engines'] as $idx => $storedEngine) {
                    if (!empty($storedEngine['installedOnCarId'])) continue;
                    if ((string)$storedEngine['engineId'] !== $previousEngineId) continue;
                    if (!empty($storedEngine['attachedPartInventoryIds'])) continue;
                    $storedIndex = $idx;
                    break;
                }
                if ($storedIndex === null) continue;
                $attached = [];
                foreach ($player['inventory']['parts'] as &$part) {
                    if (!empty($part['installedOnCarId']) || !empty($part['installedOnEngineInventoryId'])) continue;
                    if ((string)($part['purchasedForCarId'] ?? '') !== (string)($car['carId'] ?? '')) continue;
                    $spec = self::findBy(self::partsCatalog(), 'catalogId', (string)($part['catalogId'] ?? ''));
                    if (!$spec || !EngineSwap::isEngineBoundPart($spec)) continue;
                    $name = (string)($spec['name'] ?? $spec['catalogId'] ?? '');
                    if (!in_array($name, $previousNames, true)) continue;
                    $part['installedOnEngineInventoryId'] = $player['inventory']['engines'][$storedIndex]['inventoryId'];
                    $attached[] = (string)$part['inventoryId'];
                }
                unset($part);
                $player['inventory']['engines'][$storedIndex]['attachedPartInventoryIds'] = array_values(array_unique(array_merge(
                    $player['inventory']['engines'][$storedIndex]['attachedPartInventoryIds'] ?? [],
                    $attached
                )));
            }
        }

        foreach ($player['garage'] as &$car) {
            $assemblyIndex = null;
            foreach ($player['inventory']['engines'] as $idx => $assembly) {
                if ((string)($assembly['inventoryId'] ?? '') === (string)($car['engineInventoryId'] ?? '')
                    || (string)($assembly['installedOnCarId'] ?? '') === (string)($car['carId'] ?? '')) {
                    $assemblyIndex = $idx;
                    break;
                }
            }
            if ($assemblyIndex === null) {
                $assembly = EngineSwap::normalizeAssembly([
                    'inventoryId'=>self::id('engine'),
                    'engineId'=>(string)($car['engineId'] ?? $car['factoryEngineId'] ?? ''),
                    'installedOnCarId'=>(string)($car['carId'] ?? ''),
                    'acquiredAt'=>(int)($car['createdAt'] ?? time()),
                    'source'=>'installed_migration',
                    'condition'=>$car['engineCondition'] ?? [],
                    'tune'=>$car['tune'] ?? null,
                    'storedStats'=>$car['derived'] ?? $car['base'] ?? null,
                ]);
                $player['inventory']['engines'][] = $assembly;
                $assemblyIndex = count($player['inventory']['engines']) - 1;
            }
            $player['inventory']['engines'][$assemblyIndex]['installedOnCarId'] = (string)($car['carId'] ?? '');
            $player['inventory']['engines'][$assemblyIndex]['engineId'] = (string)($car['engineId'] ?? $car['factoryEngineId'] ?? '');
            $player['inventory']['engines'][$assemblyIndex]['condition'] = EngineSwap::storedCondition(is_array($car['engineCondition'] ?? null) ? $car['engineCondition'] : []);
            $player['inventory']['engines'][$assemblyIndex]['tune'] = is_array($car['tune'] ?? null) ? $car['tune'] : ($player['inventory']['engines'][$assemblyIndex]['tune'] ?? null);
            $car['engineInventoryId'] = $player['inventory']['engines'][$assemblyIndex]['inventoryId'];

            $attached = $player['inventory']['engines'][$assemblyIndex]['attachedPartInventoryIds'] ?? [];
            foreach ($player['inventory']['parts'] as &$part) {
                if ((string)($part['installedOnCarId'] ?? '') !== (string)($car['carId'] ?? '')) continue;
                $spec = self::findBy(self::partsCatalog(), 'catalogId', (string)($part['catalogId'] ?? ''));
                if (!$spec || !EngineSwap::isEngineBoundPart($spec)) continue;
                $part['installedOnEngineInventoryId'] = $player['inventory']['engines'][$assemblyIndex]['inventoryId'];
                $attached[] = (string)$part['inventoryId'];
            }
            unset($part);
            $player['inventory']['engines'][$assemblyIndex]['attachedPartInventoryIds'] = array_values(array_unique($attached));
            self::activateEngineAssemblyParts($player, $car);
        }
        unset($car);

        $needsPowerMigration = $previousSchemaVersion < $currentSchemaVersion;
        if (!$needsPowerMigration) {
            foreach ($player['garage'] as $savedCar) {
                if (!is_array($savedCar['powerEnvelope'] ?? null)) {
                    $needsPowerMigration = true;
                    break;
                }
            }
        }
        if ($needsPowerMigration && count($player['garage'])) {
            $catalog = self::partsCatalog();
            $player['garage'] = array_map(
                fn(array $savedCar): array => self::recalculateCar($savedCar, $player['inventory']['parts'], $catalog),
                $player['garage']
            );
        }
        foreach ($player['garage'] as $car) {
            $assemblyIndex = self::engineAssemblyIndexForCar($player, $car);
            if ($assemblyIndex === null) continue;
            $player['inventory']['engines'][$assemblyIndex]['condition'] = EngineSwap::storedCondition(is_array($car['engineCondition'] ?? null) ? $car['engineCondition'] : []);
            $player['inventory']['engines'][$assemblyIndex]['tune'] = is_array($car['tune'] ?? null) ? $car['tune'] : ($player['inventory']['engines'][$assemblyIndex]['tune'] ?? null);
            $player['inventory']['engines'][$assemblyIndex]['storedStats'] = [
                'hp'=>max(1,(int)round((float)($car['derived']['hp'] ?? $car['base']['hp'] ?? 1))),
                'torque'=>max(1,(int)round((float)($car['derived']['torque'] ?? $car['base']['torque'] ?? 1))),
            ];
        }
        $player['circuits'] = array_replace($default['circuits'], is_array($player['circuits'] ?? null) ? $player['circuits'] : []);
        $player['circuits']['activeRun'] = is_array($player['circuits']['activeRun'] ?? null) ? $player['circuits']['activeRun'] : null;
        $player['circuits']['progress'] = is_array($player['circuits']['progress'] ?? null) ? $player['circuits']['progress'] : [];
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

    public static function engineCatalog(): array
    {
        $data = JsonStore::read(FR_DATA . '/catalog/engines.json', []);
        return is_array($data) ? array_values($data) : [];
    }

    public static function partsCatalog(): array
    {
        $data = JsonStore::read(FR_DATA . '/catalog/parts.json', []);
        return is_array($data) ? array_values($data) : [];
    }

    public static function circuitCatalog(): array
    {
        $data = JsonStore::read(FR_DATA . '/catalog/circuits.json', []);
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
                throw new GameException('Your first car comes from the Classifieds. Pick one of the starter cars and work your way up.');
            }
            if (($player['tutorial']['status'] ?? '') !== 'active' && (int)($player['progression']['level'] ?? 1) < 5) {
                throw new GameException('The Showroom unlocks at Level 5. Keep building through Classifieds first.');
            }
            if (($spec['market']['showroom'] ?? false) !== true || !self::isContentReleased($spec)) {
                throw new GameException('That showroom car is not currently released.', 404);
            }
            $price = (int)$spec['price'];
            self::requireCredits($player, $price);
            $player['wallet']['credits'] -= $price;
            $car = self::createOwnedCar($spec, 'new', 0, 100, $price, self::firstPaintColor($spec));
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

    public static function saveTune(string $carId, array $rawTune): array
    {
        $catalog = self::partsCatalog();
        return self::mutatePlayer(function (array $player) use ($carId, $rawTune, $catalog): array {
            $index = self::requireOwnedCarIndex($player, $carId);
            $car = $player['garage'][$index];
            $specs = self::installedPartSpecs($player, $carId, $catalog);
            $hardware = Tuning::hardwareProfile($car, $specs);
            if (empty($hardware['unlocked'])) {
                throw new GameException('Install a Standalone ECU + Laptop before tuning this car.');
            }
            $tune = Tuning::normalizeProfile($rawTune, $car, $hardware);
            $tune['savedAt'] = time();
            $car['tune'] = $tune;
            $player['garage'][$index] = self::recalculateCar($car, $player['inventory']['parts'] ?? [], $catalog);
            $assemblyIndex = self::engineAssemblyIndexForCar($player, $player['garage'][$index]);
            if ($assemblyIndex !== null) {
                $player['inventory']['engines'][$assemblyIndex]['tune'] = $player['garage'][$index]['tune'];
                $player['inventory']['engines'][$assemblyIndex]['storedStats'] = [
                    'hp'=>(int)$player['garage'][$index]['derived']['hp'],
                    'torque'=>(int)$player['garage'][$index]['derived']['torque'],
                ];
            }
            return $player;
        });
    }

    public static function repairEngine(string $carId): array
    {
        $catalog = self::partsCatalog();
        return self::mutatePlayer(function (array $player) use ($carId, $catalog): array {
            $index = self::requireOwnedCarIndex($player, $carId);
            $car = $player['garage'][$index];
            if (empty($car['engineCondition']['failed'])) {
                throw new GameException('This engine does not need a catastrophic-failure rebuild.');
            }
            $cost = self::engineRepairCost($car);
            self::requireCredits($player, $cost);
            $player['wallet']['credits'] -= $cost;
            $car['engineCondition'] = [
                'healthPct' => 100,
                'failed' => false,
                'failures' => (int)($car['engineCondition']['failures'] ?? 0),
                'lastFailureAt' => $car['engineCondition']['lastFailureAt'] ?? null,
                'repairedAt' => time(),
            ];
            $player['garage'][$index] = self::recalculateCar($car, $player['inventory']['parts'] ?? [], $catalog);
            $assemblyIndex = self::engineAssemblyIndexForCar($player, $player['garage'][$index]);
            if ($assemblyIndex !== null) {
                $player['inventory']['engines'][$assemblyIndex]['condition'] = EngineSwap::storedCondition($player['garage'][$index]['engineCondition']);
                $player['inventory']['engines'][$assemblyIndex]['storedStats'] = [
                    'hp'=>(int)$player['garage'][$index]['derived']['hp'],
                    'torque'=>(int)$player['garage'][$index]['derived']['torque'],
                ];
            }
            self::addTransaction($player, 'engine_rebuild', -$cost, self::carName($car) . ' engine rebuild');
            return $player;
        });
    }

    public static function swapEngine(string $carId, string $engineId): array
    {
        $parts=self::partsCatalog();
        $engine=self::findBy(self::engineCatalog(),'engineId',$engineId);
        if(!$engine||!EngineSwap::eligible($engine))throw new GameException('That engine is not ready for the Engine Swap Shop.',404);

        return self::mutatePlayer(function(array $player)use($carId,$engine,$parts):array{
            $carIndex=self::requireOwnedCarIndex($player,$carId);
            $car=$player['garage'][$carIndex];
            $fitment=EngineSwap::fitment($car,$engine);
            if(empty($fitment['allowed']))throw new GameException((string)($fitment['note']??'That engine does not fit this chassis.'));
            if((int)($car['buildStage']??1)<(int)($fitment['minBuildStage']??2)){
                throw new GameException('This swap requires Build Type '.(int)$fitment['minBuildStage'].'. Upgrade the chassis first.');
            }
            if((string)($car['engineId']??$car['factoryEngineId']??'')===(string)$engine['engineId']){
                throw new GameException('That engine is already installed in this car.');
            }

            $ownedIndex=null;
            foreach(($player['inventory']['engines']??[])as $idx=>$ownedEngine){
                if(!empty($ownedEngine['installedOnCarId']))continue;
                if((string)($ownedEngine['engineId']??'')===(string)$engine['engineId']){$ownedIndex=(int)$idx;break;}
            }
            $enginePrice=$ownedIndex!==null?0:EngineSwap::price($engine);
            $installCost=max(0,(int)($fitment['installCost']??0));
            $totalCost=$enginePrice+$installCost;
            self::requireCredits($player,$totalCost);

            $outgoingIndex=self::engineAssemblyIndexForCar($player,$car);
            if($outgoingIndex===null)throw new GameException('The installed engine assembly could not be resolved.',500);
            $outgoing=&$player['inventory']['engines'][$outgoingIndex];
            $outgoingEngineId=(string)($car['engineId']??$car['factoryEngineId']??'');
            $outgoing['engineId']=$outgoingEngineId;
            $outgoing['installedOnCarId']=null;
            $outgoing['condition']=EngineSwap::storedCondition(is_array($car['engineCondition']??null)?$car['engineCondition']:[]);
            $outgoing['tune']=null;
            $outgoing['storedStats']=[
                'hp'=>max(1,(int)round((float)($car['derived']['hp']??$car['base']['hp']??1))),
                'torque'=>max(1,(int)round((float)($car['derived']['torque']??$car['base']['torque']??1))),
            ];
            unset($outgoing);
            $attached=self::sanitizeEngineAssemblyParts($player,$outgoingIndex,$parts);
            $outgoing=&$player['inventory']['engines'][$outgoingIndex];
            $storedPartNames=[];
            foreach($player['inventory']['parts'] as &$ownedPart){
                if((string)($ownedPart['installedOnCarId']??'')!==$carId)continue;
                $part=self::findBy($parts,'catalogId',(string)($ownedPart['catalogId']??''));
                if(!$part||!EngineSwap::isEngineBoundPart($part))continue;
                $ownedPart['installedOnCarId']=null;
                $ownedPart['installedOnEngineInventoryId']=$outgoing['inventoryId'];
                $attached[]=(string)$ownedPart['inventoryId'];
                $storedPartNames[]=(string)($part['name']??$part['catalogId']??'Part');
            }
            unset($ownedPart);
            $outgoing['attachedPartInventoryIds']=array_values(array_unique($attached));
            unset($outgoing);

            if($ownedIndex===null){
                $player['inventory']['engines'][]=EngineSwap::normalizeAssembly([
                    'inventoryId'=>self::id('engine'),
                    'engineId'=>(string)$engine['engineId'],
                    'installedOnCarId'=>$carId,
                    'acquiredAt'=>time(),
                    'source'=>'swap_shop',
                    'condition'=>EngineSwap::healthyCondition(),
                    'attachedPartInventoryIds'=>[],
                    'tune'=>null,
                    'storedStats'=>['hp'=>(int)$engine['peakHp'],'torque'=>(int)$engine['peakTorque']],
                ]);
                $ownedIndex=count($player['inventory']['engines'])-1;
            }
            $incoming=&$player['inventory']['engines'][$ownedIndex];
            $incoming['installedOnCarId']=$carId;
            $incoming['tune']=null;

            $candidate=$car;
            $candidate['engineId']=(string)$engine['engineId'];
            $candidate['engineInventoryId']=$incoming['inventoryId'];
            $candidate['engine']=EngineSwap::snapshot($engine,is_array($car['engine']??null)?$car['engine']:[]);
            $candidate['base']['hp']=(int)$engine['peakHp'];
            $candidate['base']['torque']=(int)$engine['peakTorque'];
            if(is_array($candidate['stageBaseline']??null)){
                $candidate['stageBaseline']['hp']=(int)$engine['peakHp'];
                $candidate['stageBaseline']['torque']=(int)$engine['peakTorque'];
            }
            $candidate['tune']=null;
            $candidate['tuningRuntime']=null;
            $candidate['tuningDiagnostics']=null;
            $candidate['engineCondition']=EngineSwap::storedCondition(is_array($incoming['condition']??null)?$incoming['condition']:[]);
            $candidate['engineSwap']=[
                'count'=>(int)($car['engineSwap']['count']??0)+1,
                'lastFromEngineId'=>$outgoingEngineId!==''?$outgoingEngineId:null,
                'lastToEngineId'=>(string)$engine['engineId'],
                'lastFitment'=>(string)($fitment['fitment']??'CUSTOM'),
                'lastSwapAt'=>time(),
                'lastStoredParts'=>$storedPartNames,
            ];

            $chassisUninstalled=[];
            foreach($player['inventory']['parts'] as &$ownedPart){
                if((string)($ownedPart['installedOnCarId']??'')!==$carId)continue;
                $part=self::findBy($parts,'catalogId',(string)($ownedPart['catalogId']??''));
                if(!$part||EngineSwap::isEngineBoundPart($part))continue;
                if(self::partCompatibilityReason($part,$candidate)!==null){
                    $ownedPart['installedOnCarId']=null;
                    $ownedPart['installedOnEngineInventoryId']=null;
                    $chassisUninstalled[]=(string)($part['name']??$part['catalogId']??'Part');
                }
            }
            unset($ownedPart);

            $activation=self::activateEngineAssemblyParts($player,$candidate);
            $candidate['engineSwap']['lastRestoredParts']=$activation['activeNames'];
            $candidate['engineSwap']['lastDormantParts']=$activation['dormantNames'];
            $candidate['engineSwap']['lastChassisUninstalledParts']=$chassisUninstalled;

            $player['wallet']['credits']-=$totalCost;
            if($enginePrice>0)$player['stats']['enginesPurchased']=(int)($player['stats']['enginesPurchased']??0)+1;
            $player['stats']['engineSwaps']=(int)($player['stats']['engineSwaps']??0)+1;
            $player['garage'][$carIndex]=self::recalculateCar($candidate,$player['inventory']['parts'],$parts);
            $incoming['condition']=EngineSwap::storedCondition(is_array($player['garage'][$carIndex]['engineCondition']??null)?$player['garage'][$carIndex]['engineCondition']:[]);
            $incoming['tune']=is_array($player['garage'][$carIndex]['tune']??null)?$player['garage'][$carIndex]['tune']:null;
            $incoming['storedStats']=[
                'hp'=>max(1,(int)round((float)($player['garage'][$carIndex]['derived']['hp']??$engine['peakHp']??1))),
                'torque'=>max(1,(int)round((float)($player['garage'][$carIndex]['derived']['torque']??$engine['peakTorque']??1))),
            ];
            unset($incoming);

            self::addTransaction($player,'engine_swap',-$totalCost,self::carName($car).': '.(string)($engine['name']??$engine['engineId']).' swap');
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
        if (!self::partStoreAvailable($spec)) {
            throw new GameException('That part is not currently available for purchase.', 404);
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
            if (!empty($instance['installedOnEngineInventoryId']) && !$previousCarId) {
                throw new GameException('That part is attached to a stored engine assembly. Install the engine assembly or remove the part from that engine first.');
            }
            $spec = self::findBy($catalog, 'catalogId', (string)$instance['catalogId']);
            if (!$spec) {
                throw new GameException('Part catalog entry is missing.', 500);
            }
            $car = $player['garage'][$carIndex];
            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'install_first_upgrade' && (string)$spec['catalogId'] !== 's1_intake_1') {
                throw new GameException('Install the Stage 1 Intake to continue the tutorial.');
            }
            self::requirePartCompatible($player, $car, $spec, $catalog, false);

            $fiMeta = self::forcedInductionMeta($spec);
            if ($fiMeta && (string)($fiMeta['role'] ?? '') === 'kit' && self::forcedInductionSwapNeeded($car, $player['inventory']['parts'] ?? [], $spec, $catalog)) {
                $fiState = self::forcedInductionState($car, $player['inventory']['parts'] ?? [], $catalog);
                $previousSystem = (string)($fiState['primarySystem'] ?? '');
                foreach ($player['inventory']['parts'] as &$ownedPart) {
                    if ((string)($ownedPart['installedOnCarId'] ?? '') !== $carId) continue;
                    $installedSpec = self::findBy($catalog, 'catalogId', (string)($ownedPart['catalogId'] ?? ''));
                    $installedMeta = $installedSpec ? self::forcedInductionMeta($installedSpec) : null;
                    if (!$installedMeta || (string)($installedMeta['role'] ?? '') === 'nitrous') continue;
                    if ((string)($installedMeta['system'] ?? '') === $previousSystem) {
                        $ownedPart['installedOnCarId'] = null;
                        self::detachPartFromEngineAssembly($player, $ownedPart);
                    }
                }
                unset($ownedPart);
            }

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
                    if (EngineSwap::isEngineBoundPart($installedSpec)) self::detachPartFromEngineAssembly($player, $ownedPart);
                }
            }
            unset($ownedPart);

            $player['inventory']['parts'][$partIndex]['installedOnCarId'] = $carId;
            if (EngineSwap::isEngineBoundPart($spec)) {
                $assemblyIndex = self::engineAssemblyIndexForCar($player, $car);
                if ($assemblyIndex !== null) {
                    $player['inventory']['parts'][$partIndex]['installedOnEngineInventoryId'] = $player['inventory']['engines'][$assemblyIndex]['inventoryId'];
                    $ids = is_array($player['inventory']['engines'][$assemblyIndex]['attachedPartInventoryIds'] ?? null)
                        ? $player['inventory']['engines'][$assemblyIndex]['attachedPartInventoryIds'] : [];
                    $ids[] = $player['inventory']['parts'][$partIndex]['inventoryId'];
                    $player['inventory']['engines'][$assemblyIndex]['attachedPartInventoryIds'] = array_values(array_unique($ids));
                }
            }
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
            self::detachPartFromEngineAssembly($player, $player['inventory']['parts'][$partIndex]);
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
        $streetRequired = $stageConfig['stages'][0]['requiredCategories'] ?? ['intake','exhaust','ecu','fuel','drivetrain','suspension','tires','weight'];

        return self::mutatePlayer(function (array $player) use ($carId, $catalog, $streetRequired): array {
            $index = self::requireOwnedCarIndex($player, $carId);
            $car = $player['garage'][$index];
            $stage = (int)($car['buildStage'] ?? 1);

            if ($stage === 1) {
                foreach ($streetRequired as $category) {
                    if (self::installedSimpleTier($player, $carId, (string)$category, $catalog) < 3) {
                        throw new GameException('Max every Street Car upgrade category before converting to a Street Race Car.');
                    }
                }
                $car['stageBaseline'] = $car['derived'];
                $car['buildStage'] = 2;
                foreach ($player['inventory']['parts'] as &$ownedPart) {
                    if (($ownedPart['installedOnCarId'] ?? null) !== $carId) continue;
                    $partSpec = self::findBy($catalog, 'catalogId', (string)($ownedPart['catalogId'] ?? ''));
                    if (!empty($partSpec['simpleTier'])) $ownedPart['installedOnCarId'] = null;
                }
                unset($ownedPart);
                self::activateEngineAssemblyParts($player, $car);
                $player['garage'][$index] = self::recalculateCar($car, $player['inventory']['parts'], $catalog);
                self::addTransaction($player, 'stage_conversion', 0, self::carName($car) . ' converted to Street Race Car');
                return $player;
            }

            if ($stage === 2) {
                $requiredCategories = [];
                foreach ($catalog as $part) {
                    if (!empty($part['simpleTier'])) continue;
                    if ((int)($part['buildStage'] ?? 2) !== 2) continue;
                    if (($part['requiredForStageProgression'] ?? true) === false) continue;
                    $key = trim((string)($part['categoryKey'] ?? ''));
                    if ($key !== '' && !in_array($key, $requiredCategories, true)) $requiredCategories[] = $key;
                }

                $installedCategories = [];
                foreach (($player['inventory']['parts'] ?? []) as $ownedPart) {
                    if ((string)($ownedPart['installedOnCarId'] ?? '') !== $carId) continue;
                    $partSpec = self::findBy($catalog, 'catalogId', (string)($ownedPart['catalogId'] ?? ''));
                    $key = trim((string)($partSpec['categoryKey'] ?? ''));
                    if ($key !== '' && !in_array($key, $installedCategories, true)) $installedCategories[] = $key;
                }

                $missing = array_values(array_diff($requiredCategories, $installedCategories));
                if ($missing) {
                    throw new GameException('Install a Street Race Car part in every core category before moving to Front-Half Race Car. Missing: ' . implode(', ', $missing) . '.');
                }

                $car['buildStage'] = 3;
                self::activateEngineAssemblyParts($player, $car);
                $player['garage'][$index] = self::recalculateCar($car, $player['inventory']['parts'], $catalog);
                self::addTransaction($player, 'stage_conversion', 0, self::carName($car) . ' converted to Front-Half Race Car');
                return $player;
            }

            if ($stage === 3) {
                $car['buildStage'] = 4;
                self::activateEngineAssemblyParts($player, $car);
                $player['garage'][$index] = self::recalculateCar($car, $player['inventory']['parts'], $catalog);
                self::addTransaction($player, 'stage_conversion', 0, self::carName($car) . ' converted to Full Race Car');
                return $player;
            }

            throw new GameException('This car is already a Full Race Car.');
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
            $tutorialStarter = ($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'buy_first_car';
            if ($tutorialStarter && empty($spec['starter'])) {
                throw new GameException('Your first car must be one of the highlighted starter listings.');
            }
            $price = (int)$listing['price'];
            self::requireCredits($player, $price);
            $player['wallet']['credits'] -= $price;
            $car = self::createOwnedCar(
                $spec,
                'used',
                (int)$listing['mileage'],
                (int)$listing['condition'],
                $price,
                isset($listing['paintColor']) ? (string)$listing['paintColor'] : null
            );
            $player['garage'][] = $car;
            $player['stats']['usedPurchases'] = (int)$player['stats']['usedPurchases'] + 1;
            if (!$player['selectedCarId']) {
                $player['selectedCarId'] = $car['carId'];
            }
            self::addTransaction($player, 'used_purchase', -$price, $car['displayName']);
            if ($tutorialStarter) {
                self::completeTutorialStep($player, 'buy_first_car', 'visit_garage');
            }
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

    public static function quickRacePreview(): array
    {
        $player = self::getPlayer();
        $carIndex = self::requireOwnedCarIndex($player, (string)($player['selectedCarId'] ?? ''));
        $car = $player['garage'][$carIndex];
        if (!empty($car['engineCondition']['failed'])) {
            throw new GameException('ENGINE FAILED — rebuild it in Garage before racing again.');
        }
        $tutorialRace = ($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'first_race';

        $playerBenchmark = PerformanceIndex::forCar($car, self::racingConfig());
        $opponent = self::nextOpponentProfile($player, $car, $tutorialRace);
        return [
            'carId' => (string)$car['carId'],
            'carName' => self::carName($car),
            'performanceIndex' => (int)$playerBenchmark['performanceIndex'],
            'benchmarkEt' => (float)$playerBenchmark['quarterMileEt'],
            'opponent' => self::publicOpponentProfile($opponent),
        ];
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
            if (!empty($car['engineCondition']['failed'])) {
                throw new GameException('ENGINE FAILED — rebuild it in Garage before racing again.');
            }
            $level = max(1, (int)($player['progression']['level'] ?? 1));
            $tutorialRace = ($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'first_race';
            $unlockLevel = $distance === '1' ? 10 : ($distance === '1/2' ? 5 : 1);
            if ($tutorialRace && $distance !== '1/4') {
                throw new GameException('Your first race is the 1/4 mile.');
            }
            if (!$tutorialRace && $level < $unlockLevel) {
                throw new GameException((string)($distanceConfig['label'] ?? $distance) . ' unlocks at Level ' . $unlockLevel . '.');
            }
            $weather = $tutorialRace
                ? ['name' => 'Cool & Cloudy', 'etModifier' => 0, 'mphModifier' => 0, 'weight' => 1]
                : $simulator->randomWeather($level);
            $location = $tutorialRace
                ? ['name' => 'Local Test & Tune', 'weight' => 1]
                : $simulator->randomLocation($level);

            $hp = max(1.0, (float)($car['derived']['hp'] ?? 1));
            $torque = max(1.0, (float)($car['derived']['torque'] ?? 1));
            $weight = max(500.0, (float)($car['derived']['weight'] ?? 500));
            $grip = max(0.5, (float)($car['derived']['grip'] ?? 1));
            $drivetrain = (string)($car['derived']['drivetrain'] ?? $car['base']['drivetrain'] ?? '-');
            $opponentProfile = self::nextOpponentProfile($player, $car, $tutorialRace);
            $opponentWeight = (float)$opponentProfile['sim']['weight'];
            $opponentHp = (float)$opponentProfile['sim']['hp'];
            $opponentTorque = (float)$opponentProfile['sim']['torque'];
            $opponentGrip = (float)$opponentProfile['sim']['grip'];
            $opponentLevel = (int)$opponentProfile['level'];

            $playerRun = $simulator->simulate([
                'hp' => $hp, 'torque' => $torque, 'weight' => $weight, 'grip' => $grip, 'drivetrain' => $drivetrain, 'level' => $level,
                'allowFoul' => !$tutorialRace,
                'tuning' => is_array($car['tuningRuntime'] ?? null) ? $car['tuningRuntime'] : null,
            ], $distance, $weather);
            $opponentRun = $simulator->simulate([
                'hp' => $opponentHp, 'torque' => $opponentTorque, 'weight' => $opponentWeight, 'grip' => $opponentGrip, 'drivetrain' => (string)($opponentProfile['drivetrain'] ?? '-'), 'level' => $opponentLevel,
                'allowFoul' => !$tutorialRace, 'reactionOffset' => $tutorialRace ? 0.16 : 0,
            ], $distance, $weather);
            if ($tutorialRace && (float)$opponentRun['totalTime'] <= (float)$playerRun['totalTime']) {
                $delta = ((float)$playerRun['totalTime'] - (float)$opponentRun['totalTime']) + 0.25;
                $opponentRun['reactionTime'] = round((float)$opponentRun['reactionTime'] + $delta, 3);
                $opponentRun['totalTime'] = round((float)$opponentRun['totalTime'] + $delta, 3);
                $opponentRun['foul'] = false;
            }

            $playerDnf = !empty($playerRun['dnf']);
            $won = !$playerDnf && (float)$playerRun['totalTime'] < (float)$opponentRun['totalTime'];
            $creditMultiplier = (float)($distanceConfig['creditMultiplier'] ?? 1);
            $reward = $playerDnf ? 0 : ($won
                ? (int)round(mt_rand(450, 850) * $creditMultiplier)
                : (int)round(mt_rand(90, 220) * $creditMultiplier));
            $expReward = $playerDnf ? 0 : self::raceExpReward($level, $opponentLevel, $won);
            $repReward = $playerDnf ? 0 : ($won ? 5 : 2);
            $opponentVisual = is_array($opponentProfile['visual'] ?? null) ? $opponentProfile['visual'] : [];
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
                'distanceFeet' => (int)($distanceConfig['feet'] ?? 1320),
                'location' => $location,
                'weather' => $weather,
                'margin' => $playerDnf ? null : round(abs((float)$playerRun['totalTime'] - (float)$opponentRun['totalTime']), 3),
                'reward' => $reward,
                'expReward' => $expReward,
                'repReward' => $repReward,
                'newBest' => false,
                'playerCarId' => (string)$car['carId'],
                'carName' => self::carName($car),
                'playerVisual' => is_array($car['visual'] ?? null) ? $car['visual'] : [],
                'playerDrivetrain' => $drivetrain,
                'playerPerformanceIndex' => (int)($car['performanceIndex'] ?? PerformanceIndex::forCar($car, $racingConfig)['performanceIndex']),
                'playerPerformanceClass' => (string)($car['performanceClass'] ?? PerformanceIndex::classFromIndex((int)($car['performanceIndex'] ?? 0))),
                'player' => $playerRun,
                'opponent' => [
                    'name' => (string)$opponentProfile['name'],
                    'carName' => (string)$opponentProfile['carName'],
                    'visual' => $opponentVisual,
                    'performanceIndex' => (int)$opponentProfile['performanceIndex'],
                    'performanceClass' => (string)$opponentProfile['performanceClass'],
                    'drivetrain' => (string)$opponentProfile['drivetrain'],
                    'buildType' => (string)$opponentProfile['buildType'],
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

            if (empty($playerRun['foul']) && empty($playerRun['dnf']) && (($player['stats']['bestReaction'] ?? null) === null || (float)($playerRun['reactionTime'] ?? 999) < (float)$player['stats']['bestReaction'])) {
                $player['stats']['bestReaction'] = (float)$playerRun['reactionTime'];
            }

            $records = is_array($car['raceRecords'] ?? null) ? $car['raceRecords'] : self::emptyRaceRecords();
            $record = is_array($records[$distance] ?? null) ? $records[$distance] : ['races' => 0, 'bestEt' => null, 'bestTrap' => null];
            $record['races'] = (int)($record['races'] ?? 0) + 1;
            $newBest = false;
            if (empty($playerRun['foul']) && empty($playerRun['dnf']) && (($record['bestEt'] ?? null) === null || (float)$playerRun['elapsedTime'] < (float)$record['bestEt'])) {
                $record['bestEt'] = (float)$playerRun['elapsedTime'];
                $newBest = true;
            }
            if (empty($playerRun['dnf']) && (($record['bestTrap'] ?? null) === null || (float)$playerRun['trapSpeed'] > (float)$record['bestTrap'])) {
                $record['bestTrap'] = (float)$playerRun['trapSpeed'];
            }
            $records[$distance] = $record;

            if (!empty($playerRun['dnf']) && ($playerRun['mechanicalFailure'] ?? '') === 'ENGINE FAILURE') {
                $previousFailures = (int)($car['engineCondition']['failures'] ?? 0);
                $player['garage'][$carIndex]['engineCondition'] = [
                    'healthPct' => 0,
                    'failed' => true,
                    'failures' => $previousFailures + 1,
                    'lastFailureAt' => time(),
                    'repairedAt' => $car['engineCondition']['repairedAt'] ?? null,
                ];
                $assemblyIndex = self::engineAssemblyIndexForCar($player, $player['garage'][$carIndex]);
                if ($assemblyIndex !== null) {
                    $player['inventory']['engines'][$assemblyIndex]['condition'] = EngineSwap::storedCondition($player['garage'][$carIndex]['engineCondition']);
                }
                $result['engineFailure'] = true;
                $result['engineRepairCost'] = self::engineRepairCost($player['garage'][$carIndex]);
            }
            $player['garage'][$carIndex]['raceRecords'] = $records;
            $result['newBest'] = $newBest;

            self::addTransaction($player, 'race_reward', $reward, (string)($result['distanceLabel'] ?? $distance) . ($won ? ' win' : ' participation'));

            if (($player['tutorial']['status'] ?? '') === 'active' && ($player['tutorial']['step'] ?? '') === 'first_race') {
                $tutorialCredits = (int)app_config()['tutorial_completion_credits'];
                $tutorialRep = (int)app_config()['tutorial_completion_rep'];
                $player['wallet']['credits'] += $tutorialCredits;
                $player['progression']['rep'] += $tutorialRep;
                self::addTransaction($player, 'tutorial_reward', $tutorialCredits, 'Tutorial completion reward');
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


    public static function circuitStart(string $circuitId): array
    {
        return self::mutatePlayer(function(array $player) use ($circuitId): array {
            if (is_array($player['activeRace'] ?? null)) throw new GameException('Finish the active race first.');
            if (is_array($player['circuits']['activeRun'] ?? null)) throw new GameException('Finish or leave the current Circuit before entering another.');
            $circuit=self::findBy(self::circuitCatalog(),'circuitId',$circuitId);
            if(!$circuit) throw new GameException('That Circuit does not exist.',404);
            $car=self::selectedCar($player);
            if(!$car) throw new GameException('Select a Current Car first.');
            $reason=self::circuitEntryReason($circuit,$player,$car);
            if($reason!==null) throw new GameException($reason);
            $progress=is_array($player['circuits']['progress'][$circuitId]??null)?$player['circuits']['progress'][$circuitId]:[];
            if(($circuit['repeatable']??true)===false&&!empty($progress['completed'])) throw new GameException('That Circuit has already been completed.');
            $player['circuits']['activeRun']=[
                'runId'=>self::id('circuit'),
                'circuitId'=>$circuitId,
                'carId'=>(string)$car['carId'],
                'raceIndex'=>0,
                'wins'=>0,
                'losses'=>0,
                'runCredits'=>0,
                'startedAt'=>time(),
            ];
            return $player;
        });
    }

    public static function circuitAbandon(): array
    {
        return self::mutatePlayer(function(array $player): array {
            if(is_array($player['activeRace']??null)) throw new GameException('Finish the active race first.');
            $player['circuits']['activeRun']=null;
            return $player;
        });
    }

    public static function startCircuitRace(string $circuitId, ?int $timestampMs=null): array
    {
        $activeRace=null;
        $racingConfig=self::racingConfig();
        $simulator=new RaceSimulator($racingConfig);
        $timestampMs??=(int)floor(microtime(true)*1000);

        $player=self::mutatePlayer(function(array $player) use (&$activeRace,$circuitId,$timestampMs,$racingConfig,$simulator): array {
            if(is_array($player['activeRace']??null)){
                $activeRace=$player['activeRace'];
                return $player;
            }
            $run=is_array($player['circuits']['activeRun']??null)?$player['circuits']['activeRun']:null;
            if(!$run||(string)($run['circuitId']??'')!==$circuitId) throw new GameException('Enter this Circuit first.');
            $circuit=self::findBy(self::circuitCatalog(),'circuitId',$circuitId);
            if(!$circuit) throw new GameException('Circuit definition is missing.',404);
            $races=is_array($circuit['races']??null)?array_values($circuit['races']):[];
            $raceIndex=max(0,(int)($run['raceIndex']??0));
            $raceDef=is_array($races[$raceIndex]??null)?$races[$raceIndex]:null;
            if(!$raceDef) throw new GameException('This Circuit has no race at the current position.');

            $carIndex=self::requireOwnedCarIndex($player,(string)($run['carId']??''));
            $car=$player['garage'][$carIndex];
            if(!empty($car['engineCondition']['failed'])) throw new GameException('ENGINE FAILED — rebuild it in Garage before racing again.');
            $reason=self::circuitEntryReason($circuit,$player,$car);
            if($reason!==null) throw new GameException($reason);

            $distance=(string)($raceDef['distance']??'1/4');
            $distanceConfig=$simulator->distance($distance);
            $weather=self::circuitWeather((string)($raceDef['weather']??'Cool & Cloudy'),$racingConfig);
            $location=['name'=>(string)($raceDef['location']??'The Circuit'),'weight'=>1];
            $opponent=self::circuitOpponentProfile($raceDef,$racingConfig);
            $level=max(1,(int)($player['progression']['level']??1));

            $playerRun=$simulator->simulate([
                'hp'=>max(1,(float)($car['derived']['hp']??1)),
                'torque'=>max(1,(float)($car['derived']['torque']??1)),
                'weight'=>max(500,(float)($car['derived']['weight']??500)),
                'grip'=>max(.5,(float)($car['derived']['grip']??1)),
                'drivetrain'=>(string)($car['derived']['drivetrain']??$car['base']['drivetrain']??'-'),
                'level'=>$level,
                'tuning'=>is_array($car['tuningRuntime']??null)?$car['tuningRuntime']:null,
            ],$distance,$weather);
            $opponentRun=$simulator->simulate([
                'hp'=>$opponent['sim']['hp'],'torque'=>$opponent['sim']['torque'],'weight'=>$opponent['sim']['weight'],
                'grip'=>$opponent['sim']['grip'],'drivetrain'=>$opponent['sim']['drivetrain'],'level'=>$opponent['level'],
            ],$distance,$weather);

            $playerDnf=!empty($playerRun['dnf']);
            $won=!$playerDnf&&(float)$playerRun['totalTime']<(float)$opponentRun['totalTime'];
            $rewards=is_array($raceDef['rewards']??null)?$raceDef['rewards']:[];
            $reward=$won?(int)($rewards['credits']??0):0;
            $expReward=$won?(int)($rewards['exp']??0):0;
            $repReward=$won?(int)($rewards['rep']??0):0;
            $timeScale=self::raceTimeScale($racingConfig);
            $stagingMs=max(1800.0,(float)($racingConfig['presentation']['stagingMs']??2800))*$timeScale;
            $greenAt=$timestampMs+$stagingMs;
            $playerFinishSeconds=max(.1,(float)($playerRun['reactionTime']??0)+(float)($playerRun['elapsedTime']??0));
            $opponentFinishSeconds=max(.1,(float)($opponentRun['reactionTime']??0)+(float)($opponentRun['elapsedTime']??0));
            $finishAt=$greenAt+(max($playerFinishSeconds,$opponentFinishSeconds)*1000*$timeScale);
            $race=[
                'raceId'=>self::id('race'),
                'origin'=>'circuit',
                'circuitId'=>$circuitId,
                'circuitRaceId'=>(string)($raceDef['raceId']??('race_'.($raceIndex+1))),
                'circuitRaceIndex'=>$raceIndex,
                'circuitRaceName'=>(string)($raceDef['name']??('Race '.($raceIndex+1))),
                'circuitRaceType'=>(string)($raceDef['type']??'regular'),
                'won'=>$won,
                'distance'=>$distance,
                'distanceLabel'=>(string)($distanceConfig['label']??$distance),
                'distanceFeet'=>(int)($distanceConfig['feet']??1320),
                'location'=>$location,'weather'=>$weather,
                'margin'=>$playerDnf?null:round(abs((float)$playerRun['totalTime']-(float)$opponentRun['totalTime']),3),
                'reward'=>$reward,'expReward'=>$expReward,'repReward'=>$repReward,'newBest'=>false,
                'playerCarId'=>(string)$car['carId'],
                'carName'=>self::carName($car),
                'playerVisual'=>is_array($car['visual']??null)?$car['visual']:[],
                'playerDrivetrain'=>(string)($car['base']['drivetrain']??'-'),
                'playerPerformanceIndex'=>(int)($car['performanceIndex']??PerformanceIndex::forCar($car,$racingConfig)['performanceIndex']),
                'playerPerformanceClass'=>(string)($car['performanceClass']??PerformanceIndex::classFromIndex((int)($car['performanceIndex']??0))),
                'player'=>$playerRun,
                'opponent'=>[
                    'name'=>$opponent['name'],'carName'=>$opponent['carName'],'visual'=>$opponent['visual'],
                    'performanceIndex'=>$opponent['performanceIndex'],'performanceClass'=>$opponent['performanceClass'],
                    'drivetrain'=>$opponent['drivetrain'],'buildType'=>$opponent['buildType'],'level'=>$opponent['level'],
                ]+$opponentRun,
                'reaction'=>(float)$playerRun['reactionTime'],
                'playerEt'=>(float)$playerRun['elapsedTime'],
                'opponentEt'=>(float)$opponentRun['elapsedTime'],
            ];
            $activeRace=[
                'raceId'=>$race['raceId'],'origin'=>'circuit','circuitId'=>$circuitId,'status'=>'running',
                'startedAt'=>$timestampMs,'greenAt'=>$greenAt,'finishAt'=>$finishAt,'timeScale'=>$timeScale,
                'revealDelayMs'=>max(0,(int)($racingConfig['presentation']['revealDelayMs']??650)),
                'progressExponent'=>max(1.0,(float)($racingConfig['presentation']['progressExponent']??1.38)),
                'distance'=>$distance,'race'=>$race,
            ];
            $player['activeRace']=$activeRace;
            return $player;
        });
        return ['player'=>$player,'activeRace'=>$activeRace];
    }

    public static function finishCircuitRace(string $raceId, ?int $timestampMs=null): array
    {
        $result=null;$circuitResult=null;
        $racingConfig=self::racingConfig();
        $timestampMs??=(int)floor(microtime(true)*1000);

        $player=self::mutatePlayer(function(array $player) use (&$result,&$circuitResult,$raceId,$timestampMs,$racingConfig): array {
            $active=is_array($player['activeRace']??null)?$player['activeRace']:null;
            if(!$active||($active['origin']??'')!=='circuit'){
                foreach(array_reverse($player['raceHistory']??[]) as $row){
                    if((string)($row['raceId']??'')===$raceId){$result=$row;$circuitResult=$row['circuitResult']??null;return $player;}
                }
                throw new GameException('No Circuit race is currently in progress.',409);
            }
            if((string)($active['raceId']??'')!==$raceId) throw new GameException('That Circuit race is no longer active.',409);
            if($timestampMs<(int)round((float)($active['finishAt']??0))) throw new GameException('The race is still in progress.',409);

            $result=is_array($active['race']??null)?$active['race']:[];
            $run=is_array($player['circuits']['activeRun']??null)?$player['circuits']['activeRun']:null;
            $circuit=$run?self::findBy(self::circuitCatalog(),'circuitId',(string)($run['circuitId']??'')):null;
            if(!$run||!$circuit) throw new GameException('Circuit run state is missing.',409);
            $carIndex=self::requireOwnedCarIndex($player,(string)($result['playerCarId']??''));
            $car=$player['garage'][$carIndex];
            $playerRun=is_array($result['player']??null)?$result['player']:[];
            $won=!empty($result['won']);

            if($won){
                $reward=(int)($result['reward']??0);
                $player['wallet']['credits']+=$reward;
                $player['progression']['exp']+=(int)($result['expReward']??0);
                $player['progression']['rep']+=(int)($result['repReward']??0);
                $player['progression']['level']=self::levelFromExp((int)$player['progression']['exp']);
                $run['wins']=(int)($run['wins']??0)+1;
                $run['runCredits']=(int)($run['runCredits']??0)+$reward;
                $run['raceIndex']=(int)($run['raceIndex']??0)+1;
                self::addTransaction($player,'circuit_race_reward',$reward,(string)$circuit['name'].': '.(string)($result['circuitRaceName']??'Race'));
            }else{
                $run['losses']=(int)($run['losses']??0)+1;
                if(($circuit['lossRule']??'retry_race')==='reset_circuit')$run['raceIndex']=0;
            }

            $player['stats']['races']=(int)($player['stats']['races']??0)+1;
            $player['stats'][$won?'wins':'losses']=(int)($player['stats'][$won?'wins':'losses']??0)+1;
            self::commitCircuitRaceRecord($player,$carIndex,$result);

            if(!empty($playerRun['dnf'])&&($playerRun['mechanicalFailure']??'')==='ENGINE FAILURE'){
                $previousFailures=(int)($car['engineCondition']['failures']??0);
                $player['garage'][$carIndex]['engineCondition']=[
                    'healthPct'=>0,'failed'=>true,'failures'=>$previousFailures+1,'lastFailureAt'=>time(),
                    'repairedAt'=>$car['engineCondition']['repairedAt']??null,
                ];
                $assemblyIndex=self::engineAssemblyIndexForCar($player,$player['garage'][$carIndex]);
                if($assemblyIndex!==null)$player['inventory']['engines'][$assemblyIndex]['condition']=EngineSwap::storedCondition($player['garage'][$carIndex]['engineCondition']);
                $result['engineFailure']=true;
                $result['engineRepairCost']=self::engineRepairCost($player['garage'][$carIndex]);
            }

            $races=is_array($circuit['races']??null)?$circuit['races']:[];
            $completed=$won&&(int)($run['raceIndex']??0)>=count($races);
            $circuitId=(string)$circuit['circuitId'];
            $currentProgress=is_array($player['circuits']['progress'][$circuitId]??null)?$player['circuits']['progress'][$circuitId]:[];
            if($completed){
                $completion=is_array($circuit['completion']??null)?$circuit['completion']:[];
                $firstClear=empty($currentProgress['completed']);
                $bonus=(int)($completion['credits']??0);
                $player['wallet']['credits']+=$bonus;
                $player['progression']['exp']+=(int)($completion['exp']??0);
                $player['progression']['rep']+=(int)($completion['rep']??0);
                $player['progression']['level']=self::levelFromExp((int)$player['progression']['exp']);
                $unlockClass=strtoupper(trim((string)($completion['unlockClass']??'')));
                if($unlockClass!==''&&!in_array($unlockClass,$player['progression']['unlockedClasses'],true))$player['progression']['unlockedClasses'][]=$unlockClass;
                if($bonus>0)self::addTransaction($player,'circuit_completion',$bonus,(string)$circuit['name'].' completion');
                $player['circuits']['progress'][$circuitId]=array_replace($currentProgress,[
                    'completed'=>true,'completions'=>(int)($currentProgress['completions']??0)+1,
                    'highestRace'=>count($races),'firstClearedAt'=>$currentProgress['firstClearedAt']??time(),'lastClearedAt'=>time(),
                ]);
                $circuitResult=[
                    'completed'=>true,'firstClear'=>$firstClear,'unlockClass'=>$unlockClass!==''?$unlockClass:null,
                    'completionCredits'=>$bonus,'completionExp'=>(int)($completion['exp']??0),'completionRep'=>(int)($completion['rep']??0),
                ];
                $player['circuits']['activeRun']=null;
            }else{
                $player['circuits']['progress'][$circuitId]=array_replace($currentProgress,[
                    'completed'=>!empty($currentProgress['completed']),
                    'completions'=>(int)($currentProgress['completions']??0),
                    'highestRace'=>max((int)($currentProgress['highestRace']??0),(int)($run['raceIndex']??0)),
                    'lastPlayedAt'=>time(),
                ]);
                $player['circuits']['activeRun']=$run;
                $circuitResult=['completed'=>false,'nextRaceIndex'=>(int)($run['raceIndex']??0),'lossRule'=>(string)($circuit['lossRule']??'retry_race')];
            }

            $result['circuitResult']=$circuitResult;
            $result['completedAt']=time();
            $player['raceHistory'][]=$result;
            $historyLimit=max(5,(int)($racingConfig['historyLimit']??25));
            if(count($player['raceHistory'])>$historyLimit)$player['raceHistory']=array_slice($player['raceHistory'],-$historyLimit);
            $player['activeRace']=null;
            return $player;
        });

        return ['player'=>$player,'race'=>$result,'circuitResult'=>$circuitResult];
    }

    public static function roguelikeStart(): array
    {
        return self::mutatePlayer(function (array $player): array {
            if (!self::selectedCar($player)) {
                throw new GameException('Select a car before starting a The Circuit run.');
            }
            if (is_array($player['roguelike']['activeRun'] ?? null)) {
                throw new GameException('A The Circuit run is already active.');
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
                throw new GameException('No active The Circuit run.');
            }
            $car = self::selectedCar($player);
            if (!$car) {
                throw new GameException('Your selected car is missing.');
            }

            $stage = (int)$run['stage'];
            $risk = $choice === 'push' ? 1.09 : 0.99;
            $boost = (float)($run['boost'] ?? 0);
            $basePi = (int)($car['performanceIndex'] ?? PerformanceIndex::forCar($car, self::racingConfig())['performanceIndex']);
            $rating = $basePi * (1 + $boost);
            $difficulty = $rating * (0.88 + $stage * 0.035) * $risk;
            $roll = (mt_rand(930, 1070) / 1000) * $rating;
            $won = $roll >= $difficulty;
            $reward = $won ? (int)round((420 + ($stage * 180)) * ($choice === 'push' ? 1.45 : 1.0)) : 0;

            if (!$won) {
                $banked = (int)floor(((int)$run['runCredits']) * 0.35);
                $player['wallet']['credits'] += $banked;
                self::addTransaction($player, 'roguelike_cashout', $banked, 'The Circuit consolation');
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
                self::addTransaction($player, 'roguelike_cashout', $banked, 'The Circuit complete');
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
        $car['catalogId'] = $car['catalogId'] ?? ($spec['catalogId'] ?? $spec['visual']['layered']['assetId'] ?? null);
        $car['factoryEngineId'] = $car['factoryEngineId'] ?? ($spec['factoryEngineId'] ?? null);
        $car['engineId'] = $car['engineId'] ?? $car['factoryEngineId'];
        $car['engineBay'] = $car['engineBay'] ?? ($spec['engineBay'] ?? null);
        $car['engineSwapFitment'] = is_array($car['engineSwapFitment'] ?? null)
            ? $car['engineSwapFitment']
            : (is_array($spec['engineSwapFitment'] ?? null) ? $spec['engineSwapFitment'] : ['minBuildStage' => 2, 'options' => []]);
        $car['engine'] = array_replace(
            is_array($spec['engine'] ?? null) ? $spec['engine'] : [],
            is_array($car['engine'] ?? null) ? $car['engine'] : []
        );
        $installedEngine = self::findBy(self::engineCatalog(), 'engineId', (string)($car['engineId'] ?? ''));
        if ($installedEngine && EngineSwap::eligible($installedEngine)) {
            $car['engine'] = EngineSwap::snapshot($installedEngine, $car['engine']);
        }
        $catalogVisual = is_array($spec['visual'] ?? null) ? $spec['visual'] : [];
        $savedVisual = is_array($car['visual'] ?? null) ? $car['visual'] : [];
        $car['visual'] = array_replace($catalogVisual, $savedVisual);
        $catalogLayered = is_array($catalogVisual['layered'] ?? null) ? $catalogVisual['layered'] : [];
        $savedLayered = is_array($savedVisual['layered'] ?? null) ? $savedVisual['layered'] : [];
        $car['visual']['layered'] = array_replace($catalogLayered, $savedLayered);
        $car['visual']['layered']['layers'] = array_replace(
            is_array($catalogLayered['layers'] ?? null) ? $catalogLayered['layers'] : [],
            is_array($savedLayered['layers'] ?? null) ? $savedLayered['layers'] : []
        );
        $car['visual']['layered']['anchors'] = array_replace(
            is_array($catalogLayered['anchors'] ?? null) ? $catalogLayered['anchors'] : [],
            is_array($savedLayered['anchors'] ?? null) ? $savedLayered['anchors'] : []
        );
        $car['raceRecords'] = array_replace(self::emptyRaceRecords(), is_array($car['raceRecords'] ?? null) ? $car['raceRecords'] : []);
        $condition = is_array($car['engineCondition'] ?? null) ? $car['engineCondition'] : [];
        $car['engineCondition'] = [
            'healthPct' => max(0, min(100, (int)($condition['healthPct'] ?? 100))),
            'failed' => !empty($condition['failed']),
            'failures' => max(0, (int)($condition['failures'] ?? 0)),
            'lastFailureAt' => $condition['lastFailureAt'] ?? null,
            'repairedAt' => $condition['repairedAt'] ?? null,
        ];
        $car['tune'] = is_array($car['tune'] ?? null) ? $car['tune'] : null;
        $car['tuningRuntime'] = is_array($car['tuningRuntime'] ?? null) ? $car['tuningRuntime'] : null;
        $car['tuningDiagnostics'] = is_array($car['tuningDiagnostics'] ?? null) ? $car['tuningDiagnostics'] : null;
        $car['untunedDerived'] = is_array($car['untunedDerived'] ?? null) ? $car['untunedDerived'] : null;
        if (!empty($car['derived']['hp']) && !empty($car['derived']['weight'])) {
            $benchmark = PerformanceIndex::forCar($car, self::racingConfig());
            $car['performanceIndex'] = (int)$benchmark['performanceIndex'];
            $car['performanceClass'] = PerformanceIndex::classFromIndex((int)$benchmark['performanceIndex']);
            $car['benchmarkEt'] = (float)$benchmark['quarterMileEt'];
        }
        return $car;
    }

    private static function createOwnedCar(array $spec, string $source, int $mileage, int $condition, int $purchasePrice, ?string $paintColor = null): array
    {
        $base = is_array($spec['base'] ?? null) ? $spec['base'] : [];
        $derived = [
            'hp' => (int)($base['hp'] ?? 1),
            'torque' => (int)($base['torque'] ?? 1),
            'weight' => (int)($base['weight'] ?? 500),
            'grip' => (float)($base['grip'] ?? 1.0),
        ];
        $benchmark = PerformanceIndex::benchmark($derived, self::racingConfig());
        $displayName = trim((string)($spec['displayName'] ?? ''));
        if ($displayName === '') {
            $displayName = trim(implode(' ', array_filter([$spec['year'] ?? null, $spec['make'] ?? null, $spec['model'] ?? null])));
        }

        return [
            'carId' => self::id('car'),
            'stockId' => (int)$spec['stockId'],
            'catalogId' => $spec['catalogId'] ?? $spec['visual']['layered']['assetId'] ?? null,
            'displayName' => $displayName !== '' ? $displayName : 'Unknown Car',
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
            'engineSwapFitment' => is_array($spec['engineSwapFitment'] ?? null) ? $spec['engineSwapFitment'] : ['minBuildStage' => 2, 'options' => []],
            'engine' => is_array($spec['engine'] ?? null) ? $spec['engine'] : [],
            'visual' => self::withPaintColor(is_array($spec['visual'] ?? null) ? $spec['visual'] : [], $paintColor ?? self::firstPaintColor($spec)),
            'benchmark' => is_array($spec['benchmark'] ?? null) ? $spec['benchmark'] : $benchmark,
            'stockClass' => (string)($spec['class'] ?? PerformanceIndex::classFromIndex((int)($spec['benchmark']['performanceIndex'] ?? $benchmark['performanceIndex']))),
            'performanceIndex' => (int)$benchmark['performanceIndex'],
            'performanceClass' => PerformanceIndex::classFromIndex((int)$benchmark['performanceIndex']),
            'benchmarkEt' => (float)$benchmark['quarterMileEt'],
            'base' => [
                'hp' => (int)($base['hp'] ?? 1), 'torque' => (int)($base['torque'] ?? 1), 'weight' => (int)($base['weight'] ?? 500),
                'grip' => (float)($base['grip'] ?? 1.0), 'drivetrain' => (string)($base['drivetrain'] ?? 'FWD'),
            ],
            'derived' => $derived,
            'raceRecords' => self::emptyRaceRecords(),
            'engineCondition' => ['healthPct' => 100, 'failed' => false, 'failures' => 0, 'lastFailureAt' => null, 'repairedAt' => null],
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
        $installedSpecs = [];

        foreach ($inventory as $instance) {
            if (($instance['installedOnCarId'] ?? null) !== ($car['carId'] ?? null)) continue;
            $spec = self::findBy($catalog, 'catalogId', (string)($instance['catalogId'] ?? ''));
            if (!$spec) continue;
            $installedParts[] = $instance['inventoryId'] ?? '';
            $installedSpecs[] = $spec;
            foreach (($spec['effects'] ?? []) as $effect) {
                PowerModel::applyBuildPartEffect($derived, $effect, $spec);
            }
        }

        $envelope = PowerModel::enginePowerEnvelope($car, $installedSpecs);
        $limitedBuild = PowerModel::limitEngineOutput([
            'hp' => max(1, $derived['hp']),
            'torque' => max(1, $derived['torque']),
            'weight' => max(500, $derived['weight']),
            'grip' => max(0.5, $derived['grip']),
        ], $envelope);
        $untuned = [
            'hp' => (int)$limitedBuild['hp'],
            'torque' => (int)$limitedBuild['torque'],
            'weight' => (int)round(max(500, $derived['weight'])),
            'grip' => round(max(0.5, $derived['grip']), 3),
        ];
        $car['powerEnvelope'] = $envelope;
        $car['powerLimit'] = $limitedBuild['powerLimit'] ?? null;
        $car['untunedDerived'] = $untuned;
        $hardware = Tuning::hardwareProfile($car, $installedSpecs);

        if (is_array($car['tune'] ?? null) && !empty($hardware['unlocked'])) {
            $evaluation = Tuning::evaluate(
                $car,
                $untuned + ['drivetrain' => (string)($car['base']['drivetrain'] ?? '')],
                $car['tune'],
                $hardware
            );
            $car['tune'] = $evaluation['profile'];
            $car['tune']['savedAt'] = (int)($car['tune']['savedAt'] ?? time());
            $car['derived'] = [
                'hp' => (int)$evaluation['derived']['hp'],
                'torque' => (int)$evaluation['derived']['torque'],
                'weight' => (int)$evaluation['derived']['weight'],
                'grip' => (float)$evaluation['derived']['grip'],
            ];
            $car['tuningRuntime'] = $evaluation['race'];
            $car['tuningDiagnostics'] = $evaluation['diagnostics'];
        } else {
            $car['derived'] = $untuned;
            $car['tuningRuntime'] = null;
            $car['tuningDiagnostics'] = null;
        }

        $benchmark = PerformanceIndex::forCar($car, self::racingConfig());
        $car['performanceIndex'] = (int)$benchmark['performanceIndex'];
        $car['performanceClass'] = PerformanceIndex::classFromIndex((int)$benchmark['performanceIndex']);
        $car['benchmarkEt'] = (float)$benchmark['quarterMileEt'];
        $car['installedParts'] = array_values(array_filter($installedParts));
        return $car;
    }

    private static function engineAssemblyIndexForCar(array $player, array $car): ?int
    {
        foreach (($player['inventory']['engines'] ?? []) as $index => $item) {
            if ((string)($item['inventoryId'] ?? '') === (string)($car['engineInventoryId'] ?? '')
                || (string)($item['installedOnCarId'] ?? '') === (string)($car['carId'] ?? '')) {
                return (int)$index;
            }
        }
        return null;
    }

    private static function sanitizeEngineAssemblyParts(array &$player, int $assemblyIndex, array $catalog): array
    {
        if (!isset($player['inventory']['engines'][$assemblyIndex])) return [];
        $assembly =& $player['inventory']['engines'][$assemblyIndex];
        $safeIds = [];
        foreach (array_values(array_unique(array_map('strval', is_array($assembly['attachedPartInventoryIds'] ?? null) ? $assembly['attachedPartInventoryIds'] : []))) as $id) {
            $partIndex = null;
            foreach ($player['inventory']['parts'] as $idx => $item) {
                if ((string)($item['inventoryId'] ?? '') === $id) {
                    $partIndex = (int)$idx;
                    break;
                }
            }
            if ($partIndex === null) continue;
            $spec = self::findBy($catalog, 'catalogId', (string)($player['inventory']['parts'][$partIndex]['catalogId'] ?? ''));
            if (!$spec || !EngineSwap::isEngineBoundPart($spec)) {
                if ((string)($player['inventory']['parts'][$partIndex]['installedOnEngineInventoryId'] ?? '') === (string)($assembly['inventoryId'] ?? '')) {
                    $player['inventory']['parts'][$partIndex]['installedOnEngineInventoryId'] = null;
                }
                continue;
            }
            $safeIds[] = $id;
        }
        $assembly['attachedPartInventoryIds'] = $safeIds;
        unset($assembly);
        return $safeIds;
    }

    private static function activateEngineAssemblyParts(array &$player, array $car): array
    {
        $assemblyIndex=self::engineAssemblyIndexForCar($player,$car);
        if($assemblyIndex===null)return ['activeNames'=>[],'dormantNames'=>[]];
        $catalog=self::partsCatalog();
        $attachedIds=self::sanitizeEngineAssemblyParts($player,$assemblyIndex,$catalog);
        $assembly=&$player['inventory']['engines'][$assemblyIndex];
        $assembly['installedOnCarId']=(string)($car['carId']??'');
        $candidates=[];
        foreach($attachedIds as $id){
            foreach($player['inventory']['parts'] as &$item){
                if((string)($item['inventoryId']??'')!==$id)continue;
                $item['installedOnEngineInventoryId']=$assembly['inventoryId'];
                $spec=self::findBy($catalog,'catalogId',(string)($item['catalogId']??''));
                if(!$spec)break;
                $stage=(int)($car['buildStage']??1);
                $stageOk=(int)($spec['buildStage']??1)<=$stage
                    && (int)($spec['persistentFromStage']??$spec['buildStage']??1)<=$stage;
                if(self::partCompatibilityReason($spec,$car)===null&&$stageOk)$candidates[]=['inventoryId'=>$id,'spec'=>$spec];
                else $item['installedOnCarId']=null;
                break;
            }
            unset($item);
        }
        $activeSpecs=array_map(fn(array $row):array=>$row['spec'],$candidates);
        $engineKitLevel=0;
        foreach($activeSpecs as $spec)$engineKitLevel=max($engineKitLevel,(int)($spec['engineKit']['level']??0));
        $activeNames=[];$dormantNames=[];
        foreach($candidates as $row){
            $spec=$row['spec'];$id=$row['inventoryId'];
            $rules=self::partRuleCompatibilityReason($spec,$activeSpecs);
            $engineKitOk=(int)($spec['requiredEngineKit']??0)<=$engineKitLevel;
            $name=(string)($spec['name']??$spec['catalogId']??'Part');
            foreach($player['inventory']['parts'] as &$item){
                if((string)($item['inventoryId']??'')!==$id)continue;
                if($rules===null&&$engineKitOk){
                    $item['installedOnCarId']=(string)($car['carId']??'');
                    $activeNames[]=$name;
                }else{
                    $item['installedOnCarId']=null;
                    $dormantNames[]=$name;
                }
                break;
            }
            unset($item);
        }
        foreach($attachedIds as $id){
            $part=null;
            foreach($player['inventory']['parts'] as $item){
                if((string)($item['inventoryId']??'')===$id){$part=$item;break;}
            }
            if(!$part)continue;
            $spec=self::findBy($catalog,'catalogId',(string)($part['catalogId']??''));
            if(!$spec)continue;
            $name=(string)($spec['name']??$spec['catalogId']??'Part');
            if(!in_array($name,$activeNames,true)&&!in_array($name,$dormantNames,true))$dormantNames[]=$name;
        }
        return ['activeNames'=>$activeNames,'dormantNames'=>$dormantNames];
    }

    private static function detachPartFromEngineAssembly(array &$player, array &$item): void
    {
        $assemblyId=(string)($item['installedOnEngineInventoryId']??'');
        if($assemblyId==='')return;
        foreach($player['inventory']['engines'] as &$assembly){
            if((string)($assembly['inventoryId']??'')!==$assemblyId)continue;
            $assembly['attachedPartInventoryIds']=array_values(array_filter(
                is_array($assembly['attachedPartInventoryIds']??null)?$assembly['attachedPartInventoryIds']:[],
                fn($id):bool=>(string)$id!==(string)($item['inventoryId']??'')
            ));
            break;
        }
        unset($assembly);
        $item['installedOnEngineInventoryId']=null;
    }

    private static function engineRepairCost(array $car): int
    {
        $capacity = max(200, (float)($car['powerEnvelope']['capacityHp'] ?? $car['engine']['powerLimits']['kit4Hp'] ?? $car['derived']['hp'] ?? 200));
        $stage = max(1, (int)($car['buildStage'] ?? 1));
        return max(5000, (int)(round((($capacity * 12) + ($stage * 1500)) / 100) * 100));
    }

    private static function installedPartSpecs(array $player, string $carId, array $catalog): array
    {
        $specs = [];
        foreach (($player['inventory']['parts'] ?? []) as $instance) {
            if ((string)($instance['installedOnCarId'] ?? '') !== $carId) continue;
            $spec = self::findBy($catalog, 'catalogId', (string)($instance['catalogId'] ?? ''));
            if ($spec) $specs[] = $spec;
        }
        return $specs;
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

    private static function installedEngineKitLevel(array $player, string $carId, array $catalog): int
    {
        $level = 0;
        foreach (($player['inventory']['parts'] ?? []) as $instance) {
            if ((string)($instance['installedOnCarId'] ?? '') !== $carId) continue;
            $spec = self::findBy($catalog, 'catalogId', (string)($instance['catalogId'] ?? ''));
            $level = max($level, (int)($spec['engineKit']['level'] ?? 0));
        }
        return $level;
    }

    private static function normalizeFiSystem(mixed $value): ?string
    {
        $text = strtolower(trim((string)$value));
        if (str_contains($text, 'super')) return 'supercharger';
        if (str_contains($text, 'turbo')) return 'turbo';
        if (str_contains($text, 'nitrous') || str_contains($text, 'nos')) return 'nitrous';
        return null;
    }

    private static function forcedInductionMeta(array $spec): ?array
    {
        return is_array($spec['forcedInduction'] ?? null) ? $spec['forcedInduction'] : null;
    }

    private static function forcedInductionState(array $car, array $inventory, array $catalog): array
    {
        $factorySystem = self::normalizeFiSystem($car['engine']['aspiration'] ?? '');
        $primarySpec = $secondarySpec = $factoryUpgradeSpec = $nitrousSpec = null;

        foreach ($inventory as $item) {
            if ((string)($item['installedOnCarId'] ?? '') !== (string)($car['carId'] ?? '')) continue;
            $part = self::findBy($catalog, 'catalogId', (string)($item['catalogId'] ?? ''));
            if (!$part) continue;
            $slot = (string)($part['slot'] ?? '');
            if ($slot === 'forced_induction_primary') $primarySpec = $part;
            elseif ($slot === 'forced_induction_secondary') $secondarySpec = $part;
            elseif ($slot === 'forced_induction_factory_upgrade') $factoryUpgradeSpec = $part;
            elseif ($slot === 'nitrous') $nitrousSpec = $part;
        }

        $primaryMeta = $primarySpec ? self::forcedInductionMeta($primarySpec) : null;
        $secondaryMeta = $secondarySpec ? self::forcedInductionMeta($secondarySpec) : null;
        $factoryUpgradeMeta = $factoryUpgradeSpec ? self::forcedInductionMeta($factoryUpgradeSpec) : null;
        $nitrousMeta = $nitrousSpec ? self::forcedInductionMeta($nitrousSpec) : null;
        $primaryOverride = self::normalizeFiSystem($primaryMeta['system'] ?? null);
        $primarySystem = $primaryOverride ?: $factorySystem;
        $secondarySystem = self::normalizeFiSystem($secondaryMeta['system'] ?? null);
        $systems = array_values(array_unique(array_filter([$primarySystem, $secondarySystem])));

        return [
            'factorySystem' => $factorySystem,
            'primarySystem' => $primarySystem,
            'primarySource' => $primaryOverride ? 'aftermarket' : ($factorySystem ? 'factory' : null),
            'primaryStep' => $primaryOverride ? max(0, (int)($primaryMeta['step'] ?? 0)) : 0,
            'secondarySystem' => $secondarySystem,
            'factoryUpgradeStep' => max(0, (int)($factoryUpgradeMeta['step'] ?? 0)),
            'nitrousShot' => max(0, (int)($nitrousMeta['shot'] ?? 0)),
            'nitrousStep' => max(0, (int)($nitrousMeta['step'] ?? 0)),
            'systems' => $systems,
        ];
    }

    private static function forcedInductionCompatibility(array $car, array $inventory, array $spec, array $catalog, bool $purchasing): ?string
    {
        $meta = self::forcedInductionMeta($spec);
        if (!$meta) return null;

        $stage = (int)($car['buildStage'] ?? 1);
        $state = self::forcedInductionState($car, $inventory, $catalog);
        $system = self::normalizeFiSystem($meta['system'] ?? null);
        $role = (string)($meta['role'] ?? '');

        if ($stage < 2) return 'Forced Induction unlocks with Street Race Car.';

        if ($role === 'factory_upgrade') {
            if (!$system || $state['factorySystem'] !== $system || $state['primarySource'] !== 'factory') return 'Requires the factory forced-induction system to still be installed.';
            $step = max(1, (int)($meta['step'] ?? 1));
            if ($purchasing && $step !== ((int)$state['factoryUpgradeStep'] + 1)) return 'Complete the previous factory-kit upgrade first.';
            return null;
        }

        if ($role === 'kit') {
            if ($state['primarySource'] === 'factory' && $state['primarySystem'] === $system) return 'The factory forced-induction kit is already the base system.';
            if ($state['primarySource'] === 'aftermarket' && $state['primarySystem'] === $system) return 'That aftermarket forced-induction kit is already installed.';
            if (!empty($state['secondarySystem']) && $stage >= 4) return 'Remove the secondary twin-charge kit before swapping the primary system.';
            return null;
        }

        if ($role === 'kit_upgrade') {
            if ($state['primarySource'] !== 'aftermarket' || $state['primarySystem'] !== $system) return 'Install the matching aftermarket forced-induction kit first.';
            $step = max(1, (int)($meta['step'] ?? 1));
            if ($purchasing && $step !== ((int)$state['primaryStep'] + 1)) return 'Complete the previous kit upgrade first.';
            return null;
        }

        if ($role === 'component') {
            if (!in_array($system, $state['systems'], true)) return 'Requires the matching forced-induction system.';
            return null;
        }

        if ($role === 'twin_kit') {
            $requires = self::normalizeFiSystem($meta['requiresSystem'] ?? null);
            if ($stage < 4) return 'Twin charging unlocks with Full Race Car.';
            if (!$requires || $state['primarySystem'] !== $requires) return 'Requires the opposite system as the primary forced-induction kit.';
            if (!empty($state['secondarySystem'])) return 'A secondary twin-charge system is already installed.';
            if ($state['primarySystem'] === $system) return 'Twin charging needs the opposite forced-induction system.';
            return null;
        }

        if ($role === 'nitrous') {
            $step = max(0, (int)($meta['step'] ?? 0));
            $expected = (int)$state['nitrousStep'] + ((int)$state['nitrousShot'] > 0 ? 1 : 0);
            if ($purchasing && $step !== $expected) return 'Buy the previous NOS fogger size first.';
            return null;
        }

        return null;
    }

    private static function forcedInductionSwapNeeded(array $car, array $inventory, array $spec, array $catalog): bool
    {
        $meta = self::forcedInductionMeta($spec);
        if (!$meta || (string)($meta['role'] ?? '') !== 'kit') return false;
        $state = self::forcedInductionState($car, $inventory, $catalog);
        $system = self::normalizeFiSystem($meta['system'] ?? null);
        return !empty($state['primarySystem']) && $system && $state['primarySystem'] !== $system;
    }

    private static function partStoreAvailable(array $spec): bool
    {
        $lifecycle = is_array($spec['lifecycle'] ?? null) ? $spec['lifecycle'] : [];
        $status = strtolower(trim((string)($lifecycle['status'] ?? 'active')));
        if ($status === 'draft' || $status === 'deprecated' || $status === 'retired') return false;
        if ($status === 'scheduled') {
            $available = trim((string)($lifecycle['availableFrom'] ?? ''));
            if ($available === '') return false;
            $timestamp = strtotime($available);
            return $timestamp !== false && $timestamp <= time();
        }
        return true;
    }

    private static function partCompatibilityReason(array $spec, array $car): ?string
    {
        $compat = is_array($spec['compatibility'] ?? null) ? $spec['compatibility'] : [];
        $engineId = (string)($car['engineId'] ?? $car['factoryEngineId'] ?? '');
        $carId = (string)($car['catalogId'] ?? '');
        $stage = (int)($car['buildStage'] ?? 1);
        $aspiration = strtolower(trim((string)($car['engine']['aspiration'] ?? '')));
        $configuration = strtolower(trim((string)($car['engine']['configuration'] ?? '')));
        $engineTags = array_map(fn($value): string => strtolower(trim((string)$value)), is_array($car['engine']['tags'] ?? null) ? $car['engine']['tags'] : []);

        $engineIds = array_map('strval', is_array($compat['engineIds'] ?? null) ? $compat['engineIds'] : []);
        $carIds = array_map('strval', is_array($compat['carCatalogIds'] ?? null) ? $compat['carCatalogIds'] : []);
        $excludedCars = array_map('strval', is_array($compat['excludeCarCatalogIds'] ?? null) ? $compat['excludeCarCatalogIds'] : []);
        $stages = array_map('intval', is_array($compat['buildStages'] ?? null) ? $compat['buildStages'] : []);
        $aspirations = array_map(fn($value): string => strtolower(trim((string)$value)), is_array($compat['aspiration'] ?? null) ? $compat['aspiration'] : []);
        $configurations = array_map(fn($value): string => strtolower(trim((string)$value)), is_array($compat['engineConfigurations'] ?? null) ? $compat['engineConfigurations'] : []);

        if (in_array($carId, $excludedCars, true)) return 'This part is explicitly blocked for this car.';
        if ($carIds && !in_array($carId, $carIds, true)) return 'This part is not authored for this car.';
        if ($engineIds && !in_array($engineId, $engineIds, true)) return 'This part is not compatible with the installed engine.';
        if ($stages && !in_array($stage, $stages, true)) return 'This part is not compatible with the current Build Type.';
        if ($aspirations && !in_array($aspiration, $aspirations, true)) return 'This part does not match the engine aspiration.';
        if ($configurations && !in_array($configuration, $configurations, true)) return 'This part does not match the engine configuration.';

        foreach ((is_array($compat['tagsRequired'] ?? null) ? $compat['tagsRequired'] : []) as $tag) {
            if (!in_array(strtolower(trim((string)$tag)), $engineTags, true)) return 'Engine tag required: ' . (string)$tag . '.';
        }
        foreach ((is_array($compat['tagsBlocked'] ?? null) ? $compat['tagsBlocked'] : []) as $tag) {
            if (in_array(strtolower(trim((string)$tag)), $engineTags, true)) return 'Blocked engine tag: ' . (string)$tag . '.';
        }
        return null;
    }

    private static function partRuleCompatibilityReason(array $spec, array $installedSpecs): ?string
    {
        $requires = is_array($spec['requires'] ?? null) ? $spec['requires'] : [];
        $conflicts = is_array($spec['conflicts'] ?? null) ? $spec['conflicts'] : [];
        $installedIds = [];
        $installedTags = [];
        foreach ($installedSpecs as $installed) {
            $installedIds[] = (string)($installed['catalogId'] ?? '');
            foreach ((is_array($installed['tags'] ?? null) ? $installed['tags'] : []) as $tag) {
                $installedTags[] = strtolower(trim((string)$tag));
            }
        }

        $anyPartIds = array_map('strval', is_array($requires['anyPartIds'] ?? null) ? $requires['anyPartIds'] : []);
        if ($anyPartIds && !array_intersect($anyPartIds, $installedIds)) {
            return 'Requires one of: ' . implode(', ', $anyPartIds) . '.';
        }
        foreach ((is_array($requires['allTags'] ?? null) ? $requires['allTags'] : []) as $tag) {
            if (!in_array(strtolower(trim((string)$tag)), $installedTags, true)) return 'Requires installed part tag: ' . (string)$tag . '.';
        }
        foreach ((is_array($conflicts['partIds'] ?? null) ? $conflicts['partIds'] : []) as $id) {
            if (in_array((string)$id, $installedIds, true)) return 'Conflicts with installed part: ' . (string)$id . '.';
        }
        foreach ((is_array($conflicts['tags'] ?? null) ? $conflicts['tags'] : []) as $tag) {
            if (in_array(strtolower(trim((string)$tag)), $installedTags, true)) return 'Conflicts with installed part tag: ' . (string)$tag . '.';
        }
        return null;
    }

    private static function requirePartCompatible(array $player, array $car, array $spec, array $catalog, bool $purchasing): void
    {
        $compatibilityReason = self::partCompatibilityReason($spec, $car);
        if ($compatibilityReason !== null) throw new GameException($compatibilityReason);

        $installedSpecs = [];
        foreach (($player['inventory']['parts'] ?? []) as $instance) {
            if ((string)($instance['installedOnCarId'] ?? '') !== (string)($car['carId'] ?? '')) continue;
            $installed = self::findBy($catalog, 'catalogId', (string)($instance['catalogId'] ?? ''));
            if ($installed) $installedSpecs[] = $installed;
        }
        $ruleReason = self::partRuleCompatibilityReason($spec, $installedSpecs);
        if ($ruleReason !== null) throw new GameException($ruleReason);

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

        $currentEngineKit = self::installedEngineKitLevel($player, (string)$car['carId'], $catalog);
        $engineKitLevel = (int)($spec['engineKit']['level'] ?? 0);
        if ($engineKitLevel > 0) {
            if ($purchasing && $engineKitLevel !== $currentEngineKit + 1) {
                throw new GameException('Install Engine Kit ' . ($currentEngineKit + 1) . ' before buying Engine Kit ' . $engineKitLevel . '.');
            }
            if (!$purchasing && $engineKitLevel < $currentEngineKit) {
                throw new GameException('Engine Kits cannot be downgraded.');
            }
        }

        $requiredEngineKit = max(0, (int)($spec['requiredEngineKit'] ?? 0));
        if ($requiredEngineKit > $currentEngineKit) {
            throw new GameException('Requires Engine Kit ' . $requiredEngineKit . ' before this power adder can be used.');
        }

        $reason = self::forcedInductionCompatibility($car, $player['inventory']['parts'] ?? [], $spec, $catalog, $purchasing);
        if ($reason !== null) throw new GameException($reason);
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
        $expiresAt = $now + $refresh;
        $nextReleaseAt = self::nextScheduledReleaseTimestamp($catalog, $now);
        if ($nextReleaseAt !== null) $expiresAt = min($expiresAt, $nextReleaseAt);
        $candidates = array_values(array_filter(
            $catalog,
            fn(array $spec): bool => ($spec['market']['classifieds'] ?? true) !== false && self::isContentReleased($spec)
        ));
        if (!$candidates) {
            return ['generatedAt' => $now, 'expiresAt' => $expiresAt, 'listings' => []];
        }

        $makeListing = function (array $spec, bool $starterListing = false): array {
            $mileage = $starterListing ? mt_rand(105000, 190000) : mt_rand(2800, 195000);
            $condition = $starterListing ? mt_rand(62, 79) : mt_rand(58, 98);
            $mileageFactor = max(0.46, 1.0 - ($mileage / 330000));
            $conditionFactor = 0.42 + (0.58 * pow($condition / 100.0, 1.7));
            $price = (int)round(((int)$spec['price']) * $mileageFactor * $conditionFactor / 50) * 50;
            if ($starterListing) {
                $price = min(8500, max(2500, (int)round(($price * 0.82) / 50) * 50));
            }
            $price = max(1200, $price);

            return [
                'listingId' => self::id('used'),
                'stockId' => (int)$spec['stockId'],
                'price' => $price,
                'mileage' => $mileage,
                'condition' => $condition,
                'basePrice' => (int)$spec['price'],
                'mileageFactor' => round($mileageFactor, 3),
                'conditionFactor' => round($conditionFactor, 3),
                'starterListing' => $starterListing,
                'paintColor' => self::randomPaintColor($spec),
            ];
        };

        $starters = array_slice(array_values(array_filter(
            $candidates,
            fn(array $spec): bool => !empty($spec['starter'])
        )), 0, 3);

        $listings = array_map(fn(array $spec): array => $makeListing($spec, true), $starters);
        while (count($listings) < 8) {
            $spec = $candidates[array_rand($candidates)];
            $listings[] = $makeListing($spec, false);
        }

        return ['generatedAt' => $now, 'expiresAt' => $expiresAt, 'listings' => $listings];
    }

    private static function paintPalette(array $spec): array
    {
        $visual = is_array($spec['visual'] ?? null) ? $spec['visual'] : [];
        $palette = is_array($visual['paintPalette'] ?? null) ? $visual['paintPalette'] : [];
        return array_values(array_filter(array_map(
            fn($value): string => trim((string)$value),
            $palette
        ), fn(string $value): bool => (bool)preg_match('/^#[0-9a-f]{6}$/i', $value)));
    }

    private static function firstPaintColor(array $spec): ?string
    {
        $palette = self::paintPalette($spec);
        if ($palette) return (string)$palette[0];
        $visual = is_array($spec['visual'] ?? null) ? $spec['visual'] : [];
        $color = trim((string)($visual['paintColor'] ?? ''));
        return $color !== '' ? $color : null;
    }

    private static function randomPaintColor(array $spec): ?string
    {
        $palette = self::paintPalette($spec);
        if (!$palette) return self::firstPaintColor($spec);
        return (string)$palette[array_rand($palette)];
    }

    private static function withPaintColor(array $visual, ?string $paintColor): array
    {
        $color = trim((string)($paintColor ?? ''));
        if ($color !== '') $visual['paintColor'] = $color;
        return $visual;
    }

    private static function nextScheduledReleaseTimestamp(array $contents, int $now): ?int
    {
        $next = null;
        foreach ($contents as $content) {
            if (!is_array($content)) continue;
            $release = is_array($content['release'] ?? null) ? $content['release'] : null;
            if ($release === null || strtolower(trim((string)($release['mode'] ?? ''))) !== 'scheduled') continue;
            $publishAt = trim((string)($release['publishAt'] ?? ''));
            if ($publishAt === '') continue;
            $timestamp = strtotime($publishAt);
            if ($timestamp === false || $timestamp <= $now) continue;
            if ($next === null || $timestamp < $next) $next = $timestamp;
        }
        return $next;
    }

    private static function isContentReleased(array $content, ?int $now = null): bool
    {
        $release = is_array($content['release'] ?? null) ? $content['release'] : null;
        if ($release === null) return true;

        $mode = strtolower(trim((string)($release['mode'] ?? 'instant')));
        if ($mode === 'draft') return false;
        if ($mode === 'instant') return true;
        if ($mode !== 'scheduled') return true;

        $publishAt = trim((string)($release['publishAt'] ?? ''));
        if ($publishAt === '') return false;
        $timestamp = strtotime($publishAt);
        if ($timestamp === false) return false;
        return $timestamp <= ($now ?? time());
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

    private static function nextOpponentProfile(array $player, array $car, bool $tutorialRace = false): array
    {
        $playerBenchmark = PerformanceIndex::forCar($car, self::racingConfig());
        $playerPi = (int)$playerBenchmark['performanceIndex'];
        $level = max(1, (int)($player['progression']['level'] ?? 1));
        $raceIndex = max(0, (int)($player['stats']['races'] ?? 0));
        $seedText = implode('|', [
            (string)($player['user']['id'] ?? 1),
            (string)($car['carId'] ?? 'car'),
            (string)$raceIndex,
            (string)$playerPi,
            $tutorialRace ? 'tutorial' : 'normal',
        ]);
        $state = (int)sprintf('%u', crc32($seedText));
        $rand = static function () use (&$state): float {
            $state = (int)((($state * 1664525) + 1013904223) & 0xFFFFFFFF);
            return $state / 4294967296.0;
        };
        $targetPi = $tutorialRace
            ? max(0, $playerPi - 32)
            : max(0, $playerPi + (int)round(($rand() * 48) - 24));

        $candidates = array_values(array_filter(
            self::carCatalog(),
            fn(array $spec): bool => !empty($spec['visual']['layered']['layers']['body']['src']) && self::isContentReleased($spec)
        ));
        if (!$tutorialRace) {
            $alternatives = array_values(array_filter(
                $candidates,
                fn(array $spec): bool => (int)($spec['stockId'] ?? 0) !== (int)($car['stockId'] ?? 0)
            ));
            if ($alternatives) $candidates = $alternatives;
        }

        $ranked = [];
        foreach ($candidates as $spec) {
            $benchmark = is_array($spec['benchmark'] ?? null)
                ? $spec['benchmark']
                : PerformanceIndex::benchmark(is_array($spec['base'] ?? null) ? $spec['base'] : [], self::racingConfig());
            $ranked[] = ['spec' => $spec, 'benchmark' => $benchmark, 'delta' => abs((int)($benchmark['performanceIndex'] ?? 0) - $targetPi)];
        }
        usort($ranked, fn(array $a, array $b): int => ($a['delta'] <=> $b['delta']) ?: ((int)($a['spec']['stockId'] ?? 0) <=> (int)($b['spec']['stockId'] ?? 0)));
        $chosen = $ranked[0] ?? ['spec' => self::carCatalog()[0] ?? [], 'benchmark' => ['performanceIndex' => $playerPi]];
        $spec = $chosen['spec'];
        $base = is_array($spec['base'] ?? null) ? $spec['base'] : [];
        $pi = (int)($chosen['benchmark']['performanceIndex'] ?? PerformanceIndex::benchmark($base, self::racingConfig())['performanceIndex']);
        $names = ['Night Shift', 'Redline', 'The Commuter', 'Left Lane', 'Cut Light', 'Sleeper', 'Boost Leak', 'Test Mule'];
        $name = $tutorialRace ? 'Test Mule' : $names[min(count($names) - 1, (int)floor($rand() * count($names)))];
        $opponentLevel = $tutorialRace ? 1 : max(1, $level + (int)round(($pi - $playerPi) / 24));

        return [
            'name' => $name,
            'carName' => trim((string)($spec['displayName'] ?? '')) ?: trim(implode(' ', array_filter([$spec['year'] ?? null, $spec['make'] ?? null, $spec['model'] ?? null]))) ?: 'Opponent',
            'visual' => self::withPaintColor(
                is_array($spec['visual'] ?? null) ? $spec['visual'] : [],
                self::randomPaintColor($spec)
            ),
            'performanceIndex' => $pi,
            'performanceClass' => PerformanceIndex::classFromIndex($pi),
            'drivetrain' => (string)($base['drivetrain'] ?? '-'),
            'buildType' => 'Street Car',
            'level' => $opponentLevel,
            'stockId' => (int)($spec['stockId'] ?? 0),
            'sim' => [
                'hp' => max(1, (int)($base['hp'] ?? 1)),
                'torque' => max(1, (int)($base['torque'] ?? 1)),
                'weight' => max(500, (int)($base['weight'] ?? 500)),
                'grip' => max(0.5, (float)($base['grip'] ?? 1)),
                'drivetrain' => (string)($base['drivetrain'] ?? '-'),
            ],
        ];
    }

    private static function publicOpponentProfile(array $profile): array
    {
        return [
            'name' => (string)($profile['name'] ?? 'Opponent'),
            'carName' => (string)($profile['carName'] ?? 'Opponent'),
            'visual' => is_array($profile['visual'] ?? null) ? $profile['visual'] : [],
            'performanceIndex' => (int)($profile['performanceIndex'] ?? 0),
            'performanceClass' => (string)($profile['performanceClass'] ?? PerformanceIndex::classFromIndex((int)($profile['performanceIndex'] ?? 0))),
            'drivetrain' => (string)($profile['drivetrain'] ?? '-'),
            'buildType' => (string)($profile['buildType'] ?? 'Street Car'),
            'level' => (int)($profile['level'] ?? 1),
        ];
    }



    private static function circuitEntryReason(array $circuit, array $player, array $car): ?string
    {
        $unlocked=array_map(fn($value):string=>strtoupper((string)$value),is_array($player['progression']['unlockedClasses']??null)?$player['progression']['unlockedClasses']:['D']);
        $category=strtolower(trim((string)($circuit['category']??(!empty($circuit['required'])?'progression':'optional'))));
        $required=!empty($circuit['required']);
        $visibility=is_array($circuit['visibility']??null)?$circuit['visibility']:[];
        $hidden=array_key_exists('hiddenUntilUnlocked',$visibility)
            ? !empty($visibility['hiddenUntilUnlocked'])
            : (!$required&&$category==='optional');
        if(!$required&&$category==='optional'&&$hidden){
            $visibilityClasses=array_key_exists('requiresClasses',$visibility)
                ? (is_array($visibility['requiresClasses'])?$visibility['requiresClasses']:[])
                : ['B'];
            foreach($visibilityClasses as $class){
                $class=strtoupper(trim((string)$class));
                if($class!==''&&!in_array($class,$unlocked,true))return 'This optional Circuit has not been revealed yet.';
            }
            foreach((array)($visibility['requiresCircuitIds']??[]) as $requiredId){
                if(empty($player['circuits']['progress'][(string)$requiredId]['completed']))return 'This optional Circuit has not been revealed yet.';
            }
        }

        foreach((array)($circuit['unlock']['requiresClasses']??[]) as $class){
            $class=strtoupper((string)$class);
            if(!in_array($class,$unlocked,true))return 'Unlock class '.$class.' first.';
        }
        foreach((array)($circuit['unlock']['requiresCircuitIds']??[]) as $requiredId){
            if(empty($player['circuits']['progress'][(string)$requiredId]['completed']))return 'Complete '.(string)$requiredId.' first.';
        }
        $rules=is_array($circuit['entryRules']??null)?$circuit['entryRules']:[];
        $pi=(int)($car['performanceIndex']??PerformanceIndex::forCar($car,self::racingConfig())['performanceIndex']);
        $class=strtoupper((string)($car['performanceClass']??PerformanceIndex::classFromIndex($pi)));
        $allowedClasses=array_map(fn($value):string=>strtoupper((string)$value),is_array($rules['allowedClasses']??null)?$rules['allowedClasses']:[]);
        if($allowedClasses&&!in_array($class,$allowedClasses,true))return 'Requires class '.implode('/',$allowedClasses).'; current car is '.$class.'.';
        if(isset($rules['minPerformanceIndex'])&&$rules['minPerformanceIndex']!==null&&$pi<(int)$rules['minPerformanceIndex'])return 'Requires at least PI '.(int)$rules['minPerformanceIndex'].'.';
        if(isset($rules['maxPerformanceIndex'])&&$rules['maxPerformanceIndex']!==null&&$pi>(int)$rules['maxPerformanceIndex'])return 'Maximum PI is '.(int)$rules['maxPerformanceIndex'].'.';
        $buildTypes=array_map('intval',is_array($rules['buildTypes']??null)?$rules['buildTypes']:[]);
        if($buildTypes&&!in_array((int)($car['buildStage']??1),$buildTypes,true))return 'This Build Type is not eligible.';
        $drives=array_map(fn($value):string=>strtoupper((string)$value),is_array($rules['drivetrains']??null)?$rules['drivetrains']:[]);
        $drive=strtoupper((string)($car['base']['drivetrain']??$car['derived']['drivetrain']??''));
        if($drives&&!in_array($drive,$drives,true))return 'Requires drivetrain: '.implode('/',$drives).'.';

        $manufacturers=array_values(array_filter(array_map(fn($value):string=>strtolower(trim((string)$value)),is_array($rules['manufacturers']??null)?$rules['manufacturers']:[])));
        $make=strtolower(trim((string)($car['make']??'')));
        if($manufacturers&&!in_array($make,$manufacturers,true))return 'This manufacturer is not eligible for the event.';

        $aspirations=array_values(array_filter(array_map(fn($value):string=>strtolower(trim((string)$value)),is_array($rules['aspirations']??null)?$rules['aspirations']:[])));
        $aspiration=strtolower(trim((string)($car['engine']['aspiration']??'')));
        if($aspirations&&!in_array($aspiration,$aspirations,true))return 'This aspiration type is not eligible for the event.';

        $configurations=array_values(array_filter(array_map(fn($value):string=>strtolower(trim((string)$value)),is_array($rules['engineConfigurations']??null)?$rules['engineConfigurations']:[])));
        $configuration=strtolower(trim((string)($car['engine']['configuration']??'')));
        if($configurations&&!in_array($configuration,$configurations,true))return 'This engine configuration is not eligible for the event.';

        $allowedCars=array_map('strval',is_array($rules['allowedCarIds']??null)?$rules['allowedCarIds']:[]);
        if($allowedCars&&!in_array((string)($car['catalogId']??''),$allowedCars,true))return 'This car is not eligible for the event.';
        return null;
    }

    private static function circuitWeather(string $name,array $racingConfig): array
    {
        foreach((array)($racingConfig['weather']??[]) as $weather){
            if((string)($weather['name']??'')===$name)return $weather;
        }
        return ['name'=>$name!==''?$name:'Cool & Cloudy','etModifier'=>0,'mphModifier'=>0,'weight'=>1];
    }

    private static function circuitOpponentProfile(array $raceDef,array $racingConfig): array
    {
        $opponent=is_array($raceDef['opponent']??null)?$raceDef['opponent']:[];
        $spec=self::findBy(self::carCatalog(),'catalogId',(string)($opponent['carCatalogId']??''))??[];
        $stats=is_array($opponent['stats']??null)?$opponent['stats']:[];
        $sim=[
            'hp'=>max(1,(float)($stats['hp']??1)),
            'torque'=>max(1,(float)($stats['torque']??1)),
            'weight'=>max(500,(float)($stats['weight']??500)),
            'grip'=>max(.5,(float)($stats['grip']??1)),
            'drivetrain'=>(string)($stats['drivetrain']??$spec['base']['drivetrain']??'-'),
        ];
        $benchmark=PerformanceIndex::benchmark($sim,$racingConfig);
        $visual=is_array($spec['visual']??null)?$spec['visual']:[];
        $paint=trim((string)($opponent['paintColor']??''));
        if($paint!=='')$visual['paintColor']=$paint;
        return [
            'name'=>(string)($opponent['name']??'Opponent'),
            'carName'=>(string)($spec['displayName']??$opponent['carCatalogId']??'Opponent'),
            'visual'=>$visual,
            'performanceIndex'=>(int)$benchmark['performanceIndex'],
            'performanceClass'=>PerformanceIndex::classFromIndex((int)$benchmark['performanceIndex']),
            'drivetrain'=>$sim['drivetrain'],
            'buildType'=>'Build Type '.max(1,(int)($opponent['buildType']??1)),
            'level'=>max(1,(int)($opponent['level']??1)),
            'sim'=>$sim,
        ];
    }

    private static function commitCircuitRaceRecord(array &$player,int $carIndex,array &$race): void
    {
        $car=$player['garage'][$carIndex];
        $distance=(string)($race['distance']??'1/4');
        $playerRun=is_array($race['player']??null)?$race['player']:[];
        $records=is_array($car['raceRecords']??null)?$car['raceRecords']:self::emptyRaceRecords();
        $record=is_array($records[$distance]??null)?$records[$distance]:['races'=>0,'bestEt'=>null,'bestTrap'=>null];
        $record['races']=(int)($record['races']??0)+1;
        $newBest=false;
        if(empty($playerRun['foul'])&&empty($playerRun['dnf'])&&(($record['bestEt']??null)===null||(float)$playerRun['elapsedTime']<(float)$record['bestEt'])){
            $record['bestEt']=(float)$playerRun['elapsedTime'];$newBest=true;
        }
        if(empty($playerRun['dnf'])&&(($record['bestTrap']??null)===null||(float)$playerRun['trapSpeed']>(float)$record['bestTrap']))$record['bestTrap']=(float)$playerRun['trapSpeed'];
        $records[$distance]=$record;
        $player['garage'][$carIndex]['raceRecords']=$records;
        $race['newBest']=$newBest;
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
