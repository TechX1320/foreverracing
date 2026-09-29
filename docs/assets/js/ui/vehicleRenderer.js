export function renderVehicle(car, { stage = null, compact = false, view = "sideProfile", className = "", animatedWheels = false } = {}) {
  const layered = car?.visual?.layered;
  if (!layered?.canvas || !layered?.layers || !layered?.anchors) {
    return renderMissingArt(car, { compact, view });
  }
  return renderLayeredVehicle(car, layered, { stage, compact, view, className, animatedWheels });
}

export function vehicleGeometry(car) {
  const layered = car?.visual?.layered;
  if (!layered?.canvas || !layered?.anchors) return null;
  const width = Math.max(1, Number(layered.canvas.width || 1));
  const height = Math.max(1, Number(layered.canvas.height || 1));
  const atlas = layered.certifiedAtlas;
  if (atlas?.src) {
    const cellWidth = Math.max(1, Number(atlas.cellWidth || 360));
    const cellHeight = Math.max(1, Number(atlas.cellHeight || 150));
    const scale = Math.max(0.01, Number(atlas.scale || 1));
    const carX = Number(atlas.carX || 0);
    const carY = Number(atlas.carY || 0);
    return {
      canvasWidth: cellWidth,
      canvasHeight: cellHeight,
      frontWheelRatio: clamp01((carX + (Number(layered.anchors.frontWheelCenter?.x ?? width) * scale)) / cellWidth),
      rearWheelRatio: clamp01((carX + (Number(layered.anchors.rearWheelCenter?.x ?? 0) * scale)) / cellWidth),
      frontBumperRatio: clamp01((carX + (Number(layered.anchors.frontBumperX ?? width) * scale)) / cellWidth),
      rearBumperRatio: clamp01((carX + (Number(layered.anchors.rearBumperX ?? 0) * scale)) / cellWidth),
      groundRatio: clamp01((carY + (Number(layered.anchors.groundY ?? height) * scale)) / cellHeight),
    };
  }
  return {
    canvasWidth: width,
    canvasHeight: height,
    frontWheelRatio: clamp01(Number(layered.anchors.frontWheelCenter?.x ?? width) / width),
    rearWheelRatio: clamp01(Number(layered.anchors.rearWheelCenter?.x ?? 0) / width),
    frontBumperRatio: clamp01(Number(layered.anchors.frontBumperX ?? width) / width),
    rearBumperRatio: clamp01(Number(layered.anchors.rearBumperX ?? 0) / width),
    groundRatio: clamp01(Number(layered.anchors.groundY ?? height) / height),
  };
}

function renderLayeredVehicle(car, layered, { compact, view, className, animatedWheels }) {
  const canvasWidth = Math.max(1, Number(layered.canvas.width || 1));
  const canvasHeight = Math.max(1, Number(layered.canvas.height || 1));
  const layers = animatedWheels && layered.raceLayers ? layered.raceLayers : (layered.layers || {});
  const anchors = layered.anchors || {};
  const rear = anchors.rearWheelCenter || {};
  const front = anchors.frontWheelCenter || {};
  const geometry = vehicleGeometry(car);
  const displayWidth = Math.max(1, Number(geometry?.canvasWidth || canvasWidth));
  const displayHeight = Math.max(1, Number(geometry?.canvasHeight || canvasHeight));
  const rootStyle = [
    `--car-aspect:${displayWidth}/${displayHeight}`,
    `--front-bumper-ratio:${geometry?.frontBumperRatio ?? 1}`,
    `--rear-bumper-ratio:${geometry?.rearBumperRatio ?? 0}`,
    `--ground-ratio:${geometry?.groundRatio ?? 1}`,
  ].join(";");

  const certifiedSrc = String(layered.certifiedSrc || "").trim();
  if (!animatedWheels && certifiedSrc) {
    return `
    <div class="vehicle-visual vehicle-visual--layered vehicle-visual--certified vehicle-visual--${escapeAttr(view)} ${compact ? "vehicle-visual--compact" : ""} ${escapeAttr(className)}"
         role="img"
         aria-label="${escapeAttr(car?.displayName || "Vehicle")} side profile"
         data-layered-car
         data-certified-car
         data-asset-id="${escapeAttr(layered.assetId || "")}"
         data-front-bumper-ratio="${geometry?.frontBumperRatio ?? 1}"
         style="${escapeAttr(rootStyle)}">
      <div class="layered-car layered-car--certified" aria-hidden="true">
        <img data-vehicle-image class="layered-car__certified" src="${escapeAttr(versionedAsset(certifiedSrc))}" alt="">
      </div>
    </div>`;
  }

  const atlas = layered.certifiedAtlas;
  if (!animatedWheels && atlas?.src) {
    const columns = Math.max(1, Number(atlas.columns || 1));
    const rows = Math.max(1, Number(atlas.rows || 1));
    const col = Math.max(0, Number(atlas.col || 0));
    const row = Math.max(0, Number(atlas.row || 0));
    const posX = columns <= 1 ? 0 : (col / (columns - 1)) * 100;
    const posY = rows <= 1 ? 0 : (row / (rows - 1)) * 100;
    const atlasStyle = [
      `background-image:url("${versionedAsset(atlas.src)}")`,
      `background-size:${columns * 100}% ${rows * 100}%`,
      `background-position:${posX}% ${posY}%`,
    ].join(";");
    return `
    <div class="vehicle-visual vehicle-visual--layered vehicle-visual--certified vehicle-visual--atlas vehicle-visual--${escapeAttr(view)} ${compact ? "vehicle-visual--compact" : ""} ${escapeAttr(className)}"
         role="img"
         aria-label="${escapeAttr(car?.displayName || "Vehicle")} side profile"
         data-layered-car
         data-certified-car
         data-asset-id="${escapeAttr(layered.assetId || "")}"
         data-front-bumper-ratio="${geometry?.frontBumperRatio ?? 1}"
         style="${escapeAttr(rootStyle)}">
      <div class="layered-car layered-car--atlas" aria-hidden="true" style="${escapeAttr(atlasStyle)}"></div>
    </div>`;
  }

  const paintColor = String(car?.visual?.paintColor || "").trim();
  const body = imageLayer(layers.body, "body", canvasWidth, canvasHeight, { x: 0, y: 0 });
  const detail = imageLayer(layers.detail, "detail", canvasWidth, canvasHeight, { x: 0, y: 0 });
  const rearWheel = centeredLayer(layers.wheel, "wheel rear-wheel", rear, canvasWidth, canvasHeight);
  const rearDisk = centeredLayer(layers.disk, "disk rear-disk", rear, canvasWidth, canvasHeight);
  const frontWheel = centeredLayer(layers.wheel, "wheel front-wheel", front, canvasWidth, canvasHeight);
  const frontDisk = centeredLayer(layers.disk, "disk front-disk", front, canvasWidth, canvasHeight);
  const paint = paintColor && layers.body?.src
    ? `<span class="layered-car__paint" style="${escapeAttr(paintStyle(layers.body.src, paintColor))}" aria-hidden="true"></span>`
    : "";

  const rearSmoke = animatedWheels
    ? smokeAnchor("rear", rear, canvasWidth, canvasHeight)
    : "";
  const frontSmoke = animatedWheels
    ? smokeAnchor("front", front, canvasWidth, canvasHeight)
    : "";

  return `
    <div class="vehicle-visual vehicle-visual--layered vehicle-visual--${escapeAttr(view)} ${animatedWheels ? "vehicle-visual--animated-wheels" : ""} ${compact ? "vehicle-visual--compact" : ""} ${escapeAttr(className)}"
         role="img"
         aria-label="${escapeAttr(car?.displayName || "Vehicle")} side profile"
         data-layered-car
         data-animated-wheels="${animatedWheels ? "1" : "0"}"
         data-asset-id="${escapeAttr(layered.assetId || "")}"
         data-front-bumper-ratio="${geometry?.frontBumperRatio ?? 1}"
         style="${escapeAttr(rootStyle)}">
      <div class="layered-car" aria-hidden="true">
        ${rearSmoke}
        ${frontSmoke}
        ${rearWheel}
        ${rearDisk}
        ${frontWheel}
        ${frontDisk}
        ${body}
        ${paint}
        ${detail}
      </div>
    </div>`;
}

