const KEY = "foreverRacing.contentStudio.parts.v1";

export function contentStudioPartStorageKey() {
  return KEY;
}

export function listContentStudioParts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row === "object") : [];
  } catch {
    return [];
  }
}

export function mergeContentStudioParts(baseParts = [], { includeDrafts = false } = {}) {
  const merged = new Map(
    (Array.isArray(baseParts) ? baseParts : [])
      .filter((part) => part?.catalogId)
      .map((part) => [String(part.catalogId), structuredClone(part)])
  );

  for (const row of listContentStudioParts()) {
    if ((!includeDrafts && row.enabled === false) || !row.part?.catalogId) continue;
    merged.set(String(row.part.catalogId), structuredClone(row.part));
  }

  return [...merged.values()];
}

export function saveContentStudioPart(part, { enabled = true } = {}) {
  if (!part?.catalogId) throw new Error("A catalogId is required before saving.");
  const rows = listContentStudioParts();
  const catalogId = String(part.catalogId);
  const next = rows.filter((row) => String(row?.part?.catalogId || row?.catalogId || "") !== catalogId);
  next.push({
    catalogId,
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
    part: structuredClone(part),
  });
  localStorage.setItem(KEY, JSON.stringify(next));
  return structuredClone(part);
}

export function deleteContentStudioPart(catalogId) {
  const id = String(catalogId || "");
  const rows = listContentStudioParts();
  const next = rows.filter((row) => String(row?.part?.catalogId || row?.catalogId || "") !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next.length !== rows.length;
}

export function findContentStudioPartRecord(catalogId) {
  const id = String(catalogId || "");
  const row = listContentStudioParts().find((entry) => String(entry?.part?.catalogId || entry?.catalogId || "") === id);
  return row ? structuredClone(row) : null;
}

export function findContentStudioPart(catalogId) {
  return findContentStudioPartRecord(catalogId)?.part || null;
}
