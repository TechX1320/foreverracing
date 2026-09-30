import { bindHome, carLabel, escapeHtml, money, number, pageShell, selectedCar } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";
import { renderPartDynoChart } from "../ui/partDyno.js";
import {
  forcedInductionCompatibility,
  forcedInductionMeta,
  forcedInductionState,
  forcedInductionSwapNeeded,
  systemLabel,
} from "../domain/ForcedInduction.js";

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

      ${stageProgressionMarkup(player, current)}
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
  if (key === "forced_induction") return forcedInductionCategoryCard(player, car);
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

  if (key === "forced_induction") {
    openForcedInduction(ctx, carId);
    return;
  }

  if (tutorialStep === "buy_first_upgrade" && key !== "intake") {
    ctx.toast("Tutorial step", "Buy the Stage 1 Intake first.");
    return;
  }

  const specs = categorySpecs(car, key);
  if (!specs.length) return;
  const dialog = showDialog('<div class="dialog-body parts-shop-dialog"></div>');
  renderStandardCategoryDialog(ctx, dialog, carId, key);
}

function renderStandardCategoryDialog(ctx, dialog, carId, key) {
  const player = ctx.store.player;
  const car = player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car || !dialog) return;
  const tutorialStep = player?.tutorial?.status === "active" ? player.tutorial.step : null;
  const specs = categorySpecs(car, key);
  if (!specs.length) {
    closeDialog(dialog);
    return;
  }

  dialog.innerHTML = `
    <div class="dialog-body parts-shop-dialog">
      <div class="parts-shop-dialog__titlebar">
        <div>
          <span class="section-label">${tutorialStep === "buy_first_upgrade" ? "STEP 4/5 • BUY THIS PART" : escapeHtml(buildName(Number(car.buildStage || 1)))}</span>
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
          : key === "engine_kit"
            ? engineKitRows(player, car, specs)
            : choiceCategoryRows(player, car, specs)}
      </div>
      <div class="parts-shop-dialog__note">BUY + INSTALL applies the part immediately. BUY ONLY keeps it in Garage Inventory for later.${Number(car.buildStage || 1) >= 2 ? " Earlier Build Type parts stay available after you advance." : ""}</div>
      <div class="dialog-actions"><button class="button button--small" type="button" data-close>CLOSE</button><button class="button button--primary button--small" type="button" data-inventory>GARAGE INVENTORY</button></div>
    </div>`;

  dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-inventory]")?.addEventListener("click", () => {
    closeDialog(dialog);
    sessionStorage.setItem("foreverRacing.openInventory", String(car.carId));
    ctx.router.navigate("garage");
  });

  dialog.querySelectorAll("[data-buy-part],[data-buy-install-part]").forEach((button) => {
    button.addEventListener("click", async () => {
      const installNow = Boolean(button.dataset.buyInstallPart);
      const catalogId = button.dataset.buyInstallPart || button.dataset.buyPart;
      await purchasePart(ctx, dialog, car, catalogId, installNow, button, key);
    });
  });

  dialog.querySelectorAll("[data-install-shop-part]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.installPart(button.dataset.installShopPart, car.carId);
        ctx.store.setPlayer(data.player);
        ctx.toast("Part installed", "The car's setup and stats were updated.");
        if (data.player?.tutorial?.status === "active" && data.player?.tutorial?.step === "first_race") {
          closeDialog(dialog);
          ctx.router.navigate("quick-race");
          return;
        }
        await renderParts(ctx);
        if (Number(car.buildStage || 1) === 1) renderStandardCategoryDialog(ctx, dialog, carId, key);
        else closeDialog(dialog);
      } catch (err) {
        ctx.toast("Install blocked", err.message);
        button.disabled = false;
      }
    });
  });
}

