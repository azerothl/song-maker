from playwright.sync_api import sync_playwright
import pathlib
p=pathlib.Path(__file__).parent.resolve()
URL=f'file://{p}/index.html'

def rows_visible(pg):
    return pg.evaluate('''()=>{
      const sc=document.querySelector('.content'),st=document.querySelector('.sticky').getBoundingClientRect();
      const bottom=sc.getBoundingClientRect().bottom;
      const rs=[...document.querySelectorAll('.row')].filter(r=>r.offsetParent!==null);
      const full=rs.filter(r=>{const b=r.getBoundingClientRect();return b.top>=st.bottom-1&&b.bottom<=bottom+1});
      const hs=[...document.querySelectorAll('.row')].filter(r=>r.offsetParent!==null).map(r=>Math.round(r.getBoundingClientRect().height));
      return {total_rows:document.querySelectorAll('.row').length,rendered:rs.length,fully_visible:full.length,row_h:hs[0],sticky_bottom:Math.round(st.bottom),viewport_bottom:Math.round(bottom),
        toolbar_wrapped:document.querySelector('.toolbar').getBoundingClientRect().height>50}}''')

with sync_playwright() as pw:
    try: b=pw.chromium.launch()
    except Exception: b=pw.chromium.launch(executable_path='/usr/bin/google-chrome')
    # 1. compact, 12 pistes, focus clavier sur le gain de « Chœurs »
    pg=b.new_page(viewport={'width':1280,'height':720}); pg.goto(URL); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelectorAll('.row')[1].querySelector('.knob').focus()")
    print('compact',rows_visible(pg)); pg.screenshot(path=str(p/'production-compact-1280x720.png'))
    # 3. tooltip (focus clavier sur « Estimé * »)
    pg.evaluate("document.activeElement.blur()"); pg.focus('#estime'); pg.wait_for_timeout(150)
    pg.screenshot(path=str(p/'production-tooltip.png')); pg.keyboard.press('Escape')
    # 4. popover Assistant (ouvert au clavier : anneau de focus visible)
    pg.focus('#b-assist'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    pg.screenshot(path=str(p/'production-assistant-popin.png'))
    # non bloquant : la liste défile toujours et un gain reste réglable
    print('popover ouvert, scroll possible:',pg.evaluate("(()=>{const c=document.querySelector('.content');c.scrollTop=40;return c.scrollTop})()"))
    pg.close()
    # 2. confortable, 6 pistes
    pg=b.new_page(viewport={'width':1280,'height':720}); pg.goto(URL+'#six'); pg.wait_for_timeout(300)
    pg.click('#d-conf'); pg.wait_for_timeout(150)
    pg.evaluate("document.activeElement.blur()")
    print('confortable',rows_visible(pg)); pg.screenshot(path=str(p/'production-confortable-1280x720.png'))
    # cibles : boutons principaux >= 44 px
    print('tailles',pg.evaluate("[...document.querySelectorAll('.btn:not(.sec), .btn.sec')].filter(e=>e.offsetParent).map(e=>[e.textContent.trim(),Math.round(e.getBoundingClientRect().height)])"))
    b.close()
