import { bindHome, escapeHtml, pageShell } from "../ui/components.js";
import { benchmarkPerformance, performanceClassFromIndex } from "../domain/PerformanceIndex.js";
import { normalizePartDefinition, applyPartEffects, partCompatibility, partLifecycleState } from "../domain/PartCatalog.js";
import {
  deleteContentStudioPart,
  findContentStudioPartRecord,
  listContentStudioParts,
  mergeContentStudioParts,
  saveContentStudioPart,
} from "../content/ContentStudioPartCatalog.js";

const CATEGORIES = [
  ["intake","Intake"],["exhaust","Exhaust"],["ecu","ECU"],["fuel","Fuel"],
  ["drivetrain","Drivetrain"],["suspension","Suspension"],["tires","Tires"],
  ["weight","Weight Reduction"],["engine_kit","Engine Kit"],["forced_induction","Forced Induction"],
  ["engine","Engine"],["tuning","Tuning Hardware"],["other","Other"],
];

export async function renderPartsStudio(ctx) {
  const build = String(document.documentElement.dataset.build || "").trim();
  const suffix = build ? `?v=${encodeURIComponent(build)}` : "";
  const [baseResponse, engineResponse, carData, racingResponse] = await Promise.all([
    fetch(`data/catalog/parts.json${suffix}`, { cache: "no-store" }),
    fetch(`data/catalog/engines.json${suffix}`, { cache: "no-store" }),
    ctx.storage.carCatalog(),
    fetch(`data/config/racing.json${suffix}`, { cache: "no-store" }),
  ]);
  if (!baseResponse.ok) throw new Error(`Unable to load parts catalog (${baseResponse.status}).`);
  if (!engineResponse.ok) throw new Error(`Unable to load engine catalog (${engineResponse.status}).`);
  if (!racingResponse.ok) throw new Error(`Unable to load racing config (${racingResponse.status}).`);

  const baseParts = await baseResponse.json();
  const engines = await engineResponse.json();
  const cars = Array.isArray(carData?.cars) ? carData.cars : [];
  const racingConfig = await racingResponse.json();
  let parts = mergeContentStudioParts(Array.isArray(baseParts) ? baseParts : [], { includeDrafts: true });
  const root = ctx.screenRoot;

  root.innerHTML = pageShell({
    title: "Content Studio",
    eyebrow: "DEVELOPMENT / CONTENT TOOLS",
    hint: "Parts Creator • engine-first compatibility",
    trail: "Browser-local authoring workspace",
    body: '<div data-parts-studio></div>',
  });
  bindHome(root, ctx.router);

  const host = root.querySelector("[data-parts-studio]");
  let draft = createBlankPart();
  let loadedId = "";
  let testCarId = cars[0]?.catalogId || "";

  const render = () => {
    const part = normalizePartDefinition(draft);
    const record = findContentStudioPartRecord(part.catalogId);
    const localState = record ? (record.enabled === false ? "LOCAL DRAFT" : "LOCAL ACTIVE") : "SOURCE / UNSAVED";
    const testCar = cars.find((car) => String(car.catalogId) === String(testCarId)) || cars[0] || null;
    const preview = previewPart(part, testCar, racingConfig);
    const lifecycle = partLifecycleState(part);
    const compatibility = testCar ? partCompatibility(part, { ...testCar, buildStage: part.buildStage, engineId: testCar.factoryEngineId }) : { ok: true, reason: "" };

    host.innerHTML = `
      <div class="content-studio parts-studio">
        <div class="content-studio__modules">
          <button type="button" class="content-studio__module" data-open-car-creator><b>CAR CREATOR</b><span>ACTIVE</span></button>
          <button type="button" class="content-studio__module" data-open-engine-creator><b>ENGINE CREATOR</b><span>ACTIVE</span></button>
          <button type="button" class="content-studio__module is-active"><b>PARTS CREATOR</b><span>ACTIVE</span></button>
          <button type="button" class="content-studio__module" disabled><b>WHEELS TOOL</b><span>PLANNED</span></button>
        </div>

        <div class="content-studio__toolbar">
          <label class="studio-inline-field">
            <span>LOAD PART</span>
            <select data-part-load>
              <option value="">Choose a part...</option>
              ${partOptions(parts, loadedId)}
            </select>
          </label>
          <button class="button button--small" type="button" data-part-new>NEW PART</button>
          <button class="button button--small" type="button" data-part-clone ${part.catalogId ? "" : "disabled"}>CLONE</button>
          <span class="pill ${record?.enabled ? "pill--accent" : ""}">${escapeHtml(localState)}</span>
        </div>

        <div class="content-studio__workspace parts-studio__workspace">
          <aside class="content-studio__preview-column">
            <section class="content-studio__preview-card">
              <div class="content-studio__preview-head">
                <div><small>PART PREVIEW</small><strong>${escapeHtml(part.name || "Untitled Part")}</strong></div>
                <span class="pill">${escapeHtml(lifecycle.toUpperCase())}</span>
              </div>
              <div class="parts-studio__summary">
                <span><small>STAGE</small><b>${part.buildStage}</b></span>
                <span><small>CATEGORY</small><b>${escapeHtml(part.category || part.categoryKey)}</b></span>
                <span><small>PRICE</small><b>${Number(part.price || 0).toLocaleString()} CR</b></span>
              </div>
              <div class="parts-studio__effect-list">
                ${part.effects.length ? part.effects.map(effect => `<div><span>${escapeHtml(effect.stat.toUpperCase())}</span><b>${effect.op === "mul" ? "×" : effect.value >= 0 ? "+" : ""}${escapeHtml(effect.value)}</b></div>`).join("") : '<p class="muted">No effects authored yet.</p>'}
              </div>
            </section>

            <section class="content-studio__preview-card">
              <div class="content-studio__preview-head">
                <div><small>LIVE TEST CAR</small><strong>${escapeHtml(testCar?.displayName || "No car available")}</strong></div>
                <span class="performance-class-tag">${escapeHtml(preview.afterClass || "-")}</span>
              </div>
              <label class="studio-field">
                <span>TEST CAR</span>
                <select data-test-car>
                  ${cars.map(car => `<option value="${escapeHtml(car.catalogId)}" ${String(car.catalogId) === String(testCarId) ? "selected" : ""}>${escapeHtml(car.displayName || car.catalogId)}</option>`).join("")}
                </select>
              </label>
              <div class="parts-studio__preview-stats">
                <div><span>HP</span><b>${preview.before.hp} → ${preview.after.hp}</b></div>
                <div><span>TQ</span><b>${preview.before.torque} → ${preview.after.torque}</b></div>
                <div><span>WT</span><b>${preview.before.weight} → ${preview.after.weight}</b></div>
                <div><span>GRIP</span><b>${preview.before.grip} → ${preview.after.grip}</b></div>
                <div><span>PI</span><b>${preview.beforePi} → ${preview.afterPi}</b></div>
              </div>
              <div class="parts-studio__compat ${compatibility.ok ? "is-good" : "is-bad"}">
                <b>${compatibility.ok ? "COMPATIBLE" : "BLOCKED"}</b>
                <span>${escapeHtml(compatibility.ok ? "This test car matches the current authoring rules." : compatibility.reason)}</span>
              </div>
            </section>

            <section class="content-studio__actions">
              <button class="button" type="button" data-part-save>SAVE PART DRAFT</button>
              <button class="button button--primary" type="button" data-part-activate>ACTIVATE PART LOCALLY</button>
              <button class="button" type="button" data-part-export>EXPORT PART JSON</button>
              <button class="button" type="button" data-part-copy>COPY JSON</button>
              ${record ? '<button class="button button--quiet" type="button" data-part-delete>REMOVE LOCAL OVERRIDE</button>' : ""}
              <p>Local activation makes the definition available to the browser-local Parts shop after reload. Permanent content still moves into the repository catalog through a normal commit.</p>
            </section>
          </aside>

          <div class="content-studio__editor">
            ${identitySection(part)}
            ${availabilitySection(part, engines, cars)}
            ${effectsSection(part)}
            ${rulesSection(part)}
            ${lifecycleSection(part)}
          </div>
        </div>
      </div>`;

    bind();
  };

  const bind = () => {
    host.querySelector("[data-open-car-creator]")?.addEventListener("click", () => ctx.router.navigate("content-studio"));
    host.querySelector("[data-open-engine-creator]")?.addEventListener("click", () => ctx.router.navigate("engine-studio"));

    host.querySelector("[data-part-load]")?.addEventListener("change", (event) => {
      const id = String(event.currentTarget.value || "");
      if (!id) return;
      const local = findContentStudioPartRecord(id)?.part;
      const source = parts.find((row) => String(row.catalogId) === id);
      draft = normalizePartDefinition(local || source || createBlankPart());
      loadedId = id;
      render();
    });

    host.querySelector("[data-part-new]")?.addEventListener("click", () => {
      draft = createBlankPart();
      loadedId = "";
      render();
    });

    host.querySelector("[data-part-clone]")?.addEventListener("click", () => {
      const source = normalizePartDefinition(draft);
      draft = structuredClone(source);
      draft.catalogId = "";
      draft.name = source.name ? `${source.name} Copy` : "";
      draft.lifecycle = { ...draft.lifecycle, status: "draft" };
      loadedId = "";
      render();
    });

    host.querySelector("[data-test-car]")?.addEventListener("change", (event) => {
      testCarId = String(event.currentTarget.value || "");
      render();
    });

    host.querySelectorAll("[data-part-field]").forEach((input) => {
      input.addEventListener("input", () => {
        setDraftValue(draft, input.dataset.partField, readValue(input));
        renderPreviewOnly();
      });
      input.addEventListener("change", () => {
        setDraftValue(draft, input.dataset.partField, readValue(input));
        render();
      });
    });

    host.querySelectorAll("[data-effect-value],[data-effect-op]").forEach((input) => {
      input.addEventListener("change", () => {
        const stat = String(input.dataset.effectStat || "");
        draft.effects ||= [];
        let row = draft.effects.find((effect) => effect.stat === stat);
        if (!row) {
          row = { stat, op: "add", value: 0 };
          draft.effects.push(row);
        }
        if (input.dataset.effectValue != null) row.value = Number(input.value || 0);
        if (input.dataset.effectOp != null) row.op = String(input.value || "add");
        render();
      });
    });

    host.querySelector("[data-part-save]")?.addEventListener("click", () => save(false));
    host.querySelector("[data-part-activate]")?.addEventListener("click", () => save(true));
    host.querySelector("[data-part-export]")?.addEventListener("click", () => {
      try {
        const part = finalizePart(draft, { strict: false });
        downloadJson(part, `${part.catalogId}.json`);
      } catch (error) { ctx.toast("Export blocked", error.message); }
    });
    host.querySelector("[data-part-copy]")?.addEventListener("click", async () => {
      try {
        const part = finalizePart(draft, { strict: false });
        await navigator.clipboard.writeText(JSON.stringify(part, null, 2));
        ctx.toast("Part JSON copied", "Ready to paste into a commit or review.");
      } catch (error) { ctx.toast("Copy failed", error.message); }
    });
    host.querySelector("[data-part-delete]")?.addEventListener("click", () => {
      if (!draft.catalogId) return;
      deleteContentStudioPart(draft.catalogId);
      parts = mergeContentStudioParts(Array.isArray(baseParts) ? baseParts : [], { includeDrafts: true });
      ctx.toast("Local part override removed", "The repository part will be used again.");
      render();
    });
  };

  const renderPreviewOnly = () => {
    const current = normalizePartDefinition(draft);
    const name = host.querySelector(".content-studio__preview-head strong");
    if (name) name.textContent = current.name || "Untitled Part";
  };

  const save = (enabled) => {
    try {
      const part = finalizePart(draft, { strict: enabled });
      saveContentStudioPart(part, { enabled });
      parts = mergeContentStudioParts(Array.isArray(baseParts) ? baseParts : [], { includeDrafts: true });
      draft = structuredClone(part);
      loadedId = part.catalogId;
      ctx.toast(enabled ? "Part activated locally" : "Part draft saved", enabled
        ? "Reload the page to test this definition in the browser-local Parts catalog."
        : "The part remains Content Studio-only until activated.");
      render();
    } catch (error) {
      ctx.toast("Save blocked", error.message);
    }
  };

  render();
}

