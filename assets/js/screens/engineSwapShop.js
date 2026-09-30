import { bindHome, carLabel, escapeHtml, money, number, pageShell, selectedCar } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";
import {
  deriveHorsepower,
  engineLabel,
  generateBaselineCurve,
  normalizeEngineDefinition,
  normalizePowerCurve,
} from "../domain/EngineCatalog.js";
import {
  engineSwapEligible,
  engineSwapQuote,
  isEngineBoundPart,
  swappedCarSnapshot,
} from "../domain/EngineSwap.js";
import { partCompatibility } from "../domain/PartCatalog.js";
import { applyBuildPartEffect, enginePowerEnvelope, limitEngineOutput } from "../domain/PowerModel.js";
import { benchmarkPerformance, performanceClassFromIndex } from "../domain/PerformanceIndex.js";

let engineCache = [];
let partCache = [];
let racingConfig = null;

export async function renderEngineSwapShop(ctx) {
  const player = ctx.store.player;
  if (!player) return;

  const [enginesResponse, partsResponse, racing] = await Promise.all([
    ctx.storage.engineCatalog(),
    ctx.storage.partsCatalog(),
    racingConfig ? Promise.resolve(racingConfig) : fetch("data/config/racing.json", { cache: "no-store" }).then((response) => response.json()),
  ]);
  engineCache = (enginesResponse.engines || []).map(normalizeEngineDefinition);
  partCache = partsResponse.parts || [];
  racingConfig = racing;

  const car = selectedCar(player);
  if (!car) {
    ctx.screenRoot.innerHTML = pageShell({
      title: "Engine Swap Shop",
      eyebrow: "POWERTRAIN",
      hint: "Select a car first",
      body: '<div class="empty-state"><strong>No current car.</strong><span>Select a car in Garage before shopping for an engine swap.</span><button class="button button--primary" type="button" data-open-garage>OPEN GARAGE</button></div>',
    });
    bindHome(ctx.screenRoot, ctx.router);
    ctx.screenRoot.querySelector("[data-open-garage]")?.addEventListener("click", () => ctx.router.navigate("garage"));
    return;
  }

  const currentEngine = engineCache.find((engine) => engine.engineId === String(car.engineId || car.factoryEngineId || ""))
    || normalizeEngineDefinition({ ...car.engine, engineId: car.engineId || car.factoryEngineId || "" });
  const options = engineCache
    .filter(engineSwapEligible)
    .map((engine) => ({ engine, quote: engineSwapQuote(car, engine, player.inventory?.engines || []) }))
    .filter(({ quote }) => quote.fitment.allowed)
    .sort((a, b) => {
      if (a.quote.current !== b.quote.current) return a.quote.current ? -1 : 1;
      if (a.quote.stageLocked !== b.quote.stageLocked) return a.quote.stageLocked ? 1 : -1;
      return a.engine.displacementLiters - b.engine.displacementLiters;
    });

  const owned = player.inventory?.engines || [];
  const stage = Number(car.buildStage || 1);

  ctx.screenRoot.innerHTML = pageShell({
    title: "Engine Swap Shop",
    eyebrow: "POWERTRAIN",
    hint: "Swap the engine here • rebuild the combination in Parts",
    body: `
      <div class="engine-swap-current">
        <div class="engine-swap-current__visual">${renderVehicle(car, { stage, view: "showroom" })}</div>
        <div class="engine-swap-current__copy">
          <span class="section-label">CURRENT CAR • ${escapeHtml(buildName(stage))}</span>
          <h3>${escapeHtml(carLabel(car))}</h3>
          <strong>${escapeHtml(engineLabel(currentEngine))}</strong>
          <p>${number(car.derived?.hp)} HP • ${number(car.derived?.torque)} LB-FT • ${escapeHtml(car.base?.drivetrain || "-")} • ${escapeHtml(currentEngine.aspiration || "-")}</p>
        </div>
        <div class="engine-swap-current__rules">
          <span><small>SWAPS</small><b>${stage >= 3 ? "OPEN" : "LOCKED"}</b></span>
          <span><small>OWNED ENGINES</small><b>${owned.length}</b></span>
          <span><small>ENGINE</small><b>${car.engineCondition?.failed ? "FAILED" : "RUNNING"}</b></span>
        </div>
      </div>

      ${stage < 3 ? `<div class="engine-swap-lock"><b>ENGINE SWAPS START AT FRONT-HALF RACE CAR</b><span>Build Type 3 opens custom powertrain fabrication. Some extreme fitments require Full Race Car / Build Type 4.</span></div>` : ""}

      <div class="engine-swap-shop-grid">
        ${options.map(({ engine, quote }) => engineCard(car, engine, quote)).join("")}
      </div>

      ${owned.length ? `<section class="engine-swap-owned">
        <header><span>ENGINE INVENTORY</span><b>Swapped-out engines stay yours.</b></header>
        <div>${owned.map((item) => {
          const engine = engineCache.find((row) => row.engineId === String(item.engineId || ""));
          const condition = item.condition?.failed ? "FAILED" : `${number(item.condition?.healthPct ?? 100)}% HEALTH`;
          return `<span><b>${escapeHtml(engine ? engineLabel(engine) : item.engineId)}</b><small>${escapeHtml(condition)}</small></span>`;
        }).join("")}</div>
      </section>` : ""}

      <div class="engine-swap-footnote">
        Engine swaps keep suspension, tires and weight-reduction hardware. Engine-bound Intake, Exhaust, Fuel, ECU, Drivetrain, Forced Induction and Engine parts are moved back to Inventory so the new engine can be rebuilt correctly.
      </div>`,
    trail: `${carLabel(car)} • ${engineLabel(currentEngine)}`,
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelectorAll("[data-swap-engine]").forEach((button) => {
    button.addEventListener("click", () => openSwapDialog(ctx, car.carId, button.dataset.swapEngine));
  });
}

function engineCard(car, engine, quote) {
  const maxHp = Number(engine.powerLimits?.kit4Hp || 0);
  const status = quote.current
    ? "CURRENT ENGINE"
    : quote.stageLocked
      ? `REQUIRES BUILD TYPE ${quote.fitment.minBuildStage}`
      : quote.owned
        ? "OWNED • INSTALL"
        : "BUY + INSTALL";
  const ownedFailed = quote.owned?.condition?.failed === true;
  return `
    <article class="engine-swap-card ${quote.current ? "is-current" : ""} ${quote.stageLocked ? "is-locked" : ""}">
      <header>
        <span class="engine-swap-fitment engine-swap-fitment--${escapeHtml(quote.fitment.fitment.toLowerCase().replace(/\s+/g, "-"))}">${escapeHtml(quote.fitment.fitment)}</span>
        <small>${escapeHtml(engine.manufacturer || "ENGINE CATALOG")}</small>
      </header>
      <h3>${escapeHtml(engine.name || engine.engineId)}</h3>
      <p>${number(engine.displacementLiters, 1)}L ${escapeHtml(engine.configuration)} • ${escapeHtml(engine.aspiration)}</p>
      <div class="engine-swap-card__stats">
        <span><small>STOCK HP</small><b>${number(engine.peakHp)}</b></span>
        <span><small>STOCK TQ</small><b>${number(engine.peakTorque)}</b></span>
        <span><small>REDLINE</small><b>${number(engine.redlineRpm)}</b></span>
        <span><small>MAX ENVELOPE</small><b>${number(maxHp)} HP</b></span>
      </div>
      <div class="engine-swap-card__cost">
        ${quote.current
          ? `<strong>INSTALLED</strong><span>Current powertrain</span>`
          : quote.stageLocked
            ? `<strong>LOCKED</strong><span>${escapeHtml(quote.fitment.note)}</span>`
            : `<strong>${money(quote.totalCost)} CR</strong><span>${quote.owned ? `Labor ${money(quote.installCost)} CR${ownedFailed ? " • OWNED ENGINE FAILED" : ""}` : `Engine ${money(quote.enginePrice)} + labor ${money(quote.installCost)}`}</span>`}
      </div>
      <button class="button ${quote.current || quote.stageLocked ? "button--quiet" : "button--primary"} button--wide" type="button" data-swap-engine="${escapeHtml(engine.engineId)}" ${quote.current || quote.stageLocked ? "disabled" : ""}>${escapeHtml(status)}</button>
    </article>`;
}

function openSwapDialog(ctx, carId, engineId) {
  const player = ctx.store.player;
  const car = player?.garage?.find((entry) => String(entry.carId) === String(carId));
  const engine = engineCache.find((row) => row.engineId === String(engineId));
  if (!car || !engine) return;

  const quote = engineSwapQuote(car, engine, player.inventory?.engines || []);
  const currentEngine = engineCache.find((row) => row.engineId === String(car.engineId || car.factoryEngineId || ""))
    || normalizeEngineDefinition({ ...car.engine, engineId: car.engineId || car.factoryEngineId || "" });
  const preview = projectSwap(player, car, engine);
  const invalidated = preview.uninstalled;
  const ownedFailed = quote.owned?.condition?.failed === true;

  const dialog = showDialog(`
    <div class="dialog-body engine-swap-dialog">
      <div class="engine-swap-dialog__head">
        <div>
          <span class="section-label">${escapeHtml(quote.fitment.fitment)} ENGINE SWAP</span>
          <h2>${escapeHtml(engine.name)}</h2>
          <p>${escapeHtml(carLabel(car))} • ${escapeHtml(quote.fitment.note)}</p>
        </div>
        <div class="engine-swap-dialog__price">
          <small>TOTAL</small><b>${money(quote.totalCost)} CR</b>
          <span>${quote.owned ? "Owned engine • labor only" : `${money(quote.enginePrice)} engine + ${money(quote.installCost)} labor`}</span>
        </div>
      </div>

      <div class="engine-swap-dialog__compare">
        <section>
          <span>CURRENT</span>
          <b>${escapeHtml(engineLabel(currentEngine))}</b>
          <div>${number(car.derived?.hp)} HP • ${number(car.derived?.torque)} TQ • PI ${number(car.performanceIndex || 0)}</div>
        </section>
        <strong>→</strong>
        <section>
          <span>AFTER SWAP / BEFORE NEW ENGINE PARTS</span>
          <b>${escapeHtml(engineLabel(engine))}</b>
          <div>${number(preview.stats.hp)} HP • ${number(preview.stats.torque)} TQ • ${escapeHtml(preview.performanceClass)} ${number(preview.performanceIndex)} PI</div>
        </section>
      </div>

      ${engineSwapDyno(currentEngine, engine)}

      <div class="engine-swap-dialog__impact">
        <div>
          <small>PARTS RETURNED TO INVENTORY</small>
          <b>${invalidated.length}</b>
          <p>${invalidated.length ? escapeHtml(invalidated.slice(0, 8).join(" • ")) : "No installed parts need to be removed."}${invalidated.length > 8 ? ` • +${invalidated.length - 8} more` : ""}</p>
        </div>
        <div>
          <small>OLD ENGINE</small>
          <b>KEPT</b>
          <p>Your current engine is removed and stored in Engine Inventory. You can pay labor to swap it back later.</p>
        </div>
        <div>
          <small>CALIBRATION</small>
          <b>RESET</b>
          <p>The old ECU tune is cleared. Install compatible management hardware on the new engine before tuning it.</p>
        </div>
      </div>

      ${ownedFailed ? '<div class="engine-swap-warning"><b>OWNED ENGINE IS FAILED</b><span>You can install it, but the car will remain ENGINE FAILED until it is rebuilt in Garage.</span></div>' : ""}

      <div class="dialog-actions">
        <button class="button button--small" type="button" data-close>CANCEL</button>
        <button class="button button--primary" type="button" data-confirm-swap>${quote.owned ? "INSTALL OWNED ENGINE" : "BUY + INSTALL ENGINE"} • ${money(quote.totalCost)} CR</button>
      </div>
    </div>`);

  dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm-swap]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.swapEngine(car.carId, engine.engineId);
      ctx.store.setPlayer(data.player);
      const updated = data.player?.garage?.find((entry) => String(entry.carId) === String(car.carId));
      const count = updated?.engineSwap?.lastUninstalledParts?.length || 0;
      closeDialog(dialog);
      ctx.toast("Engine swap complete", `${engine.name} installed. ${count} engine-bound part${count === 1 ? "" : "s"} moved to Inventory.`);
      showSwapComplete(ctx, updated, engine);
    } catch (error) {
      ctx.toast("Engine swap blocked", error.message);
      event.currentTarget.disabled = false;
    }
  });
}

