const gradient = [
  { stop: 0.0, color: "#359800" },
  { stop: 0.02, color: "#7c9800" },
  { stop: 0.1, color: "#beb80d" },
  { stop: 0.35, color: "#ffbb0c" },
  { stop: 0.7, color: "#cc620e" },
  { stop: 0.95, color: "#e13e0d" },
  { stop: 1.0, color: "#ff0000" },
];

export function getColorFromRangeValue(value, max = 100) {
  const t = max > 0 ? Number(value) / Number(max) : 0;
  const rgb = getGradientColor(t);
  return rgbToHex(rgb);
}

function rgbToHex({ r, g, b }) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function componentToHex(value) {
  const hex = value.toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
}

function getGradientColor(tValue) {
  for (let i = 0; i < gradient.length - 1; i++) {
    const a = gradient[i];
    const b = gradient[i + 1];
    if (tValue >= a.stop && tValue <= b.stop) {
      const range = b.stop - a.stop;
      const alpha = range > 0 ? (tValue - a.stop) / range : 0;
      const rgbA = hexToRgb(a.color);
      const rgbB = hexToRgb(b.color);
      return {
        r: Math.round(lerp(rgbA.r, rgbB.r, alpha)),
        g: Math.round(lerp(rgbA.g, rgbB.g, alpha)),
        b: Math.round(lerp(rgbA.b, rgbB.b, alpha)),
      };
    }
  }
  return hexToRgb(gradient[gradient.length - 1].color);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}
