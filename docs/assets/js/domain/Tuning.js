import { enginePowerEnvelope, limitEngineOutput } from "./PowerModel.js";
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));
const round = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
};

export function tuningHardwareProfile(car, installedSpecs = []) {
  const specs = (Array.isArray(installedSpecs) ? installedSpecs : []).filter(Boolean);
  const standalone = specs.some((part) => part?.tuning?.homeGarage === true || part?.tuning?.mode === "standalone");
  const engineKitLevel = specs.reduce((max, part) => Math.max(max, Number(part?.engineKit?.level || 0)), 0);
  const fi = specs.filter((part) => part?.forcedInduction && String(part.forcedInduction.role || "") !== "nitrous");
  const systems = [...new Set(fi.map((part) => normalizeSystem(part.forcedInduction?.system)).filter(Boolean))];
  const factorySystem = normalizeSystem(car?.engine?.aspiration);
  if (factorySystem && factorySystem !== "nitrous" && !systems.includes(factorySystem)) systems.push(factorySystem);

  const boosted = systems.includes("turbo") || systems.includes("supercharger");
  const factoryBoost = Number(car?.engine?.peakBoostPsi ?? car?.engine?.factoryPeakBoostPsi ?? 0);
  const primarySteps = fi
    .filter((part) => ["kit_upgrade", "factory_upgrade"].includes(String(part.forcedInduction?.role || "")))
    .map((part) => Number(part.forcedInduction?.step || 0));
  const maxStep = primarySteps.length ? Math.max(...primarySteps) : 0;
  const largerTurbo = fi.some((part) => String(part.catalogId || "") === "s3_fi_turbo_upgrade");
  const highFlowBlower = fi.some((part) => String(part.catalogId || "") === "s3_fi_supercharger_upgrade");
  const twinCharge = systems.includes("turbo") && systems.includes("supercharger");

  let baseBoostPsi = boosted ? (factoryBoost > 0 ? factoryBoost : systems.includes("turbo") ? 9 : 7) : 0;
  baseBoostPsi += maxStep * 1.5;
  if (largerTurbo || highFlowBlower) baseBoostPsi += 2.5;
  if (twinCharge) baseBoostPsi += 2;

  const stage = Number(car?.buildStage || 1);
  const safeHeadroom = 3 + (engineKitLevel * 2.2) + (stage >= 4 ? 1.5 : 0);
  const safeBoostPsi = boosted ? clamp(baseBoostPsi + safeHeadroom, 6, 32) : 0;
  const maxBoostPsi = boosted ? clamp(safeBoostPsi + 6, 8, 38) : 0;
  const minBoostPsi = boosted ? clamp(baseBoostPsi - 7, 2, maxBoostPsi) : 0;

  return {
    unlocked: standalone,
    standalone,
    boosted,
    systems,
    engineKitLevel,
    powerEnvelope: enginePowerEnvelope(car, specs),
    baseBoostPsi: round(baseBoostPsi, 1),
    safeBoostPsi: round(safeBoostPsi, 1),
    minBoostPsi: round(minBoostPsi, 1),
    maxBoostPsi: round(maxBoostPsi, 1),
  };
}

export function defaultTuneProfile(car, hardware = {}) {
  const redline = Math.max(4000, Number(car?.engine?.redlineRpm || 7000));
  const revCut = Math.max(redline, Number(car?.engine?.revCutRpm || redline + 500));
  const shiftBase = Number(car?.engine?.peakHpRpm || 0) > 0
    ? Math.min(revCut - 100, Number(car.engine.peakHpRpm) + 250)
    : Math.round(redline * 0.96);
  return {
    version: 1,
    boostPsi: hardware.boosted ? round(Number(hardware.baseBoostPsi || 0), 1) : 0,
    boostByGear: [100, 100, 100, 100, 100, 100],
    fuelTrimPct: 0,
    ignitionAdvanceDeg: 0,
    launchRpm: Math.round(clamp(redline * 0.52, 2200, 5200) / 100) * 100,
    shiftRpm: Math.round(clamp(shiftBase, 3500, revCut) / 100) * 100,
    tirePsiFront: 32,
    tirePsiRear: 32,
    savedAt: null,
  };
}

