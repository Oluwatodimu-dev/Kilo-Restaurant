#!/usr/bin/env python3
"""Builds PREVIEW.html: the whole website + admin in ONE file you can double-click.
Optional developer tool (needs Python 3 + Pillow). The prebuilt PREVIEW.html is already included."""
import re, json, base64, io, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
rd = lambda p: open(p, encoding='utf-8').read()

seed = json.load(open(P('public', 'assets', 'default-data.json'), encoding='utf-8'))
# preview-only sample content (the real site ships without fake reviews/staff/stats/contact details)
_x = json.load(open(P('tools', 'preview-extras.json'), encoding='utf-8'))
seed['team'] = _x['team']; seed['reviews'] = _x['reviews']; seed['settings']['stats'] = _x['stats']
seed['settings']['contact'].update(_x['contact']); seed['settings']['announcement'].update(_x['announcement'])
seed_txt = json.dumps(seed, ensure_ascii=False)

# ---- images -> data URIs
def data_uri(path, maxside, q=72):
    im = Image.open(path)
    if path.lower().endswith('.png'):
        im = im.convert('RGBA'); im.thumbnail((maxside, maxside)); b = io.BytesIO(); im.save(b, 'PNG', optimize=True); mime = 'image/png'
    else:
        im = im.convert('RGB'); im.thumbnail((maxside, maxside)); b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, progressive=True); mime = 'image/jpeg'
    return 'data:%s;base64,%s' % (mime, base64.b64encode(b.getvalue()).decode())

refs = sorted(set(re.findall(r'assets/img/[\w.\-]+', seed_txt)) | {'assets/img/favicon-32.png'})
imgmap = {}
for r in refs:
    f = P('public', r)
    if os.path.exists(f):
        side = 1500 if r.endswith(('hero.jpg',)) else 1000 if 'feast' in r else 760
        imgmap[r] = data_uri(f, 160 if 'logo' in r or 'favicon' in r else side)

# ---- CSS scoping for the admin
def split_top(s):
    parts, depth, cur = [], 0, ''
    for ch in s:
        if ch in '([': depth += 1
        if ch in ')]': depth -= 1
        if ch == ',' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur); return parts

def scope(css, pre):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    def msel(s):
        s = s.strip()
        if s == ':root': return pre
        if s == 'body': return pre
        if s == '*': return pre + ' *'
        if s.startswith('[data-theme=dark]'):
            rest = s[len('[data-theme=dark]'):].strip(); return '[data-theme=dark] ' + pre + (' ' + rest if rest else '')
        return pre + ' ' + s
    def parse(block):
        res, pos = [], 0
        rx = re.compile(r'\s*([^{}]+)\{')
        while pos < len(block):
            m = rx.match(block, pos)
            if not m: break
            sel = m.group(1).strip(); start = m.end(); depth = 1; j = start
            while depth:
                depth += (block[j] == '{') - (block[j] == '}'); j += 1
            body = block[start:j - 1]; pos = j
            if sel.startswith(('@media', '@supports')): res.append(sel + '{' + parse(body) + '}')
            elif sel.startswith('@'): res.append(sel + '{' + body + '}')
            else: res.append(','.join(msel(x) for x in split_top(sel)) + '{' + body + '}')
        return ''.join(res)
    return parse(css)

site_css = rd(P('public', 'assets', 'css', 'site.css'))
admin_css = scope(rd(P('public', 'admin', 'admin.css')), '#adminRoot')
admin_css += "#adminRoot{position:fixed;inset:0;overflow:auto;z-index:6000;padding-top:env(safe-area-inset-top,0px)}#adminRoot[hidden]{display:none}#adminRoot .app{min-height:100%}"
extra_css = ".demobar{background:#14100d;color:#f1e6d8;font:500 .8rem/1.3 Inter,system-ui,sans-serif;padding:7px 14px;text-align:center;position:relative;z-index:1100}.demobar a,.demobar button{color:#ffb98f;font:inherit;font-weight:700;background:none;border:0;padding:0;margin:0 4px;text-decoration:underline;cursor:pointer}"

# ---- HTML bodies
def body_of(html):
    b = html[re.search(r'<body[^>]*>', html).end(): html.rindex('</body>')]
    b = re.sub(r'<script[^>]*src=[^>]*></script>', '', b)
    b = re.sub(r'<script type="application/json" id="site-data">.*?</script>', '<script type="application/json" id="site-data"></script>', b, flags=re.S)
    return b
