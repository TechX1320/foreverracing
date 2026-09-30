import { bindHome, carLabel, escapeHtml, money, number, pageShell, selectedCar } from "../ui/components.js";
import { playRacePresentation } from "../ui/racePresentation.js";
import { circuitEntryStatus } from "../domain/CircuitCatalog.js";

let lastRace = null;
let playbackRaceId = null;

export async function renderRoguelike(ctx) {
  const player = ctx.store.player;
  const response = await ctx.storage.circuitCatalog();
  const circuits = response.circuits || [];
  const activeRun = player?.circuits?.activeRun || null;
  const activeRace = player?.activeRace?.origin === "circuit" ? player.activeRace : null;
  const current = selectedCar(player);
  const runCircuit = activeRun ? circuits.find((row) => row.circuitId === activeRun.circuitId) : null;
  const runCar = activeRun
    ? (player.garage || []).find((car) => String(car.carId) === String(activeRun.carId))
    : null;

  ctx.screenRoot.innerHTML = pageShell({
    title: "The Circuit",
    eyebrow: "PVE MINI-ROGUELITE EVENTS",
    hint: activeRun && runCircuit
      ? `${runCircuit.name} • Race ${Math.min(Number(activeRun.raceIndex || 0) + 1, runCircuit.races.length)}/${runCircuit.races.length}`
      : `${circuits.length} event${circuits.length === 1 ? "" : "s"} available`,
    trail: "Progression • optional challenges • rivals",
    body: `
      ${lastRace ? resultBanner(lastRace) : ""}
      ${activeRun && runCircuit
        ? activeRunMarkup(player, runCircuit, activeRun, runCar)
        : eventBoard(player, circuits, current)}
    `,
  });

  bindHome(ctx.screenRoot, ctx.router);

  ctx.screenRoot.querySelectorAll("[data-enter-circuit]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.circuitStart(button.dataset.enterCircuit);
        lastRace = null;
        ctx.store.setPlayer(data.player);
        ctx.toast("Circuit entered", "Your car is locked into this event run until you finish or leave it.");
        await renderRoguelike(ctx);
      } catch (error) {
        ctx.toast("Cannot enter Circuit", error.message);
        button.disabled = false;
      }
    });
  });

  ctx.screenRoot.querySelector("[data-start-circuit-race]")?.addEventListener("click", async (event) => {
    if (!runCircuit || ctx.store.player?.activeRace) return;
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.startCircuitRace(runCircuit.circuitId);
      ctx.store.setPlayer(data.player);
      await completeCircuitRace(ctx, data.activeRace);
    } catch (error) {
      ctx.toast("Race blocked", error.message);
      event.currentTarget.disabled = false;
    }
  });

  ctx.screenRoot.querySelector("[data-abandon-circuit]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.circuitAbandon();
      lastRace = null;
      ctx.store.setPlayer(data.player);
      ctx.toast("Circuit left", "Progress from cleared races stays recorded; this active run was ended.");
      await renderRoguelike(ctx);
    } catch (error) {
      ctx.toast("Could not leave Circuit", error.message);
      event.currentTarget.disabled = false;
    }
  });

  if (activeRace) {
    queueMicrotask(() => {
      void completeCircuitRace(ctx, activeRace);
    });
  }
}

async function completeCircuitRace(ctx, activeRace) {
  if (!activeRace?.raceId || playbackRaceId === String(activeRace.raceId)) return;
  playbackRaceId = String(activeRace.raceId);
  try {
    const data = await playRacePresentation(ctx, activeRace);
    lastRace = data.race || null;
    ctx.store.setPlayer(data.player);
    if (data.circuitResult?.completed) {
      const unlock = data.circuitResult.unlockClass ? ` • ${data.circuitResult.unlockClass} CLASS UNLOCKED` : "";
      ctx.toast("Circuit complete", `Boss cleared${unlock}`);
    } else {
      ctx.toast(data.race?.won ? "Circuit race won" : "Circuit race lost",
        data.race?.won
          ? `+${money(data.race?.reward || 0)} CR • next race unlocked`
          : "Retry the current race when you are ready.");
    }
    await renderRoguelike(ctx);
  } catch (error) {
    ctx.toast("Race presentation interrupted", error.message);
  } finally {
    playbackRaceId = null;
  }
}