function identitySection(part) {
  return `
    <section class="content-studio__section">
      <header><div><small>PART IDENTITY</small><strong>Name, category & slot</strong></div></header>
      <div class="studio-form-grid studio-form-grid--4">
        ${field("Manufacturer", "manufacturer", part.manufacturer, "text", { placeholder: "Garrett / HKS / FR Works" })}
        ${field("Part Name", "name", part.name, "text", { placeholder: "GTX3076R Turbocharger" })}
        ${field("Part ID", "catalogId", part.catalogId, "text", { placeholder: "fiat_14t_gtx3076r" })}
        ${select("Category", "categoryKey", part.categoryKey, CATEGORIES)}
        ${field("Category Label", "category", part.category)}
        ${field("Shop Subcategory", "subCategory", part.subCategory, "text", { placeholder: "Injectors / Clutch / Cams / Tires" })}
        ${field("Slot", "slot", part.slot, "text", { placeholder: "turbocharger" })}
        ${field("Tags", "tags", part.tags.join(", "), "text", { placeholder: "turbo, drag, high_rpm" })}
        ${field("Price (CR)", "price", part.price, "number", { min: 0, step: 50 })}
      </div>
      ${textarea("Description", "description", part.description, "What makes this part different?")}
    </section>`;
}

function availabilitySection(part, engines, cars) {
  return `
    <section class="content-studio__section">
      <header><div><small>AVAILABILITY</small><strong>Build Type + compatibility</strong></div></header>
      <div class="studio-form-grid studio-form-grid--4">
        ${select("Build Stage", "buildStage", part.buildStage, [[1,"1 — Street Car"],[2,"2 — Street Race Car"],[3,"3 — Front-Half Race Car"],[4,"4 — Full Race Car"]])}
        ${field("Persistent From Stage", "persistentFromStage", part.persistentFromStage, "number", { min: part.buildStage, max: 4, step: 1 })}
        ${part.buildStage === 1 ? field("Simple Tier", "simpleTier", part.simpleTier || 1, "number", { min: 1, max: 3, step: 1 }) : ""}
        ${select("Required For Stage Progression", "requiredForStageProgression", part.requiredForStageProgression ? "true" : "false", [["true","Yes"],["false","No / optional"]])}
      </div>
      <div class="studio-form-grid studio-form-grid--2">
        ${field("Compatible Engine IDs", "compatibility.engineIds", part.compatibility.engineIds.join(", "), "text", { placeholder: engines.slice(0,3).map(e=>e.engineId).join(", ") })}
        ${field("Compatible Car IDs", "compatibility.carCatalogIds", part.compatibility.carCatalogIds.join(", "), "text", { placeholder: cars.slice(0,3).map(c=>c.catalogId).join(", ") })}
        ${field("Exclude Car IDs", "compatibility.excludeCarCatalogIds", part.compatibility.excludeCarCatalogIds.join(", "), "text")}
        ${field("Compatible Build Stages", "compatibility.buildStages", part.compatibility.buildStages.join(", "), "text", { placeholder: "2, 3, 4" })}
        ${field("Aspiration", "compatibility.aspiration", part.compatibility.aspiration.join(", "), "text", { placeholder: "Turbo, Naturally Aspirated" })}
        ${field("Engine Configurations", "compatibility.engineConfigurations", part.compatibility.engineConfigurations.join(", "), "text", { placeholder: "I4, V8, Rotary" })}
        ${field("Required Engine Tags", "compatibility.tagsRequired", part.compatibility.tagsRequired.join(", "), "text")}
        ${field("Blocked Engine Tags", "compatibility.tagsBlocked", part.compatibility.tagsBlocked.join(", "), "text")}
      </div>
      <p class="muted">Engine IDs are the primary performance-part relationship. Leave a field blank for no restriction.</p>
    </section>`;
}

