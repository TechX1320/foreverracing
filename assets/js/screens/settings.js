import { bindHome, pageShell } from "../ui/components.js";

const KEY = "forever-racing-settings-v1";

export function loadSettings() {
  let settings = { reduceMotion: false, compactMenu: true, vehicleRendering: 'procedural' };
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
}

export async function renderSettings(ctx) {
  const settings = loadSettings();
  ctx.screenRoot.innerHTML = pageShell({
    title: "Settings",
    eyebrow: "LOCAL UI",
    hint: "Saved on this device",
    trail: "No account-sensitive data stored here",
    body: `<div class="stack"><label class="game-card split" style="cursor:pointer"><div><h3>Reduce Motion</h3><p>Disable screen transitions and most decorative motion.</p></div><input type="checkbox" data-setting="reduceMotion" ${settings.reduceMotion ? "checked" : ""}></label><label class="game-card split" style="cursor:pointer"><div><h3>Compact Main Menu</h3><p>Reduce home menu tile height on devices where you want more options above the fold.</p></div><input type="checkbox" data-setting="compactMenu" ${settings.compactMenu ? "checked" : ""}></label><div class="game-card"><h3>Development Build</h3><p>Authentication and player state are server-side. These UI preferences are the only data deliberately kept in localStorage.</p></div></div>`
  });
  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      settings[input.dataset.setting] = input.checked;
      saveSettings(settings);
      ctx.toast("Settings saved", "Applied on this device.");
    });
  });
}
