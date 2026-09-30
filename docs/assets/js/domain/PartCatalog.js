const ACTIVE_STATUSES = new Set(["active", "scheduled", "draft", "deprecated", "retired"]);

export function normalizePartDefinition(source = {}) {
  const part = structuredClone(source && typeof source === "object" ? source : {});
  part.catalogId = String(part.catalogId || "").trim();
  part.name = String(part.name || "").trim();
  part.manufacturer = String(part.manufacturer || "").trim();
  part.description = String(part.description || "").trim();
  part.category = String(part.category || "Performance").trim();
  part.categoryKey = String(part.categoryKey || "performance").trim().toLowerCase();
  part.slot = String(part.slot || part.categoryKey || "performance").trim().toLowerCase();
  part.buildStage = clampInt(part.buildStage || 2, 1, 4);
  part.simpleTier = part.buildStage === 1 ? clampInt(part.simpleTier || 1, 1, 3) : null;
  part.persistentFromStage = clampInt(part.persistentFromStage || part.buildStage, part.buildStage, 4);
  part.requiredForStageProgression = part.requiredForStageProgression !== false;
  part.price = Math.max(0, Math.round(Number(part.price || 0)));
  part.tags = uniqueList(part.tags);
  part.effects = normalizeEffects(part.effects);
  part.compatibility = normalizeCompatibility(part.compatibility);
  part.requires = {
    allTags: uniqueList(part.requires?.allTags),
    anyPartIds: uniqueList(part.requires?.anyPartIds),
  };
  part.conflicts = {
    tags: uniqueList(part.conflicts?.tags),
    partIds: uniqueList(part.conflicts?.partIds),
  };
  part.lifecycle = normalizeLifecycle(part.lifecycle);
  if (part.requiredEngineKit != null) part.requiredEngineKit = Math.max(0, Math.round(Number(part.requiredEngineKit || 0)));
  return part;
}

export function normalizeCompatibility(source = {}) {
  return {
    engineIds: uniqueList(source?.engineIds),
    carCatalogIds: uniqueList(source?.carCatalogIds),
    excludeCarCatalogIds: uniqueList(source?.excludeCarCatalogIds),
    buildStages: uniqueNumbers(source?.buildStages).filter((value) => value >= 1 && value <= 4),
    aspiration: uniqueList(source?.aspiration),
    engineConfigurations: uniqueList(source?.engineConfigurations),
    tagsRequired: uniqueList(source?.tagsRequired),
    tagsBlocked: uniqueList(source?.tagsBlocked),
  };
}

export function normalizeLifecycle(source = {}) {
  const requested = String(source?.status || "active").trim().toLowerCase();
  const status = ACTIVE_STATUSES.has(requested) ? requested : "active";
  return {
    status,
    availableFrom: cleanDate(source?.availableFrom),
    deprecatedAt: cleanDate(source?.deprecatedAt),
    replacementPartId: String(source?.replacementPartId || "").trim() || null,
    retireFromStore: source?.retireFromStore === true || status === "deprecated" || status === "retired",
  };
}

export function partLifecycleState(part, at = Date.now()) {
  const lifecycle = normalizeLifecycle(part?.lifecycle);
  if (lifecycle.status === "draft") return "draft";
  if (lifecycle.status === "deprecated") return "deprecated";
  if (lifecycle.status === "retired") return "retired";
  if (lifecycle.status === "scheduled") {
    const time = lifecycle.availableFrom ? Date.parse(lifecycle.availableFrom) : NaN;
    return Number.isFinite(time) && time <= Number(at) ? "active" : "scheduled";
  }
  return "active";
}

export function partStoreAvailable(part, at = Date.now()) {
  return partLifecycleState(part, at) === "active";
}

