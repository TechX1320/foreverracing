import { bindHome, escapeHtml, money, number, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";

export async function renderUsedLot(ctx) {
  const data = await ctx.storage.usedLot();
  const player = ctx.store.player;
  const catalog = data.cars || [];
  let lot = data.lot || { listings: [] };
  const tutorialStarter = player?.tutorial?.status === "active" && player?.tutorial?.step === "buy_first_car";
  let listings = lot.listings || [];
  let visibleListings = tutorialStarter
    ? listings.filter((listing) => {
        const car = catalog.find((entry) => Number(entry.stockId) === Number(listing.stockId));
        return Boolean(car?.starter) && String(car?.class || "").toUpperCase() === "D";
      })
    : listings;

  if (tutorialStarter && visibleListings.length < 3) {
    const refreshed = await ctx.storage.refreshUsedLot();
    lot = refreshed.lot || lot;
    listings = lot.listings || [];
    visibleListings = listings.filter((listing) => {
      const car = catalog.find((entry) => Number(entry.stockId) === Number(listing.stockId));
      return Boolean(car?.starter) && String(car?.class || "").toUpperCase() === "D";
    });
  }

  ctx.screenRoot.innerHTML = pageShell({
    title: "Classifieds",
    eyebrow: tutorialStarter ? "YOUR FIRST CAR" : "USED & OLDER CARS",
    hint: tutorialStarter ? "D CLASS STARTERS" : `${visibleListings.length} listings`,
    trail: tutorialStarter ? "Pick one cheap platform and start from the bottom" : `Refreshes ${formatTime(lot.expiresAt)}`,
    body: `
      ${tutorialStarter ? starterObjective() : `
        <div class="classifieds-intro">
          <p>Older cars, used cars and future player listings live here. Open a listing for the full vehicle and pricing details.</p>
          <button class="button button--small" type="button" data-refresh-lot>DEV REFRESH</button>
        </div>`}
      ${visibleListings.length
        ? `<div class="classifieds-grid ${tutorialStarter ? "classifieds-grid--starter" : ""}">${visibleListings.map((listing) => listingCard(listing, catalog, tutorialStarter)).join("")}</div>`
        : '<div class="empty-state"><strong>No starter listings right now.</strong><span>Refresh the market and try again.</span></div>'}
    `,
  });

  bindHome(ctx.screenRoot, ctx.router);

  ctx.screenRoot.querySelector("[data-refresh-lot]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await ctx.storage.refreshUsedLot();
      ctx.toast("Classifieds refreshed", "A new set of used listings has arrived.");
      await renderUsedLot(ctx);
    } catch (err) {
      ctx.toast("Refresh failed", err.message);
      event.currentTarget.disabled = false;
    }
  });

  ctx.screenRoot.querySelectorAll("[data-listing-details]").forEach((button) => {
    button.addEventListener("click", () => openListing(ctx, button.dataset.listingDetails, listings, catalog, player, tutorialStarter));
  });
}

function starterObjective() {
  return `<section class="ftue-focus-panel">
    <div class="ftue-focus-panel__step">STEP 2/6</div>
    <div class="ftue-focus-panel__copy">
      <span>FIRST CAR</span>
      <strong>Pick a D Class beater.</strong>
      <p>You are not starting rich. Choose one used starter below and build it into something worth racing.</p>
    </div>
    <div class="ftue-focus-panel__arrow">↓ SELECT A CAR BELOW</div>
  </section>`;
}

function listingCard(listing, catalog, tutorialStarter = false) {
  const car = catalog.find((entry) => Number(entry.stockId) === Number(listing.stockId));
  if (!car) return "";
  return `
    <article class="classified-card ${tutorialStarter ? "tutorial-target classified-card--starter" : ""}">
      <div class="classified-card__visual">${renderVehicle(car, { stage: 1, view: "sideProfile" })}</div>
      <div class="classified-card__body">
        <div class="classified-card__title">
          <div><strong>${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}</strong><small>${escapeHtml(car.class || "")} • ${escapeHtml(car.base?.drivetrain || "")}</small></div>
          <span class="condition-badge ${conditionClass(listing.condition)}">${number(listing.condition)}%</span>
        </div>
        <div class="classified-card__meta"><span>${number(listing.mileage)} mi</span><b>${money(listing.price)} cr</b></div>
        <button class="button button--primary button--wide" type="button" data-listing-details="${escapeHtml(listing.listingId)}">${tutorialStarter ? "SELECT THIS CAR" : "MORE DETAILS"}</button>
      </div>
    </article>`;
}

