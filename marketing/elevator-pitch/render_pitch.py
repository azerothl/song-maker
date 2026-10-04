from __future__ import annotations

import math
import random
import subprocess
import wave as wavefile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "song-maker-pitch-30s.mp4"
MUSIC = ROOT / "original-soundtrack.wav"
WIDTH, HEIGHT, FPS, DURATION = 1920, 1080, 30, 30
FRAMES = FPS * DURATION
BG = (7, 11, 20)
WHITE = (243, 246, 255)
MUTED = (156, 170, 194)
PURPLE = (170, 120, 255)
CYAN = (73, 220, 225)
PINK = (247, 110, 169)
AMBER = (255, 185, 89)
GREEN = (114, 231, 181)

FONT_DIR = Path("C:/Windows/Fonts")
FONT_REG = str(FONT_DIR / "segoeui.ttf")
FONT_BOLD = str(FONT_DIR / "segoeuib.ttf")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def ease(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def clamp(x: float, a: float = 0.0, b: float = 1.0) -> float:
    return max(a, min(b, x))


def make_background() -> Image.Image:
    y, x = np.mgrid[0:HEIGHT, 0:WIDTH]
    arr = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    for channel, base in enumerate(BG):
        glow_a = np.exp(-(((x - 1320) / 660) ** 2 + ((y - 300) / 580) ** 2))
        glow_b = np.exp(-(((x - 380) / 620) ** 2 + ((y - 940) / 500) ** 2))
        val = base + glow_a * (25 if channel == 2 else 11) + glow_b * (25 if channel == 0 else 9)
        arr[:, :, channel] = np.clip(val, 0, 255)
    img = Image.fromarray(arr, "RGB").convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    for gx in range(64, WIDTH, 64):
        d.line((gx, 0, gx, HEIGHT), fill=(120, 153, 205, 10), width=1)
    for gy in range(64, HEIGHT, 64):
        d.line((0, gy, WIDTH, gy), fill=(120, 153, 205, 10), width=1)
    return img


BG_IMAGE = make_background()


def glow(img: Image.Image, box: tuple[int, int, int, int], color: tuple[int, int, int], radius: int = 38, alpha: int = 80) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(box, fill=(*color, alpha))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius)))


def panel(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill=(14, 20, 34, 236), outline=(114, 134, 171, 60), radius=24, width=2) -> None:
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def txt(d: ImageDraw.ImageDraw, xy: tuple[float, float], value: str, size: int, color=WHITE, bold=False, anchor=None) -> None:
    d.text(xy, value, font=font(size, bold), fill=color, anchor=anchor)


def center(d: ImageDraw.ImageDraw, y: int, value: str, size: int, color=WHITE, bold=False) -> None:
    txt(d, (WIDTH / 2, y), value, size, color, bold, "mt")


def pill(d: ImageDraw.ImageDraw, x: int, y: int, label: str, color=PURPLE, size=21) -> int:
    f = font(size, True)
    w = int(d.textlength(label, font=f) + 40)
    d.rounded_rectangle((x, y, x + w, y + 42), radius=21, fill=(16, 22, 37, 255), outline=(*color, 255), width=2)
    txt(d, (x + w / 2, y + 21), label, size, color, True, "mm")
    return w


