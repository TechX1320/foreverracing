import { benchmarkPerformance, performanceClassFromIndex } from "./PerformanceIndex.js";
import { forcedInductionMeta, forcedInductionState, forcedInductionSwapNeeded } from "./ForcedInduction.js";
import { applyBuildPartEffect, enginePowerEnvelope, limitEngineOutput } from "./PowerModel.js";
import { evaluateTune, tuningHardwareProfile } from "./Tuning.js";

export function projectPartChange({
  player,
  car,
  catalog = [],
  racingConfig = {},
  candidate = null,
  removeInventoryId = null,
} = {}) {
  if (!car) return null;

  const seed = Number(car.buildStage || 1) >= 2 && car.stageBaseline ? car.stageBaseline : car.base;
  const raw = {
    hp: Number(seed?.hp || car.base?.hp || 1),
    torque: Number(seed?.torque || car.base?.torque || 1),
    weight: Number(seed?.weight || car.base?.weight || 500),
    grip: Number(seed?.grip || car.base?.grip || 1),
  };
  const installedSpecs = [];

  const swapState = candidate && forcedInductionSwapNeeded(car, player?.inventory?.parts || [], candidate, catalog)
    ? forcedInductionState(car, player?.inventory?.parts || [], catalog)
    : null;

  for (const item of player?.inventory?.parts || []) {
    if (String(item.installedOnCarId || "") !== String(car.carId || "")) continue;
    if (removeInventoryId && String(item.inventoryId || "") === String(removeInventoryId)) continue;

    const spec = catalog.find((part) => String(part.catalogId) === String(item.catalogId));
    if (!spec) continue;

    if (candidate && String(spec.slot || "") === String(candidate.slot || "")) continue;

    if (swapState) {
      const meta = forcedInductionMeta(spec);
      if (
        meta
        && String(meta.role || "") !== "nitrous"
        && String(meta.system || "") === String(swapState.primarySystem || "")
      ) continue;
    }

    installedSpecs.push(spec);
    for (const effect of spec.effects || []) applyBuildPartEffect(raw, effect, spec);
  }

  if (candidate) {
    installedSpecs.push(candidate);
    for (const effect of candidate.effects || []) applyBuildPartEffect(raw, effect, candidate);
  }

  const envelope = enginePowerEnvelope(car, installedSpecs);
  const limited = limitEngineOutput({
    hp: Math.max(1, raw.hp),
    torque: Math.max(1, raw.torque),
    weight: Math.max(500, raw.weight),
    grip: Math.max(0.5, raw.grip),
  }, envelope);

  const untuned = {
    hp: limited.hp,
    torque: limited.torque,
    weight: Math.round(Math.max(500, raw.weight)),
    grip: Math.round(Math.max(0.5, raw.grip) * 1000) / 1000,
    drivetrain: String(car.base?.drivetrain || ""),
  };

  const hardware = tuningHardwareProfile(car, installedSpecs);
  let derived = { ...untuned };
  let tuningRuntime = null;

  if (car.tune && hardware.unlocked) {
    const evaluation = evaluateTune(car, untuned, car.tune, hardware);
    derived = { ...evaluation.derived };
    tuningRuntime = evaluation.race;
  }

  const benchmark = benchmarkPerformance({
    ...derived,
    drivetrain: String(car.base?.drivetrain || ""),
    tuning: tuningRuntime,
  }, racingConfig);

  return {
    hp: Number(derived.hp),
    torque: Number(derived.torque),
    weight: Number(derived.weight),
    grip: Number(derived.grip),
    capacityHp: Number(envelope.capacityHp || 0),
    powerLimited: Boolean(limited.powerLimit?.hpLimited),
    performanceIndex: Number(benchmark.performanceIndex || 0),
    performanceClass: performanceClassFromIndex(benchmark.performanceIndex),
    benchmarkEt: Number(benchmark.quarterMileEt || 0),
  };
}

export function signedDelta(value) {
  const number = Number(value || 0);
  if (Math.abs(number) < 0.0005) return "0";
  return `${number > 0 ? "+" : ""}${Number.isInteger(number) ? number : number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}
