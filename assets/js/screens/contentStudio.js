import { bindHome, escapeHtml, pageShell } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";
import { benchmarkPerformance, performanceClassFromIndex } from "../domain/PerformanceIndex.js";
import {
  normalizeRelease,
  normalizeReleaseForSave,
  releaseState,
  toDatetimeLocalValue,
} from "../domain/ContentRelease.js";
import {
  deleteContentStudioCar,
  findContentStudioCar,
  findContentStudioRecord,
  listContentStudioCars,
  saveContentStudioCar,
} from "../content/ContentStudioCatalog.js";

const BUILD_MODULES = [
  { id: "cars", label: "CAR CREATOR", state: "ACTIVE" },
  { id: "parts", label: "PARTS TOOL", state: "NEXT" },
  { id: "wheels", label: "WHEELS TOOL", state: "PLANNED" },
];

const LAYER_DEFAULT_Z = { wheel: 1, disk: 2, body: 3, detail: 5 };
const DEFAULT_PAINT_PALETTE = ["#f4f4f1", "#1c1d20", "#b52b32", "#315f9e", "#73777c"];
const USED_LOT_KEY = "foreverRacing.v02.usedLot";

export async function renderContentStudio(ctx) {
  const build = String(document.documentElement.dataset.build || "").trim();
  const suffix = build ? `?v=${encodeURIComponent(build)}` : "";
  const [catalogData, artResponse, racingResponse] = await Promise.all([
    ctx.storage.carCatalog(),
    fetch(`data/catalog/car-art.json${suffix}`, { cache: "no-store" }),
    fetch(`data/config/racing.json${suffix}`, { cache: "no-store" }),
  ]);
  if (!artResponse.ok) throw new Error(`Unable to load car art catalog (${artResponse.status}).`);
  if (!racingResponse.ok) throw new Error(`Unable to load racing config (${racingResponse.status}).`);

  const catalogCars = Array.isArray(catalogData?.cars) ? catalogData.cars : [];
  const artData = await artResponse.json();
  const artCars = Array.isArray(artData?.cars) ? artData.cars : [];
  const racingConfig = await racingResponse.json();
  const root = ctx.screenRoot;

  root.innerHTML = pageShell({
    title: "Content Studio",
    eyebrow: "DEVELOPMENT / CONTENT TOOLS",
    hint: "Cars now • parts and wheels next",
    trail: "Browser-local authoring workspace",
    body: '<div data-content-studio></div>',
  });
  bindHome(root, ctx.router);

  const host = root.querySelector("[data-content-studio]");
  let draft = createBlankCar(nextStockId(catalogCars));
  let lastLoadedId = "";

  const available = () => buildAvailableCars(catalogCars, artCars);

  const renderWorkspace = () => {
    const score = scoreCar(draft, racingConfig);
    const currentLocal = findContentStudioRecord(draft.catalogId);
    const localState = currentLocal ? (currentLocal.enabled === false ? "LOCAL DRAFT" : "LOCAL ACTIVE") : "UNSAVED / SOURCE";
    host.innerHTML = `
      <div class="content-studio">
        <div class="content-studio__modules">
          ${BUILD_MODULES.map((module) => `
            <button type="button" class="content-studio__module ${module.id === "cars" ? "is-active" : ""}" ${module.id === "cars" ? "" : "disabled"}>
              <b>${module.label}</b><span>${module.state}</span>
            </button>`).join("")}
        </div>

        <div class="content-studio__toolbar">
          <label class="studio-inline-field">
            <span>LOAD EXISTING / ART ROSTER</span>
            <select data-studio-load>
              <option value="">Choose a car...</option>
              ${available().map((row) => `<option value="${escapeHtml(row.id)}" ${row.id === lastLoadedId ? "selected" : ""}>${escapeHtml(row.label)} — ${row.status}</option>`).join("")}
            </select>
          </label>
          <button class="button button--small" type="button" data-studio-new>NEW CAR</button>
          <span class="pill ${currentLocal?.enabled !== false && currentLocal ? "pill--accent" : ""}">${localState}</span>
        </div>

        <div class="content-studio__workspace">
          <aside class="content-studio__preview-column">
            <section class="content-studio__preview-card">
              <div class="content-studio__preview-head">
                <div><small>LIVE CAR PREVIEW</small><strong data-preview-name>${escapeHtml(draft.displayName || "Untitled Car")}</strong></div>
                <span class="performance-class-tag" data-preview-class>${score.className}</span>
              </div>
              <div class="content-studio__preview" data-studio-preview>
                ${previewMarkup(draft)}
              </div>
              <div class="content-studio__score">
                <span><small>PERFORMANCE INDEX</small><b data-preview-pi>${score.performanceIndex}</b></span>
                <span><small>1/4 BENCHMARK</small><b data-preview-et>${score.quarterMileEt.toFixed(3)}s</b></span>
                <span><small>TRAP</small><b data-preview-trap>${score.quarterMileTrap.toFixed(1)} mph</b></span>
              </div>
              <p class="content-studio__score-note">PI and class recalculate from the same deterministic 51-pass benchmark used by the game.</p>
            </section>

            <section class="content-studio__preview-card">
              <div class="content-studio__preview-head"><div><small>FACTORY PAINT</small><strong>5-color palette + preview</strong></div></div>
              <div class="content-studio__paint-row">
                <input type="color" value="${paintValue(draft.visual?.paintColor)}" data-studio-paint>
                <input type="text" value="${escapeHtml(draft.visual?.paintColor || "")}" placeholder="#ffffff or blank" data-studio-field="visual.paintColor">
                <button class="button button--small" type="button" data-clear-paint>CLEAR</button>
              </div>
              <div class="content-studio__palette" aria-label="Factory paint palette">
                ${paintPaletteMarkup(draft.visual?.paintPalette)}
              </div>
              <p class="muted">These colors can be assigned to Classifieds listings so the same model does not always appear in one color. Paint needs a usable body layer; atlas-only cars stay on their authored color until layered PNGs are added.</p>
            </section>

            <section class="content-studio__actions">
              <button class="button" type="button" data-save-car>SAVE DRAFT LOCALLY</button>
              <button class="button button--primary" type="button" data-save-reload>ACTIVATE LOCALLY + RELOAD</button>
              <button class="button" type="button" data-export-car>EXPORT CAR JSON</button>
              <button class="button" type="button" data-copy-car>COPY JSON</button>
              ${currentLocal ? '<button class="button button--quiet" type="button" data-delete-override>REMOVE LOCAL OVERRIDE</button>' : ""}
              <p><b>Draft</b> keeps the car in Content Studio only. <b>Activate Locally</b> injects it into this browser\'s game catalog and refreshes Classifieds data. Permanent activation still means committing the exported definition and final art into the repository.</p>
            </section>
          </aside>

          <div class="content-studio__editor">
            ${identitySection(draft)}
            ${releaseSection(draft)}
            ${physicsSection(draft)}
            ${artSection(draft)}
          </div>
        </div>
      </div>`;

    bindWorkspace();
  };

  const bindWorkspace = () => {
    host.querySelector("[data-studio-load]")?.addEventListener("change", (event) => {
      const id = String(event.currentTarget.value || "");
      if (!id) return;
      const localRecord = findContentStudioRecord(id);
      const local = localRecord?.car || null;
      const catalog = catalogCars.find((car) => String(car.catalogId) === id);
      const art = artCars.find((car) => String(car.assetId) === id);
      draft = local || (catalog ? structuredClone(catalog) : artToDraft(art, nextStockId(catalogCars)));
      draft.release = normalizeRelease(draft.release, {
        legacyReleased: Boolean(catalog || (localRecord && localRecord.enabled !== false)),
      });
      lastLoadedId = id;
      ensureDraftShape(draft);
      renderWorkspace();
    });

    host.querySelector("[data-studio-new]")?.addEventListener("click", () => {
      draft = createBlankCar(nextStockId(catalogCars));
      lastLoadedId = "";
      renderWorkspace();
    });

    host.querySelectorAll("[data-studio-field]").forEach((input) => {
      input.addEventListener("input", () => {
        setDraftValue(draft, input.dataset.studioField, readInputValue(input));
        if (input.dataset.studioField === "base.hp") draft.engine.peakHp = Number(draft.base.hp || 0);
        if (input.dataset.studioField === "base.torque") draft.engine.peakTorque = Number(draft.base.torque || 0);
        const field = String(input.dataset.studioField || "");
        if (field.startsWith("visual.layered.layers.") || field === "visual.paintColor") draft.visual.renderMode = "layers";
        refreshLivePreview();
      });
      input.addEventListener("change", refreshLivePreview);
    });

    host.querySelector("[data-release-mode]")?.addEventListener("change", (event) => {
      const mode = String(event.currentTarget.value || "draft");
      draft.release = normalizeRelease(draft.release, { legacyReleased: false });
      draft.release.mode = mode;
      if (mode !== "scheduled") draft.release.publishAt = null;
      renderWorkspace();
    });

    host.querySelector("[data-release-at]")?.addEventListener("change", (event) => {
      draft.release = normalizeRelease(draft.release, { legacyReleased: false });
      draft.release.publishAt = String(event.currentTarget.value || "");
      renderWorkspace();
    });
    host.querySelector("[data-studio-paint]")?.addEventListener("input", (event) => {
      draft.visual.paintColor = String(event.currentTarget.value || "");
      draft.visual.renderMode = "layers";
      const text = host.querySelector('[data-studio-field="visual.paintColor"]');
      if (text) text.value = draft.visual.paintColor;
      refreshLivePreview();
    });

    host.querySelector("[data-clear-paint]")?.addEventListener("click", () => {
      draft.visual.paintColor = null;
      const text = host.querySelector('[data-studio-field="visual.paintColor"]');
      if (text) text.value = "";
      refreshLivePreview();
    });

    host.querySelectorAll("[data-paint-palette]").forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.paintPalette || 0);
        draft.visual.paintPalette ||= [...DEFAULT_PAINT_PALETTE];
        draft.visual.paintPalette[index] = paintValue(input.value);
        draft.visual.paintColor = draft.visual.paintPalette[index];
        draft.visual.renderMode = "layers";
        const previewColor = host.querySelector("[data-studio-paint]");
        const text = host.querySelector('[data-studio-field="visual.paintColor"]');
        if (previewColor) previewColor.value = draft.visual.paintColor;
        if (text) text.value = draft.visual.paintColor;
        refreshLivePreview();
      });
    });

    host.querySelectorAll("[data-layer-upload]").forEach((input) => {
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
          ctx.toast("PNG required", "Car Creator currently accepts PNG layers only.");
          input.value = "";
          return;
        }
        try {
          const dataUrl = await fileToDataUrl(file);
          const dimensions = await imageDimensions(dataUrl);
          const key = input.dataset.layerUpload;
          draft.visual.renderMode = "layers";
          const layer = draft.visual.layered.layers[key] ||= {};
          layer.src = dataUrl;
          layer.source = file.name;
          layer.width = dimensions.width;
          layer.height = dimensions.height;
          if (key === "body" && Number(draft.visual.layered.canvas.width || 0) <= 1) {
            draft.visual.layered.canvas.width = dimensions.width;
            draft.visual.layered.canvas.height = dimensions.height;
          }
          renderWorkspace();
          ctx.toast("PNG loaded", `${file.name} is now the ${key} layer.`);
        } catch (error) {
          ctx.toast("Image load failed", error.message);
        }
      });
    });

    host.querySelector("[data-save-car]")?.addEventListener("click", () => saveDraft(false, false));
    host.querySelector("[data-save-reload]")?.addEventListener("click", () => saveDraft(true, true));
    host.querySelector("[data-export-car]")?.addEventListener("click", () => {
      try {
        const car = finalizedCar(draft, racingConfig, catalogCars);
        downloadJson(car, `${car.catalogId || "forever-racing-car"}.json`);
      } catch (error) {
        ctx.toast("Export blocked", error.message);
      }
    });
    host.querySelector("[data-copy-car]")?.addEventListener("click", async () => {
      try {
        const car = finalizedCar(draft, racingConfig, catalogCars);
        await navigator.clipboard.writeText(JSON.stringify(car, null, 2));
        ctx.toast("Car JSON copied", "Ready to paste into a commit or review.");
      } catch (error) {
        ctx.toast("Copy failed", error.message);
      }
    });
    host.querySelector("[data-delete-override]")?.addEventListener("click", () => {
      if (!draft.catalogId) return;
      deleteContentStudioCar(draft.catalogId);
      ctx.toast("Local override removed", "Reload to return to the repository catalog version.");
      renderWorkspace();
    });
  };

  const refreshLivePreview = () => {
    ensureDraftShape(draft);
    const score = scoreCar(draft, racingConfig);
    const preview = host.querySelector("[data-studio-preview]");
    if (preview) preview.innerHTML = previewMarkup(draft);
    const name = host.querySelector("[data-preview-name]");
    if (name) name.textContent = draft.displayName || "Untitled Car";
    const classNode = host.querySelector("[data-preview-class]");
    if (classNode) classNode.textContent = score.className;
    const pi = host.querySelector("[data-preview-pi]");
    if (pi) pi.textContent = String(score.performanceIndex);
    const et = host.querySelector("[data-preview-et]");
    if (et) et.textContent = `${score.quarterMileEt.toFixed(3)}s`;
    const trap = host.querySelector("[data-preview-trap]");
    if (trap) trap.textContent = `${score.quarterMileTrap.toFixed(1)} mph`;
  };

  const saveDraft = (reload, enabled) => {
    try {
      const car = finalizedCar(draft, racingConfig, catalogCars);
      saveContentStudioCar(car, { enabled });
      draft = structuredClone(car);
      lastLoadedId = car.catalogId;
      if (enabled) localStorage.removeItem(USED_LOT_KEY);
      ctx.toast(
        enabled ? "Car activated locally" : "Draft saved",
        enabled
          ? "Reloading with the car in the local game catalog. Classifieds will regenerate from the updated market pool."
          : "The car stays in Content Studio and will not enter gameplay until activated."
      );
      if (reload) {
        setTimeout(() => location.reload(), 120);
      } else {
        renderWorkspace();
      }
    } catch (error) {
      ctx.toast("Save blocked", error.message);
    }
  };

  renderWorkspace();
}

