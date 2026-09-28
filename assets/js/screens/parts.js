import { bindHome, carLabel, escapeHtml, money, number, pageShell, selectedCar } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";

let catalogCache = null;
const REQUIRED = ["intake", "exhaust", "ecu", "fuel", "drivetrain", "tires", "weight"];

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
      body: '<div class="empty-state"><strong>Select a car first.</strong><span>Parts are always evaluated against the Current Car.</span><div style="margin-top:12px"><button class="button button--primary button--small" data-go-garage>GARAGE</button></div></div>'
    });
    bindHome(ctx.screenRoot, ctx.router);
    ctx.screenRoot.querySelector("[data-go-garage]")?.addEventListener("click", () => ctx.router.navigate("garage"));
    return;
  }

  const stage = Number(current.buildStage || 1);
  const tutorialStep = player?.tutorial?.status === "active" ? player.tutorial.step : null;

  ctx.screenRoot.innerHTML = pageShell({
    title: "Parts",
    eyebrow: `${carLabel(current)} / BUILD STAGE ${stage}`,
    hint: `${money(player.wallet?.credits)} CR`,
    trail: stage === 1 ? "Sequential upgrades / no downgrades" : "Choice-based parts / previous stage choices remain",
    body: `
      <div class="build-shop-header">
        <div class="build-shop-car">${renderVehicle(current, { stage, view: 'sideProfile' })}</div>
        <div class="build-shop-stats">
          <span><b>${number(current.derived?.hp)}</b> HP</span>
          <span><b>${number(current.derived?.torque)}</b> LB-FT</span>
          <span><b>${number(current.derived?.weight)}</b> LB</span>
          <span><b>${number(current.derived?.grip, 3)}</b> GRIP</span>
        </div>
      </div>
      ${tutorialObjective(tutorialStep)}
      ${stage === 1 ? renderStageOne(player, current) : renderChoiceParts(player, current)}
    `
  });

  bindHome(ctx.screenRoot, ctx.router);
  bindPartActions(ctx, current);

  ctx.screenRoot.querySelector("[data-explain-stages]")?.addEventListener("click", () => explainStages(ctx));
  ctx.screenRoot.querySelector("[data-stage-up]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.stageUp(current.carId);
      ctx.store.setPlayer(data.player);
      ctx.toast("Build Stage 2 unlocked", "The numbered Stage 1 path is now incorporated into the car.");
      await renderParts(ctx);
    } catch (err) {
      ctx.toast("Stage conversion blocked", err.message);
      event.currentTarget.disabled = false;
    }
  });
}

function renderStageOne(player, car) {
  const rows = REQUIRED.map((key) => stageOneRow(player, car, key)).join("");
  const done = REQUIRED.filter((key) => installedSimpleTier(player, car.carId, key) >= 3).length;
  const complete = done === REQUIRED.length;

  return `
    <section class="build-stage-panel">
      <div class="build-stage-panel__top">
        <div><span class="section-label">STAGE 1 / STREET - STOCK CHASSIS</span><strong>Learn the car one category at a time.</strong></div>
        <div class="stage-count">${done}/${REQUIRED.length} MAXED</div>
      </div>
      <div class="meter meter--large"><i style="width:${(done / REQUIRED.length) * 100}%"></i></div>
      <div class="upgrade-table">
        <div class="upgrade-table__head"><span>Category</span><span>Progress</span><span>Next upgrade</span><span>Projected result</span><span></span></div>
        ${rows}
      </div>
      ${complete ? '<div class="stage-ready"><div><span class="section-label">STAGE 2 READY</span><strong>All required Stage 1 categories are maxed.</strong><p>Conversion is permanent. Your completed Stage 1 setup becomes the new baseline.</p></div><button class="button button--primary" data-stage-up>CONVERT TO STAGE 2</button></div>' : ""}
    </section>`;
}

