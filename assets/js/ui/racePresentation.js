import { escapeHtml, money, number } from "./components.js";
import { renderVehicle, vehicleGeometry } from "./vehicleRenderer.js";

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

function runPresentation(ctx, activeRace) {
  return new Promise((resolve, reject) => {
    const race = activeRace.race || {};
    const dialog = document.createElement("dialog");
    dialog.className = "race-playback-dialog race-playback-dialog--side";
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
    const strip = dialog.querySelector("[data-race-strip]");
    const startLine = dialog.querySelector("[data-race-start-line]");
    const finishLine = dialog.querySelector("[data-race-finish-line]");
    const continueButton = dialog.querySelector("[data-race-continue]");

    const timeScale = Math.max(0.01, Number(activeRace.timeScale || 1));
    const startedAt = Number(activeRace.startedAt || Date.now());
    const greenAt = Number(activeRace.greenAt || startedAt);
    const playerRun = race.player || {};
    const opponentRun = race.opponent || {};
    const playerStart = greenAt + (Number(playerRun.reactionTime || 0) * 1000 * timeScale);
    const opponentStart = greenAt + (Number(opponentRun.reactionTime || 0) * 1000 * timeScale);
    const playerFinish = playerStart + (Math.max(0.1, Number(playerRun.elapsedTime || 0)) * 1000 * timeScale);
    const opponentFinish = opponentStart + (Math.max(0.1, Number(opponentRun.elapsedTime || 0)) * 1000 * timeScale);
    const physicalFinishAt = Math.max(playerFinish, opponentFinish);
    const flyThroughMs = Math.max(300, Number(activeRace.flyThroughMs || 650)) * timeScale;
    const visualFinishAt = physicalFinishAt + flyThroughMs;
    const progressExponent = Math.max(1, Number(activeRace.progressExponent || 1.38));
    const revealDelay = Math.max(0, Number(activeRace.revealDelayMs || 650)) * timeScale;

    const playerGeometry = vehicleGeometry({ visual: race.playerVisual || {} }) || { frontBumperRatio: 1 };
    const opponentGeometry = vehicleGeometry({ visual: opponentRun.visual || {} }) || { frontBumperRatio: 1 };

    let frame = 0;
    let settling = false;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (frame) cancelAnimationFrame(frame);
      dialog.removeEventListener("cancel", closeGuard);
      if (dialog.isConnected) {
        try { dialog.close(); } catch {}
        dialog.remove();
      }
    };

    const fail = (error) => {
      cleanup();
      reject(error);
    };

    const settleRace = async () => {
      if (settling) return;
      settling = true;
      try {
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

        continueButton.addEventListener("click", () => {
          cleanup();
          resolve(finalized);
        }, { once: true });
      } catch (error) {
        fail(error);
      }
    };

    const animate = () => {
      const now = Date.now();
      updateTree(tree, phase, now, startedAt, greenAt, playerStart, race);

      const playerProgress = raceVisualProgress(now, playerStart, playerFinish, visualFinishAt, progressExponent);
      const opponentProgress = raceVisualProgress(now, opponentStart, opponentFinish, visualFinishAt, progressExponent);
      setSideProgress(playerCar, playerBar, playerProgress, playerGeometry, strip, startLine, finishLine);
      setSideProgress(opponentCar, opponentBar, opponentProgress, opponentGeometry, strip, startLine, finishLine);

      // The visible timer belongs to the player's pass. It freezes at the exact
      // instant the player's front-bumper anchor reaches the finish timing plane.
      const timingNow = Math.min(now, playerFinish);
      const simSeconds = Math.max(0, (timingNow - greenAt) / (1000 * timeScale));
      clock.textContent = simSeconds > 0 ? simSeconds.toFixed(2) : "0.00";
      liveStatus.textContent = liveRaceStatus(now, greenAt, playerStart, opponentStart, playerFinish, opponentFinish, playerRun, opponentRun);

      if (now < visualFinishAt) {
        frame = requestAnimationFrame(animate);
        return;
      }

      phase.textContent = "FINISH";
      liveStatus.textContent = "PASS COMPLETE • VERIFYING TIMING SLIP";
      trackWrap.classList.add("is-finished");
      void settleRace();
    };

    frame = requestAnimationFrame(animate);
  });
}