def wave(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, color, t: float, seed: int, phase: float = 0.0, glow_on=True) -> None:
    rng = random.Random(seed)
    n = max(18, w // 10)
    mid = y + h / 2
    for i in range(n):
        p = i / max(1, n - 1)
        envelope = 0.22 + 0.78 * (math.sin(math.pi * p) ** 0.48)
        signal = (0.30 + 0.70 * abs(math.sin(i * 1.71 + seed)))
        pulse = 0.72 + 0.28 * math.sin(t * 2.4 + i * 0.26 + phase)
        bh = max(3, int(h * 0.43 * envelope * signal * pulse))
        xx = x + int(p * w)
        d.rounded_rectangle((xx, mid - bh, xx + 4, mid + bh), radius=2, fill=(*color, 210))


def draw_brand(d: ImageDraw.ImageDraw, x: int, y: int, scale: float = 1.0, color=PURPLE) -> None:
    heights = [18, 34, 52, 30, 43, 24, 15]
    gap = int(9 * scale)
    barw = int(7 * scale)
    for i, h in enumerate(heights):
        hh = int(h * scale)
        d.rounded_rectangle((x + i * gap, y - hh // 2, x + i * gap + barw, y + hh // 2), radius=barw // 2, fill=color)


def draw_sparkles(d: ImageDraw.ImageDraw, t: float) -> None:
    for i in range(34):
        x = (i * 271 + 91) % WIDTH
        y = (i * 181 + 49) % HEIGHT
        phase = (t * (0.16 + (i % 4) * 0.035) + i * 0.173) % 1
        a = int(18 + 45 * abs(math.sin(phase * math.tau)))
        r = 1 + (i % 3)
        ImageDraw.Draw(canvas, "RGBA").ellipse((x-r, y-r, x+r, y+r), fill=(155, 181, 255, a))


def frame_at(t: float) -> Image.Image:
    global canvas
    canvas = BG_IMAGE.copy()
    # Floating light motes keep every beat in motion without competing with the copy.
    motes = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    md = ImageDraw.Draw(motes)
    for i in range(42):
        x = int((i * 379 + t * (13 + i % 6) * (-1 if i % 2 else 1)) % WIDTH)
        y = int((i * 223 + 68 * math.sin(t * 0.35 + i)) % HEIGHT)
        r = 1 + i % 3
        md.ellipse((x-r, y-r, x+r, y+r), fill=(170, 192, 255, 22 + (i % 4) * 8))
    canvas.alpha_composite(motes)
    d = ImageDraw.Draw(canvas, "RGBA")

    if t < 4.2:
        p = ease(t / 1.2)
        glow(canvas, (760, 100, 1440, 690), PURPLE, 90, 35)
        center(d, 152, "UNE IDÉE EN TÊTE ?", 24, CYAN, True)
        center(d, 318 + int((1-p)*32), "Une idée.", 112, WHITE, True)
        center(d, 455 + int((1-p)*24), "Une chanson.", 112, PURPLE, True)
        # A luminous sound line grows outward under the hook.
        progress = clamp((t - .55) / 2.8)
        wave(d, int(960 - 405 * progress), 690, int(810 * progress), 86, CYAN, t, 17)
        center(d, 831, "Song Maker", 29, MUTED, True)

    elif t < 9.0:
        p = ease((t - 4.2) / 1.0)
        txt(d, (156, 142), "01  ·  LE DÉCLIC", 21, CYAN, True)
        txt(d, (156, 194), "Écrivez le point", 65, WHITE, True)
        txt(d, (156, 270), "de départ.", 65, WHITE, True)
        # Composer card.
        x0 = 156 + int((1-p)*80)
        glow(canvas, (x0+220, 390, x0+1170, 905), PURPLE, 95, 24)
        panel(d, (x0, 388, x0+798, 904), fill=(12, 18, 31, 246), outline=(164, 139, 221, 100), radius=28)
        txt(d, (x0+40, 426), "NOUVEAU MORCEAU", 18, MUTED, True)
        txt(d, (x0+40, 486), "STYLE", 16, CYAN, True)
        panel(d, (x0+36, 516, x0+755, 582), fill=(21, 28, 44, 245), outline=(98, 119, 155, 85), radius=13, width=1)
        txt(d, (x0+60, 548), "pop électronique · voix intime", 23, WHITE, False, "lm")
        txt(d, (x0+40, 617), "PAROLES", 16, PURPLE, True)
        panel(d, (x0+36, 648, x0+755, 795), fill=(21, 28, 44, 245), outline=(98, 119, 155, 85), radius=13, width=1)
        lyrics = ["[Couplet]", "La ville s'allume au bord de la nuit", "Un premier refrain cherche son chemin"]
        for i, line in enumerate(lyrics):
            txt(d, (x0+60, 678+i*37), line, 21, PURPLE if i == 0 else (212, 220, 238), i == 0)
        btnx, btny = x0+36, 824
        d.rounded_rectangle((btnx, btny, btnx+719, btny+54), radius=16, fill=(144, 94, 240, 235))
        txt(d, (btnx+359, btny+27), "✦   Générer", 22, WHITE, True, "mm")
        # three compact input cues on the right
        txt(d, (1120, 465), "Le style donne", 29, MUTED)
        txt(d, (1120, 504), "la couleur.", 29, WHITE, True)
        txt(d, (1120, 610), "Les paroles donnent", 29, MUTED)
        txt(d, (1120, 649), "le cœur.", 29, WHITE, True)
        for i, c in enumerate([PURPLE, CYAN, PINK]):
            r = 7 + int(2 * math.sin(t*3+i))
            d.ellipse((1122+i*38-r, 743-r, 1122+i*38+r, 743+r), fill=(*c, 230))

    elif t < 14.1:
        p = ease((t - 9.0) / 0.8)
        txt(d, (154, 132), "02  ·  LA CRÉATION", 21, CYAN, True)
        txt(d, (154, 188), "YuE2 la met", 70, WHITE, True)
        txt(d, (154, 268), "en musique.", 70, PURPLE, True)
        pill(d, 156, 382, "YUe2".upper(), PURPLE, 20)
        pill(d, 286, 382, "SUR VOTRE ORDINATEUR", CYAN, 18)
        # signal blooms out from a local compute core
        cx, cy = 1412, 562
        for i in range(4):
            rr = 118 + 42*i + int(7*math.sin(t*2.4+i))
            a = max(20, 105-i*18)
            d.ellipse((cx-rr, cy-rr, cx+rr, cy+rr), outline=(*PURPLE, a), width=2)
        d.ellipse((cx-90, cy-90, cx+90, cy+90), fill=(35, 24, 63, 245), outline=(*PURPLE, 220), width=3)
        draw_brand(d, cx-25, cy, 1.45, PURPLE)
        txt(d, (cx, cy+124), "GPU LOCAL", 17, CYAN, True, "mt")
        # build a waveform across screen
        progress = clamp((t-9.45)/3.8)
        d.line((154, 728, 1766, 728), fill=(110, 135, 179, 55), width=2)
        wave(d, 154, 647, int(1612*progress), 162, PURPLE, t, 92)
        txt(d, (154, 840), "Du texte à une première prise", 24, MUTED)
        txt(d, (1766, 840), "SUR VOTRE MACHINE", 17, CYAN, True, "ra")

    elif t < 18.25:
        p = ease((t - 14.1) / .65)
        txt(d, (154, 132), "03  ·  LE CHOIX", 21, CYAN, True)
        txt(d, (154, 190), "Deux prises.", 72, WHITE, True)
        txt(d, (154, 272), "Votre préférence.", 72, PURPLE, True)
        for idx, yy in enumerate((444, 670)):
            selected = idx == (0 if t < 16.6 else 1)
            col = PURPLE if idx == 0 else CYAN
            box = (155, yy, 1765, yy+170)
            if selected:
                glow(canvas, (box[0]+190, box[1]-70, box[2]-110, box[3]+100), col, 75, 25)
            panel(d, box, fill=(15, 21, 35, 245), outline=(*col, 180 if selected else 52), radius=24, width=2 if selected else 1)
            txt(d, (202, yy+40), f"PRISE 0{idx+1}", 20, col, True)
            txt(d, (202, yy+86), "Variation lumineuse" if idx == 0 else "Variation plus douce", 28, WHITE, True)
            wave(d, 650, yy+42, 850, 96, col, t, 41+idx*19, idx*1.1)
            d.ellipse((1613, yy+55, 1673, yy+115), fill=(*col, 230 if selected else 100))
            if selected:
                txt(d, (1643, yy+85), "✓", 27, BG, True, "mm")
        center(d, 897, "Générez plusieurs versions. Gardez celle qui vous inspire.", 24, MUTED)

    elif t < 23.1:
        p = ease((t - 18.25) / .7)
        txt(d, (154, 120), "04  ·  LES PISTES", 21, CYAN, True)
        txt(d, (154, 174), "Une chanson.", 69, WHITE, True)
        txt(d, (154, 251), "Quatre pistes.", 69, PURPLE, True)
        pill(d, 154, 349, "HTDEMUCS", CYAN, 18)
        tracks = [("VOIX", PURPLE), ("BATTERIE", CYAN), ("BASSE", PINK), ("AUTRES SONS", AMBER)]
        for i, (name, col) in enumerate(tracks):
            yy = 468 + i*119
            x = 154 + int((1-p)*100)
            panel(d, (x, yy, 1766, yy+86), fill=(13, 19, 32, 239), outline=(*col, 80), radius=17, width=1)
            d.ellipse((x+24, yy+28, x+32, yy+36), fill=col)
            txt(d, (x+54, yy+43), name, 17, col, True, "lm")
            wave(d, x+280, yy+12, 1220, 61, col, t, 202+i*25, i*.83)
            # staggered entry illuminates each separated lane
            reveal = clamp((t - (18.8 + i*.16))/.38)
            d.rounded_rectangle((x+280, yy+77, x+280+int(1220*reveal), yy+80), radius=2, fill=(*col, 160))
        txt(d, (154, 972), "Le modèle standard sépare voix, batterie, basse et autres sons.", 20, MUTED)

    elif t < 27.05:
        p = ease((t - 23.1) / .55)
        txt(d, (154, 122), "05  ·  LE MIX", 21, CYAN, True)
        txt(d, (154, 178), "Ajustez chaque", 69, WHITE, True)
        txt(d, (154, 256), "niveau.", 69, PURPLE, True)
        panel(d, (154, 387, 1766, 904), fill=(12, 18, 31, 244), outline=(130, 145, 185, 78), radius=27)
        tracks = [("Voix", PURPLE, .72), ("Batterie", CYAN, .63), ("Basse", PINK, .57), ("Autres sons", AMBER, .68)]
        for i, (name, col, initial) in enumerate(tracks):
            yy = 468 + i*100
            txt(d, (204, yy), name, 22, WHITE, True, "lm")
            wave(d, 425, yy-31, 845, 59, col, t, 78+i*4, i)
            sx, ex = 1340, 1645
            d.rounded_rectangle((sx, yy-5, ex, yy+5), radius=5, fill=(53, 64, 88, 255))
            amount = initial + .08*math.sin(t*1.7+i*1.2)
            knob = sx + int((ex-sx)*amount)
            d.rounded_rectangle((sx, yy-5, knob, yy+5), radius=5, fill=col)
            d.ellipse((knob-11, yy-11, knob+11, yy+11), fill=WHITE, outline=(*col, 240), width=3)
        # Moving playhead shows active listening.
        playx = 436 + int(790*((t-23.1)/4.0))
        d.line((playx, 429, playx, 852), fill=(*WHITE, 155), width=2)
        txt(d, (154, 965), "Écoutez. Dosez. Façonnez le rendu.", 24, MUTED)

    else:
        p = ease((t - 27.05) / .55)
        glow(canvas, (520, 80, 1440, 920), PURPLE, 115, 34)
        center(d, 126, "DU TEXTE AU MORCEAU", 21, CYAN, True)
        draw_brand(d, 798, 315, 1.8)
        center(d, 407, "Song Maker", 84, WHITE, True)
        center(d, 537, "Votre idée. Vos pistes. Votre mix.", 32, MUTED, False)
        # export tiles land one by one
        for i, fmt in enumerate(("WAV", "FLAC", "MP3")):
            yy = 664 + int((1-p)*70)
            xx = 562 + i*278
            col = [PURPLE, CYAN, PINK][i]
            panel(d, (xx, yy, xx+230, yy+89), fill=(16, 22, 37, 255), outline=(*col, 255), radius=18, width=2)
            txt(d, (xx+115, yy+44), fmt, 25, WHITE, True, "mm")
        center(d, 844, "Créez et travaillez votre chanson sur votre ordinateur.", 24, WHITE, True)
        center(d, 955, "YUE2  ·  HTDEMUCS  ·  EXPORT AUDIO", 16, MUTED, True)

    # Beat-matched transitions: subtle camera-like push between 4 s beats.
    local = t % 4.8
    zoom = 1.0 + .009 * (local / 4.8)
    if zoom > 1.001:
        nw, nh = int(WIDTH/zoom), int(HEIGHT/zoom)
        left, top = (WIDTH-nw)//2, (HEIGHT-nh)//2
        canvas = canvas.crop((left, top, left+nw, top+nh)).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")


def soundtrack() -> None:
    sr = 48000
    n = sr * DURATION
    rng = np.random.default_rng(812)
    left = np.zeros(n, dtype=np.float32)
    right = np.zeros(n, dtype=np.float32)
    bpm = 112
    beat = 60 / bpm

    def add_mono(signal: np.ndarray, start: int, pan: float = 0.0) -> None:
        end = min(n, start + len(signal))
        if end <= start:
            return
        s = signal[:end-start]
        left[start:end] += s * math.sqrt((1-pan)*.5)
        right[start:end] += s * math.sqrt((1+pan)*.5)

    def tone(freq: float, length: float, amp: float, kind="sine", decay=4.0) -> np.ndarray:
        count = max(1, int(sr*length))
        t = np.arange(count, dtype=np.float32)/sr
        phase = 2*np.pi*freq*t
        if kind == "saw":
            sig = 2*((freq*t) % 1)-1
            sig = sum(((-1)**(k+1))*np.sin(phase*k)/k for k in range(1, 6)) * (2/np.pi)
        elif kind == "tri":
            sig = 2*np.abs(2*((freq*t) % 1)-1)-1
        else:
            sig = np.sin(phase)
        env = np.minimum(1, t/0.012) * np.exp(-decay*t)
        return (amp*sig*env).astype(np.float32)

    # Four-chord, original synth bed in A minor; no app or model output is used.
    chords = [(220.00, 261.63, 329.63), (174.61, 220.00, 261.63), (130.81, 164.81, 196.00), (196.00, 246.94, 293.66)]
    total_beats = int(DURATION/beat)+1
    for bar in range(math.ceil(total_beats/4)):
        chord = chords[bar % len(chords)]
        start = int(bar*4*beat*sr)
        duration = min(4*beat, DURATION-bar*4*beat)
        if duration <= 0:
            continue
        count = int(duration*sr)
        tt = np.arange(count, dtype=np.float32)/sr
        env = np.minimum(1, tt/.65) * np.minimum(1, np.maximum(0, (duration-tt)/.8))
        for j, f in enumerate(chord):
            pad = (np.sin(2*np.pi*f*tt) + .24*np.sin(2*np.pi*f*2.01*tt + .2*j) + .10*np.sin(2*np.pi*f*3*tt))
            add_mono((pad*env*.050).astype(np.float32), start, (-.28, .22, .08)[j])

    # Soft four-on-the-floor kick, clap on 2 and 4, crisp hats, and a pluck motif.
    scale = [440.00, 523.25, 659.25, 587.33, 523.25, 392.00, 440.00, 329.63]
    for bi in range(total_beats):
        start_sec = bi*beat
        if start_sec >= DURATION:
            break
        start = int(start_sec*sr)
        # Pitch-swept, short kick.
        count = min(int(.22*sr), n-start)
        tt = np.arange(count, dtype=np.float32)/sr
        phase = 2*np.pi*(48*tt + 26*(1-np.exp(-tt*24)))
        kick = np.sin(phase)*np.exp(-tt*19)*.31
        add_mono(kick.astype(np.float32), start, -.05 if bi%2 else .05)
        # Tight snare/clap on alternate beats.
        if bi % 4 in (1, 3):
            count = min(int(.15*sr), n-start)
            tt = np.arange(count, dtype=np.float32)/sr
            noise = rng.normal(0, 1, count).astype(np.float32)
            noise[1:] = noise[1:] - .88*noise[:-1]
            clap = noise*np.exp(-tt*29)*.080
            add_mono(clap, start, -.23 if bi%4 == 1 else .23)
        # Bell-like eighth-note pulse.
        for half in (0, 1):
            pos = start + int(half*beat*.5*sr)
            idx = (bi*2+half) % len(scale)
            pluck = tone(scale[idx], .33, .080, "sine", 9.5)
            add_mono(pluck, pos, -.34 if (bi+half)%2 else .34)
        # Bright tick on each offbeat.
        pos = start + int(beat*.5*sr)
        if pos < n:
            count = min(int(.045*sr), n-pos)
            tt = np.arange(count, dtype=np.float32)/sr
            noise = rng.normal(0, 1, count).astype(np.float32)
            hat = noise*np.exp(-tt*98)*.021
            add_mono(hat, pos, .4 if bi%2 else -.4)

    # Intro build and clean tail.
    fade_in = np.minimum(1, np.arange(n, dtype=np.float32)/(sr*1.15))
    fade_out = np.minimum(1, np.maximum(0, (n-np.arange(n, dtype=np.float32))/(sr*1.3)))
    env = fade_in * fade_out
    stereo = np.stack((left*env, right*env), axis=1)
    peak = float(np.max(np.abs(stereo)))
    if peak > .91:
        stereo *= .91/peak
    pcm = (np.clip(stereo, -1, 1)*32767).astype("<i2")
    with wavefile.open(str(MUSIC), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def render() -> None:
    soundtrack()
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS), "-i", "-",
        "-i", str(MUSIC), "-t", str(DURATION), "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(OUT),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    try:
        for i in range(FRAMES):
            proc.stdin.write(frame_at(i/FPS).tobytes())
            if i % 150 == 0:
                print(f"Rendu {i//FPS:02d}/{DURATION} s", flush=True)
    finally:
        proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("FFmpeg n'a pas terminé l'encodage.")
    print(f"Vidéo créée : {OUT}")


if __name__ == "__main__":
    render()
