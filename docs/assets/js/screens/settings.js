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
          <div class="split"><div><h3>Build & Cached Assets</h3><p>Current build: <strong>${document.documentElement.dataset.build || "unknown"}</strong>. GitHub Pages development mode disables the offline service-worker cache so refreshes pull current assets.</p></div><span class="pill pill--accent">V0.3B</span></div>
          <div class="game-card__actions"><button class="button button--small" type="button" data-clear-assets>CLEAR CACHED ASSETS</button></div>
        </div>
        <div class="game-card">
          <h3>Admin / FTUE Development Account</h3>
          <p>Admin is intentionally disposable. SIGN OUT erases the Admin player save so the next login always starts from the beginning. Reset Tutorial remains useful when you want to replay only onboarding without wiping the current garage.</p>
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

  ctx.screenRoot.querySelector("[data-clear-assets]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("forever-racing-shell-")).map((key) => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      ctx.toast("Cached assets cleared", "Reloading the current GitHub Pages build.");
      setTimeout(() => location.reload(), 120);
    } catch (err) {
      ctx.toast("Cache clear failed", err.message);
      event.currentTarget.disabled = false;
    }
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