function showSwapComplete(ctx, car, engine) {
  if (!car) {
    renderEngineSwapShop(ctx);
    return;
  }
  const dialog = showDialog(`
    <div class="dialog-body engine-swap-complete">
      <span class="section-label">POWERTRAIN INSTALLED</span>
      <h2>${escapeHtml(engine.name)}</h2>
      <p>${escapeHtml(carLabel(car))} now uses <strong>${escapeHtml(engineLabel(engine))}</strong>. Parts compatibility has updated to the installed engine.</p>
      <div class="engine-swap-complete__stats">
        <span><small>HP</small><b>${number(car.derived?.hp)}</b></span>
        <span><small>TQ</small><b>${number(car.derived?.torque)}</b></span>
        <span><small>PI</small><b>${number(car.performanceIndex)}</b></span>
        <span><small>ENGINE PARTS REMOVED</small><b>${number(car.engineSwap?.lastUninstalledParts?.length || 0)}</b></span>
      </div>
      <div class="dialog-actions">
        <button class="button button--small" type="button" data-stay>STAY IN SWAP SHOP</button>
        <button class="button button--primary" type="button" data-open-parts>OPEN PARTS FOR NEW ENGINE</button>
      </div>
    </div>`);
  dialog.querySelector("[data-stay]")?.addEventListener("click", () => {
    closeDialog(dialog);
    renderEngineSwapShop(ctx);
  });
  dialog.querySelector("[data-open-parts]")?.addEventListener("click", () => {
    closeDialog(dialog);
    ctx.router.navigate("parts");
  });
}

