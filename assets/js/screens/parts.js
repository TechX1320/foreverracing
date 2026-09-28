import { bindHome, carLabel, escapeHtml, money, number, pageShell, selectedCar } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";

let catalogCache = null;
const REQUIRED = ["intake", "exhaust", "ecu", "fuel", "drivetrain", "suspension", "tires", "weight"];
const BUILD_NAMES = {
  1: "Street Car",
  2: "Street Race Car",
  3: "Front-Half Race Car",
  4: "Full Race Car",
};

export async function renderParts(ctx) {
  const player = ctx.store.player;
  if (!catalogCache) {
    const data = await ctx.storage.partsCatalog();
    catalogCache = data.parts || [];
  }

  const current = selectedCar(player);
  if (!current) {
    ctx.screenRoot.innerHTML = pageShell({
      title: "Parts",
      eyebrow: "BUILD SHOP",
      hint: "NO CURRENT CAR",
      body: '<div class="empty-state"><strong>Select a car first.</strong><span>The shop always prices and previews parts against your Current Car.</span><div style="margin-top:12px"><button class="button button--primary button--small" data-go-garage>GARAGE</button></div></div>'
    });
    bindHome(ctx.screenRoot, ctx.router);
    ctx.screenRoot.querySelector("[data-go-garage]")?.addEventListener("click", () => ctx.router.navigate("garage"));
    return;
  }

  const stage = Number(current.buildStage || 1);
  const tutorialStep = player?.tutorial?.status === "active" ? player.tutorial.step : null;
  const categories = categoriesForCar(current);

  ctx.screenRoot.innerHTML = pageShell({
    title: "Parts",
    eyebrow: `${carLabel(current)} / ${buildName(stage)}`,
    hint: `${money(player.wallet?.credits)} CR`,
    trail: "Choose a category • shop in a focused window",
    body: `
      <div class="build-shop-summary">
        <div class="build-shop-summary__car">${renderVehicle(current, { stage, view: "sideProfile" })}</div>
        <div class="build-shop-summary__info">
          <div><span>BUILD TYPE</span><strong>${escapeHtml(buildName(stage))}</strong></div>
          <div><span>POWER</span><strong>${number(current.derived?.hp)} hp</strong></div>
          <div><span>TORQUE</span><strong>${number(current.derived?.torque)} lb-ft</strong></div>
          <div><span>WEIGHT</span><strong>${number(current.derived?.weight)} lb</strong></div>
          <div><span>GRIP</span><strong>${number(current.derived?.grip, 3)}</strong></div>
        </div>
      </div>

      ${tutorialObjective(tutorialStep, current.carId)}

      <section class="parts-category-panel">
        <div class="parts-category-panel__head">
          <div><span class="section-label">PART CATEGORIES</span><strong>Open a category to compare and purchase parts.</strong></div>
          <button class="button button--small" type="button" data-open-inventory>GARAGE INVENTORY</button>
        </div>
        <div class="parts-category-grid">
          ${categories.map((key) => categoryCard(player, current, key, tutorialStep)).join("")}
        </div>
      </section>

      ${streetCarReady(player, current)
        ? `<div class="stage-ready stage-ready--reactive">
            <div><span class="section-label">STREET CAR COMPLETE</span><strong>Ready to turn this into a Street Race Car?</strong><p>Every Street Car category is maxed. Conversion is permanent and unlocks the next set of named race parts.</p></div>
            <button class="button button--primary" data-stage-up>UPGRADE TO STREET RACE CAR</button>
          </div>`
        : ""}
    `
  });

  bindHome(ctx.screenRoot, ctx.router);

  ctx.screenRoot.querySelectorAll("[data-parts-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.partsCategory;
      if (tutorialStep === "buy_first_upgrade" && key !== "intake") {
        ctx.toast("Tutorial step", "Start with Intake. The other categories unlock after your first race.");
        return;
      }
      openCategory(ctx, current.carId, key);
    });
  });

  ctx.screenRoot.querySelector("[data-open-inventory]")?.addEventListener("click", () => {
    sessionStorage.setItem("foreverRacing.openInventory", String(current.carId));
    ctx.router.navigate("garage");
  });

  ctx.screenRoot.querySelector("[data-go-install]")?.addEventListener("click", () => {
    sessionStorage.setItem("foreverRacing.openInventory", String(current.carId));
    ctx.router.navigate("garage");
  });

  ctx.screenRoot.querySelector("[data-stage-up]")?.addEventListener("click", () => promptStageConversion(ctx, current.carId));
}

