export class ApiClient {
  #csrf = null;

  setCsrf(token) {
    this.#csrf = token || null;
  }

  clearCsrf() {
    this.#csrf = null;
  }

  async request(path, { method = "GET", body = null, csrf = false } = {}) {
    const headers = { "Accept": "application/json" };
    if (body !== null) headers["Content-Type"] = "application/json";
    if (csrf && this.#csrf) headers["X-CSRF-Token"] = this.#csrf;

    const response = await fetch(`api/${path}`, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: body === null ? null : JSON.stringify(body),
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server returned an invalid response (${response.status}).`);
    }

    if (!response.ok || data?.ok === false) {
      const error = new Error(data?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  session() { return this.request("auth/session.php"); }
  login(username, password) { return this.request("auth/login.php", { method: "POST", body: { username, password } }); }
  logout() { return this.request("auth/logout.php", { method: "POST", body: {}, csrf: true }); }
  player() { return this.request("player/state.php"); }
  carCatalog() { return this.request("showroom/catalog.php"); }
  buyNewCar(stockId) { return this.request("showroom/purchase.php", { method: "POST", body: { stockId }, csrf: true }); }
  selectCar(carId) { return this.request("garage/select.php", { method: "POST", body: { carId }, csrf: true }); }
  renameCar(carId, name) { return this.request("garage/rename.php", { method: "POST", body: { carId, name }, csrf: true }); }
  saveTune(carId, tune) { return this.request("garage/tune.php", { method: "POST", body: { carId, tune }, csrf: true }); }
  repairEngine(carId) { return this.request("garage/repair-engine.php", { method: "POST", body: { carId }, csrf: true }); }
  engineCatalog() { return this.request("engine-swaps/catalog.php"); }
  swapEngine(carId, engineId) { return this.request("engine-swaps/install.php", { method: "POST", body: { carId, engineId }, csrf: true }); }
  partsCatalog() { return this.request("parts/catalog.php"); }
  buyPart(catalogId) { return this.request("parts/purchase.php", { method: "POST", body: { catalogId }, csrf: true }); }
  installPart(inventoryId, carId) { return this.request("parts/install.php", { method: "POST", body: { inventoryId, carId }, csrf: true }); }
  uninstallPart(inventoryId) { return this.request("parts/uninstall.php", { method: "POST", body: { inventoryId }, csrf: true }); }
  stageUp(carId) { return this.request("garage/stage-up.php", { method: "POST", body: { carId }, csrf: true }); }
  tutorialAdvance(action) { return this.request("tutorial/advance.php", { method: "POST", body: { action }, csrf: true }); }
  tutorialReset() { return this.request("tutorial/reset.php", { method: "POST", body: {}, csrf: true }); }
  usedLot() { return this.request("usedlot/listings.php"); }
  refreshUsedLot() { return this.request("usedlot/refresh.php", { method: "POST", body: {}, csrf: true }); }
  buyUsedCar(listingId) { return this.request("usedlot/purchase.php", { method: "POST", body: { listingId }, csrf: true }); }
  quickRacePreview() { return this.request("race/preview.php"); }
  startQuickRace(distance = "1/4") { return this.request("race/start.php", { method: "POST", body: { distance }, csrf: true }); }
  finishQuickRace(raceId) { return this.request("race/finish.php", { method: "POST", body: { raceId }, csrf: true }); }
  quickRace(distance = "1/4") { return this.startQuickRace(distance); }
  circuitCatalog() { return this.request("circuit/catalog.php"); }
  circuitStart(circuitId) { return this.request("circuit/start.php", { method: "POST", body: { circuitId }, csrf: true }); }
  circuitAbandon() { return this.request("circuit/abandon.php", { method: "POST", body: {}, csrf: true }); }
  startCircuitRace(circuitId) { return this.request("circuit/race-start.php", { method: "POST", body: { circuitId }, csrf: true }); }
  finishCircuitRace(raceId) { return this.request("circuit/race-finish.php", { method: "POST", body: { raceId }, csrf: true }); }
  roguelikeStart() { return this.request("roguelike/start.php", { method: "POST", body: {}, csrf: true }); }
  roguelikeStep(choice) { return this.request("roguelike/step.php", { method: "POST", body: { choice }, csrf: true }); }
}