function projectSwap(player, car, engine) {
  const candidate = swappedCarSnapshot(car, engine);
  const seed = Number(candidate.buildStage || 1) >= 2 && candidate.stageBaseline ? candidate.stageBaseline : candidate.base;
  const stats = {
    hp: Number(seed?.hp || engine.peakHp || 1),
    torque: Number(seed?.torque || engine.peakTorque || 1),
    weight: Number(seed?.weight || candidate.base?.weight || 500),
    grip: Number(seed?.grip || candidate.base?.grip || 1),
  };
  const installedSpecs = [];
  const uninstalled = [];

  for (const item of player?.inventory?.parts || []) {
    if (String(item.installedOnCarId || "") !== String(car.carId)) continue;
    const spec = partCache.find((part) => String(part.catalogId) === String(item.catalogId));
    if (!spec) continue;
    const compatibility = partCompatibility(spec, candidate);
    if (isEngineBoundPart(spec) || !compatibility.ok) {
      uninstalled.push(String(spec.name || spec.catalogId));
      continue;
    }
    installedSpecs.push(spec);
    for (const effect of spec.effects || []) applyBuildPartEffect(stats, effect, spec);
  }

  const envelope = enginePowerEnvelope(candidate, installedSpecs);
  const limited = limitEngineOutput(stats, envelope);
  const projected = {
    hp: limited.hp,
    torque: limited.torque,
    weight: Math.round(stats.weight),
    grip: Math.round(stats.grip * 1000) / 1000,
    drivetrain: candidate.base?.drivetrain || car.base?.drivetrain,
  };
  const benchmark = benchmarkPerformance(projected, racingConfig || {});
  return {
    stats: projected,
    performanceIndex: benchmark.performanceIndex,
    performanceClass: performanceClassFromIndex(benchmark.performanceIndex),
    benchmarkEt: benchmark.quarterMileEt,
    uninstalled,
  };
}

