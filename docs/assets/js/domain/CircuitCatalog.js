import { performanceClassFromIndex } from "./PerformanceIndex.js";

export const CIRCUIT_SCHEMA_VERSION = 1;
export const CIRCUIT_MAX_RACES = 50;
export const CIRCUIT_DISTANCES = Object.freeze(["1/4", "1/2", "1"]);
export const CIRCUIT_LOSS_RULES = Object.freeze(["retry_race", "reset_circuit"]);

const arrayStrings = (value) => [...new Set((Array.isArray(value) ? value : [])
  .map((item) => String(item || "").trim())
  .filter(Boolean))];

export function normalizeCircuitDefinition(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const races = (Array.isArray(source.races) ? source.races : [])
    .slice(0, CIRCUIT_MAX_RACES)
    .map((race, index) => normalizeCircuitRace(race, index));

  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    circuitId: String(source.circuitId || "").trim(),
    name: String(source.name || "Untitled Circuit").trim(),
    description: String(source.description || "").trim(),
    category: String(source.category || (source.required ? "progression" : "optional")).trim().toLowerCase(),
    required: source.required === true,
    repeatable: source.repeatable !== false,
    lossRule: CIRCUIT_LOSS_RULES.includes(String(source.lossRule || "")) ? String(source.lossRule) : "retry_race",
    unlock: {
      requiresClasses: arrayStrings(source.unlock?.requiresClasses),
      requiresCircuitIds: arrayStrings(source.unlock?.requiresCircuitIds),
    },
    entryRules: {
      allowedClasses: arrayStrings(source.entryRules?.allowedClasses),
      minPerformanceIndex: numberOrNull(source.entryRules?.minPerformanceIndex),
      maxPerformanceIndex: numberOrNull(source.entryRules?.maxPerformanceIndex),
      buildTypes: (Array.isArray(source.entryRules?.buildTypes) ? source.entryRules.buildTypes : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 4),
      drivetrains: arrayStrings(source.entryRules?.drivetrains).map((value) => value.toUpperCase()),
      allowedCarIds: arrayStrings(source.entryRules?.allowedCarIds),
    },
    recommendation: normalizeRecommendation(source.recommendation),
    completion: {
      credits: Math.max(0, Math.round(Number(source.completion?.credits || 0))),
      exp: Math.max(0, Math.round(Number(source.completion?.exp || 0))),
      rep: Math.max(0, Math.round(Number(source.completion?.rep || 0))),
      unlockClass: String(source.completion?.unlockClass || "").trim().toUpperCase() || null,
      unlockCircuitIds: arrayStrings(source.completion?.unlockCircuitIds),
    },
    races,
  };
}

export function normalizeCircuitRace(input = {}, index = 0) {
  const source = input && typeof input === "object" ? input : {};
  const distance = CIRCUIT_DISTANCES.includes(String(source.distance || "")) ? String(source.distance) : "1/4";
  return {
    raceId: String(source.raceId || `race_${index + 1}`).trim(),
    name: String(source.name || `Race ${index + 1}`).trim(),
    type: String(source.type || "regular").trim().toLowerCase() === "boss" ? "boss" : "regular",
    distance,
    location: String(source.location || "Local Test & Tune").trim(),
    weather: String(source.weather || "Cool & Cloudy").trim(),
    recommendation: normalizeRecommendation(source.recommendation),
    opponent: {
      name: String(source.opponent?.name || `Opponent ${index + 1}`).trim(),
      carCatalogId: String(source.opponent?.carCatalogId || "").trim(),
      level: Math.max(1, Math.round(Number(source.opponent?.level || 1))),
      buildType: Math.max(1, Math.min(4, Math.round(Number(source.opponent?.buildType || 1)))),
      paintColor: String(source.opponent?.paintColor || "").trim() || null,
      stats: {
        hp: Math.max(1, Number(source.opponent?.stats?.hp || 1)),
        torque: Math.max(1, Number(source.opponent?.stats?.torque || 1)),
        weight: Math.max(500, Number(source.opponent?.stats?.weight || 500)),
        grip: Math.max(0.5, Number(source.opponent?.stats?.grip || 1)),
        drivetrain: String(source.opponent?.stats?.drivetrain || "FWD").trim().toUpperCase(),
      },
    },
    rewards: {
      credits: Math.max(0, Math.round(Number(source.rewards?.credits || 0))),
      exp: Math.max(0, Math.round(Number(source.rewards?.exp || 0))),
      rep: Math.max(0, Math.round(Number(source.rewards?.rep || 0))),
    },
  };
}

