"""Rendu Playwright/Chromium de la maquette « Production » + mesures (getBoundingClientRect) -> metrics.json.
Toutes les valeurs (pistes, niveaux, durées) sont des EXEMPLES."""
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
import pathlib, json, io
p = pathlib.Path(__file__).parent.resolve()
URL = f'file://{p}/index.html'
VP = {'width': 1280, 'height': 720}

MEASURE = '''()=>{
  const R=e=>e.getBoundingClientRect(), r1=v=>Math.round(v*100)/100;
  const sc=document.querySelector('.content'), scb=R(sc), st2=R(document.querySelector('.sticky2'));
  const vis=e=>e.offsetParent!==null;
  const rows=[...document.querySelectorAll('.row')].filter(vis);
  const grps=[...document.querySelectorAll('.grp')];
  const fullRows=rows.filter(r=>{const b=R(r);return b.top>=st2.bottom-1.5&&b.bottom<=scb.bottom+0.5});
  const groupsFull=grps.filter(g=>{const b=R(g);return b.top>=st2.bottom-1.5&&b.bottom<=scb.bottom+0.5});
  const one=rows[0], rb=R(one);
  const ms=[...one.querySelectorAll('.mb')].map(R);
  const kn=[...one.querySelectorAll('.knob')].map(k=>{const b=R(k);return {w:r1(b.width),h:r1(b.height),margin_top:r1(b.top-rb.top),margin_bottom:r1(rb.bottom-b.bottom)}});
  const allMS=rows.flatMap(r=>[...r.querySelectorAll('.mb')].map(R));
  const allKn=rows.flatMap(r=>[...r.querySelectorAll('.knob')].map(k=>{const b=R(k),q=R(k.closest('.row'));return Math.min(b.top-q.top,q.bottom-b.bottom)}));
  const nms=rows.map(r=>r.querySelector('.nm'));
  const tr=nms.filter(n=>n.scrollWidth>n.clientWidth+0.5);
  const longest=nms.map(n=>n.textContent.trim()).sort((a,b)=>b.length-a.length)[0];
  const gh=grps[0]?R(grps[0]).height:null;
  const chev=grps[0]?R(grps[0].querySelector('.chevbtn')):null;
  const gms=grps[0]?[...grps[0].querySelectorAll('.mb')].map(R):[];
  const gfs=grps[0]?getComputedStyle(grps[0].querySelector('.chevbtn')).fontSize:null;
  const acc=rows.map(r=>r.querySelector('.nm')).find(n=>n.textContent.trim().startsWith('Accompagnement'));
  const gr=rows.map(r=>r.querySelector('.nm')).find(n=>n.textContent.trim().startsWith('Guitare rythmique'));
  return {
    density:document.getElementById('prod').dataset.density, mode:document.getElementById('prod').dataset.mode,
    tracks_total:document.querySelectorAll('.row').length, rows_rendered:rows.length,
    row_height_px:[...new Set(rows.map(r=>r1(R(r).height)))],
    ms_button_px:{w:r1(ms[0].width),h:r1(ms[1].height),w_solo:r1(ms[1].width),h_mute:r1(ms[0].height),gap_x:r1(ms[1].left-ms[0].right),same_row:Math.abs(ms[0].top-ms[1].top)<0.5,
                  min_w_all_rows:r1(Math.min(...allMS.map(b=>b.width))),min_h_all_rows:r1(Math.min(...allMS.map(b=>b.height))),
                  pair_total_w:r1(ms[1].right-ms[0].left),pair_total_h:r1(Math.max(ms[0].height,ms[1].height))},
    knobs_px:kn, knob_min_vertical_margin_all_rows:r1(Math.min(...allKn)),
    group_header:grps[0]?{height_px:r1(gh),font_px:gfs,chevron_button:{w:r1(chev.width),h:r1(chev.height)},
        chevron_hit_area_with_pseudo_px:{w:r1(chev.width),h:r1(chev.height+4)},
        ms_visible_px:gms.map(b=>({w:r1(b.width),h:r1(b.height)})),ms_hit_area_px:{w:28,h:r1(gms[0].height+8)}}:null,
    name_column_px:r1(R(one.querySelector('.name')).width),
    name_text_available_px:r1(one.querySelector('.nm').clientWidth),
    longest_name:longest, truncated_names:tr.map(n=>n.textContent.trim()), truncated_have_title:tr.every(n=>!!n.title),
    accompagnement_fits: acc?acc.scrollWidth<=acc.clientWidth:null, guitare_rythmique_fits: gr?gr.scrollWidth<=gr.clientWidth:null,
    rows_fully_visible:fullRows.length, group_headers_fully_visible:groupsFull.length,
    list_scrolls:sc.scrollHeight>sc.clientHeight+1, scroll_height:sc.scrollHeight, client_height:sc.clientHeight,
    list_top_px:Math.round(st2.bottom), viewport_bottom_px:Math.round(scb.bottom),
    toolbar_single_line:R(document.querySelector('.toolbar')).height<=50
  }}'''

