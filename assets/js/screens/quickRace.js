import { bindHome, carLabel, escapeHtml, money, number, pageShell, selectedCar } from "../ui/components.js";
import { playRacePresentation } from "../ui/racePresentation.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";

let lastRace = null;
let selectedDistance = "1/4";
let playbackRaceId = null;

const DISTANCES = [
  { key: "1/4", label: "1/4 MILE", short: "1320 FT", unlockLevel: 1, button: "START 1/4 MI" },
  { key: "1/2", label: "1/2 MILE", short: "2640 FT", unlockLevel: 5, button: "START 1/2 MI" },
  { key: "1", label: "1 MILE", short: "5280 FT", unlockLevel: 10, button: "START 1 MI" },
];

export async function renderQuickRace(ctx) {
  const player = ctx.store.player;
  const activeRace = player?.activeRace || null;
  const tutorialRace = player?.tutorial?.status === "active" && player?.tutorial?.step === "first_race";
  const level = Number(player?.progression?.level || 1);
  if (activeRace?.distance) selectedDistance = activeRace.distance;
  else if (tutorialRace || !DISTANCES.some((row) => row.key === selectedDistance && level >= row.unlockLevel)) selectedDistance = "1/4";

  const current = selectedCar(player);
  const result = lastRace;
  let preview = null;
  if (current && !activeRace) {
    try {
      preview = (await ctx.storage.quickRacePreview())?.preview || null;
    } catch (err) {
      console.warn("Unable to load Quick Race preview", err);
    }
  }

  ctx.screenRoot.innerHTML = pageShell({
    title: "Quick Race",
    eyebrow: "DRAG STRIP",
    hint: current ? carLabel(current) : "No current car",
    trail: activeRace ? "Race in progress" : "Choose an unlocked distance",
    body: `
      ${tutorialRace ? `<section class="ftue-focus-panel ftue-focus-panel--race">
        <div class="ftue-focus-panel__step">STEP 5/5</div>
        <div class="ftue-focus-panel__copy"><span>FIRST PASS</span><strong>Run the 1/4 mile.</strong><p>Your first race uses clear conditions, you cannot red-light, and the opponent is intentionally beginner-friendly.</p></div>
        <div class="ftue-focus-panel__arrow">↓ START 1/4 MI</div>
      </section>` : ""}
      <div class="race-distance-tabs race-distance-tabs--actions" role="group" aria-label="Start race">
        ${DISTANCES.map((row) => {
          const locked = tutorialRace ? row.key !== "1/4" : level < row.unlockLevel;
          return `<button type="button" class="button race-distance-button race-distance-button--start ${tutorialRace && row.key === "1/4" ? "button--primary tutorial-target" : ""} ${locked ? "is-locked" : ""}" data-run-distance="${row.key}" ${activeRace || locked || !current ? "disabled" : ""}><b>${locked ? row.label : row.button}</b><span>${locked ? `UNLOCKS LV ${row.unlockLevel}` : row.short}</span></button>`;
        }).join("")}
      </div>
      ${result ? raceResult(result) : ""}
      ${current ? racePreview(current, preview, player) : `
        <div class="empty-state"><strong>You need a Current Car.</strong><span>Buy a car and select it in the Garage first.</span><div class="cluster" style="justify-content:center;margin-top:14px"><button class="button button--primary button--small" data-go-garage>Open Garage</button><button class="button button--small" data-go-showroom>Showroom</button></div></div>`}
      ${raceHistory(player)}
      <details class="collapsible-section">
        <summary>HOW QUICK RACE WORKS</summary>
        <p>Choose an unlocked distance above to stage immediately. The opponent shown in Race Preview is the matchup the simulator will use. Rewards, EXP and records are committed only after the cars reach the finish.</p>
      </details>
    `,
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-go-garage]")?.addEventListener("click", () => ctx.router.navigate("garage"));
  ctx.screenRoot.querySelector("[data-go-showroom]")?.addEventListener("click", () => ctx.router.navigate("showroom"));
  ctx.screenRoot.querySelectorAll("[data-run-distance]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (ctx.store.player?.activeRace) return;
      const row = DISTANCES.find((item) => item.key === button.dataset.runDistance);
      if (!row || (tutorialRace && row.key !== "1/4") || level < row.unlockLevel) return;

      selectedDistance = row.key;
      button.disabled = true;
      button.querySelector("b").textContent = "STAGING…";
      try {
        const wasTutorialRace = ctx.store.player?.tutorial?.status === "active" && ctx.store.player?.tutorial?.step === "first_race";
        const data = await ctx.storage.startQuickRace(row.key);
        ctx.store.setPlayer(data.player);
        await completeActiveRace(ctx, data.activeRace, wasTutorialRace);
      } catch (err) {
        ctx.toast("Race failed", err.message);
        button.disabled = false;
        button.querySelector("b").textContent = row.button;
      }
    });
  });

  if (activeRace) {
    queueMicrotask(() => {
      void completeActiveRace(ctx, activeRace);
    });
  }
}

