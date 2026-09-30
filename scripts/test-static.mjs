import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const docs = new URL('../docs/', import.meta.url);
const required = [
  'index.html',
  'favicon.svg',
  'assets/css/app.css',
  'assets/art/race/road.jpg',
  'assets/art/race/race_track.png',
  'assets/art/race/start.png',
  'assets/art/race/finish.png',
  'assets/art/race/divider.png',
  'assets/art/race/shadow.png',
  'assets/art/race/xmas.png',
  'assets/art/race/smoke.png',
  'assets/art/cars/race/golf_gti/body.png',
  'assets/art/cars/race/golf_gti/wheel.png',
  'assets/art/cars/race/golf_gti/disk.png',
  'assets/art/cars/race/golf_gti/detail.png',
  'assets/art/cars/race/mazda_rx8/body.png',
  'assets/art/cars/race/mazda_rx8/wheel.png',
  'assets/art/cars/race/mazda_rx8/disk.png',
  'assets/art/cars/race/mazda_rx8/detail.png',
  'assets/art/cars/race/renault_clio/body.png',
  'assets/art/cars/race/renault_clio/wheel.png',
  'assets/art/cars/race/renault_clio/disk.png',
  'assets/art/cars/race/renault_clio/detail.png',
  'assets/art/cars/atlas/cars-1.png',
  'assets/art/cars/atlas/cars-2.png',
  'assets/art/cars/atlas/cars-3.png',
  'assets/art/cars/atlas/cars-4.png',
  'assets/art/cars/atlas/cars-5.png',
  'assets/art/cars/layered/golf_gti/certified.png',
  'assets/art/cars/layered/golf_gti/body.webp',
  'assets/art/cars/layered/golf_gti/wheel.webp',
  'assets/art/cars/layered/golf_gti/disk.webp',
  'assets/art/cars/layered/golf_gti/detail.webp',
  'assets/art/cars/layered/mazda_rx8/certified.png',
  'assets/art/cars/layered/mazda_rx8/body.webp',
  'assets/art/cars/layered/mazda_rx8/wheel.webp',
  'assets/art/cars/layered/mazda_rx8/disk.webp',
  'assets/art/cars/layered/mazda_rx8/detail.webp',
  'assets/art/cars/layered/renault_clio/certified.png',
  'assets/art/cars/layered/renault_clio/body.webp',
  'assets/art/cars/layered/renault_clio/wheel.webp',
  'assets/art/cars/layered/renault_clio/disk.webp',
  'assets/art/cars/layered/renault_clio/detail.png',
  'assets/js/app.js',
  'assets/js/storage/LocalStorageProvider.js',
  'assets/js/domain/LocalGameService.js',
  'assets/js/domain/RaceSimulator.js',
  'assets/js/domain/PerformanceIndex.js',
  'assets/js/domain/ContentRelease.js',
  'assets/js/domain/EngineCatalog.js',
  'assets/js/domain/ForcedInduction.js',
  'assets/js/domain/PartCatalog.js',
  'assets/js/domain/Tuning.js',
  'assets/js/ui/vehicleRenderer.js',
  'assets/js/ui/partDyno.js',
  'assets/js/ui/racePresentation.js',
  'assets/js/content/ContentStudioCatalog.js',
  'assets/js/content/ContentStudioEngineCatalog.js',
  'assets/js/content/ContentStudioPartCatalog.js',
  'assets/js/screens/contentStudio.js',
  'assets/js/screens/engineStudio.js',
  'assets/js/screens/partsStudio.js',
  'data/catalog/cars.json',
  'data/catalog/car-art.json',
  'data/catalog/parts.json',
  'data/catalog/engines.json',
  'data/config/game.json',
  'data/config/build-stages.json',
  'data/config/racing.json',
  '.nojekyll',
];

for (const file of required) {
  await fs.access(new URL(file, docs));
}

const html = await fs.readFile(new URL('index.html', docs), 'utf8');
if (!html.includes('data-storage-mode="local"')) throw new Error('Static index is not configured for local storage mode.');
if (!html.includes('CURRENT BUILD')) throw new Error('Static index is missing the dense game shell.');
if (!html.includes('data-build="0.5.0-f"')) throw new Error('Static index is missing the V0.5F build marker.');
if (html.includes('<?php')) throw new Error('Static index still contains PHP source.');

const carCatalog = JSON.parse(await fs.readFile(new URL('data/catalog/cars.json', docs), 'utf8'));
const artCatalog = JSON.parse(await fs.readFile(new URL('data/catalog/car-art.json', docs), 'utf8'));
const engineCatalogV05c = JSON.parse(await fs.readFile(new URL('data/catalog/engines.json', docs), 'utf8'));
const starters = carCatalog.filter((car) => car.starter);
if (carCatalog.length !== 3 || starters.length !== 3) throw new Error('V0.4G gameplay catalog must keep exactly the three spec-validated starters for now.');
if (!starters.every((car) => car.class === 'D')) throw new Error('All three current starter cars must begin in D class.');
if (artCatalog.carCount !== 57 && artCatalog.sourceAssetCount !== 57) throw new Error('Layered asset manifest must retain all 57 purchased car definitions.');
if ((artCatalog.cars || []).filter((car) => car.runtimeAvailable).length !== 57) throw new Error('All 57 purchased car visuals must be runtime-ready in V0.4G.');
if (!(artCatalog.cars || []).every((car) => car.certifiedAtlas?.src && car.calibration?.wheelDropPx === 10)) throw new Error('Every purchased car needs certified PNG atlas metadata and the V0.4G wheel drop.');

