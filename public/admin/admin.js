/* Kilo Kitchen admin. Vanilla JS, schema-driven. */
(function () {
  'use strict';
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PFX = window.__ADMIN_PFX || '#/';
  const U = (p) => (p && window.__IMGMAP && window.__IMGMAP[p]) || (p && p.startsWith('assets') ? '/' + p : p || '');
  const scroller = () => (window.__LAZY_ADMIN ? $('#adminRoot') : window);
  let DB = null, csrf = '', current = 'dashboard', lastPulse = null, pulseT;
  const view = $('#view');

  /* ---------- Theme ---------- */
  try { document.documentElement.dataset.theme = localStorage.getItem('kk_admin_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { /* ignore */ }
  $('#themeA').onclick = () => { const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; try { localStorage.setItem('kk_admin_theme', n); } catch (e) { /* ignore */ } };


  /* ---------- In-app confirm (native confirm() is blocked in sandboxed pages) ---------- */
  function ask(message, okLabel, danger) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog'); d.className = 'dlg'; d.style.width = 'min(440px,calc(100% - 24px))';
      d.innerHTML = `<div class="dlg-head"><h2>Please confirm</h2></div><div class="dlg-body"><p style="margin:0">${esc(message)}</p></div><div class="dlg-foot"><button type="button" class="btn" data-no>Cancel</button><button type="button" class="btn ${danger === false ? 'primary' : 'danger'}" data-yes>${esc(okLabel || 'Yes, continue')}</button></div>`;
      (($('#app') || document.body).parentElement || document.body).appendChild(d);
      let out = false; const done = (v) => { out = v; d.close(); };
      $('[data-yes]', d).onclick = () => done(true); $('[data-no]', d).onclick = () => done(false);
      d.addEventListener('close', () => { d.remove(); resolve(out); }); d.addEventListener('click', (e) => { if (e.target === d) done(false); });
      d.showModal(); $('[data-no]', d).focus();
    });
  }

  /* ---------- API ---------- */
  async function call(method, url, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-csrf': csrf }, body: body ? JSON.stringify(body) : undefined });
    let d = {}; try { d = await r.json(); } catch (e) { /* none */ }
    if (r.status === 401 && !url.includes('login')) { showAuth(); throw new Error('Please sign in again.'); }
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }
  let toastT;
  function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.classList.toggle('bad', !!bad); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }

  /* ---------- Helpers ---------- */
  const cur = () => DB.settings.currency || '$';
  const money = (n) => cur() + (Math.round(n * 100) / 100).toFixed(2);
  const tz = () => DB.settings.timezone || 'UTC';
  const dayKey = (d) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d)); } catch (e) { return new Date(d).toISOString().slice(0, 10); } };
  const fmtDT = (iso) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz(), day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return iso; } };
  const label = (s) => String(s).replace(/_/g, ' ');
  const badge = (s) => `<span class="bdg s-${esc(s)}">${esc(label(s))}</span>`;
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const ks = p.split('.'); ks.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); o[ks[ks.length - 1]] = v; };
  const catName = (id) => (DB.categories.find((c) => c.id === id) || {}).name || '–';

  /* ---------- Auth ---------- */
  let authing = false;
  function showAuth() { $('#app').hidden = true; $('#auth').hidden = false; clearInterval(pulseT); if (!authing) { authing = true; boot().finally(() => { authing = false; }); } }
  async function boot() {
    const st = await (await fetch('/api/admin/state')).json();
    if (st.authed) { csrf = st.csrf; return start(); }
    const setup = !st.setup; $('#auth').hidden = false;
    $('#authTitle').textContent = setup ? 'Create your admin account' : 'Sign in';
    $('#authSub').textContent = setup ? 'First-time setup. Choose a strong password (10+ characters).' : 'Kilo Kitchen admin';
    $('#pw2Wrap').hidden = !setup; $('#keyWrap').hidden = !(setup && st.needsKey); $('#authBtn').textContent = setup ? 'Create account' : 'Sign in';
    $('input[name=password]').autocomplete = setup ? 'new-password' : 'current-password';
    $('#authForm').onsubmit = async (e) => {
      e.preventDefault(); const f = e.currentTarget, m = $('#authMsg'); m.textContent = ''; m.className = 'msg';
      if (setup && f.password.value !== f.password2.value) { m.textContent = 'Passwords do not match.'; m.classList.add('bad'); return; }
      try { const r = await call('POST', setup ? '/api/admin/setup' : '/api/admin/login', { email: f.email.value, password: f.password.value, key: f.key.value }); csrf = r.csrf; f.reset(); $('#auth').hidden = true; start(); }
      catch (err) { m.textContent = err.message; m.classList.add('bad'); }
    };
  }
  $('#logoutBtn').onclick = async () => { try { await call('POST', '/api/admin/logout', {}); } catch (e) { /* ignore */ } location.reload(); };

  async function start() {
    DB = await call('GET', '/api/admin/data'); $('#app').hidden = false; $('#auth').hidden = true; $('#sideName').textContent = DB.settings.brand.name;
    document.documentElement.style.setProperty('--accent', DB.settings.theme.accent);
    renderNav(); route(); lastPulse = null; pulse(); clearInterval(pulseT); pulseT = setInterval(pulse, 15000);
  }
  async function refresh() { DB = await call('GET', '/api/admin/data'); renderNav(); }


  /* ---------- Downloads (CSV / backup) ---------- */
  async function download(route, filename) {
    try {
      const r = await fetch('/api/admin/' + route, { headers: { 'x-csrf': csrf } }); if (!r.ok) throw new Error('Download failed');
      const blob = await r.blob(), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Downloaded ' + filename);
    } catch (e) { toast(e.message, true); }
  }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-dl]'); if (!b) return; const r = b.dataset.dl; download(r, r === 'backup' ? 'kilo-backup-' + new Date().toISOString().slice(0, 10) + '.json' : r); if (r === 'backup') { try { localStorage.setItem('kk_last_backup', String(Date.now())); } catch (x) { /* ignore */ } } });

  /* ---------- Nav & router ---------- */
  const NAV = [['dashboard', 'Dashboard'], ['h', 'Operations'], ['orders', 'Orders'], ['reservations', 'Reservations'], ['messages', 'Messages'], ['h', 'Content'], ['menu', 'Menu'], ['categories', 'Categories'], ['promos', 'Promo codes'], ['team', 'Team'], ['reviews', 'Reviews'], ['gallery', 'Gallery'], ['faq', 'FAQ'], ['h', 'Grow'], ['subscribers', 'Subscribers'], ['h', 'Setup'], ['settings', 'Settings']];
  function badgeCount(k) {
    if (!DB) return 0;
    if (k === 'orders') return DB.orders.filter((o) => o.status === 'new').length;
    if (k === 'reservations') return DB.reservations.filter((r) => r.status === 'new').length;
    if (k === 'messages') return DB.messages.filter((m) => !m.read).length; return 0;
  }
  function renderNav() {
    $('#sideNav').innerHTML = NAV.map(([k, t]) => k === 'h' ? `<div class="nav-h">${t}</div>` : `<a class="nav-a ${k === current ? 'on' : ''}" href="${PFX}${k}">${t}${badgeCount(k) ? `<span class="n">${badgeCount(k)}</span>` : ''}</a>`).join('');
    const total = badgeCount('orders') + badgeCount('reservations') + badgeCount('messages'); document.title = (total ? '(' + total + ') ' : '') + 'Admin · ' + DB.settings.brand.name;
  }
  function route() {
    current = ((location.hash.startsWith(PFX) ? location.hash.slice(PFX.length) : '') || 'dashboard').split('?')[0]; if (!NAV.some((n) => n[0] === current) || current === 'h') current = 'dashboard';
    $('#side').classList.remove('open'); renderNav(); $('#pageTitle').textContent = (NAV.find((n) => n[0] === current) || [0, 'Dashboard'])[1];
    (VIEWS[current] || VIEWS.dashboard)(); scroller().scrollTo(0, 0);
  }
  addEventListener('hashchange', () => DB && (location.hash.startsWith(PFX) || !window.__LAZY_ADMIN) && route());
  $('#sideToggle').onclick = () => $('#side').classList.toggle('open');

  /* ---------- Live pulse ---------- */
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .5); o.start(); o.stop(a.currentTime + .5); } catch (e) { /* blocked */ } }
  async function pulse() {
    try {
      const p = await call('GET', '/api/admin/pulse'); $('#liveDot').style.opacity = 1;
      if (lastPulse && (p.orders > lastPulse.orders || p.reservations > lastPulse.reservations || p.messages > lastPulse.messages)) {
        beep(); toast(p.orders > lastPulse.orders ? '🔔 New order received!' : p.reservations > lastPulse.reservations ? '📅 New reservation' : '✉️ New message');
        await refresh(); if (['dashboard', 'orders', 'reservations', 'messages'].includes(current) && !$('#dlg').open) (VIEWS[current])();
      }
      lastPulse = p;
    } catch (e) { $('#liveDot').style.opacity = .3; }
  }

  /* ---------- Dialog + form engine ---------- */
  const dlg = $('#dlg');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('[data-x]', dlg).onclick = () => dlg.close();

  function fieldHtml(f, val) {
    const name = esc(f.k), v = val == null ? '' : val, req = f.req ? ' required' : '', hint = f.hint ? `<div class="hint">${f.hint}</div>` : '';
    switch (f.t) {
      case 'checkbox': return `<div class="fld"><label class="chk"><span class="sw"><input type="checkbox" name="${name}" ${val ? 'checked' : ''}><i></i></span>${esc(f.label)}</label>${hint}</div>`;
      case 'textarea': return `<label class="fld">${esc(f.label)}<textarea name="${name}" rows="${f.rows || 3}"${req}>${esc(v)}</textarea>${hint}</label>`;
      case 'lines': return `<label class="fld">${esc(f.label)}<textarea name="${name}" rows="${f.rows || 4}">${esc((val || []).join('\n'))}</textarea>${hint}</label>`;
      case 'pairs': return `<label class="fld">${esc(f.label)}<textarea name="${name}" rows="${f.rows || 4}">${esc((val || []).map((x) => x.value + ' | ' + x.label).join('\n'))}</textarea>${hint}</label>`;
      case 'triples': return `<label class="fld">${esc(f.label)}<textarea name="${name}" rows="${f.rows || 4}">${esc((val || []).map((x) => [x.icon, x.title, x.text].join(' | ')).join('\n'))}</textarea>${hint}</label>`;
      case 'select': return `<label class="fld">${esc(f.label)}<select name="${name}"${req}>${f.opts().map((o) => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>${hint}</label>`;
      case 'multi': return `<div class="fld">${esc(f.label)}<div class="multi">${f.opts.map((o) => `<label><input type="checkbox" name="${name}" value="${esc(o)}" ${(val || []).includes(o) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>${hint}</div>`;
      case 'image': return `<div class="fld">${esc(f.label)}<div class="imgf"><img class="prev" src="${esc(U(v))}" alt=""><input type="text" name="${name}" value="${esc(v)}" placeholder="Paste a link or upload"><label class="btn sm">Upload<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-up></label></div>${hint}</div>`;
      case 'color': return `<label class="fld">${esc(f.label)}<input type="color" name="${name}" value="${esc(v || '#E0521B')}">${hint}</label>`;
      case 'tz': return `<label class="fld">${esc(f.label)}<input name="${name}" list="tzList" value="${esc(v)}" autocomplete="off"><datalist id="tzList">${(Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC']).map((z) => `<option>${z}</option>`).join('')}</datalist>${hint}</label>`;
      default: return `<label class="fld">${esc(f.label)}<input name="${name}" type="${f.t || 'text'}" value="${esc(v)}"${f.step ? ` step="${f.step}"` : ''}${f.t === 'number' ? ' min="0"' : ''}${req}>${hint}</label>`;
    }
  }
  function layout(fields, valuesFn) {
    let html = '', buf = [];
    const flush = () => { if (buf.length) { html += `<div class="g${buf.length > 2 ? 3 : 2}">${buf.join('')}</div>`; buf = []; } };
    fields.forEach((f) => { const h = fieldHtml(f, valuesFn(f)); if (f.half) { buf.push(h); if (buf.length === (f.half === 3 ? 3 : 2)) flush(); } else { flush(); html += h; } });
    flush(); return html;
  }
  function collect(fields, root) {
    const out = {};
    fields.forEach((f) => {
      const els = $$(`[name="${f.k}"]`, root); if (!els.length) return; const el = els[0]; let v;
      if (f.t === 'checkbox') v = el.checked;
      else if (f.t === 'multi') v = els.filter((x) => x.checked).map((x) => x.value);
      else if (f.t === 'number') v = parseFloat(el.value) || 0;
      else if (f.t === 'lines') v = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else if (f.t === 'pairs') v = el.value.split('\n').map((s) => s.split('|').map((x) => x.trim())).filter((a) => a[0]).map((a) => ({ value: a[0], label: a[1] || '' }));
      else if (f.t === 'triples') v = el.value.split('\n').map((s) => s.split('|').map((x) => x.trim())).filter((a) => a[0]).map((a) => a.length >= 3 ? { icon: a[0], title: a[1], text: a[2] } : { icon: '✦', title: a[0], text: a[1] || '' });
      else if (f.t === 'tips') v = el.value.split(/[\s,]+/).filter(Boolean).map(Number);
      else v = el.value;
      setP(out, f.k, v);
    });
    return out;
  }
  // image upload (client-side resize)
  async function toBase64(file) {
    const raw = () => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    if (file.type === 'image/gif' || file.size < 700 * 1024) return raw();
    const bmp = await createImageBitmap(file), max = 1800, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', .86)); return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  document.addEventListener('change', async (e) => {
    const inp = e.target; if (!inp.matches || !inp.matches('input[type=file][data-up]')) return; const file = inp.files[0]; if (!file) return;
    const box = inp.closest('.imgf'), btn = inp.closest('label'); const old = btn.firstChild.textContent; btn.firstChild.textContent = 'Uploading…';
    try { const data = await toBase64(file); const r = await call('POST', '/api/admin/upload', { data }); const t = $('input[type=text]', box); t.value = r.url; $('.prev', box).src = r.url; toast('Image uploaded'); }
    catch (err) { toast(err.message || 'Upload failed', true); } finally { btn.firstChild.textContent = old; inp.value = ''; }
  });
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('.imgf input[type=text]')) { const v = e.target.value; $('.prev', e.target.closest('.imgf')).src = U(v); } });

  function formModal({ title, fields, values, saveLabel, onSave, extra }) {
    $('#dlgTitle').textContent = title;
    $('#dlgBody').innerHTML = layout(fields, (f) => getP(values || {}, f.k)) + '<p class="msg bad" id="dlgMsg"></p>';
    $('#dlgFoot').innerHTML = `${extra || ''}<button type="button" class="btn" data-x2>Cancel</button><button class="btn primary" id="dlgSave">${saveLabel || 'Save'}</button>`;
    $('[data-x2]', dlg).onclick = () => dlg.close();
    $('#dlgForm').onsubmit = async (e) => {
      e.preventDefault(); const form = $('#dlgBody'); const bad = $$('[required]', form).find((x) => !x.value.trim());
      if (bad) { $('#dlgMsg').textContent = 'Please fill in the required fields.'; bad.focus(); return; }
      const b = $('#dlgSave'); b.disabled = true;
      try { await onSave(collect(fields, form)); dlg.close(); } catch (err) { $('#dlgMsg').textContent = err.message; } finally { b.disabled = false; }
    };
    if (!dlg.open) dlg.showModal();
  }

  /* ---------- Generic CRUD resources ---------- */
  const DIETS = ['V', 'VG', 'GF', 'Halal', 'Spicy'];
  const RES = {
    menu: { title: 'dish', add: 'Add dish', empty: 'No dishes yet.', fields: () => [
      { k: 'name', t: 'text', label: 'Name', req: true }, { k: 'desc', t: 'textarea', label: 'Description' },
      { k: 'price', t: 'number', step: '0.01', label: 'Price (' + cur() + ')', half: 1 }, { k: 'cat', t: 'select', label: 'Category', half: 1, opts: () => DB.categories.map((c) => [c.id, c.name]) },
      { k: 'img', t: 'image', label: 'Photo' }, { k: 'tag', t: 'text', label: 'Tag (e.g. Signature, Spicy)', half: 1 }, { k: 'calories', t: 'number', label: 'Calories (optional)', half: 1 },
      { k: 'diet', t: 'multi', label: 'Dietary labels', opts: DIETS }, { k: 'available', t: 'checkbox', label: 'Available to order' }, { k: 'featured', t: 'checkbox', label: 'Featured' }],
      defaults: () => ({ available: true, price: 0, cat: (DB.categories[0] || {}).id, diet: [] }) },
    categories: { title: 'category', add: 'Add category', fields: () => [{ k: 'name', t: 'text', label: 'Category name', req: true }], defaults: () => ({}) },
    promos: { title: 'promo code', add: 'Add promo code', fields: () => [
      { k: 'code', t: 'text', label: 'Code (letters and numbers)', req: true, half: 1 }, { k: 'type', t: 'select', label: 'Type', half: 1, opts: () => [['percent', 'Percent off'], ['fixed', 'Fixed amount off']] },
      { k: 'value', t: 'number', step: '0.01', label: 'Value', half: 1 }, { k: 'min', t: 'number', step: '0.01', label: 'Minimum order', half: 1 }, { k: 'note', t: 'text', label: 'Internal note' }, { k: 'active', t: 'checkbox', label: 'Active' }], defaults: () => ({ active: true, type: 'percent', value: 10 }) },
    team: { title: 'team member', add: 'Add team member', fields: () => [{ k: 'name', t: 'text', label: 'Name', req: true, half: 1 }, { k: 'role', t: 'text', label: 'Role', half: 1 }, { k: 'bio', t: 'textarea', label: 'Short bio' }, { k: 'img', t: 'image', label: 'Photo' }], defaults: () => ({}) },
    reviews: { title: 'review', add: 'Add review', fields: () => [{ k: 'name', t: 'text', label: 'Guest name', req: true, half: 1 }, { k: 'role', t: 'text', label: 'Subtitle (e.g. Birthday dinner)', half: 1 }, { k: 'text', t: 'textarea', label: 'Review', req: true }, { k: 'rating', t: 'select', label: 'Rating', half: 1, opts: () => [5, 4, 3, 2, 1].map((n) => [n, n + ' stars']) }, { k: 'img', t: 'image', label: 'Guest photo (optional)' }, { k: 'visible', t: 'checkbox', label: 'Show on website' }], defaults: () => ({ rating: 5, visible: true }) },
    gallery: { title: 'photo', add: 'Add photo', fields: () => [{ k: 'src', t: 'image', label: 'Photo', req: true }, { k: 'alt', t: 'text', label: 'Description (for accessibility)' }], defaults: () => ({}) },
    faq: { title: 'question', add: 'Add question', fields: () => [{ k: 'q', t: 'text', label: 'Question', req: true }, { k: 'a', t: 'textarea', label: 'Answer', req: true, rows: 4 }], defaults: () => ({}) }
  };
  const COLS = {
    menu: (r) => [`<img class="th" src="${esc(U(r.img))}" alt="">`, `<b>${esc(r.name)}</b><div class="muted tiny">${esc(r.tag)}</div>`, esc(catName(r.cat)), money(r.price), `<label class="sw" title="Available"><input type="checkbox" data-avail="${r.id}" ${r.available ? 'checked' : ''}><i></i></label>`],
    categories: (r) => [`<b>${esc(r.name)}</b>`, DB.menu.filter((m) => m.cat === r.id).length + ' dishes'],
    promos: (r) => [`<span class="code">${esc(r.code)}</span>`, r.type === 'percent' ? r.value + '% off' : money(r.value) + ' off', r.min ? 'Min ' + money(r.min) : '–', r.active ? '<span class="bdg b-ok">Active</span>' : '<span class="bdg b-gray">Off</span>'],
    team: (r) => [`<img class="th" src="${esc(U(r.img))}" alt="">`, `<b>${esc(r.name)}</b>`, esc(r.role)],
    reviews: (r) => [`<b>${esc(r.name)}</b>`, '★'.repeat(r.rating), `<span class="muted">${esc(r.text.slice(0, 70))}…</span>`, r.visible ? '<span class="bdg b-ok">Shown</span>' : '<span class="bdg b-gray">Hidden</span>'],
    gallery: (r) => [`<img class="th" src="${esc(U(r.src))}" alt="">`, esc(r.alt)],
    faq: (r) => [`<b>${esc(r.q)}</b>`, `<span class="muted">${esc(r.a.slice(0, 80))}…</span>`]
  };
  const HEADS = { menu: ['', 'Dish', 'Category', 'Price', 'Available'], categories: ['Name', 'Items'], promos: ['Code', 'Discount', 'Minimum', 'Status'], team: ['', 'Name', 'Role'], reviews: ['Guest', 'Rating', 'Review', 'Status'], gallery: ['', 'Description'], faq: ['Question', 'Answer'] };
  const crudState = { menuCat: 'all', menuQ: '' };

  function crudView(name) {
    const R = RES[name]; let rows = DB[name];
    if (name === 'menu') rows = rows.filter((r) => (crudState.menuCat === 'all' || r.cat === crudState.menuCat) && (!crudState.menuQ || (r.name + r.desc).toLowerCase().includes(crudState.menuQ.toLowerCase())));
    const bar = `<div class="bar"><button class="btn primary" id="addBtn">+ ${R.add}</button>${name === 'menu' ? `<input type="search" id="mq" placeholder="Search dishes" value="${esc(crudState.menuQ)}"><select id="mc"><option value="all">All categories</option>${DB.categories.map((c) => `<option value="${esc(c.id)}" ${crudState.menuCat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}<span class="muted tiny grow right">${rows.length} item${rows.length === 1 ? '' : 's'}${name !== 'menu' && name !== 'promos' ? ' · order here is the order on the site' : ''}</span></div>`;
    const reorder = name !== 'promos' && !(name === 'menu' && (crudState.menuCat !== 'all' || crudState.menuQ));
    view.innerHTML = bar + `<div class="card tw">${rows.length ? `<table class="tbl"><thead><tr>${HEADS[name].map((h) => `<th>${h}</th>`).join('')}<th class="right">Actions</th></tr></thead><tbody>${rows.map((r) => `<tr data-id="${esc(r.id)}">${COLS[name](r).map((c) => `<td>${c}</td>`).join('')}<td class="right" style="white-space:nowrap">${reorder ? '<button class="btn sm ghost" data-up aria-label="Move up">↑</button> <button class="btn sm ghost" data-down aria-label="Move down">↓</button> ' : ''}<button class="btn sm" data-edit>Edit</button> <button class="btn sm danger" data-del>Delete</button></td></tr>`).join('')}</tbody></table>` : `<div class="empty">${R.empty || 'Nothing here yet.'} Click "${R.add}" to start.</div>`}</div>`;
    $('#addBtn').onclick = () => formModal({ title: R.add, fields: R.fields(), values: R.defaults(), onSave: async (v) => { await call('POST', '/api/admin/' + name, v); await refresh(); crudView(name); toast('Saved'); } });
    if (name === 'menu') { $('#mq').oninput = (e) => { crudState.menuQ = e.target.value; crudView(name); const i = $('#mq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }; $('#mc').onchange = (e) => { crudState.menuCat = e.target.value; crudView(name); }; }
    view.onclick = async (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = tr.dataset.id, rec = DB[name].find((x) => x.id === id);
      if (e.target.closest('[data-edit]')) formModal({ title: 'Edit ' + R.title, fields: R.fields(), values: rec, onSave: async (v) => { await call('PUT', `/api/admin/${name}/${id}`, v); await refresh(); crudView(name); toast('Saved'); } });
      else if (e.target.closest('[data-del]')) { if (!(await ask('Delete this ' + R.title + '? This cannot be undone.', 'Delete'))) return; try { await call('DELETE', `/api/admin/${name}/${id}`); await refresh(); crudView(name); toast('Deleted'); } catch (err) { toast(err.message, true); } }
      else if (e.target.closest('[data-up],[data-down]')) { const ids = DB[name].map((x) => x.id), i = ids.indexOf(id), j = e.target.closest('[data-up]') ? i - 1 : i + 1; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; await call('PUT', `/api/admin/${name}/order`, { ids }); await refresh(); crudView(name); }
    };
    view.onchange = async (e) => { const a = e.target.closest('[data-avail]'); if (!a) return; const rec = DB.menu.find((x) => x.id === a.dataset.avail); try { await call('PUT', '/api/admin/menu/' + rec.id, Object.assign({}, rec, { available: a.checked })); rec.available = a.checked; toast(rec.name + (a.checked ? ' is available' : ' marked sold out')); } catch (err) { a.checked = !a.checked; toast(err.message, true); } };
  }

  /* ---------- Orders ---------- */
  const ACTIVE = ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];
  let ordFilter = 'active'; const openOrd = new Set();
  const NEXT = (o) => ({ new: ['confirmed', 'Confirm'], confirmed: ['preparing', 'Start preparing'], preparing: o.type === 'delivery' ? ['out_for_delivery', 'Out for delivery'] : ['ready', 'Mark ready'], ready: ['completed', 'Complete'], out_for_delivery: ['completed', 'Delivered'] }[o.status]);
  function printOrder(o) {
    const w = window.open('', '_blank', 'width=380,height=640'); if (!w) { toast('Allow pop-ups to print', true); return; }
    w.document.write(`<title>Order ${esc(o.ref)}</title><body style="font-family:monospace;width:300px"><h2 style="margin:0">${esc(DB.settings.brand.name)}</h2><p>#${esc(o.ref)} · ${esc(o.type.toUpperCase())}<br>${esc(fmtDT(o.createdAt))}<br>When: ${esc(o.when)}</p><hr><b>${esc(o.name)}</b><br>${esc(o.phone)}<br>${esc(o.address || '')}<hr>${o.items.map((i) => `${i.qty} x ${esc(i.name)}${i.note ? '<br>&nbsp;&nbsp;<i>' + esc(i.note) + '</i>' : ''}`).join('<br>')}<hr>${o.notes ? 'Notes: ' + esc(o.notes) + '<hr>' : ''}Subtotal ${money(o.sub)}<br>${o.discount ? 'Promo -' + money(o.discount) + '<br>' : ''}Tax ${money(o.tax)}<br>${o.delivery ? 'Delivery ' + money(o.delivery) + '<br>' : ''}${o.tip ? 'Tip ' + money(o.tip) + '<br>' : ''}<b>TOTAL ${money(o.total)}</b><br>Pay: ${esc(o.pay)}<script>onload=()=>print()<\/script>`); w.document.close();
  }
  async function setStatus(coll, id, status) { try { const r = await call('PATCH', `/api/admin/${coll}/${id}`, { status }); Object.assign(DB[coll].find((x) => x.id === id), r.record); renderNav(); VIEWS[current](); toast('Status updated'); } catch (e) { toast(e.message, true); } }
  function ordersView() {
    const list = DB.orders.filter((o) => ordFilter === 'all' || (ordFilter === 'active' ? ACTIVE.includes(o.status) : o.status === ordFilter));
    const cnt = (f) => DB.orders.filter((o) => f === 'active' ? ACTIVE.includes(o.status) : o.status === f).length;
    view.innerHTML = `<div class="bar"><div class="tabs" style="margin:0">${[['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, t]) => `<button class="tab ${ordFilter === k ? 'on' : ''}" data-f="${k}">${t}${k !== 'all' ? ' (' + cnt(k) + ')' : ''}</button>`).join('')}</div><span class="grow"></span><button class="btn sm" data-dl="orders.csv">Export CSV</button></div>` +
      (list.length ? list.map((o) => { const nx = NEXT(o); return `<article class="ord ${o.status === 'new' ? 'new' : ''}${openOrd.has(o.id) ? ' open' : ''}" data-id="${esc(o.id)}"><div class="ord-h" data-tog><b class="ref">#${esc(o.ref)}</b>${badge(o.status)}<span class="bdg b-gray">${esc(o.type)}</span><span><b>${esc(o.name)}</b> <span class="muted">· ${esc(o.phone)}</span></span><span class="grow"></span><span class="muted tiny">${esc(fmtDT(o.createdAt))} · ${esc(o.when)}</span><b>${money(o.total)}</b></div>
      <div class="ord-b"><div class="items">${o.items.map((i) => `<div><span>${i.qty} × ${esc(i.name)}${i.note ? ` <i class="muted">(${esc(i.note)})</i>` : ''}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}<div class="muted"><span>Subtotal / tax / delivery / tip</span><span>${money(o.sub)} / ${money(o.tax)} / ${money(o.delivery)} / ${money(o.tip)}</span></div>${o.discount ? `<div class="muted"><span>Promo ${esc(o.promo)}</span><span>−${money(o.discount)}</span></div>` : ''}</div>
      ${o.address ? `<p class="tiny"><b>Address:</b> ${esc(o.address)}</p>` : ''}${o.notes ? `<p class="tiny"><b>Notes:</b> ${esc(o.notes)}</p>` : ''}<p class="tiny muted">Payment: ${esc(o.pay)}${o.email ? ' · ' + esc(o.email) : ''}</p>
      <div class="actions">${nx ? `<button class="btn primary sm" data-set="${nx[0]}">${nx[1]}</button>` : ''}${ACTIVE.includes(o.status) ? '<button class="btn danger sm" data-set="cancelled">Cancel order</button>' : ''}<select data-sel style="width:auto;margin:0;padding:5px 10px">${DB.statuses.orders.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${label(s)}</option>`).join('')}</select><button class="btn sm" data-print>Print ticket</button><a class="btn sm" href="tel:${esc(o.phone)}">Call</a><button class="btn sm danger" data-del>Delete</button></div></div></article>`; }).join('') : '<div class="card empty">No orders here. New orders appear automatically.</div>');
    view.onclick = async (e) => {
      const f = e.target.closest('[data-f]'); if (f) { ordFilter = f.dataset.f; ordersView(); return; }
      const card = e.target.closest('.ord'); if (!card) return; const o = DB.orders.find((x) => x.id === card.dataset.id), s = e.target.closest('[data-set]');
      if (s) { if (s.dataset.set === 'cancelled' && !(await ask('Cancel this order? The customer will be notified if they gave an email.', 'Cancel order'))) return; setStatus('orders', o.id, s.dataset.set); }
      else if (e.target.closest('[data-print]')) printOrder(o);
      else if (e.target.closest('[data-del]')) { if (await ask('Permanently delete this order?', 'Delete')) { await call('DELETE', '/api/admin/orders/' + o.id); await refresh(); ordersView(); } }
      else if (e.target.closest('[data-tog]')) { card.classList.toggle('open'); card.classList.contains('open') ? openOrd.add(o.id) : openOrd.delete(o.id); }
    };
    view.onchange = (e) => { const s = e.target.closest('[data-sel]'); if (s) setStatus('orders', s.closest('.ord').dataset.id, s.value); };
  }

  /* ---------- Reservations ---------- */
  let resFilter = 'upcoming';
  function reservationsView() {
    const today = dayKey(new Date()), open = (r) => !['cancelled', 'completed', 'no_show'].includes(r.status);
    let list = DB.reservations.slice();
    if (resFilter === 'upcoming') list = list.filter((r) => r.date >= today && open(r)); else if (resFilter === 'today') list = list.filter((r) => r.date === today); else if (resFilter === 'pending') list = list.filter((r) => r.status === 'new');
    list.sort((a, b) => resFilter === 'all' ? (b.date + b.time).localeCompare(a.date + a.time) : (a.date + a.time).localeCompare(b.date + b.time));
    view.innerHTML = `<div class="bar"><div class="tabs" style="margin:0">${[['upcoming', 'Upcoming'], ['today', 'Today'], ['pending', 'Needs confirmation'], ['all', 'All']].map(([k, t]) => `<button class="tab ${resFilter === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}</div><span class="grow"></span><button class="btn sm" data-dl="reservations.csv">Export CSV</button></div>` +
      `<div class="card tw">${list.length ? `<table class="tbl"><thead><tr><th>When</th><th>Guests</th><th>Guest</th><th>Contact</th><th>Notes</th><th>Status</th><th></th></tr></thead><tbody>${list.map((r) => `<tr data-id="${esc(r.id)}"><td><b>${esc(r.date)}</b><div class="muted tiny">${esc(r.time)} · #${esc(r.ref)}</div></td><td><b>${r.guests}</b></td><td>${esc(r.name)}</td><td class="tiny">${esc(r.phone)}<br>${esc(r.email)}</td><td class="tiny muted">${esc(r.notes)}</td><td><select data-sel style="width:auto;margin:0;padding:5px 8px">${DB.statuses.reservations.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></td><td class="right"><button class="btn sm danger" data-del>Delete</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No reservations in this view.</div>'}</div>`;
    view.onclick = async (e) => { const f = e.target.closest('[data-f]'); if (f) { resFilter = f.dataset.f; reservationsView(); return; } const tr = e.target.closest('tr[data-id]'); if (tr && e.target.closest('[data-del]') && (await ask('Delete this reservation?', 'Delete'))) { await call('DELETE', '/api/admin/reservations/' + tr.dataset.id); await refresh(); reservationsView(); } };
    view.onchange = (e) => { const s = e.target.closest('[data-sel]'); if (s) setStatus('reservations', s.closest('tr').dataset.id, s.value); };
  }

  /* ---------- Messages ---------- */
  function messagesView() {
    view.innerHTML = DB.messages.length ? DB.messages.map((m) => `<article class="msg-i ${m.read ? '' : 'unread'}" data-id="${esc(m.id)}"><div class="row"><b>${esc(m.name)}</b><span class="bdg b-gray">${esc(m.topic)}</span><span class="muted tiny grow right">${esc(fmtDT(m.at))}</span></div><p>${esc(m.message)}</p><div class="row"><a class="btn sm primary" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + m.topic)}">Reply by email</a><button class="btn sm" data-read>${m.read ? 'Mark unread' : 'Mark read'}</button><button class="btn sm danger" data-del>Delete</button><span class="muted tiny">${esc(m.email)}</span></div></article>`).join('') : '<div class="card empty">No messages yet.</div>';
    view.onclick = async (e) => { const c = e.target.closest('.msg-i'); if (!c) return; const m = DB.messages.find((x) => x.id === c.dataset.id);
      if (e.target.closest('[data-read]')) { await call('POST', `/api/admin/messages/${m.id}/read`, { read: !m.read }); m.read = !m.read; renderNav(); messagesView(); }
      else if (e.target.closest('[data-del]') && (await ask('Delete this message?', 'Delete'))) { await call('DELETE', '/api/admin/messages/' + m.id); await refresh(); messagesView(); } };
  }

  /* ---------- Subscribers ---------- */
  function subscribersView() {
    view.innerHTML = `<div class="grid"><div class="card"><div class="row" style="margin-bottom:12px"><h3 style="margin:0" class="grow">${DB.subscribers.length} subscribers</h3><button class="btn sm" data-dl="subscribers.csv">Export CSV</button></div><div class="tw">${DB.subscribers.length ? `<table class="tbl"><thead><tr><th>Email</th><th>Joined</th><th></th></tr></thead><tbody>${DB.subscribers.map((s) => `<tr><td>${esc(s.email)}</td><td class="muted tiny">${esc(fmtDT(s.at))}</td><td class="right"><button class="btn sm danger" data-del="${esc(s.email)}">Remove</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No subscribers yet.</div>'}</div></div>
      <div class="card"><h3>Send a campaign</h3><p class="muted tiny">Emails every subscriber individually with an unsubscribe link. Requires email to be configured in Settings.</p><label class="fld">Subject<input id="cSub"></label><label class="fld">Message<textarea id="cBody" rows="8" placeholder="Tell them about this week's special…"></textarea></label><button class="btn primary block" id="cSend">Send to ${DB.subscribers.length} subscriber${DB.subscribers.length === 1 ? '' : 's'}</button><p class="msg" id="cMsg"></p></div></div>`;
    view.onclick = async (e) => { const d = e.target.closest('[data-del]'); if (d && (await ask('Remove this subscriber?', 'Remove'))) { await call('POST', '/api/admin/subscribers/delete', { email: d.dataset.del }); await refresh(); subscribersView(); } };
    $('#cSend').onclick = async () => { if (!DB.subscribers.length) return; if (!(await ask('Send this email to all subscribers now?', 'Send now', false))) return; const m = $('#cMsg'), b = $('#cSend'); b.disabled = true; m.className = 'msg'; m.textContent = 'Sending…'; try { const r = await call('POST', '/api/admin/campaign', { subject: $('#cSub').value, body: $('#cBody').value }); m.textContent = `Sending to ${r.queued} subscriber${r.queued === 1 ? '' : 's'} in the background. Check Settings → Email → Recent emails for results.`; m.classList.add('ok'); setTimeout(refresh, 8000); } catch (err) { m.textContent = err.message; m.classList.add('bad'); } finally { b.disabled = false; } };
  }


  /* ---------- Launch checklist ---------- */
  function checklist() {
    const S = DB.settings, M = DB.meta || {}; let lastB = 0; try { lastB = +localStorage.getItem('kk_last_backup') || 0; } catch (e) { /* ignore */ }
    const sampleTeam = ['Alex Smith', 'Margaret Theresa', 'Mary Reuben', 'Hussein Wahab'];
    return [
      ['Time zone set', S.timezone !== 'UTC', 'settings:contact', 'Controls "open now" and booking times.'],
      ['Address and phone added', !!(S.contact.address && S.contact.phone), 'settings:contact', 'Shown on the website so guests can find and call you.'],
      ['Email alerts connected', !!(DB.email.apiKeySet && DB.email.from), 'settings:email', 'Get new-order alerts and send customer confirmations.'],
      ['Menu photos are your own', !DB.menu.some((m) => /^assets\/img\/(food|feast)/.test(m.img)), 'menu', 'The starter photos are placeholders. Upload photos of your real dishes.'],
      ['No sample reviews or staff are public', !DB.reviews.some((r) => r.visible && /^Sample Guest/.test(r.name)) && !DB.team.some((t) => sampleTeam.includes(t.name)), 'reviews', 'Only show real reviews and real team members.'],
      ['Social links added', Object.values(S.socials).some(Boolean), 'settings:contact', 'Instagram, Facebook, TikTok, etc.'],
      ['Website address configured', !!M.siteUrl, null, 'Set the SITE_URL setting on your host (see DEPLOY.md).'],
      ['Secure connection (HTTPS)', !!M.secure, null, 'Your host should provide HTTPS automatically.'],
      ['Backup downloaded in the last 30 days', Date.now() - lastB < 30 * 864e5, 'settings:account', 'Settings → Account → Download backup.']
    ];
  }
  function checklistHtml() {
    const items = checklist(), done = items.filter((i) => i[1]).length, pct = Math.round(done / items.length * 100);
    if (done === items.length) return '<div class="callout" style="border-color:var(--ok)">✅ Launch checklist complete. You are ready to go live.</div>';
    return `<div class="card" style="margin-bottom:18px"><div class="row" style="margin-bottom:10px"><h3 style="margin:0" class="grow">Launch checklist</h3><span class="bdg ${pct > 70 ? 's-completed' : 's-preparing'}" style="text-transform:none">${done} of ${items.length} done</span></div><div style="height:8px;border-radius:99px;background:var(--bg);overflow:hidden;margin-bottom:12px"><div style="height:100%;width:${pct}%;background:var(--accent);transition:width .4s"></div></div>
      ${items.map((i) => `<div class="list-i"><span>${i[1] ? '✅' : '⬜'} <b>${i[0]}</b> <span class="muted tiny">${i[3] || ''}</span></span>${!i[1] && i[2] ? `<a class="btn sm" href="#" data-go="${i[2]}">Fix</a>` : ''}</div>`).join('')}</div>`;
  }
  document.addEventListener('click', (e) => { const g = e.target.closest && e.target.closest('[data-go]'); if (!g) return; e.preventDefault(); const [v, sec] = g.dataset.go.split(':'); if (sec) secOn = sec; location.hash = PFX + v; if (current === v) route(); });

  /* ---------- Dashboard ---------- */
  function dashboardView() {
    const today = dayKey(new Date()), O = DB.orders.filter((o) => o.status !== 'cancelled'), todayO = O.filter((o) => dayKey(o.createdAt) === today);
    const rev = (arr) => arr.reduce((a, o) => a + o.total, 0);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5), k = dayKey(d); return { k, label: new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: tz() }).format(d), v: rev(O.filter((o) => dayKey(o.createdAt) === k)) }; });
    const max = Math.max(1, ...days.map((d) => d.v)), week = days.reduce((a, d) => a + d.v, 0);
    const tally = {}; O.forEach((o) => o.items.forEach((i) => { tally[i.name] = (tally[i.name] || 0) + i.qty; })); const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const resToday = DB.reservations.filter((r) => r.date === today && !['cancelled', 'no_show'].includes(r.status));
    const aov = O.length ? rev(O) / O.length : 0;
    const warn = [];
    view.innerHTML = `<div class="kpis"><div class="kpi"><small>Today's revenue</small><b>${money(rev(todayO))}</b><span class="d">${todayO.length} order${todayO.length === 1 ? '' : 's'}</span></div><div class="kpi"><small>Active orders</small><b>${DB.orders.filter((o) => ACTIVE.includes(o.status)).length}</b><span class="d">${badgeCount('orders')} new</span></div><div class="kpi"><small>Reservations today</small><b>${resToday.length}</b><span class="d">${resToday.reduce((a, r) => a + r.guests, 0)} guests</span></div><div class="kpi"><small>Last 7 days</small><b>${money(week)}</b><span class="d">Avg order ${money(aov)}</span></div><div class="kpi"><small>Subscribers</small><b>${DB.subscribers.length}</b><span class="d">${badgeCount('messages')} unread messages</span></div></div>
    ${checklistHtml()}
    <div class="grid"><div class="stack"><div class="card"><h3>Revenue, last 7 days</h3><div class="chart">${days.map((d) => `<div class="c"><b>${d.v ? cur() + Math.round(d.v) : ''}</b><i style="height:${Math.max(2, d.v / max * 100)}%"></i><span>${d.label}</span></div>`).join('')}</div></div>
      <div class="card"><h3>Recent orders</h3>${DB.orders.slice(0, 6).map((o) => `<a class="list-i" href="${PFX}orders" style="text-decoration:none;color:inherit"><span><b>#${esc(o.ref)}</b> ${esc(o.name)} ${badge(o.status)}</span><b>${money(o.total)}</b></a>`).join('') || '<div class="empty">No orders yet. Share your site and they will appear here.</div>'}</div></div>
      <div class="stack"><div class="card"><h3>Open right now</h3><p style="margin:0"><span class="bdg ${DB.openNow ? 's-completed' : 's-cancelled'}">${DB.openNow ? 'Open' : 'Closed'}</span> <span class="muted tiny">based on your hours &amp; time zone</span></p></div>
      <div class="card"><h3>Top dishes</h3>${top.map(([n, q], i) => `<div class="list-i"><span>${i + 1}. ${esc(n)}</span><b>${q}</b></div>`).join('') || '<div class="empty">No sales yet.</div>'}</div>
      <div class="card"><h3>Quick actions</h3><div class="row"><a class="btn sm" href="${PFX}menu">Edit menu</a><a class="btn sm" href="${PFX}settings">Settings</a><a class="btn sm" href="/" target="_blank" rel="noopener">View site ↗</a></div></div></div></div>`;
    view.onclick = null; view.onchange = null;
  }

  /* ---------- Settings ---------- */
  const hrs = () => [];
  const menuOpts = () => [['', '(none)']].concat(DB.menu.map((m) => [m.id, m.name]));
  const SECTIONS = [
    { id: 'brand', title: 'Brand & homepage', fields: [
      { k: 'brand.name', t: 'text', label: 'Restaurant name', half: 1 }, { k: 'brand.tagline', t: 'text', label: 'Cuisine / tagline', half: 1 }, { k: 'brand.logo', t: 'image', label: 'Logo' }, { k: 'theme.accent', t: 'color', label: 'Brand accent colour', hint: 'Used for buttons, highlights and emails.' },
      { k: 'hero.eyebrow', t: 'text', label: 'Hero small text' }, { k: 'hero.title', t: 'text', label: 'Hero headline', half: 1 }, { k: 'hero.accent', t: 'text', label: 'Hero headline (coloured line)', half: 1 }, { k: 'hero.subtitle', t: 'textarea', label: 'Hero paragraph' },
      { k: 'hero.image', t: 'image', label: 'Hero main photo' }, { k: 'hero.image2', t: 'image', label: 'Hero small photo 1' }, { k: 'hero.image3', t: 'image', label: 'Hero small photo 2' },
      { k: 'announcement.enabled', t: 'checkbox', label: 'Show announcement bar' }, { k: 'announcement.text', t: 'text', label: 'Announcement text' }, { k: 'announcement.linkText', t: 'text', label: 'Link text', half: 1 }, { k: 'announcement.linkHref', t: 'text', label: 'Link target (e.g. #reserve)', half: 1 },
      { k: 'special.enabled', t: 'checkbox', label: "Show \"Today's special\" card on the hero" }, { k: 'special.title', t: 'text', label: 'Card label', half: 1 }, { k: 'special.name', t: 'text', label: 'Dish name', half: 1 }, { k: 'special.text', t: 'text', label: 'Short description' }, { k: 'special.menuId', t: 'select', label: 'Link to menu dish', opts: menuOpts, half: 1 }, { k: 'special.price', t: 'number', step: '0.01', label: 'Price (display)', half: 1 }] },
    { id: 'about', title: 'About & highlights', fields: [
      { k: 'about.eyebrow', t: 'text', label: 'Small heading', half: 1 }, { k: 'about.title', t: 'text', label: 'Heading', half: 1 }, { k: 'about.text1', t: 'textarea', label: 'Paragraph 1' }, { k: 'about.text2', t: 'textarea', label: 'Paragraph 2' }, { k: 'about.bullets', t: 'lines', label: 'Highlights (one per line)' },
      { k: 'about.image', t: 'image', label: 'Main image' }, { k: 'about.image2', t: 'image', label: 'Small overlapping image' },
      { k: 'values', t: 'triples', label: 'Feature tiles', hint: 'One per line: emoji | title | short text' }, { k: 'stats', t: 'pairs', label: 'Number highlights', hint: 'One per line: value | label (e.g. 530k+ | Plates served)' },
      { k: 'catering.enabled', t: 'checkbox', label: 'Show catering banner' }, { k: 'catering.title', t: 'text', label: 'Catering title' }, { k: 'catering.text', t: 'textarea', label: 'Catering text', rows: 2 }, { k: 'catering.image', t: 'image', label: 'Catering background' }] },
    { id: 'contact', title: 'Contact & hours', fields: [
      { k: 'contact.address', t: 'text', label: 'Address' }, { k: 'contact.phone', t: 'text', label: 'Phone', half: 1 }, { k: 'contact.email', t: 'email', label: 'Public email', half: 1 }, { k: 'contact.whatsapp', t: 'text', label: 'WhatsApp number (digits with country code)', hint: 'e.g. 2348012345678. Leave empty to hide the button.' },
      { k: 'contact.mapEmbed', t: 'text', label: 'Google Maps embed link', hint: 'On Google Maps: Share → Embed a map → copy the src="…" link. Leave empty to show a "Get directions" link instead.' },
      { k: 'socials.instagram', t: 'text', label: 'Instagram URL', half: 1 }, { k: 'socials.facebook', t: 'text', label: 'Facebook URL', half: 1 }, { k: 'socials.tiktok', t: 'text', label: 'TikTok URL', half: 1 }, { k: 'socials.youtube', t: 'text', label: 'YouTube URL', half: 1 }, { k: 'socials.x', t: 'text', label: 'X / Twitter URL', half: 1 },
      { k: 'timezone', t: 'tz', label: 'Time zone', half: 1, hint: 'Important: controls "open now" and booking times. e.g. Africa/Lagos, Europe/London, America/New_York' }, { k: 'currency', t: 'text', label: 'Currency symbol', half: 1, hint: 'e.g. ₦ $ £ €' }, { k: '__hours', t: 'hours', label: 'Opening hours' }] },
    { id: 'ordering', title: 'Online ordering', fields: [
      { k: 'ordering.enabled', t: 'checkbox', label: 'Accept online orders' }, { k: 'ordering.pickup', t: 'checkbox', label: 'Offer pickup' }, { k: 'ordering.delivery', t: 'checkbox', label: 'Offer delivery' },
      { k: 'ordering.taxRate', t: 'number', step: '0.1', label: 'Tax / service charge (%)', half: 1 }, { k: 'ordering.minOrder', t: 'number', step: '0.01', label: 'Minimum order', half: 1 }, { k: 'ordering.deliveryFee', t: 'number', step: '0.01', label: 'Delivery fee', half: 1 }, { k: 'ordering.freeDeliveryOver', t: 'number', step: '0.01', label: 'Free delivery over (0 = never)', half: 1 },
      { k: 'ordering.prepMinutes', t: 'number', label: 'Pickup prep time (min)', half: 1 }, { k: 'ordering.deliveryMinutes', t: 'number', label: 'Delivery time (min)', half: 1 }, { k: 'ordering.tips', t: 'tips', label: 'Tip options (%)', hint: 'Separated by commas, e.g. 0, 10, 15, 20' }, { k: 'ordering.payments', t: 'lines', label: 'Payment options shown at checkout (one per line)' }] },
    { id: 'reservations', title: 'Reservations', fields: [
      { k: 'reservations.enabled', t: 'checkbox', label: 'Accept online reservations' }, { k: 'reservations.maxGuests', t: 'number', label: 'Max party size online', half: 1 }, { k: 'reservations.slotMinutes', t: 'number', label: 'Time slot interval (min)', half: 1 }, { k: 'reservations.coversPerSlot', t: 'number', label: 'Max guests per time slot', half: 1, hint: 'Slots show "full" once this is reached.' }, { k: 'reservations.daysAhead', t: 'number', label: 'How many days ahead guests can book', half: 1 }, { k: 'reservations.leadMinutes', t: 'number', label: 'Minimum notice (min)', half: 1 }] },
    { id: 'email', title: 'Email & alerts', fields: [
      { k: 'email.notifyTo', t: 'text', label: 'Send new order / booking / message alerts to', hint: 'One or more addresses, separated by commas.' }, { k: 'email.customerEmails', t: 'checkbox', label: 'Send confirmation emails to customers' },
      { k: 'email.from', t: 'text', label: 'From address', hint: 'e.g. Kilo Kitchen &lt;orders@yourdomain.com&gt; (domain must be verified in Resend)', half: 1 }, { k: 'email.apiKey', t: 'password', label: 'Resend API key', hint: '', half: 1 }, { k: 'email.clearKey', t: 'checkbox', label: 'Remove saved API key' }] },
    { id: 'seo', title: 'SEO', fields: [{ k: 'seo.title', t: 'text', label: 'Page title (shown in Google & browser tab)' }, { k: 'seo.description', t: 'textarea', label: 'Description (shown in Google results)', rows: 2 }] }
  ];
  let secOn = 'brand';
  function settingsView() {
    const S = DB.settings, E = Object.assign({}, DB.email), val = (f) => f.k.startsWith('email.') ? (f.k === 'email.clearKey' ? false : f.k === 'email.apiKey' ? '' : E[f.k.slice(6)]) : getP(S, f.k);
    const hoursEd = () => `<div class="fld">Opening hours<div class="hours-ed">${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => { const h = S.hours[i]; return `<div class="hr" data-hr="${i}"><b>${d}</b><input type="time" data-o value="${esc(h.open)}"><input type="time" data-c value="${esc(h.close)}"><label class="chk"><input type="checkbox" data-x ${h.closed ? 'checked' : ''}> Closed</label></div>`; }).join('')}</div></div>`;
    view.innerHTML = `<div class="sec-tabs" role="tablist">${SECTIONS.map((s) => `<button class="sec-tab ${s.id === secOn ? 'on' : ''}" data-s="${s.id}">${s.title}</button>`).join('')}<button class="sec-tab ${secOn === 'account' ? 'on' : ''}" data-s="account">Account</button></div>
    <form id="setForm" class="card" novalidate>${SECTIONS.map((s) => `<section data-sec="${s.id}" ${s.id === secOn ? '' : 'hidden'}>${s.fields.map((f) => f.t === 'hours' ? hoursEd() : '').join('')}${layout(s.fields.filter((f) => f.t !== 'hours'), val)}${s.id === 'email' ? `<p class="tiny muted">API key: ${DB.email.apiKeySet ? '<b style="color:var(--ok)">saved ✓</b> (leave blank to keep it)' : '<b>not set</b>'}. Get a free key at <a href="https://resend.com" target="_blank" rel="noopener">resend.com</a>.</p><div class="row"><button type="button" class="btn sm" id="testMail">Send test email</button><span class="msg" id="mailMsg"></span></div>${logHtml()}` : ''}</section>`).join('')}
    <section data-sec="account" ${secOn === 'account' ? '' : 'hidden'}><h3>Change password</h3><div class="g2"><label class="fld">Current password<input type="password" id="pwCur" autocomplete="current-password"></label><label class="fld">New password (10+ characters)<input type="password" id="pwNew" autocomplete="new-password"></label></div><label class="fld">Admin email<input type="email" id="pwEmail" value="${esc(DB.adminEmail)}"></label><button type="button" class="btn" id="pwBtn">Update account</button><p class="msg" id="pwMsg"></p>
      <h3 style="margin-top:28px">Backup &amp; restore</h3><p class="muted tiny">Downloads your menu, settings, orders, reservations, subscribers and uploaded photos in one file. Your email API key and password are never included. Do this regularly.</p>
      <div class="row"><button type="button" class="btn primary" data-dl="backup">Download backup</button><label class="btn">Restore from backup<input type="file" accept="application/json,.json" id="restoreFile" hidden></label></div><p class="msg" id="bkMsg"></p></section></form>
    <div class="savebar" id="saveBar"><button class="btn primary" id="saveBtn">Save changes</button><span class="msg" id="saveMsg" style="margin:0"></span><span class="muted tiny">Changes go live on your website immediately.</span></div>`;
    view.onclick = (e) => { const t = e.target.closest('[data-s]'); if (t) { secOn = t.dataset.s; $$('.sec-tab').forEach((b) => b.classList.toggle('on', b === t)); $$('[data-sec]').forEach((s) => { s.hidden = s.dataset.sec !== secOn; }); $('#saveBar').hidden = secOn === 'account'; } };
    $('#saveBar').hidden = secOn === 'account'; view.onchange = null;
    $('#saveBtn').onclick = async () => {
      const all = SECTIONS.flatMap((s) => s.fields).filter((f) => f.t !== 'hours'), out = collect(all, $('#setForm')), m = $('#saveMsg'), b = $('#saveBtn');
      out.hours = $$('[data-hr]').map((r) => ({ open: $('[data-o]', r).value, close: $('[data-c]', r).value, closed: $('[data-x]', r).checked }));
      const payload = { settings: out, email: out.email || {} };
      b.disabled = true; m.className = 'msg'; m.textContent = 'Saving…';
      try { await call('PUT', '/api/admin/settings', payload); await refresh(); document.documentElement.style.setProperty('--accent', DB.settings.theme.accent); $('#sideName').textContent = DB.settings.brand.name; m.textContent = 'Saved ✓'; m.classList.add('ok'); toast('Settings saved'); setTimeout(() => { settingsView(); }, 600); }
      catch (err) { m.textContent = err.message; m.classList.add('bad'); } finally { b.disabled = false; }
    };
    const tm = $('#testMail'); if (tm) tm.onclick = async () => { const m = $('#mailMsg'); m.className = 'msg'; m.textContent = 'Sending…'; try { await call('POST', '/api/admin/email/test', {}); m.textContent = 'Sent! Check your inbox.'; m.classList.add('ok'); } catch (err) { m.textContent = err.message; m.classList.add('bad'); } await refresh(); };
    $('#restoreFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const m = $('#bkMsg'); m.className = 'msg'; if (!(await ask('Restoring replaces your current menu, settings, orders and other data with the backup. A safety copy is kept. Continue?', 'Restore', false))) { e.target.value = ''; return; } m.textContent = 'Restoring…'; try { const j = JSON.parse(await f.text()); const r = await call('POST', '/api/admin/restore', j); await refresh(); m.textContent = 'Restored ✓ (' + r.images + ' photos). Reloading…'; m.classList.add('ok'); setTimeout(() => location.reload(), 1200); } catch (err) { m.textContent = err.message || 'Could not read that file.'; m.classList.add('bad'); } e.target.value = ''; };
    $('#pwBtn').onclick = async () => { const m = $('#pwMsg'); m.className = 'msg'; try { await call('POST', '/api/admin/password', { current: $('#pwCur').value, password: $('#pwNew').value, email: $('#pwEmail').value }); m.textContent = 'Account updated ✓'; m.classList.add('ok'); $('#pwCur').value = $('#pwNew').value = ''; } catch (err) { m.textContent = err.message; m.classList.add('bad'); } };
  }
  const logHtml = () => DB.emailLog.length ? `<h3 style="margin-top:22px">Recent emails</h3><div class="tw"><table class="tbl"><tbody>${DB.emailLog.slice(0, 8).map((l) => `<tr><td class="tiny muted">${esc(fmtDT(l.at))}</td><td>${esc(l.subject)}</td><td class="tiny">${esc(l.to)}</td><td>${l.ok ? '<span class="bdg b-ok">sent</span>' : `<span class="bdg s-cancelled" title="${esc(l.error)}">failed</span>`}</td></tr>`).join('')}</tbody></table></div>` : '';

  const VIEWS = { dashboard: dashboardView, orders: ordersView, reservations: reservationsView, messages: messagesView, subscribers: subscribersView, settings: settingsView };
  Object.keys(RES).forEach((k) => { VIEWS[k] = () => crudView(k); });

  const startAdmin = () => boot().catch(() => { $('#auth').hidden = false; $('#authSub').textContent = 'Cannot reach the server. Is it running?'; });
  if (window.__LAZY_ADMIN) window.__adminBoot = startAdmin; else startAdmin();
})();
