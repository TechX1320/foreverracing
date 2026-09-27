const clone = (value) => value == null ? value : structuredClone(value);
const now = () => Math.floor(Date.now() / 1000);
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (rows) => rows[randomInt(0, rows.length - 1)];

export class LocalGameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'LocalGameError';
    this.status = status;
  }
}

export class LocalGameService {
  constructor({ cars, parts, config, buildStages = [] }) {
    this.cars = clone(cars || []);
    this.parts = clone(parts || []);
    this.buildStages = clone(buildStages || []);
    this.config = {
      schemaVersion: Number(config?.schemaVersion || 3),
      tutorialVersion: Number(config?.tutorialVersion || 1),
      startingCredits: Number(config?.startingCredits || 75000),
      usedLotRefreshSeconds: Number(config?.usedLotRefreshSeconds || 1800),
      tutorialCompletionCredits: Number(config?.tutorialCompletionCredits || 2500),
      tutorialCompletionRep: Number(config?.tutorialCompletionRep || 25),
    };
  }

  defaultPlayer() {
    const timestamp = now();
    return {
      schemaVersion: this.config.schemaVersion,
      user: { id: 1, username: 'Admin', createdAt: timestamp },
      wallet: { credits: this.config.startingCredits },
      progression: { level: 1, rep: 0 },
      tutorial: { version: this.config.tutorialVersion, status: 'active', step: 'welcome', completedSteps: [] },
      stats: { races: 0, wins: 0, losses: 0, bestReaction: null, showroomPurchases: 0, usedPurchases: 0, partsPurchased: 0 },
      selectedCarId: null,
      garage: [],
      inventory: { parts: [] },
      roguelike: { activeRun: null, bestStage: 0, runsStarted: 0, runsCompleted: 0 },
      transactions: [],
      meta: { createdAt: timestamp, updatedAt: timestamp },
    };
  }

  normalizePlayer(input) {
    const defaults = this.defaultPlayer();
    const player = clone(input && typeof input === 'object' ? input : {});
    player.schemaVersion = this.config.schemaVersion;
    player.user = { ...defaults.user, ...(player.user || {}) };
    player.wallet = { ...defaults.wallet, ...(player.wallet || {}) };
    player.progression = { ...defaults.progression, ...(player.progression || {}) };
    player.tutorial = { ...defaults.tutorial, ...(player.tutorial || {}) };
    player.tutorial.completedSteps = Array.isArray(player.tutorial.completedSteps) ? player.tutorial.completedSteps : [];
    player.stats = { ...defaults.stats, ...(player.stats || {}) };
    player.garage = Array.isArray(player.garage) ? player.garage.map((car) => this.normalizeCar(car)) : [];
    player.inventory = player.inventory && typeof player.inventory === 'object' ? player.inventory : clone(defaults.inventory);
    player.inventory.parts = Array.isArray(player.inventory.parts) ? player.inventory.parts : [];
    player.roguelike = { ...defaults.roguelike, ...(player.roguelike || {}) };
    player.transactions = Array.isArray(player.transactions) ? player.transactions : [];
    player.meta = { ...defaults.meta, ...(player.meta || {}) };
    player.selectedCarId = player.selectedCarId || null;
    player.stats.carsOwned = player.garage.length;
    player.progression.rep = Number(player.progression.rep || 0);
    player.progression.level = Math.max(1, 1 + Math.floor(player.progression.rep / 100));
    return player;
  }

  purchaseNewCar(inputPlayer, stockId) {
    const spec = this.findBy(this.cars, 'stockId', Number(stockId));
    if (!spec) throw new LocalGameError('That showroom car does not exist.', 404);
    return this.mutate(inputPlayer, (player) => {
      if (player.tutorial?.status === 'active' && player.tutorial?.step === 'buy_first_car' && !spec.starter) {
        throw new LocalGameError('Choose one of the highlighted starter cars for your first build.');
      }
      const price = Number(spec.price || 0);
      this.requireCredits(player, price);
      player.wallet.credits -= price;
      const car = this.createOwnedCar(spec, 'new', 0, 100, price);
      player.garage.push(car);
      player.stats.showroomPurchases = Number(player.stats.showroomPurchases || 0) + 1;
      if (!player.selectedCarId) player.selectedCarId = car.carId;
      this.addTransaction(player, 'showroom_purchase', -price, car.displayName);
      if (player.tutorial?.status === 'active' && player.tutorial?.step === 'buy_first_car') {
        this.completeTutorialStep(player, 'buy_first_car', 'visit_garage');
      }
    });
  }

