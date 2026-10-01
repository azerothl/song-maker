/** Fonctions injectées dans le navigateur (capture + tests Playwright). */
export const VISIBILITY_BROWSER_BUNDLE = `
function __parseRgb(color) {
  const m = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function __parseColor(color) {
  if (!color || color === "transparent") return null;
  const rgba = color.match(
    /^rgba?\\(\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)(?:\\s*,\\s*([\\d.]+))?\\s*\\)$/i,
  );
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  const srgb = color.match(
    /^color\\(\\s*srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\s*\\)$/i,
  );
  if (srgb) {
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255,
      a: srgb[4] === undefined ? 1 : Number(srgb[4]),
    };
  }
  const legacy = __parseRgb(color);
  if (legacy) return { r: legacy[0], g: legacy[1], b: legacy[2], a: 1 };
  return null;
}
function __compositeOver(top, bottom) {
  const ta = top.a;
  const ba = bottom.a;
  const outA = ta + ba * (1 - ta);
  if (outA <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (top.r * ta + bottom.r * ba * (1 - ta)) / outA,
    g: (top.g * ta + bottom.g * ba * (1 - ta)) / outA,
    b: (top.b * ta + bottom.b * ba * (1 - ta)) / outA,
    a: outA,
  };
}
function __channelLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function __relativeLuminance(rgb) {
  const r = __channelLinear(rgb[0]);
  const g = __channelLinear(rgb[1]);
  const b = __channelLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function __contrastRatioRgb(fgRgb, bgRgb) {
  const l1 = __relativeLuminance(fgRgb);
  const l2 = __relativeLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
function __contrastRatio(fg, bg) {
  const f = __parseRgb(fg);
  const b = __parseRgb(bg);
  if (!f || !b) return null;
  return __contrastRatioRgb(f, b);
}
function __effectiveBgRgb(el) {
  const canvas = { r: 32, g: 36, b: 58, a: 1 };
  const layers = [];
  let node = el;
  while (node) {
    const parsed = __parseColor(window.getComputedStyle(node).backgroundColor);
    if (parsed && parsed.a > 0) layers.push(parsed);
    node = node.parentElement;
  }
  let composed = canvas;
  for (let i = layers.length - 1; i >= 0; i--) {
    composed = __compositeOver(layers[i], composed);
  }
  return [composed.r, composed.g, composed.b];
}
function __effectiveBg(el) {
  const rgb = __effectiveBgRgb(el);
  return "rgb(" + Math.round(rgb[0]) + ", " + Math.round(rgb[1]) + ", " + Math.round(rgb[2]) + ")";
}
function __contrastOnElement(el) {
  if (!el) return null;
  const fg = window.getComputedStyle(el).color;
  const f = __parseRgb(fg);
  const b = __effectiveBgRgb(el);
  if (!f || !b) return null;
  return __contrastRatioRgb(f, b);
}
function __isClippedByOverflow(el) {
  let node = el;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflow = style.overflow + style.overflowX + style.overflowY;
    if (/hidden|clip|scroll|auto/.test(overflow)) {
      const parent = node.parentElement;
      if (!parent) break;
      const pr = parent.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.bottom > pr.bottom + 0.5 || er.top < pr.top - 0.5 || er.right > pr.right + 0.5 || er.left < pr.left - 0.5) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}
function __measureReachability(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const inViewport = r.width > 0 && r.height > 0 && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= vh + 0.5 && r.right <= vw + 0.5;
  const notClippedByOverflow = !__isClippedByOverflow(el);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const hitTargetMatches = Boolean(hit && (el === hit || el.contains(hit)));
  return {
    inViewport,
    notClippedByOverflow,
    hitTargetMatches,
    reachable: inViewport && notClippedByOverflow && hitTargetMatches,
    rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
  };
}
function __measureHorizontalOverflow(el) {
  if (!el) return { scrollWidth: 0, clientWidth: 0, ok: true };
  return {
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    ok: el.scrollWidth <= el.clientWidth + 1,
  };
}
`;
