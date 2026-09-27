import { bindHome, carLabel, money, number, pageShell, selectedCar } from "../ui/components.js";

let lastStep = null;

export async function renderRoguelike(ctx) {
  const player = ctx.store.player;
  const current = selectedCar(player);
  const rogue = player?.roguelike || {};
  const run = rogue.activeRun;

  ctx.screenRoot.innerHTML = pageShell({
    title: "RogueLike",
    eyebrow: "PVE RUN PROTOTYPE",
    hint: run ? `Stage ${run.stage}/${run.maxStages}` : `Best stage ${rogue.bestStage || 0}`,
    trail: "Risk • rewards • temporary run boost",
    body: `
      ${lastStep ? stepBanner(lastStep) : ""}
      ${!current ? `<div class="empty-state"><strong>Select a car first.</strong><span>RogueLike runs use your Current Car as the base vehicle.</span><div style="margin-top:14px"><button class="button button--primary button--small" data-go-garage>Open Garage</button></div></div>` : run ? activeRun(current, run) : startRun(current, rogue)}
      <p class="screen-copy" style="margin-top:14px;margin-bottom:0">This is intentionally a small playable proof of concept. Run upgrades are temporary, risk increases as stages climb, and your run credits are only fully banked if you finish all seven stages.</p>
    `,
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-go-garage]")?.addEventListener("click", () => ctx.router.navigate("garage"));
  ctx.screenRoot.querySelector("[data-start-run]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.roguelikeStart();
      lastStep = null;
      ctx.store.setPlayer(data.player);
      ctx.toast("Run started", "Seven stages stand between you and the full payout.");
      await renderRoguelike(ctx);
    } catch (err) {
      ctx.toast("Could not start run", err.message);
      event.currentTarget.disabled = false;
    }
  });
  ctx.screenRoot.querySelectorAll("[data-run-choice]").forEach((button) => {
    button.addEventListener("click", async () => {
      const choice = button.dataset.runChoice;
      ctx.screenRoot.querySelectorAll("[data-run-choice]").forEach((node) => node.disabled = true);
      try {
        const data = await ctx.storage.roguelikeStep(choice);
        lastStep = data.step;
        ctx.store.setPlayer(data.player);
        ctx.toast(data.step.won ? "Stage cleared" : "Run ended", data.step.finished ? `Banked ${money(data.step.banked || 0)} credits.` : `+${money(data.step.reward || 0)} run credits`);
        await renderRoguelike(ctx);
      } catch (err) {
        ctx.toast("Run error", err.message);
        await renderRoguelike(ctx);
      }
    });
  });
}

function startRun(car, rogue) {
  return `<div class="game-card is-selected"><div class="game-card__top"><div><h3>${carLabel(car)}</h3><p>${car.displayName}</p></div><span class="pill pill--accent">READY</span></div><div class="spec-grid"><div class="spec"><span>Best Stage</span><strong>${rogue.bestStage || 0}</strong></div><div class="spec"><span>Completed Runs</span><strong>${rogue.runsCompleted || 0}</strong></div><div class="spec"><span>Power</span><strong>${number(car.derived?.hp)} hp</strong></div><div class="spec"><span>Weight</span><strong>${number(car.derived?.weight)} lb</strong></div></div><div class="game-card__actions"><button class="button button--primary" type="button" data-start-run>Start New Run</button></div></div>`;
}

function activeRun(car, run) {
  return `<div class="stack"><div class="result-banner"><div class="split"><strong>${carLabel(car)} • Stage ${run.stage}</strong><span class="pill pill--accent">${money(run.runCredits)} run cr</span></div><div class="spec-grid"><div class="spec"><span>Run Boost</span><strong>+${number((run.boost || 0) * 100, 1)}%</strong></div><div class="spec"><span>Stages Left</span><strong>${Math.max(0, run.maxStages - run.stage + 1)}</strong></div></div></div><div class="card-grid"><article class="game-card"><h3>Safe Line</h3><p>Lower reward multiplier and a slightly easier opponent. Build the run more steadily.</p><div class="game-card__actions"><button class="button button--primary button--small" data-run-choice="safe">Run Safe Stage</button></div></article><article class="game-card"><h3>Push It</h3><p>Harder opponent, but a much larger reward if you make it through.</p><div class="game-card__actions"><button class="button button--primary button--small" data-run-choice="push">Push for Reward</button></div></article></div></div>`;
}

function stepBanner(step) {
  if (!step) return "";
  if (!step.won) return `<div class="result-banner result-banner--loss"><strong>Run ended at Stage ${step.stage}</strong><div class="screen-copy">You salvaged ${money(step.banked || 0)} credits from the run.</div></div>`;
  if (step.finished) return `<div class="result-banner result-banner--win"><strong>Run complete!</strong><div class="screen-copy">Final stage cleared. ${money(step.banked || 0)} credits banked.</div></div>`;
  return `<div class="result-banner result-banner--win"><strong>Stage ${step.stage} cleared</strong><div class="screen-copy">+${money(step.reward || 0)} run credits. Your temporary run boost increased.</div></div>`;
}
