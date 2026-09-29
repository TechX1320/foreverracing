const KEY = "foreverRacing.contentStudio.cars.v1";

export function contentStudioStorageKey() {
  return KEY;
}

export function listContentStudioCars() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row === "object") : [];
  } catch {
    return [];
  }
}

export function mergeContentStudioCars(baseCars = []) {
  const merged = new Map(
    (Array.isArray(baseCars) ? baseCars : [])
      .filter((car) => car?.catalogId)
      .map((car) => [String(car.catalogId), structuredClone(car)])
  );

  for (const row of listContentStudioCars()) {
    if (row.enabled === false || !row.car?.catalogId) continue;
    merged.set(String(row.car.catalogId), structuredClone(row.car));
  }

  return [...merged.values()];
}

export function saveContentStudioCar(car, { enabled = true } = {}) {
  if (!car?.catalogId) throw new Error("A catalogId is required before saving.");
  const rows = listContentStudioCars();
  const catalogId = String(car.catalogId);
  const next = rows.filter((row) => String(row?.car?.catalogId || row?.catalogId || "") !== catalogId);
  next.push({
    catalogId,
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
    car: structuredClone(car),
  });
  localStorage.setItem(KEY, JSON.stringify(next));
  return structuredClone(car);
}

export function deleteContentStudioCar(catalogId) {
  const id = String(catalogId || "");
  const rows = listContentStudioCars();
  const next = rows.filter((row) => String(row?.car?.catalogId || row?.catalogId || "") !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next.length !== rows.length;
}

export function findContentStudioCar(catalogId) {
  const id = String(catalogId || "");
  const row = listContentStudioCars().find((entry) => String(entry?.car?.catalogId || entry?.catalogId || "") === id);
  return row?.car ? structuredClone(row.car) : null;
}
