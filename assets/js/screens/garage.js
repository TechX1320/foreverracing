import { bindHome, carLabel, escapeHtml, number, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";
import { renderPartDynoChart } from "../ui/partDyno.js";
import { forcedInductionMeta, forcedInductionState, forcedInductionSwapNeeded, systemLabel } from "../domain/ForcedInduction.js";
import {
  baseMapProfile,
  defaultTuneProfile,
  evaluateTune,
  normalizeTuneProfile,
  tuningHardwareProfile,
} from "../domain/Tuning.js";

let partsCache = null;
const REQUIRED = ["intake", "exhaust", "ecu", "fuel", "drivetrain", "suspension", "tires", "weight"];
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
    ? `<div class="empty-state"><strong>Your garage is empty.</strong><span>Find an older car in Classifieds before there is anything to manage here.</span><div class="cluster" style="justify-content:center;margin-top:12px"><button class="button button--primary" data-go-classifieds>OPEN CLASSIFIEDS</button></div></div>`
    : `
      ${tutorialStep === "install_first_upgrade" ? installTutorial() : ""}
      <div class="garage-list">${garage.map((car) => carRow(player, car, partsCache, tutorialStep)).join("")}</div>
      ${tutorialStep === "visit_garage" ? garageTutorial() : ""}`;

  ctx.screenRoot.innerHTML = pageShell({
    title: "Garage",
    eyebrow: "YOUR CARS",
    hint: `${garage.length} OWNED`,
    trail: "Select • inventory • setup",
    body
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-go-classifieds]")?.addEventListener("click", () => ctx.router.navigate("usedlot"));
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
  ctx.screenRoot.querySelectorAll("[data-tune-car]").forEach((button) => {
    button.addEventListener("click", () => openTuning(ctx, button.dataset.tuneCar));
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
  const tuneUnlocked = tuningUnlockedForCar(player, car);

  return `
    <article class="garage-entry ${selected ? "is-current" : ""}">
      <div class="garage-entry__visual">${renderVehicle(car, { stage, view: "sideProfile" })}</div>
      <div class="garage-entry__main">
        <div class="garage-entry__title">
          <div>
            <span class="stage-name-tag">${escapeHtml(buildName(stage))}</span>
            <span class="performance-class-tag">${escapeHtml(car.performanceClass || car.stockClass || "—")}</span>
            <strong>${escapeHtml(carLabel(car))}</strong>
            <small>${escapeHtml(car.displayName)} • ${escapeHtml(car.base?.drivetrain || "")}</small>
          </div>
          ${selected ? '<span class="current-tag">CURRENT</span>' : ""}
        </div>
        <div class="stat-line">
          <span><b>${number(car.derived?.hp)}</b> HP</span>
          <span><b>${number(car.derived?.torque)}</b> LB-FT</span>
          <span><b>${escapeHtml(car.performanceClass || car.stockClass || "—")}</b> CLASS</span>
          <span><b>PI ${number(car.performanceIndex || car.benchmark?.performanceIndex || 0)}</b> PERFORMANCE</span>
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
          ${tuneUnlocked ? `<button class="button button--small tuning-button ${car.tune ? "tuning-button--saved" : ""}" data-tune-car="${escapeHtml(car.carId)}">TUNING${car.tune ? " • SAVED" : ""}</button>` : ""}
          ${progress?.ready ? `<button class="button button--primary button--small" data-stage-up="${escapeHtml(car.carId)}">UPGRADE TO STREET RACE CAR</button>` : ""}
        </div>
      </div>
    </article>`;
}

function tuningUnlockedForCar(player, car) {
  return installedSpecsForCar(player, car).some((spec) => spec?.tuning?.homeGarage === true || spec?.tuning?.mode === "standalone");
}

function installedSpecsForCar(player, car) {
  const carId = String(car?.carId || "");
  return (player?.inventory?.parts || [])
    .filter((item) => String(item.installedOnCarId || "") === carId)
    .map((item) => partsCache?.find((part) => String(part.catalogId) === String(item.catalogId)))
    .filter(Boolean);
}

function openTuning(ctx, carId) {
  const player = ctx.store.player;
  const car = player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const installedSpecs = installedSpecsForCar(player, car);
  const hardware = tuningHardwareProfile(car, installedSpecs);
  if (!hardware.unlocked) {
    ctx.toast("Tuning locked", "Install the Standalone ECU + Laptop on this car first.");
    return;
  }

  const untuned = car.untunedDerived || car.derived || car.base;
  let draft = normalizeTuneProfile(car.tune || defaultTuneProfile(car, hardware), car, hardware);
  const dialog = showDialog('<div class="dialog-body tuning-dialog"></div>');

  const render = () => {
    const evaluation = evaluateTune(car, { ...untuned, drivetrain: car.base?.drivetrain }, draft, hardware);
    draft = evaluation.profile;
    const diag = evaluation.diagnostics;
    const projected = evaluation.derived;
    const gearPsi = draft.boostByGear.map((percent) => hardware.boosted ? (draft.boostPsi * (percent / 100)).toFixed(1) : "—");

    dialog.innerHTML = `
      <div class="dialog-body tuning-dialog">
        <div class="tuning-dialog__titlebar">
          <div>
            <span class="section-label">HOME GARAGE • STANDALONE ECU + LAPTOP</span>
            <h2>${escapeHtml(carLabel(car))} Tuning</h2>
            <p>Every owned car has slightly different calibration tolerances. A shared tune can be a starting point, not a universal perfect answer.</p>
          </div>
          <div class="tuning-laptop-badge"><span>ECU LINK</span><b>ONLINE</b><small>${hardware.boosted ? `${escapeHtml(hardware.systems.join(" + ").toUpperCase())} • ${hardware.baseBoostPsi} PSI hardware baseline` : "N/A ENGINE • NO BOOST HARDWARE"}</small></div>
        </div>

        <div class="tuning-workspace">
          <div class="tuning-controls">
            <section class="tuning-panel">
              <header><span>POWER / ECU</span><b>Calibration</b></header>
              ${hardware.boosted ? tuneSlider("BOOST TARGET", "boostPsi", draft.boostPsi, hardware.minBoostPsi, hardware.maxBoostPsi, 0.5, "PSI", `Hardware comfort ≈ ${hardware.safeBoostPsi} PSI • hard limit ${hardware.maxBoostPsi} PSI`) : '<div class="tuning-locked-row"><b>BOOST TARGET</b><span>No turbo/supercharger hardware installed.</span></div>'}
              ${tuneSlider("FUEL TRIM", "fuelTrimPct", draft.fuelTrimPct, -10, 18, 0.5, "%", "More fuel can support more boost; too rich also costs power.")}
              ${tuneSlider("IGNITION ADVANCE", "ignitionAdvanceDeg", draft.ignitionAdvanceDeg, -5, 7, 0.5, "°", "More timing can make power until this engine starts pulling it back.")}
              ${tuneSlider("SHIFT RPM", "shiftRpm", draft.shiftRpm, 3000, Math.max(Number(car.engine?.revCutRpm || 8000), 4000), 100, "RPM", "The fastest shift point is near the useful top of this engine's current powerband.")}
            </section>

            <section class="tuning-panel">
              <header><span>BOOST BY GEAR</span><b>Traction Strategy</b></header>
              <p class="tuning-panel__intro">Pull boost from early gears to calm wheelspin, then bring power back as speed rises. Less boost is not automatically faster.</p>
              <div class="boost-gear-grid">
                ${draft.boostByGear.map((percent, index) => `
                  <label class="boost-gear">
                    <span>GEAR ${index + 1}</span>
                    <b data-gear-output="${index}">${percent}%${hardware.boosted ? ` • ${gearPsi[index]} PSI` : ""}</b>
                    <input type="range" min="45" max="100" step="5" value="${percent}" data-tune-gear="${index}" ${hardware.boosted ? "" : "disabled"}>
                  </label>`).join("")}
              </div>
            </section>

            <section class="tuning-panel">
              <header><span>LAUNCH / CHASSIS</span><b>Saved with Calibration</b></header>
              ${tuneSlider("LAUNCH RPM", "launchRpm", draft.launchRpm, 1800, Math.max(2200, Number(car.engine?.redlineRpm || 7000)), 100, "RPM", "Too low bogs; too high asks more of the tire.")}
              ${tuneSlider("FRONT TIRE PSI", "tirePsiFront", draft.tirePsiFront, 12, 42, 0.5, "PSI", "Front/rear pressure targets depend on drivetrain, weight and this chassis.")}
              ${tuneSlider("REAR TIRE PSI", "tirePsiRear", draft.tirePsiRear, 12, 42, 0.5, "PSI", "Lower is not infinitely better: too little pressure adds rolling loss.")}
            </section>
          </div>

          <aside class="tuning-monitor">
            <div class="tuning-monitor__head"><span>LIVE CALIBRATION MODEL</span><b>${escapeHtml(evaluation.race.tuneLabel)}</b></div>
            <div class="tuning-monitor__stats">
              <div><small>PEAK HP</small><strong>${number(car.untunedDerived?.hp || untuned.hp)} → ${number(projected.hp)}</strong></div>
              <div><small>PEAK TQ</small><strong>${number(car.untunedDerived?.torque || untuned.torque)} → ${number(projected.torque)}</strong></div>
              <div><small>GRIP</small><strong>${number(car.untunedDerived?.grip || untuned.grip,3)} → ${number(projected.grip,3)}</strong></div>
              <div><small>STABILITY</small><strong>${diag.stabilityPct}%</strong></div>
              <div><small>RISK</small><strong class="${diag.riskPct >= 65 ? "bad" : diag.riskPct >= 35 ? "warn" : "good"}">${diag.riskPct}%</strong></div>
              <div><small>1ST GEAR POWER</small><strong>${draft.boostByGear[0]}%</strong></div>
              <div><small>ENGINE ENVELOPE</small><strong>${number(hardware.powerEnvelope?.capacityHp || 0)} HP</strong></div>
              <div><small>RAW REQUEST</small><strong>${number(diag.powerLimit?.rawHp || projected.hp)} HP</strong></div>
              <div><small>ENGINE LOAD</small><strong>${number(diag.engineLoadPct || 0)}%</strong></div>
              <div><small>FAILURE / PASS</small><strong class="${diag.failureChancePct >= 5 ? "bad" : diag.failureChancePct > 0 ? "warn" : "good"}">${number(diag.failureChancePct || 0,2)}%</strong></div>
            </div>
            <div class="tuning-monitor__states">
              ${stateRow("ENGINE", diag.powerState)}
              ${stateRow("FUEL", diag.fuelState)}
              ${stateRow("TIMING", diag.timingState)}
              ${stateRow("TIRES", diag.tireState)}
              ${stateRow("LAUNCH", diag.launchState)}
              ${stateRow("SHIFT", diag.shiftState)}
            </div>
            <div class="tuning-monitor__dyno">
              ${renderPartDynoChart(car, { ...untuned, drivetrain: car.base?.drivetrain }, projected, "LIVE TUNE DYNO")}
            </div>
          </aside>
        </div>

        <div class="tuning-dialog__footer">
          <p>BASE MAP loads a deliberately conservative all-green starting calibration. It is safe, not optimal; race passes are still how you find the quickest setup.</p>
          <div class="dialog-actions">
            <button class="button button--small" type="button" data-tune-reset>BASE MAP</button>
            <button class="button button--small" type="button" data-close>CANCEL</button>
            <button class="button button--primary" type="button" data-tune-save>SAVE CALIBRATION</button>
          </div>
        </div>
      </div>`;

    bind();
  };

  const bind = () => {
    dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));
    dialog.querySelectorAll("[data-tune-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = String(input.dataset.tuneField || "");
        draft[key] = Number(input.value);
        const output = input.closest(".tuning-slider")?.querySelector("output");
        if (output) {
          const unit = key.toLowerCase().includes("rpm") ? "RPM" : key.toLowerCase().includes("psi") ? "PSI" : key === "fuelTrimPct" ? "%" : "°";
          output.textContent = `${input.value} ${unit}`;
        }
      });
      input.addEventListener("change", render);
    });
    dialog.querySelectorAll("[data-tune-gear]").forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.tuneGear || 0);
        draft.boostByGear[index] = Number(input.value);
        const output = dialog.querySelector(`[data-gear-output="${index}"]`);
        if (output) output.textContent = `${input.value}%${hardware.boosted ? ` • ${(draft.boostPsi * (Number(input.value) / 100)).toFixed(1)} PSI` : ""}`;
      });
      input.addEventListener("change", render);
    });
    dialog.querySelector("[data-tune-reset]")?.addEventListener("click", () => {
      draft = baseMapProfile(car, { ...untuned, drivetrain: car.base?.drivetrain }, hardware);
      render();
    });
    dialog.querySelector("[data-tune-save]")?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        const data = await ctx.storage.saveTune(car.carId, draft);
        ctx.store.setPlayer(data.player);
        closeDialog(dialog);
        ctx.toast("Calibration saved", "Boost, fueling, ignition, launch, shift and tire settings are now active for this car.");
        await renderGarage(ctx);
      } catch (err) {
        ctx.toast("Tune save failed", err.message);
        event.currentTarget.disabled = false;
      }
    });
  };

  render();
}