const expectedStarters = [
  { id:'golf_gti', make:'Volkswagen', model:'Golf GTI Mk6', hp:200, torque:207, weight:3034, drivetrain:'FWD', displacement:2.0, config:'I4', aspiration:'Turbo', hpRpm:5100, tqRpm:1800, redline:6000, revCut:6500 },
  { id:'mazda_rx8', make:'Mazda', model:'RX-8', hp:238, torque:159, weight:3029, drivetrain:'RWD', displacement:1.3, config:'Rotary', aspiration:'Naturally Aspirated', hpRpm:8500, tqRpm:5500, redline:9000, revCut:9500 },
  { id:'renault_clio', make:'Renault', model:'Clio V6 Sport', hp:255, torque:221, weight:3086, drivetrain:'RWD', displacement:2.9, config:'V6', aspiration:'Naturally Aspirated', hpRpm:7150, tqRpm:4650, redline:7200, revCut:7700 },
];
for (const expected of expectedStarters) {
  const car = starters.find((row) => row.catalogId === expected.id);
  if (!car) throw new Error(`Missing starter ${expected.id}.`);
  if (car.make !== expected.make || car.model !== expected.model) throw new Error(`${expected.id} identity mismatch.`);
  if (car.base.hp !== expected.hp || car.base.torque !== expected.torque || car.base.weight !== expected.weight || car.base.drivetrain !== expected.drivetrain) throw new Error(`${expected.id} OEM base stats mismatch.`);
  if (car.engine.displacementLiters !== expected.displacement || car.engine.configuration !== expected.config || car.engine.aspiration !== expected.aspiration || car.engine.peakHpRpm !== expected.hpRpm || car.engine.peakTorqueRpm !== expected.tqRpm || car.engine.redlineRpm !== expected.redline || car.engine.revCutRpm !== expected.revCut) throw new Error(`${expected.id} engine metadata mismatch.`);
  if (!car.visual?.layered?.certifiedSrc) throw new Error(`${expected.id} certified gameplay art is missing.`);
  if (!car.visual?.layered?.layers?.body?.src || !car.visual?.layered?.layers?.wheel?.src || !car.visual?.layered?.layers?.disk?.src || !car.visual?.layered?.layers?.detail?.src) throw new Error(`${expected.id} layered customization metadata is incomplete.`);
  if (!car.visual?.layered?.raceLayers?.body?.src || !car.visual?.layered?.raceLayers?.wheel?.src || !car.visual?.layered?.raceLayers?.disk?.src || !car.visual?.layered?.raceLayers?.detail?.src) throw new Error(`${expected.id} race animation layers are incomplete.`);
  if (!(car.visual.layered.anchors.frontBumperX > car.visual.layered.anchors.frontWheelCenter.x)) throw new Error(`${expected.id} front-bumper anchor is invalid.`);
  if (!(car.visual.layered.anchors.frontWheelCenter.y + car.visual.layered.layers.wheel.height / 2 >= car.visual.layered.anchors.groundY - 2)) throw new Error(`${expected.id} wheels still sit too high in the arches.`);
  if (!(car.benchmark?.passes === 51 && car.benchmark?.performanceIndex > 0 && car.benchmark?.quarterMileEt > 0)) throw new Error(`${expected.id} benchmark / PI metadata is missing.`);
  if (!car.factoryEngineId) throw new Error(`V0.5C starter cars must link to a Factory Engine: ${expected.id}.`);
  const linkedEngine = engineCatalogV05c.find((engine) => engine.engineId === car.factoryEngineId);
  if (!linkedEngine || !(Number(linkedEngine.peakHp) > 0) || !(Number(linkedEngine.peakTorque) > 0) || !Array.isArray(linkedEngine.powerCurve) || linkedEngine.powerCurve.length < 6) {
    throw new Error(`V0.5C Factory Engine definition is incomplete for ${expected.id}.`);
  }
}

for (const file of [
  'data/catalog/cars.json',
  'data/catalog/parts.json',
  'data/catalog/engines.json',
  'data/config/game.json',
  'data/config/build-stages.json',
]) {
  JSON.parse(await fs.readFile(new URL(file, docs), 'utf8'));
}

const rendererSource = await fs.readFile(new URL('assets/js/ui/vehicleRenderer.js', root), 'utf8');
if (!rendererSource.includes('ART MISSING')) throw new Error('Vehicle renderer must expose an explicit missing-art placeholder.');
if (!rendererSource.includes('renderLayeredVehicle') || !rendererSource.includes('data-certified-car') || !rendererSource.includes('layered-car--atlas') || !rendererSource.includes('animatedWheels') || !rendererSource.includes('smokeAnchor') || !rendererSource.includes('centeredLayer') || !rendererSource.includes('frontBumperRatio') || !rendererSource.includes('frontWheelRatio')) throw new Error('Certified / animated layered vehicle renderer is incomplete.');
if (rendererSource.includes('topDown') || rendererSource.includes('renderProcedural(')) throw new Error('Old top-down/procedural vehicle rendering must not return.');
const appSource = await fs.readFile(new URL('assets/js/app.js', root), 'utf8');
if (!appSource.includes("clearForeverRacingCaches({ unregister: true })")) throw new Error('Static dev cache cleanup is missing.');
if (!appSource.includes("renderContentStudio") || !appSource.includes(".register('content-studio'")) throw new Error('Content Studio route / navigation is missing.');

const runtimeConfig = JSON.parse(await fs.readFile(new URL('data/config/game.json', docs), 'utf8'));
if (runtimeConfig.defaultVehicleRendering !== 'authored') throw new Error('Authored vehicle rendering must be the default.');
if (runtimeConfig.schemaVersion < 6) throw new Error('V0.4B player schema version must be at least 6.');

const buildStages = JSON.parse(await fs.readFile(new URL('data/config/build-stages.json', docs), 'utf8'));
if (buildStages.stages?.[0]?.name !== 'Street Car' || buildStages.stages?.[1]?.name !== 'Street Race Car') throw new Error('Named build types are missing.');
if (!buildStages.stages?.[0]?.requiredCategories?.includes('suspension') || buildStages.stages[0].requiredCategories.length !== 8) throw new Error('Street Car must have eight required categories including Suspension.');

const raceConfig = JSON.parse(await fs.readFile(new URL('data/config/racing.json', docs), 'utf8'));
if (!raceConfig.distances?.['1/4'] || !raceConfig.distances?.['1/2'] || !raceConfig.distances?.['1']) throw new Error('All three race distances must be configured.');
if ((raceConfig.weather || []).length < 10 || (raceConfig.locations || []).length < 20) throw new Error('TextTuned weather/location pools are incomplete.');
if (raceConfig.version < 3 || !raceConfig.presentation?.stagingMs || raceConfig.presentation?.timeScale !== 1) throw new Error('V0.4D race configuration is incomplete.');
if ((raceConfig.weather || []).some((row) => row.nightmare && row.quickRace !== false)) throw new Error('Nightmare weather must be excluded from normal Quick Race.');
if ((raceConfig.weather || []).find((row) => row.name === 'Snow')?.minLevel !== 7) throw new Error('Snow should be a later-game Quick Race condition.');
if ((raceConfig.weather || []).find((row) => row.name === 'Ice')?.minLevel !== 10) throw new Error('Ice should be a later-game Quick Race condition.');

