/**
 * Mesure contraste `.btn.primary` dans la page (injecté par capture.mts).
 * Plain JS — évite la sérialisation `__name` de tsx/esbuild via page.evaluate.
 */
(function () {
  const AA_MIN = 4.5;
  const AA_MIN_DISABLED_LABEL = 3;

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

  function resolveBackground(cssValue) {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;left:-9999px;top:0;width:8px;height:8px;background:${cssValue}`;
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return bg;
  }

  function blend(fg, bg, alpha) {
    return {
      r: Math.round(alpha * fg.r + (1 - alpha) * bg.r),
      g: Math.round(alpha * fg.g + (1 - alpha) * bg.g),
      b: Math.round(alpha * fg.b + (1 - alpha) * bg.b),
    };
  }

  function rgbToLab(r, g, b) {
    let rs = r / 255;
    let gs = g / 255;
    let bs = b / 255;
    rs = rs <= 0.04045 ? rs / 12.92 : ((rs + 0.055) / 1.055) ** 2.4;
    gs = gs <= 0.04045 ? gs / 12.92 : ((gs + 0.055) / 1.055) ** 2.4;
    bs = bs <= 0.04045 ? bs / 12.92 : ((bs + 0.055) / 1.055) ** 2.4;
    const x = (rs * 0.4124 + gs * 0.3576 + bs * 0.1805) / 0.95047;
    const y = rs * 0.2126 + gs * 0.7152 + bs * 0.0722;
    const z = (rs * 0.0193 + gs * 0.1192 + bs * 0.9505) / 1.08883;
    const fx = x > 0.008856 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
    const fy = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
    const fz = z > 0.008856 ? z ** (1 / 3) : 7.787 * z + 16 / 116;
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function deltaE00(rgb1, rgb2) {
    const lab1 = rgbToLab(rgb1.r, rgb1.g, rgb1.b);
    const lab2 = rgbToLab(rgb2.r, rgb2.g, rgb2.b);
    const avgL = (lab1.L + lab2.L) / 2;
    const C1 = Math.hypot(lab1.a, lab1.b);
    const C2 = Math.hypot(lab2.a, lab2.b);
    const avgC = (C1 + C2) / 2;
    const G =
      0.5 *
      (1 -
        Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
    const a1p = lab1.a * (1 + G);
    const a2p = lab2.a * (1 + G);
    const C1p = Math.hypot(a1p, lab1.b);
    const C2p = Math.hypot(a2p, lab2.b);
    const avgCp = (C1p + C2p) / 2;
    let h1p = Math.atan2(lab1.b, a1p) * (180 / Math.PI);
    if (h1p < 0) h1p += 360;
    let h2p = Math.atan2(lab2.b, a2p) * (180 / Math.PI);
    if (h2p < 0) h2p += 360;
    let dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    if (dhp < -180) dhp += 360;
    const dLp = lab2.L - lab1.L;
    const dCp = C2p - C1p;
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
    const T =
      1 -
      0.17 * Math.cos(((h1p + h2p) / 2 - 30) * (Math.PI / 180)) +
      0.24 * Math.cos((h1p + h2p) * (Math.PI / 180)) +
      0.32 * Math.cos(((h1p + h2p) / 2 + 6) * (Math.PI / 180)) -
      0.2 * Math.cos((h1p + h2p - 63) * (Math.PI / 180));
    const Sl =
      1 +
      (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
    const Sc = 1 + 0.045 * avgCp;
    const Sh = 1 + 0.015 * avgCp * T;
    const dRo =
      30 *
      Math.exp(-((((h1p + h2p) / 2 - 275) / 25) ** 2));
    const Rc =
      2 *
      Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7)) *
      Math.sin((dRo * Math.PI) / 180);
    const Rt =
      -Rc *
      Math.sqrt(dCp ** 2 / (Sc ** 2) + dHp ** 2 / (Sh ** 2)) *
      Math.sin(2 * dRo * (Math.PI / 180));
    return Math.sqrt(
      (dLp / Sl) ** 2 +
        (dCp / Sc) ** 2 +
        (dHp / Sh) ** 2 +
        Rt,
    );
  }

  function sampleButtonFace(sel) {
    const btn = document.querySelector(sel);
    if (!btn) throw new Error(`bouton introuvable : ${sel}`);
    const style = getComputedStyle(btn);
    const disabled = btn.matches(":disabled");
    const root = getComputedStyle(document.documentElement);
    const accent = root.getPropertyValue("--accent").trim() || "#c4a8ff";
    const accent2 = root.getPropertyValue("--accent-2").trim() || "#a78bfa";
    const faceCss = disabled
      ? resolveBackground("linear-gradient(#1c2034, #1c2034)")
      : resolveBackground(accent);
    const bg = parseRgb(faceCss);
    const border = parseRgb(style.borderTopColor);
    return {
      backgroundCss: faceCss,
      backgroundHex: bg ? toHex(bg.r, bg.g, bg.b) : null,
      borderCss: style.borderTopColor,
      borderHex: border ? toHex(border.r, border.g, border.b) : null,
      backgroundRgb: bg,
      borderRgb: border,
    };
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
    const accent = root.getPropertyValue("--accent").trim() || "#c4a8ff";
    const accent2 = root.getPropertyValue("--accent-2").trim() || "#a78bfa";
    const bg0 = root.getPropertyValue("--bg0").trim() || "#0c0e18";
    const pageBg = parseRgb(resolveBackground(bg0)) || {
      r: 12,
      g: 14,
      b: 24,
    };

    const disabled = btn.matches(":disabled");
    const minRatioRequired = disabled ? AA_MIN_DISABLED_LABEL : AA_MIN;

    const stopSpecs =
      stateName === "disabled" || disabled
        ? [["disabled-flat", "linear-gradient(#1c2034, #1c2034)"]]
        : [
            ["accent", accent],
            ["accent-2", accent2],
          ];

    const stops = stopSpecs.map(([stop, cssValue]) => {
      const bgCss = resolveBackground(cssValue);
      const bg = parseRgb(bgCss);
      if (!bg) throw new Error(`fond illisible : ${bgCss}`);
      const ratio =
        Math.round(
          contrast(blend(fg, pageBg, opacity), blend(bg, pageBg, opacity)) *
            100,
        ) / 100;
      return {
        stop,
        backgroundCss: bgCss,
        backgroundHex: toHex(bg.r, bg.g, bg.b),
        ratio,
        pass: ratio >= minRatioRequired,
      };
    });

    let face = null;
    try {
      face = sampleButtonFace(sel);
    } catch {
      face = null;
    }

    const focus =
      stateName === "focus"
        ? {
            focusVisible: btn.matches(":focus-visible"),
            outlineWidth: style.outlineWidth,
            outlineStyle: style.outlineStyle,
            outlineColor: style.outlineColor,
            outlineOffset: style.outlineOffset,
            cursor: style.cursor,
          }
        : undefined;

    if (stateName === "focus" && focus) {
      const outline = parseRgb(style.outlineColor);
      const backdrop = face.backgroundRgb || pageBg;
      if (outline && backdrop) {
        focus.outlineContrastRatio =
          Math.round(contrast(outline, backdrop) * 100) / 100;
      }
    }

    return {
      state: stateName,
      foregroundCss: fgCss,
      foregroundHex: toHex(fg.r, fg.g, fg.b),
      opacity,
      cursor: style.cursor,
      stops,
      minRatio: Math.min(...stops.map((s) => s.ratio)),
      pass: stops.every((s) => s.pass),
      face,
      focus,
    };
  }

  function measurePopinDisabledVsSecondary(primarySel, secondarySel) {
    const secondaryBtn = document.querySelector(secondarySel);
    if (!secondaryBtn) throw new Error(`secondaire introuvable : ${secondarySel}`);
    const secondaryStyle = getComputedStyle(secondaryBtn);
    const secondaryBg = parseRgb(resolveBackground("var(--bg2)"));
    const secondaryBorder = parseRgb(secondaryStyle.borderTopColor);
    const primaryBtn = document.querySelector(primarySel);
    if (!primaryBtn) throw new Error(`primaire introuvable : ${primarySel}`);
    const primaryStyle = getComputedStyle(primaryBtn);
    const primary = sampleButtonFace(primarySel);
    const secondary = {
      backgroundRgb: secondaryBg,
      borderRgb: secondaryBorder,
      backgroundHex: secondaryBg ? toHex(secondaryBg.r, secondaryBg.g, secondaryBg.b) : null,
      borderHex: secondaryBorder
        ? toHex(secondaryBorder.r, secondaryBorder.g, secondaryBorder.b)
        : null,
      borderStyle: secondaryStyle.borderTopStyle,
    };
    if (!primary.backgroundRgb || !secondary.backgroundRgb) {
      throw new Error("couleurs de fond illisibles pour ΔE00");
    }
    const deltaE00Face =
      Math.round(
        deltaE00(primary.backgroundRgb, secondary.backgroundRgb) * 100,
      ) / 100;
    let deltaE00Border = null;
    if (primary.borderRgb && secondary.borderRgb) {
      deltaE00Border =
        Math.round(
          deltaE00(primary.borderRgb, secondary.borderRgb) * 100,
        ) / 100;
    }
    return {
      primarySel,
      secondarySel,
      primaryFaceHex: primary.backgroundHex,
      secondaryFaceHex: secondary.backgroundHex,
      primaryBorderHex: primary.borderHex,
      secondaryBorderHex: secondary.borderHex,
      primaryBorderStyle: primaryStyle.borderTopStyle,
      secondaryBorderStyle: secondary.borderStyle,
      deltaE00Face,
      deltaE00Border,
      bordersMatch:
        primary.borderHex != null &&
        secondary.borderHex != null &&
        primary.borderHex === secondary.borderHex &&
        primaryStyle.borderTopStyle === secondary.borderStyle,
    };
  }

  window.__measurePrimaryBtnState = measureCurrent;
  window.__measurePopinDisabledVsSecondary = measurePopinDisabledVsSecondary;
})();