function identitySection(car) {
  return `
    <section class="content-studio__section">
      <header><div><small>CAR DEFINITION</small><strong>Identity & availability</strong></div></header>
      <div class="studio-form-grid studio-form-grid--4">
        ${inputField("Make", "make", car.make)}
        ${inputField("Model", "model", car.model)}
        ${inputField("Display Name", "displayName", car.displayName)}
        ${inputField("Catalog ID", "catalogId", car.catalogId)}
        ${inputField("Stock ID", "stockId", car.stockId, "number", { min: 1, step: 1 })}
        ${inputField("Base Price", "price", car.price, "number", { min: 0, step: 100 })}
        ${selectField("Starter Car", "starter", String(Boolean(car.starter)), [["false","No"],["true","Yes"]])}
        ${selectField("Classifieds", "market.classifieds", String(car.market?.classifieds !== false), [["true","Listed"],["false","Hidden"]])}
        ${selectField("Showroom", "market.showroom", String(Boolean(car.market?.showroom)), [["false","Hidden"],["true","Listed"]])}
      </div>
      <div class="content-studio__market-note">
        <b>${marketPlacementLabel(car)}</b>
        <span>Classifieds = used-market pool. Showroom = new-car dealer floor. Release status below is the final gate for both stores. Both markets may be enabled; Hidden/Hidden keeps the car out of both.</span>
      </div>
    </section>`;
}