export function normalizeTuneProfile(input, car, hardware = {}) {
  const defaults = defaultTuneProfile(car, hardware);
  const source = input && typeof input === "object" ? input : {};
  const redline = Math.max(4000, Number(car?.engine?.redlineRpm || 7000));
  const revCut = Math.max(redline, Number(car?.engine?.revCutRpm || redline + 500));
  const gearSource = Array.isArray(source.boostByGear) ? source.boostByGear : defaults.boostByGear;
  const boostByGear = Array.from({ length: 6 }, (_, index) => Math.round(clamp(gearSource[index] ?? 100, 45, 100)));

  return {
    version: 1,
    boostPsi: hardware.boosted
      ? round(clamp(source.boostPsi ?? defaults.boostPsi, Number(hardware.minBoostPsi || 0), Number(hardware.maxBoostPsi || 0)), 1)
      : 0,
    boostByGear,
    fuelTrimPct: round(clamp(source.fuelTrimPct ?? 0, -10, 18), 1),
    ignitionAdvanceDeg: round(clamp(source.ignitionAdvanceDeg ?? 0, -5, 7), 1),
    launchRpm: Math.round(clamp(source.launchRpm ?? defaults.launchRpm, 1800, Math.max(2200, redline)) / 100) * 100,
    shiftRpm: Math.round(clamp(source.shiftRpm ?? defaults.shiftRpm, 3000, revCut) / 100) * 100,
    tirePsiFront: round(clamp(source.tirePsiFront ?? 32, 12, 42), 1),
    tirePsiRear: round(clamp(source.tirePsiRear ?? 32, 12, 42), 1),
    savedAt: Number(source.savedAt || 0) || null,
  };
}

export function tuningFingerprint(car) {
  const hash = stableHash(String(car?.carId || car?.catalogId || car?.stockId || "car"));
  const unit = (shift) => (((hash >>> shift) & 0xff) / 255) * 2 - 1;
  return {
    fuelBias: round(unit(0) * 1.6, 2),
    timingBias: round(unit(8) * 0.75, 2),
    frontPsiBias: round(unit(16) * 1.2, 2),
    rearPsiBias: round(unit(24) * 1.2, 2),
    launchBiasRpm: Math.round(unit(4) * 350),
    shiftBiasRpm: Math.round(unit(12) * 220),
    airflowBias: round(0.97 + (((hash >>> 20) & 0x0f) / 15) * 0.06, 3),
  };
}