  selectCar(inputPlayer, carId) {
    return this.mutate(inputPlayer, (player) => {
      this.requireOwnedCar(player, carId);
      player.selectedCarId = carId;
    });
  }

  renameCar(inputPlayer, carId, rawName) {
    const name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 32) throw new LocalGameError('Car name must be between 1 and 32 characters.');
    return this.mutate(inputPlayer, (player) => {
      const index = this.requireOwnedCarIndex(player, carId);
      player.garage[index].nickname = name;
    });
  }

  purchasePart(inputPlayer, catalogId) {
    const spec = this.findBy(this.parts, 'catalogId', String(catalogId));
    if (!spec) throw new LocalGameError('That part does not exist.', 404);
    return this.mutate(inputPlayer, (player) => {
      const car = this.selectedCar(player);
      if (!car) throw new LocalGameError('Select a car before buying build parts.');
      this.requirePartCompatible(player, car, spec, { purchasing: true });
      const price = Number(spec.price || 0);
      this.requireCredits(player, price);
      player.wallet.credits -= price;
      player.inventory.parts.push({ inventoryId: this.id('part'), catalogId: String(spec.catalogId), installedOnCarId: null, purchasedAt: now() });
      player.stats.partsPurchased = Number(player.stats.partsPurchased || 0) + 1;
      this.addTransaction(player, 'part_purchase', -price, String(spec.name || 'Part'));
      if (player.tutorial?.status === 'active' && player.tutorial?.step === 'buy_first_upgrade') {
        this.completeTutorialStep(player, 'buy_first_upgrade', 'install_first_upgrade');
      }
    });
  }

  installPart(inputPlayer, inventoryId, carId) {
    return this.mutate(inputPlayer, (player) => {
      const carIndex = this.requireOwnedCarIndex(player, carId);
      const partIndex = this.requireOwnedPartIndex(player, inventoryId);
      const instance = player.inventory.parts[partIndex];
      const previousCarId = instance.installedOnCarId || null;
      const spec = this.findBy(this.parts, 'catalogId', String(instance.catalogId || ''));
      if (!spec) throw new LocalGameError('Part catalog entry is missing.', 500);
      const car = player.garage[carIndex];
      this.requirePartCompatible(player, car, spec, { purchasing: false });

      const slot = String(spec.slot || '');
      if (Number(car.buildStage || 1) === 1 && Number(spec.simpleTier || 0) > 0) {
        const currentTier = this.installedSimpleTier(player, carId, String(spec.categoryKey || slot));
        if (Number(spec.simpleTier) < currentTier) throw new LocalGameError('Stage 1 upgrades cannot be downgraded.');
      }

      for (const ownedPart of player.inventory.parts) {
        if (ownedPart.installedOnCarId !== carId) continue;
        const installedSpec = this.findBy(this.parts, 'catalogId', String(ownedPart.catalogId || ''));
        if (installedSpec && String(installedSpec.slot || '') === slot) ownedPart.installedOnCarId = null;
      }

      player.inventory.parts[partIndex].installedOnCarId = carId;
      player.garage[carIndex] = this.recalculateCar(player.garage[carIndex], player.inventory.parts);
      if (previousCarId && previousCarId !== carId) {
        const previousIndex = this.requireOwnedCarIndex(player, previousCarId);
        player.garage[previousIndex] = this.recalculateCar(player.garage[previousIndex], player.inventory.parts);
      }
      if (player.tutorial?.status === 'active' && player.tutorial?.step === 'install_first_upgrade') {
        this.completeTutorialStep(player, 'install_first_upgrade', 'build_stages');
      }
    });
  }

  uninstallPart(inputPlayer, inventoryId) {
    return this.mutate(inputPlayer, (player) => {
      const partIndex = this.requireOwnedPartIndex(player, inventoryId);
      const carId = player.inventory.parts[partIndex].installedOnCarId || null;
      const spec = this.findBy(this.parts, 'catalogId', String(player.inventory.parts[partIndex].catalogId || ''));
      if (carId && spec?.simpleTier) {
        const car = this.requireOwnedCar(player, carId);
        if (Number(car.buildStage || 1) === 1) throw new LocalGameError('Stage 1 upgrades are permanent progression and cannot be downgraded.');
      }
      player.inventory.parts[partIndex].installedOnCarId = null;
      if (carId) {
        const carIndex = this.requireOwnedCarIndex(player, carId);
        player.garage[carIndex] = this.recalculateCar(player.garage[carIndex], player.inventory.parts);
      }
    });
  }

  stageUp(inputPlayer, carId) {
    return this.mutate(inputPlayer, (player) => {
      const index = this.requireOwnedCarIndex(player, carId);
      const car = player.garage[index];
      if (Number(car.buildStage || 1) !== 1) throw new LocalGameError('Only the Stage 1 to Stage 2 conversion is enabled in this build.');
      const required = this.buildStages?.[0]?.requiredCategories || ['intake','exhaust','ecu','fuel','drivetrain','tires','weight'];
      const incomplete = required.filter((key) => this.installedSimpleTier(player, carId, key) < 3);
      if (incomplete.length) throw new LocalGameError('Max every Stage 1 category before converting to Stage 2.');
      car.stageBaseline = clone(car.derived);
      car.buildStage = 2;
      for (const ownedPart of player.inventory.parts) {
        if (ownedPart.installedOnCarId !== carId) continue;
        const partSpec = this.findBy(this.parts, 'catalogId', String(ownedPart.catalogId || ''));
        if (partSpec?.simpleTier) ownedPart.installedOnCarId = null;
      }
      player.garage[index] = this.recalculateCar(car, player.inventory.parts);
      this.addTransaction(player, 'stage_conversion', 0, `${this.carName(car)} converted to Build Stage 2`);
    });
  }

  tutorialAdvance(inputPlayer, action) {
    return this.mutate(inputPlayer, (player) => {
      const step = player.tutorial?.step;
      if (action === 'welcome_complete' && step === 'welcome') {
        this.completeTutorialStep(player, 'welcome', player.garage.length ? 'visit_garage' : 'buy_first_car');
      } else if (action === 'garage_explained' && step === 'visit_garage') {
        this.completeTutorialStep(player, 'visit_garage', 'buy_first_upgrade');
      } else if (action === 'build_stages_explained' && step === 'build_stages') {
        this.completeTutorialStep(player, 'build_stages', 'first_race');
      }
    });
  }

  tutorialReset(inputPlayer) {
    return this.mutate(inputPlayer, (player) => {
      player.tutorial = { version: this.config.tutorialVersion, status: 'active', step: 'welcome', completedSteps: [] };
    });
  }

  generateUsedLot() {
    const timestamp = now();
    if (!this.cars.length) return { generatedAt: timestamp, expiresAt: timestamp + this.config.usedLotRefreshSeconds, listings: [] };
    const listings = [];
    const count = Math.min(8, Math.max(4, this.cars.length));
    for (let i = 0; i < count; i += 1) {
      const spec = randomChoice(this.cars);
      const mileage = randomInt(2800, 195000);
      const condition = randomInt(62, 96);
      const ageDiscount = Math.min(0.55, mileage / 360000);
      const conditionFactor = 0.55 + (condition / 220);
      let price = Math.round((Number(spec.price || 0) * (1 - ageDiscount) * conditionFactor) / 50) * 50;
      price = Math.max(1200, price);
      listings.push({ listingId: this.id('used'), stockId: Number(spec.stockId), price, mileage, condition });
    }
    return { generatedAt: timestamp, expiresAt: timestamp + this.config.usedLotRefreshSeconds, listings };
  }

  purchaseUsedCar(inputPlayer, lot, listingId) {
    const listing = this.findBy(lot?.listings || [], 'listingId', listingId);
    if (!listing) throw new LocalGameError('That used listing is no longer available.', 404);
    const spec = this.findBy(this.cars, 'stockId', Number(listing.stockId));
    if (!spec) throw new LocalGameError('Vehicle catalog entry is missing.', 500);
    const player = this.mutate(inputPlayer, (draft) => {
      const price = Number(listing.price || 0);
      this.requireCredits(draft, price);
      draft.wallet.credits -= price;
      const car = this.createOwnedCar(spec, 'used', Number(listing.mileage || 0), Number(listing.condition || 100), price);
      draft.garage.push(car);
      draft.stats.usedPurchases = Number(draft.stats.usedPurchases || 0) + 1;
      if (!draft.selectedCarId) draft.selectedCarId = car.carId;
      this.addTransaction(draft, 'used_purchase', -price, car.displayName);
    });
    const nextLot = clone(lot);
    nextLot.listings = (nextLot.listings || []).filter((row) => String(row.listingId) !== String(listingId));
    return { player, lot: nextLot };
  }

  quickRace(inputPlayer) {
    let race = null;
    const player = this.mutate(inputPlayer, (draft) => {
      const car = this.selectedCar(draft);
      if (!car) throw new LocalGameError('Select a car before racing.');
      const hp = Math.max(1, Number(car.derived?.hp || 1));
      const weight = Math.max(500, Number(car.derived?.weight || 500));
      const grip = Math.max(0.5, Number(car.derived?.grip || 1));
      const playerPwr = hp / weight;
      const difficulty = randomInt(92, 108) / 100;
      const oppPwr = playerPwr * difficulty;
      const oppWeight = Math.round(weight * (randomInt(92, 108) / 100));
      const oppHp = Math.round(oppPwr * oppWeight);
      const reaction = randomInt(80, 420) / 1000;
      const oppReaction = randomInt(100, 450) / 1000;
      const playerEt = Math.max(6.2, round3(17.6 - (playerPwr * 38) - ((grip - 1) * 0.45) + reaction + (randomInt(-12, 12) / 100)));
      const opponentEt = Math.max(6.2, round3(17.6 - (oppPwr * 38) + oppReaction + (randomInt(-12, 12) / 100)));
      const won = playerEt < opponentEt;
      const reward = won ? randomInt(450, 850) : randomInt(90, 220);
      draft.wallet.credits += reward;
      draft.progression.rep = Number(draft.progression.rep || 0) + (won ? 5 : 2);
      draft.stats.races = Number(draft.stats.races || 0) + 1;
      draft.stats[won ? 'wins' : 'losses'] = Number(draft.stats[won ? 'wins' : 'losses'] || 0) + 1;
      if (draft.stats.bestReaction == null || reaction < Number(draft.stats.bestReaction)) draft.stats.bestReaction = reaction;
      this.addTransaction(draft, 'race_reward', reward, won ? 'Quick Race win' : 'Quick Race participation');
      if (draft.tutorial?.status === 'active' && draft.tutorial?.step === 'first_race') {
        draft.wallet.credits += this.config.tutorialCompletionCredits;
        draft.progression.rep += this.config.tutorialCompletionRep;
        this.addTransaction(draft, 'tutorial_reward', this.config.tutorialCompletionCredits, 'FTUE completion reward');
        this.completeTutorialStep(draft, 'first_race', null);
        draft.tutorial.status = 'complete';
        draft.tutorial.step = 'complete';
      }
      race = { won, reaction, playerEt, opponentEt, opponent: { name: this.opponentName(), hp: oppHp, weight: oppWeight }, reward, carName: this.carName(car) };
    });
    return { player, race };
  }

  roguelikeStart(inputPlayer) {
    return this.mutate(inputPlayer, (player) => {
      if (!this.selectedCar(player)) throw new LocalGameError('Select a car before starting a RogueLike run.');
      if (player.roguelike.activeRun && typeof player.roguelike.activeRun === 'object') throw new LocalGameError('A RogueLike run is already active.');
      player.roguelike.runsStarted = Number(player.roguelike.runsStarted || 0) + 1;
      player.roguelike.activeRun = {
        runId: this.id('run'), stage: 1, maxStages: 7, runCredits: 0, boost: 0, startedAt: now(), lastResult: null,
      };
    });
  }

  roguelikeStep(inputPlayer, choice) {
    if (!['safe', 'push'].includes(choice)) throw new LocalGameError('Unknown run choice.');
    let step = null;
    const player = this.mutate(inputPlayer, (draft) => {
      const run = draft.roguelike.activeRun;
      if (!run || typeof run !== 'object') throw new LocalGameError('No active RogueLike run.');
      const car = this.selectedCar(draft);
      if (!car) throw new LocalGameError('Your selected car is missing.');
      const stage = Number(run.stage || 1);
      const risk = choice === 'push' ? 1.09 : 0.99;
      const boost = Number(run.boost || 0);
      const rating = (Number(car.derived?.hp || 1) / Math.max(500, Number(car.derived?.weight || 500))) * (1 + boost);
      const difficulty = rating * (0.88 + stage * 0.035) * risk;
      const roll = (randomInt(930, 1070) / 1000) * rating;
      const won = roll >= difficulty;
      const reward = won ? Math.round((420 + stage * 180) * (choice === 'push' ? 1.45 : 1)) : 0;
      if (!won) {
        const banked = Math.floor(Number(run.runCredits || 0) * 0.35);
        draft.wallet.credits += banked;
        this.addTransaction(draft, 'roguelike_cashout', banked, 'RogueLike consolation');
        draft.roguelike.bestStage = Math.max(Number(draft.roguelike.bestStage || 0), stage);
        draft.roguelike.activeRun = null;
        step = { won: false, stage, banked, finished: true };
        return;
      }
      run.runCredits = Number(run.runCredits || 0) + reward;
      run.boost = Math.min(0.16, boost + (choice === 'push' ? 0.03 : 0.015));
      const finished = stage >= Number(run.maxStages || 7);
      if (finished) {
        const banked = Number(run.runCredits || 0);
        draft.wallet.credits += banked;
        this.addTransaction(draft, 'roguelike_cashout', banked, 'RogueLike complete');
        draft.roguelike.runsCompleted = Number(draft.roguelike.runsCompleted || 0) + 1;
        draft.roguelike.bestStage = Math.max(Number(draft.roguelike.bestStage || 0), stage);
        draft.roguelike.activeRun = null;
        step = { won: true, stage, reward, banked, finished: true };
        return;
      }
      run.lastResult = { won: true, stage, reward, choice };
      run.stage = stage + 1;
      draft.roguelike.bestStage = Math.max(Number(draft.roguelike.bestStage || 0), stage);
      draft.roguelike.activeRun = run;
      step = { won: true, stage, reward, finished: false };
    });
    return { player, step };
  }

  mutate(inputPlayer, mutator) {
    const player = this.normalizePlayer(inputPlayer);
    mutator(player);
    const normalized = this.normalizePlayer(player);
    normalized.meta.updatedAt = now();
    return normalized;
  }

  selectedCar(player) {
    return (player.garage || []).find((car) => String(car.carId) === String(player.selectedCarId)) || null;
  }

  normalizeCar(inputCar) {
    const car = clone(inputCar || {});
    const spec = this.findBy(this.cars, 'stockId', Number(car.stockId));
    car.buildStage = Math.max(1, Number(car.buildStage || 1));
    car.stageBaseline = car.stageBaseline && typeof car.stageBaseline === 'object' ? car.stageBaseline : null;
    car.factoryEngineId = car.factoryEngineId || spec?.factoryEngineId || null;
    car.engineId = car.engineId || car.factoryEngineId || null;
    car.engineBay = car.engineBay || clone(spec?.engineBay || null);
    car.visual = car.visual || clone(spec?.visual || { profile: 'sedan', color: '#78838d' });
    return car;
  }

  createOwnedCar(spec, source, mileage, condition, purchasePrice) {
    const base = spec.base || {};
    return {
      carId: this.id('car'),
      stockId: Number(spec.stockId),
      displayName: `${Number(spec.year)} ${String(spec.make)} ${String(spec.model)}`,
      nickname: '', source, purchasePrice, mileage, condition, buildStage: 1, stageBaseline: null,
      factoryEngineId: spec.factoryEngineId || null, engineId: spec.factoryEngineId || null, engineBay: clone(spec.engineBay || null), visual: clone(spec.visual || { profile: 'sedan', color: '#78838d' }),
      base: { hp: Number(base.hp), torque: Number(base.torque), weight: Number(base.weight), grip: Number(base.grip || 1), drivetrain: String(base.drivetrain || 'FWD') },
      derived: { hp: Number(base.hp), torque: Number(base.torque), weight: Number(base.weight), grip: Number(base.grip || 1) },
      createdAt: now(),
    };
  }

  recalculateCar(inputCar, inventory) {
    const car = this.normalizeCar(inputCar);
    const seed = Number(car.buildStage || 1) >= 2 && car.stageBaseline ? car.stageBaseline : car.base;
    const derived = { hp: Number(seed.hp), torque: Number(seed.torque), weight: Number(seed.weight), grip: Number(seed.grip || 1) };
    const installedParts = [];
    for (const instance of inventory) {
      if (instance.installedOnCarId !== car.carId) continue;
      const spec = this.findBy(this.parts, 'catalogId', String(instance.catalogId || ''));
      if (!spec) continue;
      installedParts.push(instance.inventoryId);
      for (const effect of spec.effects || []) {
        const stat = String(effect.stat || '');
        if (!(stat in derived)) continue;
        const value = Number(effect.value || 0);
        if (String(effect.op || 'add') === 'mul') derived[stat] *= value;
        else derived[stat] += value;
      }
    }
    car.derived = { hp: Math.round(Math.max(1, derived.hp)), torque: Math.round(Math.max(1, derived.torque)), weight: Math.round(Math.max(500, derived.weight)), grip: Math.round(Math.max(0.5, derived.grip) * 1000) / 1000 };
    car.installedParts = installedParts;
    return car;
  }

  installedSimpleTier(player, carId, categoryKey) {
    let tier = 0;
    for (const instance of player.inventory?.parts || []) {
      if (String(instance.installedOnCarId || '') !== String(carId)) continue;
      const spec = this.findBy(this.parts, 'catalogId', String(instance.catalogId || ''));
      if (spec && String(spec.categoryKey || '') === String(categoryKey) && Number(spec.simpleTier || 0) > tier) tier = Number(spec.simpleTier);
    }
    return tier;
  }

  requirePartCompatible(player, car, spec, { purchasing = false } = {}) {
    const stage = Number(car.buildStage || 1);
    if (stage === 1) {
      if (Number(spec.buildStage || 1) !== 1 || !Number(spec.simpleTier || 0)) throw new LocalGameError('Stage 1 cars use the simple three-level upgrade path.');
      const currentTier = this.installedSimpleTier(player, car.carId, String(spec.categoryKey || spec.slot || ''));
      if (purchasing && Number(spec.simpleTier) !== currentTier + 1) throw new LocalGameError(`Complete the previous ${spec.category} upgrade first.`);
      if (!purchasing && Number(spec.simpleTier) < currentTier) throw new LocalGameError('Stage 1 upgrades cannot be downgraded.');
      return;
    }
    if (spec.simpleTier) throw new LocalGameError('Simple Stage 1 parts are incorporated into the Stage 2 conversion.');
    if (Number(spec.buildStage || 2) > stage) throw new LocalGameError(`This part requires Build Stage ${spec.buildStage}.`);
    if (Number(spec.persistentFromStage || spec.buildStage || 2) > stage) throw new LocalGameError('This part is not available at the current Build Stage.');
  }

  completeTutorialStep(player, completed, next) {
    const list = Array.isArray(player.tutorial?.completedSteps) ? player.tutorial.completedSteps : [];
    if (!list.includes(completed)) list.push(completed);
    player.tutorial.completedSteps = list;
    if (next) player.tutorial.step = next;
  }

  requireCredits(player, amount) {
    if (Number(player.wallet?.credits || 0) < amount) throw new LocalGameError('Not enough credits.');
  }

  requireOwnedCar(player, carId) {
    const car = (player.garage || []).find((row) => String(row.carId) === String(carId));
    if (!car) throw new LocalGameError('You do not own that car.', 404);
    return car;
  }

  requireOwnedCarIndex(player, carId) {
    const index = (player.garage || []).findIndex((row) => String(row.carId) === String(carId));
    if (index < 0) throw new LocalGameError('You do not own that car.', 404);
    return index;
  }

  requireOwnedPartIndex(player, inventoryId) {
    const index = (player.inventory?.parts || []).findIndex((row) => String(row.inventoryId) === String(inventoryId));
    if (index < 0) throw new LocalGameError('You do not own that part.', 404);
    return index;
  }

  addTransaction(player, type, amount, description) {
    player.transactions.push({ transactionId: this.id('txn'), type, amount, description, createdAt: now() });
    if (player.transactions.length > 75) player.transactions = player.transactions.slice(-75);
  }

  findBy(rows, key, value) {
    return (rows || []).find((row) => String(row?.[key] ?? '') === String(value)) || null;
  }

  id(prefix) {
    const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 8)
      || Math.random().toString(16).slice(2, 10).padEnd(8, '0');
    return `${prefix}_${now().toString(16)}_${random}`;
  }

  carName(car) {
    const nickname = String(car.nickname || '').trim();
    return nickname || String(car.displayName || 'Unknown Car');
  }

  opponentName() {
    return randomChoice(['Night Shift', 'Redline', 'The Commuter', 'Left Lane', 'Cut Light', 'Sleeper', 'Boost Leak', 'Test Mule']);
  }
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
