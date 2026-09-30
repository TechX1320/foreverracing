import { RaceSimulator } from "./RaceSimulator.js";

export const PERFORMANCE_INDEX_VERSION = 1;
export const PERFORMANCE_INDEX_PASSES = 51;
export const PERFORMANCE_INDEX_BASE_ET = 20;
export const PERFORMANCE_INDEX_PER_TENTH = 8;

export const PERFORMANCE_CLASS_THRESHOLDS = Object.freeze({
  D: 0,
  C: 450,
  B: 600,
  A: 750,
  S: 900,
  X: 1100,
});

export const PERFORMANCE_CLASS_ORDER = Object.freeze(["D", "C", "B", "A", "S", "X"]);

export function performanceClassRank(className) {
  const index = PERFORMANCE_CLASS_ORDER.indexOf(String(className || "").toUpperCase());
  return index < 0 ? -1 : index;
}

export function performanceClassThreshold(className) {
  const key = String(className || "").toUpperCase();
  return Number(PERFORMANCE_CLASS_THRESHOLDS[key] ?? 0);
}

export function benchmarkPerformance(context, racingConfig = {}, { passes = PERFORMANCE_INDEX_PASSES, seed = 0x46525049 } = {}) {
  const rows = [];
  const condition = { name: "Benchmark", etModifier: 0, mphModifier: 0, weight: 1 };
  const rng = seededRandom(seed >>> 0);
  const simulator = new RaceSimulator(racingConfig, rng);
  const sampleCount = Math.max(3, Number(passes || PERFORMANCE_INDEX_PASSES) | 0);

  for (let i = 0; i < sampleCount; i += 1) {
    rows.push(simulator.simulate({
      hp: Number(context?.hp || context?.horsepower || 1),
      torque: Number(context?.torque || 1),
      weight: Number(context?.weight || context?.weightLbs || 500),
      grip: Number(context?.grip || 1),
      drivetrain: String(context?.drivetrain || ""),
      level: 100,
      allowFoul: false,
      reactionOffset: 0,
      tuning: context?.tuning && typeof context.tuning === "object" ? context.tuning : null,
    }, "1/4", condition));
  }

  const ets = rows.map((row) => Number(row.elapsedTime || 0)).sort((a, b) => a - b);
  const traps = rows.map((row) => Number(row.trapSpeed || 0)).sort((a, b) => a - b);
  const medianEt = round3(median(ets));
  const medianTrap = round2(median(traps));

  return {
    quarterMileEt: medianEt,
    quarterMileTrap: medianTrap,
    performanceIndex: performanceIndexFromEt(medianEt),
    passes: sampleCount,
    version: PERFORMANCE_INDEX_VERSION,
  };
}

export function performanceIndexForCar(car, racingConfig = {}) {
  const context = { ...(car?.derived || car?.base || car || {}) };
  if (car?.tuningRuntime && typeof car.tuningRuntime === "object") context.tuning = car.tuningRuntime;
  return benchmarkPerformance(context, racingConfig);
}

export function performanceIndexFromEt(et) {
  const value = (PERFORMANCE_INDEX_BASE_ET - Number(et || PERFORMANCE_INDEX_BASE_ET)) * (PERFORMANCE_INDEX_PER_TENTH * 10);
  return Math.max(0, Math.round(value));
}

export function performanceClassFromIndex(index) {
  const pi = Math.max(0, Number(index || 0));
  if (pi < 450) return "D";
  if (pi < 600) return "C";
  if (pi < 750) return "B";
  if (pi < 900) return "A";
  if (pi < 1100) return "S";
  return "X";
}

function median(values) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