function categoriesForCar(car) {
  const stage = Number(car.buildStage || 1);
  if (stage === 1) return REQUIRED;
  const available = catalogCache.filter((part) =>
    !part.simpleTier
    && Number(part.buildStage || 2) <= stage
    && Number(part.persistentFromStage || part.buildStage || 2) <= stage
  );
  return [...new Set(available.map((part) => part.categoryKey))];
}

function categoryCard(player, car, key, tutorialStep = null) {
  const stage = Number(car.buildStage || 1);
  const specs = categorySpecs(car, key);
  const label = specs[0]?.category || key;
  const scopedOwned = ownedForCar(player, car.carId).filter((item) => {
    const spec = catalogCache.find((row) => row.catalogId === item.catalogId);
    return spec?.categoryKey === key;
  });

  if (stage === 1) {
    const tier = installedSimpleTier(player, car.carId, key);
    const next = specs.find((part) => Number(part.simpleTier) === tier + 1);
    const ownedNext = next ? scopedOwned.find((item) => item.catalogId === next.catalogId) : null;
    const ftueLocked = tutorialStep === "buy_first_upgrade" && key !== "intake";
    const ftueTarget = tutorialStep === "buy_first_upgrade" && key === "intake";
    return `
      <button class="parts-category-card ${tier >= 3 ? "is-complete" : ""} ${ftueTarget ? "tutorial-target parts-category-card--ftue" : ""}" type="button" data-parts-category="${escapeHtml(key)}" ${ftueLocked ? "disabled" : ""}>
        <span class="parts-category-card__name">${escapeHtml(label)}</span>
        <strong>${tier}/3 COMPLETE</strong>
        <small>${ftueLocked ? "LOCKED UNTIL FIRST RACE" : tier >= 3 ? "Street Car category maxed" : ownedNext ? `${escapeHtml(next.name)} owned — install from Garage` : `Next: ${escapeHtml(next?.name || "Upgrade")}`}</small>
        <i class="meter"><i style="width:${(tier / 3) * 100}%"></i></i>
      </button>`;
  }

  const installed = scopedOwned.find((item) => String(item.installedOnCarId || "") === String(car.carId));
  return `
    <button class="parts-category-card" type="button" data-parts-category="${escapeHtml(key)}">
      <span class="parts-category-card__name">${escapeHtml(label)}</span>
      <strong>${scopedOwned.length} OWNED</strong>
      <small>${installed ? `Installed: ${escapeHtml(partName(installed.catalogId))}` : "Stock setup installed"}</small>
      <i class="parts-category-card__count">${specs.length} options</i>
    </button>`;
}

function openCategory(ctx, carId, key) {
  const player = ctx.store.player;
  const car = player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const tutorialStep = player?.tutorial?.status === "active" ? player.tutorial.step : null;
  if (tutorialStep === "buy_first_upgrade" && key !== "intake") {
    ctx.toast("Tutorial step", "Buy the Stage 1 Intake first.");
    return;
  }
  const specs = categorySpecs(car, key);
  if (!specs.length) return;

  const dialog = showDialog(`
    <div class="dialog-body parts-shop-dialog">
      <div class="parts-shop-dialog__titlebar">
        <div>
          <span class="section-label">${tutorialStep === "buy_first_upgrade" ? "STEP 4/6 • BUY THIS PART" : escapeHtml(buildName(Number(car.buildStage || 1)))}</span>
          <h2>${escapeHtml(specs[0]?.category || key)}</h2>
          <p>${escapeHtml(carLabel(car))}</p>
        </div>
        <div class="parts-shop-dialog__stats">
          <span><small>HP</small><b>${number(car.derived?.hp)}</b></span>
          <span><small>TQ</small><b>${number(car.derived?.torque)}</b></span>
          <span><small>WT</small><b>${number(car.derived?.weight)} lb</b></span>
        </div>
      </div>
      ${tutorialStep === "buy_first_upgrade" ? '<div class="ftue-inline-command"><strong>BUY THE STAGE 1 INTAKE</strong><span>This is the only purchase available until you complete your first race.</span></div>' : ""}
      <div class="parts-shop-list">
        ${Number(car.buildStage || 1) === 1
          ? streetCategoryRows(player, car, specs, tutorialStep)
          : choiceCategoryRows(player, car, specs)}
      </div>
      <div class="parts-shop-dialog__note">Buying adds the part to this car. Installation happens from Garage Inventory.</div>
      <div class="dialog-actions"><button class="button button--small" type="button" data-close>CLOSE</button><button class="button button--primary button--small" type="button" data-inventory>GARAGE INVENTORY</button></div>
    </div>`);

  dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-inventory]")?.addEventListener("click", () => {
    closeDialog(dialog);
    sessionStorage.setItem("foreverRacing.openInventory", String(car.carId));
    ctx.router.navigate("garage");
  });
  dialog.querySelectorAll("[data-buy-part]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.buyPart(button.dataset.buyPart);
        ctx.store.setPlayer(data.player);
        closeDialog(dialog);
        ctx.toast("Part purchased", "Owned. Now install it from the car's Garage Inventory.");
        if (data.player?.tutorial?.status === "active" && data.player?.tutorial?.step === "install_first_upgrade") {
          sessionStorage.setItem("foreverRacing.openInventory", String(car.carId));
          ctx.router.navigate("garage");
        } else {
          await renderParts(ctx);
        }
      } catch (err) {
        ctx.toast("Purchase blocked", err.message);
        button.disabled = false;
      }
    });
  });
}