const localProviderSource = await fs.readFile(new URL('assets/js/storage/LocalStorageProvider.js', root), 'utf8');
if (!localProviderSource.includes('localStorage.removeItem(PLAYER_KEY)')) throw new Error('Admin local logout must erase player data.');
if (!localProviderSource.includes('already logged in in this browser')) throw new Error('Local duplicate-login guard is missing.');
if (!localProviderSource.includes('quickRacePreview') || !localProviderSource.includes('startQuickRace') || !localProviderSource.includes('finishQuickRace')) throw new Error('Local race preview / two-phase storage lifecycle is missing.');
if (!localProviderSource.includes('mergeContentStudioCars')) throw new Error('Content Studio local catalog overlay is missing.');
if (!localProviderSource.includes('mergeContentStudioParts')) throw new Error('Parts Creator local catalog overlay is missing.');

const localGameSource = await fs.readFile(new URL('assets/js/domain/LocalGameService.js', root), 'utf8');
if (!localGameSource.includes('quickRacePreview') || !localGameSource.includes('nextOpponentProfile') || !localGameSource.includes('activeRace') || !localGameSource.includes('finishQuickRace')) throw new Error('Deterministic preview / persistent active race lifecycle is missing.');

const racePresentationSource = await fs.readFile(new URL('assets/js/ui/racePresentation.js', root), 'utf8');
if (!racePresentationSource.includes('showModal()') || !racePresentationSource.includes('data-race-player-progress') || !racePresentationSource.includes('RETURN TO PITS')) throw new Error('Blocking race playback UI is incomplete.');

const quickRaceSource = await fs.readFile(new URL('assets/js/screens/quickRace.js', root), 'utf8');
if (!quickRaceSource.includes('playRacePresentation') || !quickRaceSource.includes('START 1/4 MI') || !quickRaceSource.includes('RACE PREVIEW') || !quickRaceSource.includes('data-run-distance') || quickRaceSource.includes('data-run-race')) throw new Error('V0.4E Quick Race preview / direct race actions are incomplete.');

if (!appSource.includes('scheduleWelcomeTutorial')) throw new Error('Fresh-login FTUE welcome retry guard is missing.');

const modules = [
  'assets/js/app.js',
  'assets/js/domain/LocalGameService.js',
  'assets/js/domain/PerformanceIndex.js',
  'assets/js/domain/ContentRelease.js',
  'assets/js/domain/EngineCatalog.js',
  'assets/js/domain/Tuning.js',
  'assets/js/ui/vehicleRenderer.js',
  'assets/js/ui/racePresentation.js',
  'assets/js/storage/StorageProvider.js',
  'assets/js/storage/ApiStorageProvider.js',
  'assets/js/storage/LocalStorageProvider.js',
  'assets/js/storage/createStorageProvider.js',
  'assets/js/screens/showroom.js',
  'assets/js/screens/garage.js',
  'assets/js/screens/parts.js',
  'assets/js/screens/quickRace.js',
  'assets/js/screens/usedlot.js',
  'assets/js/screens/roguelike.js',
  'assets/js/screens/settings.js',
  'assets/js/content/ContentStudioCatalog.js',
  'assets/js/content/ContentStudioEngineCatalog.js',
  'assets/js/screens/contentStudio.js',
  'assets/js/screens/engineStudio.js',
];

for (const file of modules) {
  const source = await fs.readFile(new URL(file, root), 'utf8');
  new vm.SourceTextModule(source, { identifier: file });
}

console.log('Static identity + race presentation build smoke test passed.');


const garageSource = await fs.readFile(new URL('assets/js/screens/garage.js', root), 'utf8');
if (!garageSource.includes('garage-inventory-dialog') || !garageSource.includes('data-inventory-car')) throw new Error('Garage Inventory UI is missing.');

const partsSourceV04b = await fs.readFile(new URL('assets/js/screens/parts.js', root), 'utf8');
if (!partsSourceV04b.includes('parts-category-grid') || !partsSourceV04b.includes('BUY THE STAGE 1 INTAKE') || !partsSourceV04b.includes('BUY + INSTALL') || !partsSourceV04b.includes('data-buy-install-part') || !partsSourceV04b.includes('"suspension"')) throw new Error('V0.4F.1 guided Buy + Install Parts UI is missing.');

const classifiedsSource = await fs.readFile(new URL('assets/js/screens/usedlot.js', root), 'utf8');
if (!classifiedsSource.includes('Classifieds') || !classifiedsSource.includes('MORE DETAILS') || classifiedsSource.includes('Buy Used')) throw new Error('Classifieds UI did not replace the old Used Lot purchase cards.');

const cssV04b = await fs.readFile(new URL('assets/css/app.css', root), 'utf8');
if (!cssV04b.includes('V0.4B browser-game usability') || !cssV04b.includes('.nav-rail button.is-active') || !cssV04b.includes('.race-strip{height:330px}')) throw new Error('V0.4B usability CSS is incomplete.');

if (html.includes('class="status-strip"')) throw new Error('The old top player/status strip should be removed in V0.4B.');
if (!html.includes('PLAYER INFO') || !html.includes('CLASSIFIEDS')) throw new Error('V0.4B shell Player Info/Classifieds labels are missing.');

console.log('V0.4B browser-game usability checks passed.');

if (!cssV04b.includes('V0.4C readability hardening') || !cssV04b.includes('.game-header{height:50px;min-height:50px}') || !cssV04b.includes('.home-car-stats span')) {
  throw new Error('V0.4C readability hardening CSS is incomplete.');
}
const showroomSourceV04c = await fs.readFile(new URL('assets/js/screens/showroom.js', root), 'utf8');
const serverGameSourceV04c = await fs.readFile(new URL('app/lib/GameService.php', root), 'utf8');
const terminologySurface = [appSource, showroomSourceV04c, localGameSource, serverGameSourceV04c, html].join('\n');
for (const legacyCopy of ['Build Stage 1', 'Build Stages', 'Stage 1 teaches', 'Stage 1 upgrades', 'Stage 1 cars', 'Stage 2 conversion', 'current Build Stage']) {
  if (terminologySurface.includes(legacyCopy)) throw new Error(`Legacy player-facing build-stage copy remains: ${legacyCopy}`);
}
if (!html.includes('BUILD TYPES') || !localGameSource.includes('Street Car') || !html.includes('Build Types only move forward.')) {
  throw new Error('Named Build Type terminology is incomplete.');
}
console.log('V0.4C readability and terminology checks passed.');