function effectsSection(part) {
  const byStat = new Map(part.effects.map((row) => [row.stat, row]));
  return `
    <section class="content-studio__section">
      <header><div><small>EFFECTS</small><strong>Current simulator-supported stats</strong></div></header>
      <div class="parts-studio__effects-grid">
        ${["hp","torque","weight","grip"].map((stat) => {
          const row = byStat.get(stat) || { stat, op: "add", value: 0 };
          return `<label class="studio-field"><span>${stat.toUpperCase()}</span><div class="parts-studio__effect-input"><select data-effect-op data-effect-stat="${stat}"><option value="add" ${row.op === "add" ? "selected" : ""}>ADD</option><option value="mul" ${row.op === "mul" ? "selected" : ""}>MULTIPLY</option></select><input type="number" step="${stat === "grip" ? "0.001" : "0.01"}" value="${escapeHtml(row.value)}" data-effect-value data-effect-stat="${stat}"></div></label>`;
        }).join("")}
      </div>
      <p class="muted">Zero-value effects are removed when saved. Powerband/boost/redline fields stay out until the simulator supports them directly.</p>
    </section>`;
}

function rulesSection(part) {
  return `
    <section class="content-studio__section">
      <header><div><small>BUILD RULES</small><strong>Requirements & conflicts</strong></div></header>
      <div class="studio-form-grid studio-form-grid--2">
        ${field("Requires All Tags", "requires.allTags", part.requires.allTags.join(", "), "text", { placeholder: "turbo, fuel_support" })}
        ${field("Requires Any Part IDs", "requires.anyPartIds", part.requires.anyPartIds.join(", "), "text")}
        ${field("Conflict Tags", "conflicts.tags", part.conflicts.tags.join(", "), "text", { placeholder: "supercharger" })}
        ${field("Conflict Part IDs", "conflicts.partIds", part.conflicts.partIds.join(", "), "text")}
      </div>
    </section>`;
}