async function completeActiveRace(ctx, activeRace, tutorialBeforeStart = null) {
  if (!activeRace?.raceId) return;
  if (playbackRaceId === String(activeRace.raceId)) return;
  playbackRaceId = String(activeRace.raceId);

  const wasTutorialRace = tutorialBeforeStart ?? (
    ctx.store.player?.tutorial?.status === "active" &&
    ctx.store.player?.tutorial?.step === "first_race"
  );

  try {
    const data = await playRacePresentation(ctx, activeRace);
    lastRace = data.race;
    selectedDistance = data.race?.distance || selectedDistance;
    ctx.store.setPlayer(data.player);
    ctx.toast(data.race?.won ? "Win" : "Loss", `+${money(data.race?.reward || 0)} cr • +${number(data.race?.expReward || 0)} EXP`);
    if (data.race?.newBest) ctx.toast("New best ET", `${number(data.race.player?.elapsedTime, 3)}s / ${data.race.distanceLabel}`);
    if (wasTutorialRace && data.player?.tutorial?.status === "complete") {
      ctx.toast("Basics complete", "The Circuit is now unlocked. More race distances and game systems unlock as you level up.");
    }
    await renderQuickRace(ctx);
  } catch (err) {
    ctx.toast("Race presentation interrupted", err.message);
  } finally {
    playbackRaceId = null;
  }
}

function racePreview(car, preview, player) {
  const opponent = preview?.opponent || null;
  const playerPi = Number(preview?.performanceIndex || car?.performanceIndex || car?.benchmark?.performanceIndex || 0);
  const best = car?.raceRecords?.["1/4"]?.bestEt;
  const buildType = Number(car?.buildStage || 1) === 1 ? "Street Car" : "Race Build";

  return `<section class="race-preview-card">
    <div class="race-preview-card__heading">
      <div><span class="section-label">RACE PREVIEW</span><h3>Next Matchup</h3></div>
      <span class="race-preview-card__level">YOUR LEVEL ${number(player?.progression?.level || 1)}</span>
    </div>
    <div class="race-preview-matchup">
      <article class="race-preview-driver race-preview-driver--player">
        <div class="race-preview-driver__visual">${renderVehicle(car, { stage: Number(car.buildStage || 1), view: "racePreview" })}</div>
        <div class="race-preview-driver__identity"><span>YOU</span><strong>${escapeHtml(carLabel(car))}</strong><small>${escapeHtml(car.base?.drivetrain || "-")} • ${escapeHtml(buildType)}</small></div>
        <div class="race-preview-driver__stats race-preview-driver__stats--pi">
          <span><small>CLASS</small><b>${escapeHtml(car.performanceClass || car.stockClass || "—")}</b></span>
          <span><small>PERFORMANCE</small><b class="pi-value">PI ${number(playerPi)}</b></span>
          <span><small>1/4 BEST</small><b>${best == null ? "—" : `${number(best,3)} s`}</b></span>
          <span><small>BUILD</small><b>${escapeHtml(buildType)}</b></span>
        </div>
      </article>
      <div class="race-preview-vs">VS</div>
      <article class="race-preview-driver race-preview-driver--opponent">
        <div class="race-preview-driver__visual">${opponent?.visual ? renderVehicle({ displayName: opponent.carName || "Opponent", visual: opponent.visual }, { view: "racePreview" }) : '<div class="race-preview-opponent-placeholder">?</div>'}</div>
        <div class="race-preview-driver__identity"><span>NEXT OPPONENT</span><strong>${escapeHtml(opponent?.name || "Finding opponent…")}</strong><small>${escapeHtml(opponent?.carName || "Matched car pending")}</small></div>
        <div class="race-preview-driver__stats race-preview-driver__stats--pi">
          ${opponent ? `
            <span><small>CLASS</small><b>${escapeHtml(opponent.performanceClass || "—")}</b></span>
            <span><small>PERFORMANCE</small><b class="pi-value">PI ${number(opponent.performanceIndex || 0)}</b></span>
            <span><small>DRIVETRAIN</small><b>${escapeHtml(opponent.drivetrain || "—")}</b></span>
            <span><small>BUILD</small><b>${escapeHtml(opponent.buildType || "Street Car")}</b></span>
          ` : '<span class="race-preview-loading">MATCHING…</span>'}
        </div>
      </article>
    </div>
    <p class="race-preview-mystery">Opponent dyno data stays hidden. PI is the matchup shorthand: every 8 PI represents roughly one tenth of a second in the standardized 1/4-mile benchmark.</p>
  </section>`;
}

