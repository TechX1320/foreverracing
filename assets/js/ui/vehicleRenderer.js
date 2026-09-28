export function renderVehicle(car, { stage = null, compact = false, view = 'sideProfile' } = {}) {
  const visual = car?.visual || {};
  const buildStage = Number(stage || car?.buildStage || 1);
  const sprite = resolveSprite(visual.sprites, view, buildStage);

  if (sprite) return renderSprite(car, sprite, { compact, view });
  return renderMissingArt(car, { compact, view });
}

function resolveSprite(sprites, view, stage) {
  if (!sprites || typeof sprites !== 'object') return null;

  const candidates = [];
  const push = (value) => { if (value && !candidates.includes(value)) candidates.push(value); };

  if (view === 'showroom') {
    push(sprites.showroom);
    push(sprites.sideProfile);
  } else if (view === 'sideProfile') {
    push(sprites.sideProfile);
    push(sprites.showroom);
  } else if (view === 'racePreview') {
    push(sprites.racePreview);
    push(sprites.topDown);
  } else if (view === 'topDown') {
    push(sprites.topDown);
  } else {
    push(sprites[view]);
  }

  for (const candidate of candidates) {
    const resolved = resolveStageCandidate(candidate, stage);
    if (resolved) return resolved;
  }
  return null;
}

function resolveStageCandidate(candidate, stage) {
  if (!candidate || typeof candidate !== 'object') return null;
  if (candidate.src || candidate.sheet) return candidate;
  return candidate[`stage${stage}`] || candidate.base || candidate.stage1 || null;
}

function renderSprite(car, sprite, { compact, view }) {
  const src = String(sprite.src || '').trim();
  if (src) {
    const resolvedSrc = versionedAsset(src);
    return `
      <div class="vehicle-visual vehicle-visual--sprite" role="img" aria-label="${escapeAttr(car?.displayName || 'Vehicle')} ${escapeAttr(view)} preview">
        <img data-vehicle-image class="vehicle-sprite-image ${compact ? 'vehicle-sprite-image--compact' : 'vehicle-sprite-image--full'} vehicle-sprite-image--${escapeAttr(view)}" src="${escapeAttr(resolvedSrc)}" alt="" aria-hidden="true">
        ${missingMarkup(car, compact, true)}
      </div>`;
  }

  const columns = Math.max(1, Number(sprite.columns || 1));
  const rows = Math.max(1, Number(sprite.rows || 1));
  const index = Math.max(0, Number(sprite.index || 0));
  const x = index % columns;
  const y = Math.floor(index / columns) % rows;
  const positionX = columns <= 1 ? 0 : (x / (columns - 1)) * 100;
  const positionY = rows <= 1 ? 0 : (y / (rows - 1)) * 100;
  const sheet = String(sprite.sheet || '').trim();
  if (!sheet) return renderMissingArt(car, { compact, view });

  const style = [
    `background-image:url(${versionedAsset(sheet)})`,
    `background-size:${columns * 100}% ${rows * 100}%`,
    `background-position:${positionX}% ${positionY}%`
  ].join(';');

  return `
    <div class="vehicle-visual vehicle-visual--sprite" role="img" aria-label="${escapeAttr(car?.displayName || 'Vehicle')} ${escapeAttr(view)} preview">
      <span class="vehicle-sprite ${compact ? 'vehicle-sprite--compact' : 'vehicle-sprite--full'}" style="${escapeAttr(style)}" aria-hidden="true"></span>
    </div>`;
}

function renderMissingArt(car, { compact = false, view = 'unknown' } = {}) {
  return `
    <div class="vehicle-visual vehicle-visual--missing" role="img" aria-label="${escapeAttr(car?.displayName || 'Vehicle')} artwork missing for ${escapeAttr(view)} view">
      ${missingMarkup(car, compact, false)}
    </div>`;
}

function missingMarkup(car, compact, hidden) {
  const name = String(car?.displayName || 'Vehicle');
  return `<span data-vehicle-missing class="vehicle-missing-art ${compact ? 'vehicle-missing-art--compact' : 'vehicle-missing-art--full'}" ${hidden ? 'hidden' : ''} aria-hidden="true"><b>?</b><small>ART MISSING</small><em>${escapeAttr(name)}</em></span>`;
}

function versionedAsset(path) {
  const build = String(document.documentElement?.dataset?.build || '').trim();
  if (!build || !path) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${encodeURIComponent(build)}`;
}

function escapeAttr(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