function releaseSection(car) {
  const release = normalizeRelease(car?.release, { legacyReleased: false });
  const status = releaseState({ release });
  const scheduled = release.mode === "scheduled";
  return `
    <section class="content-studio__section content-studio__release">
      <header><div><small>RELEASE</small><strong>Publishing & schedule</strong></div><span class="studio-release-status is-${escapeHtml(status.state)}">${escapeHtml(status.label)}</span></header>
      <div class="studio-form-grid studio-form-grid--4">
        <label class="studio-field">
          <span>Release Mode</span>
          <select data-release-mode>
            <option value="draft" ${release.mode === "draft" ? "selected" : ""}>Keep as Draft</option>
            <option value="instant" ${release.mode === "instant" ? "selected" : ""}>Release Immediately</option>
            <option value="scheduled" ${release.mode === "scheduled" ? "selected" : ""}>Schedule Release</option>
          </select>
        </label>
        <label class="studio-field">
          <span>Release Date & Time</span>
          <input type="datetime-local" value="${escapeHtml(toDatetimeLocalValue(release.publishAt))}" data-release-at ${scheduled ? "" : "disabled"}>
        </label>
      </div>
      <div class="content-studio__release-note">
        <b>${scheduled ? "SCHEDULED RELEASE" : release.mode === "instant" ? "INSTANT RELEASE" : "PRIVATE DRAFT"}</b>
        <span>${scheduled
          ? "The car stays hidden from Classifieds, Showroom and random opponents until this time. The market cache expires at the scheduled release so it becomes eligible immediately afterward."
          : release.mode === "instant"
            ? "Once this car is activated or committed, its selected markets are live immediately."
            : "The car may be saved or locally activated for testing, but public game surfaces keep it hidden."}</span>
      </div>
    </section>`;
}
function physicsSection(car) {
  return `
    <section class="content-studio__section">
      <header><div><small>PHYSICS ENGINE</small><strong>Factory powertrain & performance inputs</strong></div></header>
      <div class="studio-form-grid studio-form-grid--4">
        ${inputField("Displacement (L)", "engine.displacementLiters", car.engine?.displacementLiters, "number", { min: 0.1, step: 0.1 })}
        ${inputField("Engine Config", "engine.configuration", car.engine?.configuration, "text", { placeholder: "I4 / V6 / V8 / Rotary" })}
        ${selectField("Aspiration", "engine.aspiration", car.engine?.aspiration || "Naturally Aspirated", [
          ["Naturally Aspirated","Naturally Aspirated"],["Turbo","Turbo"],["Twin Turbo","Twin Turbo"],["Supercharged","Supercharged"],["Turbo Diesel","Turbo Diesel"]
        ])}
        ${selectField("Engine Layout", "engine.layout", car.engine?.layout || "Front", [["Front","Front"],["Mid","Mid"],["Rear","Rear"]])}

        ${inputField("Peak HP", "base.hp", car.base?.hp, "number", { min: 1, step: 1 })}
        ${inputField("HP RPM", "engine.peakHpRpm", car.engine?.peakHpRpm, "number", { min: 500, step: 50 })}
        ${inputField("Peak Torque", "base.torque", car.base?.torque, "number", { min: 1, step: 1 })}
        ${inputField("TQ RPM", "engine.peakTorqueRpm", car.engine?.peakTorqueRpm, "number", { min: 500, step: 50 })}

        ${inputField("Curb Weight (lb)", "base.weight", car.base?.weight, "number", { min: 500, step: 1 })}
        ${inputField("Grip", "base.grip", car.base?.grip, "number", { min: 0.5, max: 2, step: 0.01 })}
        ${selectField("Drivetrain", "base.drivetrain", car.base?.drivetrain || "RWD", [["FWD","FWD"],["RWD","RWD"],["AWD","AWD"]])}
        ${inputField("Redline RPM", "engine.redlineRpm", car.engine?.redlineRpm, "number", { min: 1000, step: 100 })}
        ${inputField("Rev Cut RPM", "engine.revCutRpm", car.engine?.revCutRpm, "number", { min: 1000, step: 100 })}
      </div>
    </section>`;
}