const usedLotSourceV04d = await fs.readFile(new URL('assets/js/screens/usedlot.js', root), 'utf8');
const raceSimulatorSourceV04d = await fs.readFile(new URL('assets/js/domain/RaceSimulator.js', root), 'utf8');
const racePresentationSourceV04d = await fs.readFile(new URL('assets/js/ui/racePresentation.js', root), 'utf8');
if (!cssV04b.includes('V0.4D FTUE and readable-game pass') || !cssV04b.includes('body{font-size:16px;line-height:1.5}') || !cssV04b.includes('.ftue-focus-panel')) {
  throw new Error('V0.4D readability / FTUE visual pass is missing.');
}
if (!appSource.includes('ROUTE_UNLOCK_LEVELS') || !appSource.includes("'showroom': 5") && !appSource.includes('showroom: 5')) {
  throw new Error('Post-FTUE level-based feature gates are missing.');
}
if (!usedLotSourceV04d.includes('STARTER CARS') || !usedLotSourceV04d.includes('PERFORMANCE INDEX') || !usedLotSourceV04d.includes('SELECT THIS CAR')) {
  throw new Error('V0.4F Classifieds starter / PI flow is missing.');
}
if (!localGameSource.includes("'s1_intake_1'") || !localGameSource.includes('Local Test & Tune') || !localGameSource.includes('unlockLevel')) {
  throw new Error('Local V0.4D FTUE enforcement is incomplete.');
}
if (!serverGameSourceV04c.includes("'s1_intake_1'") || !serverGameSourceV04c.includes('Local Test & Tune') || !serverGameSourceV04c.includes('$unlockLevel')) {
  throw new Error('Server V0.4D FTUE enforcement is incomplete.');
}
if (!raceSimulatorSourceV04d.includes('allowFoul') || !raceSimulatorSourceV04d.includes('quickRace !== false')) {
  throw new Error('V0.4D tutorial foul/weather gates are missing.');
}
if (!racePresentationSourceV04d.includes('data-tree-pre') || !racePresentationSourceV04d.includes('setLamp') || !racePresentationSourceV04d.includes('ratio >= 0.52') || !racePresentationSourceV04d.includes('ratio >= 0.68') || !racePresentationSourceV04d.includes('RED LIGHT • YOU LEFT BEFORE GREEN')) {
  throw new Error('Classic drag-tree timing/state progression is missing.');
}
console.log('V0.4D guided FTUE, unlock progression and race-gating checks passed.');

const settingsSourceV04e = await fs.readFile(new URL('assets/js/screens/settings.js', root), 'utf8');
const apiPreviewSourceV04e = await fs.readFile(new URL('api/race/preview.php', root), 'utf8');
const playerFacingTutorialSurface = [appSource, usedLotSourceV04d, garageSource, partsSourceV04b, quickRaceSource, settingsSourceV04e, html].join('\n');
if (/\bFTUE\b/.test(playerFacingTutorialSurface)) {
  throw new Error('Player-facing UI must say STEP / tutorial instead of FTUE.');
}
if (!cssV04b.includes('V0.4E dialog shell and race preview') ||
    !cssV04b.includes('dialog.fr-dialog:has(.classified-detail-dialog)') ||
    !cssV04b.includes('dialog.fr-dialog:has(.parts-shop-dialog)') ||
    !cssV04b.includes('dialog.fr-dialog:has(.garage-inventory-dialog)') ||
    !cssV04b.includes('.classified-detail-dialog,.parts-shop-dialog,.garage-inventory-dialog{')) {
  throw new Error('V0.4E wide-dialog shell fix is incomplete.');
}
if (!cssV04b.includes('.race-preview-card{') || !cssV04b.includes('.race-distance-tabs--actions{')) {
  throw new Error('V0.4E Race Preview layout is missing.');
}
if (!serverGameSourceV04c.includes('quickRacePreview') || !serverGameSourceV04c.includes('nextOpponentProfile') || !apiPreviewSourceV04e.includes('GameService::quickRacePreview')) {
  throw new Error('Server deterministic Race Preview path is incomplete.');
}
console.log('V0.4E tutorial wording, dialog sizing and Race Preview checks passed.');

const performanceIndexSourceV04f = await fs.readFile(new URL('assets/js/domain/PerformanceIndex.js', root), 'utf8');
const serverPerformanceIndexSourceV04f = await fs.readFile(new URL('app/lib/PerformanceIndex.php', root), 'utf8');
if (!performanceIndexSourceV04f.includes('PERFORMANCE_INDEX_PASSES = 51') || !performanceIndexSourceV04f.includes('PERFORMANCE_INDEX_PER_TENTH = 8') || !performanceIndexSourceV04f.includes('medianEt') || !performanceIndexSourceV04f.includes('performanceClassFromIndex') || !performanceIndexSourceV04f.includes('1100') || !performanceIndexSourceV04f.includes('return "X"')) {
  throw new Error('Deterministic 51-pass Performance Index benchmark is incomplete.');
}
if (!serverPerformanceIndexSourceV04f.includes('public const PASSES = 51') || !serverPerformanceIndexSourceV04f.includes('public const PER_TENTH = 8') || !serverPerformanceIndexSourceV04f.includes('classFromIndex') || !serverPerformanceIndexSourceV04f.includes('1100') || !serverPerformanceIndexSourceV04f.includes("return 'X'")) {
  throw new Error('PHP Performance Index parity is incomplete.');
}
if (!racePresentationSourceV04d.includes('race-playback--side') ||
    !racePresentationSourceV04d.includes('frontWheelRatio') ||
    !racePresentationSourceV04d.includes('frontBumperRatio') ||
    !racePresentationSourceV04d.includes('carLeftAtProgress') ||
    !racePresentationSourceV04d.includes('visualFinishAt') ||
    !racePresentationSourceV04d.includes('timingNow = Math.min(now, playerFinish)')) {
  throw new Error('Side-view front-bumper finish timing / visual fly-through regression.');
}
if (!quickRaceSource.includes('PERFORMANCE') || !quickRaceSource.includes('Opponent dyno data stays hidden') || quickRaceSource.includes('opponent.hp') || quickRaceSource.includes('opponent.torque') || quickRaceSource.includes('opponent.weight')) {
  throw new Error('PI-based mystery Race Preview regressed.');
}
const v04fPlayerSurface = [appSource, usedLotSourceV04d, showroomSourceV04c, garageSource, partsSourceV04b, quickRaceSource, localGameSource, serverGameSourceV04c, html].join('\n');
if (!usedLotSourceV04d.includes('CLASS') || !garageSource.includes('performance-class-tag') || !quickRaceSource.includes('performanceClass')) throw new Error('V0.4G class letters are missing from player-facing vehicle surfaces.');
if (!settingsSourceV04e.includes('57-Car Art Roster') || !settingsSourceV04e.includes('ART READY')) throw new Error('The 57-car runtime art roster debug view is missing.');
if (!cssV04b.includes('V0.4F layered vehicles and side-view drag strip') || !cssV04b.includes('.race-strip--side') || !cssV04b.includes('.layered-car__wheel') || !cssV04b.includes('V0.4G roster / performance classes')) {
  throw new Error('V0.4F layered-car / side-view race CSS is missing.');
}
console.log('V0.4G 57-car PNG atlas, PI classes and bumper-timed side-view racing checks passed.');

