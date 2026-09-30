const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));

export function normalizePowerLimits(engine = {}, baseHp = 0) {
  const source = engine?.powerLimits && typeof engine.powerLimits === "object" ? engine.powerLimits : {};
  const fallback = suggestedPowerLimits(engine, baseHp);
  const values = {
    stockHp: positive(source.stockHp ?? source.stock ?? fallback.stockHp),
    kit1Hp: positive(source.kit1Hp ?? source.kit1 ?? fallback.kit1Hp),
    kit2Hp: positive(source.kit2Hp ?? source.kit2 ?? fallback.kit2Hp),
    kit3Hp: positive(source.kit3Hp ?? source.kit3 ?? fallback.kit3Hp),
    kit4Hp: positive(source.kit4Hp ?? source.kit4 ?? source.maxHp ?? fallback.kit4Hp),
  };
  values.stockHp = Math.max(values.stockHp, Math.max(1, Number(baseHp || engine?.peakHp || 1)));
  values.kit1Hp = Math.max(values.stockHp, values.kit1Hp);
  values.kit2Hp = Math.max(values.kit1Hp, values.kit2Hp);
  values.kit3Hp = Math.max(values.kit2Hp, values.kit3Hp);
  values.kit4Hp = Math.max(values.kit3Hp, values.kit4Hp);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.round(value)]));
}

export function suggestedPowerLimits(engine = {}, baseHp = 0) {
  const hp = Math.max(1, Number(baseHp || engine?.peakHp || 200));
  const displacement = Math.max(0.5, Number(engine?.displacementLiters || 2));
  const configuration = String(engine?.configuration || "").toLowerCase();
  const aspiration = String(engine?.aspiration || "").toLowerCase();
  const rotary = configuration.includes("rotary");
  const diesel = aspiration.includes("diesel");
  const boosted = aspiration.includes("turbo") || aspiration.includes("super");

  let maxHp;
  if (rotary) maxHp = Math.max(hp * 4.2, displacement * 760);
  else if (diesel) maxHp = Math.max(hp * 2.8, displacement * 230);
  else if (boosted) maxHp = Math.max(hp * 3.1, displacement * 340);
  else maxHp = Math.max(hp * 3.25, displacement * 300);

  maxHp = clamp(maxHp, hp * 1.8, 2800);
  const stock = Math.max(hp * 1.35, maxHp * 0.38);
  return {
    stockHp: Math.round(stock),
    kit1Hp: Math.round(Math.max(stock, maxHp * 0.54)),
    kit2Hp: Math.round(Math.max(stock, maxHp * 0.69)),
    kit3Hp: Math.round(Math.max(stock, maxHp * 0.84)),
    kit4Hp: Math.round(maxHp),
  };
}

export function enginePowerEnvelope(car, installedSpecs = []) {
  const specs = (Array.isArray(installedSpecs) ? installedSpecs : []).filter(Boolean);
  const engine = car?.engine || {};
  const baseHp = Math.max(1, Number(car?.base?.hp || engine?.peakHp || 1));
  const baseTorque = Math.max(1, Number(car?.base?.torque || engine?.peakTorque || 1));
  const limits = normalizePowerLimits(engine, baseHp);
  const engineKitLevel = specs.reduce((max, part) => Math.max(max, Number(part?.engineKit?.level || 0)), 0);
  const key = engineKitLevel >= 4 ? "kit4Hp" : engineKitLevel === 3 ? "kit3Hp" : engineKitLevel === 2 ? "kit2Hp" : engineKitLevel === 1 ? "kit1Hp" : "stockHp";
  let capacityHp = Number(limits[key] || limits.kit4Hp);

  const reinforcement = structuralSupportScore(specs);
  if (reinforcement > 0 && engineKitLevel < 4) {
    const nextKey = engineKitLevel >= 3 ? "kit4Hp" : engineKitLevel === 2 ? "kit3Hp" : engineKitLevel === 1 ? "kit2Hp" : "kit1Hp";
    const next = Number(limits[nextKey] || capacityHp);
    capacityHp += (next - capacityHp) * Math.min(0.35, reinforcement * 0.08);
  }

  const hpRatio = Math.max(1, capacityHp / baseHp);
  const capacityTorque = Math.max(baseTorque * 1.35, baseTorque * hpRatio * 1.08);
  return {
    engineKitLevel,
    limits,
    capacityHp: Math.round(capacityHp),
    capacityTorque: Math.round(capacityTorque),
    softStartHp: Math.round(capacityHp * 0.82),
    softStartTorque: Math.round(capacityTorque * 0.82),
  };
}

