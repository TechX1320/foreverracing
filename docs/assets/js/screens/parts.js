import { bindHome, carLabel, effectsText, escapeHtml, money, pageShell, selectedCar } from "../ui/components.js";
import { showDialog, closeDialog } from "../ui/modal.js";

let catalogCache = null;
let activeCategory = "All";

export async function renderParts(ctx) {
  const player = ctx.store.player;
  if (!catalogCache) {
    const data = await ctx.storage.partsCatalog();
    catalogCache = data.parts || [];
  }
  const current = selectedCar(player);
  const categories = ["All", ...new Set(catalogCache.map((part) => part.category).filter(Boolean))];
  const parts = activeCategory === "All" ? catalogCache : catalogCache.filter((part) => part.category === activeCategory);
  const inventory = Array.isArray(player?.inventory?.parts) ? player.inventory.parts : [];

  ctx.screenRoot.innerHTML = pageShell({
    title: "Parts Shop",
    eyebrow: "PERFORMANCE",
    hint: current ? `Building ${carLabel(current)}` : "No current car",
    trail: `${money(player?.wallet?.credits)} credits`,
    body: `
      ${!current ? `<div class="result-banner warn"><strong>No Current Car</strong><div class="screen-copy">You can buy parts now, but you will need to select a car in the Garage before installing them.</div></div>` : ""}
      <div class="filter-row">${categories.map((name) => `<button class="filter-chip ${name === activeCategory ? "is-active" : ""}" type="button" data-part-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}</div>
      <div class="card-grid">
        ${parts.map((part) => `<article class="game-card"><div class="game-card__top"><div><h3>${escapeHtml(part.name)}</h3><p>${escapeHtml(part.category)} • Tier ${part.tier}</p></div><span class="game-card__price">${money(part.price)} cr</span></div><p>${escapeHtml(part.description)}</p><div class="spec-grid"><div class="spec" style="grid-column:1/-1"><span>Effects</span><strong>${escapeHtml(effectsText(part.effects))}</strong></div></div><div class="game-card__actions"><button class="button button--primary button--small" type="button" data-buy-part="${escapeHtml(part.catalogId)}" ${Number(player?.wallet?.credits || 0) >= Number(part.price) ? "" : "disabled"}>Buy Part</button></div></article>`).join("")}
      </div>
      <div class="section-heading" style="margin-top:22px"><div><small>INVENTORY</small><h2>Owned Parts</h2></div><span class="muted">${inventory.length} items</span></div>
      ${inventory.length ? `<div class="card-grid">${inventory.map((item) => inventoryCard(item, current, catalogCache)).join("")}</div>` : `<div class="empty-state"><strong>No parts yet.</strong><span>Purchased upgrades will appear here.</span></div>`}
    `,
  });

  bindHome(ctx.screenRoot, ctx.router);
  ctx.screenRoot.querySelectorAll("[data-part-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.partCategory || "All";
      renderParts(ctx);
    });
  });
  ctx.screenRoot.querySelectorAll("[data-buy-part]").forEach((button) => button.addEventListener("click", () => buyPart(ctx, button.dataset.buyPart)));
  ctx.screenRoot.querySelectorAll("[data-install-part]").forEach((button) => button.addEventListener("click", () => installPart(ctx, button.dataset.installPart)));
  ctx.screenRoot.querySelectorAll("[data-uninstall-part]").forEach((button) => button.addEventListener("click", () => uninstallPart(ctx, button.dataset.uninstallPart)));
}

function inventoryCard(item, current, catalog) {
  const spec = catalog.find((entry) => entry.catalogId === item.catalogId);
  const installed = Boolean(item.installedOnCarId);
  const installedHere = current && String(item.installedOnCarId) === String(current.carId);
  return `
    <article class="game-card ${installedHere ? "is-selected" : ""}">
      <div class="game-card__top"><div><h3>${escapeHtml(spec?.name || item.catalogId)}</h3><p>${escapeHtml(spec?.category || "Part")} • ${installed ? "Installed" : "Inventory"}</p></div>${installedHere ? `<span class="pill pill--accent">CURRENT CAR</span>` : ""}</div>
      <p>${escapeHtml(effectsText(spec?.effects || []))}</p>
      <div class="game-card__actions">
        ${installed ? `<button class="button button--small" type="button" data-uninstall-part="${escapeHtml(item.inventoryId)}">Uninstall</button>` : `<button class="button button--primary button--small" type="button" data-install-part="${escapeHtml(item.inventoryId)}" ${current ? "" : "disabled"}>Install on Current</button>`}
      </div>
    </article>`;
}

function buyPart(ctx, catalogId) {
  const spec = catalogCache?.find((entry) => entry.catalogId === catalogId);
  if (!spec) return;
  const dialog = showDialog(`<div class="dialog-body"><h2>Buy ${escapeHtml(spec.name)}?</h2><p>${escapeHtml(spec.description)}</p><div class="spec-grid"><div class="spec"><span>Price</span><strong>${money(spec.price)} cr</strong></div><div class="spec"><span>Effects</span><strong>${escapeHtml(effectsText(spec.effects))}</strong></div></div><div class="form-error" data-error></div><div class="dialog-actions"><button class="button button--small" type="button" data-cancel>Cancel</button><button class="button button--primary button--small" type="button" data-confirm>Buy</button></div></div>`);
  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog(dialog));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await ctx.storage.buyPart(catalogId);
      ctx.store.setPlayer(data.player);
      closeDialog(dialog);
      ctx.toast("Part purchased", `${spec.name} added to inventory.`);
      await renderParts(ctx);
    } catch (err) {
      dialog.querySelector("[data-error]").textContent = err.message;
      event.currentTarget.disabled = false;
    }
  });
}

async function installPart(ctx, inventoryId) {
  const current = selectedCar(ctx.store.player);
  if (!current) return;
  try {
    const data = await ctx.storage.installPart(inventoryId, current.carId);
    ctx.store.setPlayer(data.player);
    ctx.toast("Part installed", `${carLabel(current)} has been recalculated.`);
    await renderParts(ctx);
  } catch (err) {
    ctx.toast("Install failed", err.message);
  }
}

async function uninstallPart(ctx, inventoryId) {
  try {
    const data = await ctx.storage.uninstallPart(inventoryId);
    ctx.store.setPlayer(data.player);
    ctx.toast("Part uninstalled", "The part is back in inventory.");
    await renderParts(ctx);
  } catch (err) {
    ctx.toast("Uninstall failed", err.message);
  }
}
