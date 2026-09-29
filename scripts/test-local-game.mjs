import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { LocalGameService } from '../assets/js/domain/LocalGameService.js';
import { performanceClassFromIndex } from '../assets/js/domain/PerformanceIndex.js';

const [cars, parts, config, buildStageConfig, racingConfig] = await Promise.all([
  fs.readFile(new URL('../data/catalog/cars.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/catalog/parts.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/game.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/build-stages.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/racing.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const game = new LocalGameService({ cars, parts, config, buildStages: buildStageConfig.stages, racingConfig });
assert.equal(buildStageConfig.stages[0].name, 'Street Car');
assert.equal(buildStageConfig.stages[1].name, 'Street Race Car');
assert.equal(buildStageConfig.stages[2].name, 'Front-Half Race Car');
assert.equal(buildStageConfig.stages[3].name, 'Full Race Car');
assert.equal(performanceClassFromIndex(0), 'D');
assert.equal(performanceClassFromIndex(449), 'D');
assert.equal(performanceClassFromIndex(450), 'C');
assert.equal(performanceClassFromIndex(600), 'B');
assert.equal(performanceClassFromIndex(750), 'A');
assert.equal(performanceClassFromIndex(900), 'S');
assert.equal(performanceClassFromIndex(1099), 'S');
assert.equal(performanceClassFromIndex(1100), 'X');
let player = game.defaultPlayer();

assert.equal(player.wallet.credits, 75000);
assert.equal(player.tutorial.step, 'welcome');
assert.equal(player.garage.length, 0);

player = game.tutorialAdvance(player, 'welcome_complete');
assert.equal(player.tutorial.step, 'buy_first_car');

assert.throws(() => game.purchaseNewCar(player, 1), /Classifieds/i);
const starterLot = game.generateUsedLot();
const starterListings = starterLot.listings.filter((row) => row.starterListing);
assert.equal(starterListings.length, 3);
assert.deepEqual(
  starterListings.map((row) => Number(row.stockId)).sort((a,b) => a-b),
  [1, 2, 3]
);
assert.ok(starterListings.every((row) => {
  const spec = cars.find((car) => Number(car.stockId) === Number(row.stockId));
  return spec?.starter === true && Boolean(spec?.visual?.layered?.layers?.body?.src);
}));
const golfListing = starterListings.find((row) => Number(row.stockId) === 1);
assert.ok(golfListing);
const starterPurchase = game.purchaseUsedCar(player, starterLot, golfListing.listingId);
player = starterPurchase.player;
assert.equal(player.garage.length, 1);
assert.equal(player.garage[0].buildStage, 1);
assert.equal(player.garage[0].catalogId, 'golf_gti');
assert.equal(player.garage[0].displayName, 'Volkswagen Golf GTI Mk6');
assert.equal(player.garage[0].visual.layered.assetId, 'golf_gti');
assert.equal(player.garage[0].visual.layered.layers.body.src, 'assets/art/cars/layered/golf_gti/body.webp');
assert.equal(player.garage[0].visual.layered.layers.wheel.src, 'assets/art/cars/layered/golf_gti/wheel.webp');
assert.equal(player.garage[0].visual.layered.layers.disk.src, 'assets/art/cars/layered/golf_gti/disk.webp');
assert.equal(player.garage[0].visual.layered.layers.detail.src, 'assets/art/cars/layered/golf_gti/detail.webp');
assert.equal(player.garage[0].visual.layered.raceLayers.body.src, 'assets/art/cars/race/golf_gti/body.png');
assert.equal(player.garage[0].visual.layered.raceLayers.wheel.src, 'assets/art/cars/race/golf_gti/wheel.png');
assert.equal(player.garage[0].visual.layered.raceLayers.disk.src, 'assets/art/cars/race/golf_gti/disk.png');
assert.equal(player.garage[0].visual.layered.anchors.frontBumperX, 280);
assert.equal(player.garage[0].visual.layered.anchors.frontWheelCenter.y, 95);
assert.equal(player.garage[0].stockClass, 'D');
assert.equal(player.garage[0].performanceClass, 'D');
assert.ok(player.garage[0].performanceIndex > 0);
assert.ok(player.garage[0].benchmarkEt > 0);
assert.equal(player.selectedCarId, player.garage[0].carId);
assert.equal(player.wallet.credits, 75000 - Number(golfListing.price));
assert.equal(player.tutorial.step, 'visit_garage');
assert.equal(player.garage[0].source, 'used');
assert.ok(player.garage[0].mileage >= 105000);
assert.ok(player.garage[0].condition <= 79);

const legacyPlayer = structuredClone(player);
legacyPlayer.garage[0].visual = { profile: 'compact', color: '#6d9bb8' };
const migratedLegacy = game.normalizePlayer(legacyPlayer);
assert.equal(migratedLegacy.garage[0].visual.layered.assetId, 'golf_gti');
assert.equal(migratedLegacy.garage[0].visual.layered.layers.body.src, 'assets/art/cars/layered/golf_gti/body.webp');
assert.equal(migratedLegacy.garage[0].visual.layered.anchors.frontBumperX, 280);

player = game.tutorialAdvance(player, 'garage_explained');
assert.equal(player.tutorial.step, 'buy_first_upgrade');

assert.throws(() => game.purchasePart(player, 's1_exhaust_1'), /Stage 1 Intake/i);
player = game.purchasePart(player, 's1_intake_1');
assert.equal(player.tutorial.step, 'install_first_upgrade');
let intake1 = player.inventory.parts.find((row) => row.catalogId === 's1_intake_1');
assert.equal(intake1.purchasedForCarId, player.selectedCarId);
player = game.installPart(player, intake1.inventoryId, player.selectedCarId);
assert.equal(player.garage[0].derived.hp, 203);
assert.equal(player.tutorial.step, 'first_race');
assert.ok(player.garage[0].performanceIndex > 0);
assert.equal(player.garage[0].performanceClass, 'D');

const firstPreview = game.quickRacePreview(player);
assert.equal(firstPreview.opponent.name, 'Test Mule');
assert.ok(firstPreview.performanceIndex > 0);
assert.ok(firstPreview.benchmarkEt > 0);
assert.ok(firstPreview.opponent.performanceIndex > 0);
assert.equal(firstPreview.opponent.performanceClass, 'D');
assert.ok(firstPreview.opponent.visual?.layered?.layers?.body?.src);
assert.equal('hp' in firstPreview.opponent, false);
assert.equal('torque' in firstPreview.opponent, false);
assert.equal('weight' in firstPreview.opponent, false);

const firstStart = game.startQuickRace(player, '1/4', 1_000_000);
player = firstStart.player;
assert.ok(player.activeRace);
assert.equal(firstStart.activeRace.distance, '1/4');
assert.equal(firstStart.activeRace.race.distanceLabel, '1/4 Mile');
assert.equal(firstStart.activeRace.race.distanceFeet, 1320);
assert.equal(firstStart.activeRace.race.playerDrivetrain, 'FWD');
assert.equal(firstStart.activeRace.race.location?.name, 'Local Test & Tune');
assert.equal(firstStart.activeRace.race.weather?.name, 'Cool & Cloudy');
assert.ok(firstStart.activeRace.race.player?.trapSpeed > 0);
assert.ok(firstStart.activeRace.race.player?.traction?.gripLoss > 0);
assert.ok(firstStart.activeRace.race.player?.traction?.wheelSlip > 0);
assert.ok(firstStart.activeRace.race.player?.traction?.smokeLevel > 0);
assert.equal(firstStart.activeRace.race.player?.foul, false);
assert.equal(firstStart.activeRace.race.opponent?.foul, false);
assert.ok(Number(firstStart.activeRace.race.opponent?.traction?.gripLoss) >= 0);
assert.equal(firstStart.activeRace.race.won, true);
assert.equal(firstStart.activeRace.race.opponent?.name, firstPreview.opponent.name);
assert.equal(firstStart.activeRace.race.opponent?.carName, firstPreview.opponent.carName);
assert.equal(firstStart.activeRace.race.playerPerformanceClass, 'D');
assert.equal(firstStart.activeRace.race.opponent?.performanceIndex, firstPreview.opponent.performanceIndex);
assert.equal(firstStart.activeRace.race.opponent?.performanceClass, firstPreview.opponent.performanceClass);
assert.ok(firstStart.activeRace.race.playerVisual?.layered?.layers?.body?.src);
assert.ok(firstStart.activeRace.race.opponent?.visual?.layered?.layers?.body?.src);
assert.equal('hp' in firstStart.activeRace.race.opponent, false);
assert.equal('torque' in firstStart.activeRace.race.opponent, false);
assert.equal('weight' in firstStart.activeRace.race.opponent, false);
assert.equal(player.stats.races, 0);
assert.equal(player.progression.exp, 0);
assert.equal(player.raceHistory.length, 0);
assert.equal(player.tutorial.step, 'first_race');

const duplicateStart = game.startQuickRace(player, '1/2', 1_000_001);
player = duplicateStart.player;
assert.equal(duplicateStart.activeRace.raceId, firstStart.activeRace.raceId);
assert.equal(duplicateStart.activeRace.distance, '1/4');
assert.equal(player.stats.races, 0);
assert.throws(
  () => game.finishQuickRace(player, firstStart.activeRace.raceId, Math.floor(firstStart.activeRace.finishAt) - 1),
  /still in progress/i
);

const firstRace = game.finishQuickRace(player, firstStart.activeRace.raceId, Math.ceil(firstStart.activeRace.finishAt) + 1);
player = firstRace.player;
assert.equal(player.activeRace, null);
assert.equal(player.stats.races, 1);
assert.equal(player.tutorial.status, 'complete');
assert.equal(player.tutorial.step, 'complete');
assert.ok(player.progression.rep >= 27);
assert.ok(player.progression.exp > 0);
assert.ok(firstRace.race.reward > 0);
assert.equal(firstRace.race.distance, '1/4');
assert.equal(firstRace.race.player?.foul, false);
assert.equal(firstRace.race.won, true);
assert.equal(player.raceHistory.length, 1);
assert.equal(player.garage[0].raceRecords['1/4'].races, 1);

const firstHistoryCount = player.raceHistory.length;
const idempotentFinish = game.finishQuickRace(player, firstStart.activeRace.raceId, Math.ceil(firstStart.activeRace.finishAt) + 2);
player = idempotentFinish.player;
assert.equal(player.raceHistory.length, firstHistoryCount);
assert.equal(player.stats.races, 1);

assert.throws(() => game.startQuickRace(player, '1/2', 2_000_000), /Level 5/i);
assert.throws(() => game.startQuickRace(player, '1', 2_000_000), /Level 10/i);

player.progression.exp = 3000;
player = game.normalizePlayer(player);
assert.ok(player.progression.level >= 5);
const halfStart = game.startQuickRace(player, '1/2', 2_000_000);
player = halfStart.player;
assert.equal(halfStart.activeRace.distance, '1/2');
assert.equal(player.stats.races, 1);
const halfRace = game.finishQuickRace(player, halfStart.activeRace.raceId, Math.ceil(halfStart.activeRace.finishAt) + 1);
player = halfRace.player;
assert.equal(halfRace.race.distance, '1/2');
assert.ok(halfRace.race.player.elapsedTime >= Number(racingConfig.distances['1/2'].minEt));

assert.throws(() => game.startQuickRace(player, '1', 3_000_000), /Level 10/i);
player.progression.exp = 6000;
player = game.normalizePlayer(player);
assert.ok(player.progression.level >= 10);
const mileStart = game.startQuickRace(player, '1', 3_000_000);
player = mileStart.player;
assert.equal(mileStart.activeRace.distance, '1');
const mileRace = game.finishQuickRace(player, mileStart.activeRace.raceId, Math.ceil(mileStart.activeRace.finishAt) + 1);
player = mileRace.player;
assert.equal(mileRace.race.distance, '1');
assert.ok(mileRace.race.player.elapsedTime >= Number(racingConfig.distances['1'].minEt));
assert.equal(player.raceHistory.length, 3);
assert.equal(player.garage[0].raceRecords['1/4'].races, 1);
assert.equal(player.garage[0].raceRecords['1/2'].races, 1);
assert.equal(player.garage[0].raceRecords['1'].races, 1);

player = game.purchasePart(player, 's1_intake_2');
let intake2 = player.inventory.parts.find((row) => row.catalogId === 's1_intake_2');
player = game.installPart(player, intake2.inventoryId, player.selectedCarId);
assert.throws(() => game.installPart(player, intake1.inventoryId, player.selectedCarId), /cannot be downgraded/i);

const categories = ['intake', 'exhaust', 'ecu', 'fuel', 'drivetrain', 'suspension', 'tires', 'weight'];
for (const category of categories) {
  const installed = player.inventory.parts
    .filter((row) => row.installedOnCarId === player.selectedCarId)
    .map((row) => parts.find((part) => part.catalogId === row.catalogId))
    .filter((row) => row?.categoryKey === category);
  let tier = installed.reduce((max, row) => Math.max(max, Number(row.simpleTier || 0)), 0);
  while (tier < 3) {
    tier += 1;
    const catalogId = `s1_${category}_${tier}`;
    if (!player.inventory.parts.some((row) => row.catalogId === catalogId)) {
      player = game.purchasePart(player, catalogId);
    }
    const instance = player.inventory.parts.find((row) => row.catalogId === catalogId);
    player = game.installPart(player, instance.inventoryId, player.selectedCarId);
  }
}

const beforeStageUp = { ...player.garage[0].derived };
player = game.stageUp(player, player.selectedCarId);
assert.equal(player.garage[0].buildStage, 2);
assert.deepEqual(player.garage[0].derived, beforeStageUp);
assert.ok(player.inventory.parts.filter((row) => row.installedOnCarId === player.selectedCarId)
  .every((row) => !parts.find((part) => part.catalogId === row.catalogId)?.simpleTier));

player = game.purchasePart(player, 's2_intake_01');
const choicePart = player.inventory.parts.find((row) => row.catalogId === 's2_intake_01');
player = game.installPart(player, choicePart.inventoryId, player.selectedCarId);
assert.ok(player.garage[0].derived.hp > beforeStageUp.hp);

const lot = game.generateUsedLot();
assert.ok(lot.listings.length >= 4);
assert.ok(lot.expiresAt > lot.generatedAt);
assert.ok(lot.listings.every((row) => row.basePrice > 0 && row.conditionFactor > 0 && row.mileageFactor > 0));
assert.ok(lot.listings.every((row) => row.price <= row.basePrice));
assert.ok(lot.listings.every((row) => cars.some((car) => Number(car.stockId) === Number(row.stockId) && car.market?.classifieds !== false)));

player = game.roguelikeStart(player);
assert.ok(player.roguelike.activeRun);
const step = game.roguelikeStep(player, 'safe');
assert.ok(step.step && typeof step.step.won === 'boolean');

console.log('V0.4H.2 layered race wheels + grip telemetry local game flow test passed.');