function artSection(car) {
  const layered = car.visual?.layered || {};
  const anchors = layered.anchors || {};
  const layers = layered.layers || {};
  return `
    <section class="content-studio__section">
      <header><div><small>VISUAL ASSEMBLY</small><strong>Canvas, anchors, PNG layers & XYZ order</strong></div></header>

      <div class="studio-form-grid studio-form-grid--4">
        ${selectField("Game Render Mode", "visual.renderMode", car.visual?.renderMode || "", [["","Certified / Atlas when available"],["layers","Editable Layers"]])}
        ${inputField("Canvas Width", "visual.layered.canvas.width", layered.canvas?.width, "number", { min: 1, step: 1 })}
        ${inputField("Canvas Height", "visual.layered.canvas.height", layered.canvas?.height, "number", { min: 1, step: 1 })}
        ${inputField("Rear Wheel X", "visual.layered.anchors.rearWheelCenter.x", anchors.rearWheelCenter?.x, "number", { step: 0.5 })}
        ${inputField("Rear Wheel Y", "visual.layered.anchors.rearWheelCenter.y", anchors.rearWheelCenter?.y, "number", { step: 0.5 })}
        ${inputField("Front Wheel X", "visual.layered.anchors.frontWheelCenter.x", anchors.frontWheelCenter?.x, "number", { step: 0.5 })}
        ${inputField("Front Wheel Y", "visual.layered.anchors.frontWheelCenter.y", anchors.frontWheelCenter?.y, "number", { step: 0.5 })}
        ${inputField("Rear Bumper X", "visual.layered.anchors.rearBumperX", anchors.rearBumperX, "number", { step: 0.5 })}
        ${inputField("Front Bumper X", "visual.layered.anchors.frontBumperX", anchors.frontBumperX, "number", { step: 0.5 })}
        ${inputField("Ground Y", "visual.layered.anchors.groundY", anchors.groundY, "number", { step: 0.5 })}
      </div>

      <div class="content-studio__layer-table">
        <div class="content-studio__layer-head"><span>LAYER</span><span>PNG</span><span>X OFFSET</span><span>Y OFFSET</span><span>Z</span><span>W</span><span>H</span></div>
        ${["wheel","disk","body","detail"].map((key) => layerRow(key, layers[key] || {}, anchors)).join("")}
      </div>
      <p class="muted">Wheel/disk placement uses the Rear/Front Wheel X/Y defaults above; the layer X/Y fields are optional offsets applied to both. Body/detail X/Y use the source-canvas origin. Z controls stacking.</p>
    </section>`;
}