function playbackMarkup(activeRace) {
  const race = activeRace.race || {};
  const player = race.player || {};
  const opponent = race.opponent || {};
  const location = race.location?.name || "Unknown strip";
  const weather = race.weather?.name || "Unknown weather";

  return `
    <section class="race-playback race-playback--side" data-race-track-wrap>
      <header class="race-playback__head">
        <div>
          <span class="section-label">${escapeHtml(race.distanceLabel || race.distance || "RACE")} • ${escapeHtml(location)}</span>
          <h2 data-race-phase>STAGING</h2>
        </div>
        <div class="race-playback__meta">
          <span>WEATHER<b>${escapeHtml(weather)}</b></span>
          <span>YOUR RACE CLOCK<b><i data-race-clock>0.00</i>s</b></span>
        </div>
      </header>

      <div class="race-playback__status" data-race-live-status aria-live="polite">PRE-STAGE • BOTH LANES LOCKED</div>

      <div class="race-stage race-stage--side">
        <div class="race-strip race-strip--side" data-race-strip>
          <div class="race-strip__timing-line race-strip__timing-line--start" data-race-start-line><span>START</span></div>
          <div class="race-strip__timing-line race-strip__timing-line--finish" data-race-finish-line><span>FINISH</span></div>
          <div class="race-strip__tree race-strip__tree--side" data-race-tree aria-label="Drag racing starting tree">
            <i class="tree-bulb tree-bulb--pre" data-tree-pre></i>
            <i class="tree-bulb tree-bulb--stage" data-tree-stage></i>
            <i class="tree-bulb tree-bulb--amber" data-tree-amber="1"></i>
            <i class="tree-bulb tree-bulb--amber" data-tree-amber="2"></i>
            <i class="tree-bulb tree-bulb--amber" data-tree-amber="3"></i>
            <i class="tree-bulb tree-bulb--green" data-tree-green></i>
            <i class="tree-bulb tree-bulb--red" data-tree-red></i>
          </div>

          <div class="race-side-lane race-side-lane--player">
            <span class="race-side-lane__label">YOU • ${escapeHtml(race.carName || "Current Car")} • PI ${number(race.playerPerformanceIndex || 0)}</span>
            ${raceCar({ displayName: race.carName || "Player car", visual: race.playerVisual || {} }, "data-race-player-car")}
          </div>
          <div class="race-side-lane race-side-lane--opponent">
            <span class="race-side-lane__label">${escapeHtml(opponent.name || "Opponent")} • ${escapeHtml(opponent.carName || "Race Car")} • PI ${number(opponent.performanceIndex || 0)}</span>
            ${raceCar({ displayName: opponent.carName || "Opponent car", visual: opponent.visual || {} }, "data-race-opponent-car")}
          </div>
        </div>

        <div class="race-progress-board">
          <div><span>YOU</span><b><i data-race-player-progress></i></b></div>
          <div><span>OPPONENT</span><b><i data-race-opponent-progress></i></b></div>
        </div>
      </div>

      <div class="race-playback__final" data-race-final hidden></div>
      <footer class="race-playback__footer">
        <span>Timing stops at the front bumper. Cars continue through the traps visually.</span>
        <button class="button button--primary" type="button" data-race-continue hidden>RETURN TO PITS</button>
      </footer>
    </section>`;
}

function raceCar(car, attr) {
  return `<div class="race-side-car" ${attr}>${renderVehicle(car, { view: "raceSide", className: "race-side-car__vehicle" })}</div>`;
}

