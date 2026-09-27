import { bindHome, carLabel, money, number, pageShell, selectedCar } from "../ui/components.js";

let lastRace = null;

export async function renderQuickRace(ctx) {
  const player = ctx.store.player;
  const current = selectedCar(player);
  const result = lastRace;

  ctx.screenRoot.innerHTML = pageShell({
    title: "Quick Race",
    eyebrow: "TEXT SIMULATION",
    hint: current ? carLabel(current) : "No current car",
    trail: "Visual racing intentionally comes later",
    body: `
      ${result ? raceResult(result) : ""}
      ${current ? `
        <div class="game-card is-selected">
          <div class="game-card__top"><div><h3>${carLabel(current)}</h3><p>${current.displayName} • ${current.base?.drivetrain}</p></div><span class="pill pill--accent">CURRENT</span></div>
          <div class="spec-grid">
            <div class="spec"><span>Power</span><strong>${number(current.derived?.hp)} hp</strong></div>
            <div class="spec"><span>Torque</span><strong>${number(current.derived?.torque)} lb-ft</strong></div>
            <div class="spec"><span>Weight</span><strong>${number(current.derived?.weight)} lb</strong></div>
            <div class="spec"><span>Grip</span><strong>${number(current.derived?.grip, 3)}</strong></div>
          </div>
          <div class="game-card__actions"><button class="button button--primary" type="button" data-run-race>Find Opponent & Race</button></div>
        </div>` : `
        <div class="empty-state"><strong>You need a Current Car.</strong><span>Buy a car and select it in the Garage first.</span><div class="cluster" style="justify-content:center;margin-top:14px"><button class="button button--primary button--small" data-go-garage>Open Garage</button><button class="button button--small" data-go-showroom>Showroom</button></div></div>`}
      <p class="screen-copy" style="margin-bottom:0;margin-top:14px">The current race calculation is deliberately lightweight. It uses power-to-weight, grip, reaction-time variance and a matched opponent. It exists so the economy and progression loops can be tested before car/street assets are built.</p>
    `,
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-go-garage]")?.addEventListener("click", () => ctx.router.navigate("garage"));
  ctx.screenRoot.querySelector("[data-go-showroom]")?.addEventListener("click", () => ctx.router.navigate("showroom"));
  ctx.screenRoot.querySelector("[data-run-race]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Staging…";
    try {
      const data = await ctx.storage.quickRace();
      lastRace = data.race;
      ctx.store.setPlayer(data.player);
      ctx.toast(data.race.won ? "Win" : "Loss", `+${money(data.race.reward)} credits`);
      await renderQuickRace(ctx);
    } catch (err) {
      ctx.toast("Race failed", err.message);
      button.disabled = false;
      button.textContent = "Find Opponent & Race";
    }
  });
}

function raceResult(race) {
  return `
    <div class="result-banner ${race.won ? "result-banner--win" : "result-banner--loss"}">
      <div class="split"><strong>${race.won ? "WIN" : "LOSS"} • ${carLabel({ displayName: race.carName })}</strong><span class="${race.won ? "good" : "bad"}">+${money(race.reward)} cr</span></div>
      <div class="spec-grid">
        <div class="spec"><span>Your ET</span><strong>${number(race.playerEt, 3)} s</strong></div>
        <div class="spec"><span>Opponent ET</span><strong>${number(race.opponentEt, 3)} s</strong></div>
        <div class="spec"><span>Reaction</span><strong>${number(race.reaction, 3)} s</strong></div>
        <div class="spec"><span>Opponent</span><strong>${race.opponent?.name || "Unknown"}</strong></div>
      </div>
    </div>`;
}
