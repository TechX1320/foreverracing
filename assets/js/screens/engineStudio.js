import { bindHome, escapeHtml, pageShell } from "../ui/components.js";
import {
  deriveHorsepower,
  engineLabel,
  generateBaselineCurve,
  normalizeEngineDefinition,
  normalizePowerCurve,
  validateEngineCurve,
} from "../domain/EngineCatalog.js";
import {
  deleteContentStudioEngine,
  findContentStudioEngineRecord,
  listContentStudioEngines,
  mergeContentStudioEngines,
  saveContentStudioEngine,
} from "../content/ContentStudioEngineCatalog.js";

export async function renderEngineStudio(ctx) {
  const build = String(document.documentElement.dataset.build || "").trim();
  const suffix = build ? `?v=${encodeURIComponent(build)}` : "";
  const response = await fetch(`data/catalog/engines.json${suffix}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load engine catalog (${response.status}).`);

  const baseEngines = await response.json();
  let engines = mergeContentStudioEngines(Array.isArray(baseEngines) ? baseEngines : [], { includeDrafts: true });
  const root = ctx.screenRoot;

  root.innerHTML = pageShell({
    title: "Content Studio",
    eyebrow: "DEVELOPMENT / CONTENT TOOLS",
    hint: "Engine Creator • Parts Tool next",
    trail: "Browser-local authoring workspace",
    body: '<div data-engine-studio></div>',
  });
  bindHome(root, ctx.router);

  const host = root.querySelector("[data-engine-studio]");
  let draft = createBlankEngine();
  let loadedId = "";
  const requestedEngineId = String(sessionStorage.getItem("foreverRacing.engineStudio.openEngineId") || "");
  if (requestedEngineId) {
    sessionStorage.removeItem("foreverRacing.engineStudio.openEngineId");
    const requested = engines.find((engine) => String(engine.engineId) === requestedEngineId);
    if (requested) {
      draft = normalizeEngineDefinition(requested);
      loadedId = requestedEngineId;
    }
  }

  const render = () => {
    const normalized = normalizeEngineDefinition(draft);
    const record = findContentStudioEngineRecord(normalized.engineId);
    const localState = record ? (record.enabled === false ? "LOCAL DRAFT" : "LOCAL ACTIVE") : "SOURCE / UNSAVED";
    const issues = validateEngineCurve(normalized);

    host.innerHTML = `
      <div class="content-studio engine-studio">
        <div class="content-studio__modules">
          <button type="button" class="content-studio__module" data-open-car-creator>
            <b>CAR CREATOR</b><span>ACTIVE</span>
          </button>
          <button type="button" class="content-studio__module is-active">
            <b>ENGINE CREATOR</b><span>ACTIVE</span>
          </button>
          <button type="button" class="content-studio__module" disabled>
            <b>PARTS TOOL</b><span>NEXT</span>
          </button>
          <button type="button" class="content-studio__module" disabled>
            <b>WHEELS TOOL</b><span>PLANNED</span>
          </button>
        </div>

        <div class="content-studio__toolbar">
          <label class="studio-inline-field">
            <span>LOAD ENGINE</span>
            <select data-engine-load>
              <option value="">Choose an engine...</option>
              ${buildEngineOptions(engines, loadedId)}
            </select>
          </label>
          <button class="button button--small" type="button" data-engine-new>NEW ENGINE</button>
          <span class="pill ${record?.enabled ? "pill--accent" : ""}">${escapeHtml(localState)}</span>
        </div>

        <div class="content-studio__workspace engine-studio__workspace">
          <aside class="content-studio__preview-column">
            <section class="content-studio__preview-card">
              <div class="content-studio__preview-head">
                <div><small>ENGINE PREVIEW</small><strong data-engine-preview-name>${escapeHtml(normalized.name || "Untitled Engine")}</strong></div>
                <span class="pill">${escapeHtml(normalized.configuration || "-")}</span>
              </div>
              <div class="engine-studio__hero">
                <span><small>PEAK HP</small><b>${numberOrDash(normalized.peakHp)}</b><em>@ ${numberOrDash(normalized.peakHpRpm)} RPM</em></span>
                <span><small>PEAK TQ</small><b>${numberOrDash(normalized.peakTorque)}</b><em>@ ${numberOrDash(normalized.peakTorqueRpm)} RPM</em></span>
                <span><small>REDLINE</small><b>${numberOrDash(normalized.redlineRpm)}</b><em>Limiter ${numberOrDash(normalized.revCutRpm)}</em></span>
              </div>
              <div class="engine-studio__dyno" data-engine-chart>
                ${dynoChart(normalized)}
              </div>
              <div class="engine-studio__legend"><span class="is-hp">HP</span><span class="is-tq">Torque (lb-ft)</span></div>
              <p class="content-studio__score-note">Torque points are the editable source. Horsepower is always derived from HP = Torque × RPM / 5252.</p>
            </section>

            <section class="content-studio__preview-card">
              <div class="content-studio__preview-head"><div><small>VALIDATION</small><strong>${issues.length ? `${issues.length} item${issues.length === 1 ? "" : "s"} to review` : "Curve anchors look good"}</strong></div></div>
              <div class="engine-studio__issues">
                ${issues.length ? issues.map((issue) => `<p>${escapeHtml(issue)}</p>`).join("") : "<p class=\"good\">Peak output, redline and curve are internally consistent enough to save.</p>"}
              </div>
            </section>

            <section class="content-studio__actions">
              <button class="button" type="button" data-engine-save>SAVE ENGINE DRAFT</button>
              <button class="button button--primary" type="button" data-engine-activate>ACTIVATE ENGINE LOCALLY</button>
              <button class="button" type="button" data-engine-export>EXPORT ENGINE JSON</button>
              <button class="button" type="button" data-engine-copy>COPY JSON</button>
              ${record ? '<button class="button button--quiet" type="button" data-engine-delete>REMOVE LOCAL OVERRIDE</button>' : ""}
              <p>Activated local engines become available in Car Creator's Factory Engine selector. Permanent engines still move into the repository catalog through a normal commit.</p>
            </section>
          </aside>

          <div class="content-studio__editor">
            ${identitySection(normalized)}
            ${specSection(normalized)}
            ${outputSection(normalized)}
            ${curveSection(normalized)}
          </div>
        </div>
      </div>`;

    bind();
  };

  const bind = () => {
    host.querySelector("[data-open-car-creator]")?.addEventListener("click", () => ctx.router.navigate("content-studio"));

    host.querySelector("[data-engine-load]")?.addEventListener("change", (event) => {
      const id = String(event.currentTarget.value || "");
      if (!id) return;
      const local = findContentStudioEngineRecord(id)?.engine;
      const source = engines.find((engine) => String(engine.engineId) === id);
      draft = normalizeEngineDefinition(local || source || createBlankEngine());
      loadedId = id;
      render();
    });

    host.querySelector("[data-engine-new]")?.addEventListener("click", () => {
      draft = createBlankEngine();
      loadedId = "";
      render();
    });

    host.querySelectorAll("[data-engine-field]").forEach((input) => {
      input.addEventListener("input", () => {
        setValue(draft, input.dataset.engineField, readValue(input));
        refresh();
      });
      input.addEventListener("change", refresh);
    });

    host.querySelectorAll("[data-curve-rpm],[data-curve-torque]").forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.curveIndex || 0);
        draft.powerCurve ||= [];
        draft.powerCurve[index] ||= { rpm: 1000, torqueLbFt: 100 };
        if (input.dataset.curveRpm != null) draft.powerCurve[index].rpm = Number(input.value || 0);
        if (input.dataset.curveTorque != null) draft.powerCurve[index].torqueLbFt = Number(input.value || 0);
        refresh();
      });
    });

    host.querySelectorAll("[data-remove-curve]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.removeCurve || 0);
        draft.powerCurve ||= [];
        draft.powerCurve.splice(index, 1);
        render();
      });
    });

    host.querySelector("[data-add-curve]")?.addEventListener("click", () => {
      const curve = normalizePowerCurve(draft.powerCurve || []);
      const last = curve.at(-1);
      curve.push({ rpm: Number(last?.rpm || 500) + 500, torqueLbFt: Number(last?.torqueLbFt || draft.peakTorque || 100) });
      draft.powerCurve = curve;
      render();
    });

    host.querySelector("[data-generate-curve]")?.addEventListener("click", () => {
      draft.powerCurve = generateBaselineCurve(draft);
      draft.curveType = "estimated";
      draft.curveNotes = draft.curveNotes || "Generated baseline from peak anchors; refine with research/dyno evidence before final release.";
      render();
      ctx.toast("Baseline curve generated", "Torque points were created around the current peak HP/TQ anchors.");
    });

    host.querySelector("[data-engine-save]")?.addEventListener("click", () => save(false));
    host.querySelector("[data-engine-activate]")?.addEventListener("click", () => save(true));
    host.querySelector("[data-engine-export]")?.addEventListener("click", () => {
      try {
        const engine = finalizeEngine(draft);
        downloadJson(engine, `${engine.engineId}.json`);
      } catch (error) {
        ctx.toast("Export blocked", error.message);
      }
    });
    host.querySelector("[data-engine-copy]")?.addEventListener("click", async () => {
      try {
        const engine = finalizeEngine(draft);
        await navigator.clipboard.writeText(JSON.stringify(engine, null, 2));
        ctx.toast("Engine JSON copied", "Ready to paste into a commit or review.");
      } catch (error) {
        ctx.toast("Copy failed", error.message);
      }
    });
    host.querySelector("[data-engine-delete]")?.addEventListener("click", () => {
      if (!draft.engineId) return;
      deleteContentStudioEngine(draft.engineId);
      ctx.toast("Local engine override removed", "The repository engine will be used again.");
      render();
    });
  };

  const refresh = () => {
    const normalized = normalizeEngineDefinition(draft);
    const chart = host.querySelector("[data-engine-chart]");
    if (chart) chart.innerHTML = dynoChart(normalized);
    const name = host.querySelector("[data-engine-preview-name]");
    if (name) name.textContent = normalized.name || "Untitled Engine";

    host.querySelectorAll("[data-curve-hp]").forEach((node) => {
      const index = Number(node.dataset.curveHp || 0);
      const point = normalized.powerCurve[index];
      node.textContent = point ? deriveHorsepower(point.rpm, point.torqueLbFt).toFixed(1) : "-";
    });
  };

  const save = (enabled) => {
    try {
      const engine = finalizeEngine(draft);
      saveContentStudioEngine(engine, { enabled });
      engines = mergeContentStudioEngines(Array.isArray(baseEngines) ? baseEngines : [], { includeDrafts: true });
      draft = structuredClone(engine);
      loadedId = engine.engineId;
      ctx.toast(
        enabled ? "Engine activated locally" : "Engine draft saved",
        enabled ? "This engine is now available to Car Creator in this browser." : "The engine stays in Content Studio until activated."
      );
      render();
    } catch (error) {
      ctx.toast("Save blocked", error.message);
    }
  };

  render();
}

