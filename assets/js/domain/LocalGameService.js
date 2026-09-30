import { RaceSimulator } from './RaceSimulator.js';
import { benchmarkPerformance, performanceClassFromIndex } from './PerformanceIndex.js';
import { isContentReleased, nextScheduledReleaseAt } from './ContentRelease.js';
import {
  forcedInductionCompatibility,
  forcedInductionMeta,
  forcedInductionState,
  forcedInductionSwapNeeded,
} from './ForcedInduction.js';
const clone = (value) => value == null ? value : structuredClone(value);
const now = () => Math.floor(Date.now() / 1000);
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (rows) => rows[randomInt(0, rows.length - 1)];

function paintPalette(spec) {
  const colors = Array.isArray(spec?.visual?.paintPalette) ? spec.visual.paintPalette : [];
  return colors.map((value) => String(value || "").trim()).filter((value) => /^#[0-9a-f]{6}$/i.test(value));
}

function firstPaintColor(spec) {
  return paintPalette(spec)[0] || String(spec?.visual?.paintColor || "").trim() || null;
}

function randomPaintColor(spec) {
  const colors = paintPalette(spec);
  return colors.length ? randomChoice(colors) : firstPaintColor(spec);
}

function withPaintColor(visual, paintColor) {
  const next = visual && typeof visual === "object" ? visual : {};
  const color = String(paintColor || "").trim();
  if (color) next.paintColor = color;
  return next;
}

export class LocalGameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'LocalGameError';
    this.status = status;
  }
}

export class LocalGameService {
  constructor({ cars, parts, config, buildStages = [], racingConfig = {} }) {
    this.cars = clone(cars || []);
    this.parts = clone(parts || []);
    this.buildStages = clone(buildStages || []);
    this.racingConfig = clone(racingConfig || {});
    this.raceSimulator = new RaceSimulator(this.racingConfig);
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
      progression: { level: 1, exp: 0, rep: 0 },
      tutorial: { version: this.config.tutorialVersion, status: 'active', step: 'welcome', completedSteps: [] },
      stats: { races: 0, wins: 0, losses: 0, bestReaction: null, showroomPurchases: 0, usedPurchases: 0, partsPurchased: 0 },
      selectedCarId: null,
      garage: [],
      inventory: { parts: [] },
      roguelike: { activeRun: null, bestStage: 0, runsStarted: 0, runsCompleted: 0 },
      activeRace: null,
      raceHistory: [],
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
    if (player.tutorial.status === 'active' && player.tutorial.step === 'build_stages') player.tutorial.step = 'first_race';
    player.stats = { ...defaults.stats, ...(player.stats || {}) };
    player.garage = Array.isArray(player.garage) ? player.garage.map((car) => this.normalizeCar(car)) : [];
    player.inventory = player.inventory && typeof player.inventory === 'object' ? player.inventory : clone(defaults.inventory);
    player.inventory.parts = Array.isArray(player.inventory.parts) ? player.inventory.parts : [];
    player.roguelike = { ...defaults.roguelike, ...(player.roguelike || {}) };
    player.activeRace = player.activeRace && typeof player.activeRace === 'object' ? player.activeRace : null;
    player.raceHistory = Array.isArray(player.raceHistory) ? player.raceHistory : [];
    player.transactions = Array.isArray(player.transactions) ? player.transactions : [];
    player.meta = { ...defaults.meta, ...(player.meta || {}) };
    player.selectedCarId = player.selectedCarId || null;
    player.stats.carsOwned = player.garage.length;
    player.progression.rep = Number(player.progression.rep || 0);
    player.progression.exp = Number(player.progression.exp ?? player.progression.rep ?? 0);
    player.progression.level = this.levelFromExp(player.progression.exp);
    return player;
  }

