export const RELEASE_MODES = Object.freeze({
  DRAFT: "draft",
  INSTANT: "instant",
  SCHEDULED: "scheduled",
});

export function normalizeRelease(release, { legacyReleased = true } = {}) {
  if (!release || typeof release !== "object") {
    return legacyReleased
      ? { mode: RELEASE_MODES.INSTANT, publishAt: null }
      : { mode: RELEASE_MODES.DRAFT, publishAt: null };
  }

  const mode = [RELEASE_MODES.DRAFT, RELEASE_MODES.INSTANT, RELEASE_MODES.SCHEDULED].includes(String(release.mode || ""))
    ? String(release.mode)
    : (legacyReleased ? RELEASE_MODES.INSTANT : RELEASE_MODES.DRAFT);

  const publishAt = normalizeTimestamp(release.publishAt);
  return { ...release, mode, publishAt };
}

export function isContentReleased(content, nowMs = Date.now()) {
  const release = normalizeRelease(content?.release, { legacyReleased: true });
  if (release.mode === RELEASE_MODES.DRAFT) return false;
  if (release.mode === RELEASE_MODES.INSTANT) return true;
  const timestamp = Date.parse(String(release.publishAt || ""));
  return Number.isFinite(timestamp) && timestamp <= Number(nowMs);
}

export function releaseState(content, nowMs = Date.now()) {
  const release = normalizeRelease(content?.release, { legacyReleased: true });
  if (release.mode === RELEASE_MODES.DRAFT) {
    return { state: "draft", label: "DRAFT — NOT RELEASED", released: false, publishAt: null };
  }

  if (release.mode === RELEASE_MODES.INSTANT) {
    return {
      state: "released",
      label: release.publishAt ? `RELEASED • ${formatReleaseDate(release.publishAt)}` : "RELEASED • LIVE NOW",
      released: true,
      publishAt: release.publishAt,
    };
  }

  const timestamp = Date.parse(String(release.publishAt || ""));
  if (!Number.isFinite(timestamp)) {
    return { state: "invalid", label: "SCHEDULED — DATE REQUIRED", released: false, publishAt: null };
  }

  if (timestamp <= Number(nowMs)) {
    return {
      state: "released",
      label: `RELEASED • ${formatReleaseDate(release.publishAt)}`,
      released: true,
      publishAt: release.publishAt,
    };
  }

  return {
    state: "scheduled",
    label: `SCHEDULED • ${formatReleaseDate(release.publishAt)}`,
    released: false,
    publishAt: release.publishAt,
  };
}

export function normalizeReleaseForSave(release, { nowMs = Date.now() } = {}) {
  const normalized = normalizeRelease(release, { legacyReleased: false });

  if (normalized.mode === RELEASE_MODES.DRAFT) {
    return { ...normalized, publishAt: null };
  }

  if (normalized.mode === RELEASE_MODES.INSTANT) {
    return {
      ...normalized,
      publishAt: normalizeTimestamp(normalized.publishAt) || new Date(Number(nowMs)).toISOString(),
    };
  }

  const scheduled = normalizeTimestamp(normalized.publishAt);
  if (!scheduled) throw new Error("Scheduled release requires a valid date and time.");
  return { ...normalized, publishAt: scheduled };
}

export function toDatetimeLocalValue(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offsetMs).toISOString().slice(0, 16);
}

export function formatReleaseDate(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function normalizeTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
