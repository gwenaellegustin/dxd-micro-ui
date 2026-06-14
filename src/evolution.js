const canvas = document.getElementById("evolution-canvas");
const ctx = canvas.getContext("2d");
const timePicker = document.getElementById("time-picker");

let drawnPoints = null;
let isDrawing = false;
let selectedPreset = "linear";
let startValue = "now";
let endValue = "still";
let customTimeSide = null;
let startCustomTime = null;
let endCustomTime = null;

// Y position (0=top=max pain, 1=bottom=no pain) for each preset as a function of t (0..1)
const presetFunctions = {
  linear: (t) => 0.15 + 0.7 * t,
  exp: (t) => 0.15 + 0.75 * (1 - Math.exp(-3.5 * t)),
  power: (t) => 0.15 + 0.7 * Math.pow(t, 2.2),
  peak: (t) => 0.5 - 0.35 * Math.sin(Math.PI * t),
  "peak-incr": (t) => 0.55 - 0.4 * Math.sin(Math.PI * Math.min(t * 1.5, 1)) + 0.1 * t,
  var: (t) => 0.5 + 0.28 * Math.sin(4.5 * Math.PI * t),
  "var-incr": (t) => 0.25 + 0.35 * t + 0.18 * Math.sin(4 * Math.PI * t),
};

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
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
  const w = canvas.width, h = canvas.height;
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
  const w = canvas.width, h = canvas.height;
  const steps = 80;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: t * w, y: fn(t) * h });
  }
  return points;
}

function render() {
  drawBackground();
  drawAxes();
  drawCurve(drawnPoints ?? getPresetPoints());
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

// Time buttons
document.querySelectorAll(".time-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const side = btn.dataset.side;
    const value = btn.dataset.value;

    if (value === "custom") {
      customTimeSide = side;
      timePicker.value = "";
      timePicker.click();
      return;
    }

    document
      .querySelectorAll(`.time-btn[data-side="${side}"]`)
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");

    if (side === "start") startValue = value;
    else endValue = value;
  });
});

timePicker.addEventListener("change", () => {
  if (!customTimeSide || !timePicker.value) return;
  const side = customTimeSide;

  document
    .querySelectorAll(`.time-btn[data-side="${side}"]`)
    .forEach((b) => b.classList.remove("selected"));
  const iconBtn = document.querySelector(
    `.time-btn-icon[data-side="${side}"]`,
  );
  iconBtn.classList.add("selected");

  if (side === "start") {
    startValue = "custom";
    startCustomTime = timePicker.value;
  } else {
    endValue = "custom";
    endCustomTime = timePicker.value;
  }
  customTimeSide = null;
});

// Validate
document.getElementById("validate-btn").addEventListener("click", () => {
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
    const sessions = JSON.parse(localStorage.getItem("paint-sessions") || "[]");
    sessions.push(pending);
    localStorage.setItem("paint-sessions", JSON.stringify(sessions));
    sessionStorage.removeItem("pending-session");
  }
  location.href = "index.html";
});

// Init
const ro = new ResizeObserver(resizeCanvas);
ro.observe(canvas);
