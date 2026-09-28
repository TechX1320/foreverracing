import { bindHome, carLabel, escapeHtml, number, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";

let partsCache = null;
const REQUIRED = ["intake", "exhaust", "ecu", "fuel", "drivetrain", "tires", "weight"];
const BUILD_NAMES = {
  1: "Street Car",
  2: "Street Race Car",
  3: "Front-Half Race Car",
  4: "Full Race Car",
};

export async function renderGarage(ctx) {
  const player = ctx.store.player;
  if (!partsCache) {
    const data = await ctx.storage.partsCatalog();
    partsCache = data.parts || [];
  }
  const garage = Array.isArray(player?.garage) ? player.garage : [];
  const tutorialStep = player?.tutorial?.status === "active" ? player.tutorial.step : null;

  const body = garage.length === 0
    ? `<div class="empty-state"><strong>Your garage is empty.</strong><span>Buy a car before there is anything to manage here.</span><div class="cluster" style="justify-content:center;margin-top:12px"><button class="button button--primary button--small" data-go-showroom>SHOWROOM</button></div></div>`
    : `
      ${tutorialStep === "visit_garage" ? garageTutorial() : ""}
      ${tutorialStep === "install_first_upgrade" ? installTutorial() : ""}
      <div class="garage-list">${garage.map((car) => carRow(player, car, partsCache, tutorialStep)).join("")}</div>`;

  ctx.screenRoot.innerHTML = pageShell({
    title: "Garage",
    eyebrow: "YOUR CARS",
    hint: `${garage.length} OWNED`,
    trail: "Select • inventory • setup",
    body
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-go-showroom]")?.addEventListener("click", () => ctx.router.navigate("showroom"));
  ctx.screenRoot.querySelector("[data-ftue-garage]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.tutorialAdvance("garage_explained");
      ctx.store.setPlayer(data.player);
      ctx.router.navigate("parts");
    } catch (err) {
      ctx.toast("Tutorial error", err.message);
      event.currentTarget.disabled = false;
    }
  });

  ctx.screenRoot.querySelectorAll("[data-select-car]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.selectCar(button.dataset.selectCar);
        ctx.store.setPlayer(data.player);
        await renderGarage(ctx);
      } catch (err) {
        ctx.toast("Could not select car", err.message);
        button.disabled = false;
      }
    });
  });

  ctx.screenRoot.querySelectorAll("[data-rename-car]").forEach((button) => {
    button.addEventListener("click", () => renameCar(ctx, button.dataset.renameCar));
  });
  ctx.screenRoot.querySelectorAll("[data-inventory-car]").forEach((button) => {
    button.addEventListener("click", () => openInventory(ctx, button.dataset.inventoryCar));
  });
  ctx.screenRoot.querySelectorAll("[data-stage-up]").forEach((button) => {
    button.addEventListener("click", () => stageUp(ctx, button.dataset.stageUp));
  });

  const requestedInventory = sessionStorage.getItem("foreverRacing.openInventory");
  if (requestedInventory && garage.some((car) => String(car.carId) === String(requestedInventory))) {
    sessionStorage.removeItem("foreverRacing.openInventory");
    queueMicrotask(() => openInventory(ctx, requestedInventory));
  }
}

function carRow(player, car, catalog, tutorialStep) {
  const selected = String(player?.selectedCarId || "") === String(car.carId);
  const stage = Number(car.buildStage || 1);
  const progress = stage === 1 ? streetCarProgress(player, car, catalog) : null;
  const inventoryCount = inventoryForCar(player, car).length;
  const inventoryHighlight = tutorialStep === "install_first_upgrade";

  return `
    <article class="garage-entry ${selected ? "is-current" : ""}">
      <div class="garage-entry__visual">${renderVehicle(car, { stage, view: "sideProfile" })}</div>
      <div class="garage-entry__main">
        <div class="garage-entry__title">
          <div>
            <span class="stage-name-tag">${escapeHtml(buildName(stage))}</span>
            <strong>${escapeHtml(carLabel(car))}</strong>
            <small>${escapeHtml(car.displayName)} • ${escapeHtml(car.base?.drivetrain || "")}</small>
          </div>
          ${selected ? '<span class="current-tag">CURRENT</span>' : ""}
        </div>
        <div class="stat-line">
          <span><b>${number(car.derived?.hp)}</b> HP</span>
          <span><b>${number(car.derived?.torque)}</b> LB-FT</span>
          <span><b>${number(car.derived?.weight)}</b> LB</span>
          <span><b>${number(car.mileage)}</b> MI</span>
        </div>
        ${progress
          ? `<div class="stage-progress"><div class="stage-progress__label"><span>Street Car completion</span><b>${progress.maxed}/${progress.total} categories maxed</b></div><div class="meter"><i style="width:${(progress.maxed / progress.total) * 100}%"></i></div></div>`
          : `<div class="stage-progress"><div class="stage-progress__label"><span>Build type</span><b>${escapeHtml(buildName(stage))}</b></div></div>`}
        <div class="garage-entry__actions">
          <button class="button button--small" data-select-car="${escapeHtml(car.carId)}" ${selected ? "disabled" : ""}>${selected ? "CURRENT" : "MAKE CURRENT"}</button>
          <button class="button button--small" data-rename-car="${escapeHtml(car.carId)}">RENAME</button>
          <button class="button button--small ${inventoryHighlight ? "button--primary tutorial-target" : ""}" data-inventory-car="${escapeHtml(car.carId)}">INVENTORY • ${inventoryCount}</button>
          ${progress?.ready ? `<button class="button button--primary button--small" data-stage-up="${escapeHtml(car.carId)}">UPGRADE TO STREET RACE CAR</button>` : ""}
        </div>
      </div>
    </article>`;
}