function smokeAnchor(position, center, canvasWidth, canvasHeight) {
  if (center?.x == null || center?.y == null) return "";
  const left = (Number(center.x) / canvasWidth) * 100;
  const top = (Number(center.y) / canvasHeight) * 100;
  return `<span class="layered-car__smoke layered-car__smoke--${escapeAttr(position)}" data-tire-smoke="${escapeAttr(position)}" style="left:${left}%;top:${top}%"></span>`;
}

function imageLayer(layer, className, canvasWidth, canvasHeight, origin) {
  if (!layer?.src) return "";
  const width = Math.max(1, Number(layer.width || canvasWidth));
  const height = Math.max(1, Number(layer.height || canvasHeight));
  const left = (Number(origin.x || 0) / canvasWidth) * 100;
  const top = (Number(origin.y || 0) / canvasHeight) * 100;
  const widthPct = (width / canvasWidth) * 100;
  const heightPct = (height / canvasHeight) * 100;
  return `<img data-vehicle-image class="layered-car__layer layered-car__${escapeAttr(className)}" src="${escapeAttr(versionedAsset(layer.src))}" alt="" style="left:${left}%;top:${top}%;width:${widthPct}%;height:${heightPct}%">`;
}

function centeredLayer(layer, className, center, canvasWidth, canvasHeight) {
  if (!layer?.src || center?.x == null || center?.y == null) return "";
  const width = Math.max(1, Number(layer.width || 1));
  const height = Math.max(1, Number(layer.height || 1));
  return imageLayer(layer, className, canvasWidth, canvasHeight, {
    x: Number(center.x) - (width / 2),
    y: Number(center.y) - (height / 2),
  });
}

function paintStyle(bodySrc, color) {
  const src = versionedAsset(bodySrc);
  return [
    `background:${color}`,
    `-webkit-mask-image:url("${src}")`,
    `mask-image:url("${src}")`,
    "-webkit-mask-size:100% 100%",
    "mask-size:100% 100%",
    "-webkit-mask-repeat:no-repeat",
    "mask-repeat:no-repeat",
  ].join(";");
}

function renderMissingArt(car, { compact = false, view = "sideProfile" } = {}) {
  return `
    <div class="vehicle-visual vehicle-visual--missing ${compact ? "vehicle-visual--compact" : ""}" role="img" aria-label="${escapeAttr(car?.displayName || "Vehicle")} layered artwork missing">
      <span data-vehicle-missing class="vehicle-missing-art ${compact ? "vehicle-missing-art--compact" : "vehicle-missing-art--full"}" aria-hidden="true"><b>?</b><small>ART MISSING</small><em>${escapeAttr(car?.displayName || "Vehicle")}</em></span>
    </div>`;
}

function versionedAsset(path) {
  const build = String(document.documentElement?.dataset?.build || "").trim();
  if (!build || !path) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(build)}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
