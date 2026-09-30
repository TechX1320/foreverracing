import {
  deriveHorsepower,
  generateBaselineCurve,
  normalizePowerCurve,
} from "../domain/EngineCatalog.js";

export function partDynoPreview(car, currentStats, projectedStats) {
  const engine = { ...(car?.engine || {}) };
  if (!Number(engine.peakHp || 0)) engine.peakHp = Number(car?.base?.hp || currentStats?.hp || 1);
  if (!Number(engine.peakTorque || 0)) engine.peakTorque = Number(car?.base?.torque || currentStats?.torque || 1);
  if (!Number(engine.peakHpRpm || 0)) engine.peakHpRpm = Math.max(1000, Number(engine.redlineRpm || 6500) - 500);
  if (!Number(engine.peakTorqueRpm || 0)) engine.peakTorqueRpm = Math.max(1000, Math.round(Number(engine.peakHpRpm || 5500) * 0.55));
  if (!Number(engine.redlineRpm || 0)) engine.redlineRpm = Math.max(Number(engine.peakHpRpm || 0) + 500, 6500);
  if (!Number(engine.revCutRpm || 0)) engine.revCutRpm = Number(engine.redlineRpm || 6500) + 300;

  let source = normalizePowerCurve(engine.powerCurve || []);
  if (source.length < 2) source = generateBaselineCurve(engine);
  return {
    before: scaleCurve(source, engine, currentStats || car?.derived || car?.base || {}),
    after: scaleCurve(source, engine, projectedStats || currentStats || car?.derived || car?.base || {}),
  };
}

function scaleCurve(source, engine, stats) {
  const curve = normalizePowerCurve(source);
  if (!curve.length) return [];

  const sourcePeakTorque = Math.max(...curve.map((point) => Number(point.torqueLbFt || 0)), 1);
  const sourcePeakHp = Math.max(...curve.map((point) => deriveHorsepower(point.rpm, point.torqueLbFt)), 1);
  const targetTorque = Math.max(1, Number(stats?.torque || sourcePeakTorque));
  const targetHp = Math.max(1, Number(stats?.hp || sourcePeakHp));
  const tqScale = targetTorque / sourcePeakTorque;
  const hpScale = targetHp / sourcePeakHp;

  const sourceTqPoint = curve.reduce((best, point) => point.torqueLbFt > best.torqueLbFt ? point : best, curve[0]);
  const sourceHpPoint = curve.reduce((best, point) =>
    deriveHorsepower(point.rpm, point.torqueLbFt) > deriveHorsepower(best.rpm, best.torqueLbFt) ? point : best, curve[0]);

  const tqRpm = Math.max(1, Number(engine?.peakTorqueRpm || sourceTqPoint.rpm || 1));
  const hpRpm = Math.max(tqRpm + 1, Number(engine?.peakHpRpm || sourceHpPoint.rpm || tqRpm + 1));

  return curve.map((point) => {
    let blend = 0;
    if (point.rpm > tqRpm) blend = Math.max(0, Math.min(1, (point.rpm - tqRpm) / Math.max(1, hpRpm - tqRpm)));
    const scale = tqScale + ((hpScale - tqScale) * blend);
    return {
      rpm: point.rpm,
      torqueLbFt: Math.max(1, Math.round(point.torqueLbFt * scale * 10) / 10),
    };
  });
}

export function renderPartDynoChart(car, currentStats, projectedStats, partName = "Part") {
  const { before, after } = partDynoPreview(car, currentStats, projectedStats);
  if (before.length < 2 || after.length < 2) {
    return '<div class="part-dyno__empty">Not enough engine curve data for a dyno preview.</div>';
  }

  const beforePts = before.map((point) => ({ ...point, hp: deriveHorsepower(point.rpm, point.torqueLbFt) }));
  const afterPts = after.map((point) => ({ ...point, hp: deriveHorsepower(point.rpm, point.torqueLbFt) }));
  const maxRpm = Math.max(
    ...beforePts.map((point) => point.rpm),
    ...afterPts.map((point) => point.rpm),
    Number(car?.engine?.revCutRpm || 0),
    1000
  );
  const maxY = Math.max(
    ...beforePts.flatMap((point) => [point.hp, point.torqueLbFt]),
    ...afterPts.flatMap((point) => [point.hp, point.torqueLbFt]),
    100
  ) * 1.08;

  const width = 560;
  const height = 250;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const x = (rpm) => padL + ((rpm / maxRpm) * plotW);
  const y = (value) => padT + plotH - ((value / maxY) * plotH);
  const line = (rows, key) => rows.map((point) => `${x(point.rpm).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");

  const xTicks = [0, .25, .5, .75, 1].map((ratio) => {
    const rpm = Math.round((maxRpm * ratio) / 500) * 500;
    const px = x(rpm);
    return `<g><line x1="${px}" y1="${padT}" x2="${px}" y2="${padT + plotH}" class="engine-chart-grid"/><text x="${px}" y="${height - 9}" text-anchor="middle">${rpm}</text></g>`;
  }).join("");
  const yTicks = [0, .25, .5, .75, 1].map((ratio) => {
    const value = Math.round(maxY * ratio);
    const py = y(value);
    return `<g><line x1="${padL}" y1="${py}" x2="${padL + plotW}" y2="${py}" class="engine-chart-grid"/><text x="${padL - 7}" y="${py + 3}" text-anchor="end">${value}</text></g>`;
  }).join("");

  return `
    <div class="part-dyno__title"><strong>${escapeText(partName)}</strong><span>Estimated before / after curve</span></div>
    <div class="part-dyno__legend">
      <span><i class="part-dyno__swatch part-dyno__swatch--before"></i>Before</span>
      <span><i class="part-dyno__swatch part-dyno__swatch--hp"></i>After HP</span>
      <span><i class="part-dyno__swatch part-dyno__swatch--tq"></i>After TQ</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Estimated before and after dyno for ${escapeText(partName)}">
      <g class="engine-chart-axis">${xTicks}${yTicks}</g>
      <polyline points="${line(beforePts, "hp")}" class="part-dyno-line part-dyno-line--before"/>
      <polyline points="${line(beforePts, "torqueLbFt")}" class="part-dyno-line part-dyno-line--before"/>
      <polyline points="${line(afterPts, "hp")}" class="part-dyno-line part-dyno-line--hp"/>
      <polyline points="${line(afterPts, "torqueLbFt")}" class="part-dyno-line part-dyno-line--tq"/>
    </svg>
    <p class="part-dyno__note">Preview uses the engine's authored curve when available and scales it to the current/projected game stats. It is a build comparison, not a chassis-dyno measurement.</p>`;
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}