function layerRow(key, layer, anchors = {}) {
  const source = layer.source || sourceName(layer.src) || "No PNG";
  const positionHint = layerPositionHint(key, anchors);
  return `
    <div class="content-studio__layer-row">
      <div><strong>${key.toUpperCase()}</strong><small>${escapeHtml(source)}</small>${positionHint ? `<small class="studio-layer-position">${escapeHtml(positionHint)}</small>` : ""}</div>
      <label class="studio-file-button">UPLOAD<input type="file" accept="image/png,.png" data-layer-upload="${key}"></label>
      ${miniNumber(`visual.layered.layers.${key}.x`, layer.x ?? 0, 0.5)}
      ${miniNumber(`visual.layered.layers.${key}.y`, layer.y ?? 0, 0.5)}
      ${miniNumber(`visual.layered.layers.${key}.z`, layer.z ?? LAYER_DEFAULT_Z[key], 1)}
      ${miniNumber(`visual.layered.layers.${key}.width`, layer.width ?? "", 1)}
      ${miniNumber(`visual.layered.layers.${key}.height`, layer.height ?? "", 1)}
    </div>`;
}

function layerPositionHint(key, anchors = {}) {
  if (key !== "wheel" && key !== "disk") return "";
  const rear = anchors.rearWheelCenter || {};
  const front = anchors.frontWheelCenter || {};
  if (rear.x == null || rear.y == null || front.x == null || front.y == null) return "";
  return `Default centers: rear ${rear.x},${rear.y} • front ${front.x},${front.y}`;
}