if (!racePresentationSourceV04d.includes('race-strip__surface') ||
    !racePresentationSourceV04d.includes('race-side-car__shadow') ||
    !racePresentationSourceV04d.includes('data-tree-pre')) {
  throw new Error('V0.4H.0/H.2 race visual markup is incomplete.');
}
for (const assetRef of ['road.jpg', 'race_track.png', 'start.png', 'finish.png', 'shadow.png', 'xmas.png']) {
  if (!cssV04b.includes(assetRef)) throw new Error(`V0.4H.0 race CSS is missing ${assetRef}.`);
}
if (!cssV04b.includes('V0.4H.0 purchased drag-strip visual pass')) {
  throw new Error('V0.4H.0 race visual CSS marker is missing.');
}
console.log('V0.4H.0 purchased race-track visuals checks passed.');

if (!racePresentationSourceV04d.includes('updateWheelMotion') ||
    !racePresentationSourceV04d.includes('updateTireSmoke') ||
    !racePresentationSourceV04d.includes('layered-car__wheel,.layered-car__disk') ||
    !racePresentationSourceV04d.includes('traction?.gripLoss')) {
  throw new Error('V0.4H.1/H.2 wheel-spin or grip-smoke presentation logic is missing.');
}
if (!raceSimulatorSourceV04d.includes('tractionDemand') ||
    !raceSimulatorSourceV04d.includes('gripLoss') ||
    !serverGameSourceV04c.includes('playerDrivetrain')) {
  throw new Error('V0.4H.2 grip-loss race telemetry is incomplete.');
}
if (!cssV04b.includes('V0.4H.1-H.2 wheel motion') ||
    !cssV04b.includes('smoke.png') ||
    !cssV04b.includes('top:50%') ||
    !cssV04b.includes('.vehicle-visual--animated-wheels')) {
  throw new Error('V0.4H.1/H.2 race alignment / wheel / smoke CSS is incomplete.');
}
console.log('V0.4H.1-H.2 classic tree, wheel spin and grip-loss smoke checks passed.');

if (!cssV04b.includes('V0.4H.3 race-lane vertical centering') ||
    !cssV04b.includes('.race-side-lane .race-side-car{') ||
    !cssV04b.includes('top:50%') ||
    !cssV04b.includes('bottom:auto') ||
    !cssV04b.includes('transform:translateY(-50%)')) {
  throw new Error('V0.4H.3 race-lane centering CSS is incomplete.');
}
console.log('V0.4H.3 race-lane vertical centering check passed.');

if (!racePresentationSourceV04d.includes('racePhysicsProgress') ||
    !racePresentationSourceV04d.includes('physicsMotionExponent') ||
    !racePresentationSourceV04d.includes('trapFeetPerSecond') ||
    !racePresentationSourceV04d.includes('deltaTravelFeet') ||
    !racePresentationSourceV04d.includes('slipRatio')) {
  throw new Error('V0.4H.4 physics-linked race/wheel motion is incomplete.');
}
console.log('V0.4H.4 physics-linked wheel-motion check passed.');

const contentStudioSource = await fs.readFile(new URL('assets/js/screens/contentStudio.js', root), 'utf8');
const contentStudioCatalogSource = await fs.readFile(new URL('assets/js/content/ContentStudioCatalog.js', root), 'utf8');
if (!html.includes('CONTENT STUDIO') ||
    !contentStudioSource.includes('CAR CREATOR') ||
    !contentStudioSource.includes('PARTS CREATOR') ||
    !contentStudioSource.includes('WHEELS TOOL') ||
    !contentStudioSource.includes('accept="image/png,.png"') ||
    !contentStudioSource.includes('benchmarkPerformance') ||
    !contentStudioSource.includes('performanceClassFromIndex') ||
    !contentStudioSource.includes('SAVE DRAFT LOCALLY') ||
    !contentStudioSource.includes('ACTIVATE LOCALLY + RELOAD') ||
    !contentStudioSource.includes('EXPORT CAR JSON')) {
  throw new Error('V0.5A Car Creator UI / PI / PNG workflow is incomplete.');
}
if (!contentStudioCatalogSource.includes('mergeContentStudioCars') ||
    !contentStudioCatalogSource.includes('saveContentStudioCar') ||
    !contentStudioCatalogSource.includes('foreverRacing.contentStudio.cars.v1')) {
  throw new Error('V0.5A Content Studio local persistence is incomplete.');
}
if (!rendererSource.includes('forceLayers') ||
    !rendererSource.includes('paintLayer') ||
    !rendererSource.includes('layer.z') ||
    !rendererSource.includes('value.startsWith("data:")')) {
  throw new Error('V0.5A editable XYZ layer / paint renderer support is incomplete.');
}
if (!cssV04b.includes('V0.5A Content Studio / Car Creator') ||
    !cssV04b.includes('.content-studio__workspace') ||
    !cssV04b.includes('.content-studio__layer-table')) {
  throw new Error('V0.5A Content Studio styling is incomplete.');
}
console.log('V0.5A Content Studio / Car Creator checks passed.');

if (!html.includes('rel="icon" href="favicon.svg"') ||
    !rendererSource.includes('resolveLayers') ||
    !rendererSource.includes('hasLayerSource') ||
    !rendererSource.includes('wantsEditableLayers') ||
    !contentStudioSource.includes('car.visual.renderMode = ""') ||
    contentStudioSource.includes('forceLayers: hasLayers')) {
  throw new Error('V0.5A.1 Content Studio certified/atlas preview fallback is incomplete.');
}
console.log('V0.5A.1 Content Studio preview checks passed.');

if (!contentStudioSource.includes('DEFAULT_PAINT_PALETTE') ||
    !contentStudioSource.includes('paintPaletteMarkup') ||
    !contentStudioSource.includes('previewAnchorRatio') ||
    !contentStudioSource.includes('marketPlacementLabel') ||
    !contentStudioSource.includes('USED_LOT_KEY') ||
    !contentStudioCatalogSource.includes('findContentStudioRecord') ||
    !rendererSource.includes('Boolean(paintColor)') ||
    !localGameSource.includes('paintColor: randomPaintColor(spec)') ||
    !localGameSource.includes('withPaintColor') ||
    !cssV04b.includes('V0.5A.2 Content Studio polish')) {
  throw new Error('V0.5A.2 Content Studio market/paint polish is incomplete.');
}
if (!carCatalog.every((car) => Array.isArray(car.visual?.paintPalette) && car.visual.paintPalette.length === 5)) {
  throw new Error('V0.5A.2 playable cars must have five factory paint colors.');
}
console.log('V0.5A.2 Content Studio market/paint polish checks passed.');