def m(pg): return pg.evaluate(MEASURE)

def load(b, hash_):
    pg = b.new_page(viewport=VP)
    pg.on('pageerror', lambda e: print('ERREUR JS', e))
    pg.goto(URL + '#' + hash_); pg.wait_for_timeout(350)
    return pg

def expand_all(pg):
    pg.evaluate("document.querySelectorAll('.chevbtn[aria-expanded=false]').forEach(b=>b.click())"); pg.wait_for_timeout(100)

def zoom_row(b, hash_, name, label, out_img):
    """Capture x3 d'une ligne (nom, gain, pan, M/S) + annotation des tailles mesurées."""
    pg = b.new_page(viewport=VP, device_scale_factor=3)
    pg.goto(URL + '#' + hash_); pg.wait_for_timeout(350)
    info = pg.evaluate('''(name)=>{
      const row=[...document.querySelectorAll('.row')].find(r=>r.querySelector('.nm').textContent.trim().startsWith(name));
      row.scrollIntoView({block:'center'});
      const R=e=>{const b=e.getBoundingClientRect();return [b.left,b.top,b.width,b.height]};
      return {row:R(row),mb:[...row.querySelectorAll('.mb')].map(R),kn:[...row.querySelectorAll('.knob')].map(R),name:R(row.querySelector('.name'))}}''', name)
    pg.evaluate("document.activeElement.blur()"); pg.wait_for_timeout(100)
    rx, ry, rw, rh = info['row']
    pad = 16
    clip = {'x': rx, 'y': ry - pad, 'width': 560, 'height': rh + 2 * pad}
    img = Image.open(io.BytesIO(pg.screenshot(clip=clip))).convert('RGB'); pg.close()
    S = 3
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf', 22)
        fb = ImageFont.truetype('/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf', 26)
    except Exception:
        f = fb = ImageFont.load_default()
    band = 150
    W = img.width; canvas = Image.new('RGB', (W, img.height + band), '#0b0a0e'); canvas.paste(img, (0, band))
    d = ImageDraw.Draw(canvas)
    X = lambda x: (x - rx) * S
    Y = lambda y: (y - (ry - pad)) * S + band
    RED = '#ff5a5a'; YEL = '#ffd76a'; CY = '#6ee7ff'
    d.text((10, 8), label, font=fb, fill='#ffffff')
    d.text((10, 44), 'Valeurs mesurées (getBoundingClientRect), maquette : valeurs d’exemple', font=f, fill='#bdb6cf')
    # M / S
    for bx, col in zip(info['mb'], [YEL, YEL]):
        l, t, w, h = bx
        d.rectangle([X(l), Y(t), X(l + w), Y(t + h)], outline=col, width=3)
    m0, m1 = info['mb']
    ty = Y(m0[1] + m0[3]) + 6
    d.line([X(m0[0]), ty + 8, X(m0[0] + m0[2]), ty + 8], fill=YEL, width=3)
    d.text((X(m0[0]) - 6, ty + 12), f"M {m0[2]:.0f}×{m0[3]:.0f} px", font=f, fill=YEL)
    d.text((X(m1[0]) - 6, ty + 38), f"S {m1[2]:.0f}×{m1[3]:.0f} px", font=f, fill=YEL)
    gap = m1[0] - (m0[0] + m0[2])
    d.text((X(m0[0] + m0[2]) - 40, Y(m0[1]) - 30), f"écart {gap:.0f} px", font=f, fill='#ffffff')
    # knobs
    for k in info['kn']:
        l, t, w, h = k
        d.rectangle([X(l), Y(t), X(l + w), Y(t + h)], outline=CY, width=3)
        d.line([X(l + w) + 8, Y(t), X(l + w) + 8, Y(t + h)], fill=CY, width=3)
        d.text((X(l) - 4, Y(t + h) + 4), f"bouton {w:.0f}×{h:.0f} px", font=f, fill=CY)
    k0 = info['kn'][0]
    mt = k0[1] - ry; mb_ = ry + rh - (k0[1] + k0[3])
    d.line([X(k0[0]) - 10, Y(ry), X(k0[0]) - 10, Y(ry + rh)], fill=RED, width=3)
    d.text((X(k0[0]) - 6, Y(ry) - 30 - 0), f"ligne {rh:.0f} px · marges haut/bas {mt:.0f} / {mb_:.0f} px", font=f, fill=RED)
    # bords de la ligne
    d.line([0, Y(ry), W, Y(ry)], fill=RED, width=1); d.line([0, Y(ry + rh), W, Y(ry + rh)], fill=RED, width=1)
    canvas.save(out_img)
    return info

