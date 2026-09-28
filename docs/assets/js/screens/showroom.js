import { bindHome, escapeHtml, money, number, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";

let catalogCache = null;
let activeClass = "All";

export async function renderShowroom(ctx) {
  const player = ctx.store.player;
  const data = await ctx.storage.carCatalog();
  catalogCache = data.cars || [];

  const tutorialStarterStep = player?.tutorial?.status === "active" && player?.tutorial?.step === "buy_first_car";
  const available = tutorialStarterStep ? catalogCache.filter((car) => car.starter) : catalogCache;
  const classes = ["All", ...new Set(available.map((car) => car.class).filter(Boolean))];
  if (!classes.includes(activeClass)) activeClass = "All";
  const cars = activeClass === "All" ? available : available.filter((car) => car.class === activeClass);

  ctx.screenRoot.innerHTML = pageShell({
    title: "Showroom",
    eyebrow: "NEW CARS",
    hint: `${money(player?.wallet?.credits)} CR`,
    trail: tutorialStarterStep ? "FTUE: choose your first build" : "Factory inventory",
    body: `
      ${tutorialStarterStep ? tutorialBox() : ""}
      <div class="filter-row compact-filters">
        ${classes.map((name) => `<button class="filter-chip ${name === activeClass ? "is-active" : ""}" type="button" data-showroom-class="${escapeHtml(name)}">${name === "All" ? "ALL" : `CLASS ${escapeHtml(name)}`}</button>`).join("")}
      </div>
      <div class="data-list showroom-list">
        <div class="data-list__head"><span>Vehicle</span><span>Output</span><span>Weight</span><span>Drive</span><span>Price</span><span></span></div>
        ${cars.map((car) => showroomRow(car, player, tutorialStarterStep)).join("")}
      </div>`
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelectorAll("[data-showroom-class]").forEach((button) => {
    button.addEventListener("click", () => {
      activeClass = button.dataset.showroomClass || "All";
      renderShowroom(ctx);
    });
  });
  ctx.screenRoot.querySelectorAll("[data-buy-car]").forEach((button) => {
    button.addEventListener("click", () => confirmPurchase(ctx, Number(button.dataset.buyCar)));
  });
}

function showroomRow(car, player, tutorialStarterStep) {
  const canBuy = Number(player?.wallet?.credits || 0) >= Number(car.price || 0);
  return `
    <article class="data-row vehicle-row ${tutorialStarterStep ? "tutorial-target" : ""}">
      <div class="vehicle-row__identity">
        ${renderVehicle({ ...car, displayName: `${car.year} ${car.make} ${car.model}` }, { compact: true, view: "showroom" })}
        <div><strong>${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}</strong><small>Class ${escapeHtml(car.class)}${car.starter ? " • Starter eligible" : ""}</small></div>
      </div>
      <div><strong>${number(car.base.hp)} hp</strong><small>${number(car.base.torque)} lb-ft</small></div>
      <div><strong>${number(car.base.weight)} lb</strong><small>stock</small></div>
      <div><strong>${escapeHtml(car.base.drivetrain)}</strong><small>factory</small></div>
      <div><strong>${money(car.price)} cr</strong><small>new</small></div>
      <div><button class="button button--primary button--small" type="button" data-buy-car="${car.stockId}" ${canBuy ? "" : "disabled"}>${canBuy ? "BUY" : "SHORT"}</button></div>
    </article>`;
}

function tutorialBox() {
  return `<div class="objective-box objective-box--active">
    <div><span class="objective-kicker">FTUE • STEP 2</span><strong>Choose your first car</strong></div>
    <p>These three cars teach different build styles: light FWD, RWD muscle, and RWD import. Pick the one you actually want to build.</p>
  </div>`;
}

function confirmPurchase(ctx, stockId) {
  const car = catalogCache?.find((entry) => Number(entry.stockId) === stockId);
  if (!car) return;
  const player = ctx.store.player;
  const dialog = showDialog(`
    <div class="dialog-body">
      <div class="dialog-vehicle">${renderVehicle({ ...car, displayName: `${car.year} ${car.make} ${car.model}` }, { view: "showroom" })}</div>
      <h2>Buy ${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}?</h2>
      <p>It enters your Garage at Build Stage 1. The first car you buy becomes your Current Car automatically.</p>
      <div class="spec-grid">
        <div class="spec"><span>Price</span><strong>${money(car.price)} cr</strong></div>
        <div class="spec"><span>After purchase</span><strong>${money(Number(player?.wallet?.credits || 0) - Number(car.price || 0))} cr</strong></div>
      </div>
      <div class="form-error" data-purchase-error></div>
      <div class="dialog-actions">
        <button class="button button--small" type="button" data-cancel>Cancel</button>
        <button class="button button--primary button--small" type="button" data-confirm>Buy car</button>
      </div>
    </div>`);
  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const data = await ctx.storage.buyNewCar(stockId);
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast("Car purchased", `${car.year} ${car.make} ${car.model} is in your garage.`);
      if (data.player?.tutorial?.step === "visit_garage") ctx.router.navigate("garage");
      else await renderShowroom(ctx);
    } catch (err) {
      dialog.querySelector("[data-purchase-error]").textContent = err.message;
      button.disabled = false;
    }
  });
}