function streetCategoryRows(player, car, specs, tutorialStep = null) {
  const currentTier = installedSimpleTier(player, car.carId, specs[0]?.categoryKey || "");
  const rows = specs
    .sort((a, b) => Number(a.simpleTier) - Number(b.simpleTier))
    .filter((part) => tutorialStep !== "buy_first_upgrade" || String(part.catalogId) === "s1_intake_1");
  return rows
    .map((part) => {
      const tier = Number(part.simpleTier || 0);
      const owned = findInventory(player, part.catalogId, car.carId);
      const installed = owned && String(owned.installedOnCarId || "") === String(car.carId);
      const next = tier === currentTier + 1;
      const complete = tier <= currentTier;
      const projected = projectStats(player, car, part);
      const canBuy = next && !owned && Number(player.wallet?.credits || 0) >= Number(part.price || 0);
      let action = '<span class="status-text">LOCKED</span>';
      if (installed) action = '<span class="status-text status-text--good">INSTALLED</span>';
      else if (complete) action = '<span class="status-text status-text--good">COMPLETED</span>';
      else if (owned) action = '<span class="status-text status-text--good">OWNED</span>';
      else if (next) action = `<button class="button button--primary button--small" data-buy-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY • ${money(part.price)} CR</button>`;

      return `<article class="parts-shop-row ${complete ? "is-complete" : ""}">
        <div class="parts-shop-row__title"><span>STEP ${tier}</span><strong>${escapeHtml(part.name)}</strong><small>${escapeHtml(part.description || "")}</small></div>
        <div class="parts-shop-row__delta">
          <span>HP <b>${number(car.derived?.hp)} → ${number(projected.hp)}</b></span>
          <span>TQ <b>${number(car.derived?.torque)} → ${number(projected.torque)}</b></span>
          <span>WT <b>${number(car.derived?.weight)} → ${number(projected.weight)}</b></span>
        </div>
        <div class="parts-shop-row__action">${action}</div>
      </article>`;
    }).join("");
}

function choiceCategoryRows(player, car, specs) {
  return specs.map((part) => {
    const owned = findInventory(player, part.catalogId, car.carId);
    const installed = owned && String(owned.installedOnCarId || "") === String(car.carId);
    const projected = projectStats(player, car, part);
    const canBuy = !owned && Number(player.wallet?.credits || 0) >= Number(part.price || 0);
    return `<article class="parts-shop-row ${installed ? "is-complete" : ""}">
      <div class="parts-shop-row__title"><strong>${escapeHtml(part.name)}</strong><small>${escapeHtml(part.description || "")}</small></div>
      <div class="parts-shop-row__delta">
        <span>HP <b>${number(car.derived?.hp)} → ${number(projected.hp)}</b></span>
        <span>TQ <b>${number(car.derived?.torque)} → ${number(projected.torque)}</b></span>
        <span>WT <b>${number(car.derived?.weight)} → ${number(projected.weight)}</b></span>
      </div>
      <div class="parts-shop-row__action">${installed
        ? '<span class="status-text status-text--good">INSTALLED</span>'
        : owned
          ? '<span class="status-text status-text--good">OWNED</span>'
          : `<button class="button button--primary button--small" data-buy-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY • ${money(part.price)} CR</button>`
      }</div>
    </article>`;
  }).join("");
}

