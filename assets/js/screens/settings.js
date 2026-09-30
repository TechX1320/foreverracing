import { bindHome, escapeHtml, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { showDialog, closeDialog } from "../ui/modal.js";

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
          <div class="split"><div><h3>Vehicle Rendering</h3><p>All 57 purchased cars now have certified PNG artwork. Gameplay still enables only cars whose specs have been validated.</p></div><span class="pill pill--accent">57 ART READY</span></div>
          <div class="game-card__actions"><button class="button button--small" type="button" data-car-art-debug>CAR ART DEBUG</button></div>
        </div>
        <div class="game-card">
          <div class="split"><div><h3>Build & Cached Assets</h3><p>Current build: <strong>${document.documentElement.dataset.build || "unknown"}</strong>. GitHub Pages development mode disables the offline service-worker cache so refreshes pull current assets.</p></div><span class="pill pill--accent">V0.5C.2</span></div>
          <div class="game-card__actions"><button class="button button--small" type="button" data-clear-assets>CLEAR CACHED ASSETS</button></div>
        </div>
        <div class="game-card">
          <h3>Admin / Tutorial Development Account</h3>
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

  ctx.screenRoot.querySelector("[data-car-art-debug]")?.addEventListener("click", async () => {
    try {
      const build = String(document.documentElement.dataset.build || "").trim();
      const separator = build ? `?v=${encodeURIComponent(build)}` : "";
      const [catalogData, artResponse] = await Promise.all([
        ctx.storage.carCatalog(),
        fetch(`data/catalog/car-art.json${separator}`, { cache: "no-store" }),
      ]);
      if (!artResponse.ok) throw new Error(`Unable to load car art catalog (${artResponse.status}).`);
      const artData = await artResponse.json();
      const playableIds = new Set((catalogData.cars || []).map((car) => String(car.catalogId || car.visual?.layered?.assetId || "")));
      const cars = (artData.cars || []).map((art) => ({
        catalogId: art.assetId,
        displayName: art.displayName,
        visual: {
          layered: {
            assetId: art.assetId,
            canvas: art.canvas,
            layers: art.layers,
            anchors: art.anchors,
            certifiedSrc: art.certifiedSrc || null,
            certifiedAtlas: art.certifiedAtlas || null,
          },
        },
      }));
      const dialog = showDialog(`
        <div class="dialog-body car-art-debug-dialog">
          <span class="section-label">DEVELOPMENT / VEHICLE ROSTER</span>
          <h2>57-Car Art Roster</h2>
          <p>Every purchased asset below is runtime-ready. PLAYABLE means its vehicle specs are also validated in the gameplay catalog.</p>
          <div class="car-art-debug-grid car-art-debug-grid--roster">
            ${cars.map((car) => {
              const art = car.visual.layered;
              const a = art.anchors || {};
              const playable = playableIds.has(String(car.catalogId));
              return `<article class="car-art-debug-card">
                <div class="car-art-debug-card__visual">${renderVehicle(car, { view: "sideProfile" })}</div>
                <strong>${escapeHtml(car.displayName || car.catalogId)}</strong>
                <small>${escapeHtml(art.assetId || "")}</small>
                <div class="car-art-debug-card__status"><span class="pill ${playable ? "pill--accent" : ""}">${playable ? "PLAYABLE" : "ART READY"}</span><span>PNG</span></div>
                <code>rear ${a.rearWheelCenter?.x ?? "?"},${a.rearWheelCenter?.y ?? "?"} • front ${a.frontWheelCenter?.x ?? "?"},${a.frontWheelCenter?.y ?? "?"} • bumper ${a.frontBumperX ?? "?"}</code>
              </article>`;
            }).join("")}
          </div>
          <div class="dialog-actions"><button class="button button--primary" type="button" data-close-art-debug>CLOSE</button></div>
        </div>`);
      dialog.querySelector("[data-close-art-debug]")?.addEventListener("click", () => closeDialog(dialog));
    } catch (err) {
      ctx.toast("Art debug failed", err.message);
    }
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
      ctx.toast("Tutorial reset", "Reloading the tutorial from the Welcome step.");
      location.hash = "#/home";
      location.reload();
    } catch (err) {
      ctx.toast("Reset failed", err.message);
      event.currentTarget.disabled = false;
    }
  });
}