function tuneSlider(label, key, value, min, max, step, unit, hint) {
  return `<label class="tuning-slider">
    <div><span>${escapeHtml(label)}</span><output>${escapeHtml(value)} ${escapeHtml(unit)}</output></div>
    <input type="range" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(value)}" data-tune-field="${escapeHtml(key)}">
    <small>${escapeHtml(hint)}</small>
  </label>`;
}

function stateRow(label, value) {
  const text = String(value || "");
  const good = ["IN RANGE","DIALED IN","CLOSE","HEADROOM"].includes(text);
  const bad = ["LEAN","AGGRESSIVE","TOO HIGH","OFF TARGET","ENGINE-LIMITED"].includes(text);
  const warn = ["NEAR LIMIT","WORKABLE","CONSERVATIVE","BOGGING","SHIFTING EARLY","SHIFTING LATE"].includes(text);
  return `<div><span>${escapeHtml(label)}</span><b class="${good ? "good" : bad ? "bad" : warn ? "warn" : ""}">${escapeHtml(text)}</b></div>`;
}

function garageTutorial() {
  return `<section class="ftue-focus-panel ftue-focus-panel--garage">
    <div class="ftue-focus-panel__step">STEP 3/5</div>
    <div class="ftue-focus-panel__copy">
      <span>THIS IS YOUR CAR</span>
      <strong>Now make it faster.</strong>
      <p>Power, torque, weight and Build Type live on the car card above. You will manage owned parts from this Garage later.</p>
    </div>
    <button class="button button--primary ftue-primary-action" data-ftue-garage>CONTINUE TO PARTS →</button>
  </section>`;
}