function identitySection(engine) {
  return `
    <section class="content-studio__section">
      <header><div><small>ENGINE DEFINITION</small><strong>Family, variant & identity</strong></div></header>
      <div class="studio-form-grid studio-form-grid--4">
        ${field("Manufacturer", "manufacturer", engine.manufacturer, "text", { placeholder: "Mazda" })}
        ${field("Family Name", "familyName", engine.familyName, "text", { placeholder: "13B-MSP Renesis" })}
        ${field("Variant Name", "variantName", engine.variantName, "text", { placeholder: "238 hp 6MT" })}
        ${field("Display Name", "name", engine.name)}
        ${field("Family ID", "familyId", engine.familyId, "text", { placeholder: "mazda_13b_msp" })}
        ${field("Engine ID", "engineId", engine.engineId, "text", { placeholder: "mazda_13b_msp_238" })}
        ${field("Tags", "tags", engine.tags.join(", "), "text", { placeholder: "rotary, na, high_rpm" })}
      </div>
    </section>`;
}

function specSection(engine) {
  return `
    <section class="content-studio__section">
      <header><div><small>HARDWARE</small><strong>Core engine specifications & fitment</strong></div></header>
      <div class="studio-form-grid studio-form-grid--4">
        ${field("Displacement (L)", "displacementLiters", engine.displacementLiters, "number", { min: 0.1, step: 0.1 })}
        ${field("Configuration", "configuration", engine.configuration, "text", { placeholder: "I4 / V6 / V8 / Rotary" })}
        ${select("Aspiration", "aspiration", engine.aspiration, [
          ["Naturally Aspirated","Naturally Aspirated"],["Turbo","Turbo"],["Twin Turbo","Twin Turbo"],["Supercharged","Supercharged"],["Turbo Diesel","Turbo Diesel"]
        ])}
        ${field("Compression Ratio", "compressionRatio", engine.compressionRatio ?? "", "number", { min: 1, step: 0.1 })}
        ${field("Engine Weight (lb)", "engineWeightLb", engine.engineWeightLb ?? "", "number", { min: 1, step: 1 })}
        ${field("Size Class", "sizeClass", engine.sizeClass, "number", { min: 1, max: 8, step: 1 })}
        ${field("Orientations", "orientations", engine.orientations.join(", "), "text", { placeholder: "transverse, longitudinal" })}
      </div>
    </section>`;
}