async function purchasePart(ctx, dialog, car, catalogId, installNow, button, categoryKey = null) {
  button.disabled = true;
  const candidate = catalogCache.find((part) => String(part.catalogId) === String(catalogId));
  if (installNow && candidate && forcedInductionSwapNeeded(car, ctx.store.player?.inventory?.parts || [], candidate, catalogCache)) {
    const state = forcedInductionState(car, ctx.store.player?.inventory?.parts || [], catalogCache);
    const target = systemLabel(forcedInductionMeta(candidate)?.system);
    const current = systemLabel(state.primarySystem);
    const confirmed = globalThis.confirm?.(`Swap ${current} to ${target}? Existing ${current} forced-induction parts will be uninstalled but remain in your inventory.`) ?? true;
    if (!confirmed) {
      button.disabled = false;
      return;
    }
  }
  let purchased = null;
  try {
    purchased = await ctx.storage.buyPart(catalogId);
    ctx.store.setPlayer(purchased.player);

    if (!installNow) {
      closeDialog(dialog);
      ctx.toast("Part purchased", "Saved to Garage Inventory.");
      await renderParts(ctx);
      return;
    }

    const owned = [...(purchased.player?.inventory?.parts || [])]
      .reverse()
      .find((item) =>
        String(item.catalogId) === String(catalogId)
        && String(item.purchasedForCarId || "") === String(car.carId)
        && !item.installedOnCarId
      );

    if (!owned) throw new Error("Purchased part could not be found in this car's inventory.");

    const installed = await ctx.storage.installPart(owned.inventoryId, car.carId);
    ctx.store.setPlayer(installed.player);
    ctx.toast("Purchased + installed", "Upgrade applied immediately.");

    if (installed.player?.tutorial?.status === "active" && installed.player?.tutorial?.step === "first_race") {
      closeDialog(dialog);
      ctx.router.navigate("quick-race");
    } else {
      await renderParts(ctx);
      if (Number(car.buildStage || 1) === 1 && categoryKey && categoryKey !== "forced_induction") {
        renderStandardCategoryDialog(ctx, dialog, car.carId, categoryKey);
      } else {
        closeDialog(dialog);
      }
    }
  } catch (err) {
    if (purchased?.player) {
      closeDialog(dialog);
      ctx.toast("Part purchased", `Installation was blocked: ${err.message}`);
      await renderParts(ctx);
      return;
    }
    ctx.toast("Purchase blocked", err.message);
    button.disabled = false;
  }
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
      else if (owned) action = `<button class="button button--primary button--small" data-install-shop-part="${escapeHtml(owned.inventoryId)}">INSTALL</button>`;
      else if (next) action = tutorialStep === "buy_first_upgrade"
        ? `<button class="button button--primary button--small" data-buy-install-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY + INSTALL • ${money(part.price)} CR</button>`
        : `<div class="parts-shop-row__buy-actions"><button class="button button--primary button--small" data-buy-install-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY + INSTALL • ${money(part.price)} CR</button><button class="button button--small" data-buy-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY ONLY</button></div>`;

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
          ? `<button class="button button--primary button--small" data-install-shop-part="${escapeHtml(owned.inventoryId)}">INSTALL</button>`
          : `<div class="parts-shop-row__buy-actions"><button class="button button--primary button--small" data-buy-install-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY + INSTALL • ${money(part.price)} CR</button><button class="button button--small" data-buy-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY ONLY</button></div>`
      }</div>
    </article>`;
  }).join("");
}

function engineKitRows(player, car, specs) {
  const currentLevel = installedEngineKitLevel(player, car.carId);
  return specs
    .sort((a, b) => Number(a.engineKit?.level || 0) - Number(b.engineKit?.level || 0))
    .map((part) => {
      const level = Number(part.engineKit?.level || 0);
      const owned = findInventory(player, part.catalogId, car.carId);
      const installed = owned && String(owned.installedOnCarId || "") === String(car.carId);
      const projected = projectStats(player, car, part);
      const next = level === currentLevel + 1;
      const canBuy = next && !owned && Number(player.wallet?.credits || 0) >= Number(part.price || 0);
      let action = '<span class="status-text">LOCKED</span>';

      if (installed) action = '<span class="status-text status-text--good">INSTALLED</span>';
      else if (level < currentLevel) action = '<span class="status-text status-text--good">COMPLETED</span>';
      else if (owned && level === currentLevel + 1) action = `<button class="button button--primary button--small" data-install-shop-part="${escapeHtml(owned.inventoryId)}">INSTALL</button>`;
      else if (next) action = `<div class="parts-shop-row__buy-actions"><button class="button button--primary button--small" data-buy-install-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY + INSTALL • ${money(part.price)} CR</button><button class="button button--small" data-buy-part="${escapeHtml(part.catalogId)}" ${canBuy ? "" : "disabled"}>BUY ONLY</button></div>`;

      return `<article class="parts-shop-row ${installed || level < currentLevel ? "is-complete" : ""}">
        <div class="parts-shop-row__title"><span>ENGINE KIT ${level}</span><strong>${escapeHtml(part.name)}</strong><small>${escapeHtml(part.description || "")}</small></div>
        <div class="parts-shop-row__delta">
          <span>HP <b>${number(car.derived?.hp)} → ${number(projected.hp)}</b></span>
          <span>TQ <b>${number(car.derived?.torque)} → ${number(projected.torque)}</b></span>
          <span>CAP <b>${number(part.engineKit?.powerCapacityHp || 0)} hp</b></span>
        </div>
        <div class="parts-shop-row__action">${action}</div>
      </article>`;
    }).join("");
}

function installedEngineKitLevel(player, carId) {
  let level = 0;
  for (const item of player?.inventory?.parts || []) {
    if (String(item.installedOnCarId || "") !== String(carId)) continue;
    const spec = catalogCache.find((part) => String(part.catalogId) === String(item.catalogId));
    level = Math.max(level, Number(spec?.engineKit?.level || 0));
  }
  return level;
}

function engineKitRequirementReason(player, car, part) {
  const required = Math.max(0, Number(part?.requiredEngineKit || 0));
  if (!required) return "";
  const current = installedEngineKitLevel(player, car.carId);
  return current >= required ? "" : `Requires Engine Kit ${required}`;
}

function forcedInductionCategoryCard(player, car) {
  const state = forcedInductionState(car, player?.inventory?.parts || [], catalogCache);
  const turbo = fiSystemStatus(state, "turbo");
  const supercharger = fiSystemStatus(state, "supercharger");
  const nos = state.nitrousShot ? `${state.nitrousShot} SHOT` : "OFF";
  const activeCount = state.systems.length + (state.nitrousShot ? 1 : 0);

  return `
    <button class="parts-category-card parts-category-card--forced" type="button" data-parts-category="forced_induction">
      <span class="parts-category-card__name">FORCED INDUCTION</span>
      <strong>${activeCount ? `${activeCount} SYSTEM${activeCount === 1 ? "" : "S"} ACTIVE` : "STOCK / N/A"}</strong>
      <small>Turbo: ${escapeHtml(turbo)} • Supercharger: ${escapeHtml(supercharger)} • NOS: ${escapeHtml(nos)}</small>
      <i class="parts-category-card__count">Turbo • Supercharger • NOS</i>
    </button>`;
}

function fiSystemStatus(state, system) {
  if (state.primarySystem === system) {
    if (state.primarySource === "factory") {
      const level = state.factoryUpgradeStep ? ` + UPGRADE ${state.factoryUpgradeStep}` : "";
      return `FACTORY${level}`;
    }
    return state.primaryStep ? `KIT UPGRADE ${state.primaryStep}` : "KIT INSTALLED";
  }
  if (state.secondarySystem === system) return "TWIN-CHARGE";
  return "OFF";
}

function openForcedInduction(ctx, carId) {
  const player = ctx.store.player;
  const car = player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const stage = Number(car.buildStage || 1);
  const state = forcedInductionState(car, player?.inventory?.parts || [], catalogCache);

  const dialog = showDialog(`
    <div class="dialog-body forced-induction-dialog">
      <div class="parts-shop-dialog__titlebar">
        <div>
          <span class="section-label">${escapeHtml(buildName(stage))} • POWER ADDERS</span>
          <h2>Forced Induction</h2>
          <p>${escapeHtml(carLabel(car))}</p>
        </div>
        <div class="parts-shop-dialog__stats">
          <span><small>HP</small><b>${number(car.derived?.hp)}</b></span>
          <span><small>TQ</small><b>${number(car.derived?.torque)}</b></span>
          <span><small>WT</small><b>${number(car.derived?.weight)} lb</b></span>
        </div>
      </div>

      <div class="forced-induction-grid">
        ${fiSystemCard("turbo", "TURBO KIT", "Turbocharging", state, stage)}
        ${fiSystemCard("supercharger", "SUPERCHARGER KIT", "Belt-driven boost", state, stage)}
        ${fiSystemCard("nitrous", "NOS KIT", "Bottle + fogger", state, stage)}
      </div>

      <div class="forced-induction-note">
        <b>STAGE ${stage}</b>
        <span>${stage === 2
          ? "Choose Turbo or Supercharger as the primary kit; factory boosted cars start with their factory kit already installed. NOS is independent."
          : stage === 3
            ? "Individual turbo/supercharger hardware is unlocked. NOS can step through 75 / 100 / 150 shots."
            : "Full Race Car unlocks twin charging plus 175 / 200 / 250 / 300 shot NOS."}</span>
      </div>

      <div class="dialog-actions"><button class="button button--small" type="button" data-close>CLOSE</button></div>
    </div>`);

  dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelectorAll("[data-fi-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const system = String(button.dataset.fiOpen || "");
      closeDialog(dialog);
      openForcedInductionSystem(ctx, carId, system);
    });
  });
}

function fiSystemCard(system, title, subtitle, state, stage) {
  let status = "NOT INSTALLED";
  let detail = "";
  if (system === "nitrous") {
    status = state.nitrousShot ? `${state.nitrousShot} SHOT INSTALLED` : "NO NOS";
    detail = stage === 2 ? "50 shot available" : stage === 3 ? "Up to 150 shot" : "Up to 300 shot";
  } else {
    status = fiSystemStatus(state, system);
    detail = stage >= 4 && state.primarySystem && state.primarySystem !== system && !state.secondarySystem
      ? "Swap kit or add as twin-charge system"
      : state.systems.includes(system)
        ? "Open upgrades and individual parts"
        : "Open kit options";
  }

  return `
    <button class="forced-induction-card ${state.systems.includes(system) || (system === "nitrous" && state.nitrousShot) ? "is-active" : ""}" type="button" data-fi-open="${escapeHtml(system)}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(status)}</strong>
      <small>${escapeHtml(subtitle)} • ${escapeHtml(detail)}</small>
      <em>CLICK TO OPEN →</em>
    </button>`;
}

function openForcedInductionSystem(ctx, carId, system) {
  const player = ctx.store.player;
  const car = player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const stage = Number(car.buildStage || 1);
  const state = forcedInductionState(car, player?.inventory?.parts || [], catalogCache);
  const allSpecs = categorySpecs(car, "forced_induction")
    .filter((part) => String(forcedInductionMeta(part)?.system || "") === String(system))
    .filter((part) => forcedInductionPartVisible(part, state, stage));
  const specs = forcedInductionDisplayParts(allSpecs, state);
  const previewPart = specs.find((part) => !findInventory(player, part.catalogId, car.carId)?.installedOnCarId) || specs[0] || null;
  const previewStats = previewPart ? projectStats(player, car, previewPart) : car.derived;

  const factoryRow = system !== "nitrous" && state.factorySystem === system && state.primarySource === "factory"
    ? `<article class="parts-shop-row is-complete">
        <div class="parts-shop-row__title"><span>FACTORY BASELINE</span><strong>Factory ${escapeHtml(systemLabel(system))} System</strong><small>Installed from the factory${car.engine?.peakBoostPsi != null ? ` • ${escapeHtml(car.engine.peakBoostPsi)} PSI peak boost` : ""}.</small></div>
        <div class="parts-shop-row__delta"><span>BASE <b>${number(car.stageBaseline?.hp || car.base?.hp)} hp</b></span><span>UPGRADE <b>${state.factoryUpgradeStep}/3</b></span></div>
        <div class="parts-shop-row__action"><span class="status-text status-text--good">INSTALLED</span></div>
      </article>`
    : "";

  const title = system === "nitrous" ? "NOS Kit" : `${systemLabel(system)} Kit`;
  const dialog = showDialog(`
    <div class="dialog-body parts-shop-dialog forced-induction-parts-dialog">
      <div class="parts-shop-dialog__titlebar">
        <div>
          <span class="section-label">${escapeHtml(buildName(stage))} • FORCED INDUCTION</span>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(carLabel(car))}</p>
        </div>
        <div class="parts-shop-dialog__stats">
          <span><small>HP</small><b>${number(car.derived?.hp)}</b></span>
          <span><small>TQ</small><b>${number(car.derived?.torque)}</b></span>
          <span><small>WT</small><b>${number(car.derived?.weight)} lb</b></span>
        </div>
      </div>

      <div class="parts-shop-list">
        ${factoryRow}
        ${specs.length ? specs.map((part) => forcedInductionPartRow(player, car, part)).join("") : `<div class="empty-state"><strong>No ${escapeHtml(title)} upgrades available for this setup yet.</strong><span>Change build type or install the base kit first.</span></div>`}
      </div>

      <div class="parts-shop-dialog__note">${stage >= 4 ? "Full Race Cars may twin charge. Primary-kit rows swap systems; Twin-Charge rows add the opposite system." : "Changing from Turbo to Supercharger (or vice versa) swaps the primary kit. Old parts stay owned but are uninstalled."}</div>
      <div class="dialog-actions"><button class="button button--small" type="button" data-back>BACK</button><button class="button button--small" type="button" data-close>CLOSE</button></div>
    </div>`);

  dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-back]")?.addEventListener("click", () => {
    closeDialog(dialog);
    openForcedInduction(ctx, carId);
  });

  dialog.querySelectorAll("[data-buy-part],[data-buy-install-part]").forEach((button) => {
    button.addEventListener("click", async () => {
      const installNow = Boolean(button.dataset.buyInstallPart);
      const catalogId = button.dataset.buyInstallPart || button.dataset.buyPart;
      await purchasePart(ctx, dialog, car, catalogId, installNow, button);
    });
  });

  dialog.querySelectorAll("[data-install-shop-part]").forEach((button) => {
    button.addEventListener("click", async () => {
      const inventoryId = String(button.dataset.installShopPart || "");
      const item = player?.inventory?.parts?.find((row) => String(row.inventoryId) === inventoryId);
      const spec = catalogCache.find((row) => String(row.catalogId) === String(item?.catalogId || ""));
      if (spec && forcedInductionSwapNeeded(car, player?.inventory?.parts || [], spec, catalogCache)) {
        const fiState = forcedInductionState(car, player?.inventory?.parts || [], catalogCache);
        const confirmed = globalThis.confirm?.(`Swap ${systemLabel(fiState.primarySystem)} to ${systemLabel(forcedInductionMeta(spec)?.system)}? Existing parts for the old system will be uninstalled but remain owned.`) ?? true;
        if (!confirmed) return;
      }
      button.disabled = true;
      try {
        const data = await ctx.storage.installPart(inventoryId, car.carId);
        ctx.store.setPlayer(data.player);
        closeDialog(dialog);
        ctx.toast("Forced induction updated", "The car's setup and Performance Index were recalculated.");
        await renderParts(ctx);
      } catch (err) {
        ctx.toast("Install blocked", err.message);
        button.disabled = false;
      }
    });
  });
}

function forcedInductionPartVisible(part, state, stage) {
  const meta = forcedInductionMeta(part);
  if (!meta) return false;
  const role = String(meta.role || "");
  const system = String(meta.system || "");

  if (role === "factory_upgrade") return state.factorySystem === system && state.primarySource === "factory";
  if (role === "kit") return !state.systems.includes(system);
  if (role === "kit_upgrade") return state.primarySource === "aftermarket" && state.primarySystem === system;
  if (role === "component") return stage >= 3 && state.systems.includes(system);
  if (role === "twin_kit") return stage >= 4 && !state.secondarySystem && state.primarySystem === String(meta.requiresSystem || "");
  if (role === "nitrous") return true;
  return false;
}

function forcedInductionPartRow(player, car, part) {
  const owned = findInventory(player, part.catalogId, car.carId);
  const installed = owned && String(owned.installedOnCarId || "") === String(car.carId);
  const purchaseCompatibility = forcedInductionCompatibility(car, player?.inventory?.parts || [], part, catalogCache, { purchasing: true });
  const installCompatibility = forcedInductionCompatibility(car, player?.inventory?.parts || [], part, catalogCache, { purchasing: false });
  const projected = projectStats(player, car, part);
  const canAfford = Number(player.wallet?.credits || 0) >= Number(part.price || 0);
  const meta = forcedInductionMeta(part) || {};

  let action;
  if (installed) {
    action = '<span class="status-text status-text--good">INSTALLED</span>';
  } else if (owned) {
    action = installCompatibility.ok
      ? `<button class="button button--primary button--small" data-install-shop-part="${escapeHtml(owned.inventoryId)}">INSTALL</button>`
      : `<span class="status-text">${escapeHtml(installCompatibility.reason || "LOCKED")}</span>`;
  } else if (purchaseCompatibility.ok) {
    action = `<div class="parts-shop-row__buy-actions"><button class="button button--primary button--small" data-buy-install-part="${escapeHtml(part.catalogId)}" ${canAfford ? "" : "disabled"}>BUY + INSTALL • ${money(part.price)} CR</button><button class="button button--small" data-buy-part="${escapeHtml(part.catalogId)}" ${canAfford ? "" : "disabled"}>BUY ONLY</button></div>`;
  } else {
    action = `<span class="status-text">${escapeHtml(purchaseCompatibility.reason || "LOCKED")}</span>`;
  }

  const kicker = meta.role === "nitrous"
    ? `${number(meta.shot)} SHOT`
    : meta.role === "twin_kit"
      ? "TWIN CHARGE"
      : meta.role === "component"
        ? "STAGE 3+ COMPONENT"
        : meta.step ? `UPGRADE ${number(meta.step)}` : "BASE KIT";

  return `<article class="parts-shop-row ${installed ? "is-complete" : ""}">
    <div class="parts-shop-row__title"><span>${escapeHtml(kicker)}</span><strong>${escapeHtml(part.name)}</strong><small>${escapeHtml(part.description || "")}</small></div>
    <div class="parts-shop-row__delta">
      <span>HP <b>${number(car.derived?.hp)} → ${number(projected.hp)}</b></span>
      <span>TQ <b>${number(car.derived?.torque)} → ${number(projected.torque)}</b></span>
      <span>WT <b>${number(car.derived?.weight)} → ${number(projected.weight)}</b></span>
    </div>
    <div class="parts-shop-row__action">${action}</div>
  </article>`;
}

function stageProgressionMarkup(player, car) {
  const stage = Number(car.buildStage || 1);
  if (stage >= 4) return "";

  if (stage === 1) {
    if (!streetCarReady(player, car)) return "";
    return `<div class="stage-ready stage-ready--reactive">
      <div><span class="section-label">STREET CAR COMPLETE</span><strong>Ready to turn this into a Street Race Car?</strong><p>Every Street Car category is maxed. Conversion is permanent and unlocks named race parts plus Forced Induction.</p></div>
      <button class="button button--primary" data-stage-up>UPGRADE TO STREET RACE CAR</button>
    </div>`;
  }

  if (stage === 2) {
    const required = [...new Set(catalogCache
      .filter((part) => !part.simpleTier && Number(part.buildStage || 2) === 2 && part.requiredForStageProgression !== false)
      .map((part) => String(part.categoryKey || ""))
      .filter(Boolean))];
    const installed = new Set();
    for (const item of player?.inventory?.parts || []) {
      if (String(item.installedOnCarId || "") !== String(car.carId)) continue;
      const spec = catalogCache.find((part) => part.catalogId === item.catalogId);
      if (spec?.categoryKey) installed.add(String(spec.categoryKey));
    }
    const missing = required.filter((key) => !installed.has(key));
    if (missing.length) {
      return `<div class="stage-ready stage-ready--pending">
        <div><span class="section-label">BUILD TYPE PROGRESSION</span><strong>Front-Half Race Car is not ready yet.</strong><p>Install one Street Race Car choice in every core category. Missing: ${escapeHtml(missing.join(", "))}. Forced Induction remains optional.</p></div>
      </div>`;
    }
    return `<div class="stage-ready stage-ready--reactive">
      <div><span class="section-label">STREET RACE CAR COMPLETE</span><strong>Ready for a Front-Half Race Car?</strong><p>Your current parts stay installed. Stage 3 unlocks individual turbo/supercharger hardware, larger NOS foggers and engine-swap access.</p></div>
      <button class="button button--primary" data-stage-up>UPGRADE TO FRONT-HALF RACE CAR</button>
    </div>`;
  }

  return `<div class="stage-ready stage-ready--reactive">
    <div><span class="section-label">FRONT-HALF BUILD</span><strong>Ready for a Full Race Car?</strong><p>Stage 4 opens twin charging, extreme NOS foggers and the widest engine-swap freedom. Stage 3 has no mandatory completion gate yet while its catalog is being built.</p></div>
    <button class="button button--primary" data-stage-up>UPGRADE TO FULL RACE CAR</button>
  </div>`;
}

function promptStageConversion(ctx, carId) {
  const car = ctx.store.player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const stage = Number(car.buildStage || 1);
  const nextStage = Math.min(4, stage + 1);
  const nextName = buildName(nextStage);
  const copy = stage === 1
    ? "Your completed Street Car setup becomes the permanent baseline. The numbered Street Car upgrade ladder is incorporated into the car and cannot be restored."
    : stage === 2
      ? "Your current Street Race Car parts remain installed. Front-Half Race Car unlocks Stage 3 forced-induction hardware and engine-swap access."
      : "Your current build remains intact. Full Race Car unlocks twin charging, the highest NOS foggers and the widest powertrain freedom.";

  const dialog = showDialog(`<div class="dialog-body stage-conversion-dialog">
    <div class="dialog-vehicle">${renderVehicle(car, { stage: nextStage, view: "sideProfile" })}</div>
    <span class="section-label">${escapeHtml(buildName(stage).toUpperCase())}</span>
    <h2>Upgrade to ${escapeHtml(nextName)}?</h2>
    <p>${escapeHtml(copy)}</p>
    <div class="dialog-actions"><button class="button button--small" data-cancel>NOT YET</button><button class="button button--primary" data-confirm>UPGRADE TO ${escapeHtml(nextName.toUpperCase())}</button></div>
    <div class="form-error" data-error></div>
  </div>`);
  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.stageUp(carId);
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast(`${nextName} unlocked`, nextStage === 4 ? "Twin charging and Full Race forced-induction options are now available." : "The next build-type parts are now available.");
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
      <div class="ftue-focus-panel__step">STEP 4/5</div>
      <div class="ftue-focus-panel__copy"><span>FIRST MOD</span><strong>Click INTAKE.</strong><p>Everything else is locked. Buy + Install the Stage 1 Intake, then go straight to your first 1/4-mile race.</p></div>
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

  const swapState = forcedInductionSwapNeeded(car, player?.inventory?.parts || [], candidate, catalogCache)
    ? forcedInductionState(car, player?.inventory?.parts || [], catalogCache)
    : null;

  for (const item of player?.inventory?.parts || []) {
    if (String(item.installedOnCarId || "") !== String(car.carId)) continue;
    const spec = catalogCache.find((part) => part.catalogId === item.catalogId);
    if (!spec || String(spec.slot) === String(candidate.slot)) continue;
    if (swapState) {
      const meta = forcedInductionMeta(spec);
      if (meta && String(meta.role || "") !== "nitrous" && String(meta.system || "") === String(swapState.primarySystem || "")) continue;
    }
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
