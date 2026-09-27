import { bindHome, escapeHtml, money, number, pageShell } from "../ui/components.js";
import { showDialog, closeDialog } from "../ui/modal.js";

export async function renderUsedLot(ctx) {
  const data = await ctx.storage.usedLot();
  const player = ctx.store.player;
  const catalog = data.cars || [];
  const lot = data.lot || { listings: [] };
  const listings = lot.listings || [];

  ctx.screenRoot.innerHTML = pageShell({
    title: "Used Car Lot",
    eyebrow: "ROTATING INVENTORY",
    hint: `${listings.length} available`,
    trail: `Refreshes ${formatTime(lot.expiresAt)}`,
    body: `
      <div class="split" style="margin-bottom:14px"><p class="screen-copy" style="margin:0">NPC listings for now. The data model leaves room for player-to-player listings later.</p><button class="button button--small" type="button" data-refresh-lot>Dev Refresh</button></div>
      ${listings.length ? `<div class="card-grid">${listings.map((listing) => usedCard(listing, catalog, player)).join("")}</div>` : `<div class="empty-state"><strong>The lot is empty.</strong><span>Refresh the inventory or check back later.</span></div>`}
    `,
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-refresh-lot]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await ctx.storage.refreshUsedLot();
      ctx.toast("Used lot refreshed", "A new set of listings has arrived.");
      await renderUsedLot(ctx);
    } catch (err) {
      ctx.toast("Refresh failed", err.message);
      event.currentTarget.disabled = false;
    }
  });
  ctx.screenRoot.querySelectorAll("[data-buy-used]").forEach((button) => button.addEventListener("click", () => confirmUsed(ctx, button.dataset.buyUsed, listings, catalog)));
}

function usedCard(listing, catalog, player) {
  const car = catalog.find((entry) => Number(entry.stockId) === Number(listing.stockId));
  if (!car) return "";
  const canBuy = Number(player?.wallet?.credits || 0) >= Number(listing.price || 0);
  return `<article class="game-card"><div class="game-card__top"><div><h3>${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}</h3><p>${number(listing.mileage)} miles • ${number(listing.condition)}% condition</p></div><span class="game-card__price">${money(listing.price)} cr</span></div><div class="spec-grid"><div class="spec"><span>Power</span><strong>${number(car.base.hp)} hp</strong></div><div class="spec"><span>Drivetrain</span><strong>${escapeHtml(car.base.drivetrain)}</strong></div><div class="spec"><span>New Price</span><strong>${money(car.price)} cr</strong></div><div class="spec"><span>Condition</span><strong>${number(listing.condition)}%</strong></div></div><div class="game-card__actions"><button class="button button--primary button--small" type="button" data-buy-used="${escapeHtml(listing.listingId)}" ${canBuy ? "" : "disabled"}>${canBuy ? "Buy Used" : "Need More Credits"}</button></div></article>`;
}

function confirmUsed(ctx, listingId, listings, catalog) {
  const listing = listings.find((entry) => String(entry.listingId) === String(listingId));
  const car = catalog.find((entry) => Number(entry.stockId) === Number(listing?.stockId));
  if (!listing || !car) return;
  const dialog = showDialog(`<div class="dialog-body"><h2>Buy this ${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}?</h2><p>Used cars keep their mileage and condition. Mechanical condition does not alter performance yet, but the field is already part of the owned-car record.</p><div class="spec-grid"><div class="spec"><span>Price</span><strong>${money(listing.price)} cr</strong></div><div class="spec"><span>Mileage</span><strong>${number(listing.mileage)} mi</strong></div><div class="spec"><span>Condition</span><strong>${number(listing.condition)}%</strong></div><div class="spec"><span>Balance</span><strong>${money(ctx.store.player?.wallet?.credits)} cr</strong></div></div><div class="form-error" data-error></div><div class="dialog-actions"><button class="button button--small" type="button" data-cancel>Cancel</button><button class="button button--primary button--small" type="button" data-confirm>Purchase</button></div></div>`);
  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.buyUsedCar(listingId);
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast("Used car purchased", `${car.year} ${car.make} ${car.model} is in your garage.`);
      await renderUsedLot(ctx);
    } catch (err) {
      dialog.querySelector("[data-error]").textContent = err.message;
      event.currentTarget.disabled = false;
    }
  });
}

function formatTime(timestamp) {
  if (!timestamp) return "soon";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(Number(timestamp) * 1000));
}