function eventBoard(player, circuits, car) {
  const unlocked = (player?.progression?.unlockedClasses || ["D"]).join(" • ");
  return `
    <section class="circuit-career-strip">
      <span><small>UNLOCKED CLASSES</small><b>${escapeHtml(unlocked)}</b></span>
      <span><small>CIRCUITS CLEARED</small><b>${number(Object.values(player?.circuits?.progress || {}).filter((row) => row?.completed).length)}</b></span>
      <span><small>CURRENT CAR</small><b>${car ? escapeHtml(carLabel(car)) : "NONE"}</b></span>
      <span><small>CURRENT PI</small><b>${car ? `${escapeHtml(car.performanceClass || "—")} • ${number(car.performanceIndex || 0)}` : "—"}</b></span>
    </section>
    ${!car ? '<div class="empty-state"><strong>Select a Current Car first.</strong><span>The Circuit evaluates the actual car you enter, including its PI, Build Type and restrictions.</span><div style="margin-top:12px"><button class="button button--primary button--small" data-nav="garage">OPEN GARAGE</button></div></div>' : ""}
    <div class="circuit-event-grid">
      ${circuits
        .slice()
        .sort((a, b) => Number(b.required) - Number(a.required))
        .map((circuit) => circuitCard(player, circuit, car))
        .join("")}
    </div>
  `;
}

function circuitCard(player, circuit, car) {
  const entry = circuitEntryStatus(circuit, player, car);
  const progress = player?.circuits?.progress?.[circuit.circuitId] || {};
  const completed = progress.completed === true;
  const rec = circuit.recommendation || {};
  const classText = rec.class ? `${rec.class} CLASS` : "OPEN CLASS";
  const piText = rec.performanceIndex != null ? `PI ${number(rec.performanceIndex)}` : "NO PI TARGET";
  const etText = rec.etSeconds != null ? `≤ ${number(rec.etSeconds, 2)}s 1/4` : "NO ET TARGET";
  const maxPi = circuit.entryRules?.maxPerformanceIndex;
  return `
    <article class="circuit-event-card ${circuit.required ? "is-required" : ""} ${completed ? "is-complete" : ""}">
      <header>
        <div><span class="section-label">${circuit.required ? "REQUIRED PROGRESSION" : "OPTIONAL CIRCUIT"}</span><h3>${escapeHtml(circuit.name)}</h3></div>
        <span class="pill ${completed ? "pill--accent" : ""}">${completed ? "CLEARED" : `${circuit.races.length} RACES`}</span>
      </header>
      <p>${escapeHtml(circuit.description || "")}</p>
      <div class="circuit-event-card__targets">
        <span><small>RECOMMENDED</small><b>${escapeHtml(classText)}</b></span>
        <span><small>PERFORMANCE</small><b>${escapeHtml(piText)}</b></span>
        <span><small>1/4 TARGET</small><b>${escapeHtml(etText)}</b></span>
        <span><small>ENTRY CAP</small><b>${maxPi == null ? "OPEN" : `PI ${number(maxPi)}`}</b></span>
      </div>
      <div class="circuit-race-dots" aria-label="${circuit.races.length} races">
        ${circuit.races.map((race) => `<i class="${race.type === "boss" ? "is-boss" : ""}" title="${escapeHtml(race.name)}"></i>`).join("")}
      </div>
      ${entry.ok ? "" : `<div class="circuit-entry-blocked">${escapeHtml(entry.reasons.join(" • "))}</div>`}
      <footer>
        <span>${escapeHtml(circuit.lossRule === "reset_circuit" ? "LOSS RESETS CIRCUIT" : "LOSS RETRIES CURRENT RACE")}</span>
        <button class="button button--primary button--small" type="button" data-enter-circuit="${escapeHtml(circuit.circuitId)}" ${entry.ok ? "" : "disabled"}>${completed ? "RUN AGAIN" : "ENTER CIRCUIT"}</button>
      </footer>
    </article>
  `;
}