function lifecycleSection(part) {
  return `
    <section class="content-studio__section">
      <header><div><small>LIFECYCLE</small><strong>Release, deprecation & replacement</strong></div></header>
      <div class="studio-form-grid studio-form-grid--4">
        ${select("Status", "lifecycle.status", part.lifecycle.status, [["draft","Draft"],["active","Release Now / Active"],["scheduled","Scheduled"],["deprecated","Deprecated"],["retired","Retired"]])}
        ${field("Available From", "lifecycle.availableFrom", toLocalDate(part.lifecycle.availableFrom), "datetime-local")}
        ${field("Deprecated At", "lifecycle.deprecatedAt", toLocalDate(part.lifecycle.deprecatedAt), "datetime-local")}
        ${field("Replacement Part ID", "lifecycle.replacementPartId", part.lifecycle.replacementPartId || "", "text")}
      </div>
      <p class="muted">Deprecated or retired parts stay valid in existing inventories but disappear from normal new purchases.</p>
    </section>`;
}

function createBlankPart() {
  return normalizePartDefinition({
    catalogId: "",
    manufacturer: "",
    name: "",
    description: "",
    category: "Intake",
    categoryKey: "intake",
    subCategory: "General",
    slot: "intake",
    buildStage: 2,
    persistentFromStage: 2,
    requiredForStageProgression: true,
    price: 2500,
    tags: [],
    effects: [
      { stat: "hp", op: "add", value: 0 },
      { stat: "torque", op: "add", value: 0 },
      { stat: "weight", op: "add", value: 0 },
      { stat: "grip", op: "add", value: 0 },
    ],
    compatibility: {},
    requires: {},
    conflicts: {},
    lifecycle: { status: "draft" },
  });
}