function installTutorial() {
  return `<section class="ftue-focus-panel ftue-focus-panel--compact">
    <div class="ftue-focus-panel__step">RECOVERY STEP</div>
    <div class="ftue-focus-panel__copy"><span>PART PURCHASED</span><strong>Install the Intake.</strong><p>Your car's Inventory opens automatically. Install the highlighted part to continue.</p></div>
    <div class="ftue-focus-panel__arrow">↓ INSTALL</div>
  </section>`;
}

function openInventory(ctx, carId) {
  const player = ctx.store.player;
  const car = player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;

  const tutorialInstall = player?.tutorial?.status === "active" && player?.tutorial?.step === "install_first_upgrade";
  const items = inventoryForCar(player, car)
    .map((item) => ({ item, spec: partsCache.find((part) => part.catalogId === item.catalogId) }))
    .filter((row) => row.spec && (!tutorialInstall || String(row.spec.catalogId) === "s1_intake_1"))
    .sort((a, b) => String(a.spec.category).localeCompare(String(b.spec.category)) || Number(a.spec.simpleTier || 0) - Number(b.spec.simpleTier || 0));

  const dialog = showDialog(`
    <div class="dialog-body garage-inventory-dialog ${tutorialInstall ? "garage-inventory-dialog--ftue" : ""}">
      <div class="garage-inventory-dialog__titlebar">
        <div>
          <span class="section-label">${tutorialInstall ? "RECOVERY STEP • INSTALL THIS PART" : `${escapeHtml(buildName(Number(car.buildStage || 1)))} INVENTORY`}</span>
          <h2>${escapeHtml(carLabel(car))}</h2>
          <p>${tutorialInstall ? "One action: install your new Stage 1 Intake." : "Owned parts live here. Install, remove and swap them without returning to the shop."}</p>
        </div>
        <div class="garage-inventory-dialog__car">${renderVehicle(car, { stage: Number(car.buildStage || 1), view: "sideProfile" })}</div>
      </div>
      <div class="garage-inventory-list">
        ${items.length ? items.map(({ item, spec }) => inventoryRow(player, car, item, spec, tutorialInstall)).join("") : '<div class="empty-state"><strong>No parts owned for this car.</strong><span>Open Parts to buy upgrades. They will appear here.</span></div>'}
      </div>
      <div class="dialog-actions">
        ${tutorialInstall ? "" : '<button class="button" type="button" data-close>CLOSE</button><button class="button button--primary" type="button" data-shop>OPEN PARTS</button>'}
      </div>
    </div>`);

  dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-shop]")?.addEventListener("click", () => {
    closeDialog(dialog);
    ctx.router.navigate("parts");
  });

  dialog.querySelectorAll("[data-install-owned]").forEach((button) => {
    button.addEventListener("click", async () => {
      const inventoryId = String(button.dataset.installOwned || "");
      const item = player?.inventory?.parts?.find((row) => String(row.inventoryId) === inventoryId);
      const spec = partsCache.find((row) => String(row.catalogId) === String(item?.catalogId || ""));
      if (spec && forcedInductionSwapNeeded(car, player?.inventory?.parts || [], spec, partsCache)) {
        const state = forcedInductionState(car, player?.inventory?.parts || [], partsCache);
        const confirmed = globalThis.confirm?.(`Swap ${systemLabel(state.primarySystem)} to ${systemLabel(forcedInductionMeta(spec)?.system)}? Existing parts for the old system will be uninstalled but remain owned.`) ?? true;
        if (!confirmed) return;
      }
      button.disabled = true;
      try {
        const data = await ctx.storage.installPart(button.dataset.installOwned, carId);
        ctx.store.setPlayer(data.player);
        closeDialog(dialog);
        ctx.toast("Part installed", "Upgrade installed. Your first 1/4-mile race is next.");
        if (data.player?.tutorial?.status === "active" && data.player?.tutorial?.step === "first_race") {
          ctx.router.navigate("quick-race");
          return;
        }
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

function inventoryRow(player, car, item, spec, tutorialInstall = false) {
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

  return `<article class="garage-inventory-row ${installed ? "is-installed" : ""} ${tutorialInstall ? "garage-inventory-row--ftue tutorial-target" : ""}">
    <div class="garage-inventory-row__identity"><span class="garage-inventory-row__category">${escapeHtml(spec.category || spec.categoryKey)}</span><strong>${escapeHtml(spec.name)}</strong><small>${escapeHtml(spec.description || "")}</small></div>
    <div class="garage-inventory-row__effects">${effectsSummary(spec.effects || [])}</div>
    <div class="garage-inventory-row__action">${tutorialInstall && !installed ? action.replace('button--small', 'ftue-primary-action') : action}</div>
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