function garageTutorial() {
  return `<div class="objective-box objective-box--active">
    <div><span class="objective-kicker">FTUE • READ YOUR CAR</span><strong>Know what you are building</strong></div>
    <p>Power, torque and weight are the basic performance picture. <b>Build Type</b> describes how radical the car has become. Your first build begins as a Street Car.</p>
    <button class="button button--primary button--small" data-ftue-garage>GOT IT — SHOW ME PARTS</button>
  </div>`;
}

function installTutorial() {
  return `<div class="objective-box objective-box--active">
    <div><span class="objective-kicker">FTUE • INSTALL YOUR PART</span><strong>Open the car's Inventory</strong></div>
    <p>The shop only sells parts. Your Garage Inventory is where you install, remove and swap the parts you own for this car.</p>
  </div>`;
}

function openInventory(ctx, carId) {
  const player = ctx.store.player;
  const car = player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;

  const items = inventoryForCar(player, car)
    .map((item) => ({ item, spec: partsCache.find((part) => part.catalogId === item.catalogId) }))
    .filter((row) => row.spec)
    .sort((a, b) => String(a.spec.category).localeCompare(String(b.spec.category)) || Number(a.spec.simpleTier || 0) - Number(b.spec.simpleTier || 0));

  const dialog = showDialog(`
    <div class="dialog-body garage-inventory-dialog">
      <div class="garage-inventory-dialog__head">
        <div class="dialog-vehicle">${renderVehicle(car, { stage: Number(car.buildStage || 1), view: "sideProfile" })}</div>
        <div><span class="section-label">${escapeHtml(buildName(Number(car.buildStage || 1)))} INVENTORY</span><h2>${escapeHtml(carLabel(car))}</h2><p>Install and swap parts here. Street Car ladder upgrades cannot be downgraded after installation.</p></div>
      </div>
      <div class="garage-inventory-list">
        ${items.length ? items.map(({ item, spec }) => inventoryRow(player, car, item, spec)).join("") : '<div class="empty-state"><strong>No parts owned for this car.</strong><span>Open Parts to buy upgrades. They will appear here.</span></div>'}
      </div>
      <div class="dialog-actions"><button class="button button--small" type="button" data-close>CLOSE</button><button class="button button--primary button--small" type="button" data-shop>OPEN PARTS</button></div>
    </div>`);

  dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-shop]")?.addEventListener("click", () => {
    closeDialog(dialog);
    ctx.router.navigate("parts");
  });

  dialog.querySelectorAll("[data-install-owned]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.installPart(button.dataset.installOwned, carId);
        ctx.store.setPlayer(data.player);
        closeDialog(dialog);
        ctx.toast("Part installed", "The car's setup and stats were recalculated.");
        await renderGarage(ctx);
        const updated = data.player?.garage?.find((entry) => String(entry.carId) === String(carId));
        if (updated && streetCarProgress(data.player, updated, partsCache)?.ready) {
          setTimeout(() => stageUp(ctx, carId), 80);
        }
      } catch (err) {
        ctx.toast("Install blocked", err.message);
        button.disabled = false;
      }
    });
  });

  dialog.querySelectorAll("[data-uninstall-owned]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.uninstallPart(button.dataset.uninstallOwned);
        ctx.store.setPlayer(data.player);
        closeDialog(dialog);
        ctx.toast("Part removed", "The car's setup and stats were recalculated.");
        await renderGarage(ctx);
        setTimeout(() => openInventory(ctx, carId), 50);
      } catch (err) {
        ctx.toast("Cannot remove part", err.message);
        button.disabled = false;
      }
    });
  });
}