function previewMarkup(car) {
  ensureDraftShape(car);
  const layered = car.visual.layered;
  const a = layered.anchors || {};
  const marker = (name, point, className) => {
    const ratio = previewAnchorRatio(car, point);
    if (!ratio) return "";
    return `<i class="studio-anchor ${className}" title="${escapeHtml(name)}" style="left:${ratio.x * 100}%;top:${ratio.y * 100}%"></i>`;
  };
  return `
    <div class="content-studio__vehicle-wrap">
      ${renderVehicle(car, { view: "sideProfile", className: "content-studio__vehicle" })}
      <div class="content-studio__anchors" aria-hidden="true">
        ${marker("Rear wheel anchor", a.rearWheelCenter, "is-rear")}
        ${marker("Front wheel anchor", a.frontWheelCenter, "is-front")}
      </div>
    </div>`;
}

function scoreCar(car, racingConfig) {
  const benchmark = benchmarkPerformance({
    ...(car.base || {}),
    drivetrain: car.base?.drivetrain || "RWD",
  }, racingConfig);
  return {
    ...benchmark,
    className: performanceClassFromIndex(benchmark.performanceIndex),
  };
}

function finalizedCar(source, racingConfig, catalogCars) {
  const car = structuredClone(source);
  ensureDraftShape(car);
  car.make = String(car.make || "").trim();
  car.model = String(car.model || "").trim();
  car.displayName = String(car.displayName || `${car.make} ${car.model}`).trim();
  car.catalogId = slugify(car.catalogId || car.displayName);
  car.visual.layered.assetId = car.catalogId;
  car.stockId = Math.max(1, Math.round(Number(car.stockId || nextStockId(catalogCars))));
  car.price = Math.max(0, Math.round(Number(car.price || 0)));
  car.starter = Boolean(car.starter);
  car.market.classifieds = Boolean(car.market.classifieds);
  car.market.showroom = Boolean(car.market.showroom);
  car.release = normalizeReleaseForSave(car.release);
  car.visual.paintPalette = normalizePaintPalette(car.visual.paintPalette);
  if (car.visual.paintColor) car.visual.paintColor = paintValue(car.visual.paintColor);
  car.engine.peakHp = Math.max(1, Number(car.base.hp || 1));
  car.engine.peakTorque = Math.max(1, Number(car.base.torque || 1));
  car.base.hp = Math.max(1, Number(car.base.hp || 1));
  car.base.torque = Math.max(1, Number(car.base.torque || 1));
  car.base.weight = Math.max(500, Number(car.base.weight || 500));
  car.base.grip = Math.max(0.5, Number(car.base.grip || 1));

  if (!car.make || !car.model || !car.displayName || !car.catalogId) {
    throw new Error("Make, model, display name and catalog ID are required.");
  }
  const duplicateStock = catalogCars.find((row) => Number(row.stockId) === car.stockId && String(row.catalogId) !== car.catalogId);
  if (duplicateStock) throw new Error(`Stock ID ${car.stockId} is already used by ${duplicateStock.displayName || duplicateStock.catalogId}.`);

  const score = scoreCar(car, racingConfig);
  car.benchmark = {
    quarterMileEt: score.quarterMileEt,
    performanceIndex: score.performanceIndex,
    passes: score.passes,
    version: score.version,
  };
  car.class = score.className;
  car.pricing = { ...(car.pricing || {}), status: "content-studio" };
  return car;
}

