import { normalizeCircuitDefinition } from "../domain/CircuitCatalog.js";

const STORAGE_KEY = "foreverRacing.contentStudio.circuits";

export function listContentStudioCircuits() {
  return readRecords();
}

export function findContentStudioCircuit(circuitId) {
  return readRecords().find((row) => String(row.circuitId) === String(circuitId)) || null;
}

export function saveContentStudioCircuit(circuit, enabled = false) {
  const normalized = normalizeCircuitDefinition(circuit);
  const records = readRecords().filter((row) => String(row.circuitId) !== normalized.circuitId);
  records.push({ circuitId: normalized.circuitId, enabled: Boolean(enabled), circuit: normalized, updatedAt: Date.now() });
  writeRecords(records);
  return normalized;
}

export function deleteContentStudioCircuit(circuitId) {
  writeRecords(readRecords().filter((row) => String(row.circuitId) !== String(circuitId)));
}

export function mergeContentStudioCircuits(baseCircuits = []) {
  const merged = new Map((Array.isArray(baseCircuits) ? baseCircuits : [])
    .map((circuit) => {
      const normalized = normalizeCircuitDefinition(circuit);
      return [normalized.circuitId, normalized];
    }));
  for (const record of readRecords()) {
    if (record.enabled !== true) continue;
    const normalized = normalizeCircuitDefinition(record.circuit || {});
    if (normalized.circuitId) merged.set(normalized.circuitId, normalized);
  }
  return [...merged.values()];
}

function readRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}
