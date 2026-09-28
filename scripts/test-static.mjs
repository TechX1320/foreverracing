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
if (!html.includes('data-build="0.3.0-b"')) throw new Error('Static index is missing the V0.3B build marker.');
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
if (runtimeConfig.schemaVersion < 4) throw new Error('V0.3B player schema version must be at least 4.');

const raceConfig = JSON.parse(await fs.readFile(new URL('data/config/racing.json', docs), 'utf8'));
if (!raceConfig.distances?.['1/4'] || !raceConfig.distances?.['1/2'] || !raceConfig.distances?.['1']) throw new Error('All three race distances must be configured.');
if ((raceConfig.weather || []).length < 10 || (raceConfig.locations || []).length < 20) throw new Error('TextTuned weather/location pools are incomplete.');

const localProviderSource = await fs.readFile(new URL('assets/js/storage/LocalStorageProvider.js', root), 'utf8');
if (!localProviderSource.includes('localStorage.removeItem(PLAYER_KEY)')) throw new Error('Admin local logout must erase player data.');
if (!localProviderSource.includes('already logged in in this browser')) throw new Error('Local duplicate-login guard is missing.');

const quickRaceSource = await fs.readFile(new URL('assets/js/screens/quickRace.js', root), 'utf8');
if (!quickRaceSource.includes('TEXTTUNED RACE CORE') || !quickRaceSource.includes('data-race-distance')) throw new Error('V0.3B race screen is missing.');

if (!appSource.includes('scheduleWelcomeTutorial')) throw new Error('Fresh-login FTUE welcome retry guard is missing.');

const modules = [
  'assets/js/app.js',
  'assets/js/domain/LocalGameService.js',
  'assets/js/ui/vehicleRenderer.js',
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

console.log('Static identity build smoke test passed.');