function stageOneRow(player, car, key) {
  const currentTier = installedSimpleTier(player, car.carId, key);
  const categoryParts = catalogCache
    .filter((part) => part.categoryKey === key && Number(part.buildStage) === 1)
    .sort((a, b) => Number(a.simpleTier) - Number(b.simpleTier));

  const currentSpec = categoryParts.find((part) => Number(part.simpleTier) === currentTier);
  const nextSpec = categoryParts.find((part) => Number(part.simpleTier) === currentTier + 1);
  const pending = nextSpec ? findInventory(player, nextSpec.catalogId) : null;
  const highlight = player?.tutorial?.status === "active"
    && ["buy_first_upgrade", "install_first_upgrade"].includes(player.tutorial.step)
    && key === "intake";
  const progress = [1, 2, 3]
    .map((tier) => `<i class="tier-dot ${tier <= currentTier ? "is-done" : ""}">${tier}</i>`)
    .join("");

  if (!nextSpec) {
    return `<div class="upgrade-row ${highlight ? "tutorial-target" : ""}">
      <div><strong>${escapeHtml(currentSpec?.category || key)}</strong><small>Stage 1 category</small></div>
      <div class="tier-track">${progress}</div>
      <div><strong>MAXED</strong><small>Stage 3 installed</small></div>
      <div class="projected"><b>${number(car.derived?.hp)} hp</b><b>${number(car.derived?.torque)} tq</b><b>${number(car.derived?.weight)} lb</b></div>
      <div><span class="status-text status-text--good">COMPLETE</span></div>
    </div>`;
  }

  const projected = projectStats(player, car, nextSpec);
  return `<div class="upgrade-row ${highlight ? "tutorial-target" : ""}">
    <div><strong>${escapeHtml(nextSpec.category)}</strong><small>${currentTier ? `Stage ${currentTier} installed` : "Stock"}</small></div>
    <div class="tier-track">${progress}</div>
    <div><strong>${escapeHtml(nextSpec.name)}</strong><small>${money(nextSpec.price)} cr</small></div>
    <div class="projected">
      <b>${number(car.derived?.hp)} -> ${number(projected.hp)} hp</b>
      <b>${number(car.derived?.torque)} -> ${number(projected.torque)} tq</b>
      <b>${number(car.derived?.weight)} -> ${number(projected.weight)} lb</b>
    </div>
    <div>${pending
      ? `<button class="button button--primary button--small" data-install-part="${escapeHtml(pending.inventoryId)}">INSTALL</button>`
      : `<button class="button button--small" data-buy-part="${escapeHtml(nextSpec.catalogId)}" ${Number(player.wallet?.credits || 0) >= Number(nextSpec.price) ? "" : "disabled"}>BUY</button>`
    }</div>
  </div>`;
}

function renderChoiceParts(player, car) {
  const stage = Number(car.buildStage || 2);
  const available = catalogCache.filter((part) =>
    !part.simpleTier
    && Number(part.buildStage || 2) <= stage
    && Number(part.persistentFromStage || part.buildStage || 2) <= stage
  );
  const categories = [...new Set(available.map((part) => part.categoryKey))];

  return `
    <section class="build-stage-panel">
      <div class="build-stage-panel__top">
        <div><span class="section-label">STAGE ${stage} / CHOICE-BASED BUILD</span><strong>Parts are choices now, not a ladder.</strong><p>Nothing is hidden behind mystery stats. The projected car result is shown before you buy or install.</p></div>
      </div>
      <div class="choice-groups">
        ${categories.map((key) => `
          <section class="choice-group">
            <h3>${escapeHtml(available.find((p) => p.categoryKey === key)?.category || key)}</h3>
            <div class="choice-list">${available.filter((part) => part.categoryKey === key).map((part) => choiceRow(player, car, part)).join("")}</div>
          </section>
        `).join("")}
      </div>
      ${stage < 3 ? '<div class="future-stage-note"><strong>Stage 3 preview:</strong> front-half / tube-chassis work, engine swaps and more parts are modeled next. Stage 2 parts remain available after advancing.</div>' : ""}
    </section>`;
}

function choiceRow(player, car, part) {
  const owned = findInventory(player, part.catalogId);
  const installed = owned && String(owned.installedOnCarId || "") === String(car.carId);
  const projected = projectStats(player, car, part);

  return `<div class="choice-row ${installed ? "is-installed" : ""}">
    <div><strong>${escapeHtml(part.name)}</strong><small>${escapeHtml(part.description || "")}</small></div>
    <div class="projected">
      <b>${number(car.derived?.hp)} -> ${number(projected.hp)} hp</b>
      <b>${number(car.derived?.torque)} -> ${number(projected.torque)} tq</b>
      <b>${number(car.derived?.weight)} -> ${number(projected.weight)} lb</b>
    </div>
    <div class="choice-row__price">${money(part.price)} cr</div>
    <div>${installed
      ? `<button class="button button--small" data-uninstall-part="${escapeHtml(owned.inventoryId)}">INSTALLED</button>`
      : owned
        ? `<button class="button button--primary button--small" data-install-part="${escapeHtml(owned.inventoryId)}">INSTALL</button>`
        : `<button class="button button--small" data-buy-part="${escapeHtml(part.catalogId)}" ${Number(player.wallet?.credits || 0) >= Number(part.price) ? "" : "disabled"}>BUY</button>`
    }</div>
  </div>`;
}

