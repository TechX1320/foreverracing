import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const docs = new URL('../docs/', import.meta.url);
const required = [
  'index.html',
  'assets/js/app.js',
  'assets/js/storage/LocalStorageProvider.js',
  'assets/js/domain/LocalGameService.js',
  'data/catalog/cars.json',
  'data/catalog/parts.json',
  'data/config/game.json',
  '.nojekyll',
];

for (const file of required) {
  await fs.access(new URL(file, docs));
}

const html = await fs.readFile(new URL('index.html', docs), 'utf8');
if (!html.includes('data-storage-mode="local"')) throw new Error('Static index is not configured for local storage mode.');
if (html.includes('<?php')) throw new Error('Static index still contains PHP source.');

for (const file of ['data/catalog/cars.json', 'data/catalog/parts.json', 'data/config/game.json']) {
  JSON.parse(await fs.readFile(new URL(file, docs), 'utf8'));
}

const modules = [
  'assets/js/app.js',
  'assets/js/domain/LocalGameService.js',
  'assets/js/storage/StorageProvider.js',
  'assets/js/storage/ApiStorageProvider.js',
  'assets/js/storage/LocalStorageProvider.js',
  'assets/js/storage/createStorageProvider.js',
];

for (const file of modules) {
  const source = await fs.readFile(new URL(file, root), 'utf8');
  new vm.SourceTextModule(source, { identifier: file });
}

console.log('Static build smoke test passed.');