export function evaluateTune(car, untunedStats, inputProfile, hardware = {}) {
  const profile = normalizeTuneProfile(inputProfile, car, hardware);
  const fingerprint = tuningFingerprint(car);
  const base = {
    hp: Math.max(1, Number(untunedStats?.hp || 1)),
    torque: Math.max(1, Number(untunedStats?.torque || 1)),
    weight: Math.max(500, Number(untunedStats?.weight || 500)),
    grip: Math.max(0.5, Number(untunedStats?.grip || 1)),
    drivetrain: String(untunedStats?.drivetrain || car?.base?.drivetrain || ""),
  };

  const boostDelta = hardware.boosted ? profile.boostPsi - Number(hardware.baseBoostPsi || 0) : 0;
  const pressureRatio = hardware.boosted
    ? Math.pow((14.7 + profile.boostPsi) / Math.max(8, 14.7 + Number(hardware.baseBoostPsi || 0)), 0.82)
    : 1;

  const fuelTarget = clamp(1.2 + Math.max(0, boostDelta) * 0.34 + fingerprint.fuelBias, -2, 10);
  const fuelNeutralScore = bellScore(0 - clamp(1.2 + fingerprint.fuelBias, -2, 10), 4.2);
  const fuelError = profile.fuelTrimPct - fuelTarget;
  const fuelScore = bellScore(fuelError, 4.2);
  const leanSeverity = clamp((-fuelError - 1.2) / 6.5, 0, 1);
  const richSeverity = clamp((fuelError - 2.2) / 8, 0, 1);
  const fuelMultiplier = clamp(1 + ((fuelScore - fuelNeutralScore) * 0.045) - (leanSeverity * 0.055) - (richSeverity * 0.025), 0.9, 1.05);

  const timingTarget = clamp(0.7 - Math.max(0, boostDelta) * 0.11 + fingerprint.timingBias, -2.5, 2.5);
  const timingNeutralScore = bellScore(0 - clamp(0.7 + fingerprint.timingBias, -2.5, 2.5), 2.6);
  const timingError = profile.ignitionAdvanceDeg - timingTarget;
  const timingScore = bellScore(timingError, 2.6);
  const timingOver = clamp((timingError - 0.6) / 4.2, 0, 1);
  const timingMultiplier = clamp(1 + ((timingScore - timingNeutralScore) * 0.04) - (timingOver * 0.05), 0.91, 1.045);

  const boostOver = hardware.boosted
    ? clamp((profile.boostPsi - Number(hardware.safeBoostPsi || profile.boostPsi)) / Math.max(2, Number(hardware.maxBoostPsi || profile.boostPsi) - Number(hardware.safeBoostPsi || profile.boostPsi)), 0, 1)
    : 0;
  const stress = clamp((boostOver * 0.55) + (leanSeverity * 0.3) + (timingOver * 0.35), 0, 1);
  const safetyPull = 1 - (stress * 0.11);
  const powerMultiplier = clamp(pressureRatio * fuelMultiplier * timingMultiplier * fingerprint.airflowBias * safetyPull, 0.72, 1.45);
  const torqueMultiplier = clamp(Math.pow(pressureRatio, 1.04) * fuelMultiplier * (1 + ((timingMultiplier - 1) * 0.75)) * fingerprint.airflowBias * safetyPull, 0.72, 1.5);

  const tire = tireEvaluation(car, base, profile, fingerprint);
  const launch = launchEvaluation(car, base, profile, fingerprint);
  const shift = shiftEvaluation(car, profile, fingerprint);
  const gear = gearEvaluation(profile, base, tire.gripMultiplier);

  const preLimit = {
    hp: Math.round(Math.max(1, base.hp * powerMultiplier)),
    torque: Math.round(Math.max(1, base.torque * torqueMultiplier)),
    weight: Math.round(base.weight),
    grip: round(Math.max(0.5, base.grip * tire.gripMultiplier), 3),
    drivetrain: base.drivetrain,
  };
  const limited = limitEngineOutput(preLimit, hardware.powerEnvelope || enginePowerEnvelope(car, []), { overdrive: stress * 0.04 });
  const derived = {
    hp: limited.hp,
    torque: limited.torque,
    weight: preLimit.weight,
    grip: preLimit.grip,
    drivetrain: preLimit.drivetrain,
  };

  const stability = clamp(1 - (stress * 0.65) - (Math.max(0, Math.abs(fuelError) - 3) * 0.025) - (Math.max(0, timingError - 1.2) * 0.04), 0.35, 1);
  const hints = buildHints({ profile, hardware, fuelError, timingError, tire, launch, shift, gear, stress, powerLimited: Boolean(limited.powerLimit?.hpLimited) });

  return {
    profile,
    hardware,
    fingerprint,
    derived,
    diagnostics: {
      riskPct: Math.round(stress * 100),
      stabilityPct: Math.round(stability * 100),
      fuelState: fuelError < -1.2 ? "LEAN" : fuelError > 2.2 ? "RICH" : "IN RANGE",
      timingState: timingError > 1.1 ? "AGGRESSIVE" : timingError < -1.8 ? "CONSERVATIVE" : "IN RANGE",
      tireState: tire.state,
      launchState: launch.state,
      shiftState: shift.state,
      powerState: limited.powerLimit?.hpLimited ? "ENGINE-LIMITED" : "HEADROOM",
      powerLimit: limited.powerLimit || null,
      hints,
    },
    race: {
      active: true,
      stability,
      stress,
      boostPsi: profile.boostPsi,
      boostByGear: profile.boostByGear,
      launchPowerFactor: gear.launchPowerFactor,
      averagePowerFactor: gear.averagePowerFactor,
      launchEtModifier: launch.etModifier,
      shiftPenaltySec: shift.penaltySec,
      rollingPenaltySec: tire.rollingPenaltySec,
      tractionMultiplier: gear.tractionMultiplier,
      tuneLabel: stress >= 0.72 ? "ON THE EDGE" : stress >= 0.4 ? "AGGRESSIVE" : "STABLE",
    },
  };
}

