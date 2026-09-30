import { bindHome, escapeHtml, pageShell } from "../ui/components.js";
import { normalizeCircuitDefinition, validateCircuitDefinition } from "../domain/CircuitCatalog.js";
import {
  deleteContentStudioCircuit,
  findContentStudioCircuit,
  listContentStudioCircuits,
  saveContentStudioCircuit,
} from "../content/ContentStudioCircuitCatalog.js";

const blankRace = (index = 0) => ({
  raceId: `race_${index + 1}`,
  name: `Race ${index + 1}`,
  type: "regular",
  distance: "1/4",
  location: "Local Industrial Strip",
  weather: "Cool & Cloudy",
  recommendation: { class: "D", performanceIndex: 350 + (index * 20), etSeconds: 15.8 - (index * 0.25) },
  opponent: {
    name: `Opponent ${index + 1}`,
    carCatalogId: "golf_gti",
    level: Math.max(1, index + 2),
    buildType: 1,
    paintColor: null,
    stats: { hp: 200, torque: 207, weight: 3034, grip: 1, drivetrain: "FWD" },
  },
  rewards: { credits: 750, exp: 40, rep: 5 },
});

export async function renderCircuitStudio(ctx) {
  const [catalogResponse, carResponse] = await Promise.all([
    ctx.storage.circuitCatalog(),
    ctx.storage.carCatalog(),
  ]);
  const base = catalogResponse.circuits || [];
  const cars = carResponse.cars || [];
  const localRecords = listContentStudioCircuits();
  const allIds = [...new Set([...base.map((row) => row.circuitId), ...localRecords.map((row) => row.circuitId)])];
  let draft = normalizeCircuitDefinition({
    circuitId: "new_circuit",
    name: "New Circuit",
    description: "",
    category: "optional",
    required: false,
    repeatable: true,
    lossRule: "retry_race",
    unlock: { requiresClasses: ["D"], requiresCircuitIds: [] },
    entryRules: { allowedClasses: ["D"], minPerformanceIndex: null, maxPerformanceIndex: 449, buildTypes: [1,2,3,4], drivetrains: [], allowedCarIds: [] },
    recommendation: { class: "D", performanceIndex: 400, etSeconds: 15 },
    completion: { credits: 2500, exp: 150, rep: 20, unlockClass: null, unlockCircuitIds: [] },
    races: [blankRace(0)],
  });

  ctx.screenRoot.innerHTML = pageShell({
    title: "Circuit PvE Creator",
    eyebrow: "CONTENT STUDIO / CIRCUIT SCHEMA V1",
    hint: "Manual authoring + LLM JSON import",
    trail: "1–50 races • restrictions • rivals • rewards",
    body: '<div data-circuit-studio></div>',
  });
  bindHome(ctx.screenRoot, ctx.router);
  const host = ctx.screenRoot.querySelector("[data-circuit-studio]");

  const findDefinition = (id) => findContentStudioCircuit(id)?.circuit || base.find((row) => row.circuitId === id) || null;

  const render = () => {
    const validation = validateCircuitDefinition(draft);
    draft = validation.circuit;
    host.innerHTML = `
      <div class="circuit-studio">
        <div class="content-studio__toolbar">
          <label class="studio-inline-field"><span>LOAD CIRCUIT</span><select data-load-circuit>
            <option value="">Choose...</option>
            ${allIds.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("")}
          </select></label>
          <button class="button button--small" type="button" data-new-circuit>NEW</button>
          <span class="pill ${validation.ok ? "pill--accent" : ""}">${validation.ok ? "VALID SCHEMA V1" : `${validation.errors.length} ERRORS`}</span>
        </div>

        <div class="circuit-studio__layout">
          <aside class="circuit-studio__side">
            <section class="content-studio__preview-card">
              <div class="content-studio__preview-head"><div><small>LLM IMPORT / EXPORT</small><strong>Circuit Schema V1</strong></div></div>
              <textarea class="circuit-json-box" data-circuit-json spellcheck="false">${escapeHtml(JSON.stringify(draft, null, 2))}</textarea>
              <div class="cluster">
                <button class="button button--small" type="button" data-import-json>IMPORT JSON</button>
                <button class="button button--small" type="button" data-copy-json>COPY JSON</button>
                <button class="button button--small" type="button" data-copy-prompt>COPY LLM PROMPT</button>
              </div>
              <p class="muted">Give an LLM a few bullet points, ask it for <b>Forever Racing Circuit Schema V1 JSON only</b>, then paste the result here. The same definition can be edited manually below.</p>
            </section>
            <section class="content-studio__actions">
              <button class="button" type="button" data-save-draft>SAVE LOCAL DRAFT</button>
              <button class="button button--primary" type="button" data-activate>ACTIVATE LOCALLY + RELOAD</button>
              ${findContentStudioCircuit(draft.circuitId) ? '<button class="button button--quiet" type="button" data-delete-local>REMOVE LOCAL OVERRIDE</button>' : ""}
              <div class="form-error">${validation.errors.map((error) => escapeHtml(error)).join("<br>")}</div>
            </section>
          </aside>

          <div class="circuit-studio__editor">
            <section class="studio-section">
              <header><span>EVENT IDENTITY</span><b>${draft.races.length} RACES</b></header>
              <div class="studio-form-grid">
                ${field("Circuit ID", "circuitId", draft.circuitId)}
                ${field("Name", "name", draft.name)}
                ${field("Description", "description", draft.description, "text", "wide")}
                ${selectField("Category", "category", draft.category, ["progression","optional"])}
                ${selectField("Loss Rule", "lossRule", draft.lossRule, ["retry_race","reset_circuit"])}
                ${field("Allowed Classes (CSV)", "entryRules.allowedClasses", draft.entryRules.allowedClasses.join(","))}
                ${field("Max PI", "entryRules.maxPerformanceIndex", draft.entryRules.maxPerformanceIndex ?? "", "number")}
                ${field("Recommended Class", "recommendation.class", draft.recommendation.class || "")}
                ${field("Recommended PI", "recommendation.performanceIndex", draft.recommendation.performanceIndex ?? "", "number")}
                ${field("Recommended 1/4 ET", "recommendation.etSeconds", draft.recommendation.etSeconds ?? "", "number")}
                ${field("Completion Credits", "completion.credits", draft.completion.credits, "number")}
                ${field("Completion EXP", "completion.exp", draft.completion.exp, "number")}
                ${field("Completion REP", "completion.rep", draft.completion.rep, "number")}
                ${field("Unlock Class", "completion.unlockClass", draft.completion.unlockClass || "")}
              </div>
              <div class="cluster circuit-studio__checks">
                <label><input type="checkbox" data-circuit-checkbox="required" ${draft.required ? "checked" : ""}> REQUIRED PROGRESSION</label>
                <label><input type="checkbox" data-circuit-checkbox="repeatable" ${draft.repeatable ? "checked" : ""}> REPEATABLE</label>
              </div>
            </section>

            <section class="studio-section">
              <header><span>RACE LADDER</span><button class="button button--small" type="button" data-add-race>ADD RACE</button></header>
              <div class="circuit-studio__races">
                ${draft.races.map((race, index) => raceEditor(race, index, cars)).join("")}
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    bind();
  };

  const bind = () => {
    host.querySelector("[data-load-circuit]")?.addEventListener("change", (event) => {
      const loaded = findDefinition(event.currentTarget.value);
      if (loaded) {
        draft = normalizeCircuitDefinition(structuredClone(loaded));
        render();
      }
    });
    host.querySelector("[data-new-circuit]")?.addEventListener("click", () => {
      draft = normalizeCircuitDefinition({ circuitId:"new_circuit", name:"New Circuit", races:[blankRace(0)] });
      render();
    });
    host.querySelectorAll("[data-circuit-path]").forEach((input) => {
      input.addEventListener("change", () => {
        const path = input.dataset.circuitPath;
        const value = input.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value;
        if (path === "entryRules.allowedClasses") setPath(draft, path, String(value || "").split(",").map((row) => row.trim().toUpperCase()).filter(Boolean));
        else setPath(draft, path, value);
        render();
      });
    });
    host.querySelectorAll("[data-circuit-checkbox]").forEach((input) => {
      input.addEventListener("change", () => {
        draft[input.dataset.circuitCheckbox] = input.checked;
        render();
      });
    });
    host.querySelectorAll("[data-race-path]").forEach((input) => {
      input.addEventListener("change", () => {
        const index = Number(input.dataset.raceIndex);
        const value = input.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value;
        setPath(draft.races[index], input.dataset.racePath, value);
        render();
      });
    });
    host.querySelectorAll("[data-remove-race]").forEach((button) => {
      button.addEventListener("click", () => {
        draft.races.splice(Number(button.dataset.removeRace), 1);
        render();
      });
    });
    host.querySelector("[data-add-race]")?.addEventListener("click", () => {
      if (draft.races.length >= 50) return ctx.toast("Circuit limit", "Schema V1 supports up to 50 races.");
      draft.races.push(blankRace(draft.races.length));
      render();
    });
    host.querySelector("[data-import-json]")?.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(host.querySelector("[data-circuit-json]").value);
        const validation = validateCircuitDefinition(parsed);
        if (!validation.ok) throw new Error(validation.errors.join(" "));
        draft = validation.circuit;
        ctx.toast("Circuit imported", `${draft.races.length} races loaded from Schema V1 JSON.`);
        render();
      } catch (error) {
        ctx.toast("Import failed", error.message);
      }
    });
    host.querySelector("[data-copy-json]")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(JSON.stringify(normalizeCircuitDefinition(draft), null, 2));
      ctx.toast("Copied", "Circuit Schema V1 JSON copied.");
    });
    host.querySelector("[data-copy-prompt]")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(llmPrompt());
      ctx.toast("Prompt copied", "Paste it into an LLM and add your event bullet points.");
    });
    host.querySelector("[data-save-draft]")?.addEventListener("click", () => save(false));
    host.querySelector("[data-activate]")?.addEventListener("click", () => save(true));
    host.querySelector("[data-delete-local]")?.addEventListener("click", () => {
      deleteContentStudioCircuit(draft.circuitId);
      location.reload();
    });
  };

  const save = (enabled) => {
    const validation = validateCircuitDefinition(draft);
    if (!validation.ok) return ctx.toast("Circuit invalid", validation.errors[0]);
    saveContentStudioCircuit(validation.circuit, enabled);
    if (enabled) location.reload();
    else {
      ctx.toast("Circuit draft saved", "Saved locally in this browser.");
      render();
    }
  };

  render();
}

function raceEditor(race, index, cars) {
  return `
    <article class="circuit-studio-race ${race.type === "boss" ? "is-boss" : ""}">
      <header><span>${race.type === "boss" ? "BOSS" : `RACE ${index + 1}`}</span><b>${escapeHtml(race.name)}</b><button class="button button--quiet button--small" type="button" data-remove-race="${index}" ${index === 0 ? "disabled" : ""}>REMOVE</button></header>
      <div class="studio-form-grid">
        ${raceField("Race ID", index, "raceId", race.raceId)}
        ${raceField("Race Name", index, "name", race.name)}
        ${raceSelect("Type", index, "type", race.type, ["regular","boss"])}
        ${raceSelect("Distance", index, "distance", race.distance, ["1/4","1/2","1"])}
        ${raceField("Location", index, "location", race.location)}
        ${raceField("Weather", index, "weather", race.weather)}
        ${raceField("Recommended PI", index, "recommendation.performanceIndex", race.recommendation.performanceIndex ?? "", "number")}
        ${raceField("Recommended ET", index, "recommendation.etSeconds", race.recommendation.etSeconds ?? "", "number")}
        ${raceField("Opponent Name", index, "opponent.name", race.opponent.name)}
        ${carSelect(index, race.opponent.carCatalogId, cars)}
        ${raceField("Opponent HP", index, "opponent.stats.hp", race.opponent.stats.hp, "number")}
        ${raceField("Opponent TQ", index, "opponent.stats.torque", race.opponent.stats.torque, "number")}
        ${raceField("Opponent Weight", index, "opponent.stats.weight", race.opponent.stats.weight, "number")}
        ${raceField("Opponent Grip", index, "opponent.stats.grip", race.opponent.stats.grip, "number")}
        ${raceSelect("Opponent Drivetrain", index, "opponent.stats.drivetrain", race.opponent.stats.drivetrain, ["FWD","RWD","AWD"])}
        ${raceField("Credits", index, "rewards.credits", race.rewards.credits, "number")}
        ${raceField("EXP", index, "rewards.exp", race.rewards.exp, "number")}
        ${raceField("REP", index, "rewards.rep", race.rewards.rep, "number")}
      </div>
    </article>
  `;
}

function field(label, path, value, type = "text", extra = "") {
  return `<label class="studio-field ${extra}"><span>${escapeHtml(label)}</span><input type="${type}" value="${escapeHtml(value ?? "")}" data-circuit-path="${escapeHtml(path)}" ${type === "number" ? 'step="any"' : ""}></label>`;
}
function selectField(label, path, value, options) {
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><select data-circuit-path="${escapeHtml(path)}">${options.map((option) => `<option value="${escapeHtml(option)}" ${String(option) === String(value) ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
}
function raceField(label, index, path, value, type = "text") {
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><input type="${type}" value="${escapeHtml(value ?? "")}" data-race-index="${index}" data-race-path="${escapeHtml(path)}" ${type === "number" ? 'step="any"' : ""}></label>`;
}
function raceSelect(label, index, path, value, options) {
  return `<label class="studio-field"><span>${escapeHtml(label)}</span><select data-race-index="${index}" data-race-path="${escapeHtml(path)}">${options.map((option) => `<option value="${escapeHtml(option)}" ${String(option) === String(value) ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
}
function carSelect(index, value, cars) {
  return `<label class="studio-field"><span>Opponent Car</span><select data-race-index="${index}" data-race-path="opponent.carCatalogId">${cars.map((car) => `<option value="${escapeHtml(car.catalogId || "")}" ${String(car.catalogId) === String(value) ? "selected" : ""}>${escapeHtml(car.displayName || car.catalogId)}</option>`).join("")}</select></label>`;
}
function setPath(target, path, value) {
  const parts = String(path).split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node[parts[i]] ||= {};
    node = node[parts[i]];
  }
  node[parts.at(-1)] = value;
}
function llmPrompt() {
  return `Create a Forever Racing PvE Circuit using Circuit Schema V1.

Return JSON only. Do not use Markdown fences.

Rules:
- 1 to 50 races.
- circuitId and every raceId must be unique stable IDs.
- Every race needs distance: "1/4", "1/2", or "1".
- Every opponent needs a real Forever Racing carCatalogId plus authored hp, torque, weight, grip, and drivetrain.
- Difficulty should come from the authored opponent build, never from scaling against the player's car.
- Each race should include recommended class / PI / ET guidance and rewards.
- Use type "boss" for rival/final races.
- lossRule is "retry_race" or "reset_circuit".
- Required progression Circuits may use completion.unlockClass.

I will provide the theme, race count, progression intent, filters, opponents or ET targets as bullet points after this prompt.`;
}