if (!contentStudioSource.includes('X OFFSET') ||
    !contentStudioSource.includes('Y OFFSET') ||
    !contentStudioSource.includes('Default centers: rear') ||
    !contentStudioSource.includes('layerPositionHint') ||
    contentStudioSource.includes('content-studio__anchor-key') ||
    !cssV04b.includes('V0.5A.3 coordinate polish')) {
  throw new Error('V0.5A.3 Content Studio coordinate polish is incomplete.');
}
console.log('V0.5A.3 Content Studio coordinate polish checks passed.');

const releaseSource = await fs.readFile(new URL('assets/js/domain/ContentRelease.js', root), 'utf8');
const showroomSourceV05b = await fs.readFile(new URL('assets/js/screens/showroom.js', root), 'utf8');
if (!contentStudioSource.includes('Publishing & schedule') ||
    !contentStudioSource.includes('Release Immediately') ||
    !contentStudioSource.includes('Schedule Release') ||
    !contentStudioSource.includes('normalizeReleaseForSave') ||
    !releaseSource.includes('nextScheduledReleaseAt') ||
    !releaseSource.includes('isContentReleased') ||
    !localGameSource.includes('nextScheduledReleaseAt') ||
    !localGameSource.includes('isContentReleased(spec)') ||
    !showroomSourceV05b.includes('isContentReleased(car)') ||
    !contentStudioSource.includes('input.addEventListener("click", previewPaletteColor)') ||
    !contentStudioSource.includes('studio-paint-swatch') ||
    !cssV04b.includes('.studio-paint-swatch.is-selected') ||
    !cssV04b.includes('V0.5B release scheduler')) {
  throw new Error('V0.5B release scheduler / paint preview polish is incomplete.');
}
console.log('V0.5B release scheduler + clickable paint preview checks passed.');

const engineStudioSource = await fs.readFile(new URL('assets/js/screens/engineStudio.js', root), 'utf8');
const engineDomainSource = await fs.readFile(new URL('assets/js/domain/EngineCatalog.js', root), 'utf8');
const engineStudioCatalogSource = await fs.readFile(new URL('assets/js/content/ContentStudioEngineCatalog.js', root), 'utf8');
if (!appSource.includes("renderEngineStudio") ||
    !appSource.includes(".register('engine-studio'") ||
    !contentStudioSource.includes('data-factory-engine') ||
    !contentStudioSource.includes('applyEngineToCarDraft') ||
    !contentStudioSource.includes('EDIT ENGINE') ||
    !engineStudioSource.includes('ENGINE CREATOR') ||
    !engineStudioSource.includes('Torque-first power curve') ||
    !engineStudioSource.includes('GENERATE FROM PROFILE') ||
    !engineStudioSource.includes('SAVE ENGINE DRAFT') ||
    !engineStudioSource.includes('ACTIVATE ENGINE LOCALLY') ||
    !engineDomainSource.includes('deriveHorsepower') ||
    !engineDomainSource.includes('/ 5252') ||
    !engineDomainSource.includes('generateBaselineCurve') ||
    !engineStudioCatalogSource.includes('foreverRacing.contentStudio.engines.v1') ||
    !cssV04b.includes('V0.5C Engine Creator')) {
  throw new Error('V0.5C Engine Creator / Car Creator engine-link workflow is incomplete.');
}
if (engineCatalogV05c.length < 10) throw new Error('V0.5C engine catalog migration is missing expected entries.');
for (const engine of engineCatalogV05c.filter((row) => row.sourceStatus === 'engine-tool')) {
  if (!engine.engineId || !engine.familyId || !(engine.peakHp > 0) || !(engine.peakTorque > 0) || !Array.isArray(engine.powerCurve) || engine.powerCurve.length < 6) {
    throw new Error(`V0.5C Engine Creator definition is incomplete: ${engine.engineId || 'unknown'}.`);
  }
  const hpPeak = Math.max(...engine.powerCurve.map((point) => Number(point.torqueLbFt || 0) * Number(point.rpm || 0) / 5252));
  const tqPeak = Math.max(...engine.powerCurve.map((point) => Number(point.torqueLbFt || 0)));
  if (Math.abs(hpPeak - Number(engine.peakHp)) > Math.max(5, Number(engine.peakHp) * 0.04) ||
      Math.abs(tqPeak - Number(engine.peakTorque)) > Math.max(5, Number(engine.peakTorque) * 0.04)) {
    throw new Error(`V0.5C engine curve peak anchors are inconsistent: ${engine.engineId}.`);
  }
}
console.log('V0.5C Engine Creator + linked Factory Engine checks passed.');

const curveProfileIds = new Set([
  'small_economy','turbo_street','muscle_v8','jdm_vtec','high_rev_na',
  'motorbike','diesel_torque','rotary','broad_torque'
]);
if (!engineDomainSource.includes('ENGINE_CURVE_PROFILES') ||
    !engineDomainSource.includes('curveProfileDefinition') ||
    !engineDomainSource.includes('inferCurveProfile') ||
    !engineStudioSource.includes('Curve Profile') ||
    !engineStudioSource.includes('GENERATE FROM PROFILE') ||
    !engineStudioSource.includes('Only what Forever Racing actually needs') ||
    engineStudioSource.includes('Compression Ratio') ||
    engineStudioSource.includes('Engine Weight (lb)') ||
    engineStudioSource.includes('Size Class') ||
    engineStudioSource.includes('Orientations') ||
    !cssV04b.includes('V0.5C.1 Engine Creator simplification')) {
  throw new Error('V0.5C.1 simplified Engine Creator / curve-profile workflow is incomplete.');
}
for (const engine of engineCatalogV05c) {
  if (!curveProfileIds.has(String(engine.curveProfile || ''))) {
    throw new Error(`V0.5C.1 engine is missing a valid Curve Profile: ${engine.engineId || 'unknown'}.`);
  }
  for (const obsolete of ['compressionRatio','engineWeightLb','sizeClass','orientations','curveType']) {
    if (Object.prototype.hasOwnProperty.call(engine, obsolete)) {
      throw new Error(`V0.5C.1 obsolete engine field ${obsolete} remains on ${engine.engineId || 'unknown'}.`);
    }
  }
}
console.log('V0.5C.1 simplified Engine Creator checks passed.');

