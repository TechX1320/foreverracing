import { bindHome, escapeHtml, money, number, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";
import { isContentReleased } from "../domain/ContentRelease.js";

let catalogCache = null;

export async function renderShowroom(ctx) {
  const player = ctx.store.player;
  const data = await ctx.storage.carCatalog();
  catalogCache = data.cars || [];
  const cars = catalogCache.filter((car) => car?.market?.showroom === true && isContentReleased(car));

  ctx.screenRoot.innerHTML = pageShell({
    title: "Showroom",
    eyebrow: "DEALER INVENTORY",
    hint: `${money(player?.wallet?.credits)} CR`,
    trail: "V0.4G validated vehicle catalog",
    body: cars.length
      ? `<div class="classifieds-grid showroom-grid">${cars.map((car) => showroomCard(car, player)).join("")}</div>`
      : `<div class="empty-state"><strong>The dealer floor is empty right now.</strong><span>V0.4G keeps gameplay limited to spec-validated cars while the full 57-car PNG roster is prepared. New dealer cars return as more of the 57-car art pack receives gameplay data.</span><div class="cluster" style="justify-content:center;margin-top:12px"><button class="button button--primary" data-go-classifieds>OPEN CLASSIFIEDS</button></div></div>`
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-go-classifieds]")?.addEventListener("click", () => ctx.router.navigate("usedlot"));
  ctx.screenRoot.querySelectorAll("[data-buy-car]").forEach((button) => {
    button.addEventListener("click", () => confirmPurchase(ctx, Number(button.dataset.buyCar)));
  });
}

function showroomCard(car, player) {
  const canBuy = Number(player?.wallet?.credits || 0) >= Number(car.price || 0);
  const visualCar = showroomPaintCar(car);
  return `
    <article class="classified-card showroom-card">
      <div class="classified-card__visual">${renderVehicle(visualCar, { view: "showroom" })}</div>
      <div class="classified-card__body">
        <div class="classified-card__title">
          <div><strong>${escapeHtml(catalogName(car))}</strong><small>${escapeHtml(car.class || "—")} CLASS • PI ${number(car.benchmark?.performanceIndex || 0)} • ${escapeHtml(car.base?.drivetrain || "")}</small></div>
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
  const visualCar = showroomPaintCar(car);
  const player = ctx.store.player;
  const dialog = showDialog(`
    <div class="dialog-body classified-detail-dialog">
      <div class="classified-detail-dialog__hero">
        <div class="dialog-vehicle">${renderVehicle(visualCar, { view: "showroom" })}</div>
        <div><span class="section-label">SHOWROOM / ${escapeHtml(car.class || "UNRATED")} CLASS</span><h2>${escapeHtml(catalogName(car))}</h2><p>PI ${number(car.benchmark?.performanceIndex || 0)} • ${escapeHtml(car.base?.drivetrain || "")}</p><strong class="classified-detail-price">${money(car.price)} cr</strong></div>
      </div>
      <div class="form-error" data-purchase-error></div>
      <div class="dialog-actions">
        <button class="button" type="button" data-cancel>CANCEL</button>
        <button class="button button--primary" type="button" data-confirm>BUY CAR • ${money(car.price)} CR</button>
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
      ctx.toast("Car purchased", `${catalogName(car)} is in your Garage.`);
      await renderShowroom(ctx);
    } catch (err) {
      dialog.querySelector("[data-purchase-error]").textContent = err.message;
      button.disabled = false;
    }
  });
}

function showroomPaintCar(car) {
  const palette = Array.isArray(car?.visual?.paintPalette) ? car.visual.paintPalette : [];
  const color = String(car?.visual?.paintColor || palette[0] || "").trim();
  if (!color) return car;
  const visualCar = structuredClone(car);
  visualCar.visual ||= {};
  visualCar.visual.paintColor = color;
  return visualCar;
}

function catalogName(car) {
  return String(car?.displayName || [car?.year, car?.make, car?.model].filter(Boolean).join(" ") || "Unknown Car");
}
