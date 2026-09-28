const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

export class RaceSimulator {
  constructor(config = {}, rng = Math.random) {
    this.config = config || {};
    this.rng = rng;
  }

  distance(key = '1/4') {
    const row = this.config?.distances?.[key];
    if (!row) throw new Error('Unsupported race distance.');
    return row;
  }

  randomWeather() {
    return structuredClone(this.#weighted(this.config.weather || [{ name: 'Cool & Cloudy', weight: 1, etModifier: 0, mphModifier: 0 }]));
  }

  randomLocation() {
    return structuredClone(this.#weighted(this.config.locations || [{ name: 'Test Strip', weight: 1 }]));
  }

  simulate(context, distanceKey = '1/4', weather = null) {
    const distance = this.distance(distanceKey);
    const condition = weather || this.randomWeather();
    const hp = Math.max(1, Number(context.hp || context.horsepower || 1));
    const torque = Math.max(1, Number(context.torque || 1));
    const weight = Math.max(500, Number(context.weight || context.weightLbs || 500));
    const grip = clamp(Number(context.grip || 1), 0.5, 2);
    const level = Math.max(1, Number(context.level || 1));

    const reaction = this.#reaction(level, torque, weight, Number(context.reactionOffset || 0));
    let et = Number(distance.etFactor) * Math.cbrt(weight / hp);
    et += Number(condition.etModifier || 0) + this.#random(-Number(distance.etRandom || 0), Number(distance.etRandom || 0));
    et = clamp(et, Number(distance.minEt || 1), Number(distance.maxEt || 999));

    if (torque > 300 && weight < 2500) et *= 1.015 + this.#random(0, 0.02);
    else et *= 1 + this.#random(-0.015, 0.025);

    et *= clamp(1 - ((grip - 1) * 0.035), 0.94, 1.06);

    const estimatedGears = 5 + (hp > 400 ? 1 : 0);
    const shiftSkillFactor = clamp(level / 100, 0, 1);
    et += estimatedGears * 0.05 * (1 - (shiftSkillFactor * 0.4)) + this.#random(-0.05, 0.08);

    if (this.rng() < 0.10) et *= 1 + this.#random(0.005, 0.025);

    if (condition.slippery) {
      const ttw = torque / weight;
      if (condition.name === 'Rainy' && ttw > 0.12) et *= 1.01 + this.#random(0, 0.015);
      if (condition.name === 'Snow' && ttw > 0.10) et *= 1.03 + this.#random(0, 0.03);
      if (condition.name === 'Ice' && ttw > 0.08) et *= 1.06 + this.#random(0.02, 0.04);
      if (condition.name === 'Oil Spill' && ttw > 0.09) et *= 1.02 + this.#random(0.01, 0.03);
      if (condition.name === 'Drizzle' || condition.name === 'Misty') et *= 1.005 + this.#random(0, 0.01);
    }

    et = Math.max(Number(distance.minEt || 1), et);

    const baseTrap = 234 * Math.cbrt(hp / weight);
    const trap = clamp(
      (baseTrap * Number(distance.trapMultiplier || 1)) + Number(condition.mphModifier || 0) + this.#random(-1.25, 1.25),
      Number(distance.minTrap || 20),
      Number(distance.maxTrap || 300)
    );

    const foul = reaction < 0;
    const total = foul ? et + 60 + Math.abs(reaction) : et + reaction;

    return {
      reactionTime: round(reaction, 3),
      elapsedTime: round(et, 3),
      trapSpeed: round(trap, 2),
      totalTime: round(total, 3),
      foul,
    };
  }

  #reaction(level, torque, weight, offset) {
    const skillBias = clamp(level / 100, 0, 1);
    const skewed = Math.pow(this.rng(), 2 - skillBias);
    let rt = 0.050 + (0.450 * skewed);
    if (torque > 300 && weight < 2500) rt += this.#random(0, 0.035);
    else rt += this.#random(0, 0.010);
    rt += offset;
    const foulChance = Math.max(0.02, 0.10 - (level * 0.001));
    if (this.rng() < foulChance) rt = -this.#random(0.015, 0.050);
    return rt;
  }

  #weighted(rows) {
    if (!rows.length) return { name: 'Unknown', weight: 1 };
    const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.weight || row.rarityWeight || 0)), 0);
    if (total <= 0) return rows[0];
    let roll = this.rng() * total;
    for (const row of rows) {
      roll -= Math.max(0, Number(row.weight || row.rarityWeight || 0));
      if (roll <= 0) return row;
    }
    return rows[rows.length - 1];
  }

  #random(min, max) {
    return min + (this.rng() * (max - min));
  }
}