if (!engineDomainSource.includes('peakBoostPsi') ||
    !engineStudioSource.includes('Factory Peak Boost (PSI)') ||
    !engineStudioSource.includes('does not calculate horsepower automatically') ||
    !contentStudioSource.includes('Factory Peak Boost') ||
    !contentStudioSource.includes('peakBoostPsi')) {
  throw new Error('V0.5C.2 factory boost baseline is incomplete.');
}
console.log('V0.5C.2 factory boost baseline checks passed.');

const hdGolfArtV05c3 = (artCatalog.cars || []).find((car) => car.assetId === 'hd_golf_gti');
if (!hdGolfArtV05c3?.certifiedAtlas?.src || hdGolfArtV05c3?.layers?.body?.src || hdGolfArtV05c3?.layers?.wheel?.src) {
  throw new Error('V0.5C.3 HD Golf composite-art regression fixture changed unexpectedly.');
}
if (!rendererSource.includes('vehicleVisualCapabilities') ||
    !rendererSource.includes('effectiveAnimatedWheels') ||
    !rendererSource.includes('animatedWheels && capabilities.animatedWheels') ||
    !contentStudioSource.includes('PAINT LOCKED') ||
    !contentStudioSource.includes('Fixed livery / composite art') ||
    !contentStudioSource.includes('vehicleVisualCapabilities(draft)') ||
    !cssV04b.includes('V0.5C.3 composite art fallback')) {
  throw new Error('V0.5C.3 composite race-art / fixed-livery fallback is incomplete.');
}
console.log('V0.5C.3 composite race-art fallback checks passed.');

const forcedInductionSource = await fs.readFile(new URL('assets/js/domain/ForcedInduction.js', root), 'utf8');
const garageSourceV05d = await fs.readFile(new URL('assets/js/screens/garage.js', root), 'utf8');
const forcedParts = JSON.parse(await fs.readFile(new URL('data/catalog/parts.json', docs), 'utf8'))
  .filter((part) => part.categoryKey === 'forced_induction');
if (forcedParts.length < 25 ||
    !forcedParts.some((part) => part.forcedInduction?.role === 'kit' && part.forcedInduction?.system === 'turbo') ||
    !forcedParts.some((part) => part.forcedInduction?.role === 'kit' && part.forcedInduction?.system === 'supercharger') ||
    !forcedParts.some((part) => part.forcedInduction?.shot === 50) ||
    !forcedParts.some((part) => part.forcedInduction?.shot === 300) ||
    !forcedParts.some((part) => part.forcedInduction?.role === 'twin_kit') ||
    forcedParts.some((part) => part.requiredForStageProgression !== false)) {
  throw new Error('V0.5D forced-induction catalog is incomplete.');
}
if (!forcedInductionSource.includes('forcedInductionState') ||
    !forcedInductionSource.includes('forcedInductionCompatibility') ||
    !forcedInductionSource.includes('twin_kit') ||
    !partsSourceV04b.includes('FORCED INDUCTION') ||
    !partsSourceV04b.includes('TWIN CHARGE') ||
    !partsSourceV04b.includes('UPGRADE TO FRONT-HALF RACE CAR') ||
    !partsSourceV04b.includes('UPGRADE TO FULL RACE CAR') ||
    !localGameSource.includes('forcedInductionCompatibility') ||
    !localGameSource.includes("car.buildStage = 3") ||
    !localGameSource.includes("car.buildStage = 4") ||
    !serverGameSourceV04c.includes('forcedInductionCompatibility') ||
    !garageSourceV05d.includes('forcedInductionSwapNeeded') ||
    !contentStudioSource.includes('REFRESH ENGINES') ||
    !contentStudioSource.includes('Engine list refreshed') ||
    !cssV04b.includes('V0.5D forced-induction shop')) {
  throw new Error('V0.5D forced-induction UI / rules / progression workflow is incomplete.');
}
if (buildStages.version < 4 ||
    buildStages.stages?.[1]?.forcedInduction?.nitrousMaxShot !== 50 ||
    buildStages.stages?.[2]?.forcedInduction?.nitrousMaxShot !== 150 ||
    buildStages.stages?.[3]?.forcedInduction?.nitrousMaxShot !== 300 ||
    buildStages.stages?.[3]?.forcedInduction?.twinCharge !== true) {
  throw new Error('V0.5D build-stage forced-induction capabilities are incomplete.');
}
console.log('V0.5D forced-induction / progression checks passed.');

const partDynoSourceV05d1 = await fs.readFile(new URL('assets/js/ui/partDyno.js', root), 'utf8');
const engineKitsV05d1 = JSON.parse(await fs.readFile(new URL('data/catalog/parts.json', docs), 'utf8'))
  .filter((part) => part.categoryKey === 'engine_kit');
const gameConfigV05d1 = JSON.parse(await fs.readFile(new URL('data/config/game.json', docs), 'utf8'));
if (engineKitsV05d1.length !== 4 ||
    engineKitsV05d1.at(-1)?.price !== 50000 ||
    engineKitsV05d1.at(-1)?.engineKit?.level !== 4 ||
    !forcedParts.some((part) => Number(part.requiredEngineKit || 0) >= 4)) {
  throw new Error('V0.5D.1 Engine Kit catalog / durability gates are incomplete.');
}
if (Number(gameConfigV05d1.localDevCredits || 0) !== 10000000 ||
    !localGameSource.includes('localDevCredits') ||
    !serverGameSourceV04c.includes('local_dev_credits')) {
  throw new Error('V0.5D.1 Admin testing-credit floor is incomplete.');
}
if (!partDynoSourceV05d1.includes('renderPartDynoChart') ||
    !partDynoSourceV05d1.includes('Estimated before / after curve') ||
    !partsSourceV04b.includes('CLICK TO OPEN') ||
    !partsSourceV04b.includes('parts-category-grid--race') ||
    !partsSourceV04b.includes('engineKitRows') ||
    !partsSourceV04b.includes('renderStandardCategoryDialog') ||
    !partsSourceV04b.includes('renderPartDynoChart') ||
    !partsSourceV04b.includes('Earlier-stage parts remain available') ||
    !cssV04b.includes('V0.5D.1 parts depth + dyno polish')) {
  throw new Error('V0.5D.1 Parts / FI dyno UX is incomplete.');
}
console.log('V0.5D.1 parts depth / dyno UX checks passed.');