function activeRunMarkup(player, circuit, run, car) {
  const index = Math.max(0, Number(run.raceIndex || 0));
  const race = circuit.races[index] || null;
  if (!race) return '<div class="empty-state"><strong>Circuit run is out of sync.</strong><span>Leave this run and re-enter the event.</span></div>';
  const rec = race.recommendation || {};
  return `
    <section class="circuit-run-head">
      <div>
        <span class="section-label">${circuit.required ? "REQUIRED PROGRESSION" : "OPTIONAL CIRCUIT"}</span>
        <h2>${escapeHtml(circuit.name)}</h2>
        <p>${escapeHtml(circuit.description || "")}</p>
      </div>
      <div class="circuit-run-head__stats">
        <span><small>CAR</small><b>${car ? escapeHtml(carLabel(car)) : "MISSING"}</b></span>
        <span><small>RUN W/L</small><b>${number(run.wins || 0)} / ${number(run.losses || 0)}</b></span>
        <span><small>RUN CREDITS</small><b>${money(run.runCredits || 0)}</b></span>
        <span><small>PROGRESS</small><b>${Math.min(index + 1, circuit.races.length)} / ${circuit.races.length}</b></span>
      </div>
    </section>

    <div class="circuit-race-list">
      ${circuit.races.map((item, raceIndex) => raceRow(item, raceIndex, index)).join("")}
    </div>

    <section class="circuit-next-race ${race.type === "boss" ? "is-boss" : ""}">
      <div class="circuit-next-race__identity">
        <span class="section-label">${race.type === "boss" ? "BOSS / RIVAL RACE" : `RACE ${index + 1}`}</span>
        <h3>${escapeHtml(race.name)}</h3>
        <p>${escapeHtml(race.opponent.name)} • ${escapeHtml(race.distance === "1" ? "1 MILE" : race.distance + " MILE")} • ${escapeHtml(race.location)}</p>
      </div>
      <div class="circuit-next-race__targets">
        <span><small>RECOMMENDED CLASS</small><b>${escapeHtml(rec.class || circuit.recommendation?.class || "—")}</b></span>
        <span><small>RECOMMENDED PI</small><b>${rec.performanceIndex == null ? "—" : number(rec.performanceIndex)}</b></span>
        <span><small>MINIMUM ET TARGET</small><b>${rec.etSeconds == null ? "—" : `≤ ${number(rec.etSeconds, 2)}s`}</b></span>
        <span><small>WIN REWARD</small><b class="good">${money(race.rewards?.credits || 0)} CR</b></span>
      </div>
      <div class="circuit-next-race__actions">
        <button class="button button--primary" type="button" data-start-circuit-race>${race.type === "boss" ? "RACE THE RIVAL" : "STAGE NEXT RACE"}</button>
        <button class="button button--quiet button--small" type="button" data-abandon-circuit>LEAVE CIRCUIT</button>
      </div>
    </section>
  `;
}

function raceRow(race, raceIndex, currentIndex) {
  const cleared = raceIndex < currentIndex;
  const current = raceIndex === currentIndex;
  return `
    <div class="circuit-race-row ${cleared ? "is-cleared" : ""} ${current ? "is-current" : ""} ${race.type === "boss" ? "is-boss" : ""}">
      <span class="circuit-race-row__number">${race.type === "boss" ? "BOSS" : String(raceIndex + 1).padStart(2, "0")}</span>
      <span><b>${escapeHtml(race.name)}</b><small>${escapeHtml(race.opponent.name)} • ${escapeHtml(race.distance)} mi</small></span>
      <span><small>REC ET</small><b>${race.recommendation?.etSeconds == null ? "—" : `${number(race.recommendation.etSeconds, 2)}s`}</b></span>
      <span class="${cleared ? "good" : current ? "warn" : ""}">${cleared ? "CLEARED" : current ? "NEXT" : "LOCKED"}</span>
    </div>
  `;
}

function resultBanner(race) {
  const result = race?.circuitResult || {};
  if (result.completed) {
    return `<div class="result-banner result-banner--win"><strong>CIRCUIT COMPLETE • ${escapeHtml(race.circuitRaceName || "Boss cleared")}</strong><div class="screen-copy">${result.unlockClass ? `${escapeHtml(result.unlockClass)} Class progression unlocked. ` : ""}Completion bonus: ${money(result.completionCredits || 0)} CR.</div></div>`;
  }
  return race?.won
    ? `<div class="result-banner result-banner--win"><strong>${escapeHtml(race.circuitRaceName || "Race")} cleared</strong><div class="screen-copy">+${money(race.reward || 0)} CR • next race unlocked.</div></div>`
    : `<div class="result-banner result-banner--loss"><strong>${escapeHtml(race.circuitRaceName || "Race")} lost</strong><div class="screen-copy">The current race remains available to retry. Improve the car or stage again.</div></div>`;
}
