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
            finalized = activeRace.origin === "circuit"
              ? await ctx.storage.finishCircuitRace(activeRace.raceId)
              : await ctx.storage.finishQuickRace(activeRace.raceId);
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

      const playerProgress = racePhysicsProgress(now, playerStart, playerFinish, visualFinishAt, playerRun, race.distanceFeet, timeScale, progressExponent);
      const opponentProgress = racePhysicsProgress(now, opponentStart, opponentFinish, visualFinishAt, opponentRun, race.distanceFeet, timeScale, progressExponent);
      setSideProgress(playerCar, playerBar, playerProgress, playerGeometry, strip, startLine, finishLine);
      setSideProgress(opponentCar, opponentBar, opponentProgress, opponentGeometry, strip, startLine, finishLine);
      updateWheelMotion(playerCar, playerRun, race.playerDrivetrain, playerProgress, now, playerStart, race.distanceFeet, timeScale);
      updateWheelMotion(opponentCar, opponentRun, opponentRun.drivetrain, opponentProgress, now, opponentStart, race.distanceFeet, timeScale);

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
          <div class="race-strip__surface" aria-hidden="true"></div>
          <div class="race-strip__track-rail race-strip__track-rail--top" aria-hidden="true"></div>
          <div class="race-strip__track-rail race-strip__track-rail--bottom" aria-hidden="true"></div>
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
            ${raceCar({ displayName: race.carName || "Player car", visual: race.playerVisual || {} }, race.playerDrivetrain || "-", "data-race-player-car")}
          </div>
          <div class="race-side-lane race-side-lane--opponent">
            <span class="race-side-lane__label">${escapeHtml(opponent.name || "Opponent")} • ${escapeHtml(opponent.carName || "Race Car")} • PI ${number(opponent.performanceIndex || 0)}</span>
            ${raceCar({ displayName: opponent.carName || "Opponent car", visual: opponent.visual || {} }, opponent.drivetrain || "-", "data-race-opponent-car")}
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

function raceCar(car, drivetrain, attr) {
  return `<div class="race-side-car" ${attr} data-drivetrain="${escapeHtml(drivetrain)}"><span class="race-side-car__shadow" aria-hidden="true"></span>${renderVehicle(car, { view: "raceSide", className: "race-side-car__vehicle", animatedWheels: true })}</div>`;
}

function updateTree(tree, phase, now, startedAt, greenAt, playerStart, race) {
  const span = Math.max(1, greenAt - startedAt);
  const ratio = (now - startedAt) / span;
  const playerFoul = Boolean(race.player?.foul);
  const foulShown = playerFoul && now >= playerStart;

  setLamp(tree?.querySelector("[data-tree-pre]"), ratio >= 0.08);
  setLamp(tree?.querySelector("[data-tree-stage]"), ratio >= 0.28);
  setLamp(tree?.querySelector('[data-tree-amber="1"]'), ratio >= 0.52 && ratio < 0.68);
  setLamp(tree?.querySelector('[data-tree-amber="2"]'), ratio >= 0.68 && ratio < 0.84);
  setLamp(tree?.querySelector('[data-tree-amber="3"]'), ratio >= 0.84 && ratio < 1);
  setLamp(tree?.querySelector("[data-tree-green]"), now >= greenAt && !playerFoul);
  setLamp(tree?.querySelector("[data-tree-red]"), foulShown);

  if (foulShown) phase.textContent = "RED LIGHT";
  else if (now < startedAt + span * 0.28) phase.textContent = "PRE-STAGE";
  else if (now < startedAt + span * 0.52) phase.textContent = "STAGED";
  else if (now < greenAt) phase.textContent = "TREE";
  else phase.textContent = "GREEN";
}

function setLamp(node, on) {
  node?.classList.toggle("is-on", Boolean(on));
}

export function physicsMotionExponent(run, distanceFeet = 1320, fallbackExponent = 1.38) {
  const distance = Math.max(1, Number(distanceFeet || 1320));
  const elapsed = Math.max(0.1, Number(run?.elapsedTime || 0));
  const trapFeetPerSecond = Math.max(0, Number(run?.trapSpeed || 0)) * (5280 / 3600);
  const derived = (trapFeetPerSecond * elapsed) / distance;
  if (!Number.isFinite(derived) || derived <= 0) return Math.max(1, Number(fallbackExponent || 1.38));
  return Math.max(1.05, Math.min(2.4, derived));
}

