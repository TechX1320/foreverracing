const KEY = "foreverRacing.contentStudio.engines.v1";

export function contentStudioEngineStorageKey() {
  return KEY;
}

export function listContentStudioEngines() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row === "object") : [];
  } catch {
    return [];
  }
}

export function mergeContentStudioEngines(baseEngines = [], { includeDrafts = false } = {}) {
  const merged = new Map(
    (Array.isArray(baseEngines) ? baseEngines : [])
      .filter((engine) => engine?.engineId)
      .map((engine) => [String(engine.engineId), structuredClone(engine)])
  );

  for (const row of listContentStudioEngines()) {
    if ((!includeDrafts && row.enabled === false) || !row.engine?.engineId) continue;
    merged.set(String(row.engine.engineId), structuredClone(row.engine));
  }

  return [...merged.values()];
}

export function saveContentStudioEngine(engine, { enabled = true } = {}) {
  if (!engine?.engineId) throw new Error("An engineId is required before saving.");
  const rows = listContentStudioEngines();
  const engineId = String(engine.engineId);
  const next = rows.filter((row) => String(row?.engine?.engineId || row?.engineId || "") !== engineId);
  next.push({
    engineId,
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
    engine: structuredClone(engine),
  });
  localStorage.setItem(KEY, JSON.stringify(next));
  return structuredClone(engine);
}

export function deleteContentStudioEngine(engineId) {
  const id = String(engineId || "");
  const rows = listContentStudioEngines();
  const next = rows.filter((row) => String(row?.engine?.engineId || row?.engineId || "") !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next.length !== rows.length;
}

export function findContentStudioEngineRecord(engineId) {
  const id = String(engineId || "");
  const row = listContentStudioEngines().find((entry) => String(entry?.engine?.engineId || entry?.engineId || "") === id);
  return row ? structuredClone(row) : null;
}

export function findContentStudioEngine(engineId) {
  return findContentStudioEngineRecord(engineId)?.engine || null;
}
