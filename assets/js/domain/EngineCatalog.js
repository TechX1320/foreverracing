export const ENGINE_CURVE_PROFILES = Object.freeze([
  {
    id: "small_economy",
    label: "Small / Economy",
    description: "Modest low-end torque with a smooth, early everyday powerband.",
    startTorqueRatio: 0.54,
    risePower: 0.72,
    midPower: 0.9,
    tailRatio: 0.48,
    startRpm: 1000,
  },
  {
    id: "turbo_street",
    label: "Turbo Street",
    description: "Quick torque rise, broad midrange plateau, then a stronger top-end taper.",
    startTorqueRatio: 0.55,
    risePower: 0.34,
    midPower: 1.7,
    tailRatio: 0.42,
    startRpm: 1000,
  },
  {
    id: "muscle_v8",
    label: "Muscle / Big V8",
    description: "Strong torque almost everywhere with an earlier, wider powerband.",
    startTorqueRatio: 0.76,
    risePower: 0.48,
    midPower: 0.88,
    tailRatio: 0.5,
    startRpm: 750,
  },
  {
    id: "jdm_vtec",
    label: "JDM VTEC / Cam Change",
    description: "Softer low RPM, then a more aggressive climb into the upper powerband.",
    startTorqueRatio: 0.4,
    risePower: 1.75,
    midPower: 0.72,
    tailRatio: 0.72,
    startRpm: 1000,
  },
  {
    id: "high_rev_na",
    label: "High-Rev Naturally Aspirated",
    description: "Progressive torque build with strong breathing and power held near redline.",
    startTorqueRatio: 0.46,
    risePower: 1.18,
    midPower: 0.82,
    tailRatio: 0.7,
    startRpm: 1000,
  },
  {
    id: "motorbike",
    label: "Motorbike / Ultra High-Rev",
    description: "Very little low-end output with a steep climb and strong high-RPM carry.",
    startTorqueRatio: 0.26,
    risePower: 1.7,
    midPower: 0.78,
    tailRatio: 0.8,
    startRpm: 2000,
  },
  {
    id: "diesel_torque",
    label: "Diesel / Low-RPM Torque",
    description: "Very early torque peak with a short usable rev range and heavy top-end falloff.",
    startTorqueRatio: 0.74,
    risePower: 0.28,
    midPower: 1.15,
    tailRatio: 0.26,
    startRpm: 750,
  },
  {
    id: "rotary",
    label: "Rotary / Smooth High-Rev",
    description: "Lower low-end torque with a smooth climb and broad upper-RPM powerband.",
    startTorqueRatio: 0.42,
    risePower: 1.08,
    midPower: 0.9,
    tailRatio: 0.68,
    startRpm: 1000,
  },
  {
    id: "broad_torque",
    label: "Broad Performance",
    description: "Balanced modern performance curve with good low-end and a wide usable midrange.",
    startTorqueRatio: 0.64,
    risePower: 0.52,
    midPower: 1.25,
    tailRatio: 0.56,
    startRpm: 1000,
  },
]);

export function curveProfileDefinition(profileId) {
  return ENGINE_CURVE_PROFILES.find((profile) => profile.id === String(profileId || "")) || ENGINE_CURVE_PROFILES[8];
}

export function deriveHorsepower(rpm, torqueLbFt) {
  const r = Math.max(0, Number(rpm || 0));
  const t = Math.max(0, Number(torqueLbFt || 0));
  if (!r || !t) return 0;
  return (t * r) / 5252;
}

export function normalizePowerCurve(points = []) {
  const normalized = (Array.isArray(points) ? points : [])
    .map((point) => ({
      rpm: Math.max(0, Math.round(Number(point?.rpm || 0))),
      torqueLbFt: Math.max(0, Number(point?.torqueLbFt ?? point?.torque ?? 0)),
    }))
    .filter((point) => point.rpm > 0)
    .sort((a, b) => a.rpm - b.rpm);

  const unique = new Map();
  for (const point of normalized) unique.set(point.rpm, point);
  return [...unique.values()];
}

