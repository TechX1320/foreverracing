import { bindHome, carLabel, escapeHtml, money, number, pageShell } from "../ui/components.js";
import { showDialog, closeDialog } from "../ui/modal.js";

export async function renderGarage(ctx) {
  const player = ctx.store.player;
  const garage = Array.isArray(player?.garage) ? player.garage : [];

  const body = garage.length === 0
    ? `<div class="empty-state"><strong>Your garage is empty.</strong><span>Head to the Showroom or Used Car Lot and bring something home.</span><div class="cluster" style="justify-content:center;margin-top:14px"><button class="button button--primary button--small" data-go-showroom>Open Showroom</button><button class="button button--small" data-go-used>Used Car Lot</button></div></div>`
    : `<div class="card-grid">${garage.map((car) => carCard(player, car)).join("")}</div>`;

  ctx.screenRoot.innerHTML = pageShell({
    title: "Garage",
    eyebrow: "YOUR COLLECTION",
    hint: `${garage.length} ${garage.length === 1 ? "car" : "cars"}`,
    trail: player?.selectedCarId ? "Current car selected" : "Choose a current car",
    body,
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelector("[data-go-showroom]")?.addEventListener("click", () => ctx.router.navigate("showroom"));
  ctx.screenRoot.querySelector("[data-go-used]")?.addEventListener("click", () => ctx.router.navigate("usedlot"));

  ctx.screenRoot.querySelectorAll("[data-select-car]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await ctx.storage.selectCar(button.dataset.selectCar);
        ctx.store.setPlayer(data.player);
        ctx.toast("Current car changed", "Garage selection updated.");
        await renderGarage(ctx);
      } catch (err) {
        ctx.toast("Could not select car", err.message);
        button.disabled = false;
      }
    });
  });

  ctx.screenRoot.querySelectorAll("[data-rename-car]").forEach((button) => {
    button.addEventListener("click", () => renameCar(ctx, button.dataset.renameCar));
  });
}

function carCard(player, car) {
  const selected = String(player?.selectedCarId || "") === String(car.carId);
  const label = carLabel(car);
  const installed = Number(car?.installedParts?.length || 0);
  return `
    <article class="game-card ${selected ? "is-selected" : ""}">
      <div class="game-card__top">
        <div><h3>${escapeHtml(label)}</h3><p>${escapeHtml(car.displayName)} • ${escapeHtml(car.base?.drivetrain)} • ${escapeHtml(car.source === "used" ? "Used" : "New")}</p></div>
        <span class="pill ${selected ? "pill--accent" : ""}">${selected ? "CURRENT" : `${number(car.condition)}%`}</span>
      </div>
      <div class="spec-grid">
        <div class="spec"><span>Power</span><strong>${number(car.derived?.hp)} hp</strong></div>
        <div class="spec"><span>Torque</span><strong>${number(car.derived?.torque)} lb-ft</strong></div>
        <div class="spec"><span>Weight</span><strong>${number(car.derived?.weight)} lb</strong></div>
        <div class="spec"><span>Mileage</span><strong>${number(car.mileage)} mi</strong></div>
      </div>
      <p>Purchased for ${money(car.purchasePrice)} cr${installed ? ` • ${installed} installed parts` : ""}</p>
      <div class="game-card__actions">
        <button class="button button--primary button--small" type="button" data-select-car="${escapeHtml(car.carId)}" ${selected ? "disabled" : ""}>${selected ? "Selected" : "Make Current"}</button>
        <button class="button button--small" type="button" data-rename-car="${escapeHtml(car.carId)}">Rename</button>
      </div>
    </article>`;
}

function renameCar(ctx, carId) {
  const car = ctx.store.player?.garage?.find((entry) => String(entry.carId) === String(carId));
  if (!car) return;
  const dialog = showDialog(`
    <form class="dialog-body" data-rename-form>
      <h2>Rename Car</h2>
      <p>${escapeHtml(car.displayName)}. Leave the factory identity intact underneath; this only changes the garage nickname.</p>
      <div class="field"><label for="carNickname">Nickname</label><input id="carNickname" name="name" maxlength="32" value="${escapeHtml(car.nickname || car.displayName)}" autocomplete="off"></div>
      <div class="form-error" data-rename-error></div>
      <div class="dialog-actions"><button class="button button--small" type="button" data-cancel>Cancel</button><button class="button button--primary button--small" type="submit">Save Name</button></div>
    </form>`);

  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-rename-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    const name = new FormData(event.currentTarget).get("name");
    submit.disabled = true;
    try {
      const data = await ctx.storage.renameCar(carId, String(name || ""));
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast("Car renamed", "Your garage has been updated.");
      await renderGarage(ctx);
    } catch (err) {
      dialog.querySelector("[data-rename-error]").textContent = err.message;
      submit.disabled = false;
    }
  });
}
