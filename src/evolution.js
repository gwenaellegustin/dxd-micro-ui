import { getTFromColor } from "./color.js";
import { navigate } from "./router.js";
import { onMount } from "./router.js";

const canvas = document.getElementById("evolution-canvas");
const ctx = canvas.getContext("2d");

let drawnPoints = null;
let isDrawing = false;
let selectedPreset = "linear";
let startValue = "now";
let endValue = "still";
let startCustomTime = null;
let endCustomTime = null;
let _session = null;
let maxPainT = 1;
let _pendingSavedCurve = null;

// Y position (0=top=max pain, 1=bottom=no pain) for each preset as a function of t (0..1)
const presetFunctions = {
  linear: (t) => 1 - maxPainT * t,
  exp: (t) => 1 - maxPainT * Math.pow(t, 3),
  power: (t) => 1 - maxPainT * (1 - Math.exp(-3 * t)),
  peak: (t) => {
    const s = [
      [0, 1],
      [0.13, 0.96 - maxPainT],
      [0.26, 0.99],
      [0.42, 0.99],
      [0.58, 0.96 - maxPainT],
      [0.74, 0.99],
      [0.87, 0.99],
      [1, 1 - maxPainT],
    ];
    for (let i = 0; i < s.length - 1; i++)
      if (t <= s[i + 1][0])
        return (
          s[i][1] +
          ((t - s[i][0]) / (s[i + 1][0] - s[i][0])) * (s[i + 1][1] - s[i][1])
        );
    return 1 - maxPainT;
  },
  "peak-incr": (t) => {
    const d = 0.6 * maxPainT,
      r = 0.4 * maxPainT;
    const s = [
      [0, 1],
      [0.13, 1 - d],
      [0.26, 1 - d + r],
      [0.42, 1 - d + r],
      [0.58, 1 - 2 * d + r],
      [0.74, 1 - 2 * d + 2 * r],
      [0.87, 1 - 2 * d + 2 * r],
      [1, 1 - maxPainT],
    ];
    for (let i = 0; i < s.length - 1; i++)
      if (t <= s[i + 1][0])
        return (
          s[i][1] +
          ((t - s[i][0]) / (s[i + 1][0] - s[i][0])) * (s[i + 1][1] - s[i][1])
        );
    return 1 - maxPainT;
  },
  var: (t) =>
    1 -
    maxPainT -
    (maxPainT / 2) * Math.sin(5 * Math.PI * t + 11) +
    maxPainT / 2,
  "var-incr": (t) =>
    1 - maxPainT * t - 0.2 * maxPainT * Math.sin(4 * Math.PI * t),
};

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  // Restore saved custom curve once canvas has real dimensions
  if (_pendingSavedCurve && canvas.width > 0) {
    drawnPoints = _pendingSavedCurve.map((p) => ({
      x: p.t * canvas.width,
      y: p.y * canvas.height,
    }));
    _pendingSavedCurve = null;
  }
  render();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#ff0000");
  grad.addColorStop(0.05, "#e13e0d");
  grad.addColorStop(0.3, "#cc620e");
  grad.addColorStop(0.65, "#ffbb0c");
  grad.addColorStop(0.9, "#beb80d");
  grad.addColorStop(0.98, "#7c9800");
  grad.addColorStop(1, "#359800");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCurve(points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function getPresetPoints() {
  const fn = presetFunctions[selectedPreset];
  if (!fn) return [];
  const w = canvas.width,
    h = canvas.height;
  const steps = 80;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: t * w, y: fn(t) * h });
  }
  return points;
}

function drawMaxPainMarker() {
  const y = (1 - maxPainT) * canvas.height;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function render() {
  drawBackground();
  drawCurve(drawnPoints ?? getPresetPoints());
  drawMaxPainMarker();
}

let _animId = null;
let _animFrom = null;
let _animTo = null;
let _animStart = null;
const ANIM_MS = 450;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function resampleToCount(points, n) {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }));
  const result = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const raw = t * (points.length - 1);
    const lo = Math.floor(raw);
    const hi = Math.min(lo + 1, points.length - 1);
    const f = raw - lo;
    result.push({
      x: points[lo].x * (1 - f) + points[hi].x * f,
      y: points[lo].y * (1 - f) + points[hi].y * f,
    });
  }
  return result;
}

function lerpPoints(a, b, t) {
  return a.map((pa, i) => ({
    x: pa.x + (b[i].x - pa.x) * t,
    y: pa.y + (b[i].y - pa.y) * t,
  }));
}

