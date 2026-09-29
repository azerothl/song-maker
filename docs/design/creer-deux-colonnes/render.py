from playwright.sync_api import sync_playwright
import pathlib
p=pathlib.Path(__file__).parent.resolve()
shots={'creer-1280x720':(1280,720),'creer-1600x900':(1600,900),'creer-800x700-une-colonne':(800,700)}
with sync_playwright() as pw:
    try: b=pw.chromium.launch()
    except Exception: b=pw.chromium.launch(executable_path='/usr/bin/google-chrome')
    for n,(w,h) in shots.items():
        pg=b.new_page(viewport={'width':w,'height':h})
        pg.goto(f'file://{p}/index.html'); pg.wait_for_timeout(300)
        # Vérifications : Style, Paroles et Générer visibles sans défilement
        for sel in ['#style','#paroles','.btn']:
            r=pg.eval_on_selector(sel,'e=>{const r=e.getBoundingClientRect();return [r.top,r.bottom,r.height,innerHeight]}')
            print(n,sel,[round(x) for x in r],'OK' if r[0]>=0 and r[1]<=r[3] else 'HORS ECRAN')
        print(n,'ordre Tab:',pg.evaluate('''()=>{const o=[];const els=[...document.querySelectorAll('a,button,input,textarea,summary')].filter(e=>e.tabIndex>=0);return els.map(e=>e.id||e.className||e.tagName).join(' > ')}'''))
        pg.screenshot(path=str(p/f'{n}.png'))
        pg.close()
    b.close()