export function normalizeEngineDefinition(engine = {}) {
  const displacement = Number(engine.displacementLiters ?? engine.displacement ?? 0);
  const aspiration = normalizeAspiration(engine.aspiration);
  const peakBoostPsiRaw = engine.peakBoostPsi ?? engine.factoryPeakBoostPsi ?? engine.output?.peakBoostPsi ?? null;
  const peakBoostPsi = peakBoostPsiRaw == null || peakBoostPsiRaw === "" ? null : Math.max(0, Number(peakBoostPsiRaw));
  const peakHp = Number(engine.peakHp ?? engine.output?.peakHp ?? 0);
  const peakHpRpm = Number(engine.peakHpRpm ?? engine.output?.peakHpRpm ?? 0);
  const peakTorque = Number(engine.peakTorque ?? engine.output?.peakTorque ?? 0);
  const peakTorqueRpm = Number(engine.peakTorqueRpm ?? engine.output?.peakTorqueRpm ?? 0);
  const redlineRpm = Number(engine.redlineRpm ?? engine.output?.redlineRpm ?? 0);
  const revCutRpm = Number(engine.revCutRpm ?? engine.output?.revCutRpm ?? 0);
  const curve = normalizePowerCurve(engine.powerCurve || engine.curve || []);

  return {
    engineId: String(engine.engineId || "").trim(),
    familyId: String(engine.familyId || engine.engineId || "").trim(),
    manufacturer: String(engine.manufacturer || "").trim(),
    familyName: String(engine.familyName || engine.name || "").trim(),
    variantName: String(engine.variantName || "").trim(),
    name: String(engine.name || engine.variantName || engine.familyName || engine.engineId || "Unnamed Engine").trim(),
    displacementLiters: displacement > 0 ? displacement : 0,
    configuration: String(engine.configuration || "").trim(),
    aspiration,
    peakBoostPsi: Number.isFinite(peakBoostPsi) ? peakBoostPsi : null,
    peakHp: peakHp > 0 ? peakHp : 0,
    peakHpRpm: peakHpRpm > 0 ? peakHpRpm : 0,
    peakTorque: peakTorque > 0 ? peakTorque : 0,
    peakTorqueRpm: peakTorqueRpm > 0 ? peakTorqueRpm : 0,
    redlineRpm: redlineRpm > 0 ? redlineRpm : 0,
    revCutRpm: revCutRpm > 0 ? revCutRpm : 0,
    tags: normalizeStringArray(engine.tags),
    curveProfile: normalizeCurveProfile(engine.curveProfile || inferCurveProfile(engine)),
    curveNotes: String(engine.curveNotes || "").trim(),
    powerCurve: curve,
    sourceStatus: String(engine.sourceStatus || (curve.length ? "engine-tool" : "legacy")).trim(),
  };
}

export function engineLabel(engine) {
  const row = normalizeEngineDefinition(engine);
  const identity = [row.manufacturer, row.familyName, row.variantName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" ");
  const title = identity || row.name || row.engineId;
  const output = row.peakHp > 0 && !title.toLowerCase().includes(`${Math.round(row.peakHp)} hp`) ? ` • ${Math.round(row.peakHp)} hp` : "";
  return `${title}${output}`.trim();
}

export function engineToCarSnapshot(engine, existing = {}) {
  const row = normalizeEngineDefinition(engine);
  return {
    ...existing,
    displacementLiters: row.displacementLiters || Number(existing.displacementLiters || 0),
    configuration: row.configuration || String(existing.configuration || ""),
    aspiration: row.aspiration || String(existing.aspiration || ""),
    peakBoostPsi: row.peakBoostPsi ?? existing.peakBoostPsi ?? null,
    peakHp: row.peakHp || Number(existing.peakHp || 0),
    peakHpRpm: row.peakHpRpm || Number(existing.peakHpRpm || 0),
    peakTorque: row.peakTorque || Number(existing.peakTorque || 0),
    peakTorqueRpm: row.peakTorqueRpm || Number(existing.peakTorqueRpm || 0),
    redlineRpm: row.redlineRpm || Number(existing.redlineRpm || 0),
    revCutRpm: row.revCutRpm || Number(existing.revCutRpm || 0),
    curveProfile: row.curveProfile || String(existing.curveProfile || ""),
    curveNotes: row.curveNotes || String(existing.curveNotes || ""),
    powerCurve: row.powerCurve.length ? normalizePowerCurve(row.powerCurve) : normalizePowerCurve(existing.powerCurve || []),
  };
}

export function generateBaselineCurve(engine) {
  const row = normalizeEngineDefinition(engine);
  const profile = curveProfileDefinition(row.curveProfile);
  const limiter = Math.max(row.revCutRpm || 0, row.redlineRpm || 0, row.peakHpRpm || 0, row.peakTorqueRpm || 0, 6500);
  const start = Math.min(
    Math.max(500, Number(profile.startRpm || 1000)),
    Math.max(500, Math.floor((row.peakTorqueRpm || 3000) / 3))
  );
  const rpms = new Set();
  for (let rpm = Math.round(start / 250) * 250; rpm <= limiter; rpm += 500) rpms.add(rpm);
  [row.peakTorqueRpm, row.peakHpRpm, row.redlineRpm, row.revCutRpm].filter((rpm) => rpm > 0).forEach((rpm) => rpms.add(Math.round(rpm)));

  const peakTorque = Math.max(1, row.peakTorque || (row.peakHp > 0 && row.peakHpRpm > 0 ? (row.peakHp * 5252) / row.peakHpRpm : 150));
  const tqRpm = Math.max(start, row.peakTorqueRpm || Math.round(limiter * 0.55));
  const hpRpm = Math.max(tqRpm, row.peakHpRpm || Math.round(limiter * 0.85));
  const requiredTorqueAtHp = row.peakHp > 0 && hpRpm > 0 ? (row.peakHp * 5252) / hpRpm : peakTorque * 0.82;

  return [...rpms].sort((a, b) => a - b).map((rpm) => {
    let torque;
    if (rpm <= tqRpm) {
      const ratio = Math.max(0, Math.min(1, (rpm - start) / Math.max(1, tqRpm - start)));
      torque = peakTorque * (
        profile.startTorqueRatio +
        ((1 - profile.startTorqueRatio) * Math.pow(ratio, profile.risePower))
      );
    } else if (rpm <= hpRpm) {
      const ratio = (rpm - tqRpm) / Math.max(1, hpRpm - tqRpm);
      const shaped = Math.pow(Math.max(0, Math.min(1, ratio)), profile.midPower);
      torque = peakTorque + ((requiredTorqueAtHp - peakTorque) * shaped);
    } else {
      const endTorque = Math.max(1, requiredTorqueAtHp * profile.tailRatio);
      const ratio = (rpm - hpRpm) / Math.max(1, limiter - hpRpm);
      torque = requiredTorqueAtHp + ((endTorque - requiredTorqueAtHp) * Math.min(1, ratio));
    }

    if (row.peakHp > 0 && rpm > 0) {
      torque = Math.min(torque, (row.peakHp * 5252) / rpm);
    }
    if (rpm === tqRpm) torque = peakTorque;
    if (rpm === hpRpm) torque = requiredTorqueAtHp;
    return { rpm, torqueLbFt: Math.max(1, Math.round(torque * 10) / 10) };
  });
}

