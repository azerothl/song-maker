"""Rendus PNG de la maquette « barre latérale repliable » (Playwright/Chromium).
Même approche que ../songmaker-mockup-creer/render.py. Usage : python3 render.py"""
from playwright.sync_api import sync_playwright
import pathlib
from PIL import Image, ImageDraw, ImageFont

p = pathlib.Path(__file__).parent.resolve()
URL = f'file://{p}/index.html'

def measure(pg, tag):
    r = pg.evaluate('''()=>{
      const w=s=>Math.round(document.querySelector(s).getBoundingClientRect().width);
      const h=s=>Math.round(document.querySelector(s).getBoundingClientRect().height);
      const items=[...document.querySelectorAll('#toggle, nav a.ctl')].map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]});
      const clip=[...document.querySelectorAll('#sidebar .ctl, #sidebar .brand')].filter(e=>e.scrollWidth>e.clientWidth+1 && getComputedStyle(e).overflow!=='hidden').length;
      return {sidebar:w('#sidebar'),exp:document.getElementById('toggle').getAttribute('aria-expanded'),
              name:document.getElementById('toggle').getAttribute('aria-label'),items,clip,
              scrollX:document.documentElement.scrollWidth>innerWidth}}''')
    ok = all(wd >= 44 and ht >= 44 for wd, ht in r['items'])
    print(f"{tag}: barre={r['sidebar']}px aria-expanded={r['exp']} nom='{r['name']}' cibles>=44px:{'OK' if ok else 'KO'} {r['items']} défilement horizontal:{r['scrollX']}")

with sync_playwright() as pw:
    try: b = pw.chromium.launch()
    except Exception: b = pw.chromium.launch(executable_path='/usr/bin/google-chrome')

    def page(w, h, **kw):
        ctx = b.new_context(viewport={'width': w, 'height': h}, **kw)
        pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(400)
        return pg

    # 1) déplié 1280x720
    pg = page(1280, 720); measure(pg, 'déplié')
    pg.screenshot(path=str(p/'sidebar-deplie-1280x720.png'))

    # 2) replié 1280x720 (clic sur le bouton), pointeur ailleurs
    pg.click('#toggle'); pg.mouse.move(700, 400); pg.wait_for_timeout(450)
    measure(pg, 'replié')
    pg.screenshot(path=str(p/'sidebar-replie-1280x720.png'))

    # persistance : rechargement -> reste replié
    pg.reload(); pg.wait_for_timeout(400)
    print('mémorisé après rechargement (attendu 56):', pg.evaluate("Math.round(document.getElementById('sidebar').getBoundingClientRect().width)"))

    # 3) replié + info-bulle au survol de « Bibliothèque »
    pg.hover('nav a.ctl >> nth=0'); pg.wait_for_timeout(450)
    pg.screenshot(path=str(p/'sidebar-replie-tooltip-1280x720.png'))
    pg.context.close()

    # 4) auto 1024x700 (aucune préférence mémorisée)
    pg = page(1024, 700); measure(pg, 'auto 1024')
    pg.screenshot(path=str(p/'sidebar-auto-1024x700.png'))
    # comportement : Ctrl+B déplie à la main en fenêtre étroite
    pg.keyboard.press('Control+b'); pg.wait_for_timeout(400); measure(pg, 'auto 1024 -> Ctrl+B')
    pg.context.close()

    # 5) focus-visible sur le bouton (Tab clavier) : déplié + replié, assemblés
    crops = []
    pg = page(1280, 720)
    pg.keyboard.press('Tab'); pg.wait_for_timeout(300)
    print('focus sur :', pg.evaluate('document.activeElement.id'))
    pg.screenshot(path='/tmp/f1.png', clip={'x': 0, 'y': 0, 'width': 300, 'height': 200})
    pg.keyboard.press('Control+b'); pg.wait_for_timeout(450)
    pg.screenshot(path='/tmp/f2.png', clip={'x': 0, 'y': 0, 'width': 300, 'height': 200})
    pg.context.close(); b.close()

a, c = Image.open('/tmp/f1.png'), Image.open('/tmp/f2.png')
cap = 34; W = a.width + c.width + 30
im = Image.new('RGB', (W, a.height + cap), '#0b0a0e')
im.paste(a, (0, cap)); im.paste(c, (a.width + 30, cap))
d = ImageDraw.Draw(im)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except Exception: f = ImageFont.load_default()
d.text((10, 9), 'Déplié — focus clavier (Tab)', fill='#f3f0fa', font=f)
d.text((a.width + 40, 9), 'Replié — focus clavier', fill='#f3f0fa', font=f)
im.save(p/'sidebar-focus-toggle.png')
print('OK')
