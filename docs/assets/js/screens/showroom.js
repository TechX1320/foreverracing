import { bindHome, escapeHtml, money, number, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";

let catalogCache = null;
let activeClass = "All";

export async function renderShowroom(ctx) {
  const player = ctx.store.player;
  const data = await ctx.storage.carCatalog();
  catalogCache = data.cars || [];

  const newestYear = new Date().getFullYear() - 10;
  const available = catalogCache.filter((car) => Number(car.year || 0) >= newestYear);
  const classes = ["All", ...new Set(available.map((car) => car.class).filter(Boolean))];
  if (!classes.includes(activeClass)) activeClass = "All";
  const cars = activeClass === "All" ? available : available.filter((car) => car.class === activeClass);

  ctx.screenRoot.innerHTML = pageShell({
    title: "Showroom",
    eyebrow: "NEWER / DEALER CARS",
    hint: `${money(player?.wallet?.credits)} CR`,
    trail: "Newer inventory • older cars belong in Classifieds",
    body: `
      <div class="classifieds-intro showroom-intro">
        <p>The Showroom is for newer dealer inventory. Older platforms and bargain builds belong in Classifieds.</p>
      </div>
      <div class="filter-row compact-filters">
        ${classes.map((name) => `<button class="filter-chip ${name === activeClass ? "is-active" : ""}" type="button" data-showroom-class="${escapeHtml(name)}">${name === "All" ? "ALL" : `CLASS ${escapeHtml(name)}`}</button>`).join("")}
      </div>
      ${cars.length
        ? `<div class="classifieds-grid showroom-grid">${cars.map((car) => showroomCard(car, player)).join("")}</div>`
        : '<div class="empty-state"><strong>No modern dealer inventory yet.</strong><span>Use Classifieds for older cars while the new-car catalog grows.</span></div>'}`
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

function showroomCard(car, player) {
  const canBuy = Number(player?.wallet?.credits || 0) >= Number(car.price || 0);
  return `
    <article class="classified-card showroom-card">
      <div class="classified-card__visual">${renderVehicle({ ...car, displayName: `${car.year} ${car.make} ${car.model}` }, { view: "showroom" })}</div>
      <div class="classified-card__body">
        <div class="classified-card__title">
          <div><strong>${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}</strong><small>Class ${escapeHtml(car.class)} • ${escapeHtml(car.base?.drivetrain || "")}</small></div>
          <span class="condition-badge is-excellent">NEW</span>
        </div>
        <div class="showroom-card__specs">
          <span><small>POWER</small><b>${number(car.base?.hp)} hp</b></span>
          <span><small>WEIGHT</small><b>${number(car.base?.weight)} lb</b></span>
          <span><small>PRICE</small><b>${money(car.price)} cr</b></span>
        </div>
        <button class="button button--primary button--wide" type="button" data-buy-car="${car.stockId}" ${canBuy ? "" : "disabled"}>${canBuy ? "VIEW & BUY" : "NOT ENOUGH CREDITS"}</button>
      </div>
    </article>`;
}

function confirmPurchase(ctx, stockId) {
  const car = catalogCache?.find((entry) => Number(entry.stockId) === stockId);
  if (!car) return;
  const player = ctx.store.player;
  const dialog = showDialog(`
    <div class="dialog-body">
      <div class="dialog-vehicle">${renderVehicle({ ...car, displayName: `${car.year} ${car.make} ${car.model}` }, { view: "showroom" })}</div>
      <h2>Buy ${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}?</h2>
      <p>It enters your Garage as a Street Car. The first car you buy becomes your Current Car automatically.</p>
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