const partCatalogSourceV05e = await fs.readFile(new URL('assets/js/domain/PartCatalog.js', root), 'utf8');
const partStudioCatalogSourceV05e = await fs.readFile(new URL('assets/js/content/ContentStudioPartCatalog.js', root), 'utf8');
const partsStudioSourceV05e = await fs.readFile(new URL('assets/js/screens/partsStudio.js', root), 'utf8');
if (!appSource.includes("renderPartsStudio") || !appSource.includes(".register('parts-studio'") ||
    !contentStudioSource.includes('PARTS CREATOR') || !engineStudioSource.includes('PARTS CREATOR')) {
  throw new Error('V0.5E Parts Creator routing is incomplete.');
}
if (!partCatalogSourceV05e.includes('partCompatibility') ||
    !partCatalogSourceV05e.includes('partStoreAvailable') ||
    !partCatalogSourceV05e.includes('partRuleCompatibility') ||
    !partStudioCatalogSourceV05e.includes('mergeContentStudioParts') ||
    !partsStudioSourceV05e.includes('ACTIVATE PART LOCALLY') ||
    !partsStudioSourceV05e.includes('Compatible Engine IDs') ||
    !partsStudioSourceV05e.includes('LIVE TEST CAR') ||
    !partsSourceV04b.includes('partStoreAvailable') ||
    !partsSourceV04b.includes('partCompatibility') ||
    !localGameSource.includes('partRuleCompatibility') ||
    !serverGameSourceV04c.includes('partCompatibilityReason') ||
    !cssV04b.includes('V0.5E Parts Creator')) {
  throw new Error('V0.5E Parts Creator authoring / compatibility workflow is incomplete.');
}
console.log('V0.5E Parts Creator checks passed.');

const deepPartsV05f = JSON.parse(await fs.readFile(new URL('data/catalog/parts.json', docs), 'utf8'));
const stage3PartsV05f = deepPartsV05f.filter((part) => Number(part.buildStage || 1) === 3);
const stage4PartsV05f = deepPartsV05f.filter((part) => Number(part.buildStage || 1) === 4);
const stage3CategoriesV05f = new Set(stage3PartsV05f.map((part) => part.categoryKey));
const stage4CategoriesV05f = new Set(stage4PartsV05f.map((part) => part.categoryKey));
if (stage3PartsV05f.length < 30 || stage4PartsV05f.length < 35) {
  throw new Error('V0.5F Stage 3/4 catalog depth is too shallow.');
}
for (const category of ['intake','exhaust','ecu','fuel','drivetrain','suspension','tires','weight','forced_induction','engine_kit']) {
  if (!stage3CategoriesV05f.has(category)) throw new Error(`V0.5F Stage 3 is missing category depth: ${category}`);
}
for (const category of ['intake','exhaust','ecu','fuel','drivetrain','suspension','tires','weight','forced_induction','engine']) {
  if (!stage4CategoriesV05f.has(category)) throw new Error(`V0.5F Stage 4 is missing category depth: ${category}`);
}
if (!stage4PartsV05f.some((part) => part.catalogId === 's4_rotary_bridgeport' && part.compatibility?.engineConfigurations?.includes('Rotary')) ||
    !stage4PartsV05f.some((part) => part.catalogId === 's4_engine_pistons' && !part.compatibility?.engineConfigurations?.includes('Rotary')) ||
    !stage4PartsV05f.some((part) => part.catalogId === 's4_ecu_standalone' && part.tuning?.homeGarage === true)) {
  throw new Error('V0.5F engine-internals / standalone tuning groundwork is incomplete.');
}
if (deepPartsV05f.filter((part) => Number(part.buildStage || 1) >= 2).some((part) => !String(part.subCategory || '').trim())) {
  throw new Error('V0.5F Stage 2+ parts must have a shop subcategory.');
}
if (!partsSourceV04b.includes('parts-shop-subnav') ||
    !partsSourceV04b.includes('pageSize = 3') ||
    !partsSourceV04b.includes('data-parts-page') ||
    !partsSourceV04b.includes('data-fi-page') ||
    !partsStudioSourceV05e.includes('Shop Subcategory') ||
    !partCatalogSourceV05e.includes('subCategory') ||
    !cssV04b.includes('V0.5F deep parts navigation')) {
  throw new Error('V0.5F subcategory / pagination UI is incomplete.');
}
if (buildStages.version < 5 ||
    buildStages.stages?.[2]?.engineSwapPlanned !== true ||
    buildStages.stages?.[3]?.engineSwapPlanned !== true ||
    buildStages.stages?.[2]?.engineSwaps !== false ||
    buildStages.stages?.[3]?.engineSwaps !== false) {
  throw new Error('V0.5F build-stage engine-swap status is misleading or stale.');
}
console.log('V0.5F Stage 3/4 parts depth + pagination checks passed.');

const tuningSourceV05g = await fs.readFile(new URL('assets/js/domain/Tuning.js', root), 'utf8');
const serverTuningSourceV05g = await fs.readFile(new URL('app/lib/Tuning.php', root), 'utf8');
const apiTuneSourceV05g = await fs.readFile(new URL('api/garage/tune.php', root), 'utf8');
if (!garageSource.includes('data-tune-car') ||
    !garageSource.includes('SAVE CALIBRATION') ||
    !garageSource.includes('BOOST BY GEAR') ||
    !garageSource.includes('FRONT TIRE PSI') ||
    !garageSource.includes('Every owned car has slightly different calibration tolerances') ||
    !quickRaceSource.includes('tuningRaceLog') ||
    !quickRaceSource.includes('POWER PULLED') ||
    !localGameSource.includes('saveTune(inputPlayer') ||
    !localGameSource.includes('tuningRuntime') ||
    !raceSimulatorSourceV04d.includes('launchPowerFactor') ||
    !raceSimulatorSourceV04d.includes('tuningPowerPull') ||
    !tuningSourceV05g.includes('tuningFingerprint') ||
    !tuningSourceV05g.includes('boostByGear') ||
    !tuningSourceV05g.includes('fuelTrimPct') ||
    !tuningSourceV05g.includes('tirePsiRear') ||
    !serverTuningSourceV05g.includes('final class Tuning') ||
    !serverGameSourceV04c.includes('public static function saveTune') ||
    !apiTuneSourceV05g.includes('GameService::saveTune') ||
    !cssV04b.includes('V0.5G garage laptop tuning') ||
    !cssV04b.includes('.race-tuning-log')) {
  throw new Error('V0.5G garage tuning / data-log workflow is incomplete.');
}
console.log('V0.5G garage tuning checks passed.');


