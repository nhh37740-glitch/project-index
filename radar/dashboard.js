(() => {
  "use strict";

  const config = window.DEMO_CONFIG;
  const status = document.getElementById("status");
  const boot = document.getElementById("boot");
  const bootText = document.getElementById("boot-text");
  const playBtn = document.getElementById("btn-play");
  const slider = document.getElementById("frame-slider");

  const F = Object.freeze({
    frameIndex: 0,
    timestamp: 1,
    gtNorth: 2,
    gtEast: 3,
    gtDown: 4,
    gtYaw: 5,
    radarPrimaryNorth: 6,
    radarPrimaryEast: 7,
    radarPrimaryDown: 8,
    radarPrimaryYaw: 9,
    temporalNorth: 10,
    temporalEast: 11,
    temporalDown: 12,
    temporalYaw: 13,
    singleFrameNorth: 14,
    singleFrameEast: 15,
    singleFrameDown: 16,
    singleFrameYaw: 17,
    voPrimaryNorth: 18,
    voPrimaryEast: 19,
    voPrimaryDown: 20,
    voPrimaryYaw: 21,
    pureVONorth: 22,
    pureVOEast: 23,
    pureVODown: 24,
    pureVOYaw: 25,
    pureRadarNorth: 26,
    pureRadarEast: 27,
    pureRadarDown: 28,
    pureRadarYaw: 29,
    voPrimaryModelAccepted: 30,
    stereoTimestamp: 31,
  });

  const colors = Object.freeze({
    grid: "rgba(142, 180, 201, 0.13)",
    axis: "rgba(172, 204, 220, 0.48)",
    route: "rgba(167, 199, 214, 0.19)",
    gt: "#51d8ee",
    radarPrimary: "#ff815f",
    temporal: "#b795ff",
    singleFrame: "#57e39b",
    voPrimary: "#ffd166",
    pureVO: "#f2f8fb",
    pureRadar: "#ff5f9e",
    text: "#b6cbd6",
  });

  const METHODS = Object.freeze([
    {
      key: "gt",
      label: "Ground Truth",
      detail: "Reference pose",
      color: colors.gt,
      north: F.gtNorth,
      east: F.gtEast,
      down: F.gtDown,
      yaw: F.gtYaw,
      isGT: true,
    },
    {
      key: "pure-vo",
      label: "Pure VO",
      detail: "GT-aligned start",
      color: colors.pureVO,
      north: F.pureVONorth,
      east: F.pureVOEast,
      down: F.pureVODown,
      yaw: F.pureVOYaw,
    },
    {
      key: "pure-radar",
      label: "Pure Radar Odometry",
      detail: "GT-aligned start",
      color: colors.pureRadar,
      north: F.pureRadarNorth,
      east: F.pureRadarEast,
      down: F.pureRadarDown,
      yaw: F.pureRadarYaw,
    },
    {
      key: "single-frame",
      label: "Single Frame Model",
      detail: "V86",
      color: colors.singleFrame,
      north: F.singleFrameNorth,
      east: F.singleFrameEast,
      down: F.singleFrameDown,
      yaw: F.singleFrameYaw,
    },
    {
      key: "temporal",
      label: "Temporal Model",
      detail: "V113",
      color: colors.temporal,
      north: F.temporalNorth,
      east: F.temporalEast,
      down: F.temporalDown,
      yaw: F.temporalYaw,
    },
    {
      key: "vo-primary",
      label: "VO + Model",
      detail: "V118",
      color: colors.voPrimary,
      north: F.voPrimaryNorth,
      east: F.voPrimaryEast,
      down: F.voPrimaryDown,
      yaw: F.voPrimaryYaw,
    },
    {
      key: "radar-primary",
      label: "CFEAR-lite + Model",
      detail: "Radar-primary fusion",
      color: colors.radarPrimary,
      north: F.radarPrimaryNorth,
      east: F.radarPrimaryEast,
      down: F.radarPrimaryDown,
      yaw: F.radarPrimaryYaw,
    },
  ]);

  const ESTIMATORS = METHODS.filter((method) => !method.isGT);
  const LAYOUTS = ["compare", "overlay", "analysis", "focus"];
  const SPEEDS = [0.25, 0.5, 1, 2, 4];
  const PRELOAD_AHEAD = 12;
  const MAX_CACHED_IMAGES = 32;

  const methodByKey = Object.fromEntries(METHODS.map((method) => [method.key, method]));
  const visible = new Set(ESTIMATORS.map((method) => method.key));
  let focusKey = "radar-primary";
  let clip = [];
  let cameraCenters = [];
  let localBounds = null;
  let globalBounds = null;
  let metadata = null;
  let currentIndex = 0;
  let paused = false;
  let lastStep = 0;
  let speed = 1;
  let hoverFrame = null;
  const errorPos = {};
  const errorYaw = {};
  const stats = {};
  const radarImageCache = new Map();
  const stereoImageCache = new Map();

  function canvasPair(id, globalId) {
    const canvas = document.getElementById(id);
    const globalCanvas = document.getElementById(globalId);
    return {
      canvas,
      context: canvas ? canvas.getContext("2d") : null,
      globalCanvas,
      globalContext: globalCanvas ? globalCanvas.getContext("2d") : null,
    };
  }

  const compareViews = Object.fromEntries(
    METHODS.map((method) => [method.key, canvasPair(`${method.key}-map`, `${method.key}-global-map`)]),
  );
  const overlayView = canvasPair("overlay-map", "overlay-global-map");
  const focusView = canvasPair("focus-map", "focus-global-map");
  const posChart = document.getElementById("error-pos-chart");
  const yawChart = document.getElementById("error-yaw-chart");
  const barChart = document.getElementById("error-bar-chart");
  const focusChart = document.getElementById("focus-error-chart");
  const posTip = document.getElementById("pos-tooltip");
  const yawTip = document.getElementById("yaw-tooltip");

  function fail(message) {
    status.textContent = message;
    status.classList.add("error");
    if (bootText) bootText.textContent = message;
    console.error(message);
  }

  function setBound(name, value) {
    document.querySelectorAll(`[data-bind="${name}"]`).forEach((node) => {
      node.textContent = value;
    });
  }

  function setChip(name, text, level) {
    document.querySelectorAll(`[data-bind="${name}"]`).forEach((node) => {
      node.textContent = text;
      node.dataset.level = level;
    });
  }

  function currentLayout() {
    return document.body.dataset.layout || "compare";
  }

  function ensureTrailingSlash(path) {
    return path.endsWith("/") ? path : `${path}/`;
  }

  function radarImageUrl(timestamp) {
    return `${ensureTrailingSlash(config.radarImageDirectory)}${timestamp}.jpg`;
  }

  function stereoImageUrl(timestamp) {
    return `${ensureTrailingSlash(config.stereoImageDirectory)}${timestamp}.jpg`;
  }

  function loadPoseScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load pose data: ${path}`));
      document.head.appendChild(script);
    });
  }

  function wrapDegrees(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
  }

  function planarError(row, method) {
    return Math.hypot(row[method.north] - row[F.gtNorth], row[method.east] - row[F.gtEast]);
  }

  function yawAbsError(row, method) {
    return Math.abs(wrapDegrees(row[method.yaw] - row[F.gtYaw]));
  }

  function errorLevel(metres) {
    if (metres < 1) return "good";
    if (metres < 3) return "mid";
    return "bad";
  }

  function formatMetres(value) {
    return `${Number(value).toFixed(1)} m`;
  }

  function formatDegrees(value) {
    return `${Number(value).toFixed(1)}°`;
  }

  function formatCompact(value, digits = 2) {
    if (!Number.isFinite(value)) return "—";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    return value.toFixed(digits);
  }

  function computeLocalBounds(center) {
    const span = Number(config.mapSpanMetres || 200);
    if (!Number.isFinite(span) || span <= 0) {
      throw new Error(`Invalid mapSpanMetres: ${config.mapSpanMetres}`);
    }
    const half = span / 2;
    return {
      minNorth: center.north - half,
      maxNorth: center.north + half,
      minEast: center.east - half,
      maxEast: center.east + half,
    };
  }

  function computeCameraCenters(rows) {
    const smoothing = 0.12;
    let north = rows[0][F.gtNorth];
    let east = rows[0][F.gtEast];
    return rows.map((row) => {
      north += (row[F.gtNorth] - north) * smoothing;
      east += (row[F.gtEast] - east) * smoothing;
      return { north, east };
    });
  }

  function computeGlobalBounds(rows) {
    let minNorth = Infinity;
    let maxNorth = -Infinity;
    let minEast = Infinity;
    let maxEast = -Infinity;
    rows.forEach((row) => {
      minNorth = Math.min(minNorth, row[F.gtNorth]);
      maxNorth = Math.max(maxNorth, row[F.gtNorth]);
      minEast = Math.min(minEast, row[F.gtEast]);
      maxEast = Math.max(maxEast, row[F.gtEast]);
    });
    const centerNorth = (minNorth + maxNorth) / 2;
    const centerEast = (minEast + maxEast) / 2;
    const span = Math.max(maxNorth - minNorth, maxEast - minEast, 10) * 1.12;
    return {
      minNorth: centerNorth - span / 2,
      maxNorth: centerNorth + span / 2,
      minEast: centerEast - span / 2,
      maxEast: centerEast + span / 2,
    };
  }

  function precomputeErrors(rows) {
    ESTIMATORS.forEach((method) => {
      const pos = new Float64Array(rows.length);
      const yaw = new Float64Array(rows.length);
      let sumSq = 0;
      let sum = 0;
      let max = 0;
      let yawSq = 0;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const p = planarError(row, method);
        const y = yawAbsError(row, method);
        pos[index] = p;
        yaw[index] = y;
        sumSq += p * p;
        sum += p;
        if (p > max) max = p;
        yawSq += y * y;
      }
      errorPos[method.key] = pos;
      errorYaw[method.key] = yaw;
      stats[method.key] = {
        rmse: Math.sqrt(sumSq / rows.length),
        mean: sum / rows.length,
        max,
        yawRmse: Math.sqrt(yawSq / rows.length),
      };
    });
  }

  function isInside(bounds, north, east) {
    return north >= bounds.minNorth && north <= bounds.maxNorth &&
      east >= bounds.minEast && east <= bounds.maxEast;
  }

  function toCanvas(north, east, canvas, bounds, pad) {
    const width = canvas.width - pad * 2;
    const height = canvas.height - pad * 2;
    const x = pad + ((east - bounds.minEast) / (bounds.maxEast - bounds.minEast)) * width;
    const y = canvas.height - pad -
      ((north - bounds.minNorth) / (bounds.maxNorth - bounds.minNorth)) * height;
    return [x, y];
  }

  function drawGrid(context, canvas) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#07121a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = colors.grid;
    context.lineWidth = 1;
    for (let index = 1; index < 8; index += 1) {
      const x = (canvas.width / 8) * index;
      const y = (canvas.height / 8) * index;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }
    context.fillStyle = colors.text;
    context.font = "700 16px Segoe UI, Arial";
    context.fillText("N", 18, 24);
    context.fillText("E", canvas.width - 26, canvas.height - 14);
    context.strokeStyle = colors.axis;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(22, 46);
    context.lineTo(22, 28);
    context.lineTo(16, 36);
    context.moveTo(22, 28);
    context.lineTo(28, 36);
    context.stroke();
    context.beginPath();
    context.moveTo(canvas.width - 50, canvas.height - 18);
    context.lineTo(canvas.width - 28, canvas.height - 18);
    context.lineTo(canvas.width - 36, canvas.height - 24);
    context.moveTo(canvas.width - 28, canvas.height - 18);
    context.lineTo(canvas.width - 36, canvas.height - 12);
    context.stroke();
  }

  function drawScaleBar(context, canvas, bounds) {
    const metres = bounds.maxEast - bounds.minEast >= 80 ? 50 : 20;
    const span = bounds.maxEast - bounds.minEast;
    const px = (metres / span) * (canvas.width - 84);
    const x = canvas.width - 24 - px;
    const y = canvas.height - 16;
    context.strokeStyle = "rgba(242, 248, 251, 0.8)";
    context.fillStyle = "rgba(242, 248, 251, 0.86)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + px, y);
    context.moveTo(x, y - 4);
    context.lineTo(x, y + 4);
    context.moveTo(x + px, y - 4);
    context.lineTo(x + px, y + 4);
    context.stroke();
    context.font = "650 12px Segoe UI, Arial";
    context.fillText(`${metres} m`, x + px / 2 - 14, y - 8);
  }

  function drawPoints(context, canvas, method, endIndex, fill, radius, bounds, pad) {
    context.fillStyle = fill;
    context.beginPath();
    for (let index = 0; index < endIndex; index += 1) {
      const row = clip[index];
      if (!isInside(bounds, row[method.north], row[method.east])) continue;
      const [x, y] = toCanvas(row[method.north], row[method.east], canvas, bounds, pad);
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fill();
  }

  function drawOutOfRange(context, canvas, method, row, bounds, pad) {
    const [rawX, rawY] = toCanvas(row[method.north], row[method.east], canvas, bounds, pad);
    const edge = 28;
    const x = Math.max(edge, Math.min(canvas.width - edge, rawX));
    const y = Math.max(edge, Math.min(canvas.height - edge, rawY));
    const angle = Math.atan2(rawY - canvas.height / 2, rawX - canvas.width / 2);
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = method.color;
    context.beginPath();
    context.moveTo(15, 0);
    context.lineTo(-10, -10);
    context.lineTo(-10, 10);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawVehicleIcon(context, x, y, yawDeg, color, scale = 1) {
    const yaw = (yawDeg * Math.PI) / 180;
    const width = 24 * scale;
    const length = 42 * scale;
    const corner = 5 * scale;
    context.save();
    context.translate(x, y);
    context.rotate(yaw);
    context.shadowColor = "rgba(0, 0, 0, 0.75)";
    context.shadowBlur = 7 * scale;
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(-width / 2, -length / 2, width, length, corner);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "rgba(7, 18, 26, 0.88)";
    context.beginPath();
    context.roundRect(-width * 0.34, -length * 0.24, width * 0.68, length * 0.46, 3 * scale);
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.5)";
    context.lineWidth = 1.2 * scale;
    context.beginPath();
    context.moveTo(-width * 0.31, -length * 0.07);
    context.lineTo(width * 0.31, -length * 0.07);
    context.stroke();
    context.fillStyle = "#020507";
    const wheelWidth = 4 * scale;
    const wheelHeight = 10 * scale;
    const wheelX = width / 2 + wheelWidth * 0.15;
    const wheelY = length * 0.22;
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        context.fillRect(
          side * wheelX - wheelWidth / 2,
          axle * wheelY - wheelHeight / 2,
          wheelWidth,
          wheelHeight,
        );
      }
    }
    context.fillStyle = "#fff2a8";
    for (const side of [-1, 1]) {
      context.beginPath();
      context.arc(side * width * 0.29, -length * 0.43, 2.2 * scale, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = "rgba(255, 255, 255, 0.88)";
    context.lineWidth = 1.4 * scale;
    context.beginPath();
    context.roundRect(-width / 2, -length / 2, width, length, corner);
    context.stroke();
    context.restore();
  }

  function drawPose(view, method, row, index, options = {}) {
    if (!view.canvas || !view.context) return;
    const pad = options.pad || 42;
    const vehicleScale = options.vehicleScale || 1;
    drawGrid(view.context, view.canvas);
    drawPoints(view.context, view.canvas, methodByKey.gt, clip.length, colors.route, 1.3, localBounds, pad);
    drawPoints(view.context, view.canvas, method, index + 1, method.color, 2.2, localBounds, pad);
    if (options.showGT && method.key !== "gt") {
      const gt = methodByKey.gt;
      if (isInside(localBounds, row[gt.north], row[gt.east])) {
        const [gx, gy] = toCanvas(row[gt.north], row[gt.east], view.canvas, localBounds, pad);
        drawVehicleIcon(view.context, gx, gy, row[gt.yaw], gt.color, vehicleScale * 0.92);
      }
    }
    if (!isInside(localBounds, row[method.north], row[method.east])) {
      drawOutOfRange(view.context, view.canvas, method, row, localBounds, pad);
    } else {
      const [x, y] = toCanvas(row[method.north], row[method.east], view.canvas, localBounds, pad);
      drawVehicleIcon(view.context, x, y, row[method.yaw], method.color, vehicleScale);
    }
    if (options.scaleBar) drawScaleBar(view.context, view.canvas, localBounds);
  }

  function drawGlobalMap(view, methods, row, endIndex) {
    const canvas = view.globalCanvas;
    const context = view.globalContext;
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#07121a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const stride = Math.max(1, Math.floor(clip.length / 1200));
    const drawTrack = (method, alpha) => {
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = method.color;
      context.beginPath();
      for (let index = 0; index <= endIndex; index += stride) {
        const routeRow = clip[index];
        const [x, y] = toCanvas(routeRow[method.north], routeRow[method.east], canvas, globalBounds, 15);
        context.moveTo(x + 1.25, y);
        context.arc(x, y, 1.25, 0, Math.PI * 2);
      }
      context.fill();
      context.restore();
    };
    drawTrack(methodByKey.gt, 0.42);
    methods.forEach((method) => {
      if (method.key !== "gt") drawTrack(method, 0.76);
    });
    const drawCurrentMarker = (method, radius) => {
      const [rawX, rawY] = toCanvas(row[method.north], row[method.east], canvas, globalBounds, 15);
      const x = Math.max(8, Math.min(canvas.width - 8, rawX));
      const y = Math.max(8, Math.min(canvas.height - 8, rawY));
      context.fillStyle = method.color;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    };
    drawCurrentMarker(methodByKey.gt, 4.5);
    methods.forEach((method) => {
      if (method.key !== "gt") drawCurrentMarker(method, 4);
    });
    context.fillStyle = colors.text;
    context.font = "700 13px Segoe UI, Arial";
    context.fillText("N ↑", canvas.width - 34, 16);
  }

  function drawOverlay(row, index) {
    const view = overlayView;
    if (!view.canvas || !view.context) return;
    const pad = 48;
    drawGrid(view.context, view.canvas);
    drawPoints(view.context, view.canvas, methodByKey.gt, clip.length, colors.route, 1.2, localBounds, pad);
    drawPoints(view.context, view.canvas, methodByKey.gt, index + 1, colors.gt, 2.0, localBounds, pad);
    ESTIMATORS.forEach((method) => {
      if (!visible.has(method.key)) return;
      drawPoints(view.context, view.canvas, method, index + 1, method.color, 2.0, localBounds, pad);
    });
    const gt = methodByKey.gt;
    if (isInside(localBounds, row[gt.north], row[gt.east])) {
      const [gx, gy] = toCanvas(row[gt.north], row[gt.east], view.canvas, localBounds, pad);
      drawVehicleIcon(view.context, gx, gy, row[gt.yaw], gt.color, 1.05);
    }
    ESTIMATORS.forEach((method) => {
      if (!visible.has(method.key)) return;
      if (!isInside(localBounds, row[method.north], row[method.east])) {
        drawOutOfRange(view.context, view.canvas, method, row, localBounds, pad);
        return;
      }
      const [x, y] = toCanvas(row[method.north], row[method.east], view.canvas, localBounds, pad);
      drawVehicleIcon(view.context, x, y, row[method.yaw], method.color, 0.82);
    });
    drawScaleBar(view.context, view.canvas, localBounds);
    const overlayMethods = ESTIMATORS.filter((method) => visible.has(method.key));
    drawGlobalMap(overlayView, overlayMethods, row, index);
  }

  function percentile(values, p) {
    const copy = Array.from(values).sort((a, b) => a - b);
    if (copy.length === 0) return 1;
    const index = Math.min(copy.length - 1, Math.floor((copy.length - 1) * p));
    return Math.max(copy[index], 1e-3);
  }

  function chartHitFrame(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const padL = 48;
    const padR = 16;
    const inner = Math.max(1, rect.width - padL - padR);
    const t = (x - padL) / inner;
    return Math.max(0, Math.min(clip.length - 1, Math.round(t * (clip.length - 1))));
  }

  function drawLineChart(canvas, series, yLabel, hoverIndex) {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const pad = { l: 52, r: 18, t: 18, b: 28 };
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#07121a";
    context.fillRect(0, 0, width, height);
    const active = series.filter((item) => visible.has(item.key) || item.force);
    let yMax = 1;
    active.forEach((item) => {
      yMax = Math.max(yMax, percentile(item.values, 0.97) * 1.15);
    });
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const xAt = (index) => pad.l + (index / Math.max(1, clip.length - 1)) * innerW;
    const yAt = (value) => pad.t + innerH - (Math.min(value, yMax) / yMax) * innerH;
    context.strokeStyle = colors.grid;
    context.fillStyle = colors.text;
    context.font = "650 12px Segoe UI, Arial";
    context.lineWidth = 1;
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = (yMax / 4) * tick;
      const y = yAt(value);
      context.beginPath();
      context.moveTo(pad.l, y);
      context.lineTo(width - pad.r, y);
      context.stroke();
      context.fillText(formatCompact(value, 1), 8, y + 4);
    }
    context.fillText(yLabel, 8, 14);
    const stride = Math.max(1, Math.floor(clip.length / 900));
    active.forEach((item) => {
      context.beginPath();
      context.strokeStyle = item.color;
      context.lineWidth = 1.7;
      context.globalAlpha = 0.92;
      let started = false;
      for (let index = 0; index < clip.length; index += stride) {
        const x = xAt(index);
        const y = yAt(item.values[index]);
        if (!started) {
          context.moveTo(x, y);
          started = true;
        } else {
          context.lineTo(x, y);
        }
      }
      context.stroke();
      context.globalAlpha = 1;
    });
    const playX = xAt(currentIndex);
    context.strokeStyle = "rgba(242, 248, 251, 0.55)";
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(playX, pad.t);
    context.lineTo(playX, height - pad.b);
    context.stroke();
    context.setLineDash([]);
    if (hoverIndex != null) {
      const hx = xAt(hoverIndex);
      context.strokeStyle = "rgba(81, 216, 238, 0.85)";
      context.beginPath();
      context.moveTo(hx, pad.t);
      context.lineTo(hx, height - pad.b);
      context.stroke();
    }
    context.fillStyle = colors.text;
    context.fillText("0", pad.l, height - 8);
    context.fillText(String(clip.length), width - 48, height - 8);
  }

  function drawBarChart(index) {
    if (!barChart) return;
    const context = barChart.getContext("2d");
    const width = barChart.width;
    const height = barChart.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#07121a";
    context.fillRect(0, 0, width, height);
    const rows = ESTIMATORS.map((method) => ({
      method,
      value: errorPos[method.key][index],
    })).sort((a, b) => a.value - b.value);
    const max = Math.max(rows[rows.length - 1].value, 1);
    const pad = { l: 168, r: 64, t: 16, b: 16 };
    const innerH = height - pad.t - pad.b;
    const gap = 8;
    const barH = (innerH - gap * (rows.length - 1)) / rows.length;
    rows.forEach((item, order) => {
      const y = pad.t + order * (barH + gap);
      const w = ((width - pad.l - pad.r) * item.value) / max;
      context.fillStyle = item.method.color;
      context.globalAlpha = 0.85;
      context.fillRect(pad.l, y, Math.max(2, w), barH);
      context.globalAlpha = 1;
      context.fillStyle = colors.text;
      context.font = "650 13px Segoe UI, Arial";
      context.fillText(item.method.label, 12, y + barH * 0.7);
      context.font = "700 13px ui-monospace, Consolas, monospace";
      context.fillText(`${formatCompact(item.value)} m`, pad.l + w + 8, y + barH * 0.7);
    });
  }

  function tooltipHTML(index, kind) {
    const frame = clip[index];
    const lines = [`Frame ${frame[F.frameIndex]}`];
    ESTIMATORS.forEach((method) => {
      const value = kind === "pos" ? errorPos[method.key][index] : errorYaw[method.key][index];
      const unit = kind === "pos" ? "m" : "°";
      lines.push(`${method.label}: ${formatCompact(value)} ${unit}`);
    });
    return lines.join("<br>");
  }

  function bindChart(canvas, tip, kind) {
    if (!canvas) return;
    canvas.addEventListener("mousemove", (event) => {
      if (!clip.length) return;
      hoverFrame = chartHitFrame(canvas, event);
      const rect = canvas.getBoundingClientRect();
      tip.hidden = false;
      tip.innerHTML = tooltipHTML(hoverFrame, kind);
      tip.style.left = `${Math.min(event.clientX - rect.left + 12, rect.width - 180)}px`;
      tip.style.top = `${Math.max(8, event.clientY - rect.top - 12)}px`;
      if (currentLayout() === "analysis") renderAnalysis(currentIndex);
    });
    canvas.addEventListener("mouseleave", () => {
      hoverFrame = null;
      tip.hidden = true;
      if (currentLayout() === "analysis") renderAnalysis(currentIndex);
    });
    canvas.addEventListener("click", (event) => {
      if (!clip.length) return;
      seek(chartHitFrame(canvas, event));
    });
  }

  function rankedEstimators() {
    return ESTIMATORS.slice().sort((a, b) => stats[a.key].rmse - stats[b.key].rmse);
  }

  function renderStatsTable(index) {
    const body = document.getElementById("stats-body");
    if (!body) return;
    const rows = rankedEstimators();
    body.innerHTML = rows.map((method, order) => {
      const s = stats[method.key];
      const current = errorPos[method.key][index];
      return `<tr class="${order === 0 ? "row-best" : ""}">
        <td>${method.label}</td>
        <td class="mono">${formatCompact(s.rmse)} m</td>
        <td class="mono">${formatCompact(s.mean)} m</td>
        <td class="mono">${formatCompact(s.max)} m</td>
        <td class="mono">${formatCompact(s.yawRmse)}°</td>
        <td class="mono">${formatCompact(current)} m</td>
      </tr>`;
    }).join("");
  }

  function renderOverlayLegend(index) {
    const root = document.getElementById("overlay-legend");
    if (!root) return;
    if (root.dataset.ready === "1") {
      ESTIMATORS.forEach((method) => {
        const err = root.querySelector(`[data-err="${method.key}"]`);
        if (err) err.textContent = `${formatCompact(errorPos[method.key][index])} m`;
        const item = root.querySelector(`[data-toggle="${method.key}"]`);
        if (item) item.classList.toggle("off", !visible.has(method.key));
      });
      return;
    }
    root.innerHTML = ESTIMATORS.map((method) => `
      <button type="button" class="legend-item" data-toggle="${method.key}" style="--method:${method.color}">
        <span class="dot"></span>
        <span class="name">${method.label}</span>
        <span class="err" data-err="${method.key}">${formatCompact(errorPos[method.key][index])} m</span>
      </button>
    `).join("");
    root.dataset.ready = "1";
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-toggle]");
      if (!button) return;
      const key = button.dataset.toggle;
      if (event.shiftKey) {
        visible.clear();
        visible.add(key);
      } else if (visible.has(key)) {
        if (visible.size > 1) visible.delete(key);
      } else {
        visible.add(key);
      }
      render(currentIndex);
    });
  }

  function renderFocusTabs() {
    const root = document.getElementById("focus-tabs");
    if (!root) return;
    if (root.dataset.ready === "1") {
      root.querySelectorAll(".focus-tab").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.focus === focusKey);
      });
      return;
    }
    root.innerHTML = ESTIMATORS.map((method) => `
      <button type="button" class="focus-tab${method.key === focusKey ? " is-active" : ""}" data-focus="${method.key}">
        ${method.label}
      </button>
    `).join("");
    root.dataset.ready = "1";
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-focus]");
      if (!button) return;
      focusKey = button.dataset.focus;
      render(currentIndex);
    });
  }

  function renderCompare(row, index) {
    METHODS.forEach((method) => {
      drawPose(compareViews[method.key], method, row, index);
      const others = method.key === "gt" ? [] : [method];
      drawGlobalMap(compareViews[method.key], others, row, index);
    });
  }

  function renderAnalysis(index) {
    const posSeries = ESTIMATORS.map((method) => ({
      key: method.key,
      color: method.color,
      values: errorPos[method.key],
      force: true,
    }));
    const yawSeries = ESTIMATORS.map((method) => ({
      key: method.key,
      color: method.color,
      values: errorYaw[method.key],
      force: true,
    }));
    drawLineChart(posChart, posSeries, "m", hoverFrame);
    drawLineChart(yawChart, yawSeries, "deg", hoverFrame);
    drawBarChart(index);
    renderStatsTable(index);
  }

  function renderFocus(row, index) {
    renderFocusTabs();
    const method = methodByKey[focusKey];
    setBound("focus-title", `${method.label} vs Ground Truth`);
    setBound("focus-method-name", method.label);
    setBound("focus-north", formatMetres(row[method.north]));
    setBound("focus-east", formatMetres(row[method.east]));
    setBound("focus-down", formatMetres(row[method.down]));
    setBound("focus-yaw", formatDegrees(row[method.yaw]));
    setBound("focus-err-pos", formatMetres(errorPos[method.key][index]));
    setBound("focus-err-yaw", formatDegrees(errorYaw[method.key][index]));
    setBound("focus-rmse", formatMetres(stats[method.key].rmse));
    setBound("focus-max", formatMetres(stats[method.key].max));
    document.querySelectorAll(".kv-row strong:last-child, .gauge strong").forEach((node) => {
      node.style.color = method.color;
    });
    drawPose(focusView, method, row, index, { showGT: true, scaleBar: true, vehicleScale: 1.08, pad: 48 });
    drawGlobalMap(focusView, [method], row, index);
    drawLineChart(focusChart, [{
      key: method.key,
      color: method.color,
      values: errorPos[method.key],
      force: true,
    }], "m", null);
  }

  function updateValues(row, index) {
    METHODS.forEach((method) => {
      setBound(`${method.key}-north`, formatMetres(row[method.north]));
      setBound(`${method.key}-east`, formatMetres(row[method.east]));
      setBound(`${method.key}-down`, formatMetres(row[method.down]));
      setBound(`${method.key}-yaw`, formatDegrees(row[method.yaw]));
    });
    ESTIMATORS.forEach((method) => {
      const pos = errorPos[method.key][index];
      const yaw = errorYaw[method.key][index];
      setChip(`${method.key}-err`, `${formatCompact(pos)} m · ${formatCompact(yaw, 1)}°`, errorLevel(pos));
    });
    const voBadgeState = Boolean(row[F.voPrimaryModelAccepted]) ? "MODEL" : "VO";
    document.querySelectorAll("[data-bind='vo-primary-state']").forEach((node) => {
      node.textContent = voBadgeState;
      node.classList.toggle("model", voBadgeState === "MODEL");
    });
  }

  function updateImages(row) {
    const radarSrc = radarImageCache.has(row[F.timestamp])
      ? radarImageCache.get(row[F.timestamp]).src
      : radarImageUrl(row[F.timestamp]);
    const stereoSrc = stereoImageCache.has(row[F.stereoTimestamp])
      ? stereoImageCache.get(row[F.stereoTimestamp]).src
      : stereoImageUrl(row[F.stereoTimestamp]);
    document.querySelectorAll(".js-radar").forEach((img) => {
      const stamp = String(row[F.timestamp]);
      if (img.dataset.ts !== stamp) {
        img.dataset.ts = stamp;
        img.src = radarSrc;
      }
    });
    document.querySelectorAll(".js-stereo").forEach((img) => {
      const stamp = String(row[F.stereoTimestamp]);
      if (img.dataset.ts !== stamp) {
        img.dataset.ts = stamp;
        img.src = stereoSrc;
      }
    });
  }

  function render(index) {
    if (!clip.length) return;
    const row = clip[index];
    localBounds = computeLocalBounds(cameraCenters[index]);
    updateImages(row);
    setBound("frame-label", `Frame ${row[F.frameIndex]}`);
    setBound("timestamp-label", `t ${row[F.timestamp]}`);
    updateValues(row, index);
    slider.value = String(index);
    const layout = currentLayout();
    if (layout === "compare") renderCompare(row, index);
    else if (layout === "overlay") {
      renderOverlayLegend(index);
      drawOverlay(row, index);
    } else if (layout === "analysis") renderAnalysis(index);
    else if (layout === "focus") renderFocus(row, index);
    status.textContent = paused ? "Paused" : `${index + 1} / ${clip.length}`;
    playBtn.textContent = paused ? "播放" : "暂停";
    warmImageCache(index);
  }

  function seek(index) {
    currentIndex = Math.max(0, Math.min(clip.length - 1, index));
    lastStep = performance.now();
    render(currentIndex);
  }

  function loadCachedImage(cache, key, url, label) {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        cache.set(key, image);
        while (cache.size > MAX_CACHED_IMAGES) {
          cache.delete(cache.keys().next().value);
        }
        resolve(image);
      };
      image.onerror = () => reject(new Error(`Missing ${label} image: ${url}`));
      image.src = url;
    });
  }

  function loadRadarImage(row) {
    return loadCachedImage(radarImageCache, row[F.timestamp], radarImageUrl(row[F.timestamp]), "radar");
  }

  function loadStereoImage(row) {
    return loadCachedImage(
      stereoImageCache,
      row[F.stereoTimestamp],
      stereoImageUrl(row[F.stereoTimestamp]),
      "stereo",
    );
  }

  function warmImageCache(index) {
    for (let offset = 0; offset < Math.min(PRELOAD_AHEAD, clip.length); offset += 1) {
      const row = clip[(index + offset) % clip.length];
      loadRadarImage(row).catch((error) => fail(error.message));
      loadStereoImage(row).catch((error) => fail(error.message));
    }
  }

  async function preloadInitialImages() {
    const initial = clip.slice(0, Math.min(PRELOAD_AHEAD, clip.length));
    let loaded = 0;
    for (const row of initial) {
      await Promise.all([loadRadarImage(row), loadStereoImage(row)]);
      loaded += 1;
      const message = `Loading sensor frames ${loaded} / ${initial.length}`;
      status.textContent = message;
      if (bootText) bootText.textContent = message;
    }
  }

  function setLayout(name) {
    if (!LAYOUTS.includes(name)) return;
    document.body.dataset.layout = name;
    document.querySelectorAll(".layout-btn").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.layout === name);
    });
    window.location.hash = name;
    render(currentIndex);
  }

  function setSpeed(next) {
    speed = next;
    document.querySelectorAll(".speed-btn").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.speed) === speed);
    });
  }

  function nudgeSpeed(direction) {
    const index = SPEEDS.indexOf(speed);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + direction))];
    setSpeed(next);
  }

  function togglePaused() {
    paused = !paused;
    render(currentIndex);
  }

  function bindUI() {
    document.querySelectorAll(".layout-btn").forEach((button) => {
      button.addEventListener("click", () => setLayout(button.dataset.layout));
    });
    document.querySelectorAll(".speed-btn").forEach((button) => {
      button.addEventListener("click", () => setSpeed(Number(button.dataset.speed)));
    });
    playBtn.addEventListener("click", togglePaused);
    document.getElementById("btn-restart").addEventListener("click", () => seek(0));
    document.getElementById("btn-prev").addEventListener("click", () => {
      paused = true;
      seek(currentIndex - 1);
    });
    document.getElementById("btn-next").addEventListener("click", () => {
      paused = true;
      seek(currentIndex + 1);
    });
    slider.addEventListener("input", () => {
      paused = true;
      seek(Number(slider.value));
    });
    document.querySelectorAll("[data-focus]").forEach((card) => {
      if (card.closest("#focus-tabs")) return;
      card.addEventListener("click", () => {
        focusKey = card.dataset.focus;
        setLayout("focus");
      });
    });
    bindChart(posChart, posTip, "pos");
    bindChart(yawChart, yawTip, "yaw");
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        togglePaused();
      } else if (event.key.toLowerCase() === "r") {
        seek(0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        paused = true;
        seek(currentIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        paused = true;
        seek(currentIndex - 1);
      } else if (event.key === "]") {
        nudgeSpeed(1);
      } else if (event.key === "[") {
        nudgeSpeed(-1);
      } else if (["1", "2", "3", "4"].includes(event.key)) {
        setLayout(LAYOUTS[Number(event.key) - 1]);
      }
    });
  }

  function animate(timestamp) {
    const interval = Number(config.intervalMs || 10) / speed;
    if (!paused && timestamp - lastStep >= interval) {
      currentIndex = (currentIndex + 1) % clip.length;
      render(currentIndex);
      lastStep = timestamp;
    }
    window.requestAnimationFrame(animate);
  }

  async function start() {
    if (!config) throw new Error("DEMO_CONFIG is missing");
    await loadPoseScript(config.poseDataScript);
    const data = window.RADAR_POSE_METHOD_DATA;
    if (!data || !Array.isArray(data.frames)) {
      throw new Error("RADAR_POSE_METHOD_DATA is missing or invalid");
    }
    metadata = data.metadata;
    const startIndex = Number(config.startFrame);
    if (!Number.isInteger(startIndex) || startIndex < 0) {
      throw new Error(`Invalid startFrame: ${config.startFrame}`);
    }
    const requestedFrameCount = Number(config.frameCount);
    const availableFrameCount = data.frames.length - startIndex;
    const frameCount = requestedFrameCount > 0 ? requestedFrameCount : availableFrameCount;
    clip = data.frames.slice(startIndex, startIndex + frameCount);
    if (clip.length !== frameCount || clip.length === 0) {
      throw new Error(`Requested ${frameCount} frames but loaded ${clip.length}`);
    }
    if (clip.some((row) => !Array.isArray(row) || row.length < 32)) {
      throw new Error("Pose data has an unexpected row format");
    }
    cameraCenters = computeCameraCenters(clip);
    globalBounds = computeGlobalBounds(clip);
    precomputeErrors(clip);
    slider.max = String(clip.length - 1);
    setBound("sequence", metadata && metadata.sequence ? metadata.sequence : "Oxford Radar");
    setBound("span-label", `Local ${Number(config.mapSpanMetres || 100)} m`);
    bindUI();
    await preloadInitialImages();
    const hash = window.location.hash.replace("#", "");
    if (LAYOUTS.includes(hash)) setLayout(hash);
    currentIndex = 0;
    render(currentIndex);
    if (boot) boot.classList.add("is-off");
    lastStep = performance.now();
    window.requestAnimationFrame(animate);
  }

  start().catch((error) => fail(error.message));
})();
