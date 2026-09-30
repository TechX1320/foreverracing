import { closeDialog, showDialog } from "./modal.js";
import { number } from "./components.js";
import { performanceClassRank, performanceClassThreshold } from "../domain/PerformanceIndex.js";

export function isUpwardClassChange(currentClass, projectedClass) {
  return performanceClassRank(projectedClass) > performanceClassRank(currentClass);
}

export function classChangeWarningLabel(car, projected) {
  const currentClass = String(car?.performanceClass || car?.stockClass || "—").toUpperCase();
  const nextClass = String(projected?.performanceClass || currentClass).toUpperCase();
  if (!isUpwardClassChange(currentClass, nextClass)) return "";
  return `⚠ CLASS UP ${currentClass} → ${nextClass}`;
}

export function confirmClassUpgrade({ car, projected, partName = "this part" } = {}) {
  const currentClass = String(car?.performanceClass || car?.stockClass || "—").toUpperCase();
  const nextClass = String(projected?.performanceClass || currentClass).toUpperCase();
  if (!isUpwardClassChange(currentClass, nextClass)) return Promise.resolve(true);

  const currentPi = Number(car?.performanceIndex || 0);
  const nextPi = Number(projected?.performanceIndex || currentPi);
  const threshold = performanceClassThreshold(nextClass);
  const dialog = showDialog(`
    <div class="dialog-body class-change-warning">
      <span class="section-label">CLASS CHANGE WARNING</span>
      <h2>${escapeHtml(currentClass)} → ${escapeHtml(nextClass)} CLASS</h2>
      <p>Installing <b>${escapeHtml(partName)}</b> will move this car into a higher Performance Class.</p>

      <div class="class-change-warning__pi">
        <div><small>CURRENT</small><b>${escapeHtml(currentClass)} • PI ${number(currentPi)}</b></div>
        <div class="class-change-warning__arrow">→</div>
        <div><small>AFTER INSTALL</small><b>${escapeHtml(nextClass)} • PI ${number(nextPi)}</b></div>
      </div>

      <div class="class-change-warning__notice">
        <strong>PI ${number(threshold)} starts ${escapeHtml(nextClass)} Class.</strong>
        <span>Lower-class Circuit events may become unavailable until you uninstall parts and bring the car's PI back down.</span>
      </div>

      <div class="dialog-actions">
        <button class="button" type="button" data-class-cancel>CANCEL</button>
        <button class="button button--primary" type="button" data-class-confirm>INSTALL ANYWAY</button>
      </div>
    </div>
  `, { locked: true });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeDialog(dialog);
      resolve(value);
    };
    dialog.querySelector("[data-class-cancel]")?.addEventListener("click", () => finish(false));
    dialog.querySelector("[data-class-confirm]")?.addEventListener("click", () => finish(true));
    dialog.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, { once: true });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
