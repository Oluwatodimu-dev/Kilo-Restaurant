/* Kilo Kitchen: PREVIEW MODE backend.
   Mirrors the real server's API inside the browser (data saved in localStorage) so the
   single-file preview works with zero setup. NOT used on the real server. */
(function () {
  'use strict';
  const KEY = 'kk_demo_db_v2';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const uid = (p) => (p || '') + hex(10);
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n || 200);
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : (d || 0); };
  const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
  const isEmail = (e) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
  const isPhone = (p) => String(p).replace(/\D/g, '').length >= 7;
  const im = (p) => { p = String(p || ''); return (/^(assets\/img\/|\/uploads\/|https:\/\/)[^\s"'<>]{1,300}$/.test(p) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(p) || p === '') ? p : ''; };
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const dowOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  function nowIn(tz) {
    let p; try { p = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); } catch (e) { return nowIn('UTC'); }
    const g = (t) => p.find((x) => x.type === t).value;
    return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), min: +g('hour') * 60 + +g('minute'), date: g('year') + '-' + g('month') + '-' + g('day') };
  }

  /* ---------- DB ---------- */
  let db;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { window.dispatchEvent(new CustomEvent('kk-demo-quota')); } }
  function seedActivity() {
    const names = ['Amaka O.', 'Tunde B.', 'Sarah K.', 'David M.', 'Funke A.', 'Chidi E.', 'Maria L.', 'John P.'], st = ['completed', 'completed', 'completed', 'completed', 'preparing', 'new', 'confirmed', 'completed', 'cancelled', 'completed', 'ready', 'new'];
    const ids = db.menu.map((m) => m.id), now = Date.now(); db.orders = [];
    for (let i = 0; i < 14; i++) {
      const lines = [0, 1].concat(i % 3 ? [2] : []).map((k) => { const m = db.menu[(i * 3 + k * 5) % db.menu.length]; return { id: m.id, name: m.name, price: m.price, qty: 1 + ((i + k) % 2), note: '' }; });
      const sub = lines.reduce((a, l) => a + l.price * l.qty, 0), tax = sub * db.settings.ordering.taxRate / 100, delivery = i % 2 ? db.settings.ordering.deliveryFee : 0;
      db.orders.push({ id: uid('o_'), ref: hex(6).toUpperCase(), createdAt: new Date(now - (i * 5.5 + 0.3) * 3600e3 * (i > 3 ? 3 : 1)).toISOString(), status: i < 12 ? st[i] : 'completed', type: i % 2 ? 'delivery' : 'pickup', name: names[i % names.length], phone: '+1 555 01' + (10 + i), email: '', address: i % 2 ? '24 Sample Street' : '', notes: '', when: 'ASAP', pay: 'Card on arrival', items: lines, sub: +sub.toFixed(2), discount: 0, promo: '', tax: +tax.toFixed(2), delivery, tip: 0, total: +(sub + tax + delivery).toFixed(2) });
    }
    const today = nowIn(db.settings.timezone).date, add = (n) => { const [y, m, d] = today.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
    db.reservations = [['Grace Obi', 4, 0, '19:00', 'confirmed', 'Birthday dinner'], ['Mark Evans', 2, 0, '20:00', 'new', ''], ['Lola Adeyemi', 6, 1, '13:00', 'new', 'High chair needed'], ['Ken Tanaka', 3, 2, '18:30', 'confirmed', 'Vegetarian']].map((r) => ({ id: uid('r_'), ref: 'R' + hex(5).toUpperCase(), createdAt: new Date().toISOString(), status: r[4], name: r[0], phone: '+1 555 0199', email: 'guest@example.com', date: add(r[2]), time: r[3], guests: r[1], notes: r[5] }));
    db.messages = [{ id: uid('m_'), at: new Date(now - 3600e3).toISOString(), name: 'Ify N.', email: 'ify@example.com', topic: 'Catering quote', message: 'Hi! We need lunch for 40 people on Friday week. Can you share a quote?', read: false }, { id: uid('m_'), at: new Date(now - 30 * 3600e3).toISOString(), name: 'Paul R.', email: 'paul@example.com', topic: 'Feedback', message: 'Loved the shakshuka. Thank you!', read: true }];
    db.subscribers = ['ada@example.com', 'ben@example.com', 'chloe@example.com', 'dan@example.com', 'eve@example.com'].map((e, i) => ({ email: e, at: new Date(now - i * 86400e3).toISOString() }));
  }
  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (db && db.menu) return;
    db = clone(window.__SEED); db.settings.timezone = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    Object.assign(db, { emailLog: [], email: { apiKey: '', from: '', notifyTo: 'owner@example.com', customerEmails: true }, adminEmail: 'demo@kilokitchen.com' });
    seedActivity(); save();
  }
  window.__demoReset = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } location.reload(); };

  /* ---------- Logic (mirrors server.js) ---------- */
  const DIETS = ['V', 'VG', 'GF', 'Halal', 'Spicy'];
  const SCHEMAS = {
    menu: (b) => ({ name: str(b.name, 120), desc: str(b.desc, 500), price: Math.max(0, num(b.price)), cat: str(b.cat, 40), img: im(b.img), tag: str(b.tag, 40), diet: (Array.isArray(b.diet) ? b.diet : []).filter((d) => DIETS.includes(d)), available: bool(b.available), featured: bool(b.featured), calories: Math.max(0, Math.round(num(b.calories))) }),
    categories: (b) => ({ name: str(b.name, 60) }),
    team: (b) => ({ name: str(b.name, 80), role: str(b.role, 80), bio: str(b.bio, 400), img: im(b.img) }),
    reviews: (b) => ({ name: str(b.name, 80), role: str(b.role, 80), text: str(b.text, 600), rating: Math.min(5, Math.max(1, Math.round(num(b.rating, 5)))), img: im(b.img), visible: bool(b.visible) }),
    gallery: (b) => ({ src: im(b.src), alt: str(b.alt, 160) }),
    faq: (b) => ({ q: str(b.q, 200), a: str(b.a, 800) }),
    promos: (b) => ({ code: str(b.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, ''), type: b.type === 'fixed' ? 'fixed' : 'percent', value: Math.max(0, num(b.value)), min: Math.max(0, num(b.min)), active: bool(b.active), note: str(b.note, 120) })
  };
  const REQUIRED = { menu: ['name'], categories: ['name'], team: ['name'], reviews: ['name', 'text'], gallery: ['src'], faq: ['q', 'a'], promos: ['code'] };
  const COLLS = Object.keys(SCHEMAS);
  const STATUS = { orders: ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'], reservations: ['new', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'] };

  function cleanSettings(b, cur) {
    const o = clone(cur), s = str, set = (g, k, fn) => { if (b[g] && b[g][k] !== undefined) o[g][k] = fn(b[g][k]); };
    set('brand', 'name', (v) => s(v, 60) || cur.brand.name); set('brand', 'tagline', (v) => s(v, 80)); set('brand', 'logo', (v) => im(v) || cur.brand.logo);
    ['eyebrow', 'title', 'accent', 'subtitle'].forEach((k) => set('hero', k, (v) => s(v, k === 'subtitle' ? 300 : 120)));
    ['image', 'image2', 'image3'].forEach((k) => set('hero', k, (v) => im(v) || cur.hero[k]));
    set('announcement', 'enabled', bool); ['text', 'linkText'].forEach((k) => set('announcement', k, (v) => s(v, 200))); set('announcement', 'linkHref', (v) => /^(#|\/|https?:\/\/|mailto:|tel:)/.test(s(v, 200)) ? s(v, 200) : '');
    set('special', 'enabled', bool); ['title', 'name', 'text', 'menuId'].forEach((k) => set('special', k, (v) => s(v, 200))); set('special', 'price', (v) => Math.max(0, num(v)));
    ['eyebrow', 'title'].forEach((k) => set('about', k, (v) => s(v, 120))); ['text1', 'text2'].forEach((k) => set('about', k, (v) => s(v, 800)));
    set('about', 'bullets', (v) => (Array.isArray(v) ? v : []).map((x) => s(x, 160)).filter(Boolean).slice(0, 8));
    ['image', 'image2'].forEach((k) => set('about', k, (v) => im(v) || cur.about[k]));
    if (Array.isArray(b.stats)) o.stats = b.stats.slice(0, 6).map((x) => ({ value: s(x.value, 20), label: s(x.label, 80) })).filter((x) => x.value);
    if (Array.isArray(b.values)) o.values = b.values.slice(0, 8).map((x) => ({ icon: s(x.icon, 8), title: s(x.title, 40), text: s(x.text, 100) })).filter((x) => x.title);
    ['address', 'phone', 'email', 'whatsapp'].forEach((k) => set('contact', k, (v) => s(v, 160)));
    set('contact', 'mapEmbed', (v) => { v = s(v, 600); return /^https:\/\/(www\.google\.com\/maps\/embed|maps\.google\.com|www\.openstreetmap\.org)/.test(v) ? v : ''; });
    if (Array.isArray(b.hours) && b.hours.length === 7) o.hours = b.hours.map((h, i) => ({ open: toMin(h.open) != null ? h.open : cur.hours[i].open, close: toMin(h.close) != null ? h.close : cur.hours[i].close, closed: bool(h.closed) }));
    ['instagram', 'facebook', 'tiktok', 'youtube', 'x'].forEach((k) => set('socials', k, (v) => /^https?:\/\//.test(s(v, 200)) ? s(v, 200) : ''));
    ['enabled', 'pickup', 'delivery'].forEach((k) => set('ordering', k, bool));
    ['taxRate', 'deliveryFee', 'freeDeliveryOver', 'minOrder', 'prepMinutes', 'deliveryMinutes'].forEach((k) => set('ordering', k, (v) => Math.max(0, num(v))));
    set('ordering', 'tips', (v) => (Array.isArray(v) ? v : []).map((x) => Math.min(50, Math.max(0, Math.round(num(x))))).slice(0, 5));
    set('ordering', 'payments', (v) => (Array.isArray(v) ? v : []).map((x) => s(x, 60)).filter(Boolean).slice(0, 6));
    set('reservations', 'enabled', bool);
    ['maxGuests', 'slotMinutes', 'daysAhead', 'coversPerSlot', 'leadMinutes'].forEach((k) => set('reservations', k, (v) => Math.max(k === 'slotMinutes' ? 15 : 0, Math.round(num(v)))));
    set('catering', 'enabled', bool); ['title', 'text'].forEach((k) => set('catering', k, (v) => s(v, 300))); set('catering', 'image', (v) => im(v) || cur.catering.image);
    set('theme', 'accent', (v) => /^#[0-9a-fA-F]{6}$/.test(v) ? v : cur.theme.accent); set('seo', 'title', (v) => s(v, 90)); set('seo', 'description', (v) => s(v, 200));
    if (b.timezone !== undefined) { try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }); o.timezone = b.timezone; } catch (e) { /* keep */ } }
    if (b.currency !== undefined) o.currency = s(b.currency, 4) || '$';
    return o;
  }
  const publicSite = () => ({ settings: db.settings, categories: db.categories, menu: db.menu, team: db.team, reviews: db.reviews.filter((r) => r.visible), gallery: db.gallery, faq: db.faq });
  function isOpen() { const n = nowIn(db.settings.timezone), H = db.settings.hours, h = H[n.dow], pv = H[(n.dow + 6) % 7]; let open = false; if (h && !h.closed) { const o = toMin(h.open), c = toMin(h.close); open = c > o ? n.min >= o && n.min < c : n.min >= o; } if (!open && pv && !pv.closed) { const o = toMin(pv.open), c = toMin(pv.close); if (c <= o) open = n.min < c; } return open; }
  const money = (n) => (db.settings.currency || '$') + (Math.round(n * 100) / 100).toFixed(2);
  const r2 = (n) => Math.round(n * 100) / 100;

  function priceOrder(items, type, promoCode, tipPct) {
    const o = db.settings.ordering, lines = [];
    for (const it of Array.isArray(items) ? items.slice(0, 60) : []) {
      const m = db.menu.find((x) => x.id === it.id), qty = Math.min(50, Math.max(0, Math.round(num(it.qty)))); if (!m || !qty) continue;
      if (!m.available) throw new Error(m.name + ' is currently unavailable.');
      lines.push({ id: m.id, name: m.name, price: m.price, qty, note: str(it.note, 120) });
    }
    if (!lines.length) throw new Error('Your order is empty.');
    const sub = lines.reduce((a, l) => a + l.price * l.qty, 0); if (sub < o.minOrder) throw new Error('Minimum order is ' + money(o.minOrder) + '.');
    let discount = 0, promo = '';
    if (promoCode) {
      const p = db.promos.find((x) => x.active && x.code === str(promoCode, 30).toUpperCase());
      if (!p) throw new Error('That promo code is not valid.'); if (sub < p.min) throw new Error('Code ' + p.code + ' needs a minimum of ' + money(p.min) + '.');
      discount = p.type === 'percent' ? sub * Math.min(100, p.value) / 100 : Math.min(p.value, sub); promo = p.code;
    }
    const tax = (sub - discount) * o.taxRate / 100, delivery = type === 'delivery' && !(o.freeDeliveryOver > 0 && sub >= o.freeDeliveryOver) ? o.deliveryFee : 0, tip = (sub - discount) * Math.min(50, Math.max(0, num(tipPct))) / 100;
    return { lines, sub: r2(sub), discount: r2(discount), promo, tax: r2(tax), delivery: r2(delivery), tip: r2(tip), total: r2(sub - discount + tax + delivery + tip) };
  }

  /* ---------- Router ---------- */
  const E = (status, msg) => ({ status, data: { error: msg } }), OK = (data) => ({ status: 200, data: data || { ok: true } });
  const DEMO_MAIL = 'Preview mode: emails are not sent here. They work on the real server once you add your Resend key.';

  function route(method, path, q, b) {
    b = b || {};
    if (path === '/api/site') return OK(Object.assign(publicSite(), { openNow: isOpen() }));
    if (path === '/api/availability') { const used = {}; db.reservations.filter((x) => x.date === q.get('date') && !['cancelled', 'no_show'].includes(x.status)).forEach((x) => { used[x.time] = (used[x.time] || 0) + x.guests; }); return OK({ used, capacity: db.settings.reservations.coversPerSlot }); }
    if (path === '/api/promo') { const p = db.promos.find((x) => x.active && x.code === str(q.get('code'), 30).toUpperCase()); return p ? OK({ code: p.code, type: p.type, value: p.value, min: p.min }) : E(404, 'That promo code is not valid.'); }
    if (path === '/api/track') {
      const ref = str(q.get('ref'), 20).toUpperCase().replace('#', ''), ph = String(q.get('phone') || '').replace(/\D/g, '').slice(-6);
      const o = db.orders.find((x) => x.ref === ref && String(x.phone).replace(/\D/g, '').slice(-6) === ph && ph.length >= 4);
      return o ? OK({ ref: o.ref, status: o.status, type: o.type, total: o.total, createdAt: o.createdAt, items: o.items.map((i) => ({ name: i.name, qty: i.qty })) }) : E(404, 'We could not find that order. Check the reference and phone number.');
    }
    if (method === 'POST' && ['/api/orders', '/api/reservations', '/api/messages', '/api/subscribe'].includes(path)) {
      if (str(b.website, 50)) return OK();
      if (path === '/api/subscribe') { const e = str(b.email, 120).toLowerCase(); if (!isEmail(e)) return E(400, 'Please enter a valid email address.'); if (!db.subscribers.some((s) => s.email === e)) { db.subscribers.push({ email: e, at: new Date().toISOString() }); save(); } return OK(); }
      if (path === '/api/messages') { const r = { id: uid('m_'), at: new Date().toISOString(), name: str(b.name, 80), email: str(b.email, 120), topic: str(b.topic, 60), message: str(b.message, 2000), read: false }; if (!r.name || !isEmail(r.email) || !r.message) return E(400, 'Please complete all required fields.'); db.messages.unshift(r); save(); return OK(); }
      if (path === '/api/reservations') {
        const rs = db.settings.reservations; if (!rs.enabled) return E(400, 'Online reservations are paused. Please call us.');
        const r = { id: uid('r_'), ref: 'R' + hex(5).toUpperCase(), createdAt: new Date().toISOString(), status: 'new', name: str(b.name, 80), phone: str(b.phone, 30), email: str(b.email, 120).toLowerCase(), date: str(b.date, 10), time: str(b.time, 5), guests: Math.round(num(b.guests)), notes: str(b.notes, 400) };
        if (!r.name || !isPhone(r.phone) || !isEmail(r.email)) return E(400, 'Please provide a valid name, phone and email.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || toMin(r.time) == null) return E(400, 'Please choose a valid date and time.');
        if (r.guests < 1 || r.guests > rs.maxGuests) return E(400, 'For parties over ' + rs.maxGuests + ', please call us.');
        const n = nowIn(db.settings.timezone), h = db.settings.hours[dowOf(r.date)], t0 = toMin(r.time);
        if (!h || h.closed) return E(400, 'We are closed on that day. Please choose another.');
        const open = toMin(h.open); let close = toMin(h.close); if (close <= open) close += 1440; const t = t0 < open ? t0 + 1440 : t0;
        if (r.date < n.date || (r.date === n.date && t < 1440 && t0 < n.min + rs.leadMinutes)) return E(400, 'That time has already passed or is too soon.');
        if (t < open || t > close - 30) return E(400, 'We are closed at that time. Please choose another.');
        const used = db.reservations.filter((x) => x.date === r.date && x.time === r.time && !['cancelled', 'no_show'].includes(x.status)).reduce((a, x) => a + x.guests, 0);
        if (used + r.guests > rs.coversPerSlot) return E(409, 'Sorry, that time is fully booked. Please pick another slot.');
        db.reservations.unshift(r); save(); return OK({ ok: true, ref: r.ref });
      }
      const o = db.settings.ordering; if (!o.enabled) return E(400, 'Online ordering is paused. Please call us.');
      const type = b.type === 'delivery' ? 'delivery' : 'pickup'; if ((type === 'delivery' && !o.delivery) || (type === 'pickup' && !o.pickup)) return E(400, 'That order type is not available right now.');
      let pr; try { pr = priceOrder(b.items, type, b.promo, b.tip); } catch (e) { return E(400, e.message); }
      const ord = { id: uid('o_'), ref: hex(6).toUpperCase(), createdAt: new Date().toISOString(), status: 'new', type, name: str(b.name, 80), phone: str(b.phone, 30), email: str(b.email, 120).toLowerCase(), address: str(b.address, 240), notes: str(b.notes, 400), when: str(b.when, 40) || 'ASAP', pay: str(b.pay, 60), items: pr.lines, sub: pr.sub, discount: pr.discount, promo: pr.promo, tax: pr.tax, delivery: pr.delivery, tip: pr.tip, total: pr.total };
      if (!ord.name || !isPhone(ord.phone)) return E(400, 'Please provide your name and a valid phone number.');
      if (ord.email && !isEmail(ord.email)) return E(400, 'That email address looks invalid.');
      if (type === 'delivery' && ord.address.length < 6) return E(400, 'Please enter a delivery address.');
      db.orders.unshift(ord); save(); return OK({ ok: true, ref: ord.ref, total: ord.total, type, eta: type === 'delivery' ? o.deliveryMinutes : o.prepMinutes });
    }

    /* admin */
    if (!path.startsWith('/api/admin/')) return E(404, 'Not found');
    const r = path.slice(11);
    if (r === 'state') return OK({ setup: true, authed: true, csrf: 'demo', needsKey: false });
    if (r === 'logout' || r === 'login' || r === 'setup') return OK({ ok: true, csrf: 'demo' });
    if (r === 'data') return OK(Object.assign({}, { settings: db.settings, email: Object.assign({}, db.email, { apiKey: '', apiKeySet: false }), categories: db.categories, menu: db.menu, team: db.team, reviews: db.reviews, gallery: db.gallery, faq: db.faq, promos: db.promos, orders: db.orders, reservations: db.reservations, messages: db.messages, subscribers: db.subscribers, emailLog: db.emailLog, adminEmail: db.adminEmail, openNow: isOpen(), statuses: STATUS, meta: { siteUrl: 'preview', secure: true, setupKey: false, version: 'preview' } }));
    if (r === 'pulse') return OK({ orders: db.orders.filter((o) => o.status === 'new').length, reservations: db.reservations.filter((x) => x.status === 'new').length, messages: db.messages.filter((x) => !x.read).length, latest: (db.orders[0] || {}).createdAt || '' });
    if (r === 'settings' && method === 'PUT') { db.settings = cleanSettings(b.settings || {}, db.settings); if (b.email) { db.email.from = str(b.email.from, 160); db.email.notifyTo = str(b.email.notifyTo, 300); db.email.customerEmails = bool(b.email.customerEmails); } save(); return OK({ ok: true, settings: db.settings }); }
    if (r === 'password') return OK();
    if (r === 'email/test' || r === 'campaign') return E(400, DEMO_MAIL);
    if (r === 'upload') {
      const raw = String(b.data || ''), bin = atob(raw.slice(0, 24)), mime = bin.charCodeAt(0) === 0xFF ? 'jpeg' : bin.slice(1, 4) === 'PNG' ? 'png' : bin.slice(0, 4) === 'RIFF' ? 'webp' : bin.slice(0, 3) === 'GIF' ? 'gif' : '';
      if (!mime) return E(400, 'Only JPG, PNG, WEBP or GIF images are allowed.'); if (raw.length > 900000) return E(400, 'In preview mode images must be under ~650KB (the real server allows 6MB).');
      return OK({ url: 'data:image/' + mime + ';base64,' + raw });
    }
    if (r === 'backup') return { status: 200, raw: JSON.stringify({ kilo_backup: 1, at: new Date().toISOString(), data: db, files: {} }), type: 'application/json' };
    if (r === 'restore') { const d = b.data; if (!d || !d.settings || !Array.isArray(d.menu)) return E(400, 'That file is not a Kilo backup.'); const keep = db.email; db = Object.assign(clone(d), { email: keep, adminEmail: db.adminEmail, emailLog: [] }); db.settings = cleanSettings(d.settings, window.__SEED.settings); save(); return OK({ ok: true, images: 0 }); }
    const csv = (rows) => ({ status: 200, type: 'text/csv', raw: rows.map((x) => x.map((v) => { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(',')).join('\n') });
    if (r === 'orders.csv') return csv([['Ref', 'Date', 'Status', 'Type', 'Name', 'Phone', 'Total', 'Items']].concat(db.orders.map((o) => [o.ref, o.createdAt, o.status, o.type, o.name, o.phone, o.total, o.items.map((i) => i.qty + 'x ' + i.name).join('; ')])));
    if (r === 'reservations.csv') return csv([['Ref', 'Date', 'Time', 'Guests', 'Status', 'Name', 'Phone', 'Email', 'Notes']].concat(db.reservations.map((x) => [x.ref, x.date, x.time, x.guests, x.status, x.name, x.phone, x.email, x.notes])));
    if (r === 'subscribers.csv') return csv([['Email', 'Subscribed']].concat(db.subscribers.map((x) => [x.email, x.at])));

    let m = /^(orders|reservations)\/([\w-]+)$/.exec(r);
    if (m && method === 'PATCH') { const rec = db[m[1]].find((x) => x.id === m[2]); if (!rec) return E(404, 'Not found'); if (!STATUS[m[1]].includes(b.status)) return E(400, 'Invalid status.'); rec.status = b.status; save(); return OK({ ok: true, record: rec }); }
    m = /^(orders|reservations|messages)\/([\w-]+)$/.exec(r);
    if (m && method === 'DELETE') { db[m[1]] = db[m[1]].filter((x) => x.id !== m[2]); save(); return OK(); }
    m = /^messages\/([\w-]+)\/read$/.exec(r);
    if (m && method === 'POST') { const x = db.messages.find((y) => y.id === m[1]); if (x) { x.read = bool(b.read); save(); } return OK(); }
    if (r === 'subscribers/delete') { db.subscribers = db.subscribers.filter((x) => x.email !== str(b.email, 120)); save(); return OK(); }
    m = /^(\w+)(?:\/([\w-]+))?$/.exec(r);
    if (m && COLLS.includes(m[1])) {
      const coll = m[1], id = m[2], list = db[coll];
      if (method === 'POST' && !id) { const rec = SCHEMAS[coll](b); if (REQUIRED[coll].some((k) => !rec[k])) return E(400, 'Please fill in the required fields.'); if (coll === 'promos' && list.some((x) => x.code === rec.code)) return E(400, 'That code already exists.'); rec.id = uid(coll[0] + '_'); list.push(rec); save(); return OK({ ok: true, record: rec }); }
      if (method === 'PUT' && id === 'order') { const ids = Array.isArray(b.ids) ? b.ids : [], map = new Map(list.map((x) => [x.id, x])), re = ids.map((i) => map.get(i)).filter(Boolean); list.forEach((x) => { if (!ids.includes(x.id)) re.push(x); }); db[coll] = re; save(); return OK(); }
      if (method === 'PUT' && id) { const i = list.findIndex((x) => x.id === id); if (i < 0) return E(404, 'Not found'); const rec = SCHEMAS[coll](b); if (REQUIRED[coll].some((k) => !rec[k])) return E(400, 'Please fill in the required fields.'); if (coll === 'promos' && list.some((x) => x.code === rec.code && x.id !== id)) return E(400, 'That code already exists.'); rec.id = id; list[i] = rec; save(); return OK({ ok: true, record: rec }); }
      if (method === 'DELETE' && id) { if (coll === 'categories' && db.menu.some((x) => x.cat === id)) return E(400, 'Move or delete the dishes in this category first.'); db[coll] = list.filter((x) => x.id !== id); save(); return OK(); }
    }
    return E(404, 'Not found');
  }

  /* ---------- fetch interception ---------- */
  load();
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const raw = typeof input === 'string' ? input : input.url, u = new URL(raw, 'http://demo.local/');
    if (!/^\/api\//.test(u.pathname)) return realFetch(input, init);
    const method = ((init && init.method) || 'GET').toUpperCase(); let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) { /* ignore */ }
    await new Promise((r) => setTimeout(r, 60));
    let out; try { out = route(method, u.pathname, u.searchParams, body); } catch (e) { out = E(500, 'Preview error: ' + e.message); }
    if (out.raw != null) return new Response(out.raw, { status: out.status, headers: { 'Content-Type': out.type } });
    return new Response(JSON.stringify(out.data), { status: out.status, headers: { 'Content-Type': 'application/json' } });
  };
})();
