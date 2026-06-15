import { getTFromColor } from "./color.js";
import { navigate } from "./nav.js";

const canvas = document.getElementById("evolution-canvas");
const ctx = canvas.getContext("2d");

let drawnPoints = null;
let isDrawing = false;
let selectedPreset = "linear";
let startValue = "now";
let endValue = "still";
let startCustomTime = null;
let endCustomTime = null;
let _pendingEvolutionRestored = false;

// Y position (0=top=max pain, 1=bottom=no pain) for each preset as a function of t (0..1)
const _session = JSON.parse(
  sessionStorage.getItem("pending-session") || "null",
);
const maxPainT = _session?.decals?.length
  ? Math.max(..._session.decals.map((d) => getTFromColor(d.color)))
  : 1;

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
  const saved = _session?.evolution;
  if (
    !_pendingEvolutionRestored &&
    saved?.type === "custom" &&
    saved.curve?.length
  ) {
    drawnPoints = saved.curve.map((p) => ({
      x: p.t * canvas.width,
      y: p.y * canvas.height,
    }));
    _pendingEvolutionRestored = true;
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

function drawAxes() {
  const w = canvas.width,
    h = canvas.height;
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.5;

  // Y axis (left side)
  ctx.beginPath();
  ctx.moveTo(12, h - 12);
  ctx.lineTo(12, 8);
  ctx.moveTo(8, 14);
  ctx.lineTo(12, 8);
  ctx.lineTo(16, 14);
  ctx.stroke();

  // X axis (bottom)
  ctx.beginPath();
  ctx.moveTo(12, h - 12);
  ctx.lineTo(w - 8, h - 12);
  ctx.moveTo(w - 14, h - 16);
  ctx.lineTo(w - 8, h - 12);
  ctx.lineTo(w - 14, h - 8);
  ctx.stroke();
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
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function render() {
  drawBackground();
  // drawAxes();
  drawCurve(drawnPoints ?? getPresetPoints());
  drawMaxPainMarker();
}

// Drawing interaction
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (e) => {
  isDrawing = true;
  drawnPoints = [canvasPoint(e)];
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
    selectedPreset = radio.value;
    drawnPoints = null;
    render();
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

// Open native time picker on label click
document.querySelectorAll(".radio-btn-custom").forEach((label) => {
  label.addEventListener("click", () => {
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
});

// Validate
document.getElementById("previous-btn").addEventListener("click", () => navigate("app.html"));

document.getElementById("validate-btn").addEventListener("click", () => {
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
      if (value === "1h") return { value: "custom", custom: toHHMM(oneHourAgo) };
      return { value, custom: customTime };
    };
    pending.evolution = {
      type: drawnPoints ? "custom" : selectedPreset,
      curve: normalized,
      start: resolveTime(startValue, startCustomTime),
      end: resolveTime(endValue, endCustomTime),
    };
    const sessions = JSON.parse(localStorage.getItem("paint-sessions") || "[]");
    const idx = sessions.findIndex((s) => s.timestamp === pending.timestamp);
    if (idx !== -1) {
      sessions[idx] = pending;
    } else {
      sessions.push(pending);
    }
    localStorage.setItem("paint-sessions", JSON.stringify(sessions));
    sessionStorage.removeItem("pending-session");
  }
  navigate("index.html");
});

// Restore evolution state when reopening a saved session
const _savedEvolution = _session?.evolution;
if (_savedEvolution) {
  startValue = _savedEvolution.start.value;
  startCustomTime = _savedEvolution.start.custom ?? null;
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

  endValue = _savedEvolution.end.value;
  endCustomTime = _savedEvolution.end.custom ?? null;
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

  if (_savedEvolution.type !== "custom") {
    selectedPreset = _savedEvolution.type;
    const radio = document.querySelector(
      `input[name="evolution"][value="${selectedPreset}"]`,
    );
    if (radio) radio.checked = true;
  }
}

// Init
const ro = new ResizeObserver(resizeCanvas);
ro.observe(canvas);
