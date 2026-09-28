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
if (!html.includes('data-build="0.4.0-c"')) throw new Error('Static index is missing the V0.4B build marker.');
if (html.includes('<?php')) throw new Error('Static index still contains PHP source.');

const carCatalog = JSON.parse(await fs.readFile(new URL('data/catalog/cars.json', docs), 'utf8'));
const starters = carCatalog.filter((car) => car.starter);
if (starters.length !== 3) throw new Error('Expected three starter cars.');
if (!starters.every((car) => String(car?.visual?.sprites?.sideProfile?.src || '').includes('-side-profile.png'))) throw new Error('Starter cars must define side-profile art.');
if (!starters.every((car) => String(car?.visual?.sprites?.topDown?.src || '').includes('-top-down'))) throw new Error('Starter cars must define top-down race art.');

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
if (buildStages.stages?.[0]?.name !== 'Street Car' || buildStages.stages?.[1]?.name !== 'Street Race Car') throw new Error('Named V0.4B build types are missing.');

const raceConfig = JSON.parse(await fs.readFile(new URL('data/config/racing.json', docs), 'utf8'));
if (!raceConfig.distances?.['1/4'] || !raceConfig.distances?.['1/2'] || !raceConfig.distances?.['1']) throw new Error('All three race distances must be configured.');
if ((raceConfig.weather || []).length < 10 || (raceConfig.locations || []).length < 20) throw new Error('TextTuned weather/location pools are incomplete.');
if (raceConfig.version < 2 || !raceConfig.presentation?.stagingMs || raceConfig.presentation?.timeScale !== 1) throw new Error('V0.4A real-time race presentation config is incomplete.');

const localProviderSource = await fs.readFile(new URL('assets/js/storage/LocalStorageProvider.js', root), 'utf8');
if (!localProviderSource.includes('localStorage.removeItem(PLAYER_KEY)')) throw new Error('Admin local logout must erase player data.');
if (!localProviderSource.includes('already logged in in this browser')) throw new Error('Local duplicate-login guard is missing.');
if (!localProviderSource.includes('startQuickRace') || !localProviderSource.includes('finishQuickRace')) throw new Error('Local two-phase race storage lifecycle is missing.');

const localGameSource = await fs.readFile(new URL('assets/js/domain/LocalGameService.js', root), 'utf8');
if (!localGameSource.includes('activeRace') || !localGameSource.includes('finishQuickRace')) throw new Error('Persistent active race lifecycle is missing.');

const racePresentationSource = await fs.readFile(new URL('assets/js/ui/racePresentation.js', root), 'utf8');
if (!racePresentationSource.includes('showModal()') || !racePresentationSource.includes('data-race-player-progress') || !racePresentationSource.includes('RETURN TO PITS')) throw new Error('Blocking race playback UI is incomplete.');

const quickRaceSource = await fs.readFile(new URL('assets/js/screens/quickRace.js', root), 'utf8');
if (!quickRaceSource.includes('V0.4A RACE PRESENTATION') || !quickRaceSource.includes('playRacePresentation') || !quickRaceSource.includes('data-race-distance')) throw new Error('V0.4A race presentation screen is missing.');

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
if (!partsSourceV04b.includes('parts-category-grid') || !partsSourceV04b.includes('Purchasing puts the part')) throw new Error('Category-based Parts UI is missing.');

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
if (!appSource.includes('Build Types') || !showroomSourceV04c.includes('as a Street Car') || !html.includes('Build Types only move forward.')) {
  throw new Error('Named Build Type terminology is incomplete.');
}
console.log('V0.4C readability and terminology checks passed.');

