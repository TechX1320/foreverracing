import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const docs = new URL('../docs/', import.meta.url);
const required = [
  'index.html',
  'assets/css/app.css',
  'assets/art/cars/cars-top-down-v1.png',
  'assets/art/cars/vehicles/1998-honda-civic-dx-top-down.png',
  'assets/art/cars/vehicles/2003-nissan-350z-top-down.png',
  'assets/art/cars/vehicles/2004-subaru-impreza-wrx-sti-top-down.png',
  'assets/art/cars/vehicles/2005-ford-mustang-gt-top-down.png',
  'assets/js/app.js',
  'assets/js/storage/LocalStorageProvider.js',
  'assets/js/domain/LocalGameService.js',
  'assets/js/ui/vehicleRenderer.js',
  'data/catalog/cars.json',
  'data/catalog/parts.json',
  'data/catalog/engines.json',
  'data/config/game.json',
  'data/config/build-stages.json',
  '.nojekyll',
];

for (const file of required) {
  await fs.access(new URL(file, docs));
}

const html = await fs.readFile(new URL('index.html', docs), 'utf8');
if (!html.includes('data-storage-mode="local"')) throw new Error('Static index is not configured for local storage mode.');
if (!html.includes('CURRENT BUILD')) throw new Error('Static index is missing the dense V0.2 game shell.');
if (html.includes('<?php')) throw new Error('Static index still contains PHP source.');

const carCatalog = JSON.parse(await fs.readFile(new URL('data/catalog/cars.json', docs), 'utf8'));
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
