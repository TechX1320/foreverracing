import { bindHome, escapeHtml, money, number, pageShell } from "../ui/components.js";
import { showDialog, closeDialog } from "../ui/modal.js";

let catalogCache = null;
let activeClass = "All";

export async function renderShowroom(ctx) {
  const player = ctx.store.player;
  if (!catalogCache) {
    const data = await ctx.storage.carCatalog();
    catalogCache = data.cars || [];
  }

  const classes = ["All", ...new Set(catalogCache.map((car) => car.class).filter(Boolean))];
  const cars = activeClass === "All" ? catalogCache : catalogCache.filter((car) => car.class === activeClass);

  ctx.screenRoot.innerHTML = pageShell({
    title: "Car Showroom",
    eyebrow: "NEW VEHICLES",
    hint: `${money(player?.wallet?.credits)} credits`,
    trail: "Factory fresh • instant delivery",
    body: `
      <div class="filter-row">
        ${classes.map((name) => `<button class="filter-chip ${name === activeClass ? "is-active" : ""}" type="button" data-showroom-class="${escapeHtml(name)}">Class ${escapeHtml(name)}</button>`).join("")}
      </div>
      <div class="card-grid">
        ${cars.map((car) => {
          const canBuy = Number(player?.wallet?.credits || 0) >= Number(car.price || 0);
          return `
            <article class="game-card">
              <div class="game-card__top">
                <div><h3>${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}</h3><p>Class ${escapeHtml(car.class)} • ${escapeHtml(car.base.drivetrain)}</p></div>
                <span class="game-card__price">${money(car.price)} cr</span>
              </div>
              <div class="spec-grid">
                <div class="spec"><span>Power</span><strong>${number(car.base.hp)} hp</strong></div>
                <div class="spec"><span>Torque</span><strong>${number(car.base.torque)} lb-ft</strong></div>
                <div class="spec"><span>Weight</span><strong>${number(car.base.weight)} lb</strong></div>
                <div class="spec"><span>Grip</span><strong>${number(car.base.grip, 3)}</strong></div>
              </div>
              <div class="game-card__actions">
                <button class="button button--primary button--small" type="button" data-buy-car="${car.stockId}" ${canBuy ? "" : "disabled"}>${canBuy ? "Buy New" : "Need More Credits"}</button>
              </div>
            </article>`;
        }).join("")}
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

function confirmPurchase(ctx, stockId) {
  const car = catalogCache?.find((entry) => Number(entry.stockId) === stockId);
  if (!car) return;
  const player = ctx.store.player;

  const dialog = showDialog(`
    <div class="dialog-body">
      <h2>Buy ${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}?</h2>
      <p>This vehicle will be delivered to your Garage immediately. Your first purchased car becomes your Current Car automatically.</p>
      <div class="spec-grid">
        <div class="spec"><span>Price</span><strong>${money(car.price)} cr</strong></div>
        <div class="spec"><span>Balance</span><strong>${money(player?.wallet?.credits)} cr</strong></div>
      </div>
      <div class="form-error" data-purchase-error></div>
      <div class="dialog-actions">
        <button class="button button--small" type="button" data-cancel>Cancel</button>
        <button class="button button--primary button--small" type="button" data-confirm>Purchase</button>
      </div>
    </div>`);

  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const error = dialog.querySelector("[data-purchase-error]");
    button.disabled = true;
    button.textContent = "Purchasing…";
    try {
      const data = await ctx.storage.buyNewCar(stockId);
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast("Car purchased", `${car.year} ${car.make} ${car.model} is now in your garage.`);
      await renderShowroom(ctx);
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
      button.textContent = "Purchase";
    }
  });
}