metrics = {}
with sync_playwright() as pw:
    try: b = pw.chromium.launch()
    except Exception: b = pw.chromium.launch(executable_path='/usr/bin/google-chrome')

    # --- 1. compact, 12 pistes, groupes dépliés (cas défavorable), focus clavier sur le gain de « Chœurs »
    pg = load(b, '12,compact'); expand_all(pg)
    metrics['compact_12_toutes_pistes_depliees'] = m(pg)
    pg.evaluate("document.querySelectorAll('.row')[1].querySelector('.knob').focus()"); pg.wait_for_timeout(100)
    pg.screenshot(path=str(p / 'production-compact-1280x720.png'))
    # comportements clavier : M/S (Espace) et chevron (Entrée)
    pg.evaluate("document.activeElement.blur()")
    pg.focus('.row:nth-of-type(1) .mb.s'); before = pg.evaluate("document.activeElement.getAttribute('aria-pressed')"); pg.keyboard.press('Space')
    after = pg.evaluate("document.activeElement.getAttribute('aria-pressed')"); pg.keyboard.press('Space')
    lab = pg.evaluate("[...document.querySelectorAll('.mb')].map(x=>x.getAttribute('aria-label')).filter(x=>/Chœurs|Voix lead/.test(x))")
    pg.focus('.chevbtn'); e0 = pg.evaluate("document.activeElement.getAttribute('aria-expanded')"); pg.keyboard.press('Enter')
    e1 = pg.evaluate("document.activeElement.getAttribute('aria-expanded')"); pg.keyboard.press('Enter')
    metrics['clavier'] = {'solo_espace_avant_apres': [before, after], 'chevron_entree_avant_apres': [e0, e1], 'aria_labels_exemples': lab}
    pg.close()

    # --- 1b. compact, 12 pistes, groupe Rythmique replié (état par défaut de la démo)
    pg = load(b, '12,compact'); metrics['compact_12_rythmique_replie'] = m(pg)
    # --- 1c. auto 12 pistes (défaut)
    pg2 = load(b, '12'); metrics['auto_12_defaut'] = m(pg2)
    pg2.evaluate("document.activeElement.blur()"); pg2.focus('#estime'); pg2.wait_for_timeout(150)
    pg2.screenshot(path=str(p / 'production-tooltip.png')); pg2.keyboard.press('Escape')
    pg2.focus('#b-assist'); pg2.keyboard.press('Enter'); pg2.wait_for_timeout(150)
    pg2.screenshot(path=str(p / 'production-assistant-popin.png'))
    metrics['popover_ouvert_scroll_possible'] = pg2.evaluate("(()=>{const c=document.querySelector('.content');c.scrollTop=40;return c.scrollTop})()")>=0
    pg2.close(); pg.close()

    # --- 2. confortable manuel, 12 pistes (le choix manuel l'emporte sur Auto)
    pg = load(b, '12,confortable'); pg.evaluate("document.activeElement.blur()")
    metrics['confortable_12_manuel'] = m(pg); pg.screenshot(path=str(p / 'production-confortable-1280x720.png')); pg.close()

    # --- 3. 6 pistes, Auto -> confortable
    pg = load(b, '6'); pg.evaluate("document.activeElement.blur()")
    metrics['auto_6'] = m(pg); pg.screenshot(path=str(p / 'production-6pistes-auto-1280x720.png'))
    # bascule manuelle depuis Auto puis retour
    pg.click('#d-compact'); c1 = pg.evaluate("document.getElementById('prod').dataset.density")
    pg.click('#d-auto'); c2 = pg.evaluate("document.getElementById('prod').dataset.density"); pg.close()
    metrics['bascule_6_pistes'] = {'apres_clic_Compact': c1, 'apres_retour_Auto': c2}

    # --- 4. 16 pistes, Auto -> compact, défilement
    pg = load(b, '16'); pg.evaluate("document.activeElement.blur()")
    metrics['auto_16'] = m(pg); pg.screenshot(path=str(p / 'production-16pistes-auto-1280x720.png'))
    pg.click('#d-conf'); metrics['bascule_16_pistes_confortable_manuel'] = {'density': pg.evaluate("document.getElementById('prod').dataset.density"), 'rows_fully_visible': m(pg)['rows_fully_visible']}
    pg.close()

    # --- 5. zoom x3 : une ligne compacte + une ligne confortable, cotes mesurées
    zc = zoom_row(b, '12,compact', 'Chœurs', 'COMPACT — ligne « Chœurs » (muet), zoom ×3', '/tmp/_zc.png')
    zf = zoom_row(b, '12,confortable', 'Chœurs', 'CONFORTABLE — ligne « Chœurs » (muet), zoom ×3', '/tmp/_zf.png')
    A, B = Image.open('/tmp/_zc.png'), Image.open('/tmp/_zf.png')
    out = Image.new('RGB', (max(A.width, B.width), A.height + B.height + 12), '#0b0a0e'); out.paste(A, (0, 0)); out.paste(B, (0, A.height + 12))
    out.save(p / 'production-zoom-ms.png')
    b.close()

