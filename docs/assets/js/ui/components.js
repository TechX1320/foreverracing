export const money = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value) || 0);
export const number = (value, digits = 0) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(Number(value) || 0);

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

export function pageShell({ title, eyebrow = "FOREVER RACING", hint = "", body = "", trail = "" }) {
  return `
    <div class="screen-toolbar">
      <button class="button button--small" type="button" data-back-home>← Home</button>
      <span class="screen-toolbar__trail">${escapeHtml(trail || hint)}</span>
    </div>
    <section class="surface screen-panel">
      <div class="section-heading">
        <div><small>${escapeHtml(eyebrow)}</small><h2>${escapeHtml(title)}</h2></div>
        ${hint ? `<span class="muted">${escapeHtml(hint)}</span>` : ""}
      </div>
      ${body}
    </section>`;
}

export function bindHome(root, router) {
  root.querySelector("[data-back-home]")?.addEventListener("click", () => router.navigate("home"));
}

export function carLabel(car) {
  return car?.nickname?.trim() || car?.displayName || "Unknown Car";
}

export function selectedCar(player) {
  if (!player?.selectedCarId || !Array.isArray(player?.garage)) return null;
  return player.garage.find((car) => String(car.carId) === String(player.selectedCarId)) || null;
}

export function effectsText(effects = []) {
  return effects.map((effect) => {
    const stat = String(effect.stat || "").toUpperCase();
    const value = Number(effect.value) || 0;
    if (effect.op === "mul") return `${stat} ×${value.toFixed(3)}`;
    const suffix = effect.stat === "weight" ? " lb" : "";
    return `${stat} ${value >= 0 ? "+" : ""}${value}${suffix}`;
  }).join(" • ");
}