site_body = body_of(rd(P('public', 'index.html')))
admin_body = body_of(rd(P('public', 'admin', 'index.html')))
admin_body = admin_body.replace('id="toast"', 'id="atoast"').replace('<a href="/" target="_blank" rel="noopener">View live site ↗</a>', '<a href="#top">← Back to website</a>')
admin_body = admin_body.replace('../assets/img/logo.png', imgmap.get('assets/img/logo.png', ''))
site_body = re.sub(r'(src|href)="assets/img/([\w.\-]+)"', lambda m: '%s="%s"' % (m.group(1), imgmap.get('assets/img/' + m.group(2), m.group(0)[len(m.group(1)) + 2:-1])), site_body)

admin_js = rd(P('public', 'admin', 'admin.js')).replace("$('#toast')", "$('#atoast')").replace('kk_admin_theme', 'kk_theme')
admin_js = admin_js.replace('<a class="btn sm" href="/" target="_blank" rel="noopener">View site ↗</a>', '<a class="btn sm" href="#top">View website</a>')
site_js = rd(P('public', 'assets', 'js', 'site.js'))
demo_js = rd(P('tools', 'demo-api.js'))
for name, js in (('site', site_js), ('admin', admin_js), ('demo', demo_js)):
    assert '</script' not in js.replace('<\\/script', ''), name

glue = r"""
(function () {
  const site = document.getElementById('siteRoot'), adm = document.getElementById('adminRoot'); let booted = false; const siteTitle = document.title;
  const bar = document.createElement('div'); bar.className = 'demobar';
  bar.innerHTML = '🔍 <b>Preview mode</b> · everything works, data is saved only in this browser · <a href="#admin-dashboard">Open admin dashboard</a> · <button id="demoReset" type="button">Reset demo</button>';
  const tf = site.querySelector('.top-fixed'); tf.insertBefore(bar, tf.firstChild); document.getElementById('demoReset').onclick = () => { if (bar.dataset.arm) window.__demoReset(); else { bar.dataset.arm = '1'; const b = document.getElementById('demoReset'); b.textContent = 'Click again to confirm reset'; setTimeout(() => { delete bar.dataset.arm; b.textContent = 'Reset demo'; }, 4000); } };
  function sync() {
    const isAdmin = location.hash.indexOf('#admin') === 0; site.hidden = isAdmin; adm.hidden = !isAdmin;
    if (isAdmin) { document.documentElement.style.overflow = 'hidden'; if (!booted) { booted = true; window.__adminBoot(); decorate(); } }
    else { document.documentElement.style.overflow = ''; document.title = siteTitle; const t = location.hash.length > 1 && document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }
  function decorate() {
    const lo = document.getElementById('logoutBtn'); lo.textContent = 'Exit admin'; lo.onclick = () => { location.hash = '#top'; };
    const tr = document.querySelector('#adminRoot .top-right'); if (tr && !document.getElementById('pvBadge')) { const b = document.createElement('span'); b.id = 'pvBadge'; b.className = 'bdg b-gray'; b.textContent = 'Preview mode'; tr.prepend(b); }
  }
  window.addEventListener('hashchange', sync); window.addEventListener('kk-demo-quota', () => { const t = document.createElement('div'); t.className = 'demobar'; t.textContent = 'Preview storage is full. Use smaller images or press Reset demo.'; tf.insertBefore(t, tf.firstChild); setTimeout(() => t.remove(), 6000); }); sync();
})();
"""
theme_js = "(function(){try{var t=localStorage.getItem('kk_theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){}})();"
esc_js = lambda s: s.replace('</', '<\\/')

html = f"""<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{seed['settings']['seo']['title']}</title>
<meta name="description" content="{seed['settings']['seo']['description']}">
<link rel="icon" href="{imgmap.get('assets/img/favicon-32.png','')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>:root{{--accent:{seed['settings']['theme']['accent']}}}
{site_css}
{admin_css}
{extra_css}</style>
<script>{theme_js}</script>
</head>
<body>
<div id="siteRoot">{site_body.split('<div class="toast" id="toast"')[0] if False else site_body}</div>
<div id="adminRoot" hidden>{admin_body}</div>
<script>window.__SEED={esc_js(seed_txt)};window.__IMGMAP={esc_js(json.dumps(imgmap))};window.__LAZY_ADMIN=true;window.__ADMIN_PFX='#admin-';</script>
<script>{esc_js(demo_js)}</script>
<script>{esc_js(site_js)}</script>
<script>{esc_js(admin_js)}</script>
<script>{esc_js(glue)}</script>
</body>
</html>"""
html = re.sub(r'\{\{[A-Z_]+\}\}', '', html)
out = P('PREVIEW.html'); open(out, 'w', encoding='utf-8').write(html)
print('PREVIEW.html: %.2f MB, %d images embedded' % (len(html.encode()) / 1e6, len(imgmap)))