function finalizePart(source, { strict = true } = {}) {
  const part = normalizePartDefinition(source);
  part.catalogId = slugify(part.catalogId || part.name);
  part.name = String(part.name || "").trim();
  part.categoryKey = slugify(part.categoryKey || part.category || "part");
  part.slot = slugify(part.slot || part.categoryKey);
  part.category = String(part.category || labelForCategory(part.categoryKey)).trim();
  part.subCategory = String(source.subCategory || part.subCategory || "General").trim() || "General";
  part.tags = list(source.tags);
  part.compatibility = {
    engineIds: list(source.compatibility?.engineIds),
    carCatalogIds: list(source.compatibility?.carCatalogIds),
    excludeCarCatalogIds: list(source.compatibility?.excludeCarCatalogIds),
    buildStages: numberList(source.compatibility?.buildStages),
    aspiration: list(source.compatibility?.aspiration),
    engineConfigurations: list(source.compatibility?.engineConfigurations),
    tagsRequired: list(source.compatibility?.tagsRequired),
    tagsBlocked: list(source.compatibility?.tagsBlocked),
  };
  part.requires = { allTags: list(source.requires?.allTags), anyPartIds: list(source.requires?.anyPartIds) };
  part.conflicts = { tags: list(source.conflicts?.tags), partIds: list(source.conflicts?.partIds) };
  part.effects = (source.effects || []).map((row) => ({ stat: row.stat, op: row.op === "mul" ? "mul" : "add", value: Number(row.value || 0) }))
    .filter((row) => row.op === "mul" ? row.value !== 1 && row.value !== 0 : row.value !== 0);
  if (!part.catalogId) throw new Error("Part ID or Part Name is required.");
  if (strict && !part.name) throw new Error("Part Name is required before activation.");
  if (strict && !part.categoryKey) throw new Error("Category is required before activation.");
  if (part.lifecycle.status === "scheduled" && !part.lifecycle.availableFrom) throw new Error("Scheduled parts need an Available From date.");
  part.sourceStatus = "parts-tool";
  return part;
}

