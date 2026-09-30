import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { LocalGameService } from '../assets/js/domain/LocalGameService.js';
import { RaceSimulator } from '../assets/js/domain/RaceSimulator.js';
import { benchmarkPerformance, performanceClassFromIndex, performanceClassRank, performanceClassThreshold } from '../assets/js/domain/PerformanceIndex.js';
import { applyPartEffects, partCompatibility, partStoreAvailable } from '../assets/js/domain/PartCatalog.js';
import { applyBuildPartEffect, enginePowerEnvelope, limitEngineOutput, suggestedPowerLimits } from '../assets/js/domain/PowerModel.js';
import { baseMapProfile, defaultTuneProfile, evaluateTune, tuningFingerprint, tuningHardwareProfile } from '../assets/js/domain/Tuning.js';
import { CHASSIS_BOUND_CATEGORIES, engineSwapEligible, engineSwapQuote, isEngineBoundPart } from '../assets/js/domain/EngineSwap.js';
import { projectPartChange } from '../assets/js/domain/PartProjection.js';
import { CIRCUIT_SCHEMA_VERSION, circuitEntryStatus, circuitVisibleToPlayer, normalizeCircuitDefinition } from '../assets/js/domain/CircuitCatalog.js';

const [cars, parts, engines, circuits, config, buildStageConfig, racingConfig] = await Promise.all([
  fs.readFile(new URL('../data/catalog/cars.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/catalog/parts.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/catalog/engines.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/catalog/circuits.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/game.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/build-stages.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/racing.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const game = new LocalGameService({ cars, parts, engines, circuits, config, buildStages: buildStageConfig.stages, racingConfig });
const compatibilityFixture = {
  catalogId: 'test_engine_specific_part',
  compatibility: { engineIds: ['vw_ea888_20t_200'], buildStages: [2,3,4] },
  lifecycle: { status: 'active' },
  effects: [{ stat: 'hp', op: 'add', value: 25 }, { stat: 'weight', op: 'add', value: 5 }],
};
assert.equal(partCompatibility(compatibilityFixture, { engineId: 'vw_ea888_20t_200', buildStage: 2, engine: {} }).ok, true);
assert.equal(partCompatibility(compatibilityFixture, { engineId: 'mazda_13b_msp_238', buildStage: 2, engine: {} }).ok, false);
assert.equal(partStoreAvailable({ lifecycle: { status: 'deprecated' } }), false);
assert.equal(partStoreAvailable({ lifecycle: { status: 'retired' } }), false);
assert.equal(partStoreAvailable({ lifecycle: { status: 'active' } }), true);
assert.deepEqual(applyPartEffects({ hp: 200, torque: 180, weight: 3000, grip: 1 }, compatibilityFixture.effects), { hp: 225, torque: 180, weight: 3005, grip: 1 });

const deepRx8 = cars.find((car) => car.catalogId === 'mazda_rx8');
assert.ok(deepRx8);
const stageOneMaxIds = [
  's1_intake_3','s1_exhaust_3','s1_ecu_3','s1_fuel_3',
  's1_drivetrain_3','s1_suspension_3','s1_tires_3','s1_weight_3',
];
const lowEightBuildIds = [
  's2_intake_01','s2_exhaust_03','s4_ecu_standalone','s2_fuel_08','s2_drivetrain_09',
  's3_suspension_drag','s4_tires_pro_radial','s2_weight_14','s3_engine_kit_3','s2_fi_turbo_upgrade_3',
  's4_intake_sheetmetal','s4_intake_throttle','s3_intake_airbox',
  's4_exhaust_header','s4_exhaust_4in','s3_exhaust_side_exit',
  's4_fuel_injectors_1700','s4_fuel_dual_pump','s4_fuel_return','s3_fuel_flex_sensor',
  's3_ecu_afc','s4_ecu_boost_by_gear','s4_ecu_race_launch',
  's4_drivetrain_clutch','s4_drivetrain_flywheel','s4_drivetrain_sequential','s4_drivetrain_spool',
  's3_suspension_arms','s4_suspension_front','s4_suspension_rear',
  's3_weight_lexan','s4_weight_full_chassis',
  's3_fi_turbo_intercooler','s3_fi_turbo_upgrade','s3_fi_turbo_piping',
];
const partFor = (id) => {
  const part = parts.find((row) => row.catalogId === id);
  assert.ok(part, `Missing balance part: ${id}`);
  return part;
};
const applyBuildParts = (base, ids) => {
  const stats = {
    hp: Number(base.hp || 1),
    torque: Number(base.torque || 1),
    weight: Number(base.weight || 500),
    grip: Number(base.grip || 1),
  };
  const specs = ids.map(partFor);
  for (const part of specs) {
    for (const effect of part.effects || []) applyBuildPartEffect(stats, effect, part);
  }
  return {
    stats: {
      hp: Math.round(stats.hp),
      torque: Math.round(stats.torque),
      weight: Math.round(stats.weight),
      grip: Math.round(stats.grip * 1000) / 1000,
    },
    specs,
  };
};
const stageOneBuild = applyBuildParts(deepRx8.base, stageOneMaxIds);
const rx8StageBaseline = stageOneBuild.stats;
const deepBuild = applyBuildParts(rx8StageBaseline, lowEightBuildIds);
const rx8Kit3Envelope = enginePowerEnvelope({ ...deepRx8, buildStage: 4 }, deepBuild.specs);
const rx8LimitedBuild = limitEngineOutput(deepBuild.stats, rx8Kit3Envelope);
const rx8LowEightStats = {
  hp: rx8LimitedBuild.hp,
  torque: rx8LimitedBuild.torque,
  weight: deepBuild.stats.weight,
  grip: deepBuild.stats.grip,
  drivetrain: 'RWD',
};

assert.equal(rx8Kit3Envelope.capacityHp, 930);
assert.ok(rx8LowEightStats.hp >= 600 && rx8LowEightStats.hp < 900,
  `Support-part scaling should stop the old multiplicative RX-8 build from jumping straight to four-digit power; got ${rx8LowEightStats.hp} hp.`);

const rx8Kit4 = partFor('s4_engine_kit_4');
const rx8MaxEnvelope = enginePowerEnvelope({ ...deepRx8, buildStage: 4 }, [rx8Kit4]);
assert.equal(rx8MaxEnvelope.capacityHp, 1100);
const impossibleRx8 = limitEngineOutput({ hp: 2400, torque: 1600, weight: 2500, grip: 2 }, rx8MaxEnvelope);
assert.ok(impossibleRx8.hp >= 1050 && impossibleRx8.hp <= 1100,
  `A 2400-hp Renesis request should compress into the ~1100-hp max-effort envelope; got ${impossibleRx8.hp} hp.`);
assert.equal(impossibleRx8.powerLimit.hpLimited, true);

const bigV8Limits = suggestedPowerLimits({ displacementLiters: 5, configuration: 'V8', aspiration: 'Naturally Aspirated', peakHp: 480 }, 480);
assert.ok(bigV8Limits.kit4Hp >= 1500 && bigV8Limits.kit4Hp > rx8MaxEnvelope.capacityHp,
  'Larger engines need materially higher fallback power envelopes than the Renesis.');

const rx8MaxEffortBenchmark = benchmarkPerformance({
  hp: 1080, torque: 700, weight: 2350, grip: 2.2, drivetrain: 'RWD',
}, racingConfig);
assert.ok(rx8MaxEffortBenchmark.quarterMileEt >= 7.5 && rx8MaxEffortBenchmark.quarterMileEt <= 8.6,
  `A max-effort ~1100-hp lightweight RX-8 should still be capable of the low-8-second neighborhood; got ${rx8MaxEffortBenchmark.quarterMileEt}s.`);


const tuningCar = {
  ...structuredClone(deepRx8),
  carId: 'tuning-rx8-a',
  buildStage: 4,
  stageBaseline: rx8StageBaseline,
  derived: { ...rx8LowEightStats },
  untunedDerived: { ...rx8LowEightStats },
};
const tuningSpecs = lowEightBuildIds.map((id) => parts.find((part) => part.catalogId === id)).filter(Boolean);
const tuningHardware = tuningHardwareProfile(tuningCar, tuningSpecs);
assert.equal(tuningHardware.unlocked, true);
assert.equal(tuningHardware.boosted, true);
assert.ok(tuningHardware.maxBoostPsi > tuningHardware.baseBoostPsi);

const safeTune = defaultTuneProfile(tuningCar, tuningHardware);
const safeEval = evaluateTune(tuningCar, rx8LowEightStats, safeTune, tuningHardware);
assert.ok(safeEval.derived.hp > 0);
assert.equal(safeEval.race.active, true);
assert.ok(safeEval.diagnostics.stabilityPct >= 60);

const boostTune = {
  ...safeTune,
  boostPsi: Math.min(tuningHardware.safeBoostPsi + 1, tuningHardware.maxBoostPsi),
  fuelTrimPct: 4,
  ignitionAdvanceDeg: 0,
  boostByGear: [100,100,100,100,100,100],
};
const boostEval = evaluateTune(tuningCar, rx8LowEightStats, boostTune, tuningHardware);
assert.notEqual(boostEval.derived.hp, safeEval.derived.hp);

const tractionTune = { ...boostTune, boostByGear: [55,70,90,100,100,100] };
const tractionEval = evaluateTune(tuningCar, rx8LowEightStats, tractionTune, tuningHardware);
const fullBoostBenchmark = benchmarkPerformance({ ...boostEval.derived, tuning: boostEval.race }, racingConfig);
const tractionBenchmark = benchmarkPerformance({ ...tractionEval.derived, tuning: tractionEval.race }, racingConfig);
assert.notEqual(fullBoostBenchmark.quarterMileEt, tractionBenchmark.quarterMileEt,
  'Boost-by-gear must materially affect simulated ET.');

const tuningCarB = { ...structuredClone(tuningCar), carId: 'tuning-rx8-b' };
assert.notDeepEqual(tuningFingerprint(tuningCar), tuningFingerprint(tuningCarB),
  'Owned cars need unique calibration fingerprints.');
const otherEval = evaluateTune(tuningCarB, rx8LowEightStats, boostTune, tuningHardwareProfile(tuningCarB, tuningSpecs));
assert.ok(otherEval.derived.hp !== boostEval.derived.hp || otherEval.diagnostics.riskPct !== boostEval.diagnostics.riskPct,
  'The same shared tune should not evaluate identically on every owned car.');

const tuningSpecsKit4 = tuningSpecs
  .filter((part) => part.catalogId !== 's3_engine_kit_3')
  .concat([rx8Kit4]);
const maxEffortCar = {
  ...structuredClone(tuningCar),
  carId: 'tuning-rx8-max',
  untunedDerived: { hp: 1066, torque: 650, weight: 2450, grip: 2.1, drivetrain: 'RWD' },
  derived: { hp: 1066, torque: 650, weight: 2450, grip: 2.1, drivetrain: 'RWD' },
};
const maxHardware = tuningHardwareProfile(maxEffortCar, tuningSpecsKit4);
assert.equal(maxHardware.powerEnvelope.capacityHp, 1100);

const baseMap = baseMapProfile(maxEffortCar, maxEffortCar.untunedDerived, maxHardware);
const baseMapEval = evaluateTune(maxEffortCar, maxEffortCar.untunedDerived, baseMap, maxHardware);
assert.equal(baseMapEval.diagnostics.powerState, 'HEADROOM');
assert.equal(baseMapEval.diagnostics.fuelState, 'IN RANGE');
assert.equal(baseMapEval.diagnostics.timingState, 'IN RANGE');
assert.equal(baseMapEval.diagnostics.tireState, 'DIALED IN');
assert.equal(baseMapEval.diagnostics.launchState, 'CLOSE');
assert.equal(baseMapEval.diagnostics.shiftState, 'CLOSE');
assert.ok(baseMapEval.diagnostics.riskPct <= 20);
assert.equal(baseMapEval.diagnostics.failureChancePct, 0);
assert.ok(baseMapEval.derived.hp < maxEffortCar.untunedDerived.hp,
  'BASE MAP should deliberately give up some peak power for a safe starting calibration.');

const lowPsiEval = evaluateTune(maxEffortCar, maxEffortCar.untunedDerived, { ...baseMap, tirePsiRear: 13 }, maxHardware);
assert.equal(lowPsiEval.diagnostics.powerState, baseMapEval.diagnostics.powerState,
  'Tire PSI must never decide whether the engine is engine-limited.');
assert.equal(lowPsiEval.diagnostics.powerLimit.rawHp, baseMapEval.diagnostics.powerLimit.rawHp,
  'Tire PSI must not change the ECU raw horsepower request.');
assert.equal(lowPsiEval.diagnostics.engineLoadPct, baseMapEval.diagnostics.engineLoadPct);

const dangerousTune = {
  ...baseMap,
  boostPsi: maxHardware.maxBoostPsi,
  fuelTrimPct: -10,
  ignitionAdvanceDeg: 7,
  boostByGear: [100,100,100,100,100,100],
};
const dangerousEval = evaluateTune(maxEffortCar, maxEffortCar.untunedDerived, dangerousTune, maxHardware);
assert.ok(dangerousEval.diagnostics.riskPct >= 50);
assert.ok(dangerousEval.diagnostics.failureChancePct > 0);

const failureSimulator = new RaceSimulator(racingConfig, () => 0);
const failurePass = failureSimulator.simulate({
  hp: dangerousEval.derived.hp,
  torque: dangerousEval.derived.torque,
  weight: dangerousEval.derived.weight,
  grip: dangerousEval.derived.grip,
  drivetrain: 'RWD',
  level: 50,
  allowFoul: false,
  tuning: { ...dangerousEval.race, failureChance: 0.25 },
}, '1/4', { name: 'Test', etModifier: 0, mphModifier: 0 });
assert.equal(failurePass.dnf, true);
assert.equal(failurePass.mechanicalFailure, 'ENGINE FAILURE');
assert.equal(failurePass.tuning.catastrophicFailure, true);
assert.equal(failurePass.totalTime, 999);

let failedPlayer = game.defaultPlayer();
failedPlayer.user = { ...failedPlayer.user, username: 'RiskTester' };
failedPlayer.tutorial = { ...failedPlayer.tutorial, status: 'complete', step: 'complete' };
failedPlayer.wallet.credits = 100000;
failedPlayer.garage = [{
  ...structuredClone(maxEffortCar),
  engineCondition: { healthPct: 0, failed: true, failures: 1, lastFailureAt: 1, repairedAt: null },
}];
failedPlayer.selectedCarId = maxEffortCar.carId;
failedPlayer.inventory.parts = tuningSpecsKit4.map((part, index) => ({
  inventoryId: `repair-part-${index}`,
  catalogId: part.catalogId,
  purchasedForCarId: maxEffortCar.carId,
  installedOnCarId: maxEffortCar.carId,
  purchasedAt: 1,
}));
failedPlayer = game.normalizePlayer(failedPlayer);
assert.throws(() => game.quickRacePreview(failedPlayer), /ENGINE FAILED/i);
const rebuildCost = game.engineRepairCost(failedPlayer.garage[0]);
const creditsBeforeRepair = failedPlayer.wallet.credits;
failedPlayer = game.repairEngine(failedPlayer, maxEffortCar.carId);
assert.equal(failedPlayer.garage[0].engineCondition.failed, false);
assert.equal(failedPlayer.garage[0].engineCondition.healthPct, 100);
assert.equal(failedPlayer.wallet.credits, creditsBeforeRepair - rebuildCost);

let tuningPlayer = game.defaultPlayer();
tuningPlayer.tutorial = { ...tuningPlayer.tutorial, status: 'complete', step: 'complete' };
tuningPlayer.garage = [structuredClone(tuningCar)];
tuningPlayer.selectedCarId = tuningCar.carId;
tuningPlayer.inventory.parts = tuningSpecs.map((part, index) => ({
  inventoryId: `tune-part-${index}`,
  catalogId: part.catalogId,
  purchasedForCarId: tuningCar.carId,
  installedOnCarId: tuningCar.carId,
  purchasedAt: 1,
}));
tuningPlayer.garage[0] = game.recalculateCar(tuningPlayer.garage[0], tuningPlayer.inventory.parts);
tuningPlayer = game.saveTune(tuningPlayer, tuningCar.carId, tractionTune);
assert.ok(tuningPlayer.garage[0].tune);
assert.equal(tuningPlayer.garage[0].tuningRuntime?.active, true);
assert.ok(tuningPlayer.garage[0].tuningDiagnostics?.stabilityPct > 0);

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
assert.equal(player.wallet.credits, Number(config.localDevCredits));

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
assert.equal(player.wallet.credits, Number(config.localDevCredits));
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

player = game.purchasePart(player, 's2_fi_supercharger_kit');
const superchargerKit = player.inventory.parts.find((row) => row.catalogId === 's2_fi_supercharger_kit');
player = game.installPart(player, superchargerKit.inventoryId, player.selectedCarId);
assert.throws(() => game.purchasePart(player, 's2_fi_supercharger_upgrade_1'), /Engine Kit 1/i);

player = game.purchasePart(player, 's2_engine_kit_1');
const engineKit1 = player.inventory.parts.find((row) => row.catalogId === 's2_engine_kit_1');
player = game.installPart(player, engineKit1.inventoryId, player.selectedCarId);
assert.ok(player.garage[0].derived.hp > beforeStageUp.hp);
player = game.purchasePart(player, 's2_fi_supercharger_upgrade_1');
const superchargerUpgrade1 = player.inventory.parts.find((row) => row.catalogId === 's2_fi_supercharger_upgrade_1');
player = game.installPart(player, superchargerUpgrade1.inventoryId, player.selectedCarId);
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


// V0.5H.1 Engine Assembly regression
const swapEngines = engines.filter(engineSwapEligible);
assert.equal(swapEngines.length, 3, 'Only fully-authored engines should enter the initial Engine Swap Shop.');
const ea888 = swapEngines.find((engine) => engine.engineId === 'vw_ea888_20t_mk6_gti_200');
const renesis = swapEngines.find((engine) => engine.engineId === 'mazda_13b_msp_renesis_238');
const clioV6 = swapEngines.find((engine) => engine.engineId === 'renault_clio_v6_29_255');
assert.ok(ea888 && renesis && clioV6);

let swapPlayer = game.defaultPlayer();
swapPlayer.user = { ...swapPlayer.user, username: 'SwapTester' };
swapPlayer.wallet.credits = 100000;
swapPlayer.tutorial = { ...swapPlayer.tutorial, status: 'complete', step: 'complete' };
const swapRx8 = game.createOwnedCar(deepRx8, 'used', 120000, 75, 5000);
swapRx8.buildStage = 2;
swapRx8.stageBaseline = { hp: 260, torque: 175, weight: 2850, grip: 1.15 };
swapRx8.tune = { boostPsi: 9, fuelTrimPct: 2, ignitionAdvanceDeg: 0, boostByGear: [70,80,90,100,100,100] };
swapPlayer.garage = [swapRx8];
swapPlayer.selectedCarId = swapRx8.carId;

const engineBoundPart = partFor('s2_intake_01');
const dormantEnginePart = partFor('s4_ecu_standalone');
const chassisTire = partFor('s2_tires_11');
const chassisSuspension = partFor('s2_suspension_coilover');
const chassisWeight = partFor('s2_weight_13');
assert.deepEqual([...CHASSIS_BOUND_CATEGORIES].sort(), ['suspension', 'tires', 'weight']);
for (const spec of [chassisTire, chassisSuspension, chassisWeight]) {
  assert.equal(isEngineBoundPart(spec), false, `${spec.name} must remain chassis-bound.`);
}
swapPlayer.inventory.parts = [
  { inventoryId: 'swap-intake', catalogId: engineBoundPart.catalogId, purchasedForCarId: swapRx8.carId, installedOnCarId: swapRx8.carId, purchasedAt: 1 },
  { inventoryId: 'swap-ecu', catalogId: dormantEnginePart.catalogId, purchasedForCarId: swapRx8.carId, installedOnCarId: swapRx8.carId, purchasedAt: 1 },
  { inventoryId: 'swap-tire', catalogId: chassisTire.catalogId, purchasedForCarId: swapRx8.carId, installedOnCarId: swapRx8.carId, purchasedAt: 1 },
  { inventoryId: 'swap-suspension', catalogId: chassisSuspension.catalogId, purchasedForCarId: swapRx8.carId, installedOnCarId: swapRx8.carId, purchasedAt: 1 },
  { inventoryId: 'swap-weight', catalogId: chassisWeight.catalogId, purchasedForCarId: swapRx8.carId, installedOnCarId: swapRx8.carId, purchasedAt: 1 },
];
swapPlayer = game.normalizePlayer(swapPlayer);

let initialRx8 = swapPlayer.garage[0];
let initialAssembly = swapPlayer.inventory.engines.find((item) => item.installedOnCarId === swapRx8.carId);
assert.ok(initialAssembly);
assert.equal(initialAssembly.engineId, renesis.engineId);
assert.ok(initialAssembly.attachedPartInventoryIds.includes('swap-intake'));
assert.ok(initialAssembly.attachedPartInventoryIds.includes('swap-ecu'));
assert.equal(swapPlayer.inventory.parts.find((part) => part.inventoryId === 'swap-ecu').installedOnCarId, null,
  'Stage 4 engine hardware should stay attached but dormant on a Stage 2 chassis.');

for (const id of ['swap-tire', 'swap-suspension', 'swap-weight']) {
  const item = swapPlayer.inventory.parts.find((part) => part.inventoryId === id);
  assert.equal(item.installedOnEngineInventoryId, null, `${id} must start chassis-only.`);
  item.installedOnEngineInventoryId = initialAssembly.inventoryId;
  initialAssembly.attachedPartInventoryIds.push(id);
}
swapPlayer = game.normalizePlayer(swapPlayer);
initialRx8 = swapPlayer.garage[0];
initialAssembly = swapPlayer.inventory.engines.find((item) => item.installedOnCarId === swapRx8.carId);
for (const id of ['swap-tire', 'swap-suspension', 'swap-weight']) {
  const item = swapPlayer.inventory.parts.find((part) => part.inventoryId === id);
  assert.equal(item.installedOnEngineInventoryId, null, `${id} must be scrubbed from stale engine links.`);
  assert.equal(item.installedOnCarId, swapRx8.carId, `${id} must remain installed on the chassis.`);
  assert.equal(initialAssembly.attachedPartInventoryIds.includes(id), false, `${id} must not live in the engine assembly.`);
}

const eaQuote = engineSwapQuote(initialRx8, ea888, swapPlayer.inventory.engines);
assert.equal(eaQuote.fitment.fitment, 'CUSTOM');
assert.equal(eaQuote.fitment.minBuildStage, 2);
assert.equal(eaQuote.enginePrice, 8500);
assert.equal(eaQuote.installCost, 7000);
assert.equal(eaQuote.totalCost, 15500);

const swapCreditsBefore = swapPlayer.wallet.credits;
swapPlayer = game.swapEngine(swapPlayer, swapRx8.carId, ea888.engineId);
const swappedRx8 = swapPlayer.garage[0];
assert.equal(swappedRx8.engineId, ea888.engineId);
assert.equal(swappedRx8.engine.peakHp, 200);
assert.equal(swappedRx8.base.hp, 200);
assert.equal(swappedRx8.stageBaseline.hp, 200);
assert.equal(swappedRx8.stageBaseline.torque, 207);
assert.equal(swappedRx8.buildStage, 2, 'Engine swaps must not downgrade the chassis Build Type.');
assert.equal(swappedRx8.stageBaseline.weight, 2850, 'Chassis weight baseline must survive an engine swap.');
assert.equal(swappedRx8.stageBaseline.grip, 1.15, 'Chassis grip baseline must survive an engine swap.');
assert.equal(swapPlayer.wallet.credits, swapCreditsBefore - 15500);
assert.equal(swapPlayer.inventory.parts.find((part) => part.inventoryId === 'swap-intake').installedOnCarId, null);
for (const id of ['swap-tire', 'swap-suspension', 'swap-weight']) {
  const item = swapPlayer.inventory.parts.find((part) => part.inventoryId === id);
  assert.equal(item.installedOnCarId, swapRx8.carId, `${id} must stay on the RX-8 through the engine swap.`);
  assert.equal(item.installedOnEngineInventoryId, null, `${id} must never transfer with an engine.`);
}

const storedRenesis = swapPlayer.inventory.engines.find((item) => item.engineId === renesis.engineId && !item.installedOnCarId);
assert.ok(storedRenesis, 'The removed Renesis should remain as a detached engine assembly.');
assert.ok(storedRenesis.attachedPartInventoryIds.includes('swap-intake'));
assert.ok(storedRenesis.attachedPartInventoryIds.includes('swap-ecu'));
for (const id of ['swap-tire', 'swap-suspension', 'swap-weight']) {
  assert.equal(storedRenesis.attachedPartInventoryIds.includes(id), false, `${id} must not be stored with the Renesis.`);
}
assert.equal(storedRenesis.tune, null, 'Removing an engine must clear its active ECU calibration.');
assert.ok(Number(storedRenesis.storedStats?.hp || 0) > 0);

const installedEa888 = swapPlayer.inventory.engines.find((item) => item.engineId === ea888.engineId && item.installedOnCarId === swapRx8.carId);
assert.ok(installedEa888);
assert.equal(installedEa888.attachedPartInventoryIds.length, 0);

const renesisOwnedQuote = engineSwapQuote(swappedRx8, renesis, swapPlayer.inventory.engines);
assert.equal(renesisOwnedQuote.enginePrice, 0);
assert.equal(renesisOwnedQuote.totalCost, 2500);
const creditsBeforeReturn = swapPlayer.wallet.credits;
swapPlayer = game.swapEngine(swapPlayer, swapRx8.carId, renesis.engineId);
const returnedRx8 = swapPlayer.garage[0];
assert.equal(returnedRx8.engineId, renesis.engineId);
assert.equal(returnedRx8.buildStage, 2, 'Returning an owned engine must keep the chassis Build Type.');
assert.equal(swapPlayer.wallet.credits, creditsBeforeReturn - 2500);
assert.equal(swapPlayer.inventory.parts.find((part) => part.inventoryId === 'swap-intake').installedOnCarId, swapRx8.carId,
  'Stage 2-compatible engine parts should reactivate automatically with their stored engine.');
assert.equal(swapPlayer.inventory.parts.find((part) => part.inventoryId === 'swap-ecu').installedOnCarId, null,
  'Later-stage engine parts should remain dormant after the assembly returns to a Stage 2 chassis.');
assert.equal(returnedRx8.tune, null, 'Reinstalling an owned engine must start with no active calibration.');
assert.ok(swapPlayer.inventory.engines.some((item) => item.engineId === ea888.engineId && !item.installedOnCarId));
assert.ok(swapPlayer.inventory.engines.some((item) => item.engineId === renesis.engineId && item.installedOnCarId === swapRx8.carId));

const promotedSwapPlayer = structuredClone(swapPlayer);
promotedSwapPlayer.garage[0].buildStage = 4;
const normalizedPromoted = game.normalizePlayer(promotedSwapPlayer);
assert.equal(normalizedPromoted.inventory.parts.find((part) => part.inventoryId === 'swap-ecu').installedOnCarId, swapRx8.carId,
  'Dormant assembly hardware should wake up automatically when the chassis reaches the required Build Type.');

let golfSwapPlayer = game.defaultPlayer();
golfSwapPlayer.user = { ...golfSwapPlayer.user, username: 'GolfSwapTester' };
golfSwapPlayer.wallet.credits = 100000;
golfSwapPlayer.tutorial = { ...golfSwapPlayer.tutorial, status: 'complete', step: 'complete' };
const golfSpec = cars.find((car) => car.catalogId === 'golf_gti');
const golfOwned = game.createOwnedCar(golfSpec, 'used', 90000, 80, 7000);
golfOwned.buildStage = 3;
golfOwned.stageBaseline = { hp: 225, torque: 230, weight: 2900, grip: 1.1 };
golfSwapPlayer.garage = [golfOwned];
golfSwapPlayer.selectedCarId = golfOwned.carId;
golfSwapPlayer = game.normalizePlayer(golfSwapPlayer);
assert.throws(() => game.swapEngine(golfSwapPlayer, golfOwned.carId, renesis.engineId), /Build Type 4/i);
assert.throws(() => game.swapEngine(golfSwapPlayer, golfOwned.carId, 'ford_coyote_50'), /not ready/i);

let failedSwapPlayer = structuredClone(swapPlayer);
failedSwapPlayer.garage[0].engineCondition = { healthPct: 0, failed: true, failures: 1, lastFailureAt: 1, repairedAt: null };
failedSwapPlayer = game.normalizePlayer(failedSwapPlayer);
failedSwapPlayer = game.swapEngine(failedSwapPlayer, swapRx8.carId, ea888.engineId);
assert.equal(failedSwapPlayer.garage[0].engineCondition.failed, false, 'A healthy stored EA888 assembly should remain healthy when installed.');
const failedStoredRenesis = failedSwapPlayer.inventory.engines.find((item) => item.engineId === renesis.engineId && !item.installedOnCarId);
assert.equal(failedStoredRenesis.condition.failed, true, 'The failed outgoing Renesis assembly should keep its failure state.');

console.log('V0.5H.1 engine assembly + Stage 2 swap flow test passed.');

// V0.6A Circuit progression regression
assert.equal(circuits.length >= 1, true);
const streetRoots = circuits.find((row) => row.circuitId === 'street_roots_d');
assert.ok(streetRoots);
assert.equal(streetRoots.required, true);
assert.equal(streetRoots.races.length, 5);
assert.equal(streetRoots.races.at(-1).type, 'boss');
assert.equal(streetRoots.completion.unlockClass, 'C');

let circuitPlayer = game.defaultPlayer();
circuitPlayer.user = { ...circuitPlayer.user, username: 'CircuitTester' };
circuitPlayer.wallet.credits = 100000;
circuitPlayer.tutorial = { ...circuitPlayer.tutorial, status: 'complete', step: 'complete' };
const circuitCar = game.createOwnedCar(deepRx8, 'used', 90000, 80, 5000);
circuitPlayer.garage = [circuitCar];
circuitPlayer.selectedCarId = circuitCar.carId;
circuitPlayer = game.normalizePlayer(circuitPlayer);
assert.deepEqual(circuitPlayer.progression.unlockedClasses, ['D']);

circuitPlayer = game.circuitStart(circuitPlayer, 'street_roots_d');
assert.equal(circuitPlayer.circuits.activeRun.circuitId, 'street_roots_d');
assert.equal(circuitPlayer.circuits.activeRun.raceIndex, 0);

let finalCircuitResult = null;
for (let raceIndex = 0; raceIndex < 5; raceIndex += 1) {
  const started = game.startCircuitRace(circuitPlayer, 'street_roots_d', 1000 + (raceIndex * 100));
  circuitPlayer = started.player;
  assert.equal(started.activeRace.origin, 'circuit');
  assert.equal(started.activeRace.race.circuitRaceIndex, raceIndex);
  circuitPlayer.activeRace.finishAt = 0;
  circuitPlayer.activeRace.race.won = true;
  circuitPlayer.activeRace.race.player.foul = false;
  circuitPlayer.activeRace.race.player.dnf = false;
  circuitPlayer.activeRace.race.player.elapsedTime = 14.5 - (raceIndex * 0.1);
  circuitPlayer.activeRace.race.player.trapSpeed = 95 + raceIndex;
  const finished = game.finishCircuitRace(circuitPlayer, started.activeRace.raceId, 999999);
  circuitPlayer = finished.player;
  finalCircuitResult = finished.circuitResult;
  if (raceIndex < 4) assert.equal(circuitPlayer.circuits.activeRun.raceIndex, raceIndex + 1);
}
assert.equal(circuitPlayer.circuits.activeRun, null);
assert.equal(finalCircuitResult.completed, true);
assert.equal(finalCircuitResult.unlockClass, 'C');
assert.ok(circuitPlayer.progression.unlockedClasses.includes('C'));
assert.equal(circuitPlayer.circuits.progress.street_roots_d.completed, true);
console.log('V0.6A Circuit five-race progression + boss unlock test passed.');

// V0.6A.2 Optional Circuit visibility + filter regression
assert.equal(CIRCUIT_SCHEMA_VERSION, 2);
const hiddenOptional = normalizeCircuitDefinition({
  circuitId: 'after_c_hidden_optional',
  name: 'After C Optional',
  category: 'optional',
  required: false,
  repeatable: true,
  entryRules: {
    allowedClasses: [],
    buildTypes: [1,2,3,4],
    manufacturers: ['Mazda'],
    aspirations: ['Naturally Aspirated'],
    engineConfigurations: ['Rotary'],
  },
  races: [structuredClone(streetRoots.races[0])],
});
assert.equal(hiddenOptional.visibility.hiddenUntilUnlocked, true);
assert.deepEqual(hiddenOptional.visibility.requiresClasses, ['B']);
assert.equal(circuitVisibleToPlayer(hiddenOptional, circuitPlayer), false,
  'Optional Circuits should remain invisible after only D/C progression is unlocked.');

const optionalPlayer = structuredClone(circuitPlayer);
optionalPlayer.progression.unlockedClasses.push('B');
assert.equal(circuitVisibleToPlayer(hiddenOptional, optionalPlayer), true,
  'Unlocking B should reveal optionals configured to appear after beating C.');
assert.equal(circuitEntryStatus(hiddenOptional, optionalPlayer, optionalPlayer.garage[0]).ok, true,
  'RX-8 should satisfy Mazda / NA / Rotary optional filters.');

const golfFilterCar = game.createOwnedCar(golfSpec, 'used', 50000, 90, 5000);
assert.equal(circuitEntryStatus(hiddenOptional, optionalPlayer, golfFilterCar).ok, false,
  'Manufacturer / aspiration / engine-configuration filters must reject ineligible cars.');

const optionalGame = new LocalGameService({
  cars, parts, engines, circuits: [...circuits, hiddenOptional],
  config, buildStages: buildStageConfig.stages, racingConfig
});
assert.throws(() => optionalGame.circuitStart(circuitPlayer, hiddenOptional.circuitId), /not been revealed/i,
  'Hidden optional Circuits must not be enterable by ID before their reveal gate.');
const optionalStarted = optionalGame.circuitStart(optionalPlayer, hiddenOptional.circuitId);
assert.equal(optionalStarted.circuits.activeRun.circuitId, hiddenOptional.circuitId);
console.log('V0.6A.2 optional visibility, filters and chassis-stage persistence test passed.');

// V0.6A.3 part recovery + PI/Class projection regression
const trapPart = {
  catalogId: 'test_pi_trap_part',
  name: 'Test PI Trap Part',
  category: 'ECU',
  categoryKey: 'ecu',
  subCategory: 'Calibration',
  slot: 'test_pi_trap_slot',
  price: 1,
  buildStage: 2,
  persistentFromStage: 2,
  requiredForStageProgression: false,
  compatibility: {},
  lifecycle: { status: 'active' },
  effects: [
    { stat: 'hp', op: 'add', value: 180 },
    { stat: 'torque', op: 'add', value: 150 },
  ],
};
const recoveryParts = [...parts, trapPart];
const recoveryGame = new LocalGameService({
  cars, parts: recoveryParts, engines, circuits, config, buildStages: buildStageConfig.stages, racingConfig
});
const recoveryCar = recoveryGame.createOwnedCar(deepRx8, 'used', 90000, 80, 5000);
recoveryCar.buildStage = 4;
recoveryCar.stageBaseline = { ...recoveryCar.base };
const trapInventory = {
  inventoryId: 'trap-part-owned',
  catalogId: trapPart.catalogId,
  purchasedForCarId: recoveryCar.carId,
  installedOnCarId: recoveryCar.carId,
  installedOnEngineInventoryId: null,
  purchasedAt: 1,
};
const boostedRecoveryCar = recoveryGame.recalculateCar(recoveryCar, [trapInventory]);
assert.notEqual(boostedRecoveryCar.performanceClass, 'D', 'Strong installed parts should be able to push a starter out of D Class.');

let recoveryPlayer = recoveryGame.defaultPlayer();
recoveryPlayer.user = { ...recoveryPlayer.user, username: 'RecoveryTester' };
recoveryPlayer.tutorial = { ...recoveryPlayer.tutorial, status: 'complete', step: 'complete' };
recoveryPlayer.garage = [boostedRecoveryCar];
recoveryPlayer.selectedCarId = boostedRecoveryCar.carId;
recoveryPlayer.inventory.parts = [trapInventory];
recoveryPlayer = recoveryGame.normalizePlayer(recoveryPlayer);

const removalPreview = projectPartChange({
  player: recoveryPlayer,
  car: recoveryPlayer.garage[0],
  catalog: recoveryParts,
  racingConfig,
  candidate: null,
  removeInventoryId: trapInventory.inventoryId,
});
assert.ok(removalPreview.performanceIndex < recoveryPlayer.garage[0].performanceIndex);
assert.equal(removalPreview.performanceClass, 'D', 'Parts UI should be able to preview a removal back into D Class.');

const recoveredPlayer = recoveryGame.uninstallPart(recoveryPlayer, trapInventory.inventoryId);
assert.equal(recoveredPlayer.inventory.parts[0].installedOnCarId, null);
assert.equal(recoveredPlayer.garage[0].buildStage, 4, 'Uninstalling performance parts must not downgrade Build Type.');
assert.equal(recoveredPlayer.garage[0].performanceClass, 'D', 'A player must be able to strip a race build back into an eligible lower PI class.');
console.log('V0.6A.3 uninstall recovery + PI/Class projection test passed.');

assert.equal(performanceClassThreshold('C'), 450);
assert.equal(performanceClassThreshold('B'), 600);
assert.ok(performanceClassRank('C') > performanceClassRank('D'));
assert.ok(performanceClassRank('B') > performanceClassRank('C'));
console.log('V0.6A.4 Performance Class threshold helpers test passed.');




