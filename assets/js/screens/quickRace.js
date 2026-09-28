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
        <div class="ftue-focus-panel__step">STEP 6/6</div>
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
      ${current ? racePreview(current, preview?.opponent || null, player) : `
        <div class="empty-state"><strong>You need a Current Car.</strong><span>Buy a car and select it in the Garage first.</span><div class="cluster" style="justify-content:center;margin-top:14px"><button class="button button--primary button--small" data-go-garage>Open Garage</button><button class="button button--small" data-go-showroom>Showroom</button></div></div>`}
      ${raceHistory(player)}
      <details class="collapsible-section">
        <summary>HOW QUICK RACE WORKS</summary>
        <p>Choose an unlocked distance above to stage immediately. The opponent shown in Race Preview is the matchup the simulator will use. Rewards, EXP and records are committed only after the cars reach the finish.</p>
      </details>
    `  });

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

function racePreview(car, opponent, player) {
  const playerStats = [
    ["POWER", `${number(car.derived?.hp)} hp`],
    ["TORQUE", `${number(car.derived?.torque)} lb-ft`],
    ["WEIGHT", `${number(car.derived?.weight)} lb`],
    ["GRIP", number(car.derived?.grip, 3)],
  ];

  const opponentStats = opponent ? [
    ["POWER", `${number(opponent.hp)} hp`],
    ["TORQUE", `${number(opponent.torque)} lb-ft`],
    ["WEIGHT", `${number(opponent.weight)} lb`],
    ["GRIP", number(opponent.grip, 3)],
  ] : [];

  return `<section class="race-preview-card">
    <div class="race-preview-card__heading">
      <div><span class="section-label">RACE PREVIEW</span><h3>Next Matchup</h3></div>
      <span class="race-preview-card__level">YOUR LEVEL ${number(player?.progression?.level || 1)}</span>
    </div>
    <div class="race-preview-matchup">
      <article class="race-preview-driver race-preview-driver--player">
        <div class="race-preview-driver__visual">${renderVehicle(car, { stage: Number(car.buildStage || 1), view: "racePreview" })}</div>
        <div class="race-preview-driver__identity"><span>YOU</span><strong>${escapeHtml(carLabel(car))}</strong><small>${escapeHtml(car.base?.drivetrain || "-")} • ${escapeHtml(car.displayName || "")}</small></div>
        <div class="race-preview-driver__stats">${playerStats.map(([label,value]) => `<span><small>${label}</small><b>${value}</b></span>`).join("")}</div>
      </article>
      <div class="race-preview-vs">VS</div>
      <article class="race-preview-driver race-preview-driver--opponent">
        <div class="race-preview-driver__visual">${opponent?.visualSrc ? `<img class="race-preview-opponent-image" src="${escapeHtml(opponent.visualSrc)}" alt="" aria-hidden="true">` : '<div class="race-preview-opponent-placeholder">?</div>'}</div>
        <div class="race-preview-driver__identity"><span>NEXT OPPONENT</span><strong>${escapeHtml(opponent?.name || "Finding opponent…")}</strong><small>${escapeHtml(opponent?.carName || "Matched car pending")}</small></div>
        <div class="race-preview-driver__stats">${opponentStats.length ? opponentStats.map(([label,value]) => `<span><small>${label}</small><b>${value}</b></span>`).join("") : '<span class="race-preview-loading">MATCHING…</span>'}</div>
      </article>
    </div>
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
        <div><span class="section-label">${escapeHtml(race.distanceLabel || race.distance || "RACE")} / ${escapeHtml(location.name || "Unknown location")}</span><h3>${race.won ? "WIN" : "LOSS"} ${race.newBest ? "• NEW BEST ET" : ""}</h3></div>
        <div class="race-environment"><span>${location.nightmare ? "NIGHTMARE LOCATION" : "LOCATION"}<b>${escapeHtml(location.name || "Unknown")}</b></span><span>${weather.nightmare ? "NIGHTMARE WEATHER" : "WEATHER"}<b>${escapeHtml(weather.name || "Unknown")}</b></span></div>
      </div>
      <div class="race-timeboard">
        <div class="race-timeboard__row race-timeboard__row--head"><span>RESULT</span><b>YOU</b><b>${escapeHtml(opponent.name || "OPPONENT")}</b></div>
        ${timeRow("Reaction", player.foul ? "RED LIGHT" : `${number(player.reactionTime, 3)} s`, opponent.foul ? "RED LIGHT" : `${number(opponent.reactionTime, 3)} s`, player.foul, opponent.foul)}
        ${timeRow("Elapsed", `${number(player.elapsedTime, 3)} s`, `${number(opponent.elapsedTime, 3)} s`)}
        ${timeRow("Trap", `${number(player.trapSpeed, 2)} mph`, `${number(opponent.trapSpeed, 2)} mph`)}
        ${timeRow("Total", player.foul ? "FOUL" : `${number(player.totalTime, 3)} s`, opponent.foul ? "FOUL" : `${number(opponent.totalTime, 3)} s`, player.foul, opponent.foul)}
      </div>
      <div class="race-result-foot">
        <span><small>MARGIN</small><b>${number(race.margin, 3)} s</b></span>
        <span><small>REWARD</small><b class="good">+${money(race.reward)} cr</b></span>
        <span><small>EXP</small><b class="good">+${number(race.expReward)}</b></span>
        <span><small>REP</small><b>+${number(race.repReward)}</b></span>
      </div>
    </section>`;
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
      ${rows.map((race) => `<div><span><b>${escapeHtml(race.distanceLabel || race.distance || "Race")}</b>${escapeHtml(race.location?.name || "")} • ${escapeHtml(race.weather?.name || "")}</span><span class="${race.won ? "good" : "bad"}">${race.won ? "WIN" : "LOSS"}</span><strong>${race.player?.foul ? "FOUL" : `${number(race.player?.elapsedTime, 3)} s`}</strong></div>`).join("")}
    </div>
  </details>`;
}