export function racePhysicsProgress(now, startAt, finishAt, visualFinishAt, run, distanceFeet = 1320, timeScale = 1, fallbackExponent = 1.38) {
  if (now <= startAt) return 0;

  const distance = Math.max(1, Number(distanceFeet || 1320));
  const exponent = physicsMotionExponent(run, distance, fallbackExponent);
  if (now < finishAt) {
    const raw = Math.max(0, Math.min(1, (now - startAt) / Math.max(1, finishAt - startAt)));
    return Math.pow(raw, exponent);
  }

  const scaledSecondMs = Math.max(1, 1000 * Math.max(0.01, Number(timeScale || 1)));
  const postFinishSeconds = Math.max(0, Math.min(now, visualFinishAt) - finishAt) / scaledSecondMs;
  const trapFeetPerSecond = Math.max(0, Number(run?.trapSpeed || 0)) * (5280 / 3600);
  const flyThroughProgress = trapFeetPerSecond > 0
    ? (trapFeetPerSecond * postFinishSeconds) / distance
    : ((Math.max(0, Math.min(1, (now - finishAt) / Math.max(1, visualFinishAt - finishAt)))) * 0.08);
  return 1 + Math.max(0, Math.min(0.22, flyThroughProgress));
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

export function carLeftAtProgress({ startPlaneX, finishPlaneX, carWidth, startAnchorRatio, frontBumperRatio, progress }) {
  const width = Math.max(1, Number(carWidth || 1));
  const stageOffset = Math.max(0, Math.min(1, Number(startAnchorRatio ?? frontBumperRatio ?? 1))) * width;
  const noseOffset = Math.max(0, Math.min(1, Number(frontBumperRatio ?? 1))) * width;
  const startLeft = Number(startPlaneX || 0) - stageOffset;
  const finishLeft = Number(finishPlaneX || 0) - noseOffset;
  return startLeft + ((finishLeft - startLeft) * Number(progress || 0));
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
  const left = carLeftAtProgress({
    startPlaneX,
    finishPlaneX,
    carWidth,
    startAnchorRatio: geometry?.frontWheelRatio ?? geometry?.frontBumperRatio ?? 1,
    frontBumperRatio: geometry?.frontBumperRatio ?? 1,
    progress,
  });
  car.style.left = `${left.toFixed(2)}px`;
}

function updateWheelMotion(car, run, drivetrain, progress, now, startAt, distanceFeet, timeScale) {
  if (!car) return;
  const distance = Math.max(1, Number(distanceFeet || 1320));
  const travelFeet = distance * Math.max(0, Number(progress || 0));
  const previousTravelFeet = Math.max(0, Number(car.dataset.wheelTravelFeet || 0));
  const deltaTravelFeet = Math.max(0, travelFeet - previousTravelFeet);
  car.dataset.wheelTravelFeet = travelFeet.toFixed(6);

  const rawElapsed = (now - startAt) / Math.max(1, 1000 * timeScale);
  const elapsed = Math.max(0, rawElapsed);
  const slip = Math.max(0, Math.min(1, Number(run?.traction?.wheelSlip || 0)));
  const slipWindow = Math.max(0, 1 - (elapsed / Math.max(0.45, 0.65 + (slip * 1.7))));
  const slipRatio = 1 + (slip * 1.5 * slipWindow);
  const rollingDeltaDegrees = (deltaTravelFeet / 6.6) * 360;
  const drive = String(drivetrain || "").toUpperCase();

  const frontDriven = drive === "AWD" || drive === "FWD";
  const rearDriven = drive === "AWD" || drive === "RWD" || !drive;
  const frontAngle = Number(car.dataset.frontWheelAngle || 0) + (rollingDeltaDegrees * (frontDriven ? slipRatio : 1));
  const rearAngle = Number(car.dataset.rearWheelAngle || 0) + (rollingDeltaDegrees * (rearDriven ? slipRatio : 1));
  car.dataset.frontWheelAngle = frontAngle.toFixed(4);
  car.dataset.rearWheelAngle = rearAngle.toFixed(4);

  car.querySelectorAll(".layered-car__wheel,.layered-car__disk").forEach((node) => {
    const front = node.classList.contains("front-wheel") || node.classList.contains("front-disk");
    const angle = front ? frontAngle : rearAngle;
    node.style.transform = `rotate(${angle.toFixed(2)}deg)`;
  });

  updateTireSmoke(car, run, drivetrain, rawElapsed, progress);
}

function updateTireSmoke(car, run, drivetrain, elapsed, progress) {
  const gripLoss = Math.max(0, Math.min(1, Number(run?.traction?.gripLoss || 0)));
  const smokeLevel = Math.max(0, Math.min(1, Number(run?.traction?.smokeLevel || 0)));
  const duration = 0.45 + (gripLoss * 1.85);
  const active = elapsed >= 0 && elapsed < duration && Number(progress || 0) < 0.28 && smokeLevel > 0.01;
  const fade = active ? Math.max(0, 1 - (elapsed / duration)) : 0;
  const opacity = Math.min(0.92, smokeLevel * 1.35 * fade);
  const frame = Math.max(0, Math.min(7, Math.floor((elapsed / Math.max(0.01, duration)) * 8)));
  const drive = String(drivetrain || "").toUpperCase();

  car.querySelectorAll("[data-tire-smoke]").forEach((node) => {
    const position = node.dataset.tireSmoke;
    const driven = drive === "AWD"
      || (drive === "FWD" && position === "front")
      || ((drive === "RWD" || !drive) && position === "rear");
    node.style.opacity = driven ? opacity.toFixed(3) : "0";
    node.style.backgroundPosition = `center ${((frame / 7) * 100).toFixed(2)}%`;
    node.classList.toggle("is-active", driven && opacity > 0.025);
  });
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