export function applyBuildPartEffect(stats, effect, part) {
  const stat = String(effect?.stat || "");
  if (!(stat in stats)) return stats;
  const value = Number(effect?.value || 0);
  const op = String(effect?.op || "add");
  const scale = powerEffectScale(part, stat);
  if ((stat === "hp" || stat === "torque") && scale <= 0) return stats;

  if (op === "mul") {
    const multiplier = (stat === "hp" || stat === "torque")
      ? 1 + ((value - 1) * scale)
      : value;
    stats[stat] *= multiplier;
  } else {
    stats[stat] += (stat === "hp" || stat === "torque") ? value * scale : value;
  }
  return stats;
}

export function powerEffectScale(part = {}, stat = "hp") {
  if (stat !== "hp" && stat !== "torque") return 1;
  const explicit = Number(part?.powerModel?.effectScale ?? part?.powerEffectScale);
  if (Number.isFinite(explicit)) return clamp(explicit, 0, 1.5);

  const category = String(part?.categoryKey || "").toLowerCase();
  const sub = String(part?.subCategory || "").toLowerCase();
  const id = String(part?.catalogId || "").toLowerCase();

  if (category === "engine_kit") return 0;
  if (category === "fuel") return sub.includes("flex") ? 0.25 : 0.12;
  if (category === "ecu") {
    if (part?.tuning?.homeGarage || sub.includes("standalone")) return 0;
    if (sub.includes("boost")) return 0.15;
    if (sub.includes("launch")) return 0;
    return Number(part?.buildStage || 1) <= 2 ? 0.5 : 0.3;
  }
  if (category === "engine") {
    if (/rod|piston|block|spring|seal|rotor|eccentric/.test(sub + " " + id)) return 0.08;
    if (/cam|head|port|valve/.test(sub + " " + id)) return 0.7;
    return 0.35;
  }
  if (category === "forced_induction") {
    const role = String(part?.forcedInduction?.role || "");
    if (role === "component") return 0.8;
    return 1;
  }
  if (category === "intake" || category === "exhaust") return 0.85;
  return 1;
}

export function limitEngineOutput(rawStats, envelope, { overdrive = 0 } = {}) {
  const extra = clamp(overdrive, 0, 0.06);
  const hpCap = Number(envelope?.capacityHp || rawStats?.hp || 1) * (1 + extra);
  const tqCap = Number(envelope?.capacityTorque || rawStats?.torque || 1) * (1 + extra);
  const hp = softLimit(Number(rawStats?.hp || 1), hpCap, 0.82);
  const torque = softLimit(Number(rawStats?.torque || 1), tqCap, 0.82);
  return {
    ...rawStats,
    hp: Math.round(Math.max(1, hp)),
    torque: Math.round(Math.max(1, torque)),
    powerLimit: {
      capacityHp: Math.round(hpCap),
      capacityTorque: Math.round(tqCap),
      rawHp: Math.round(Number(rawStats?.hp || 1)),
      rawTorque: Math.round(Number(rawStats?.torque || 1)),
      hpLimited: Number(rawStats?.hp || 1) > hp + 1,
      torqueLimited: Number(rawStats?.torque || 1) > torque + 1,
    },
  };
}

export function softLimit(value, capacity, startRatio = 0.82) {
  const raw = Math.max(0, Number(value || 0));
  const cap = Math.max(1, Number(capacity || 1));
  const start = cap * clamp(startRatio, 0.5, 0.95);
  if (raw <= start) return raw;
  const span = Math.max(1, cap - start);
  return start + span * (1 - Math.exp(-(raw - start) / span));
}

function structuralSupportScore(specs) {
  let score = 0;
  for (const part of specs) {
    if (String(part?.categoryKey || "") !== "engine") continue;
    const sub = String(part?.subCategory || "").toLowerCase();
    if (/rod|piston|block|spring|seal|rotor|eccentric/.test(sub)) score += 1;
  }
  return score;
}

function positive(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 1;
}
