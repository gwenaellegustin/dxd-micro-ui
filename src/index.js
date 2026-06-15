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
  ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;

  const count = 8,
    len = 17,
    halfW = 2.5;
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.translate(20, 20);
    ctx.rotate((i / count) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(len * 0.4, halfW, len, 0);
    ctx.quadraticCurveTo(len * 0.4, -halfW, 4, 0);
    ctx.closePath();
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

    // Header: date + delete button
    const headerEl = document.createElement("div");
    headerEl.className = "session-header";

    const dateEl = document.createElement("h2");
    dateEl.className = "session-date";
    dateEl.textContent = formatDate(session.timestamp);
    headerEl.appendChild(dateEl);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "session-delete-btn";
    const deleteImg = document.createElement("img");
    deleteImg.src = `${import.meta.env.BASE_URL}icons/close.svg`;
    deleteBtn.appendChild(deleteImg);
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("Delete this crisis?")) {
        const all = JSON.parse(localStorage.getItem("paint-sessions") || "[]");
        localStorage.setItem(
          "paint-sessions",
          JSON.stringify(all.filter((s) => s.timestamp !== session.timestamp)),
        );
        card.remove();
      }
    });
    headerEl.appendChild(deleteBtn);
    card.appendChild(headerEl);

    // Time range
    if (session.evolution) {
      const timesEl = document.createElement("p");
      timesEl.className = "session-times";
      const startStr = session.evolution.start?.custom ?? "";
      const end = session.evolution.end;
      if (end?.value === "still") {
        timesEl.innerHTML = `${startStr} – <b>Still ongoing</b>`;
      } else {
        timesEl.textContent = `${startStr} – ${end?.custom ?? ""}`;
      }
      card.appendChild(timesEl);
    }

    // Tools + curve icon (left-aligned together)
    const toolsEl = document.createElement("div");
    toolsEl.className = "session-tools";

    if (session.evolution) {
      const curveBtn = document.createElement("div");
      curveBtn.className = "session-curve-icon";
      const curveImg = document.createElement("img");
      curveImg.src =
        `${import.meta.env.BASE_URL}icons/${session.evolution.type === "custom" ? "pencil" : session.evolution.type}.svg`;
      curveBtn.appendChild(curveImg);
      toolsEl.appendChild(curveBtn);
    }

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

    card.addEventListener("click", () => {
      const data = structuredClone(session);
      if (data.evolution?.start?.value === "now") {
        const d = new Date(data.timestamp);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        data.evolution.start = { value: "custom", custom: `${hh}:${mm}` };
      }
      sessionStorage.setItem("pending-session", JSON.stringify(data));
      location.href = "app.html";
    });

    list.appendChild(card);
  });