function inventoryRow(player, car, item, spec) {
  const installed = String(item.installedOnCarId || "") === String(car.carId);
  const stage = Number(car.buildStage || 1);
  const simpleTier = Number(spec.simpleTier || 0);
  const currentTier = simpleTier ? installedSimpleTier(player, car.carId, spec.categoryKey) : 0;
  const completedOldStep = stage === 1 && simpleTier > 0 && simpleTier < currentTier && !installed;

  let action;
  if (installed && stage === 1 && simpleTier) {
    action = '<span class="status-text status-text--good">INSTALLED • LOCKED</span>';
  } else if (installed) {
    action = `<button class="button button--small" data-uninstall-owned="${escapeHtml(item.inventoryId)}">REMOVE</button>`;
  } else if (completedOldStep) {
    action = '<span class="status-text">COMPLETED STEP</span>';
  } else {
    action = `<button class="button button--primary button--small" data-install-owned="${escapeHtml(item.inventoryId)}">INSTALL</button>`;
  }

  return `<article class="garage-inventory-row ${installed ? "is-installed" : ""}">
    <div><span class="garage-inventory-row__category">${escapeHtml(spec.category || spec.categoryKey)}</span><strong>${escapeHtml(spec.name)}</strong><small>${escapeHtml(spec.description || "")}</small></div>
    <div class="garage-inventory-row__effects">${effectsSummary(spec.effects || [])}</div>
    <div class="garage-inventory-row__action">${action}</div>
  </article>`;
}

function effectsSummary(effects) {
  if (!effects.length) return '<span>No stat change</span>';
  return effects.map((effect) => {
    const stat = String(effect.stat || "").toUpperCase();
    const value = Number(effect.value || 0);
    if (effect.op === "mul") return `<span>${stat} ×${value.toFixed(3)}</span>`;
    return `<span>${stat} ${value >= 0 ? "+" : ""}${value}${effect.stat === "weight" ? " lb" : ""}</span>`;
  }).join("");
}

function streetCarProgress(player, car, catalog) {
  if (Number(car.buildStage || 1) !== 1) return null;
  let maxed = 0;
  for (const key of REQUIRED) {
    if (installedSimpleTier(player, car.carId, key, catalog) >= 3) maxed += 1;
  }
  return { maxed, total: REQUIRED.length, ready: maxed === REQUIRED.length };
}

function installedSimpleTier(player, carId, key, catalog = partsCache) {
  let tier = 0;
  for (const item of player?.inventory?.parts || []) {
    if (String(item.installedOnCarId || "") !== String(carId)) continue;
    const spec = catalog.find((part) => part.catalogId === item.catalogId);
    if (spec?.categoryKey === key) tier = Math.max(tier, Number(spec.simpleTier || 0));
  }
  return tier;
}

function inventoryForCar(player, car) {
  const carId = car?.carId;
  const stage = Number(car?.buildStage || 1);
  return (player?.inventory?.parts || []).filter((item) => {
    const belongs = String(item.purchasedForCarId || "") === String(carId)
      || String(item.installedOnCarId || "") === String(carId);
    if (!belongs) return false;
    const spec = partsCache.find((part) => part.catalogId === item.catalogId);
    if (stage >= 2 && Number(spec?.simpleTier || 0) > 0) return false;
    return true;
  });
}

function stageUp(ctx, carId) {
  const car = ctx.store.player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const dialog = showDialog(`<div class="dialog-body stage-conversion-dialog">
    <div class="dialog-vehicle">${renderVehicle(car, { stage: 2, view: "sideProfile" })}</div>
    <span class="section-label">STREET CAR COMPLETE</span>
    <h2>Upgrade to a Street Race Car?</h2>
    <p>Your completed Street Car setup becomes the permanent baseline. The body remains recognizable, but the car can now be gutted, caged and built with named race-oriented parts. This conversion cannot be reversed.</p>
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
      ctx.toast("Street Race Car unlocked", "The numbered Street Car ladder is now incorporated into the build.");
      await renderGarage(ctx);
    } catch (err) {
      dialog.querySelector("[data-error]").textContent = err.message;
      event.currentTarget.disabled = false;
    }
  });
}

function renameCar(ctx, carId) {
  const car = ctx.store.player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const dialog = showDialog(`
    <form class="dialog-body" data-rename-form>
      <h2>Rename car</h2>
      <p>Garage nickname only. The factory identity remains visible underneath.</p>
      <div class="field"><label for="carNickname">Nickname</label><input id="carNickname" name="name" maxlength="32" value="${escapeHtml(car.nickname || car.displayName)}" autocomplete="off"></div>
      <div class="form-error" data-rename-error></div>
      <div class="dialog-actions"><button class="button button--small" type="button" data-cancel>Cancel</button><button class="button button--primary button--small" type="submit">SAVE</button></div>
    </form>`);
  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-rename-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    submit.disabled = true;
    try {
      const data = await ctx.storage.renameCar(carId, String(new FormData(event.currentTarget).get("name") || ""));
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      await renderGarage(ctx);
    } catch (err) {
      dialog.querySelector("[data-rename-error]").textContent = err.message;
      submit.disabled = false;
    }
  });
}

function buildName(stage) {
  return BUILD_NAMES[Number(stage)] || "Race Car";
}
