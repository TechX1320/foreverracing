/**
 * Runtime storage/game gateway contract.
 *
 * Screens depend on this interface, not on PHP endpoints or browser storage.
 * Server mode is implemented by ApiStorageProvider; GitHub Pages/dev mode is
 * implemented by LocalStorageProvider.
 */
export class StorageProvider {
  constructor(mode) {
    this.mode = mode;
  }

  setCsrf(_token) {}
  clearCsrf() {}

  async session() { throw new Error('session() is not implemented.'); }
  async login(_username, _password) { throw new Error('login() is not implemented.'); }
  async logout() { throw new Error('logout() is not implemented.'); }
  async player() { throw new Error('player() is not implemented.'); }
  async carCatalog() { throw new Error('carCatalog() is not implemented.'); }
  async buyNewCar(_stockId) { throw new Error('buyNewCar() is not implemented.'); }
  async selectCar(_carId) { throw new Error('selectCar() is not implemented.'); }
  async renameCar(_carId, _name) { throw new Error('renameCar() is not implemented.'); }
  async saveTune(_carId, _tune) { throw new Error('saveTune() is not implemented.'); }
  async repairEngine(_carId) { throw new Error('repairEngine() is not implemented.'); }
  async partsCatalog() { throw new Error('partsCatalog() is not implemented.'); }
  async buyPart(_catalogId) { throw new Error('buyPart() is not implemented.'); }
  async installPart(_inventoryId, _carId) { throw new Error('installPart() is not implemented.'); }
  async uninstallPart(_inventoryId) { throw new Error('uninstallPart() is not implemented.'); }
  async stageUp(_carId) { throw new Error('stageUp() is not implemented.'); }
  async tutorialAdvance(_action) { throw new Error('tutorialAdvance() is not implemented.'); }
  async tutorialReset() { throw new Error('tutorialReset() is not implemented.'); }
  async usedLot() { throw new Error('usedLot() is not implemented.'); }
  async refreshUsedLot() { throw new Error('refreshUsedLot() is not implemented.'); }
  async buyUsedCar(_listingId) { throw new Error('buyUsedCar() is not implemented.'); }
  async quickRacePreview() { throw new Error('quickRacePreview() is not implemented.'); }
  async startQuickRace(_distance = '1/4') { throw new Error('startQuickRace() is not implemented.'); }
  async finishQuickRace(_raceId) { throw new Error('finishQuickRace() is not implemented.'); }
  async quickRace(_distance = '1/4') { throw new Error('quickRace() is not implemented.'); }
  async roguelikeStart() { throw new Error('roguelikeStart() is not implemented.'); }
  async roguelikeStep(_choice) { throw new Error('roguelikeStep() is not implemented.'); }
}
