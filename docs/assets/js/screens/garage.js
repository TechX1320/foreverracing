import { bindHome, carLabel, escapeHtml, money, number, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";

let partsCache = null;

export async function renderGarage(ctx) {
  const player = ctx.store.player;
  if (!partsCache) {
    const data = await ctx.storage.partsCatalog();
    partsCache = data.parts || [];
  }
  const garage = Array.isArray(player?.garage) ? player.garage : [];
  const tutorialGarage = player?.tutorial?.status === "active" && player?.tutorial?.step === "visit_garage";

  const body = garage.length === 0
    ? `<div class="empty-state"><strong>Your garage is empty.</strong><span>Buy a car before there is anything to manage here.</span><div class="cluster" style="justify-content:center;margin-top:12px"><button class="button button--primary button--small" data-go-showroom>SHOWROOM</button></div></div>`
    : `
      ${tutorialGarage ? garageTutorial() : ""}
      <div class="garage-list">${garage.map((car) => carRow(player, car, partsCache)).join("")}</div>`;

  ctx.screenRoot.innerHTML = pageShell({
    title: "Garage",
    eyebrow: "YOUR CARS",
    hint: `${garage.length} OWNED`,
    trail: "Build stage • setup • current car",
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
  ctx.screenRoot.querySelectorAll("[data-stage-up]").forEach((button) => {
    button.addEventListener("click", () => stageUp(ctx, button.dataset.stageUp));
  });
}

function carRow(player, car, catalog) {
  const selected = String(player?.selectedCarId || "") === String(car.carId);
  const stage = Number(car.buildStage || 1);
  const progress = stage === 1 ? stageOneProgress(player, car, catalog) : null;
  return `
    <article class="garage-entry ${selected ? "is-current" : ""}">
      <div class="garage-entry__visual">${renderVehicle(car, { stage, view: 'sideProfile' })}</div>
      <div class="garage-entry__main">
        <div class="garage-entry__title">
          <div><span class="stage-tag">S${stage}</span><strong>${escapeHtml(carLabel(car))}</strong><small>${escapeHtml(car.displayName)} • ${escapeHtml(car.base?.drivetrain || "")}</small></div>
          ${selected ? '<span class="current-tag">CURRENT</span>' : ""}
        </div>
        <div class="stat-line">
          <span><b>${number(car.derived?.hp)}</b> HP</span>
          <span><b>${number(car.derived?.torque)}</b> LB-FT</span>
          <span><b>${number(car.derived?.weight)}</b> LB</span>
          <span><b>${number(car.mileage)}</b> MI</span>
        </div>
        ${progress ? `<div class="stage-progress"><div class="stage-progress__label"><span>Stage 1 completion</span><b>${progress.maxed}/${progress.total}</b></div><div class="meter"><i style="width:${(progress.maxed / progress.total) * 100}%"></i></div></div>` : `<div class="stage-progress"><div class="stage-progress__label"><span>Build Stage</span><b>Stage ${stage} • choice-based parts</b></div></div>`}
        <div class="garage-entry__actions">
          <button class="button button--small" data-select-car="${escapeHtml(car.carId)}" ${selected ? "disabled" : ""}>${selected ? "CURRENT" : "MAKE CURRENT"}</button>
          <button class="button button--small" data-rename-car="${escapeHtml(car.carId)}">RENAME</button>
          ${progress?.ready ? `<button class="button button--primary button--small" data-stage-up="${escapeHtml(car.carId)}">CONVERT TO STAGE 2</button>` : ""}
        </div>
      </div>
    </article>`;
}

function stageOneProgress(player, car, catalog) {
  const required = ["intake", "exhaust", "ecu", "fuel", "drivetrain", "tires", "weight"];
  const installed = player?.inventory?.parts || [];
  let maxed = 0;
  for (const key of required) {
    let tier = 0;
    for (const item of installed) {
      if (String(item.installedOnCarId || "") !== String(car.carId)) continue;
      const spec = catalog.find((part) => part.catalogId === item.catalogId);
      if (spec?.categoryKey === key) tier = Math.max(tier, Number(spec.simpleTier || 0));
    }
    if (tier >= 3) maxed += 1;
  }
  return { maxed, total: required.length, ready: maxed === required.length };
}

function garageTutorial() {
  return `<div class="objective-box objective-box--active">
    <div><span class="objective-kicker">FTUE • STEP 3</span><strong>Read your car before you modify it</strong></div>
    <p>Power, torque and weight are your basic performance picture. <b>Build Stage</b> defines how radical the car is allowed to become. Your first car starts at Stage 1.</p>
    <button class="button button--primary button--small" data-ftue-garage>GOT IT — SHOW ME PARTS</button>
  </div>`;
}

function stageUp(ctx, carId) {
  const car = ctx.store.player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const dialog = showDialog(`<div class="dialog-body">
    <div class="dialog-vehicle">${renderVehicle(car, { stage: 2, view: 'sideProfile' })}</div>
    <h2>Convert to Build Stage 2?</h2>
    <p>Your completed Stage 1 setup becomes the car's new baseline. The simple numbered Stage 1 parts are incorporated into the conversion, and the shop switches to named choice-based parts. Build Stage cannot go backward.</p>
    <div class="dialog-actions"><button class="button button--small" data-cancel>Cancel</button><button class="button button--primary button--small" data-confirm>CONVERT TO STAGE 2</button></div>
    <div class="form-error" data-error></div>
  </div>`);
  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.stageUp(carId);
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast("Build Stage 2 unlocked", "Choice-based Street Race parts are now available.");
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
