import { bindHome, carLabel, escapeHtml, money, number, pageShell, selectedCar } from "../ui/components.js";
import { renderVehicle } from "../ui/vehicleRenderer.js";

let lastRace = null;
let selectedDistance = "1/4";

const DISTANCES = [
  { key: "1/4", label: "1/4 MILE", short: "1320 FT" },
  { key: "1/2", label: "1/2 MILE", short: "2640 FT" },
  { key: "1", label: "1 MILE", short: "5280 FT" },
];

export async function renderQuickRace(ctx) {
  const player = ctx.store.player;
  const current = selectedCar(player);
  const result = lastRace;
  const record = current?.raceRecords?.[selectedDistance] || null;

  ctx.screenRoot.innerHTML = pageShell({
    title: "Quick Race",
    eyebrow: "TEXTTUNED RACE CORE",
    hint: current ? carLabel(current) : "No current car",
    trail: "Automated drag simulation / player input comes later",
    body: `
      ${player?.tutorial?.status === "active" && player?.tutorial?.step === "first_race" ? '<div class="objective-box objective-box--active"><div><span class="objective-kicker">FTUE / FINAL STEP</span><strong>Run your first race</strong></div><p>Choose a distance and make a pass. The same race engine will later accept player launch, shift and NOS inputs.</p></div>' : ""}
      <div class="race-distance-tabs" role="group" aria-label="Race distance">
        ${DISTANCES.map((row) => `<button type="button" class="button button--small ${row.key === selectedDistance ? "button--primary" : ""}" data-race-distance="${row.key}"><b>${row.label}</b><span>${row.short}</span></button>`).join("")}
      </div>
      ${result ? raceResult(result) : ""}
      ${current ? `
        <div class="race-car-panel is-selected">
          <div class="race-car-panel__visual">${renderVehicle(current, { stage: Number(current.buildStage || 1), view: "racePreview" })}</div>
          <div class="game-card__top"><div><h3>${escapeHtml(carLabel(current))}</h3><p>${escapeHtml(current.displayName)} • ${escapeHtml(current.base?.drivetrain || "-")}</p></div><span class="pill pill--accent">CURRENT</span></div>
          <div class="spec-grid">
            <div class="spec"><span>Power</span><strong>${number(current.derived?.hp)} hp</strong></div>
            <div class="spec"><span>Torque</span><strong>${number(current.derived?.torque)} lb-ft</strong></div>
            <div class="spec"><span>Weight</span><strong>${number(current.derived?.weight)} lb</strong></div>
            <div class="spec"><span>Grip</span><strong>${number(current.derived?.grip, 3)}</strong></div>
          </div>
          <div class="race-record-strip">
            <span><small>${DISTANCES.find((row) => row.key === selectedDistance)?.label || selectedDistance} BEST</small><b>${record?.bestEt == null ? "—" : `${number(record.bestEt, 3)} s`}</b></span>
            <span><small>BEST TRAP</small><b>${record?.bestTrap == null ? "—" : `${number(record.bestTrap, 2)} mph`}</b></span>
            <span><small>PASSES</small><b>${number(record?.races || 0)}</b></span>
            <span><small>EXP</small><b>${number(player.progression?.exp || 0)}</b></span>
          </div>
          <div class="game-card__actions"><button class="button button--primary" type="button" data-run-race>STAGE & RUN ${DISTANCES.find((row) => row.key === selectedDistance)?.label || ""}</button></div>
        </div>` : `
        <div class="empty-state"><strong>You need a Current Car.</strong><span>Buy a car and select it in the Garage first.</span><div class="cluster" style="justify-content:center;margin-top:14px"><button class="button button--primary button--small" data-go-garage>Open Garage</button><button class="button button--small" data-go-showroom>Showroom</button></div></div>`}
      ${raceHistory(player)}
      <p class="screen-copy" style="margin-bottom:0;margin-top:14px">V0.3B derives the automated race model from TextTuned: reaction time, power-to-weight ET, launch consistency, shifting loss, weather, trap speed and weighted locations. Forever Racing also keeps grip relevant and treats a red light as an actual foul instead of a faster total time.</p>
    `,
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-go-garage]")?.addEventListener("click", () => ctx.router.navigate("garage"));
  ctx.screenRoot.querySelector("[data-go-showroom]")?.addEventListener("click", () => ctx.router.navigate("showroom"));
  ctx.screenRoot.querySelectorAll("[data-race-distance]").forEach((button) => {
    button.addEventListener("click", async () => {
      selectedDistance = button.dataset.raceDistance || "1/4";
      await renderQuickRace(ctx);
    });
  });
  ctx.screenRoot.querySelector("[data-run-race]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "STAGING…";
    try {
      const wasTutorialRace = ctx.store.player?.tutorial?.status === "active" && ctx.store.player?.tutorial?.step === "first_race";
      const data = await ctx.storage.quickRace(selectedDistance);
      lastRace = data.race;
      selectedDistance = data.race.distance || selectedDistance;
      ctx.store.setPlayer(data.player);
      ctx.toast(data.race.won ? "Win" : "Loss", `+${money(data.race.reward)} cr • +${number(data.race.expReward)} EXP`);
      if (data.race.newBest) ctx.toast("New best ET", `${number(data.race.player?.elapsedTime, 3)}s / ${data.race.distanceLabel}`);
      if (wasTutorialRace && data.player?.tutorial?.status === "complete") {
        ctx.toast("Tutorial complete", "FTUE reward added. The rest of Forever Racing is now open.");
      }
      await renderQuickRace(ctx);
    } catch (err) {
      ctx.toast("Race failed", err.message);
      button.disabled = false;
      button.textContent = "Stage & Run";
    }
  });
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
  return `
    <section class="race-history">
      <div class="section-heading section-heading--small"><div><small>RECENT PASSES</small><h3>Race history</h3></div></div>
      <div class="race-history-list">
        ${rows.map((race) => `<div><span><b>${escapeHtml(race.distanceLabel || race.distance || "Race")}</b>${escapeHtml(race.location?.name || "")} • ${escapeHtml(race.weather?.name || "")}</span><span class="${race.won ? "good" : "bad"}">${race.won ? "WIN" : "LOSS"}</span><strong>${race.player?.foul ? "FOUL" : `${number(race.player?.elapsedTime, 3)} s`}</strong></div>`).join("")}
      </div>
    </section>`;
}