function raceResult(race) {
  const player = race.player || {};
  const opponent = race.opponent || {};
  const weather = race.weather || {};
  const location = race.location || {};
  return `
    <section class="race-result-card ${race.won ? "race-result-card--win" : "race-result-card--loss"}">
      <div class="race-result-head">
        <div><span class="section-label">${escapeHtml(race.distanceLabel || race.distance || "RACE")} / ${escapeHtml(location.name || "Unknown location")}</span><h3>${player.dnf ? "ENGINE FAILURE • DNF" : race.won ? "WIN" : "LOSS"} ${race.newBest ? "• NEW BEST ET" : ""}</h3></div>
        <div class="race-environment"><span>${location.nightmare ? "NIGHTMARE LOCATION" : "LOCATION"}<b>${escapeHtml(location.name || "Unknown")}</b></span><span>${weather.nightmare ? "NIGHTMARE WEATHER" : "WEATHER"}<b>${escapeHtml(weather.name || "Unknown")}</b></span></div>
      </div>
      <div class="race-timeboard">
        <div class="race-timeboard__row race-timeboard__row--head"><span>RESULT</span><b>YOU</b><b>${escapeHtml(opponent.name || "OPPONENT")}</b></div>
        ${timeRow("Reaction", player.foul ? "RED LIGHT" : `${number(player.reactionTime, 3)} s`, opponent.foul ? "RED LIGHT" : `${number(opponent.reactionTime, 3)} s`, player.foul, opponent.foul)}
        ${timeRow("Elapsed", player.dnf ? "DNF" : `${number(player.elapsedTime, 3)} s`, `${number(opponent.elapsedTime, 3)} s`, player.dnf, false)}
        ${timeRow("Trap", player.dnf ? `${number(player.trapSpeed, 2)} mph • FAILED` : `${number(player.trapSpeed, 2)} mph`, `${number(opponent.trapSpeed, 2)} mph`, player.dnf, false)}
        ${timeRow("Total", player.dnf ? "ENGINE FAILURE" : player.foul ? "FOUL" : `${number(player.totalTime, 3)} s`, opponent.foul ? "FOUL" : `${number(opponent.totalTime, 3)} s`, player.dnf || player.foul, opponent.foul)}
      </div>
      ${tuningRaceLog(player)}
      <div class="race-result-foot">
        <span><small>MARGIN</small><b>${number(race.margin, 3)} s</b></span>
        <span><small>REWARD</small><b class="good">+${money(race.reward)} cr</b></span>
        <span><small>EXP</small><b class="good">+${number(race.expReward)}</b></span>
        <span><small>REP</small><b>+${number(race.repReward)}</b></span>
      </div>
    </section>`;
}

function tuningRaceLog(player) {
  const tune = player?.tuning;
  if (!tune?.active) return "";
  const slip = Math.round(Number(player?.traction?.wheelSlip || 0) * 100);
  const stability = Math.round(Number(tune.stability || 0) * 100);
  const firstGear = Array.isArray(tune.boostByGear) ? Number(tune.boostByGear[0] || 0) : 0;
  return `<div class="race-tuning-log">
    <div><span>CALIBRATION</span><b>${escapeHtml(tune.label || "ACTIVE")}</b></div>
    <div><span>PEAK BOOST</span><b>${number(tune.boostPsi,1)} PSI</b></div>
    <div><span>1ST GEAR</span><b>${number(firstGear)}%</b></div>
    <div><span>WHEEL SLIP</span><b>${slip}%</b></div>
    <div><span>STABILITY</span><b>${stability}%</b></div>
    <div><span>FAILURE RISK</span><b>${number(Number(tune.failureChance || 0) * 100,2)}%</b></div>
    <div><span>ECU / ENGINE</span><b class="${tune.catastrophicFailure || tune.powerPull ? "bad" : "good"}">${tune.catastrophicFailure ? "ENGINE FAILED" : tune.powerPull ? "POWER PULLED" : "CLEAN PASS"}</b></div>
  </div>`;
}

function timeRow(label, player, opponent, playerBad = false, opponentBad = false) {
  return `<div class="race-timeboard__row"><span>${escapeHtml(label)}</span><b class="${playerBad ? "bad" : ""}">${escapeHtml(player)}</b><b class="${opponentBad ? "bad" : ""}">${escapeHtml(opponent)}</b></div>`;
}

function raceHistory(player) {
  const rows = [...(player?.raceHistory || [])].slice(-5).reverse();
  if (!rows.length) return "";
  return `<details class="collapsible-section race-history">
    <summary>RECENT PASSES <span>${rows.length}</span></summary>
    <div class="race-history-list">
      ${rows.map((race) => `<div><span><b>${escapeHtml(race.distanceLabel || race.distance || "Race")}</b>${escapeHtml(race.location?.name || "")} • ${escapeHtml(race.weather?.name || "")}</span><span class="${race.won ? "good" : "bad"}">${race.player?.dnf ? "DNF" : race.won ? "WIN" : "LOSS"}</span><strong>${race.player?.dnf ? "ENGINE FAILURE" : race.player?.foul ? "FOUL" : `${number(race.player?.elapsedTime, 3)} s`}</strong></div>`).join("")}
    </div>
  </details>`;
}
