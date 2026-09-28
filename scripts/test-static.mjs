import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const docs = new URL('../docs/', import.meta.url);
const required = [
  'index.html',
  'assets/css/app.css',
  'assets/art/cars/cars-top-down-v1.png',
  'assets/art/cars/vehicles/2005-ford-mustang-gt-top-down-v03a.png',
  'assets/art/cars/vehicles/1998-honda-civic-dx-top-down-v03a.png',
  'assets/art/cars/vehicles/2003-nissan-350z-side-profile.png',
  'assets/art/cars/vehicles/2005-ford-mustang-gt-side-profile.png',
  'assets/art/cars/vehicles/1998-honda-civic-dx-side-profile.png',
  'assets/art/cars/vehicles/1998-honda-civic-dx-top-down.png',
  'assets/art/cars/vehicles/2003-nissan-350z-top-down.png',
  'assets/art/cars/vehicles/2004-subaru-impreza-wrx-sti-top-down.png',
  'assets/art/cars/vehicles/2005-ford-mustang-gt-top-down.png',
  'assets/js/app.js',
  'assets/js/storage/LocalStorageProvider.js',
  'assets/js/domain/LocalGameService.js',
  'assets/js/domain/RaceSimulator.js',
  'assets/js/ui/vehicleRenderer.js',
  'assets/js/ui/racePresentation.js',
  'data/catalog/cars.json',
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
if (!html.includes('data-build="0.4.0-d"')) throw new Error('Static index is missing the V0.4D build marker.');
if (html.includes('<?php')) throw new Error('Static index still contains PHP source.');

const carCatalog = JSON.parse(await fs.readFile(new URL('data/catalog/cars.json', docs), 'utf8'));
const starters = carCatalog.filter((car) => car.starter);
if (starters.length !== 3) throw new Error('Expected three starter cars.');
if (!starters.every((car) => String(car.class || '').toUpperCase() === 'D')) throw new Error('Every FTUE starter must be D Class.');
if (starters.some((car) => ['Mustang GT', '350Z'].includes(String(car.model)))) throw new Error('C Class cars must not remain in the FTUE starter pool.');
const civicStarter = starters.find((car) => Number(car.stockId) === 1);
if (!String(civicStarter?.visual?.sprites?.sideProfile?.src || '').includes('-side-profile.png')) throw new Error('The Civic starter art mapping is missing.');
// Starters without authored art intentionally use the explicit ART MISSING renderer until the dedicated art pass.

const spriteCars = carCatalog.filter((car) => car?.visual?.sprites?.topDown?.sheet === 'assets/art/cars/cars-top-down-v1.png');
if (spriteCars.length < 4) throw new Error('Expected at least four cars wired to the V1 pixel sprite sheet.');
if (!spriteCars.every((car) => Number.isInteger(car.visual.sprites.topDown.index))) throw new Error('Sprite-backed cars must define a frame index.');
if (!spriteCars.every((car) => String(car.visual.sprites.topDown.src || '').startsWith('assets/art/cars/vehicles/'))) throw new Error('Authored sprite cars must use direct per-car PNG sources.');

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
if (rendererSource.includes('renderProcedural(')) throw new Error('Generic procedural car fallback must not return.');
const showroomResolve = rendererSource.match(/if \(view === 'showroom'\) \{([\s\S]*?)\} else if/);
if (!showroomResolve || showroomResolve[1].includes('topDown')) throw new Error('Showroom must not fall back to top-down art.');
const appSource = await fs.readFile(new URL('assets/js/app.js', root), 'utf8');
if (!appSource.includes("clearForeverRacingCaches({ unregister: true })")) throw new Error('Static dev cache cleanup is missing.');

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
if (!localProviderSource.includes('startQuickRace') || !localProviderSource.includes('finishQuickRace')) throw new Error('Local two-phase race storage lifecycle is missing.');

const localGameSource = await fs.readFile(new URL('assets/js/domain/LocalGameService.js', root), 'utf8');
if (!localGameSource.includes('activeRace') || !localGameSource.includes('finishQuickRace')) throw new Error('Persistent active race lifecycle is missing.');

const racePresentationSource = await fs.readFile(new URL('assets/js/ui/racePresentation.js', root), 'utf8');
if (!racePresentationSource.includes('showModal()') || !racePresentationSource.includes('data-race-player-progress') || !racePresentationSource.includes('RETURN TO PITS')) throw new Error('Blocking race playback UI is incomplete.');

const quickRaceSource = await fs.readFile(new URL('assets/js/screens/quickRace.js', root), 'utf8');
if (!quickRaceSource.includes('playRacePresentation') || !quickRaceSource.includes('START 1/4 MI RACE') || !quickRaceSource.includes('unlockLevel: 5') || !quickRaceSource.includes('data-race-distance')) throw new Error('V0.4D Quick Race progression UI is incomplete.');

if (!appSource.includes('scheduleWelcomeTutorial')) throw new Error('Fresh-login FTUE welcome retry guard is missing.');

const modules = [
  'assets/js/app.js',
  'assets/js/domain/LocalGameService.js',
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
];

for (const file of modules) {
  const source = await fs.readFile(new URL(file, root), 'utf8');
  new vm.SourceTextModule(source, { identifier: file });
}

console.log('Static identity + race presentation build smoke test passed.');


const garageSource = await fs.readFile(new URL('assets/js/screens/garage.js', root), 'utf8');
if (!garageSource.includes('garage-inventory-dialog') || !garageSource.includes('data-inventory-car')) throw new Error('Garage Inventory UI is missing.');

const partsSourceV04b = await fs.readFile(new URL('assets/js/screens/parts.js', root), 'utf8');
if (!partsSourceV04b.includes('parts-category-grid') || !partsSourceV04b.includes('BUY THE STAGE 1 INTAKE') || !partsSourceV04b.includes('"suspension"')) throw new Error('V0.4D guided Parts UI is missing.');

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
if (!html.includes('BUILD TYPES') || !showroomSourceV04c.includes('Street Car') || !html.includes('Build Types only move forward.')) {
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
if (!usedLotSourceV04d.includes('D CLASS STARTERS') || !usedLotSourceV04d.includes('SELECT THIS CAR')) {
  throw new Error('Classifieds starter selection flow is missing.');
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
if (!racePresentationSourceV04d.includes('ratio >= 0.52 && ratio < 0.68') || !racePresentationSourceV04d.includes('RED LIGHT • YOU LEFT BEFORE GREEN')) {
  throw new Error('Drag-tree timing fix is missing.');
}
console.log('V0.4D guided FTUE, unlock progression and race-gating checks passed.');

