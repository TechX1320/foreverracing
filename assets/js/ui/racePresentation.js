import { escapeHtml, money, number } from "./components.js";

let activePlayback = null;

export function playRacePresentation(ctx, activeRace) {
  if (!activeRace?.raceId) return Promise.reject(new Error("Active race data is missing."));
  if (activePlayback?.raceId === String(activeRace.raceId)) return activePlayback.promise;
  if (activePlayback) return Promise.reject(new Error("Another race presentation is already active."));

  const promise = runPresentation(ctx, activeRace).finally(() => {
    activePlayback = null;
  });
  activePlayback = { raceId: String(activeRace.raceId), promise };
  return promise;
}

async function runPresentation(ctx, activeRace) {
  const race = activeRace.race || {};
  const dialog = document.createElement("dialog");
  dialog.className = "race-playback-dialog";
  dialog.setAttribute("aria-label", "Race in progress");
  dialog.innerHTML = playbackMarkup(activeRace);
  document.body.appendChild(dialog);

  const closeGuard = (event) => event.preventDefault();
  dialog.addEventListener("cancel", closeGuard);
  dialog.showModal();

  const playerCar = dialog.querySelector("[data-race-player-car]");
  const opponentCar = dialog.querySelector("[data-race-opponent-car]");
  const playerBar = dialog.querySelector("[data-race-player-progress]");
  const opponentBar = dialog.querySelector("[data-race-opponent-progress]");
  const clock = dialog.querySelector("[data-race-clock]");
  const phase = dialog.querySelector("[data-race-phase]");
  const liveStatus = dialog.querySelector("[data-race-live-status]");
  const tree = dialog.querySelector("[data-race-tree]");
  const resultWrap = dialog.querySelector("[data-race-final]");
  const trackWrap = dialog.querySelector("[data-race-track-wrap]");
  const continueButton = dialog.querySelector("[data-race-continue]");

  const timeScale = Math.max(0.01, Number(activeRace.timeScale || 1));
  const startedAt = Number(activeRace.startedAt || Date.now());
  const greenAt = Number(activeRace.greenAt || startedAt);
  const finishAt = Number(activeRace.finishAt || greenAt);
  const playerRun = race.player || {};
  const opponentRun = race.opponent || {};
  const playerStart = greenAt + (Number(playerRun.reactionTime || 0) * 1000 * timeScale);
  const opponentStart = greenAt + (Number(opponentRun.reactionTime || 0) * 1000 * timeScale);
  const playerFinish = playerStart + (Math.max(0.1, Number(playerRun.elapsedTime || 0)) * 1000 * timeScale);
  const opponentFinish = opponentStart + (Math.max(0.1, Number(opponentRun.elapsedTime || 0)) * 1000 * timeScale);
  const progressExponent = Math.max(1, Number(ctx.store?.racingPresentation?.progressExponent || 1.38));

  let frame = 0;
  let settled = false;

  const animate = () => {
    const now = Date.now();
    updateTree(tree, phase, now, startedAt, greenAt, race);
    const p = raceProgress(now, playerStart, playerFinish, progressExponent);
    const o = raceProgress(now, opponentStart, opponentFinish, progressExponent);
    setProgress(playerCar, playerBar, p);
    setProgress(opponentCar, opponentBar, o);

    const simSeconds = Math.max(0, (now - greenAt) / (1000 * timeScale));
    clock.textContent = simSeconds > 0 ? simSeconds.toFixed(2) : "0.00";
    liveStatus.textContent = liveRaceStatus(now, greenAt, playerFinish, opponentFinish, playerRun, opponentRun);

    if (now < finishAt) {
      frame = requestAnimationFrame(animate);
      return;
    }
    setProgress(playerCar, playerBar, 1);
    setProgress(opponentCar, opponentBar, 1);
    phase.textContent = "FINISH";
    liveStatus.textContent = "PASS COMPLETE • VERIFYING TIMING SLIP";
    trackWrap.classList.add("is-finished");
    settleRace();
  };

  const settleRace = async () => {
    if (settled) return;
    settled = true;
    const revealDelay = Math.max(0, Number(activeRace.revealDelayMs || 650)) * timeScale;
    if (revealDelay > 0) await sleep(revealDelay);

    let finalized;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        finalized = await ctx.storage.finishQuickRace(activeRace.raceId);
        break;
      } catch (error) {
        if (Number(error?.status) !== 409 || attempt === 11) throw error;
        await sleep(125);
      }
    }

    ctx.store.setPlayer(finalized.player);
    resultWrap.innerHTML = finalResultMarkup(finalized.race);
    resultWrap.hidden = false;
    trackWrap.classList.add("has-results");
    liveStatus.textContent = finalized.race?.won ? "WIN • TIMING SLIP READY" : "LOSS • TIMING SLIP READY";
    continueButton.hidden = false;
    continueButton.focus();

    await new Promise((resolve) => continueButton.addEventListener("click", resolve, { once: true }));
    dialog.close();
    dialog.removeEventListener("cancel", closeGuard);
    dialog.remove();
    return finalized;
  };

  const playbackPromise = new Promise((resolve, reject) => {
    const originalSettle = settleRace;
    settleRace = async () => {
      try {
        const result = await originalSettle();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
  });

  frame = requestAnimationFrame(animate);

  try {
    return await playbackPromise;
  } finally {
    if (frame) cancelAnimationFrame(frame);
    if (dialog.isConnected) {
      try { dialog.close(); } catch {}
      dialog.remove();
    }
  }
}

function playbackMarkup(activeRace) {
  const race = activeRace.race || {};
  const player = race.player || {};
  const opponent = race.opponent || {};
  const location = race.location?.name || "Unknown strip";
  const weather = race.weather?.name || "Unknown weather";

  return `
    <section class="race-playback" data-race-track-wrap>
      <header class="race-playback__head">
        <div>
          <span class="section-label">${escapeHtml(race.distanceLabel || race.distance || "RACE")} • ${escapeHtml(location)}</span>
          <h2 data-race-phase>STAGING</h2>
        </div>
        <div class="race-playback__meta">
          <span>WEATHER<b>${escapeHtml(weather)}</b></span>
          <span>RACE CLOCK<b><i data-race-clock>0.00</i>s</b></span>
        </div>
      </header>

      <div class="race-playback__status" data-race-live-status aria-live="polite">PRE-STAGE • BOTH LANES LOCKED</div>

      <div class="race-stage">
        <div class="race-stage__labels">
          <span>YOU • ${escapeHtml(race.carName || "Current Car")}</span>
          <span>${escapeHtml(opponent.name || "Opponent")} • ${escapeHtml(opponent.carName || "Race Car")}</span>
        </div>
        <div class="race-strip">
          <div class="race-strip__finish"><span>FINISH</span></div>
          <div class="race-strip__lane race-strip__lane--left">
            ${carToken(race.playerVisualSrc, race.carName || "Player car", "data-race-player-car")}
          </div>
          <div class="race-strip__tree" data-race-tree aria-label="Drag racing starting tree">
            <i class="tree-bulb tree-bulb--pre" data-tree-pre></i>
            <i class="tree-bulb tree-bulb--stage" data-tree-stage></i>
            <i class="tree-bulb tree-bulb--amber" data-tree-amber="1"></i>
            <i class="tree-bulb tree-bulb--amber" data-tree-amber="2"></i>
            <i class="tree-bulb tree-bulb--amber" data-tree-amber="3"></i>
            <i class="tree-bulb tree-bulb--green" data-tree-green></i>
            <i class="tree-bulb tree-bulb--red" data-tree-red></i>
          </div>
          <div class="race-strip__lane race-strip__lane--right">
            ${carToken(opponent.visualSrc, opponent.carName || "Opponent car", "data-race-opponent-car")}
          </div>
          <div class="race-strip__start"><span>START</span></div>
        </div>
        <div class="race-progress-board">
          <div><span>YOU</span><b><i data-race-player-progress></i></b></div>
          <div><span>OPPONENT</span><b><i data-race-opponent-progress></i></b></div>
        </div>
      </div>

      <div class="race-playback__final" data-race-final hidden></div>
      <footer class="race-playback__footer">
        <span>Race controls are locked until the pass is complete.</span>
        <button class="button button--primary" type="button" data-race-continue hidden>RETURN TO PITS</button>
      </footer>
    </section>`;
}

function carToken(src, label, attr) {
  if (!src) {
    return `<div class="race-strip__car race-strip__car--missing" ${attr}><b>?</b><small>ART MISSING</small></div>`;
  }
  return `<img class="race-strip__car" ${attr} src="${escapeHtml(src)}" alt="${escapeHtml(label)}">`;
}

function updateTree(tree, phase, now, startedAt, greenAt, race) {
  const span = Math.max(1, greenAt - startedAt);
  const ratio = (now - startedAt) / span;
  const pre = tree.querySelector("[data-tree-pre]");
  const stage = tree.querySelector("[data-tree-stage]");
  const amber1 = tree.querySelector('[data-tree-amber="1"]');
  const amber2 = tree.querySelector('[data-tree-amber="2"]');
  const amber3 = tree.querySelector('[data-tree-amber="3"]');
  const green = tree.querySelector("[data-tree-green]");
  const red = tree.querySelector("[data-tree-red]");

  setLamp(pre, ratio >= 0.08);
  setLamp(stage, ratio >= 0.28);
  setLamp(amber1, ratio >= 0.52 && ratio < 1);
  setLamp(amber2, ratio >= 0.68 && ratio < 1);
  setLamp(amber3, ratio >= 0.84 && ratio < 1);
  setLamp(green, now >= greenAt);
  setLamp(red, now >= greenAt && Boolean(race.player?.foul));

  if (now < startedAt + span * 0.28) phase.textContent = "PRE-STAGE";
  else if (now < startedAt + span * 0.52) phase.textContent = "STAGED";
  else if (now < greenAt) phase.textContent = "TREE";
  else phase.textContent = race.player?.foul ? "RED LIGHT" : "GREEN";
}

function setLamp(node, on) {
  node?.classList.toggle("is-on", Boolean(on));
}

function raceProgress(now, startAt, finishAt, exponent) {
  if (now <= startAt) return 0;
  if (now >= finishAt) return 1;
  const raw = Math.max(0, Math.min(1, (now - startAt) / Math.max(1, finishAt - startAt)));
  return Math.pow(raw, exponent);
}

function setProgress(car, bar, progress) {
  const percent = Math.max(0, Math.min(100, progress * 100));
  if (car) car.style.setProperty("--race-progress", String(percent));
  if (bar) bar.style.width = `${percent.toFixed(2)}%`;
}

function liveRaceStatus(now, greenAt, playerFinish, opponentFinish, playerRun, opponentRun) {
  if (now < greenAt) return "STAGED • WAIT FOR GREEN";
  const pFinished = now >= playerFinish;
  const oFinished = now >= opponentFinish;
  if (pFinished && oFinished) return "BOTH CARS THROUGH THE TRAPS";
  if (pFinished) return playerRun.foul ? "YOU FINISHED • RED LIGHT RECORDED" : "YOU ARE THROUGH THE TRAPS";
  if (oFinished) return opponentRun.foul ? "OPPONENT FINISHED • RED LIGHT" : "OPPONENT IS THROUGH THE TRAPS";
  return "RACE IN PROGRESS • CONTROLS LOCKED";
}

function finalResultMarkup(race) {
  const player = race?.player || {};
  const opponent = race?.opponent || {};
  return `
    <div class="race-playback-result ${race?.won ? "is-win" : "is-loss"}">
      <div class="race-playback-result__title">
        <span>TIMING SLIP</span>
        <strong>${race?.won ? "WIN" : "LOSS"}${race?.newBest ? " • NEW BEST ET" : ""}</strong>
      </div>
      <div class="race-playback-result__grid">
        ${resultRow("Reaction", player.foul ? "RED LIGHT" : `${number(player.reactionTime, 3)} s`, opponent.foul ? "RED LIGHT" : `${number(opponent.reactionTime, 3)} s`)}
        ${resultRow("Elapsed", `${number(player.elapsedTime, 3)} s`, `${number(opponent.elapsedTime, 3)} s`)}
        ${resultRow("Trap", `${number(player.trapSpeed, 2)} mph`, `${number(opponent.trapSpeed, 2)} mph`)}
        ${resultRow("Total", player.foul ? "FOUL" : `${number(player.totalTime, 3)} s`, opponent.foul ? "FOUL" : `${number(opponent.totalTime, 3)} s`)}
      </div>
      <div class="race-playback-result__rewards">
        <span><small>MARGIN</small><b>${number(race?.margin, 3)} s</b></span>
        <span><small>CREDITS</small><b>+${money(race?.reward || 0)}</b></span>
        <span><small>EXP</small><b>+${number(race?.expReward || 0)}</b></span>
        <span><small>REP</small><b>+${number(race?.repReward || 0)}</b></span>
      </div>
    </div>`;
}

function resultRow(label, player, opponent) {
  return `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(player)}</b><b>${escapeHtml(opponent)}</b></div>`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
