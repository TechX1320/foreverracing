import { StorageProvider } from './StorageProvider.js';
import { LocalGameService } from '../domain/LocalGameService.js';

const PLAYER_KEY = 'foreverRacing.v02.player';
const SESSION_KEY = 'foreverRacing.v02.session';
const USED_LOT_KEY = 'foreverRacing.v02.usedLot';

export class LocalStorageProvider extends StorageProvider {
  #service = null;
  #config = null;

  constructor() {
    super('local');
  }

  setCsrf(_token) {}
  clearCsrf() {}

  async #ready() {
    if (this.#service) return;
    const [cars, parts, config, buildStages, racingConfig] = await Promise.all([
      fetchJson('data/catalog/cars.json'),
      fetchJson('data/catalog/parts.json'),
      fetchJson('data/config/game.json'),
      fetchJson('data/config/build-stages.json'),
      fetchJson('data/config/racing.json'),
    ]);
    this.#config = config;
    this.#service = new LocalGameService({ cars, parts, config, buildStages: buildStages.stages || buildStages, racingConfig });
  }

  async session() {
    await this.#ready();
    if (localStorage.getItem(SESSION_KEY) !== 'authenticated') return { ok: true, authenticated: false };
    return { ok: true, authenticated: true, csrf: 'local-dev', player: this.#loadPlayer() };
  }

  async login(username, password) {
    await this.#ready();
    if (localStorage.getItem(SESSION_KEY) === 'authenticated') {
      throw providerError('This account is already logged in in this browser.', 409);
    }
    if (String(username).trim().toLowerCase() !== String(this.#config.localDevUsername || 'Admin').toLowerCase() || String(password) !== String(this.#config.localDevPassword || '12345')) {
      throw providerError('Invalid username or password.', 401);
    }
    localStorage.setItem(SESSION_KEY, 'authenticated');
    return { ok: true, authenticated: true, csrf: 'local-dev', player: this.#loadPlayer() };
  }

  async logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PLAYER_KEY);
    return { ok: true, reset: true };
  }

  async player() {
    await this.#ready();
    return { ok: true, player: this.#loadPlayer() };
  }

  async carCatalog() {
    await this.#ready();
    return { ok: true, cars: structuredClone(this.#service.cars) };
  }

  async buyNewCar(stockId) {
    await this.#ready();
    const player = this.#service.purchaseNewCar(this.#loadPlayer(), stockId);
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async selectCar(carId) {
    await this.#ready();
    const player = this.#service.selectCar(this.#loadPlayer(), carId);
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async renameCar(carId, name) {
    await this.#ready();
    const player = this.#service.renameCar(this.#loadPlayer(), carId, name);
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async partsCatalog() {
    await this.#ready();
    return { ok: true, parts: structuredClone(this.#service.parts) };
  }

  async buyPart(catalogId) {
    await this.#ready();
    const player = this.#service.purchasePart(this.#loadPlayer(), catalogId);
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async installPart(inventoryId, carId) {
    await this.#ready();
    const player = this.#service.installPart(this.#loadPlayer(), inventoryId, carId);
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async uninstallPart(inventoryId) {
    await this.#ready();
    const player = this.#service.uninstallPart(this.#loadPlayer(), inventoryId);
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async stageUp(carId) {
    await this.#ready();
    const player = this.#service.stageUp(this.#loadPlayer(), carId);
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async tutorialAdvance(action) {
    await this.#ready();
    const player = this.#service.tutorialAdvance(this.#loadPlayer(), action);
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async tutorialReset() {
    await this.#ready();
    const player = this.#service.tutorialReset(this.#loadPlayer());
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async usedLot() {
    await this.#ready();
    const lot = this.#loadLot();
    return { ok: true, lot, cars: structuredClone(this.#service.cars) };
  }

  async refreshUsedLot() {
    await this.#ready();
    const lot = this.#service.generateUsedLot();
    this.#saveLot(lot);
    return { ok: true, lot };
  }

  async buyUsedCar(listingId) {
    await this.#ready();
    const result = this.#service.purchaseUsedCar(this.#loadPlayer(), this.#loadLot(), listingId);
    this.#savePlayer(result.player);
    this.#saveLot(result.lot);
    return { ok: true, player: result.player };
  }

  async quickRacePreview() {
    await this.#ready();
    return { ok: true, preview: this.#service.quickRacePreview(this.#loadPlayer()) };
  }

  async startQuickRace(distance = '1/4') {
    await this.#ready();
    const result = this.#service.startQuickRace(this.#loadPlayer(), distance, Date.now());
    this.#savePlayer(result.player);
    return { ok: true, ...result };
  }

  async finishQuickRace(raceId) {
    await this.#ready();
    const result = this.#service.finishQuickRace(this.#loadPlayer(), raceId, Date.now());
    this.#savePlayer(result.player);
    return { ok: true, ...result };
  }

  async quickRace(distance = '1/4') {
    return this.startQuickRace(distance);
  }

  async roguelikeStart() {
    await this.#ready();
    const player = this.#service.roguelikeStart(this.#loadPlayer());
    this.#savePlayer(player);
    return { ok: true, player };
  }

  async roguelikeStep(choice) {
    await this.#ready();
    const result = this.#service.roguelikeStep(this.#loadPlayer(), choice);
    this.#savePlayer(result.player);
    return { ok: true, ...result };
  }

  #loadPlayer() {
    const stored = parseStored(PLAYER_KEY);
    const player = this.#service.normalizePlayer(stored || this.#service.defaultPlayer());
    this.#savePlayer(player);
    return player;
  }

  #savePlayer(player) {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
  }

  #loadLot() {
    const stored = parseStored(USED_LOT_KEY);
    const timestamp = Math.floor(Date.now() / 1000);
    if (!stored || !Array.isArray(stored.listings) || Number(stored.expiresAt || 0) <= timestamp) {
      const lot = this.#service.generateUsedLot();
      this.#saveLot(lot);
      return lot;
    }
    return stored;
  }

  #saveLot(lot) {
    localStorage.setItem(USED_LOT_KEY, JSON.stringify(lot));
  }
}

function parseStored(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw providerError(`Unable to load ${path} (${response.status}).`, response.status);
  return response.json();
}

function providerError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
