import { engineToCarSnapshot, normalizeEngineDefinition } from "./EngineCatalog.js";

export const ENGINE_BOUND_CATEGORIES = Object.freeze([
  "intake",
  "exhaust",
  "ecu",
  "fuel",
  "drivetrain",
  "forced_induction",
  "engine_kit",
  "engine",
]);

const ENGINE_BOUND = new Set(ENGINE_BOUND_CATEGORIES);

export function engineSwapEligible(engine) {
  const row = normalizeEngineDefinition(engine);
  if (!row.engineId) return false;
  if (row.swapMarket?.available === false) return false;
  return row.peakHp > 0
    && row.peakTorque > 0
    && row.redlineRpm > 0
    && row.revCutRpm >= row.redlineRpm;
}

export function engineSwapPrice(engine) {
  const row = normalizeEngineDefinition(engine);
  const authored = Number(row.swapMarket?.price || 0);
  if (authored > 0) return Math.round(authored);
  const fallback = (row.peakHp * 28) + (row.displacementLiters * 1800);
  return Math.max(4500, Math.round(fallback / 500) * 500);
}

export function engineSwapFitment(car, engine) {
  const row = normalizeEngineDefinition(engine);
  const source = car?.engineSwapFitment && typeof car.engineSwapFitment === "object"
    ? car.engineSwapFitment
    : {};
  const options = source.options && typeof source.options === "object" ? source.options : {};
  const authored = options[row.engineId];
  const factory = String(car?.factoryEngineId || "") === row.engineId;

  if (!authored && !factory) {
    return {
      allowed: false,
      minBuildStage: Math.max(3, Number(source.minBuildStage || 3)),
      fitment: "NO FITMENT",
      installCost: 0,
      note: "No chassis fitment has been authored for this engine.",
    };
  }

  const fitment = authored && typeof authored === "object" ? authored : {};
  return {
    allowed: fitment.allowed !== false,
    minBuildStage: Math.max(3, Number(fitment.minBuildStage || source.minBuildStage || 3)),
    fitment: String(fitment.fitment || (factory ? "FACTORY" : "CUSTOM")).toUpperCase(),
    installCost: Math.max(0, Math.round(Number(fitment.installCost ?? (factory ? 2500 : 7500)))),
    note: String(fitment.note || (factory
      ? "Factory engine fitment. Reinstallation still requires swap labor and fresh setup."
      : "Custom mounts, plumbing, wiring and driveline adaptation are included in the installation cost.")),
  };
}

export function engineSwapQuote(car, engine, ownedEngines = []) {
  const row = normalizeEngineDefinition(engine);
  const fitment = engineSwapFitment(car, row);
  const owned = (Array.isArray(ownedEngines) ? ownedEngines : [])
    .find((item) => String(item?.engineId || "") === row.engineId) || null;
  const current = String(car?.engineId || car?.factoryEngineId || "") === row.engineId;
  const enginePrice = current || owned ? 0 : engineSwapPrice(row);
  return {
    engine: row,
    fitment,
    current,
    owned,
    enginePrice,
    installCost: current ? 0 : Number(fitment.installCost || 0),
    totalCost: current ? 0 : enginePrice + Number(fitment.installCost || 0),
    stageLocked: Number(car?.buildStage || 1) < Number(fitment.minBuildStage || 3),
  };
}

export function isEngineBoundPart(part) {
  return ENGINE_BOUND.has(String(part?.categoryKey || "").toLowerCase());
}

export function swappedCarSnapshot(car, engine) {
  const row = normalizeEngineDefinition(engine);
  const next = structuredClone(car || {});
  const layout = next?.engine?.layout || null;
  next.engineId = row.engineId;
  next.engine = engineToCarSnapshot(row, layout ? { layout } : {});
  next.engine.tags = [...row.tags];
  next.engine.engineId = row.engineId;
  next.base ||= {};
  next.base.hp = row.peakHp;
  next.base.torque = row.peakTorque;
  if (next.stageBaseline && typeof next.stageBaseline === "object") {
    next.stageBaseline.hp = row.peakHp;
    next.stageBaseline.torque = row.peakTorque;
  }
  next.tune = null;
  next.tuningRuntime = null;
  next.tuningDiagnostics = null;
  return next;
}

export function healthyEngineCondition(previous = {}) {
  return {
    healthPct: 100,
    failed: false,
    failures: Number(previous?.failures || 0),
    lastFailureAt: previous?.lastFailureAt || null,
    repairedAt: previous?.repairedAt || null,
  };
}

export function normalizedStoredEngineCondition(source = {}) {
  return {
    healthPct: Math.max(0, Math.min(100, Number(source?.healthPct ?? 100))),
    failed: source?.failed === true,
    failures: Math.max(0, Number(source?.failures || 0)),
    lastFailureAt: source?.lastFailureAt || null,
    repairedAt: source?.repairedAt || null,
  };
}
