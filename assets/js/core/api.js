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
  partsCatalog() { return this.request("parts/catalog.php"); }
  buyPart(catalogId) { return this.request("parts/purchase.php", { method: "POST", body: { catalogId }, csrf: true }); }
  installPart(inventoryId, carId) { return this.request("parts/install.php", { method: "POST", body: { inventoryId, carId }, csrf: true }); }
  uninstallPart(inventoryId) { return this.request("parts/uninstall.php", { method: "POST", body: { inventoryId }, csrf: true }); }
  usedLot() { return this.request("usedlot/listings.php"); }
  refreshUsedLot() { return this.request("usedlot/refresh.php", { method: "POST", body: {}, csrf: true }); }
  buyUsedCar(listingId) { return this.request("usedlot/purchase.php", { method: "POST", body: { listingId }, csrf: true }); }
  quickRace() { return this.request("race/quick.php", { method: "POST", body: {}, csrf: true }); }
  roguelikeStart() { return this.request("roguelike/start.php", { method: "POST", body: {}, csrf: true }); }
  roguelikeStep(choice) { return this.request("roguelike/step.php", { method: "POST", body: { choice }, csrf: true }); }
}