function outputSection(engine) {
  return `
    <section class="content-studio__section">
      <header><div><small>POWER ANCHORS</small><strong>OEM-style output references</strong></div></header>
      <div class="studio-form-grid studio-form-grid--4">
        ${field("Peak HP", "peakHp", engine.peakHp, "number", { min: 1, step: 1 })}
        ${field("Peak HP RPM", "peakHpRpm", engine.peakHpRpm, "number", { min: 500, step: 50 })}
        ${field("Peak Torque", "peakTorque", engine.peakTorque, "number", { min: 1, step: 1 })}
        ${field("Peak TQ RPM", "peakTorqueRpm", engine.peakTorqueRpm, "number", { min: 500, step: 50 })}
        ${field("Redline RPM", "redlineRpm", engine.redlineRpm, "number", { min: 1000, step: 100 })}
        ${field("Limiter / Rev Cut", "revCutRpm", engine.revCutRpm, "number", { min: 1000, step: 100 })}
        ${select("Curve Evidence", "curveType", engine.curveType, [
          ["estimated","Estimated / Reconstructed"],["measured","Measured Dyno"],["oem","OEM Supplied"],["game-baseline","Game Baseline"]
        ])}
        ${field("Curve Notes", "curveNotes", engine.curveNotes, "text", { placeholder: "Source/shape notes..." })}
      </div>
    </section>`;
}