function engineSwapDyno(currentEngine, candidateEngine) {
  const current = engineCurve(currentEngine);
  const candidate = engineCurve(candidateEngine);
  if (current.length < 2 || candidate.length < 2) return "";

  const maxRpm = Math.max(
    ...current.map((point) => point.rpm),
    ...candidate.map((point) => point.rpm),
    Number(currentEngine.revCutRpm || 0),
    Number(candidateEngine.revCutRpm || 0),
    1000
  );
  const maxY = Math.max(
    ...current.flatMap((point) => [point.hp, point.torqueLbFt]),
    ...candidate.flatMap((point) => [point.hp, point.torqueLbFt]),
    100
  ) * 1.08;
  const width = 660, height = 260, left = 45, right = 16, top = 16, bottom = 32;
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = (rpm) => left + (rpm / maxRpm) * plotW;
  const y = (value) => top + plotH - (value / maxY) * plotH;
  const line = (points, key) => points.map((point) => `${x(point.rpm).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const xTicks = [0,.25,.5,.75,1].map((ratio) => {
    const rpm = Math.round((maxRpm * ratio) / 500) * 500;
    return `<g><line x1="${x(rpm)}" y1="${top}" x2="${x(rpm)}" y2="${top + plotH}"/><text x="${x(rpm)}" y="${height - 8}" text-anchor="middle">${rpm}</text></g>`;
  }).join("");
  const yTicks = [0,.25,.5,.75,1].map((ratio) => {
    const value = Math.round(maxY * ratio);
    return `<g><line x1="${left}" y1="${y(value)}" x2="${left + plotW}" y2="${y(value)}"/><text x="${left - 6}" y="${y(value) + 3}" text-anchor="end">${value}</text></g>`;
  }).join("");

  return `<div class="engine-swap-dyno">
    <div class="engine-swap-dyno__legend">
      <span><i class="current"></i>CURRENT HP</span>
      <span><i class="candidate"></i>SWAP HP</span>
      <span><i class="torque"></i>SWAP TQ</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Current and engine swap dyno comparison">
      <g class="engine-swap-dyno__grid">${xTicks}${yTicks}</g>
      <polyline points="${line(current,"hp")}" class="engine-swap-dyno__line engine-swap-dyno__line--current"/>
      <polyline points="${line(candidate,"hp")}" class="engine-swap-dyno__line engine-swap-dyno__line--candidate"/>
      <polyline points="${line(candidate,"torqueLbFt")}" class="engine-swap-dyno__line engine-swap-dyno__line--torque"/>
    </svg>
  </div>`;
}

function engineCurve(engine) {
  const curve = normalizePowerCurve(engine?.powerCurve || []);
  const points = curve.length >= 2 ? curve : generateBaselineCurve(engine);
  return points.map((point) => ({
    rpm: point.rpm,
    torqueLbFt: Number(point.torqueLbFt || 0),
    hp: deriveHorsepower(point.rpm, point.torqueLbFt),
  }));
}

function buildName(stage) {
  return ({1:"Street Car",2:"Street Race Car",3:"Front-Half Race Car",4:"Full Race Car"})[Number(stage)] || "Unknown Build";
}
