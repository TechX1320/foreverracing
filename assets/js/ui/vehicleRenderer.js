const PROFILES = {
  compact: { rear: 64, tailTop: 100, roofRear: 165, roofTopX: 225, roofTopY: 46, roofFront: 307, hoodY: 91, nose: 446, noseY: 104, frontWheel: 363, rearWheel: 145, wheel: 34 },
  sedan:   { rear: 56, tailTop: 96, roofRear: 155, roofTopX: 235, roofTopY: 43, roofFront: 318, hoodY: 92, nose: 452, noseY: 105, frontWheel: 366, rearWheel: 142, wheel: 34 },
  hatch:   { rear: 58, tailTop: 94, roofRear: 142, roofTopX: 220, roofTopY: 48, roofFront: 304, hoodY: 92, nose: 448, noseY: 104, frontWheel: 362, rearWheel: 143, wheel: 34 },
  micro:   { rear: 86, tailTop: 89, roofRear: 164, roofTopX: 220, roofTopY: 38, roofFront: 290, hoodY: 88, nose: 414, noseY: 101, frontWheel: 342, rearWheel: 158, wheel: 32 },
  muscle:  { rear: 48, tailTop: 98, roofRear: 181, roofTopX: 242, roofTopY: 51, roofFront: 302, hoodY: 82, nose: 468, noseY: 101, frontWheel: 378, rearWheel: 143, wheel: 36 },
  sports:  { rear: 50, tailTop: 91, roofRear: 178, roofTopX: 246, roofTopY: 61, roofFront: 311, hoodY: 83, nose: 464, noseY: 99, frontWheel: 377, rearWheel: 143, wheel: 35 },
  roadster:{ rear: 62, tailTop: 92, roofRear: 189, roofTopX: 239, roofTopY: 68, roofFront: 291, hoodY: 86, nose: 449, noseY: 102, frontWheel: 363, rearWheel: 145, wheel: 34 }
};

export function renderVehicle(car, { stage = null, compact = false } = {}) {
  const visual = car?.visual || {};
  const profile = PROFILES[visual.profile] || PROFILES.sedan;
  const buildStage = Number(stage || car?.buildStage || 1);
  const body = visual.color || '#7c8792';
  const width = compact ? 420 : 520;
  const height = compact ? 138 : 172;
  const scale = compact ? 0.8 : 1;
  const y = compact ? -8 : 0;

  const bodyPath = [
    `M ${profile.rear} 118`,
    `L ${profile.rear} ${profile.tailTop}`,
    `L ${profile.roofRear} 82`,
    `Q ${profile.roofRear + 26} ${profile.roofTopY} ${profile.roofTopX} ${profile.roofTopY}`,
    `Q ${profile.roofFront - 20} ${profile.roofTopY} ${profile.roofFront} 78`,
    `L ${profile.hoodY ? profile.roofFront + 28 : 330} ${profile.hoodY}`,
    `L ${profile.nose} ${profile.noseY}`,
    `L ${profile.nose - 5} 121`,
    `L ${profile.rear + 8} 121 Z`
  ].join(' ');

  const glass = `M ${profile.roofRear + 18} 80 Q ${profile.roofRear + 38} ${profile.roofTopY + 8} ${profile.roofTopX} ${profile.roofTopY + 8} Q ${profile.roofFront - 18} ${profile.roofTopY + 8} ${profile.roofFront - 8} 79 Z`;

  return `
    <div class="vehicle-visual" role="img" aria-label="${escapeAttr(car?.displayName || 'Vehicle')} side profile">
      <svg viewBox="0 0 520 172" width="${width}" height="${height}" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <g transform="translate(0 ${y}) scale(${scale})">
          <line x1="34" y1="142" x2="488" y2="142" class="vehicle-ground"/>
          ${buildStage >= 4 ? '<line x1="63" y1="103" x2="18" y2="93" class="vehicle-race-detail"/><line x1="54" y1="122" x2="18" y2="134" class="vehicle-race-detail"/>' : ''}
          <path d="${bodyPath}" fill="${escapeAttr(body)}" class="vehicle-body"/>
          <path d="${glass}" class="vehicle-glass"/>
          <line x1="${profile.roofTopX}" y1="${profile.roofTopY + 9}" x2="${profile.roofTopX}" y2="116" class="vehicle-panel"/>
          <line x1="${profile.roofFront + 9}" y1="84" x2="${profile.roofFront + 22}" y2="116" class="vehicle-panel"/>
          <rect x="${profile.nose - 22}" y="${profile.noseY + 2}" width="15" height="5" class="vehicle-light"/>
          <rect x="${profile.rear + 2}" y="${profile.tailTop + 5}" width="10" height="10" class="vehicle-tail-light"/>
          ${buildStage >= 2 ? cageSvg(profile) : ''}
          ${buildStage >= 3 ? '<rect x="383" y="103" width="34" height="13" rx="1" class="vehicle-intercooler"/><line x1="350" y1="97" x2="397" y2="116" class="vehicle-race-detail"/>' : ''}
          ${buildStage >= 4 ? '<path d="M 87 88 L 60 73 L 102 73 L 116 89" class="vehicle-wing"/><rect x="44" y="98" width="12" height="9" class="vehicle-chute"/>' : ''}
          ${wheelSvg(profile.rearWheel, profile.wheel, buildStage >= 3)}
          ${wheelSvg(profile.frontWheel, profile.wheel, buildStage >= 4)}
        </g>
      </svg>
    </div>`;
}

function wheelSvg(x, r, slick) {
  const tireR = slick ? r + 3 : r;
  const rimR = Math.max(12, r - 13);
  return `<circle cx="${x}" cy="124" r="${tireR}" class="vehicle-tire"/><circle cx="${x}" cy="124" r="${rimR}" class="vehicle-rim"/><circle cx="${x}" cy="124" r="4" class="vehicle-hub"/>`;
}

function cageSvg(profile) {
  return `<g class="vehicle-cage"><line x1="${profile.roofRear + 33}" y1="78" x2="${profile.roofFront - 10}" y2="116"/><line x1="${profile.roofFront - 18}" y1="79" x2="${profile.roofRear + 45}" y2="116"/><line x1="${profile.roofRear + 40}" y1="78" x2="${profile.roofRear + 45}" y2="116"/></g>`;
}

function escapeAttr(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