function artToDraft(art, stockId) {
  if (!art) return createBlankCar(stockId);
  const layers = {};
  for (const key of ["wheel","disk","body","detail"]) {
    layers[key] = {
      ...(art.layers?.[key] || {}),
      x: Number(art.layers?.[key]?.x || 0),
      y: Number(art.layers?.[key]?.y || 0),
      z: Number(art.layers?.[key]?.z ?? LAYER_DEFAULT_Z[key]),
    };
  }
  const car = createBlankCar(stockId);
  car.visual.renderMode = "";
  car.model = art.displayName || art.sourceName || art.assetId || "";
  car.displayName = art.displayName || art.assetId || "";
  car.catalogId = art.assetId || slugify(car.displayName);
  car.visual.layered = {
    assetId: art.assetId || car.catalogId,
    sourceName: art.sourceName || "",
    canvas: structuredClone(art.canvas || { width: 320, height: 130 }),
    layers,
    anchors: structuredClone(art.anchors || blankAnchors()),
    certifiedSrc: art.certifiedSrc || null,
    certifiedAtlas: art.certifiedAtlas ? structuredClone(art.certifiedAtlas) : null,
  };
  return car;
}

function createBlankCar(stockId) {
  return {
    stockId,
    make: "",
    model: "",
    displayName: "",
    catalogId: "",
    starter: false,
    price: 15000,
    engine: {
      displacementLiters: 2,
      configuration: "I4",
      aspiration: "Naturally Aspirated",
      layout: "Front",
      peakHp: 200,
      peakHpRpm: 6000,
      peakTorque: 180,
      peakTorqueRpm: 4500,
      redlineRpm: 6500,
      revCutRpm: 7000,
    },
    base: { hp: 200, torque: 180, weight: 3000, grip: 1, drivetrain: "RWD" },
    pricing: { status: "content-studio" },
    release: { mode: "draft", publishAt: null },
    visual: {
      paintColor: null,
      paintPalette: [...DEFAULT_PAINT_PALETTE],
      renderMode: "layers",
      layered: {
        assetId: "",
        canvas: { width: 320, height: 130 },
        layers: {
          wheel: { width: 52, height: 52, x: 0, y: 0, z: 1 },
          disk: { width: 38, height: 38, x: 0, y: 0, z: 2 },
          body: { width: 320, height: 120, x: 0, y: 0, z: 3 },
          detail: { width: 320, height: 120, x: 0, y: 0, z: 5 },
        },
        anchors: blankAnchors(),
      },
    },
    market: { classifieds: true, showroom: false },
  };
}

function blankAnchors() {
  return {
    rearWheelCenter: { x: 65, y: 95 },
    frontWheelCenter: { x: 255, y: 95 },
    frontBumperX: 318,
    rearBumperX: 2,
    groundY: 125,
  };
}

function ensureDraftShape(car) {
  car.engine ||= {};
  car.base ||= {};
  car.market ||= {};
  car.release = normalizeRelease(car.release, { legacyReleased: false });
  car.visual ||= {};
  car.visual.paintPalette = normalizePaintPalette(car.visual.paintPalette);
  car.visual.layered ||= {};
  car.visual.layered.canvas ||= { width: 320, height: 130 };
  car.visual.layered.layers ||= {};
  car.visual.layered.anchors ||= blankAnchors();
  car.visual.layered.anchors.rearWheelCenter ||= { x: 65, y: 95 };
  car.visual.layered.anchors.frontWheelCenter ||= { x: 255, y: 95 };
  for (const key of ["wheel","disk","body","detail"]) {
    car.visual.layered.layers[key] ||= {};
    if (car.visual.layered.layers[key].x == null) car.visual.layered.layers[key].x = 0;
    if (car.visual.layered.layers[key].y == null) car.visual.layered.layers[key].y = 0;
    if (car.visual.layered.layers[key].z == null) car.visual.layered.layers[key].z = LAYER_DEFAULT_Z[key];
  }
}