function tireEvaluation(car, stats, profile, fingerprint) {
  const drivetrain = String(stats.drivetrain || car?.base?.drivetrain || "").toUpperCase();
  const weightAdjust = clamp((Number(stats.weight || 3000) - 3000) / 1200, -0.8, 0.8);
  let targetFront = 28;
  let targetRear = 24;
  if (drivetrain === "RWD") { targetFront = 30.5; targetRear = 18.5; }
  else if (drivetrain === "FWD") { targetFront = 20.5; targetRear = 30.5; }
  else if (drivetrain === "AWD") { targetFront = 24; targetRear = 24; }
  targetFront += (weightAdjust * 1.1) + fingerprint.frontPsiBias;
  targetRear += (weightAdjust * 0.9) + fingerprint.rearPsiBias;

  const score = (bellScore(profile.tirePsiFront - targetFront, 8.5) + bellScore(profile.tirePsiRear - targetRear, 8.5)) / 2;
  const neutral = (bellScore(32 - targetFront, 8.5) + bellScore(32 - targetRear, 8.5)) / 2;
  const gripMultiplier = clamp(1 + ((score - neutral) * 0.11), 0.91, 1.11);
  const tooLow = Math.max(0, 15 - Math.min(profile.tirePsiFront, profile.tirePsiRear));
  const rollingPenaltySec = round(tooLow * 0.012, 3);
  const error = (Math.abs(profile.tirePsiFront - targetFront) + Math.abs(profile.tirePsiRear - targetRear)) / 2;
  const state = error <= 2.2 ? "DIALED IN" : error <= 5 ? "WORKABLE" : "OFF TARGET";
  return { targetFront, targetRear, gripMultiplier, rollingPenaltySec, state };
}

function launchEvaluation(car, stats, profile, fingerprint) {
  const drivetrain = String(stats.drivetrain || car?.base?.drivetrain || "").toUpperCase();
  const redline = Math.max(4000, Number(car?.engine?.redlineRpm || 7000));
  const torqueLoad = clamp((Number(stats.torque || 1) / Math.max(500, Number(stats.weight || 3000))) * 1000, 40, 500);
  const driveBase = drivetrain === "AWD" ? 0.57 : drivetrain === "FWD" ? 0.48 : 0.53;
  const target = clamp((redline * driveBase) - ((torqueLoad - 120) * 2.2) + fingerprint.launchBiasRpm, 1900, redline * 0.82);
  const error = profile.launchRpm - target;
  const abs = Math.abs(error);
  const penalty = clamp((abs / 3500) * 0.15, 0, 0.18);
  const reward = abs < 250 ? 0.035 * (1 - abs / 250) : 0;
  const etModifier = round(penalty - reward, 3);
  const state = error > 550 ? "TOO HIGH" : error < -550 ? "BOGGING" : "CLOSE";
  return { target, etModifier, state };
}