function curveSection(engine) {
  const curve = normalizePowerCurve(engine.powerCurve);
  return `
    <section class="content-studio__section">
      <header>
        <div><small>DYNO CURVE</small><strong>Torque-first power curve</strong></div>
        <div class="engine-studio__header-actions">
          <button class="button button--small" type="button" data-generate-curve>GENERATE BASELINE</button>
          <button class="button button--small" type="button" data-add-curve>ADD POINT</button>
        </div>
      </header>
      <div class="engine-studio__curve-head">
        <span>RPM</span><span>TORQUE (LB-FT)</span><span>DERIVED HP</span><span></span>
      </div>
      <div class="engine-studio__curve-list">
        ${curve.length ? curve.map((point, index) => curveRow(point, index)).join("") : '<div class="engine-studio__empty">No curve yet. Enter the peak anchors above, then Generate Baseline.</div>'}
      </div>
      <p class="muted engine-studio__curve-note">This intentionally mirrors the familiar dyno workflow: define the engine and verified peak anchors, edit torque by RPM, and let horsepower stay mathematically consistent.</p>
    </section>`;
}

function curveRow(point, index) {
  return `
    <div class="engine-studio__curve-row">
      <input type="number" min="250" step="50" value="${escapeHtml(point.rpm)}" data-curve-rpm data-curve-index="${index}">
      <input type="number" min="0" step="0.1" value="${escapeHtml(point.torqueLbFt)}" data-curve-torque data-curve-index="${index}">
      <output data-curve-hp="${index}">${deriveHorsepower(point.rpm, point.torqueLbFt).toFixed(1)}</output>
      <button class="button button--small button--quiet" type="button" data-remove-curve="${index}">×</button>
    </div>`;
}