export function validateCircuitDefinition(input) {
  const circuit = normalizeCircuitDefinition(input);
  const errors = [];
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/i.test(circuit.circuitId)) {
    errors.push("Circuit ID must be 3-64 letters, numbers, underscores or hyphens.");
  }
  if (!circuit.name) errors.push("Circuit name is required.");
  if (!circuit.races.length) errors.push("A Circuit needs at least one race.");
  if (circuit.races.length > CIRCUIT_MAX_RACES) errors.push(`A Circuit can contain at most ${CIRCUIT_MAX_RACES} races.`);
  const ids = new Set();
  circuit.races.forEach((race, index) => {
    if (!race.raceId) errors.push(`Race ${index + 1} needs a raceId.`);
    if (ids.has(race.raceId)) errors.push(`Duplicate raceId: ${race.raceId}.`);
    ids.add(race.raceId);
    if (!race.opponent.carCatalogId) errors.push(`Race ${index + 1} needs opponent.carCatalogId.`);
    if (!CIRCUIT_DISTANCES.includes(race.distance)) errors.push(`Race ${index + 1} uses an unsupported distance.`);
  });
  return { ok: errors.length === 0, errors, circuit };
}

export function circuitEntryStatus(circuitInput, player = {}, car = null) {
  const circuit = normalizeCircuitDefinition(circuitInput);
  if (!car) return { ok: false, reasons: ["Select a Current Car first."] };
  const reasons = [];
  const unlockedClasses = new Set((player?.progression?.unlockedClasses || ["D"]).map((value) => String(value).toUpperCase()));
  const completed = player?.circuits?.progress || {};

  for (const requiredClass of circuit.unlock.requiresClasses) {
    if (!unlockedClasses.has(requiredClass.toUpperCase())) reasons.push(`Unlock class ${requiredClass.toUpperCase()} first.`);
  }
  for (const circuitId of circuit.unlock.requiresCircuitIds) {
    if (!completed?.[circuitId]?.completed) reasons.push(`Complete ${circuitId} first.`);
  }

  const pi = Number(car.performanceIndex || 0);
  const cls = String(car.performanceClass || performanceClassFromIndex(pi)).toUpperCase();
  if (circuit.entryRules.allowedClasses.length && !circuit.entryRules.allowedClasses.includes(cls)) {
    reasons.push(`Requires class ${circuit.entryRules.allowedClasses.join("/")}; current car is ${cls}.`);
  }
  if (circuit.entryRules.minPerformanceIndex != null && pi < circuit.entryRules.minPerformanceIndex) {
    reasons.push(`Requires at least PI ${circuit.entryRules.minPerformanceIndex}.`);
  }
  if (circuit.entryRules.maxPerformanceIndex != null && pi > circuit.entryRules.maxPerformanceIndex) {
    reasons.push(`Maximum PI is ${circuit.entryRules.maxPerformanceIndex}.`);
  }
  const buildType = Number(car.buildStage || 1);
  if (circuit.entryRules.buildTypes.length && !circuit.entryRules.buildTypes.includes(buildType)) {
    reasons.push(`Build Type ${buildType} is not eligible.`);
  }
  const drivetrain = String(car.base?.drivetrain || car.derived?.drivetrain || "").toUpperCase();
  if (circuit.entryRules.drivetrains.length && !circuit.entryRules.drivetrains.includes(drivetrain)) {
    reasons.push(`Requires drivetrain: ${circuit.entryRules.drivetrains.join("/")}.`);
  }
  if (circuit.entryRules.allowedCarIds.length && !circuit.entryRules.allowedCarIds.includes(String(car.catalogId || ""))) {
    reasons.push("This car is not eligible for the event.");
  }
  return { ok: reasons.length === 0, reasons };
}

function normalizeRecommendation(input = {}) {
  return {
    class: String(input?.class || "").trim().toUpperCase() || null,
    performanceIndex: numberOrNull(input?.performanceIndex),
    etSeconds: numberOrNull(input?.etSeconds),
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