function updateTree(tree, phase, now, startedAt, greenAt, playerStart, race) {
  const span = Math.max(1, greenAt - startedAt);
  const ratio = (now - startedAt) / span;
  const pre = tree.querySelector("[data-tree-pre]");
  const stage = tree.querySelector("[data-tree-stage]");
  const amber1 = tree.querySelector('[data-tree-amber="1"]');
  const amber2 = tree.querySelector('[data-tree-amber="2"]');
  const amber3 = tree.querySelector('[data-tree-amber="3"]');
  const green = tree.querySelector("[data-tree-green]");
  const red = tree.querySelector("[data-tree-red]");

  const playerFoul = Boolean(race.player?.foul);
  const foulShown = playerFoul && now >= playerStart;

  setLamp(pre, ratio >= 0.08);
  setLamp(stage, ratio >= 0.28);
  setLamp(amber1, ratio >= 0.52 && ratio < 0.68);
  setLamp(amber2, ratio >= 0.68 && ratio < 0.84);
  setLamp(amber3, ratio >= 0.84 && ratio < 1);
  setLamp(green, now >= greenAt && !playerFoul);
  setLamp(red, foulShown);

  if (foulShown) phase.textContent = "RED LIGHT";
  else if (now < startedAt + span * 0.28) phase.textContent = "PRE-STAGE";
  else if (now < startedAt + span * 0.52) phase.textContent = "STAGED";
  else if (now < greenAt) phase.textContent = "TREE";
  else phase.textContent = "GREEN";
}

function setLamp(node, on) {
  node?.classList.toggle("is-on", Boolean(on));
}

export function raceVisualProgress(now, startAt, finishAt, visualFinishAt, exponent = 1.38) {
  if (now <= startAt) return 0;
  if (now < finishAt) {
    const raw = Math.max(0, Math.min(1, (now - startAt) / Math.max(1, finishAt - startAt)));
    return Math.pow(raw, Math.max(1, Number(exponent || 1)));
  }
  if (now >= visualFinishAt) return 1.22;
  const fly = Math.max(0, Math.min(1, (now - finishAt) / Math.max(1, visualFinishAt - finishAt)));
  return 1 + (fly * 0.22);
}

export function frontBumperLeftAtProgress({ startPlaneX, finishPlaneX, carWidth, frontBumperRatio, progress }) {
  const noseOffset = Math.max(0, Math.min(1, Number(frontBumperRatio ?? 1))) * Math.max(1, Number(carWidth || 1));
  const startLeft = Number(startPlaneX || 0) - noseOffset;
  const travel = Number(finishPlaneX || 0) - Number(startPlaneX || 0);
  return startLeft + (travel * Number(progress || 0));
}

function setSideProgress(car, bar, progress, geometry, strip, startLine, finishLine) {
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress * 100)).toFixed(2)}%`;
  if (!car || !strip || !startLine || !finishLine) return;

  const stripRect = strip.getBoundingClientRect();
  const startRect = startLine.getBoundingClientRect();
  const finishRect = finishLine.getBoundingClientRect();
  const carWidth = Math.max(1, car.getBoundingClientRect().width);
  const startPlaneX = (startRect.left + (startRect.width / 2)) - stripRect.left;
  const finishPlaneX = (finishRect.left + (finishRect.width / 2)) - stripRect.left;
  const left = frontBumperLeftAtProgress({
    startPlaneX,
    finishPlaneX,
    carWidth,
    frontBumperRatio: geometry?.frontBumperRatio ?? 1,
    progress,
  });
  car.style.left = `${left.toFixed(2)}px`;
}

function liveRaceStatus(now, greenAt, playerStart, opponentStart, playerFinish, opponentFinish, playerRun, opponentRun) {
  if (now < greenAt) {
    if (playerRun.foul && now >= playerStart) return "RED LIGHT • YOU LEFT BEFORE GREEN";
    if (opponentRun.foul && now >= opponentStart) return "OPPONENT RED-LIT • WAIT FOR GREEN";
    return "STAGED • WAIT FOR GREEN";
  }
  const pFinished = now >= playerFinish;
  const oFinished = now >= opponentFinish;
  if (pFinished && oFinished) return "BOTH FRONT BUMPERS THROUGH THE TRAPS";
  if (pFinished) return playerRun.foul ? "YOU FINISHED • RED LIGHT RECORDED" : "YOUR BUMPER IS THROUGH THE TRAPS";
  if (oFinished) return opponentRun.foul ? "OPPONENT FINISHED • RED LIGHT" : "OPPONENT BUMPER IS THROUGH THE TRAPS";
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