function dynoChart(engine) {
  const curve = normalizePowerCurve(engine.powerCurve);
  if (curve.length < 2) return '<div class="engine-studio__chart-empty">Generate or enter at least two curve points.</div>';

  const points = curve.map((point) => ({ ...point, hp: deriveHorsepower(point.rpm, point.torqueLbFt) }));
  const maxRpm = Math.max(...points.map((point) => point.rpm), Number(engine.revCutRpm || 0), 1000);
  const maxY = Math.max(...points.flatMap((point) => [point.hp, point.torqueLbFt]), 100) * 1.08;
  const width = 560;
  const height = 260;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const x = (rpm) => padL + ((rpm / maxRpm) * plotW);
  const y = (value) => padT + plotH - ((value / maxY) * plotH);
  const hpLine = points.map((point) => `${x(point.rpm).toFixed(1)},${y(point.hp).toFixed(1)}`).join(" ");
  const tqLine = points.map((point) => `${x(point.rpm).toFixed(1)},${y(point.torqueLbFt).toFixed(1)}`).join(" ");
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
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Engine horsepower and torque curve">
      <g class="engine-chart-axis">${xTicks}${yTicks}</g>
      <polyline points="${tqLine}" class="engine-chart-line engine-chart-line--tq"/>
      <polyline points="${hpLine}" class="engine-chart-line engine-chart-line--hp"/>
    </svg>`;
}

function finalizeEngine(source) {
  const engine = normalizeEngineDefinition(source);
  engine.engineId = slugify(engine.engineId || engine.name);
  engine.familyId = slugify(engine.familyId || engine.familyName || engine.engineId);
  engine.manufacturer = String(engine.manufacturer || "").trim();
  engine.familyName = String(engine.familyName || engine.name || "").trim();
  engine.variantName = String(engine.variantName || "").trim();
  engine.name = String(engine.name || [engine.manufacturer, engine.familyName, engine.variantName].filter(Boolean).join(" ")).trim();
  engine.tags = uniqueList(source.tags);
  engine.orientations = uniqueList(source.orientations);
  engine.powerCurve = normalizePowerCurve(source.powerCurve);

  const issues = validateEngineCurve(engine);
  if (issues.length) throw new Error(issues[0]);

  engine.sourceStatus = "engine-tool";
  return engine;
}

function createBlankEngine() {
  return {
    engineId: "",
    familyId: "",
    manufacturer: "",
    familyName: "",
    variantName: "",
    name: "",
    displacementLiters: 2,
    configuration: "I4",
    aspiration: "Naturally Aspirated",
    compressionRatio: null,
    engineWeightLb: null,
    sizeClass: 3,
    orientations: ["longitudinal"],
    peakHp: 200,
    peakHpRpm: 6000,
    peakTorque: 180,
    peakTorqueRpm: 4500,
    redlineRpm: 6500,
    revCutRpm: 7000,
    tags: [],
    curveType: "estimated",
    curveNotes: "",
    powerCurve: [],
    sourceStatus: "engine-tool",
  };
}

function buildEngineOptions(engines, selected) {
  const localIds = new Set(listContentStudioEngines().map((row) => String(row?.engine?.engineId || "")));
  return [...engines]
    .map(normalizeEngineDefinition)
    .sort((a, b) => engineLabel(a).localeCompare(engineLabel(b)))
    .map((engine) => `<option value="${escapeHtml(engine.engineId)}" ${engine.engineId === selected ? "selected" : ""}>${escapeHtml(engineLabel(engine))} — ${localIds.has(engine.engineId) ? "LOCAL" : engine.sourceStatus === "legacy" ? "LEGACY" : "CATALOG"}</option>`)
    .join("");
}

function field(label, path, value, type = "text", options = {}) {
  const attrs = [
    options.min != null ? `min="${options.min}"` : "",
    options.max != null ? `max="${options.max}"` : "",
    options.step != null ? `step="${options.step}"` : "",
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : "",
  ].filter(Boolean).join(" ");
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><input type="${type}" value="${escapeHtml(value ?? "")}" data-engine-field="${escapeHtml(path)}" ${attrs}></label>`;
}

function select(label, path, value, options) {
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><select data-engine-field="${escapeHtml(path)}">${options.map(([id, text]) => `<option value="${escapeHtml(id)}" ${String(id) === String(value) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
}

function readValue(input) {
  if (input.type === "number") return input.value === "" ? null : Number(input.value);
  return input.value;
}

function setValue(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (const key of parts.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  if (parts.at(-1) === "tags" || parts.at(-1) === "orientations") cursor[parts.at(-1)] = uniqueList(value);
  else cursor[parts.at(-1)] = value;
}

function uniqueList(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function numberOrDash(value) {
  const number = Number(value || 0);
  return number > 0 ? Math.round(number).toLocaleString() : "-";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
