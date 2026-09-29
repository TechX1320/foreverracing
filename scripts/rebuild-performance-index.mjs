import fs from "node:fs/promises";
import { benchmarkPerformance } from "../assets/js/domain/PerformanceIndex.js";

const checkOnly = process.argv.includes("--check");
const carsUrl = new URL("../data/catalog/cars.json", import.meta.url);
const racingUrl = new URL("../data/config/racing.json", import.meta.url);
const [cars, racingConfig] = await Promise.all([
  fs.readFile(carsUrl, "utf8").then(JSON.parse),
  fs.readFile(racingUrl, "utf8").then(JSON.parse),
]);

let changed = false;
for (const car of cars) {
  const benchmark = benchmarkPerformance(car.base, racingConfig);
  const prior = car.benchmark || {};
  const same = Number(prior.quarterMileEt) === benchmark.quarterMileEt
    && Number(prior.performanceIndex) === benchmark.performanceIndex
    && Number(prior.passes) === benchmark.passes
    && Number(prior.version) === benchmark.version;
  if (!same) {
    changed = true;
    if (checkOnly) {
      throw new Error(`${car.displayName || car.model}: stored benchmark ${JSON.stringify(prior)} does not match ${JSON.stringify(benchmark)}`);
    }
    car.benchmark = benchmark;
  }
  console.log(`${car.displayName || car.model}: ${benchmark.quarterMileEt.toFixed(3)} s / PI ${benchmark.performanceIndex}`);
}

if (!checkOnly && changed) {
  await fs.writeFile(carsUrl, JSON.stringify(cars, null, 2) + "\n");
}
if (!changed) console.log("Stored Performance Index benchmarks are current.");