function buildAvailableCars(catalogCars, artCars) {
  const rows = new Map();
  for (const art of artCars) {
    const id = String(art.assetId || "");
    if (!id) continue;
    rows.set(id, { id, label: art.displayName || id, status: "ART READY" });
  }
  for (const car of catalogCars) {
    const id = String(car.catalogId || "");
    if (!id) continue;
    rows.set(id, { id, label: car.displayName || id, status: "PLAYABLE" });
  }
  for (const row of listContentStudioCars()) {
    const car = row?.car;
    const id = String(car?.catalogId || "");
    if (!id) continue;
    rows.set(id, { id, label: car.displayName || id, status: row.enabled === false ? "DRAFT" : "LOCAL" });
  }
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function nextStockId(cars) {
  return Math.max(0, ...cars.map((car) => Number(car.stockId || 0))) + 1;
}

function inputField(label, path, value, type = "text", options = {}) {
  const attrs = [
    options.min != null ? `min="${options.min}"` : "",
    options.max != null ? `max="${options.max}"` : "",
    options.step != null ? `step="${options.step}"` : "",
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : "",
  ].filter(Boolean).join(" ");
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><input type="${type}" value="${escapeHtml(value ?? "")}" data-studio-field="${escapeHtml(path)}" ${attrs}></label>`;
}

function selectField(label, path, value, options) {
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><select data-studio-field="${escapeHtml(path)}">${options.map(([id, text]) => `<option value="${escapeHtml(id)}" ${String(id) === String(value) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
}

function miniNumber(path, value, step) {
  return `<input class="studio-mini-number" type="number" step="${step}" value="${escapeHtml(value)}" data-studio-field="${escapeHtml(path)}">`;
}

function readInputValue(input) {
  if (input.type === "number") return Number(input.value || 0);
  if (input.type === "checkbox") return Boolean(input.checked);
  if (input.tagName === "SELECT" && (input.value === "true" || input.value === "false")) return input.value === "true";
  return input.value;
}

function setDraftValue(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (const key of parts.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = value;
}

function paintValue(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : "#ffffff";
}

function paintPaletteMarkup(palette) {
  return normalizePaintPalette(palette).map((color, index) => `
    <label class="studio-paint-swatch" title="Factory paint ${index + 1}">
      <input type="color" value="${escapeHtml(color)}" data-paint-palette="${index}">
      <span>${index + 1}</span>
    </label>`).join("");
}

function normalizePaintPalette(palette) {
  const source = Array.isArray(palette) ? palette : [];
  return DEFAULT_PAINT_PALETTE.map((fallback, index) => {
    const value = String(source[index] || "").trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  });
}

function marketPlacementLabel(car) {
  const classifieds = car?.market?.classifieds !== false;
  const showroom = car?.market?.showroom === true;
  if (classifieds && showroom) return "MARKET: CLASSIFIEDS + SHOWROOM";
  if (showroom) return "MARKET: SHOWROOM ONLY";
  if (classifieds) return "MARKET: CLASSIFIEDS ONLY";
  return "MARKET: HIDDEN";
}

function previewAnchorRatio(car, point) {
  if (point?.x == null || point?.y == null) return null;
  const layered = car?.visual?.layered || {};
  const canvasWidth = Math.max(1, Number(layered.canvas?.width || 1));
  const canvasHeight = Math.max(1, Number(layered.canvas?.height || 1));
  const px = Number(point.x);
  const py = Number(point.y);
  const editingLayers = String(car?.visual?.renderMode || "") === "layers" || Boolean(String(car?.visual?.paintColor || "").trim());

  if (editingLayers) {
    return { x: clampRatio(px / canvasWidth), y: clampRatio(py / canvasHeight) };
  }

  if (layered.certifiedSrc) {
    const atlas = layered.certifiedAtlas;
    const rootWidth = Math.max(1, Number(atlas?.cellWidth || canvasWidth));
    const rootHeight = Math.max(1, Number(atlas?.cellHeight || canvasHeight));
    const scale = Math.min(rootWidth / canvasWidth, rootHeight / canvasHeight);
    const imageWidth = canvasWidth * scale;
    const imageHeight = canvasHeight * scale;
    const offsetX = (rootWidth - imageWidth) / 2;
    const offsetY = (rootHeight - imageHeight) / 2;
    return {
      x: clampRatio((offsetX + (px * scale)) / rootWidth),
      y: clampRatio((offsetY + (py * scale)) / rootHeight),
    };
  }

  const atlas = layered.certifiedAtlas;
  if (atlas?.src) {
    const cellWidth = Math.max(1, Number(atlas.cellWidth || 360));
    const cellHeight = Math.max(1, Number(atlas.cellHeight || 150));
    const scale = Math.max(0.01, Number(atlas.scale || 1));
    return {
      x: clampRatio((Number(atlas.carX || 0) + (px * scale)) / cellWidth),
      y: clampRatio((Number(atlas.carY || 0) + (py * scale)) / cellHeight),
    };
  }

  return { x: clampRatio(px / canvasWidth), y: clampRatio(py / canvasHeight) };
}

function clampRatio(value) {
  return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
}

function sourceName(src) {
  const value = String(src || "");
  if (!value || value.startsWith("data:")) return "";
  return value.split("/").pop() || "";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the selected PNG."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("The selected PNG could not be decoded."));
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = src;
  });
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
