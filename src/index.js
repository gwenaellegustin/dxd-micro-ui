function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function painLevel(color) {
  return ((color >> 16) & 0xff) - ((color >> 8) & 0xff);
}

function drawPoint(ctx, color) {
  const [r, g, b] = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
  const grad = ctx.createRadialGradient(20, 20, 0, 20, 20, 18);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.7)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 40, 40);
}

function drawPulse(ctx, color) {
  const [r, g, b] = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
  [7, 13, 19].forEach((radius, i) => {
    ctx.beginPath();
    ctx.arc(20, 20, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${1 - i * 0.25})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawAcute(ctx, color) {
  const [r, g, b] = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
  const count = 7;
  ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.save();
    ctx.translate(20, 20);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(9, 0, 7, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

const draws = { point: drawPoint, pulse: drawPulse, acute: drawAcute };

const sessions = JSON.parse(localStorage.getItem("paint-sessions") || "[]");
const list = document.getElementById("sessions-list");

sessions
  .slice()
  .reverse()
  .forEach((session) => {
    const card = document.createElement("div");
    card.className = "session-card";

    const dateEl = document.createElement("h2");
    dateEl.className = "session-date";
    dateEl.textContent = formatDate(session.timestamp);
    card.appendChild(dateEl);

    const toolsEl = document.createElement("div");
    toolsEl.className = "session-tools";

    ["point", "pulse", "acute"].forEach((tool) => {
      const toolDecals = session.decals.filter((d) => d.tool === tool);
      if (toolDecals.length === 0) return;

      const best = toolDecals.reduce((max, d) =>
        painLevel(d.color) > painLevel(max.color) ? d : max,
      );

      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      draws[tool](canvas.getContext("2d"), best.color);
      toolsEl.appendChild(canvas);
    });

    card.appendChild(toolsEl);
    list.appendChild(card);
  });