export function validateEngineCurve(engine) {
  const row = normalizeEngineDefinition(engine);
  const curve = row.powerCurve;
  const issues = [];
  if (!row.engineId) issues.push("Engine ID is required.");
  if (!row.familyId) issues.push("Family ID is required.");
  if (!row.configuration) issues.push("Engine configuration is required.");
  if (!(row.displacementLiters > 0)) issues.push("Displacement must be greater than zero.");
  if (!(row.peakHp > 0 && row.peakHpRpm > 0)) issues.push("Peak horsepower and RPM are required.");
  if (!(row.peakTorque > 0 && row.peakTorqueRpm > 0)) issues.push("Peak torque and RPM are required.");
  if (!(row.redlineRpm > 0 && row.revCutRpm >= row.redlineRpm)) issues.push("Rev cut must be at or above redline.");
  if (curve.length < 3) issues.push("Power curve needs at least three RPM points.");

  if (curve.length) {
    const hpPeak = curve
      .map((point) => ({ ...point, hp: deriveHorsepower(point.rpm, point.torqueLbFt) }))
      .sort((a, b) => b.hp - a.hp)[0];
    const tqPeak = [...curve].sort((a, b) => b.torqueLbFt - a.torqueLbFt)[0];
    if (row.peakHp > 0 && hpPeak && Math.abs(hpPeak.hp - row.peakHp) > Math.max(5, row.peakHp * 0.04)) {
      issues.push(`Curve peak HP (${hpPeak.hp.toFixed(1)}) does not closely match the engine peak HP (${row.peakHp}).`);
    }
    if (row.peakTorque > 0 && tqPeak && Math.abs(tqPeak.torqueLbFt - row.peakTorque) > Math.max(5, row.peakTorque * 0.04)) {
      issues.push(`Curve peak torque (${tqPeak.torqueLbFt.toFixed(1)}) does not closely match the engine peak torque (${row.peakTorque}).`);
    }
  }

  return issues;
}

export function normalizeCurveProfile(value) {
  const id = String(value || "").trim();
  return ENGINE_CURVE_PROFILES.some((profile) => profile.id === id) ? id : "broad_torque";
}

export function inferCurveProfile(engine = {}) {
  const tags = normalizeStringArray(engine.tags).map((tag) => tag.toLowerCase());
  const aspiration = normalizeAspiration(engine.aspiration).toLowerCase();
  const configuration = String(engine.configuration || "").toLowerCase();
  const redline = Number(engine.redlineRpm ?? engine.output?.redlineRpm ?? 0);
  const displacement = Number(engine.displacementLiters ?? engine.displacement ?? 0);

  if (tags.some((tag) => tag.includes("rotary")) || configuration.includes("rotary")) return "rotary";
  if (tags.some((tag) => tag.includes("diesel")) || aspiration.includes("diesel")) return "diesel_torque";
  if (tags.some((tag) => tag.includes("motorbike") || tag.includes("motorcycle")) || redline >= 11000) return "motorbike";
  if (tags.some((tag) => tag.includes("vtec") || tag.includes("cam_change"))) return "jdm_vtec";
  if (tags.some((tag) => tag.includes("muscle")) || (configuration.includes("v8") && displacement >= 4)) return "muscle_v8";
  if (aspiration.includes("turbo")) return "turbo_street";
  if (tags.some((tag) => tag.includes("high_rpm")) || redline >= 7800) return "high_rev_na";
  if (displacement > 0 && displacement <= 2) return "small_economy";
  return "broad_torque";
}

export function normalizeAspiration(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (lower === "na" || lower === "n/a" || lower === "naturally aspirated") return "Naturally Aspirated";
  if (lower === "turbo diesel") return "Turbo Diesel";
  if (lower === "twin turbo" || lower === "twin-turbo") return "Twin Turbo";
  if (lower === "supercharged") return "Supercharged";
  if (lower === "turbo") return "Turbo";
  return text;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  return [...new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean))];
}
