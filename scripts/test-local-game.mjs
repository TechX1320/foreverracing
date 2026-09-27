import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { LocalGameService } from '../assets/js/domain/LocalGameService.js';

const [cars, parts, config] = await Promise.all([
  fs.readFile(new URL('../data/catalog/cars.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/catalog/parts.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/game.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const game = new LocalGameService({ cars, parts, config });
let player = game.defaultPlayer();
assert.equal(player.wallet.credits, 75000);
assert.equal(player.garage.length, 0);

player = game.purchaseNewCar(player, 10);
assert.equal(player.garage.length, 1);
assert.equal(player.selectedCarId, player.garage[0].carId);
assert.equal(player.wallet.credits, 53600);

player = game.purchasePart(player, 'intake_street_1');
const part = player.inventory.parts[0];
player = game.installPart(player, part.inventoryId, player.selectedCarId);
assert.equal(player.garage[0].derived.hp, 157);

player = game.renameCar(player, player.selectedCarId, 'Daily AWD');
assert.equal(player.garage[0].nickname, 'Daily AWD');

const lot = game.generateUsedLot();
assert.ok(lot.listings.length >= 4);
assert.ok(lot.expiresAt > lot.generatedAt);

const race = game.quickRace(player);
player = race.player;
assert.equal(player.stats.races, 1);
assert.ok(typeof race.race.won === 'boolean');
assert.ok(race.race.reward > 0);

player = game.roguelikeStart(player);
assert.ok(player.roguelike.activeRun);
const step = game.roguelikeStep(player, 'safe');
assert.ok(step.step && typeof step.step.won === 'boolean');

console.log('Local game flow test passed.');