export function partCompatibility(part, car) {
  const compatibility = normalizeCompatibility(part?.compatibility);
  const engineId = String(car?.engineId || car?.factoryEngineId || "").trim();
  const carId = String(car?.catalogId || "").trim();
  const stage = Number(car?.buildStage || 1);
  const aspiration = String(car?.engine?.aspiration || "").trim().toLowerCase();
  const configuration = String(car?.engine?.configuration || "").trim().toLowerCase();
  const engineTags = new Set(uniqueList(car?.engine?.tags).map((value) => value.toLowerCase()));

  if (compatibility.excludeCarCatalogIds.includes(carId)) {
    return { ok: false, reason: "This part is explicitly blocked for this car." };
  }
  if (compatibility.carCatalogIds.length && !compatibility.carCatalogIds.includes(carId)) {
    return { ok: false, reason: "This part is not authored for this car." };
  }
  if (compatibility.engineIds.length && !compatibility.engineIds.includes(engineId)) {
    return { ok: false, reason: "This part is not compatible with the installed engine." };
  }
  if (compatibility.buildStages.length && !compatibility.buildStages.includes(stage)) {
    return { ok: false, reason: "This part is not compatible with the current Build Type." };
  }
  if (compatibility.aspiration.length && !compatibility.aspiration.some((value) => value.toLowerCase() === aspiration)) {
    return { ok: false, reason: "This part does not match the engine aspiration." };
  }
  if (compatibility.engineConfigurations.length && !compatibility.engineConfigurations.some((value) => value.toLowerCase() === configuration)) {
    return { ok: false, reason: "This part does not match the engine configuration." };
  }
  for (const tag of compatibility.tagsRequired) {
    if (!engineTags.has(tag.toLowerCase())) return { ok: false, reason: `Engine tag required: ${tag}.` };
  }
  for (const tag of compatibility.tagsBlocked) {
    if (engineTags.has(tag.toLowerCase())) return { ok: false, reason: `Blocked engine tag: ${tag}.` };
  }
  return { ok: true, reason: "" };
}

export function partRuleCompatibility(part, installedParts = []) {
  const normalized = normalizePartDefinition(part);
  const installed = (Array.isArray(installedParts) ? installedParts : []).filter(Boolean);
  const installedIds = new Set(installed.map((row) => String(row.catalogId || "")));
  const installedTags = new Set(installed.flatMap((row) => uniqueList(row.tags)).map((tag) => tag.toLowerCase()));

  if (normalized.requires.anyPartIds.length && !normalized.requires.anyPartIds.some((id) => installedIds.has(id))) {
    return { ok: false, reason: `Requires one of: ${normalized.requires.anyPartIds.join(", ")}.` };
  }
  for (const tag of normalized.requires.allTags) {
    if (!installedTags.has(tag.toLowerCase())) return { ok: false, reason: `Requires installed part tag: ${tag}.` };
  }
  const conflictId = normalized.conflicts.partIds.find((id) => installedIds.has(id));
  if (conflictId) return { ok: false, reason: `Conflicts with installed part: ${conflictId}.` };
  const conflictTag = normalized.conflicts.tags.find((tag) => installedTags.has(tag.toLowerCase()));
  if (conflictTag) return { ok: false, reason: `Conflicts with installed part tag: ${conflictTag}.` };
  return { ok: true, reason: "" };
}

export function applyPartEffects(baseStats, effects = []) {
  const stats = {
    hp: Number(baseStats?.hp || 1),
    torque: Number(baseStats?.torque || 1),
    weight: Number(baseStats?.weight || 500),
    grip: Number(baseStats?.grip || 1),
  };
  for (const effect of normalizeEffects(effects)) {
    if (!(effect.stat in stats)) continue;
    if (effect.op === "mul") stats[effect.stat] *= effect.value;
    else stats[effect.stat] += effect.value;
  }
  return {
    hp: Math.round(Math.max(1, stats.hp)),
    torque: Math.round(Math.max(1, stats.torque)),
    weight: Math.round(Math.max(500, stats.weight)),
    grip: Math.round(Math.max(0.5, stats.grip) * 1000) / 1000,
  };
}

export function normalizeEffects(effects = []) {
  const allowedStats = new Set(["hp", "torque", "weight", "grip"]);
  const byStat = new Map();
  for (const raw of Array.isArray(effects) ? effects : []) {
    const stat = String(raw?.stat || "").trim().toLowerCase();
    if (!allowedStats.has(stat)) continue;
    const value = Number(raw?.value);
    if (!Number.isFinite(value)) continue;
    byStat.set(stat, { stat, op: String(raw?.op || "add") === "mul" ? "mul" : "add", value });
  }
  return [...byStat.values()];
}

function uniqueList(value) {
  const rows = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(rows.map((row) => String(row || "").trim()).filter(Boolean))];
}

function uniqueNumbers(value) {
  const rows = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(rows.map((row) => Number(row)).filter(Number.isFinite))];
}

function cleanDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value || min))));
}
