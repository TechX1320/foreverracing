import { ApiClient } from '../core/api.js';
import { StorageProvider } from './StorageProvider.js';

export class ApiStorageProvider extends StorageProvider {
  #api;

  constructor() {
    super('api');
    this.#api = new ApiClient();
  }

  setCsrf(token) { this.#api.setCsrf(token); }
  clearCsrf() { this.#api.clearCsrf(); }
  session() { return this.#api.session(); }
  login(username, password) { return this.#api.login(username, password); }
  logout() { return this.#api.logout(); }
  player() { return this.#api.player(); }
  carCatalog() { return this.#api.carCatalog(); }
  buyNewCar(stockId) { return this.#api.buyNewCar(stockId); }
  selectCar(carId) { return this.#api.selectCar(carId); }
  renameCar(carId, name) { return this.#api.renameCar(carId, name); }
  partsCatalog() { return this.#api.partsCatalog(); }
  buyPart(catalogId) { return this.#api.buyPart(catalogId); }
  installPart(inventoryId, carId) { return this.#api.installPart(inventoryId, carId); }
  uninstallPart(inventoryId) { return this.#api.uninstallPart(inventoryId); }
  stageUp(carId) { return this.#api.stageUp(carId); }
  tutorialAdvance(action) { return this.#api.tutorialAdvance(action); }
  tutorialReset() { return this.#api.tutorialReset(); }
  usedLot() { return this.#api.usedLot(); }
  refreshUsedLot() { return this.#api.refreshUsedLot(); }
  buyUsedCar(listingId) { return this.#api.buyUsedCar(listingId); }
  quickRace(distance = '1/4') { return this.#api.quickRace(distance); }
  roguelikeStart() { return this.#api.roguelikeStart(); }
  roguelikeStep(choice) { return this.#api.roguelikeStep(choice); }
}