function animateTo(targetPoints, fromPoints) {
  if (_animId) cancelAnimationFrame(_animId);
  const current = fromPoints ?? (drawnPoints ? resampleToCount(drawnPoints, targetPoints.length) : getPresetPoints());
  _animFrom = current.length === targetPoints.length ? current : resampleToCount(current, targetPoints.length);
  _animTo = targetPoints;
  _animStart = null;

  function step(ts) {
    if (!_animStart) _animStart = ts;
    const rawT = Math.min((ts - _animStart) / ANIM_MS, 1);
    const t = easeInOut(rawT);
    drawBackground();
    drawCurve(lerpPoints(_animFrom, _animTo, t));
    drawMaxPainMarker();
    if (rawT < 1) {
      _animId = requestAnimationFrame(step);
    } else {
      _animId = null;
    }
  }
  _animId = requestAnimationFrame(step);
}

// Drawing interaction
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (e) => {
  if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
  isDrawing = true;
  drawnPoints = [canvasPoint(e)];
  _pendingSavedCurve = null;
  document
    .querySelectorAll("input[name='evolution']")
    .forEach((r) => (r.checked = false));
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

canvas.addEventListener("pointermove", (e) => {
  if (!isDrawing) return;
  drawnPoints.push(canvasPoint(e));
  render();
  e.preventDefault();
});

canvas.addEventListener("pointerup", (e) => {
  isDrawing = false;
  e.preventDefault();
});

// Preset radio buttons
document.querySelectorAll("input[name='evolution']").forEach((radio) => {
  radio.addEventListener("change", () => {
    const fromPoints = drawnPoints
      ? resampleToCount(drawnPoints, 81)
      : getPresetPoints();
    selectedPreset = radio.value;
    drawnPoints = null;
    _pendingSavedCurve = null;
    animateTo(getPresetPoints(), fromPoints);
  });
});

// Time radio buttons
document.querySelectorAll("input[name='time-start']").forEach((radio) => {
  radio.addEventListener("change", () => {
    startValue = radio.value;
    if (radio.value !== "custom") {
      const picker = document.querySelector(".time-picker[data-side='start']");
      picker.value = "";
      picker.parentElement.querySelector(".time-picker-display").textContent =
        "";
      startCustomTime = null;
    }
  });
});

document.querySelectorAll("input[name='time-end']").forEach((radio) => {
  radio.addEventListener("change", () => {
    endValue = radio.value;
    if (radio.value !== "custom") {
      const picker = document.querySelector(".time-picker[data-side='end']");
      picker.value = "";
      picker.parentElement.querySelector(".time-picker-display").textContent =
        "";
      endCustomTime = null;
    }
  });
});

// Open native time picker on label click, without pre-checking the radio
document.querySelectorAll(".radio-btn-custom").forEach((label) => {
  label.addEventListener("click", (e) => {
    e.preventDefault();
    try {
      label.querySelector(".time-picker").showPicker();
    } catch (_) {}
  });
});

// Custom time pickers — change sets value and checks radio
document.querySelectorAll(".time-picker").forEach((picker) => {
  picker.addEventListener("change", () => {
    const side = picker.dataset.side;
    const radio = document.querySelector(
      `input[name="time-${side}"][value="custom"]`,
    );
    radio.checked = true;
    picker.parentElement.querySelector(".time-picker-display").textContent =
      picker.value;
    if (side === "start") {
      startValue = "custom";
      startCustomTime = picker.value;
    } else {
      endValue = "custom";
      endCustomTime = picker.value;
    }
  });

  // If picker is dismissed without a value, revert radio to default
  picker.addEventListener("blur", () => {
    const side = picker.dataset.side;
    const customRadio = document.querySelector(
      `input[name="time-${side}"][value="custom"]`,
    );
    if (customRadio?.checked && !picker.value) {
      const defaultValue = side === "start" ? "now" : "still";
      const defaultRadio = document.querySelector(
        `input[name="time-${side}"][value="${defaultValue}"]`,
      );
      if (defaultRadio) {
        defaultRadio.checked = true;
        if (side === "start") startValue = defaultValue;
        else endValue = defaultValue;
      }
    }
  });
});

document.getElementById("previous-btn").addEventListener("click", () => {
  const pending = JSON.parse(sessionStorage.getItem("pending-session") || "null");
  if (pending) {
    const normalized = (drawnPoints ?? getPresetPoints()).map((p) => ({
      t: p.x / canvas.width,
      y: p.y / canvas.height,
    }));
    pending.evolution = {
      type: drawnPoints ? "custom" : selectedPreset,
      curve: normalized,
      start: { value: startValue, custom: startCustomTime },
      end: { value: endValue, custom: endCustomTime },
    };
    sessionStorage.setItem("pending-session", JSON.stringify(pending));
  }
  navigate("app");
});

// Save and navigate home
document
  .getElementById("evolution-validate-btn")
  .addEventListener("click", () => {
    const pending = JSON.parse(
      sessionStorage.getItem("pending-session") || "null",
    );
    if (pending) {
      const normalized = (drawnPoints ?? getPresetPoints()).map((p) => ({
        t: p.x / canvas.width,
        y: p.y / canvas.height,
      }));
      const now = new Date();
      const toHHMM = (d) =>
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const round15 = (d) => {
        const rounded = new Date(d);
        rounded.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
        return rounded;
      };
      const oneHourAgo = round15(new Date(now - 60 * 60 * 1000));
      const resolveTime = (value, customTime) => {
        if (value === "now") return { value: "custom", custom: toHHMM(now) };
        if (value === "1h")
          return { value: "custom", custom: toHHMM(oneHourAgo) };
        return { value, custom: customTime };
      };
      pending.evolution = {
        type: drawnPoints ? "custom" : selectedPreset,
        curve: normalized,
        start: resolveTime(startValue, startCustomTime),
        end: resolveTime(endValue, endCustomTime),
      };
      const sessions = JSON.parse(
        localStorage.getItem("paint-sessions") || "[]",
      );
      const idx = sessions.findIndex((s) => s.timestamp === pending.timestamp);
      if (idx !== -1) {
        sessions[idx] = pending;
      } else {
        sessions.push(pending);
      }
      localStorage.setItem("paint-sessions", JSON.stringify(sessions));
      sessionStorage.removeItem("pending-session");
    }
    navigate("home");
  });

function mountEvolution() {
  _session = JSON.parse(sessionStorage.getItem("pending-session") || "null");
  maxPainT = _session?.decals?.length
    ? Math.max(..._session.decals.map((d) => getTFromColor(d.color)))
    : 1;

  // Reset state
  drawnPoints = null;
  _pendingSavedCurve = null;
  selectedPreset = "linear";
  startValue = "now";
  endValue = "still";
  startCustomTime = null;
  endCustomTime = null;

  // Reset UI: preset radios
  const linearRadio = document.querySelector(
    'input[name="evolution"][value="linear"]',
  );
  if (linearRadio) linearRadio.checked = true;

  // Reset time pickers
  ["start", "end"].forEach((side) => {
    const picker = document.querySelector(`.time-picker[data-side='${side}']`);
    if (picker) {
      picker.value = "";
      picker.parentElement.querySelector(".time-picker-display").textContent =
        "";
    }
  });
  const startDefaultRadio = document.querySelector(
    'input[name="time-start"][value="now"]',
  );
  if (startDefaultRadio) startDefaultRadio.checked = true;
  const endDefaultRadio = document.querySelector(
    'input[name="time-end"][value="still"]',
  );
  if (endDefaultRadio) endDefaultRadio.checked = true;

  // Restore saved evolution state
  const savedEvolution = _session?.evolution;
  if (savedEvolution) {
    startValue = savedEvolution.start.value;
    startCustomTime = savedEvolution.start.custom ?? null;
    const startRadio = document.querySelector(
      `input[name="time-start"][value="${startValue}"]`,
    );
    if (startRadio) startRadio.checked = true;
    if (startValue === "custom" && startCustomTime) {
      const p = document.querySelector(".time-picker[data-side='start']");
      p.value = startCustomTime;
      p.parentElement.querySelector(".time-picker-display").textContent =
        startCustomTime;
    }

    endValue = savedEvolution.end.value;
    endCustomTime = savedEvolution.end.custom ?? null;
    const endRadio = document.querySelector(
      `input[name="time-end"][value="${endValue}"]`,
    );
    if (endRadio) endRadio.checked = true;
    if (endValue === "custom" && endCustomTime) {
      const p = document.querySelector(".time-picker[data-side='end']");
      p.value = endCustomTime;
      p.parentElement.querySelector(".time-picker-display").textContent =
        endCustomTime;
    }

    if (savedEvolution.type !== "custom") {
      selectedPreset = savedEvolution.type;
      const radio = document.querySelector(
        `input[name="evolution"][value="${selectedPreset}"]`,
      );
      if (radio) radio.checked = true;
    } else if (savedEvolution.curve?.length) {
      _pendingSavedCurve = savedEvolution.curve;
    }
  }

  resizeCanvas();
}

onMount("evolution", mountEvolution);

// ResizeObserver set up once
const ro = new ResizeObserver(resizeCanvas);
ro.observe(canvas);
