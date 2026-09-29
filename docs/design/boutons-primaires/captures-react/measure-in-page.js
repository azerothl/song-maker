/**
 * Mesure contraste `.btn.primary` depuis styles calculés (injecté par capture.mts).
 * Lit getComputedStyle réel : stops du dégradé ou background-color plat (désactivé).
 */
(function () {
  const AA_MIN = 4.5;
  const GRADIENT_STOP_RE =
    /(?:rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|color\(\s*srgb[\s\d./]+\)|#[0-9a-f]{3,8})/gi;

  function srgbToLinear(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }

  function relLum(r, g, b) {
    return (
      0.2126 * srgbToLinear(r) +
      0.7152 * srgbToLinear(g) +
      0.0722 * srgbToLinear(b)
    );
  }

  function parseRgb(css) {
    const raw = String(css).trim();
    const rgb = raw.match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i,
    );
    if (rgb) {
      return {
        r: Math.round(Number(rgb[1])),
        g: Math.round(Number(rgb[2])),
        b: Math.round(Number(rgb[3])),
        a: rgb[4] != null ? Number(rgb[4]) : 1,
      };
    }
    const srgb = raw.match(
      /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i,
    );
    if (srgb) {
      return {
        r: Math.round(Number(srgb[1]) * 255),
        g: Math.round(Number(srgb[2]) * 255),
        b: Math.round(Number(srgb[3]) * 255),
        a: srgb[4] != null ? Number(srgb[4]) : 1,
      };
    }
    // Chrome may serialize as oklab(...); resolve via a probe element.
    if (/^(oklab|oklch|lab|lch|color)\(/i.test(raw)) {
      const probe = document.createElement("div");
      probe.style.cssText = `position:fixed;left:-9999px;background:${raw}`;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      if (resolved && resolved !== raw) return parseRgb(resolved);
    }
    if (raw.startsWith("#")) {
      const h = raw.slice(1);
      if (h.length === 3) {
        return {
          r: parseInt(h[0] + h[0], 16),
          g: parseInt(h[1] + h[1], 16),
          b: parseInt(h[2] + h[2], 16),
          a: 1,
        };
      }
      if (h.length === 6) {
        return {
          r: parseInt(h.slice(0, 2), 16),
          g: parseInt(h.slice(2, 4), 16),
          b: parseInt(h.slice(4, 6), 16),
          a: 1,
        };
      }
    }
    return null;
  }

  function toHex(r, g, b) {
    const h = (n) => n.toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function contrast(a, b) {
    const l1 = relLum(a.r, a.g, a.b);
    const l2 = relLum(b.r, b.g, b.b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function blend(fg, bg, alpha) {
    return {
      r: Math.round(alpha * fg.r + (1 - alpha) * bg.r),
      g: Math.round(alpha * fg.g + (1 - alpha) * bg.g),
      b: Math.round(alpha * fg.b + (1 - alpha) * bg.b),
    };
  }

  function parseGradientStops(backgroundImage) {
    if (!backgroundImage || backgroundImage === "none") return [];
    return backgroundImage.match(GRADIENT_STOP_RE) ?? [];
  }

  function measureCurrent(sel, stateName) {
    const btn = document.querySelector(sel);
    if (!btn) throw new Error(`bouton introuvable : ${sel}`);

    const style = getComputedStyle(btn);
    const fgCss = style.color;
    const opacity = Number.parseFloat(style.opacity);
    const fg = parseRgb(fgCss);
    if (!fg) throw new Error(`couleur texte illisible : ${fgCss}`);

    const root = getComputedStyle(document.documentElement);
    const bg0 = root.getPropertyValue("--bg0").trim() || "#0c0e18";
    const pageBg = parseRgb(bg0) || { r: 12, g: 14, b: 24 };
    const composedFg = blend(fg, pageBg, Number.isFinite(opacity) ? opacity : 1);

    const stopCssList = parseGradientStops(style.backgroundImage);
    let stops;
    if (stopCssList.length > 0) {
      stops = stopCssList.map((cssValue, i) => {
        const bg = parseRgb(cssValue);
        if (!bg) throw new Error(`fond illisible : ${cssValue}`);
        const composedBg = blend(bg, pageBg, Number.isFinite(opacity) ? opacity : 1);
        const ratio = Math.round(contrast(composedFg, composedBg) * 100) / 100;
        return {
          stop: stopCssList.length === 2 ? (i === 0 ? "top" : "bottom") : `stop-${i}`,
          backgroundCss: cssValue,
          backgroundHex: toHex(bg.r, bg.g, bg.b),
          ratio,
          pass: ratio >= AA_MIN,
        };
      });
    } else {
      const bgCss = style.backgroundColor;
      const bg = parseRgb(bgCss);
      if (!bg) throw new Error(`fond plat illisible : ${bgCss}`);
      const composedBg = blend(bg, pageBg, Number.isFinite(opacity) ? opacity : 1);
      const ratio = Math.round(contrast(composedFg, composedBg) * 100) / 100;
      stops = [
        {
          stop: "flat",
          backgroundCss: bgCss,
          backgroundHex: toHex(bg.r, bg.g, bg.b),
          ratio,
          pass: ratio >= AA_MIN,
        },
      ];
    }

    return {
      state: stateName,
      foregroundCss: fgCss,
      foregroundHex: toHex(fg.r, fg.g, fg.b),
      opacity: Number.isFinite(opacity) ? opacity : 1,
      stops,
      minRatio: Math.min(...stops.map((s) => s.ratio)),
      pass: stops.every((s) => s.pass),
    };
  }

  window.__measurePrimaryBtnState = measureCurrent;
})();