function previewPart(part, car, racingConfig) {
  const before = {
    hp: Math.round(Number(car?.base?.hp || 1)),
    torque: Math.round(Number(car?.base?.torque || 1)),
    weight: Math.round(Number(car?.base?.weight || 500)),
    grip: Number(car?.base?.grip || 1),
  };
  const after = applyPartEffects(before, part.effects);
  const beforeBench = benchmarkPerformance(before, racingConfig);
  const afterBench = benchmarkPerformance(after, racingConfig);
  return {
    before, after,
    beforePi: beforeBench.performanceIndex,
    afterPi: afterBench.performanceIndex,
    beforeClass: performanceClassFromIndex(beforeBench.performanceIndex),
    afterClass: performanceClassFromIndex(afterBench.performanceIndex),
  };
}

function partOptions(parts, selected) {
  const localIds = new Set(listContentStudioParts().map((row) => String(row?.part?.catalogId || "")));
  return [...parts].sort((a,b) => String(a.category || "").localeCompare(String(b.category || "")) || String(a.name || "").localeCompare(String(b.name || "")))
    .map((part) => `<option value="${escapeHtml(part.catalogId)}" ${String(part.catalogId) === String(selected) ? "selected" : ""}>${escapeHtml(part.category || "Part")} • ${escapeHtml(part.name || part.catalogId)}${localIds.has(String(part.catalogId)) ? " • LOCAL" : ""}</option>`)
    .join("");
}

function field(label, path, value, type = "text", opts = {}) {
  const attrs = [
    opts.min != null ? `min="${opts.min}"` : "",
    opts.max != null ? `max="${opts.max}"` : "",
    opts.step != null ? `step="${opts.step}"` : "",
    opts.placeholder ? `placeholder="${escapeHtml(opts.placeholder)}"` : "",
  ].filter(Boolean).join(" ");
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><input type="${escapeHtml(type)}" value="${escapeHtml(value ?? "")}" data-part-field="${escapeHtml(path)}" ${attrs}></label>`;
}

function textarea(label, path, value, placeholder = "") {
  return `<label class="studio-field studio-field--wide"><span>${escapeHtml(label)}</span><textarea data-part-field="${escapeHtml(path)}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || "")}</textarea></label>`;
}

function select(label, path, value, options) {
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><select data-part-field="${escapeHtml(path)}">${options.map(([id,text]) => `<option value="${escapeHtml(id)}" ${String(id) === String(value) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
}

function setDraftValue(target, path, value) {
  const keys = String(path || "").split(".");
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    cursor[keys[index]] ||= {};
    cursor = cursor[keys[index]];
  }
  const key = keys.at(-1);
  if (!key) return;
  if (["buildStage","persistentFromStage","simpleTier","price"].includes(key)) cursor[key] = Number(value || 0);
  else if (key === "requiredForStageProgression") cursor[key] = String(value) === "true";
  else cursor[key] = value;
}

function readValue(input) {
  if (input.type === "number") return Number(input.value || 0);
  return String(input.value || "");
}

function list(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))];
}

function numberList(value) {
  return list(value).map(Number).filter(Number.isFinite);
}

function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function labelForCategory(key) {
  return CATEGORIES.find(([id]) => id === key)?.[1] || key;
}

function toLocalDate(value) {
  const text = String(value || "");
  if (!text) return "";
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,16);
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}