# --- synthèse des critères
c = metrics['compact_12_toutes_pistes_depliees']; f = metrics['confortable_12_manuel']
metrics['criteres'] = {
    'ms_cote_a_cote_compact_ge_28': c['ms_button_px']['same_row'] and c['ms_button_px']['min_w_all_rows'] >= 28 and c['ms_button_px']['min_h_all_rows'] >= 28,
    'ms_cote_a_cote_confortable_ge_32': f['ms_button_px']['same_row'] and f['ms_button_px']['min_w_all_rows'] >= 32 and f['ms_button_px']['min_h_all_rows'] >= 32,
    'marge_verticale_bouton_rotatif_ge_4_compact': c['knob_min_vertical_margin_all_rows'] >= 4,
    'marge_verticale_bouton_rotatif_ge_4_confortable': f['knob_min_vertical_margin_all_rows'] >= 4,
    'compact_12_pistes_ge_8_lignes_completes': c['rows_fully_visible'] >= 8,
    'auto_6_confortable_72': metrics['auto_6']['density'] == 'confortable' and metrics['auto_6']['row_height_px'] == [72],
    'auto_16_compact_defilement': metrics['auto_16']['density'] == 'compact' and metrics['auto_16']['list_scrolls'],
}
(p / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(metrics, ensure_ascii=False, indent=1))
