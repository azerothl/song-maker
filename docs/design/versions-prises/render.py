from playwright.sync_api import sync_playwright
import pathlib
p=pathlib.Path(__file__).parent.resolve()
URL=f'file://{p}/index.html'
with sync_playwright() as pw:
    try: b=pw.chromium.launch()
    except Exception: b=pw.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg=b.new_page(viewport={'width':1280,'height':720}); pg.goto(URL); pg.wait_for_timeout(300)
    print('prises:',pg.eval_on_selector_all('.take','e=>e.length'),'| défilement:',pg.evaluate("(()=>{const c=document.querySelector('.content');return [c.scrollHeight,c.clientHeight]})()"))
    print('boutons <44px:',pg.evaluate("[...document.querySelectorAll('.btn,.iconbtn,.dt')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<43.5).map(e=>e.textContent.trim())"))
    print('visibles sans défiler:',pg.evaluate("[...document.querySelectorAll('.take')].filter(e=>e.getBoundingClientRect().bottom<=720).length"))
    pg.screenshot(path=str(p/'versions-1280x720.png'))
    # défilement : « hier » (avant la séparation)
    pg.evaluate("document.querySelector('#take-9').scrollIntoView({block:'start'})"); pg.wait_for_timeout(150)
    pg.screenshot(path=str(p/'versions-defilement-hier.png'))
    # Détails ouvert sur la prise 11 (gen-011), focus clavier sur le bouton
    pg.evaluate("document.querySelector('.content').scrollTop=0")
    pg.focus('#take-11 [data-dt]'); pg.keyboard.press('Enter')
    pg.evaluate("document.querySelector('#take-11').scrollIntoView({block:'center'})"); pg.wait_for_timeout(150)
    pg.screenshot(path=str(p/'versions-details-ouvert.png'))
    pg.keyboard.press('Enter')
    # Renommage actif sur la prise 10
    pg.click('#take-10 [data-rename]'); pg.evaluate("document.querySelector('#take-10').scrollIntoView({block:'center'})"); pg.wait_for_timeout(150)
    pg.screenshot(path=str(p/'versions-renommer.png'))
    b.close()