function shiftEvaluation(car, profile, fingerprint) {
  const redline = Math.max(4000, Number(car?.engine?.redlineRpm || 7000));
  const revCut = Math.max(redline, Number(car?.engine?.revCutRpm || redline + 500));
  const peakHpRpm = Number(car?.engine?.peakHpRpm || 0);
  const target = clamp((peakHpRpm > 0 ? peakHpRpm + 250 : redline * 0.96) + fingerprint.shiftBiasRpm, 3500, revCut - 50);
  const error = profile.shiftRpm - target;
  const penaltySec = round(clamp(Math.abs(error) / 8000, 0, 0.16), 3);
  const state = error > 450 ? "SHIFTING LATE" : error < -450 ? "SHIFTING EARLY" : "CLOSE";
  return { target, penaltySec, state };
}

function gearEvaluation(profile, stats, tireGripMultiplier) {
  const gears = profile.boostByGear.map((value) => clamp(value / 100, 0.45, 1));
  const launchPowerFactor = clamp((gears[0] * 0.72) + (gears[1] * 0.28), 0.45, 1);
  const averagePowerFactor = clamp((gears[0] * 0.18) + (gears[1] * 0.18) + (gears[2] * 0.18) + (gears[3] * 0.17) + (gears[4] * 0.15) + (gears[5] * 0.14), 0.45, 1);
  const powerToGrip = (Number(stats.hp || 1) / Math.max(500, Number(stats.weight || 3000))) / Math.max(0.5, Number(stats.grip || 1) * tireGripMultiplier);
  const idealLaunch = clamp(1.06 - (powerToGrip * 0.52), 0.52, 1);
  const tractionMultiplier = clamp(launchPowerFactor / Math.max(0.5, idealLaunch), 0.65, 1.35);
  return { launchPowerFactor, averagePowerFactor, idealLaunch, tractionMultiplier };
}

function buildHints({ profile, hardware, fuelError, timingError, tire, launch, shift, gear, stress, powerLimited = false }) {
  const hints = [];
  if (hardware.boosted && profile.boostPsi > Number(hardware.safeBoostPsi || 0)) hints.push("Boost is above the engine hardware's comfortable window. It may make more power, but repeatability falls.");
  if (powerLimited) hints.push("The engine is near its current power envelope. More boost now gives diminishing returns; stronger engine hardware or a larger engine is the meaningful next step.");
  if (fuelError < -1.2) hints.push("Fueling is lean for the current boost. Add fuel before asking for more boost or timing.");
  else if (fuelError > 2.2) hints.push("Fueling is rich enough to start giving power away.");
  else hints.push("Fueling is in a usable window for this car.");

  if (timingError > 1.1) hints.push("Ignition timing is aggressive for this specific engine. Watch for timing pull.");
  else if (timingError < -1.8) hints.push("Ignition timing is conservative; there may be power left on the table.");

  if (tire.state !== "DIALED IN") hints.push("Tire pressure can still improve launch grip. Front and rear do not necessarily want the same pressure.");
  if (launch.state === "TOO HIGH") hints.push("Launch RPM is pushing the tire harder than this setup wants.");
  if (launch.state === "BOGGING") hints.push("Launch RPM is low enough to give away the first part of the run.");
  if (shift.state !== "CLOSE") hints.push("Shift RPM is outside the strongest part of this engine's current powerband.");
  if (gear.launchPowerFactor < 0.97) hints.push("Boost-by-gear is reducing early power. That can be faster when the car is traction-limited, but slower when it already hooks.");
  if (stress > 0.65) hints.push("This calibration is on the edge: some passes may pull power even when the peak dyno number looks better.");
  return hints.slice(0, 5);
}

function normalizeSystem(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("super")) return "supercharger";
  if (text.includes("turbo")) return "turbo";
  if (text.includes("nitrous") || text.includes("nos")) return "nitrous";
  return null;
}

function bellScore(error, width) {
  const ratio = Number(error || 0) / Math.max(0.001, Number(width || 1));
  return Math.exp(-(ratio * ratio));
}

function stableHash(text) {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
