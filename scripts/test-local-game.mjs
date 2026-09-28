import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { LocalGameService } from '../assets/js/domain/LocalGameService.js';

const [cars, parts, config, buildStageConfig] = await Promise.all([
  fs.readFile(new URL('../data/catalog/cars.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/catalog/parts.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/game.json', import.meta.url), 'utf8').then(JSON.parse),
  fs.readFile(new URL('../data/config/build-stages.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const game = new LocalGameService({ cars, parts, config, buildStages: buildStageConfig.stages });
let player = game.defaultPlayer();

assert.equal(player.wallet.credits, 75000);
assert.equal(player.tutorial.step, 'welcome');
assert.equal(player.garage.length, 0);

player = game.tutorialAdvance(player, 'welcome_complete');
assert.equal(player.tutorial.step, 'buy_first_car');

assert.throws(() => game.purchaseNewCar(player, 10), /starter cars/i);
player = game.purchaseNewCar(player, 1);
assert.equal(player.garage.length, 1);
assert.equal(player.garage[0].buildStage, 1);
assert.equal(player.garage[0].visual.sprites.topDown.sheet, 'assets/art/cars/cars-top-down-v1.png');
assert.equal(player.garage[0].visual.sprites.topDown.index, 0);
assert.equal(player.garage[0].visual.sprites.sideProfile.src, 'assets/art/cars/vehicles/1998-honda-civic-dx-side-profile.png');
assert.equal(player.garage[0].visual.sprites.topDown.src, 'assets/art/cars/vehicles/1998-honda-civic-dx-top-down-v03a.png');
assert.equal(player.selectedCarId, player.garage[0].carId);
assert.equal(player.wallet.credits, 65500);
assert.equal(player.tutorial.step, 'visit_garage');

const legacyPlayer = structuredClone(player);
legacyPlayer.garage[0].visual = { profile: 'compact', color: '#6d9bb8' };
const migratedLegacy = game.normalizePlayer(legacyPlayer);
assert.equal(migratedLegacy.garage[0].visual.sprites.topDown.index, 0);
assert.equal(migratedLegacy.garage[0].visual.sprites.topDown.src, 'assets/art/cars/vehicles/1998-honda-civic-dx-top-down-v03a.png');

player = game.tutorialAdvance(player, 'garage_explained');
assert.equal(player.tutorial.step, 'buy_first_upgrade');

player = game.purchasePart(player, 's1_intake_1');
assert.equal(player.tutorial.step, 'install_first_upgrade');
let intake1 = player.inventory.parts.find((row) => row.catalogId === 's1_intake_1');
player = game.installPart(player, intake1.inventoryId, player.selectedCarId);
assert.equal(player.garage[0].derived.hp, 109);
assert.equal(player.tutorial.step, 'build_stages');

player = game.tutorialAdvance(player, 'build_stages_explained');
assert.equal(player.tutorial.step, 'first_race');

const firstRace = game.quickRace(player);
player = firstRace.player;
assert.equal(player.stats.races, 1);
assert.equal(player.tutorial.status, 'complete');
assert.equal(player.tutorial.step, 'complete');
assert.ok(player.progression.rep >= 27);
assert.ok(firstRace.race.reward > 0);

player = game.purchasePart(player, 's1_intake_2');
let intake2 = player.inventory.parts.find((row) => row.catalogId === 's1_intake_2');
player = game.installPart(player, intake2.inventoryId, player.selectedCarId);
assert.throws(() => game.installPart(player, intake1.inventoryId, player.selectedCarId), /cannot be downgraded/i);

const categories = ['intake', 'exhaust', 'ecu', 'fuel', 'drivetrain', 'tires', 'weight'];
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

player = game.roguelikeStart(player);
assert.ok(player.roguelike.activeRun);
const step = game.roguelikeStep(player, 'safe');
assert.ok(step.step && typeof step.step.won === 'boolean');

console.log('FTUE + Build Stage local game flow test passed.');