function openListing(ctx, listingId, listings, catalog, playerSnapshot, tutorialStarter = false) {
  const listing = listings.find((entry) => String(entry.listingId) === String(listingId));
  const car = catalog.find((entry) => Number(entry.stockId) === Number(listing?.stockId));
  if (!listing || !car) return;

  const canBuy = Number(ctx.store.player?.wallet?.credits || 0) >= Number(listing.price || 0);
  const conditionFactor = Number(listing.conditionFactor || 1);
  const mileageFactor = Number(listing.mileageFactor || 1);
  const basePrice = Number(listing.basePrice || car.price || 0);
  const savings = Math.max(0, basePrice - Number(listing.price || 0));

  const dialog = showDialog(`
    <div class="dialog-body classified-detail-dialog">
      <div class="classified-detail-dialog__hero">
        <div class="dialog-vehicle">${renderVehicle(car, { stage: 1, view: "sideProfile" })}</div>
        <div>
          <span class="section-label">${tutorialStarter ? "FIRST CAR / D CLASS" : "CLASSIFIED LISTING"}</span>
          <h2>${car.year} ${escapeHtml(car.make)} ${escapeHtml(car.model)}</h2>
          <p>${conditionText(listing.condition)} • ${number(listing.mileage)} miles • ${escapeHtml(car.base?.drivetrain || "")}</p>
          <strong class="classified-detail-price">${money(listing.price)} cr</strong>
        </div>
      </div>

      <div class="classified-detail-specs">
        <div><span>POWER</span><b>${number(car.base?.hp)} hp</b></div>
        <div><span>TORQUE</span><b>${number(car.base?.torque)} lb-ft</b></div>
        <div><span>WEIGHT</span><b>${number(car.base?.weight)} lb</b></div>
        <div><span>DRIVETRAIN</span><b>${escapeHtml(car.base?.drivetrain || "-")}</b></div>
        <div><span>MILEAGE</span><b>${number(listing.mileage)} mi</b></div>
        <div><span>CONDITION</span><b>${number(listing.condition)}%</b></div>
      </div>

      <section class="classified-price-breakdown">
        <div><span>Catalog / reference price</span><b>${money(basePrice)} cr</b></div>
        <div><span>Mileage value factor</span><b>${Math.round(mileageFactor * 100)}%</b></div>
        <div><span>Condition value factor</span><b>${Math.round(conditionFactor * 100)}%</b></div>
        <div class="classified-price-breakdown__final"><span>Listing price</span><b>${money(listing.price)} cr</b></div>
        <p>This pricing model applies mileage and condition separately. A rougher car loses substantially more value than an otherwise similar clean example.</p>
      </section>

      <div class="classified-detail-balance">
        <span>Your balance <b>${money(ctx.store.player?.wallet?.credits || playerSnapshot?.wallet?.credits || 0)} cr</b></span>
        <span>Vs. reference <b>-${money(savings)} cr</b></span>
      </div>

      <p class="classified-detail-note">Mileage and condition are stored on the owned car. Mechanical condition does not change performance yet; that system can be layered in later without changing the listing model.</p>
      <div class="form-error" data-error></div>
      <div class="dialog-actions">
        <button class="button button--small" type="button" data-cancel>CLOSE</button>
        <button class="button button--primary" type="button" data-confirm ${canBuy ? "" : "disabled"}>
          ${canBuy ? (tutorialStarter ? `SELECT THIS CAR • ${money(listing.price)} CR` : `BUY CAR • ${money(listing.price)} CR`) : "NOT ENOUGH CREDITS"}
        </button>
      </div>
    </div>`);

  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.buyUsedCar(listingId);
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast("Car purchased", `${car.year} ${car.make} ${car.model} is now in your Garage.`);
      if (data.player?.tutorial?.status === "active" && data.player?.tutorial?.step === "visit_garage") {
        ctx.router.navigate("garage");
      } else {
        await renderUsedLot(ctx);
      }
    } catch (err) {
      dialog.querySelector("[data-error]").textContent = err.message;
      event.currentTarget.disabled = false;
    }
  });
}

function conditionClass(value) {
  const condition = Number(value || 0);
  if (condition >= 90) return "is-excellent";
  if (condition >= 75) return "is-good";
  return "is-rough";
}

function conditionText(value) {
  const condition = Number(value || 0);
  if (condition >= 90) return "Excellent condition";
  if (condition >= 75) return "Good condition";
  return "Project-grade condition";
}

function formatTime(timestamp) {
  if (!timestamp) return "soon";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(Number(timestamp) * 1000));
}