  purchaseNewCar(inputPlayer, stockId) {
    const spec = this.findBy(this.cars, 'stockId', Number(stockId));
    if (!spec) throw new LocalGameError('That showroom car does not exist.', 404);
    return this.mutate(inputPlayer, (player) => {
      if (player.tutorial?.status === 'active' && player.tutorial?.step === 'buy_first_car') {
        throw new LocalGameError('Your first car comes from the Classifieds. Pick one of the starter cars and work your way up.');
      }
      if (player.tutorial?.status !== 'active' && Number(player.progression?.level || 1) < 5) {
        throw new LocalGameError('The Showroom unlocks at Level 5. Keep building through Classifieds first.');
      }
      if (spec?.market?.showroom !== true || !isContentReleased(spec)) {
        throw new LocalGameError('That showroom car is not currently released.', 404);
      }
      const price = Number(spec.price || 0);
      this.requireCredits(player, price);
      player.wallet.credits -= price;
      const car = this.createOwnedCar(spec, 'new', 0, 100, price, firstPaintColor(spec));
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
      if (player.tutorial?.status === 'active' && player.tutorial?.step === 'buy_first_upgrade' && String(spec.catalogId) !== 's1_intake_1') {
        throw new LocalGameError('For the tutorial, start with the Stage 1 Intake.');
      }
      const price = Number(spec.price || 0);
      this.requireCredits(player, price);
      player.wallet.credits -= price;
      player.inventory.parts.push({ inventoryId: this.id('part'), catalogId: String(spec.catalogId), purchasedForCarId: car.carId, installedOnCarId: null, purchasedAt: now() });
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
      if (player.tutorial?.status === 'active' && player.tutorial?.step === 'install_first_upgrade' && String(spec.catalogId) !== 's1_intake_1') {
        throw new LocalGameError('Install the Stage 1 Intake to continue the tutorial.');
      }
      this.requirePartCompatible(player, car, spec, { purchasing: false });

      const fiMeta = forcedInductionMeta(spec);
      if (fiMeta && String(fiMeta.role || '') === 'kit' && forcedInductionSwapNeeded(car, player.inventory.parts, spec, this.parts)) {
        const fiState = forcedInductionState(car, player.inventory.parts, this.parts);
        const previousSystem = String(fiState.primarySystem || '');
        for (const ownedPart of player.inventory.parts) {
          if (String(ownedPart.installedOnCarId || '') !== String(carId)) continue;
          const installedSpec = this.findBy(this.parts, 'catalogId', String(ownedPart.catalogId || ''));
          const installedMeta = forcedInductionMeta(installedSpec);
          if (!installedMeta || String(installedMeta.role || '') === 'nitrous') continue;
          if (String(installedMeta.system || '') === previousSystem) ownedPart.installedOnCarId = null;
        }
      }

      const slot = String(spec.slot || '');
      if (Number(car.buildStage || 1) === 1 && Number(spec.simpleTier || 0) > 0) {
        const currentTier = this.installedSimpleTier(player, carId, String(spec.categoryKey || slot));
        if (Number(spec.simpleTier) < currentTier) throw new LocalGameError('Street Car upgrades cannot be downgraded.');
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
        this.completeTutorialStep(player, 'install_first_upgrade', 'first_race');
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
        if (Number(car.buildStage || 1) === 1) throw new LocalGameError('Street Car upgrades are permanent progression and cannot be downgraded.');
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
      const stage = Number(car.buildStage || 1);

      if (stage === 1) {
        const required = this.buildStages?.[0]?.requiredCategories || ['intake','exhaust','ecu','fuel','drivetrain','suspension','tires','weight'];
        const incomplete = required.filter((key) => this.installedSimpleTier(player, carId, key) < 3);
        if (incomplete.length) throw new LocalGameError('Max every Street Car upgrade category before converting to a Street Race Car.');
        car.stageBaseline = clone(car.derived);
        car.buildStage = 2;
        for (const ownedPart of player.inventory.parts) {
          if (ownedPart.installedOnCarId !== carId) continue;
          const partSpec = this.findBy(this.parts, 'catalogId', String(ownedPart.catalogId || ''));
          if (partSpec?.simpleTier) ownedPart.installedOnCarId = null;
        }
        player.garage[index] = this.recalculateCar(car, player.inventory.parts);
        this.addTransaction(player, 'stage_conversion', 0, `${this.carName(car)} converted to Street Race Car`);
        return;
      }

      if (stage === 2) {
        const requiredCategories = [...new Set(this.parts
          .filter((part) =>
            !part.simpleTier
            && Number(part.buildStage || 2) === 2
            && part.requiredForStageProgression !== false
          )
          .map((part) => String(part.categoryKey || ''))
          .filter(Boolean))];

        const installedCategories = new Set();
        for (const item of player.inventory.parts) {
          if (String(item.installedOnCarId || '') !== String(carId)) continue;
          const part = this.findBy(this.parts, 'catalogId', String(item.catalogId || ''));
          if (part?.categoryKey) installedCategories.add(String(part.categoryKey));
        }
        const missing = requiredCategories.filter((key) => !installedCategories.has(key));
        if (missing.length) throw new LocalGameError(`Install a Street Race Car part in every core category before moving to Front-Half Race Car. Missing: ${missing.join(', ')}.`);

        car.buildStage = 3;
        player.garage[index] = this.recalculateCar(car, player.inventory.parts);
        this.addTransaction(player, 'stage_conversion', 0, `${this.carName(car)} converted to Front-Half Race Car`);
        return;
      }

      if (stage === 3) {
        car.buildStage = 4;
        player.garage[index] = this.recalculateCar(car, player.inventory.parts);
        this.addTransaction(player, 'stage_conversion', 0, `${this.carName(car)} converted to Full Race Car`);
        return;
      }

      throw new LocalGameError('This car is already a Full Race Car.');
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
    const pool = this.cars.filter((spec) => spec?.market?.classifieds !== false && isContentReleased(spec));
    if (!pool.length) return { generatedAt: timestamp, expiresAt: timestamp + this.config.usedLotRefreshSeconds, listings: [] };

    const makeListing = (spec, starterListing = false) => {
      const mileage = starterListing ? randomInt(105000, 190000) : randomInt(2800, 195000);
      const condition = starterListing ? randomInt(62, 79) : randomInt(58, 98);
      const mileageFactor = Math.max(0.46, 1 - (mileage / 330000));
      const conditionFactor = 0.42 + (0.58 * Math.pow(condition / 100, 1.7));
      let price = Math.round((Number(spec.price || 0) * mileageFactor * conditionFactor) / 50) * 50;
      if (starterListing) price = Math.min(8500, Math.max(2500, Math.round(price * 0.82 / 50) * 50));
      price = Math.max(1200, price);
      return {
        listingId: this.id('used'),
        stockId: Number(spec.stockId),
        price,
        mileage,
        condition,
        basePrice: Number(spec.price || 0),
        mileageFactor: Math.round(mileageFactor * 1000) / 1000,
        conditionFactor: Math.round(conditionFactor * 1000) / 1000,
        starterListing,
        paintColor: randomPaintColor(spec),
      };
    };

    const starters = pool
      .filter((spec) => Boolean(spec.starter))
      .slice(0, 3);
    const listings = starters.map((spec) => makeListing(spec, true));
    while (listings.length < 8) listings.push(makeListing(randomChoice(pool), false));

    const normalExpiry = timestamp + this.config.usedLotRefreshSeconds;
    const nextReleaseMs = nextScheduledReleaseAt(this.cars, Date.now());
    const releaseExpiry = nextReleaseMs == null ? null : Math.ceil(nextReleaseMs / 1000);
    const expiresAt = releaseExpiry != null ? Math.min(normalExpiry, releaseExpiry) : normalExpiry;
    return { generatedAt: timestamp, expiresAt, listings };
  }

  purchaseUsedCar(inputPlayer, lot, listingId) {
    const listing = this.findBy(lot?.listings || [], 'listingId', listingId);
    if (!listing) throw new LocalGameError('That used listing is no longer available.', 404);
    const spec = this.findBy(this.cars, 'stockId', Number(listing.stockId));
    if (!spec) throw new LocalGameError('Vehicle catalog entry is missing.', 500);
    const player = this.mutate(inputPlayer, (draft) => {
      const tutorialStarter = draft.tutorial?.status === 'active' && draft.tutorial?.step === 'buy_first_car';
      if (tutorialStarter && !spec.starter) {
        throw new LocalGameError('Your first car must be one of the highlighted starter listings.');
      }
      const price = Number(listing.price || 0);
      this.requireCredits(draft, price);
      draft.wallet.credits -= price;
      const car = this.createOwnedCar(spec, 'used', Number(listing.mileage || 0), Number(listing.condition || 100), price, listing.paintColor || null);
      draft.garage.push(car);
      draft.stats.usedPurchases = Number(draft.stats.usedPurchases || 0) + 1;
      if (!draft.selectedCarId) draft.selectedCarId = car.carId;
      this.addTransaction(draft, 'used_purchase', -price, car.displayName);
      if (tutorialStarter) this.completeTutorialStep(draft, 'buy_first_car', 'visit_garage');
    });
    const nextLot = clone(lot);
    nextLot.listings = (nextLot.listings || []).filter((row) => String(row.listingId) !== String(listingId));
    return { player, lot: nextLot };
  }

  quickRacePreview(inputPlayer) {
    const player = this.normalizePlayer(inputPlayer);
    const carIndex = this.requireOwnedCarIndex(player, player.selectedCarId);
    const car = player.garage[carIndex];
    const tutorialRace = player.tutorial?.status === 'active' && player.tutorial?.step === 'first_race';
    const playerBenchmark = benchmarkPerformance(car.derived || car.base, this.racingConfig);
    const opponent = this.nextOpponentProfile(player, car, tutorialRace);
    return {
      carId: car.carId,
      carName: this.carName(car),
      performanceIndex: playerBenchmark.performanceIndex,
      benchmarkEt: playerBenchmark.quarterMileEt,
      opponent: this.publicOpponentProfile(opponent),
    };
  }


  startQuickRace(inputPlayer, distance = '1/4', timestampMs = Date.now()) {
    const distanceConfig = this.raceSimulator.distance(distance);
    let activeRace = null;
    const player = this.mutate(inputPlayer, (draft) => {
      if (draft.activeRace && typeof draft.activeRace === 'object') {
        activeRace = clone(draft.activeRace);
        return;
      }

      const carIndex = this.requireOwnedCarIndex(draft, draft.selectedCarId);
      const car = draft.garage[carIndex];
      const level = Number(draft.progression?.level || 1);
      const tutorialRace = draft.tutorial?.status === 'active' && draft.tutorial?.step === 'first_race';
      const unlockLevel = distance === '1' ? 10 : distance === '1/2' ? 5 : 1;
      if (tutorialRace && distance !== '1/4') throw new LocalGameError('Your first race is the 1/4 mile.');
      if (!tutorialRace && level < unlockLevel) throw new LocalGameError(`${distanceConfig.label || distance} unlocks at Level ${unlockLevel}.`);
      const weather = tutorialRace
        ? { name: 'Cool & Cloudy', etModifier: 0, mphModifier: 0, weight: 1 }
        : this.raceSimulator.randomWeather(level);
      const location = tutorialRace
        ? { name: 'Local Test & Tune', weight: 1 }
        : this.raceSimulator.randomLocation(level);

      const hp = Math.max(1, Number(car.derived?.hp || 1));
      const torque = Math.max(1, Number(car.derived?.torque || 1));
      const weight = Math.max(500, Number(car.derived?.weight || 500));
      const grip = Math.max(0.5, Number(car.derived?.grip || 1));
      const drivetrain = String(car.derived?.drivetrain || car.base?.drivetrain || "-");
      const opponentProfile = this.nextOpponentProfile(draft, car, tutorialRace);
      const opponentWeight = Number(opponentProfile.sim.weight);
      const opponentHp = Number(opponentProfile.sim.hp);
      const opponentTorque = Number(opponentProfile.sim.torque);
      const opponentGrip = Number(opponentProfile.sim.grip);
      const opponentLevel = Number(opponentProfile.level);

      const playerRun = this.raceSimulator.simulate({ hp, torque, weight, grip, drivetrain, level, allowFoul: !tutorialRace }, distance, weather);
      const opponentRun = this.raceSimulator.simulate({
        hp: opponentHp, torque: opponentTorque, weight: opponentWeight, grip: opponentGrip, drivetrain: opponentProfile.drivetrain, level: opponentLevel,
        allowFoul: !tutorialRace, reactionOffset: tutorialRace ? 0.16 : 0,
      }, distance, weather);
      if (tutorialRace && opponentRun.totalTime <= playerRun.totalTime) {
        const delta = (playerRun.totalTime - opponentRun.totalTime) + 0.25;
        opponentRun.reactionTime = round3(Number(opponentRun.reactionTime || 0) + delta);
        opponentRun.totalTime = round3(Number(opponentRun.totalTime || 0) + delta);
        opponentRun.foul = false;
      }

      const won = playerRun.totalTime < opponentRun.totalTime;
      const creditMultiplier = Number(distanceConfig.creditMultiplier || 1);
      const reward = won
        ? Math.round(randomInt(450, 850) * creditMultiplier)
        : Math.round(randomInt(90, 220) * creditMultiplier);
      const expReward = this.raceExpReward(level, opponentLevel, won);
      const repReward = won ? 5 : 2;
      const opponentVisual = clone(opponentProfile.visual || {});
      const timeScale = Math.max(0.01, Number(this.racingConfig?.presentation?.timeScale || 1));
      const stagingMs = Math.max(1800, Number(this.racingConfig?.presentation?.stagingMs || 2800)) * timeScale;
      const greenAt = Number(timestampMs) + stagingMs;
      const playerFinishSeconds = Math.max(0.1, Number(playerRun.reactionTime || 0) + Number(playerRun.elapsedTime || 0));
      const opponentFinishSeconds = Math.max(0.1, Number(opponentRun.reactionTime || 0) + Number(opponentRun.elapsedTime || 0));
      const finishAt = greenAt + (Math.max(playerFinishSeconds, opponentFinishSeconds) * 1000 * timeScale);

      const race = {
        raceId: this.id('race'),
        won,
        distance,
        distanceLabel: String(distanceConfig.label || distance),
        distanceFeet: Number(distanceConfig.feet || 1320),
        location,
        weather,
        margin: round3(Math.abs(playerRun.totalTime - opponentRun.totalTime)),
        reward,
        expReward,
        repReward,
        newBest: false,
        playerCarId: car.carId,
        carName: this.carName(car),
        playerVisual: clone(car.visual || {}),
        playerDrivetrain: drivetrain,
        playerPerformanceIndex: Number(car.performanceIndex || benchmarkPerformance(car.derived || car.base, this.racingConfig).performanceIndex),
        playerPerformanceClass: String(car.performanceClass || performanceClassFromIndex(car.performanceIndex)),
        player: playerRun,
        opponent: {
          name: opponentProfile.name,
          carName: opponentProfile.carName,
          visual: opponentVisual,
          performanceIndex: opponentProfile.performanceIndex,
          performanceClass: opponentProfile.performanceClass,
          drivetrain: opponentProfile.drivetrain,
          buildType: opponentProfile.buildType,
          level: opponentLevel,
          ...opponentRun,
        },
        reaction: playerRun.reactionTime,
        playerEt: playerRun.elapsedTime,
        opponentEt: opponentRun.elapsedTime,
      };

      activeRace = {
        raceId: race.raceId,
        status: 'running',
        startedAt: Number(timestampMs),
        greenAt,
        finishAt,
        timeScale,
        revealDelayMs: Math.max(0, Number(this.racingConfig?.presentation?.revealDelayMs || 650)),
        progressExponent: Math.max(1, Number(this.racingConfig?.presentation?.progressExponent || 1.38)),
        distance,
        race,
      };
      draft.activeRace = clone(activeRace);
    });
    return { player, activeRace };
  }

  finishQuickRace(inputPlayer, raceId, timestampMs = Date.now()) {
    let race = null;
    const player = this.mutate(inputPlayer, (draft) => {
      const active = draft.activeRace;
      if (!active || typeof active !== 'object') {
        const prior = [...(draft.raceHistory || [])].reverse().find((row) => String(row.raceId) === String(raceId));
        if (prior) {
          race = clone(prior);
          return;
        }
        throw new LocalGameError('No race is currently in progress.', 409);
      }
      if (String(active.raceId) !== String(raceId)) throw new LocalGameError('That race is no longer active.', 409);
      if (Number(timestampMs) < Number(active.finishAt || 0)) throw new LocalGameError('The race is still in progress.', 409);

      race = clone(active.race || {});
      const carIndex = this.requireOwnedCarIndex(draft, race.playerCarId);
      const car = draft.garage[carIndex];
      const distance = String(race.distance || '1/4');
      const playerRun = race.player || {};
      const won = Boolean(race.won);
      const reward = Number(race.reward || 0);
      const expReward = Number(race.expReward || 0);
      const repReward = Number(race.repReward || 0);

      draft.wallet.credits += reward;
      draft.progression.exp = Number(draft.progression.exp || 0) + expReward;
      draft.progression.rep = Number(draft.progression.rep || 0) + repReward;
      draft.progression.level = this.levelFromExp(draft.progression.exp);
      draft.stats.races = Number(draft.stats.races || 0) + 1;
      draft.stats[won ? 'wins' : 'losses'] = Number(draft.stats[won ? 'wins' : 'losses'] || 0) + 1;
      if (!playerRun.foul && (draft.stats.bestReaction == null || Number(playerRun.reactionTime) < Number(draft.stats.bestReaction))) {
        draft.stats.bestReaction = Number(playerRun.reactionTime);
      }

      const records = car.raceRecords || this.emptyRaceRecords();
      const record = records[distance] || { races: 0, bestEt: null, bestTrap: null };
      record.races = Number(record.races || 0) + 1;
      let newBest = false;
      if (!playerRun.foul && (record.bestEt == null || Number(playerRun.elapsedTime) < Number(record.bestEt))) {
        record.bestEt = Number(playerRun.elapsedTime);
        newBest = true;
      }
      if (record.bestTrap == null || Number(playerRun.trapSpeed) > Number(record.bestTrap)) record.bestTrap = Number(playerRun.trapSpeed);
      records[distance] = record;
      draft.garage[carIndex].raceRecords = records;
      race.newBest = newBest;

      this.addTransaction(draft, 'race_reward', reward, `${race.distanceLabel || distance} ${won ? 'win' : 'participation'}`);

      if (draft.tutorial?.status === 'active' && draft.tutorial?.step === 'first_race') {
        draft.wallet.credits += this.config.tutorialCompletionCredits;
        draft.progression.rep += this.config.tutorialCompletionRep;
        this.addTransaction(draft, 'tutorial_reward', this.config.tutorialCompletionCredits, 'Tutorial completion reward');
        this.completeTutorialStep(draft, 'first_race', null);
        draft.tutorial.status = 'complete';
        draft.tutorial.step = 'complete';
      }

      race.completedAt = now();
      draft.raceHistory.push({ ...race });
      const historyLimit = Math.max(5, Number(this.racingConfig.historyLimit || 25));
      if (draft.raceHistory.length > historyLimit) draft.raceHistory = draft.raceHistory.slice(-historyLimit);
      draft.activeRace = null;
    });
    return { player, race };
  }

  quickRace(inputPlayer, distance = '1/4', timestampMs = Date.now()) {
    return this.startQuickRace(inputPlayer, distance, timestampMs);
  }

  roguelikeStart(inputPlayer) {
    return this.mutate(inputPlayer, (player) => {
      if (!this.selectedCar(player)) throw new LocalGameError('Select a car before starting a The Circuit run.');
      if (player.roguelike.activeRun && typeof player.roguelike.activeRun === 'object') throw new LocalGameError('A The Circuit run is already active.');
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
      if (!run || typeof run !== 'object') throw new LocalGameError('No active The Circuit run.');
      const car = this.selectedCar(draft);
      if (!car) throw new LocalGameError('Your selected car is missing.');
      const stage = Number(run.stage || 1);
      const risk = choice === 'push' ? 1.09 : 0.99;
      const boost = Number(run.boost || 0);
      const basePi = Number(car.performanceIndex || benchmarkPerformance(car.derived || car.base, this.racingConfig).performanceIndex);
      const rating = basePi * (1 + boost);
      const difficulty = rating * (0.88 + stage * 0.035) * risk;
      const roll = (randomInt(930, 1070) / 1000) * rating;
      const won = roll >= difficulty;
      const reward = won ? Math.round((420 + stage * 180) * (choice === 'push' ? 1.45 : 1)) : 0;
      if (!won) {
        const banked = Math.floor(Number(run.runCredits || 0) * 0.35);
        draft.wallet.credits += banked;
        this.addTransaction(draft, 'roguelike_cashout', banked, 'The Circuit consolation');
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
        this.addTransaction(draft, 'roguelike_cashout', banked, 'The Circuit complete');
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
    car.catalogId = car.catalogId || spec?.catalogId || spec?.visual?.layered?.assetId || null;
    car.factoryEngineId = car.factoryEngineId || spec?.factoryEngineId || null;
    car.engineId = car.engineId || car.factoryEngineId || null;
    car.engineBay = car.engineBay || clone(spec?.engineBay || null);
    car.engine = { ...(clone(spec?.engine || {})), ...(car.engine || {}) };
    const catalogVisual = clone(spec?.visual || {});
    const savedVisual = car.visual && typeof car.visual === 'object' ? car.visual : {};
    car.visual = {
      ...catalogVisual,
      ...savedVisual,
      layered: {
        ...(catalogVisual.layered || {}),
        ...(savedVisual.layered || {}),
        layers: {
          ...(catalogVisual.layered?.layers || {}),
          ...(savedVisual.layered?.layers || {}),
        },
        anchors: {
          ...(catalogVisual.layered?.anchors || {}),
          ...(savedVisual.layered?.anchors || {}),
        },
      },
    };
    car.raceRecords = { ...this.emptyRaceRecords(), ...(car.raceRecords || {}) };
    if (car.derived?.hp && car.derived?.weight) {
      const benchmark = benchmarkPerformance(car.derived, this.racingConfig);
      car.performanceIndex = benchmark.performanceIndex;
      car.performanceClass = performanceClassFromIndex(benchmark.performanceIndex);
      car.benchmarkEt = benchmark.quarterMileEt;
    }
    return car;
  }

  createOwnedCar(spec, source, mileage, condition, purchasePrice, paintColor = null) {
    const base = spec.base || {};
    const displayName = String(spec.displayName || [spec.year, spec.make, spec.model].filter(Boolean).join(' ') || 'Unknown Car');
    const derived = { hp: Number(base.hp), torque: Number(base.torque), weight: Number(base.weight), grip: Number(base.grip || 1) };
    const benchmark = benchmarkPerformance(derived, this.racingConfig);
    return {
      carId: this.id('car'),
      stockId: Number(spec.stockId),
      catalogId: spec.catalogId || spec.visual?.layered?.assetId || null,
      displayName,
      nickname: '', source, purchasePrice, mileage, condition, buildStage: 1, stageBaseline: null,
      factoryEngineId: spec.factoryEngineId || null, engineId: spec.factoryEngineId || null, engineBay: clone(spec.engineBay || null),
      engine: clone(spec.engine || {}),
      visual: withPaintColor(clone(spec.visual || {}), paintColor || firstPaintColor(spec)),
      benchmark: clone(spec.benchmark || benchmark),
      stockClass: String(spec.class || performanceClassFromIndex(spec.benchmark?.performanceIndex ?? benchmark.performanceIndex)),
      performanceIndex: benchmark.performanceIndex,
      performanceClass: performanceClassFromIndex(benchmark.performanceIndex),
      benchmarkEt: benchmark.quarterMileEt,
      base: { hp: Number(base.hp), torque: Number(base.torque), weight: Number(base.weight), grip: Number(base.grip || 1), drivetrain: String(base.drivetrain || 'FWD') },
      derived,
      raceRecords: this.emptyRaceRecords(),
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
    const benchmark = benchmarkPerformance(car.derived, this.racingConfig);
    car.performanceIndex = benchmark.performanceIndex;
    car.performanceClass = performanceClassFromIndex(benchmark.performanceIndex);
    car.benchmarkEt = benchmark.quarterMileEt;
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

  installedEngineKitLevel(player, carId) {
    let level = 0;
    for (const instance of player.inventory?.parts || []) {
      if (String(instance.installedOnCarId || '') !== String(carId)) continue;
      const spec = this.findBy(this.parts, 'catalogId', String(instance.catalogId || ''));
      level = Math.max(level, Number(spec?.engineKit?.level || 0));
    }
    return level;
  }

  requirePartCompatible(player, car, spec, { purchasing = false } = {}) {
    const stage = Number(car.buildStage || 1);
    if (stage === 1) {
      if (Number(spec.buildStage || 1) !== 1 || !Number(spec.simpleTier || 0)) throw new LocalGameError('Street Cars use the simple three-level upgrade path.');
      const currentTier = this.installedSimpleTier(player, car.carId, String(spec.categoryKey || spec.slot || ''));
      if (purchasing && Number(spec.simpleTier) !== currentTier + 1) throw new LocalGameError(`Complete the previous ${spec.category} upgrade first.`);
      if (!purchasing && Number(spec.simpleTier) < currentTier) throw new LocalGameError('Street Car upgrades cannot be downgraded.');
      return;
    }
    if (spec.simpleTier) throw new LocalGameError('Street Car ladder parts are incorporated when the car converts to a Street Race Car.');
    if (Number(spec.buildStage || 2) > stage) throw new LocalGameError('This part requires a later Build Type.');
    if (Number(spec.persistentFromStage || spec.buildStage || 2) > stage) throw new LocalGameError('This part is not available for the current Build Type.');

    const currentEngineKit = this.installedEngineKitLevel(player, car.carId);
    const engineKitLevel = Number(spec?.engineKit?.level || 0);
    if (engineKitLevel > 0) {
      if (purchasing && engineKitLevel !== currentEngineKit + 1) {
        throw new LocalGameError(`Install Engine Kit ${currentEngineKit + 1} before buying Engine Kit ${engineKitLevel}.`);
      }
      if (!purchasing && engineKitLevel < currentEngineKit) {
        throw new LocalGameError('Engine Kits cannot be downgraded.');
      }
    }

    const requiredEngineKit = Math.max(0, Number(spec.requiredEngineKit || 0));
    if (requiredEngineKit > currentEngineKit) {
      throw new LocalGameError(`Requires Engine Kit ${requiredEngineKit} before this power adder can be used.`);
    }

    const fi = forcedInductionCompatibility(car, player.inventory?.parts || [], spec, this.parts, { purchasing });
    if (!fi.ok) throw new LocalGameError(fi.reason || 'That forced-induction part is not compatible with this setup.');
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

  expToReachLevel(level) {
    return Math.floor(100 * (Math.max(1, Number(level)) ** 1.75));
  }

  levelFromExp(exp) {
    let level = 1;
    const total = Math.max(0, Number(exp || 0));
    while (level < 200 && total >= this.expToReachLevel(level + 1)) level += 1;
    return level;
  }

  raceExpReward(playerLevel, opponentLevel, won) {
    let base = won ? randomInt(25, 74) : randomInt(9, 19);
    const difference = Number(opponentLevel) - Number(playerLevel);
    if (won && difference > 0) base = Math.round(base * (1 + Math.min(0.5, difference * 0.02)));
    if (won && difference < 0) base = Math.round(base * Math.max(0.5, 1 + (difference * 0.015)));
    return Math.max(1, base);
  }

  emptyRaceRecords() {
    return {
      '1/4': { races: 0, bestEt: null, bestTrap: null },
      '1/2': { races: 0, bestEt: null, bestTrap: null },
      '1': { races: 0, bestEt: null, bestTrap: null },
    };
  }

  nextOpponentProfile(player, car, tutorialRace = false) {
    const playerBenchmark = benchmarkPerformance(car?.derived || car?.base || {}, this.racingConfig);
    const playerPi = playerBenchmark.performanceIndex;
    const level = Math.max(1, Number(player?.progression?.level || 1));
    const raceIndex = Math.max(0, Number(player?.stats?.races || 0));
    const seedText = [
      player?.user?.id || 1,
      car?.carId || 'car',
      raceIndex,
      playerPi,
      tutorialRace ? 'tutorial' : 'normal',
    ].join('|');
    const rng = seededRandom(stableSeed(seedText));
    const targetPi = tutorialRace ? Math.max(0, playerPi - 32) : Math.max(0, playerPi + Math.round((rng() * 48) - 24));
    let candidates = (this.cars || []).filter((spec) => spec?.visual?.layered?.layers?.body?.src && isContentReleased(spec));
    if (!tutorialRace) {
      const alternatives = candidates.filter((spec) => Number(spec.stockId) !== Number(car.stockId));
      if (alternatives.length) candidates = alternatives;
    }
    const ranked = candidates
      .map((spec) => {
        const benchmark = spec.benchmark?.performanceIndex != null
          ? spec.benchmark
          : benchmarkPerformance(spec.base || {}, this.racingConfig);
        return { spec, benchmark, delta: Math.abs(Number(benchmark.performanceIndex) - targetPi) };
      })
      .sort((a, b) => a.delta - b.delta || Number(a.spec.stockId) - Number(b.spec.stockId));
    const chosen = ranked[0] || { spec: this.cars[0] || {}, benchmark: { performanceIndex: playerPi } };
    const spec = chosen.spec;
    const base = spec.base || {};
    const pi = Number(chosen.benchmark.performanceIndex || benchmarkPerformance(base, this.racingConfig).performanceIndex);
    const names = ['Night Shift', 'Redline', 'The Commuter', 'Left Lane', 'Cut Light', 'Sleeper', 'Boost Leak', 'Test Mule'];
    const name = tutorialRace ? 'Test Mule' : names[Math.min(names.length - 1, Math.floor(rng() * names.length))];
    const opponentLevel = tutorialRace ? 1 : Math.max(1, level + Math.round((pi - playerPi) / 24));

    return {
      name,
      carName: String(spec.displayName || [spec.year, spec.make, spec.model].filter(Boolean).join(' ') || 'Opponent'),
      visual: withPaintColor(
        clone(spec.visual || {}),
        paintPalette(spec).length ? paintPalette(spec)[Math.min(paintPalette(spec).length - 1, Math.floor(rng() * paintPalette(spec).length))] : firstPaintColor(spec)
      ),
      performanceIndex: pi,
      performanceClass: performanceClassFromIndex(pi),
      drivetrain: String(base.drivetrain || '-'),
      buildType: 'Street Car',
      level: opponentLevel,
      stockId: Number(spec.stockId || 0),
      sim: {
        hp: Math.max(1, Number(base.hp || 1)),
        torque: Math.max(1, Number(base.torque || 1)),
        weight: Math.max(500, Number(base.weight || 500)),
        grip: Math.max(0.5, Number(base.grip || 1)),
        drivetrain: String(base.drivetrain || "-"),
      },
    };
  }

  publicOpponentProfile(profile) {
    return {
      name: profile.name,
      carName: profile.carName,
      visual: clone(profile.visual || {}),
      performanceIndex: Number(profile.performanceIndex || 0),
      performanceClass: String(profile.performanceClass || performanceClassFromIndex(profile.performanceIndex)),
      drivetrain: profile.drivetrain,
      buildType: profile.buildType,
      level: Number(profile.level || 1),
    };
  }
}

function stableSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
