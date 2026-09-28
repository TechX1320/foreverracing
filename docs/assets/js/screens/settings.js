import { bindHome, pageShell } from "../ui/components.js";

const KEY = "forever-racing-settings-v1";

export function loadSettings() {
  let settings = { reduceMotion: false, compactMenu: true, vehicleRendering: "authored" };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch {}
  applySettings(settings);
  return settings;
}

function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
  applySettings(settings);
}

function applySettings(settings) {
  document.documentElement.dataset.reduceMotion = settings.reduceMotion ? "true" : "false";
  document.documentElement.dataset.compactMenu = settings.compactMenu ? "true" : "false";
  document.documentElement.dataset.vehicleRendering = settings.vehicleRendering || "authored";
}

export async function renderSettings(ctx) {
  const settings = loadSettings();
  const localMode = ctx.storage.mode === "local";
  ctx.screenRoot.innerHTML = pageShell({
    title: "Settings",
    eyebrow: "LOCAL UI / DEVELOPMENT",
    hint: "Saved on this device",
    trail: localMode ? "Browser-local development save" : "Server account session",
    body: `
      <div class="stack">
        <label class="game-card split" style="cursor:pointer">
          <div><h3>Compact Navigation</h3><p>The dense browser-game layout is the default. Turn this off only if you want taller navigation targets.</p></div>
          <input type="checkbox" data-setting="compactMenu" ${settings.compactMenu ? "checked" : ""}>
        </label>
        <label class="game-card split" style="cursor:pointer">
          <div><h3>Reduce Motion</h3><p>Disable screen transitions and decorative motion.</p></div>
          <input type="checkbox" data-setting="reduceMotion" ${settings.reduceMotion ? "checked" : ""}>
        </label>
        <div class="game-card">
          <div class="split"><div><h3>Vehicle Rendering</h3><p>Authored vehicle art is used whenever it exists. Missing artwork is shown as an explicit ? placeholder so the art backlog is visible during development.</p></div><span class="pill pill--accent">AUTHORED / FALLBACK</span></div>
        </div>
        <div class="game-card">
          <h3>FTUE Development Tools</h3>
          <p>Reset only the tutorial state so the onboarding flow can be tested again without deleting your entire development save.</p>
          <div class="game-card__actions"><button class="button button--small" type="button" data-reset-tutorial>RESET TUTORIAL</button></div>
        </div>
        <div class="game-card">
          <h3>${localMode ? "GitHub Pages Development Mode" : "Server Mode"}</h3>
          <p>${localMode ? "Player state is stored only in this browser. It is intentionally not shared across browsers or devices." : "Player state is stored through the PHP API/session provider."}</p>
        </div>
      </div>`
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      settings[input.dataset.setting] = input.checked;
      saveSettings(settings);
      ctx.toast("Settings saved", "Applied on this device.");
    });
  });

  ctx.screenRoot.querySelector("[data-reset-tutorial]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.tutorialReset();
      ctx.store.setPlayer(data.player);
      ctx.toast("Tutorial reset", "Reloading the FTUE from the Welcome step.");
      location.hash = "#/home";
      location.reload();
    } catch (err) {
      ctx.toast("Reset failed", err.message);
      event.currentTarget.disabled = false;
    }
  });
}
