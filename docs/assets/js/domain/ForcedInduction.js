export function normalizeFiSystem(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("super")) return "supercharger";
  if (text.includes("turbo")) return "turbo";
  if (text.includes("nitrous") || text.includes("nos")) return "nitrous";
  return null;
}

export function factoryForcedInductionSystem(car) {
  return normalizeFiSystem(car?.engine?.aspiration || car?.factoryAspiration || "");
}

export function forcedInductionMeta(part) {
  const meta = part?.forcedInduction;
  return meta && typeof meta === "object" ? meta : null;
}

export function forcedInductionState(car, inventory = [], catalog = []) {
  const installed = (Array.isArray(inventory) ? inventory : [])
    .filter((item) => String(item?.installedOnCarId || "") === String(car?.carId || ""))
    .map((item) => ({
      item,
      spec: (Array.isArray(catalog) ? catalog : []).find((part) => String(part?.catalogId || "") === String(item?.catalogId || "")) || null,
    }))
    .filter((row) => row.spec);

  const factorySystem = factoryForcedInductionSystem(car);
  const primaryRow = installed.find((row) => String(row.spec?.slot || "") === "forced_induction_primary") || null;
  const secondaryRow = installed.find((row) => String(row.spec?.slot || "") === "forced_induction_secondary") || null;
  const factoryUpgradeRow = installed.find((row) => String(row.spec?.slot || "") === "forced_induction_factory_upgrade") || null;
  const nitrousRow = installed.find((row) => String(row.spec?.slot || "") === "nitrous") || null;

  const primaryMeta = forcedInductionMeta(primaryRow?.spec);
  const secondaryMeta = forcedInductionMeta(secondaryRow?.spec);
  const factoryUpgradeMeta = forcedInductionMeta(factoryUpgradeRow?.spec);
  const nitrousMeta = forcedInductionMeta(nitrousRow?.spec);

  const primaryOverride = normalizeFiSystem(primaryMeta?.system);
  const primarySystem = primaryOverride || factorySystem;
  const secondarySystem = normalizeFiSystem(secondaryMeta?.system);
  const systems = [...new Set([primarySystem, secondarySystem].filter(Boolean))];

  return {
    factorySystem,
    primarySystem,
    primarySource: primaryOverride ? "aftermarket" : (factorySystem ? "factory" : null),
    primaryStep: primaryOverride ? Math.max(0, Number(primaryMeta?.step || 0)) : 0,
    primaryPart: primaryRow?.spec || null,
    secondarySystem,
    secondaryPart: secondaryRow?.spec || null,
    factoryUpgradeStep: Math.max(0, Number(factoryUpgradeMeta?.step || 0)),
    factoryUpgradePart: factoryUpgradeRow?.spec || null,
    nitrousShot: Math.max(0, Number(nitrousMeta?.shot || 0)),
    nitrousStep: Math.max(0, Number(nitrousMeta?.step || 0)),
    nitrousPart: nitrousRow?.spec || null,
    systems,
    installed,
  };
}

export function forcedInductionCompatibility(car, inventory, part, catalog, { purchasing = false } = {}) {
  const meta = forcedInductionMeta(part);
  if (!meta) return { ok: true, reason: "" };

  const stage = Number(car?.buildStage || 1);
  const state = forcedInductionState(car, inventory, catalog);
  const system = normalizeFiSystem(meta.system);
  const role = String(meta.role || "");

  if (stage < 2) return { ok: false, reason: "Forced Induction unlocks with Street Race Car." };

  if (role === "factory_upgrade") {
    if (!system || state.factorySystem !== system || state.primarySource !== "factory") {
      return { ok: false, reason: `Requires the factory ${systemLabel(system)} system to still be installed.` };
    }
    const step = Math.max(1, Number(meta.step || 1));
    if (purchasing && step !== state.factoryUpgradeStep + 1) {
      return { ok: false, reason: "Complete the previous factory-kit upgrade first." };
    }
    return { ok: true, reason: "" };
  }

  if (role === "kit") {
    if (state.primarySource === "factory" && state.primarySystem === system) {
      return { ok: false, reason: `The factory ${systemLabel(system)} kit is already the base system.` };
    }
    if (state.primarySource === "aftermarket" && state.primarySystem === system) {
      return { ok: false, reason: `An aftermarket ${systemLabel(system)} kit is already installed.` };
    }
    if (state.secondarySystem && stage >= 4) {
      return { ok: false, reason: "Remove the secondary twin-charge kit before swapping the primary system." };
    }
    return { ok: true, reason: "" };
  }

  if (role === "kit_upgrade") {
    if (state.primarySource !== "aftermarket" || state.primarySystem !== system) {
      return { ok: false, reason: `Install the aftermarket ${systemLabel(system)} kit first.` };
    }
    const step = Math.max(1, Number(meta.step || 1));
    if (purchasing && step !== state.primaryStep + 1) {
      return { ok: false, reason: "Complete the previous kit upgrade first." };
    }
    return { ok: true, reason: "" };
  }

  if (role === "component") {
    if (!state.systems.includes(system)) {
      return { ok: false, reason: `Requires an active ${systemLabel(system)} system.` };
    }
    return { ok: true, reason: "" };
  }

  if (role === "twin_kit") {
    const requires = normalizeFiSystem(meta.requiresSystem);
    if (stage < 4) return { ok: false, reason: "Twin charging unlocks with Full Race Car." };
    if (!requires || state.primarySystem !== requires) {
      return { ok: false, reason: `Requires ${systemLabel(requires)} as the primary system.` };
    }
    if (state.secondarySystem) return { ok: false, reason: "A secondary twin-charge system is already installed." };
    if (state.primarySystem === system) return { ok: false, reason: "Twin charging needs the opposite forced-induction system." };
    return { ok: true, reason: "" };
  }

  if (role === "nitrous") {
    const step = Math.max(0, Number(meta.step || 0));
    if (purchasing && step !== state.nitrousStep + (state.nitrousShot ? 1 : 0)) {
      if (!state.nitrousShot && step === 0) return { ok: true, reason: "" };
      return { ok: false, reason: "Buy the previous NOS fogger size first." };
    }
    return { ok: true, reason: "" };
  }

  return { ok: true, reason: "" };
}

export function forcedInductionSwapNeeded(car, inventory, part, catalog) {
  const meta = forcedInductionMeta(part);
  if (!meta || String(meta.role || "") !== "kit") return false;
  const state = forcedInductionState(car, inventory, catalog);
  const system = normalizeFiSystem(meta.system);
  return Boolean(state.primarySystem && system && state.primarySystem !== system);
}

export function systemLabel(system) {
  if (system === "turbo") return "Turbo";
  if (system === "supercharger") return "Supercharger";
  if (system === "nitrous") return "NOS";
  return "Forced Induction";
}