function promptStageConversion(ctx, carId) {
  const car = ctx.store.player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const dialog = showDialog(`<div class="dialog-body stage-conversion-dialog">
    <div class="dialog-vehicle">${renderVehicle(car, { stage: 2, view: "sideProfile" })}</div>
    <span class="section-label">STREET CAR COMPLETE</span>
    <h2>Upgrade to a Street Race Car?</h2>
    <p>Your completed Street Car setup becomes the permanent baseline. The stock body stays, but the build can become gutted, caged and much more race-focused. The numbered Street Car upgrade ladder is incorporated into the car and cannot be restored.</p>
    <div class="dialog-actions"><button class="button button--small" data-cancel>NOT YET</button><button class="button button--primary" data-confirm>UPGRADE TO STREET RACE CAR</button></div>
    <div class="form-error" data-error></div>
  </div>`);
  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.stageUp(carId);
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast("Street Race Car unlocked", "Named race parts are now available by category.");
      await renderParts(ctx);
    } catch (err) {
      dialog.querySelector("[data-error]").textContent = err.message;
      event.currentTarget.disabled = false;
    }
  });
}

function tutorialObjective(step, carId) {
  if (step === "buy_first_upgrade") {
    return `<section class="ftue-focus-panel ftue-focus-panel--compact">
      <div class="ftue-focus-panel__step">STEP 4/6</div>
      <div class="ftue-focus-panel__copy"><span>FIRST MOD</span><strong>Click INTAKE.</strong><p>Everything else is locked. Buy the Stage 1 Intake, then the game will take you directly back to your Garage.</p></div>
      <div class="ftue-focus-panel__arrow">↓ INTAKE IS HIGHLIGHTED</div>
    </section>`;
  }
  if (step === "install_first_upgrade") {
    return `<div class="objective-box objective-box--active"><div><span class="objective-kicker">STEP 5/6 • INSTALL YOUR PART</span><strong>Your new part is in Garage Inventory</strong></div><p>The shop is for buying. Installation and swapping happen on the car itself in the Garage.</p><button class="button button--primary button--small" data-go-install data-car-id="${escapeHtml(carId)}">OPEN GARAGE INVENTORY</button></div>`;
  }
  return "";
}

function categorySpecs(car, key) {
  const stage = Number(car.buildStage || 1);
  if (stage === 1) {
    return catalogCache.filter((part) => part.categoryKey === key && Number(part.buildStage) === 1 && Number(part.simpleTier || 0) > 0);
  }
  return catalogCache.filter((part) =>
    part.categoryKey === key
    && !part.simpleTier
    && Number(part.buildStage || 2) <= stage
    && Number(part.persistentFromStage || part.buildStage || 2) <= stage
  );
}

function streetCarReady(player, car) {
  if (Number(car.buildStage || 1) !== 1) return false;
  return REQUIRED.every((key) => installedSimpleTier(player, car.carId, key) >= 3);
}

function installedSimpleTier(player, carId, key) {
  let tier = 0;
  for (const item of player?.inventory?.parts || []) {
    if (String(item.installedOnCarId || "") !== String(carId)) continue;
    const spec = catalogCache.find((part) => part.catalogId === item.catalogId);
    if (spec?.categoryKey === key) tier = Math.max(tier, Number(spec.simpleTier || 0));
  }
  return tier;
}

function ownedForCar(player, carId) {
  return (player?.inventory?.parts || []).filter((item) =>
    String(item.purchasedForCarId || "") === String(carId)
    || String(item.installedOnCarId || "") === String(carId)
  );
}

function findInventory(player, catalogId, carId) {
  return ownedForCar(player, carId).find((item) => item.catalogId === catalogId) || null;
}

function partName(catalogId) {
  return catalogCache.find((part) => part.catalogId === catalogId)?.name || "Part";
}

function buildName(stage) {
  return BUILD_NAMES[Number(stage)] || "Race Car";
}

function projectStats(player, car, candidate) {
  const seed = Number(car.buildStage || 1) >= 2 && car.stageBaseline ? car.stageBaseline : car.base;
  const stats = {
    hp: Number(seed.hp),
    torque: Number(seed.torque),
    weight: Number(seed.weight),
    grip: Number(seed.grip || 1)
  };

  for (const item of player?.inventory?.parts || []) {
    if (String(item.installedOnCarId || "") !== String(car.carId)) continue;
    const spec = catalogCache.find((part) => part.catalogId === item.catalogId);
    if (!spec || String(spec.slot) === String(candidate.slot)) continue;
    applyEffects(stats, spec.effects || []);
  }

  applyEffects(stats, candidate.effects || []);
  return {
    hp: Math.round(stats.hp),
    torque: Math.round(stats.torque),
    weight: Math.round(stats.weight),
    grip: Math.round(stats.grip * 1000) / 1000
  };
}

function applyEffects(stats, effects) {
  for (const effect of effects) {
    const stat = String(effect.stat || "");
    if (!(stat in stats)) continue;
    const value = Number(effect.value || 0);
    if (effect.op === "mul") stats[stat] *= value;
    else stats[stat] += value;
  }
}