function bindPartActions(ctx, car) {
  ctx.screenRoot.querySelectorAll("[data-buy-part]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.buyPart(button.dataset.buyPart);
        ctx.store.setPlayer(data.player);
        ctx.toast("Part purchased", "It is ready to install.");
        await renderParts(ctx);
      } catch (err) {
        ctx.toast("Purchase blocked", err.message);
        button.disabled = false;
      }
    });
  });

  ctx.screenRoot.querySelectorAll("[data-install-part]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.installPart(button.dataset.installPart, car.carId);
        ctx.store.setPlayer(data.player);
        ctx.toast("Part installed", "The car's numbers were recalculated.");
        await renderParts(ctx);
      } catch (err) {
        ctx.toast("Install blocked", err.message);
        button.disabled = false;
      }
    });
  });

  ctx.screenRoot.querySelectorAll("[data-uninstall-part]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.uninstallPart(button.dataset.uninstallPart);
        ctx.store.setPlayer(data.player);
        await renderParts(ctx);
      } catch (err) {
        ctx.toast("Cannot remove part", err.message);
        button.disabled = false;
      }
    });
  });
}

function tutorialObjective(step) {
  if (step === "buy_first_upgrade") {
    return `<div class="objective-box objective-box--active"><div><span class="objective-kicker">FTUE / STEP 4</span><strong>Buy your first upgrade</strong></div><p>The Intake row is highlighted as a simple first example. Notice that the game shows the resulting HP, torque and weight before you spend credits.</p></div>`;
  }
  if (step === "install_first_upgrade") {
    return `<div class="objective-box objective-box--active"><div><span class="objective-kicker">FTUE / STEP 5</span><strong>Install the part you just bought</strong></div><p>Buying and installing are separate actions. In Stage 1, moving up a numbered category is permanent - you cannot downgrade it later.</p></div>`;
  }
  if (step === "build_stages") {
    return `<div class="objective-box objective-box--active"><div><span class="objective-kicker">FTUE / STEP 6</span><strong>What are Build Stages?</strong></div><p>You have seen the Stage 1 upgrade ladder. Before your first race, see how the car changes as the build gets more serious.</p><button class="button button--primary button--small" data-explain-stages>EXPLAIN BUILD STAGES</button></div>`;
  }
  return "";
}

function explainStages(ctx) {
  const dialog = showDialog(`<div class="dialog-body stage-explainer">
    <h2>Build Stages</h2>
    <p>A car only moves forward. Each stage changes what kinds of modifications make sense.</p>
    <div class="stage-explainer__rows">
      <div><b>S1</b><span><strong>Street / Stock Chassis</strong>Simple Stage 1 -> 2 -> 3 upgrades in each required category.</span></div>
      <div><b>S2</b><span><strong>Street Race</strong>Gutted, caged, questionably street legal. Named parts become choices instead of a ladder.</span></div>
      <div><b>S3</b><span><strong>Front-Half / Tube Chassis</strong>Engine swaps unlock with engine-bay, orientation and displacement compatibility.</span></div>
      <div><b>S4</b><span><strong>Full Race Car</strong>Much wider powertrain and chassis freedom. The original car is increasingly the body and identity.</span></div>
    </div>
    <div class="dialog-actions"><button class="button button--primary" data-continue>CONTINUE TO YOUR FIRST RACE</button></div>
  </div>`, { locked: true });

  dialog.querySelector("[data-continue]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.tutorialAdvance("build_stages_explained");
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.router.navigate("quick-race");
    } catch (err) {
      ctx.toast("Tutorial error", err.message);
      event.currentTarget.disabled = false;
    }
  });
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

function findInventory(player, catalogId) {
  return (player?.inventory?.parts || []).find((item) => item.catalogId === catalogId) || null;
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