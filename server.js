'use strict';
/* Kilo Kitchen: restaurant server. Zero dependencies (Node 18+). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// ---------- Config ----------
try { // tiny .env loader
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !l.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
} catch (e) { /* no .env */ }

const PORT = +process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOADS = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SETUP_KEY = process.env.ADMIN_SETUP_KEY || '';
fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- Database (JSON file, atomic writes) ----------
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => (p || '') + crypto.randomBytes(5).toString('hex');
const seed = JSON.parse(fs.readFileSync(path.join(PUB, 'assets', 'default-data.json'), 'utf8'));
let db;
function load() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) {
    db = clone(seed);
    Object.assign(db, { orders: [], reservations: [], messages: [], subscribers: [], emailLog: [], admin: null, secret: crypto.randomBytes(32).toString('hex'),
      email: { apiKey: '', from: '', notifyTo: '', customerEmails: true } });
    save();
  }
  // forward-compat: fill any missing keys (including new nested settings) from the defaults
  for (const k of Object.keys(seed)) if (db[k] === undefined) db[k] = clone(seed[k]);
  db.settings = fillDefaults(seed.settings, db.settings);
  if (!db.secret) db.secret = crypto.randomBytes(32).toString('hex');
  if (!db.email) db.email = { apiKey: '', from: '', notifyTo: '', customerEmails: true };
}
function fillDefaults(def, cur) {
  if (Array.isArray(def) || def === null || typeof def !== 'object') return cur === undefined ? clone(def) : cur;
  const out = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {};
  for (const k of Object.keys(def)) out[k] = fillDefaults(def[k], out[k]);
  return out;
}
function newRef(list, prefix) { let r; do { r = (prefix || '') + crypto.randomBytes(3).toString('hex').toUpperCase(); } while (list.some((x) => x.ref === r)); return r; }
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
  autoBackup();
}
function autoBackup() { // one safety copy per day, keep the last 14
  try {
    const dir = path.join(DATA_DIR, 'backups'), f = path.join(dir, 'db-' + new Date().toISOString().slice(0, 10) + '.json');
    if (fs.existsSync(f)) return;
    fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(DB_FILE, f);
    fs.readdirSync(dir).filter((x) => /^db-.*\.json$/.test(x)).sort().slice(0, -14).forEach((x) => fs.unlinkSync(path.join(dir, x)));
  } catch (e) { /* non-fatal */ }
}
load();

// ---------- Helpers ----------
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n || 200);
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : (d || 0); };
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (db.settings.currency || '$') + (Math.round(n * 100) / 100).toFixed(2);
const isEmail = (e) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const isPhone = (p) => String(p).replace(/\D/g, '').length >= 7;
const imgOk = (p) => /^(assets\/img\/|\/uploads\/|https:\/\/)[^\s"'<>]{1,300}$/.test(p) || p === '';

function nowIn(tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  } catch (e) { return nowIn('UTC'); }
  const g = (t) => parts.find((p) => p.type === t).value;
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), min: (+g('hour')) * 60 + (+g('minute')), date: g('year') + '-' + g('month') + '-' + g('day') };
}
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
function dowOf(dateISO) { const [y, m, d] = dateISO.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

// ---------- Sessions & rate limiting ----------
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const sessions = new Map(); // sha256(token) -> {exp, csrf}; persisted so restarts/redeploys don't log the owner out
for (const [k, s] of Object.entries(db.sessions || {})) if (s.exp > Date.now()) sessions.set(k, s);
function persistSessions() { db.sessions = Object.fromEntries(sessions); save(); }
const hits = new Map();     // key -> [timestamps]
function limited(key, max, windowMs) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => {
  const now = Date.now();
  let changed = false; for (const [k, s] of sessions) if (s.exp < now) { sessions.delete(k); changed = true; } if (changed) persistSessions();
  for (const [k, a] of hits) if (!a.length || now - a[a.length - 1] > 3600e3) hits.delete(k);
}, 600e3).unref();

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
function cookies(req) {
  const o = {}; (req.headers.cookie || '').split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return o;
}
function session(req) {
  const t = cookies(req).kk_sid, s = t && sessions.get(sha(t));
  if (s && s.exp > Date.now()) return Object.assign({ token: sha(t) }, s);
  return null;
}
function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPw(pw, rec) {
  if (!rec) return false;
  const a = Buffer.from(crypto.scryptSync(pw, rec.salt, 64).toString('hex')), b = Buffer.from(rec.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function startSession(req, res) {
  const token = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(16).toString('hex');
  sessions.set(sha(token), { exp: Date.now() + 12 * 3600e3, csrf }); persistSessions();
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `kk_sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12 * 3600}${secure ? '; Secure' : ''}`);
  return csrf;
}

// ---------- Email (Resend API over HTTPS) ----------
function logMail(to, subject, ok, error) {
  db.emailLog.unshift({ at: new Date().toISOString(), to, subject, ok, error: error || '' });
  db.emailLog.length = Math.min(db.emailLog.length, 60); save();
}
async function sendMail(to, subject, html) {
  const c = db.email;
  if (!c.apiKey || !c.from || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + c.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.from, to: Array.isArray(to) ? to : [to], subject, html })
    });
    if (!r.ok) { const t = await r.text(); logMail(String(to), subject, false, r.status + ' ' + t.slice(0, 200)); return false; }
    logMail(String(to), subject, true); return true;
  } catch (e) { logMail(String(to), subject, false, String(e.message || e)); return false; }
}
function mailShell(title, inner) {
  const accent = db.settings.theme.accent || '#E0521B';
  return `<div style="font-family:Arial,sans-serif;background:#f6f1ea;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
  <div style="background:${esc(accent)};color:#fff;padding:20px 26px;font-size:20px;font-weight:700">${esc(db.settings.brand.name)}</div>
  <div style="padding:26px;color:#241a15;line-height:1.6"><h2 style="margin:0 0 12px">${esc(title)}</h2>${inner}</div>
  <div style="padding:14px 26px;background:#faf5ef;color:#7a6a5f;font-size:12px">${esc([db.settings.contact.address, db.settings.contact.phone].filter(Boolean).join(' · '))}</div></div></div>`;
}
const notifyOwner = (subject, inner) => db.email.notifyTo && sendMail(db.email.notifyTo.split(',').map((s) => s.trim()).filter(Boolean), subject, mailShell(subject, inner));
const notifyCustomer = (to, subject, inner) => db.email.customerEmails && to && sendMail(to, subject, mailShell(subject, inner));
const unsubToken = (e) => crypto.createHmac('sha256', db.secret).update(e).digest('hex').slice(0, 24);

// ---------- Schemas for admin CRUD ----------
const DIETS = ['V', 'VG', 'GF', 'Halal', 'Spicy'];
const SCHEMAS = {
  menu: (b) => ({ name: str(b.name, 120), desc: str(b.desc, 500), price: Math.max(0, num(b.price)), cat: str(b.cat, 40), img: imgOk(str(b.img, 300)) ? str(b.img, 300) : '', tag: str(b.tag, 40), diet: (Array.isArray(b.diet) ? b.diet : []).filter((d) => DIETS.includes(d)), available: bool(b.available), featured: bool(b.featured), calories: Math.max(0, Math.round(num(b.calories))) }),
  categories: (b) => ({ name: str(b.name, 60) }),
  team: (b) => ({ name: str(b.name, 80), role: str(b.role, 80), bio: str(b.bio, 400), img: imgOk(str(b.img, 300)) ? str(b.img, 300) : '' }),
  reviews: (b) => ({ name: str(b.name, 80), role: str(b.role, 80), text: str(b.text, 600), rating: Math.min(5, Math.max(1, Math.round(num(b.rating, 5)))), img: imgOk(str(b.img, 300)) ? str(b.img, 300) : '', visible: bool(b.visible) }),
  gallery: (b) => ({ src: imgOk(str(b.src, 300)) ? str(b.src, 300) : '', alt: str(b.alt, 160) }),
  faq: (b) => ({ q: str(b.q, 200), a: str(b.a, 800) }),
  promos: (b) => ({ code: str(b.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, ''), type: b.type === 'fixed' ? 'fixed' : 'percent', value: Math.max(0, num(b.value)), min: Math.max(0, num(b.min)), active: bool(b.active), note: str(b.note, 120) })
};
const REQUIRED = { menu: ['name'], categories: ['name'], team: ['name'], reviews: ['name', 'text'], gallery: ['src'], faq: ['q', 'a'], promos: ['code'] };

function cleanSettings(b, cur) {
  const o = clone(cur), s = (v, n) => str(v, n);
  const set = (grp, key, fn) => { if (b[grp] && b[grp][key] !== undefined) o[grp][key] = fn(b[grp][key]); };
  set('brand', 'name', (v) => s(v, 60) || cur.brand.name); set('brand', 'tagline', (v) => s(v, 80)); set('brand', 'logo', (v) => imgOk(s(v, 300)) ? s(v, 300) : cur.brand.logo);
  ['eyebrow', 'title', 'accent', 'subtitle'].forEach((k) => set('hero', k, (v) => s(v, k === 'subtitle' ? 300 : 120)));
  ['image', 'image2', 'image3'].forEach((k) => set('hero', k, (v) => imgOk(s(v, 300)) ? s(v, 300) : cur.hero[k]));
  set('announcement', 'enabled', bool); ['text', 'linkText'].forEach((k) => set('announcement', k, (v) => s(v, 200))); set('announcement', 'linkHref', (v) => /^(#|\/|https?:\/\/|mailto:|tel:)/.test(s(v, 200)) ? s(v, 200) : '');
  set('special', 'enabled', bool); ['title', 'name', 'text', 'menuId'].forEach((k) => set('special', k, (v) => s(v, 200))); set('special', 'price', (v) => Math.max(0, num(v)));
  ['eyebrow', 'title'].forEach((k) => set('about', k, (v) => s(v, 120))); ['text1', 'text2'].forEach((k) => set('about', k, (v) => s(v, 800)));
  set('about', 'bullets', (v) => (Array.isArray(v) ? v : []).map((x) => s(x, 160)).filter(Boolean).slice(0, 8));
  ['image', 'image2'].forEach((k) => set('about', k, (v) => imgOk(s(v, 300)) ? s(v, 300) : cur.about[k]));
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
  set('catering', 'enabled', bool); ['title', 'text'].forEach((k) => set('catering', k, (v) => s(v, 300)));
  set('catering', 'image', (v) => imgOk(s(v, 300)) ? s(v, 300) : cur.catering.image);
  set('theme', 'accent', (v) => /^#[0-9a-fA-F]{6}$/.test(v) ? v : cur.theme.accent);
  set('seo', 'title', (v) => s(v, 90)); set('seo', 'description', (v) => s(v, 200));
  if (b.timezone !== undefined) { try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }); o.timezone = b.timezone; } catch (e) { /* keep */ } }
  if (b.currency !== undefined) o.currency = s(b.currency, 4) || '$';
  return o;
}

// ---------- Public data ----------
function publicSite() {
  return { settings: db.settings, categories: db.categories, menu: db.menu, team: db.team, reviews: db.reviews.filter((r) => r.visible), gallery: db.gallery, faq: db.faq };
}
function isOpen() {
  const n = nowIn(db.settings.timezone), H = db.settings.hours, h = H[n.dow], pv = H[(n.dow + 6) % 7];
  let open = false;
  if (h && !h.closed) { const o = toMin(h.open), c = toMin(h.close); open = c > o ? n.min >= o && n.min < c : n.min >= o; }
  if (!open && pv && !pv.closed) { const o = toMin(pv.open), c = toMin(pv.close); if (c <= o) open = n.min < c; } // yesterday's late-night hours spilling past midnight
  return open;
}

// ---------- HTTP plumbing ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const COMPRESS = /^(text\/|application\/(javascript|json|xml|manifest))/;

function baseHeaders(req) {
  const h = {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-src https://www.google.com https://maps.google.com https://www.openstreetmap.org; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'"
  };
  if (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') h['Strict-Transport-Security'] = 'max-age=31536000';
  if (req.url.startsWith('/admin') || req.url.startsWith('/api/')) h['X-Robots-Tag'] = 'noindex, nofollow';
  return h;
}
function send(req, res, code, body, type, extra) {
  const headers = Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8' }, baseHeaders(req), extra || {});
  if (typeof body === 'object' && !Buffer.isBuffer(body)) body = JSON.stringify(body);
  if (!Buffer.isBuffer(body)) body = Buffer.from(body);
  if (COMPRESS.test(headers['Content-Type']) && body.length > 900 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    body = zlib.gzipSync(body); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = body.length;
  if (req._tooLarge) { headers.Connection = 'close'; res.on('finish', () => req.destroy()); code = code === 200 ? 200 : (code === 400 ? 413 : code); }
  res.writeHead(code, headers); res.end(req.method === 'HEAD' ? undefined : body);
}
const json = (req, res, code, obj, extra) => send(req, res, code, obj, null, Object.assign({ 'Cache-Control': 'no-store' }, extra));
const fail = (req, res, code, msg) => json(req, res, code, { error: msg });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { req._tooLarge = true; req.pause(); reject(new Error('too_large')); } else if (!req._tooLarge) chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

const fileCache = new Map();
function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(req, res);
    let c = fileCache.get(file);
    if (!c || c.mtime !== st.mtimeMs || c.size !== st.size) {
      const raw = fs.readFileSync(file), type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      c = { mtime: st.mtimeMs, size: st.size, type, raw, etag: '"' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 20) + '"', gz: COMPRESS.test(type) && raw.length > 900 ? zlib.gzipSync(raw) : null };
      if (fileCache.size > 300) fileCache.clear();
      fileCache.set(file, c);
    }
    const headers = Object.assign({ 'Content-Type': c.type, ETag: c.etag, Vary: 'Accept-Encoding', 'Cache-Control': cache || (/^(image|font)\//.test(c.type) ? 'public, max-age=86400' : 'no-cache') }, baseHeaders(req));
    if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, headers); return res.end(); }
    let body = c.raw; if (c.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = c.gz; headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = body.length; res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body);
  });
}
function notFound(req, res) {
  const p = path.join(PUB, '404.html');
  if (req.url.startsWith('/api/')) return fail(req, res, 404, 'Not found');
  fs.readFile(p, (e, b) => send(req, res, 404, e ? 'Not found' : b, 'text/html; charset=utf-8'));
}

function jsonLd() {
  const s = db.settings, DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ld = { '@context': 'https://schema.org', '@type': 'Restaurant', name: s.brand.name, description: s.seo.description, servesCuisine: s.brand.tagline, telephone: s.contact.phone || undefined, email: s.contact.email || undefined, address: s.contact.address || undefined, acceptsReservations: !!s.reservations.enabled, url: SITE_URL || undefined,
    image: (SITE_URL || '') + '/' + s.hero.image.replace(/^\//, ''), openingHoursSpecification: s.hours.map((h, i) => h.closed ? null : { '@type': 'OpeningHoursSpecification', dayOfWeek: DAYN[i], opens: h.open, closes: h.close }).filter(Boolean) };
  return '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>';
}
function renderIndex(req, res) {
  let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const s = db.settings, data = JSON.stringify(publicSite()).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  const R = (v) => () => v; // function replacers: user text containing $& or $' must never be interpreted
  html = html.replace(/{{TITLE}}/g, R(esc(s.seo.title))).replace(/{{DESC}}/g, R(esc(s.seo.description))).replace(/{{ACCENT}}/g, R(esc(s.theme.accent)))
    .replace(/{{OGIMG}}/g, R(esc((SITE_URL || '') + '/assets/img/og.jpg'))).replace(/{{OGURL}}/g, R(esc(SITE_URL ? SITE_URL + '/' : ''))).replace('{{JSONLD}}', R(jsonLd())).replace('{{CANON}}', R(esc(SITE_URL ? SITE_URL + '/' : ''))).replace('{{SITE_DATA}}', R(data));
  send(req, res, 200, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
}

// ---------- Order math ----------
function priceOrder(items, type, promoCode, tipPct) {
  const o = db.settings.ordering, lines = [];
  for (const it of Array.isArray(items) ? items.slice(0, 60) : []) {
    const m = db.menu.find((x) => x.id === it.id), qty = Math.min(50, Math.max(0, Math.round(num(it.qty))));
    if (!m || !qty) continue;
    if (!m.available) throw new Error(m.name + ' is currently unavailable.');
    lines.push({ id: m.id, name: m.name, price: m.price, qty, note: str(it.note, 120) });
  }
  if (!lines.length) throw new Error('Your order is empty.');
  const sub = lines.reduce((a, l) => a + l.price * l.qty, 0);
  if (sub < o.minOrder) throw new Error('Minimum order is ' + money(o.minOrder) + '.');
  let discount = 0, promo = '';
  if (promoCode) {
    const p = db.promos.find((x) => x.active && x.code === str(promoCode, 30).toUpperCase());
    if (!p) throw new Error('That promo code is not valid.');
    if (sub < p.min) throw new Error('Code ' + p.code + ' needs a minimum of ' + money(p.min) + '.');
    discount = p.type === 'percent' ? sub * Math.min(100, p.value) / 100 : Math.min(p.value, sub); promo = p.code;
  }
  const tax = (sub - discount) * o.taxRate / 100;
  const delivery = type === 'delivery' && !(o.freeDeliveryOver > 0 && sub >= o.freeDeliveryOver) ? o.deliveryFee : 0;
  const tip = (sub - discount) * Math.min(50, Math.max(0, num(tipPct))) / 100;
  const r = (n) => Math.round(n * 100) / 100;
  return { lines, sub: r(sub), discount: r(discount), promo, tax: r(tax), delivery: r(delivery), tip: r(tip), total: r(sub - discount + tax + delivery + tip) };
}

function itemsHtml(lines) {
  return '<table style="width:100%;border-collapse:collapse">' + lines.map((l) => `<tr><td style="padding:4px 0">${l.qty} × ${esc(l.name)}${l.note ? ' <i>(' + esc(l.note) + ')</i>' : ''}</td><td style="text-align:right">${esc(money(l.price * l.qty))}</td></tr>`).join('') + '</table>';
}

// ---------- Routes ----------
const STATUS = { orders: ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'], reservations: ['new', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'] };
const COLLS = Object.keys(SCHEMAS);

async function handle(req, res) {
  let url, p; try { url = new URL(req.url, 'http://x'); p = decodeURIComponent(url.pathname); } catch (e) { return fail(req, res, 400, 'Bad request'); }
  const m = req.method;
  const ip = clientIp(req);

  // ----- Public API -----
  if (p === '/api/site' && m === 'GET') return json(req, res, 200, Object.assign(publicSite(), { openNow: isOpen() }));
  if (p === '/healthz') return json(req, res, 200, { ok: true });

  if (p === '/api/availability' && m === 'GET') {
    const date = str(url.searchParams.get('date'), 10), r = db.settings.reservations, used = {};
    db.reservations.filter((x) => x.date === date && !['cancelled', 'no_show'].includes(x.status)).forEach((x) => { used[x.time] = (used[x.time] || 0) + x.guests; });
    return json(req, res, 200, { used, capacity: r.coversPerSlot });
  }
  if (p === '/api/promo' && m === 'GET') {
    if (limited('promo' + ip, 30, 600e3)) return fail(req, res, 429, 'Too many attempts. Try again later.');
    const code = str(url.searchParams.get('code'), 30).toUpperCase(), pr = db.promos.find((x) => x.active && x.code === code);
    return pr ? json(req, res, 200, { code: pr.code, type: pr.type, value: pr.value, min: pr.min }) : fail(req, res, 404, 'That promo code is not valid.');
  }
  if (p === '/api/track' && m === 'GET') {
    if (limited('trk' + ip, 30, 600e3)) return fail(req, res, 429, 'Too many attempts. Try again later.');
    const ref = str(url.searchParams.get('ref'), 20).toUpperCase().replace('#', ''), ph = String(url.searchParams.get('phone') || '').replace(/\D/g, '').slice(-6);
    const o = db.orders.find((x) => x.ref === ref && String(x.phone).replace(/\D/g, '').slice(-6) === ph && ph.length >= 4);
    if (!o) return fail(req, res, 404, 'We could not find that order. Check the reference and phone number.');
    return json(req, res, 200, { ref: o.ref, status: o.status, type: o.type, total: o.total, createdAt: o.createdAt, items: o.items.map((i) => ({ name: i.name, qty: i.qty })) });
  }
  if (p === '/unsubscribe' && m === 'GET') {
    const e = str(url.searchParams.get('e'), 120).toLowerCase();
    if (e && url.searchParams.get('t') === unsubToken(e)) { db.subscribers = db.subscribers.filter((s) => s.email !== e); save(); }
    return send(req, res, 200, '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>You have been unsubscribed.</h2><p><a href="/">Back to the site</a></p>', 'text/html; charset=utf-8');
  }

  if (m === 'POST' && ['/api/orders', '/api/reservations', '/api/messages', '/api/subscribe'].includes(p)) {
    if (limited('pub' + ip, 25, 600e3)) return fail(req, res, 429, 'Too many requests. Please wait a few minutes.');
    let b; try { b = await readBody(req, 64 * 1024); } catch (e) { return fail(req, res, 400, 'Invalid request.'); }
    if (str(b.website, 50)) return json(req, res, 200, { ok: true }); // honeypot: silently drop bots

    if (p === '/api/subscribe') {
      const e = str(b.email, 120).toLowerCase();
      if (!isEmail(e)) return fail(req, res, 400, 'Please enter a valid email address.');
      if (!db.subscribers.some((s) => s.email === e)) { db.subscribers.push({ email: e, at: new Date().toISOString() }); save(); }
      return json(req, res, 200, { ok: true });
    }
    if (p === '/api/messages') {
      const r = { id: uid('m_'), at: new Date().toISOString(), name: str(b.name, 80), email: str(b.email, 120), topic: str(b.topic, 60), message: str(b.message, 2000), read: false };
      if (!r.name || !isEmail(r.email) || !r.message) return fail(req, res, 400, 'Please complete all required fields.');
      db.messages.unshift(r); save();
      notifyOwner('New message: ' + r.topic, `<p><b>${esc(r.name)}</b> (${esc(r.email)})</p><p>${esc(r.message).replace(/\n/g, '<br>')}</p>`);
      return json(req, res, 200, { ok: true });
    }
    if (p === '/api/reservations') {
      const rs = db.settings.reservations;
      if (!rs.enabled) return fail(req, res, 400, 'Online reservations are paused. Please call us.');
      const r = { id: uid('r_'), ref: newRef(db.reservations, 'R'), createdAt: new Date().toISOString(), status: 'new', name: str(b.name, 80), phone: str(b.phone, 30), email: str(b.email, 120).toLowerCase(), date: str(b.date, 10), time: str(b.time, 5), guests: Math.round(num(b.guests)), notes: str(b.notes, 400) };
      if (!r.name || !isPhone(r.phone) || !isEmail(r.email)) return fail(req, res, 400, 'Please provide a valid name, phone and email.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || toMin(r.time) == null) return fail(req, res, 400, 'Please choose a valid date and time.');
      if (r.guests < 1 || r.guests > rs.maxGuests) return fail(req, res, 400, `For parties over ${rs.maxGuests}, please call us.`);
      const n = nowIn(db.settings.timezone), day = dowOf(r.date), h = db.settings.hours[day], t0 = toMin(r.time);
      if (!h || h.closed) return fail(req, res, 400, 'We are closed on that day. Please choose another.');
      const open = toMin(h.open); let close = toMin(h.close); if (close <= open) close += 1440; // overnight hours
      const t = t0 < open ? t0 + 1440 : t0;
      if (r.date < n.date || (r.date === n.date && t < 1440 && t0 < n.min + rs.leadMinutes)) return fail(req, res, 400, 'That time has already passed or is too soon.');
      if (t < open || t > close - 30) return fail(req, res, 400, 'We are closed at that time. Please choose another.');
      const used = db.reservations.filter((x) => x.date === r.date && x.time === r.time && !['cancelled', 'no_show'].includes(x.status)).reduce((a, x) => a + x.guests, 0);
      if (used + r.guests > rs.coversPerSlot) return fail(req, res, 409, 'Sorry, that time is fully booked. Please pick another slot.');
      db.reservations.unshift(r); save();
      notifyOwner('New reservation ' + r.ref, `<p><b>${esc(r.name)}</b>, party of ${r.guests}<br>${esc(r.date)} at ${esc(r.time)}<br>${esc(r.phone)} · ${esc(r.email)}</p>${r.notes ? '<p><i>' + esc(r.notes) + '</i></p>' : ''}`);
      notifyCustomer(r.email, 'Reservation received: ' + db.settings.brand.name, `<p>Hi ${esc(r.name)}, we have your request for <b>${r.guests}</b> on <b>${esc(r.date)} at ${esc(r.time)}</b>.</p><p>Reference: <b>${r.ref}</b>. We will confirm shortly.</p>`);
      return json(req, res, 200, { ok: true, ref: r.ref });
    }
    if (p === '/api/orders') {
      const o = db.settings.ordering;
      if (!o.enabled) return fail(req, res, 400, 'Online ordering is paused. Please call us.');
      const type = b.type === 'delivery' ? 'delivery' : 'pickup';
      if ((type === 'delivery' && !o.delivery) || (type === 'pickup' && !o.pickup)) return fail(req, res, 400, 'That order type is not available right now.');
      let price; try { price = priceOrder(b.items, type, b.promo, b.tip); } catch (e) { return fail(req, res, 400, e.message); }
      const ord = Object.assign({ id: uid('o_'), ref: newRef(db.orders), createdAt: new Date().toISOString(), status: 'new', type, name: str(b.name, 80), phone: str(b.phone, 30), email: str(b.email, 120).toLowerCase(), address: str(b.address, 240), notes: str(b.notes, 400), when: str(b.when, 40) || 'ASAP', pay: str(b.pay, 60) }, { items: price.lines, sub: price.sub, discount: price.discount, promo: price.promo, tax: price.tax, delivery: price.delivery, tip: price.tip, total: price.total });
      if (!ord.name || !isPhone(ord.phone)) return fail(req, res, 400, 'Please provide your name and a valid phone number.');
      if (ord.email && !isEmail(ord.email)) return fail(req, res, 400, 'That email address looks invalid.');
      if (type === 'delivery' && ord.address.length < 6) return fail(req, res, 400, 'Please enter a delivery address.');
      db.orders.unshift(ord); save();
      const body = itemsHtml(ord.items) + `<p style="border-top:1px solid #eee;padding-top:8px">Total: <b>${esc(money(ord.total))}</b> · ${esc(ord.type)} · ${esc(ord.when)}</p>`;
      notifyOwner('New order #' + ord.ref, `<p><b>${esc(ord.name)}</b> · ${esc(ord.phone)}${ord.address ? '<br>' + esc(ord.address) : ''}</p>${body}${ord.notes ? '<p><i>' + esc(ord.notes) + '</i></p>' : ''}`);
      notifyCustomer(ord.email, `We got your order #${ord.ref}`, `<p>Thanks ${esc(ord.name)}! Your order is in.</p>${body}<p>Track it any time on our site with reference <b>${ord.ref}</b>.</p>`);
      return json(req, res, 200, { ok: true, ref: ord.ref, total: ord.total, type: ord.type, eta: type === 'delivery' ? o.deliveryMinutes : o.prepMinutes });
    }
  }

  // ----- Admin API -----
  if (p.startsWith('/api/admin/')) {
    const route = p.slice(11);
    if (route === 'state' && m === 'GET') {
      const s = session(req);
      return json(req, res, 200, { setup: !!db.admin, authed: !!s, csrf: s ? s.csrf : null, needsKey: !db.admin && !!SETUP_KEY });
    }
    if (route === 'setup' && m === 'POST') {
      if (db.admin) return fail(req, res, 403, 'Admin already exists.');
      if (limited('setup' + ip, 10, 900e3)) return fail(req, res, 429, 'Too many attempts.');
      let b; try { b = await readBody(req, 4096); } catch (e) { return fail(req, res, 400, 'Invalid request.'); }
      if (SETUP_KEY && b.key !== SETUP_KEY) return fail(req, res, 403, 'Wrong setup key.');
      if (!isEmail(str(b.email, 120)) || String(b.password || '').length < 10) return fail(req, res, 400, 'Use a valid email and a password of at least 10 characters.');
      db.admin = Object.assign({ email: str(b.email, 120).toLowerCase() }, hashPw(String(b.password)));
      if (!db.email.notifyTo) db.email.notifyTo = db.admin.email;
      save();
      return json(req, res, 200, { ok: true, csrf: startSession(req, res) });
    }
    if (route === 'login' && m === 'POST') {
      if (limited('login' + ip, 8, 900e3)) return fail(req, res, 429, 'Too many attempts. Try again in 15 minutes.');
      let b; try { b = await readBody(req, 4096); } catch (e) { return fail(req, res, 400, 'Invalid request.'); }
      if (!db.admin || str(b.email, 120).toLowerCase() !== db.admin.email || !checkPw(String(b.password || ''), db.admin)) return fail(req, res, 401, 'Wrong email or password.');
      return json(req, res, 200, { ok: true, csrf: startSession(req, res) });
    }
    // everything below requires auth
    const s = session(req);
    if (!s) return fail(req, res, 401, 'Please sign in.');
    if (m !== 'GET' && req.headers['x-csrf'] !== s.csrf) return fail(req, res, 403, 'Security check failed. Refresh and try again.');
    if (route === 'logout' && m === 'POST') { sessions.delete(s.token); persistSessions(); res.setHeader('Set-Cookie', 'kk_sid=; Path=/; Max-Age=0'); return json(req, res, 200, { ok: true }); }

    if (route === 'data' && m === 'GET') {
      const e = Object.assign({}, db.email, { apiKey: '', apiKeySet: !!db.email.apiKey });
      return json(req, res, 200, { settings: db.settings, email: e, categories: db.categories, menu: db.menu, team: db.team, reviews: db.reviews, gallery: db.gallery, faq: db.faq, promos: db.promos, orders: db.orders, reservations: db.reservations, messages: db.messages, subscribers: db.subscribers, emailLog: db.emailLog, adminEmail: db.admin.email, openNow: isOpen(), statuses: STATUS, meta: { siteUrl: SITE_URL, secure: !!(req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https'), setupKey: !!SETUP_KEY, version: '1.0.5' } });
    }
    if (route === 'pulse' && m === 'GET') {
      return json(req, res, 200, { orders: db.orders.filter((o) => o.status === 'new').length, reservations: db.reservations.filter((r) => r.status === 'new').length, messages: db.messages.filter((x) => !x.read).length, latest: (db.orders[0] || {}).createdAt || '' });
    }
    let b = {};
    if (m !== 'GET' && m !== 'DELETE') { try { b = await readBody(req, route === 'upload' ? 9 * 1024 * 1024 : route === 'restore' ? 150 * 1024 * 1024 : 256 * 1024); } catch (e) { return fail(req, res, e.message === 'too_large' ? 413 : 400, e.message === 'too_large' ? 'File too large.' : 'Invalid request.'); } }

    if (route === 'settings' && m === 'PUT') {
      db.settings = cleanSettings(b.settings || {}, db.settings);
      if (b.email) {
        const e = b.email;
        if (e.apiKey) db.email.apiKey = str(e.apiKey, 200);
        if (e.clearKey) db.email.apiKey = '';
        db.email.from = str(e.from, 160); db.email.notifyTo = str(e.notifyTo, 300); db.email.customerEmails = bool(e.customerEmails);
      }
      save(); return json(req, res, 200, { ok: true, settings: db.settings });
    }
    if (route === 'backup' && m === 'GET') {
      const snap = clone(db); delete snap.admin; delete snap.secret; delete snap.emailLog; delete snap.sessions; snap.email.apiKey = '';
      const files = {}; try { fs.readdirSync(UPLOADS).forEach((f) => { files[f] = fs.readFileSync(path.join(UPLOADS, f)).toString('base64'); }); } catch (e) { /* none */ }
      return send(req, res, 200, JSON.stringify({ kilo_backup: 1, at: new Date().toISOString(), data: snap, files }), 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="kilo-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
    }
    if (route === 'restore' && m === 'POST') {
      const d = b && b.data; if (!b || b.kilo_backup !== 1 || !d || !d.settings) return fail(req, res, 400, 'That file is not a Kilo backup.');
      for (const k of ['categories', 'menu', 'team', 'reviews', 'gallery', 'faq', 'promos', 'orders', 'reservations', 'messages', 'subscribers']) if (!Array.isArray(d[k])) return fail(req, res, 400, 'Backup is incomplete (' + k + ').');
      // photos uploaded in the single-file preview are data: URLs; turn them into real uploaded files
      const mat = (v) => {
        const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(v); if (!m) return v;
        const buf = Buffer.from(m[2], 'base64'); if (buf.length < 100 || buf.length > 8 * 1024 * 1024) return '';
        const name = Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]); fs.writeFileSync(path.join(UPLOADS, name), buf); return '/uploads/' + name;
      };
      const walk = (o) => { if (typeof o === 'string') return mat(o); if (Array.isArray(o)) return o.map(walk); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = walk(o[k]); } return o; };
      walk(d);
      autoBackup(); try { fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true }); fs.copyFileSync(DB_FILE, path.join(DATA_DIR, 'backups', 'before-restore-' + Date.now() + '.json')); } catch (e) { /* ignore */ }
      db.settings = cleanSettings(d.settings, seed.settings);
      for (const k of COLLS) db[k] = d[k].map((r) => Object.assign(SCHEMAS[k](r), { id: str(r.id, 40) || uid(k[0] + '_') }));
      for (const k of ['orders', 'reservations', 'messages', 'subscribers']) db[k] = d[k];
      let n = 0; for (const [name, b64] of Object.entries(b.files || {})) {
        if (!/^[\w.-]{1,80}$/.test(name)) continue; const buf = Buffer.from(String(b64), 'base64');
        const okImg = (buf[0] === 0xFF && buf[1] === 0xD8) || buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a' || buf.slice(0, 4).toString() === 'RIFF' || buf.slice(0, 3).toString() === 'GIF';
        if (okImg && buf.length < 8 * 1024 * 1024) { fs.writeFileSync(path.join(UPLOADS, name), buf); n++; }
      }
      save(); return json(req, res, 200, { ok: true, images: n });
    }
    if (route === 'password' && m === 'POST') {
      if (!checkPw(String(b.current || ''), db.admin)) return fail(req, res, 400, 'Current password is wrong.');
      if (String(b.password || '').length < 10) return fail(req, res, 400, 'New password must be at least 10 characters.');
      db.admin = Object.assign({ email: isEmail(str(b.email, 120)) ? str(b.email, 120).toLowerCase() : db.admin.email }, hashPw(String(b.password)));
      for (const k of Array.from(sessions.keys())) if (k !== s.token) sessions.delete(k); // sign out every other device
      persistSessions();
      return json(req, res, 200, { ok: true });
    }
    if (route === 'email/test' && m === 'POST') {
      const to = str(b.to, 120) || db.admin.email;
      if (!db.email.apiKey || !db.email.from) return fail(req, res, 400, 'Save your Resend API key and From address first.');
      const ok = await sendMail(to, 'Test email from ' + db.settings.brand.name, mailShell('It works!', '<p>Your email settings are configured correctly.</p>'));
      return ok ? json(req, res, 200, { ok: true }) : fail(req, res, 502, 'Sending failed: ' + ((db.emailLog[0] || {}).error || 'unknown error'));
    }
    if (route === 'campaign' && m === 'POST') {
      const subject = str(b.subject, 150), body = str(b.body, 5000);
      if (!subject || !body) return fail(req, res, 400, 'Subject and message are required.');
      if (!db.email.apiKey || !db.email.from) return fail(req, res, 400, 'Configure email first (Settings, Email).');
      if (!SITE_URL) return fail(req, res, 400, 'Set the SITE_URL setting on your host first, so the unsubscribe link in every email works.');
      const list = db.subscribers.slice(0, 500);
      (async () => { // send in the background so the admin request never times out
        for (const sub of list) {
          const link = `${SITE_URL}/unsubscribe?e=${encodeURIComponent(sub.email)}&t=${unsubToken(sub.email)}`;
          await sendMail(sub.email, subject, mailShell(subject, '<p>' + esc(body).replace(/\n/g, '<br>') + `</p><p style="font-size:12px;color:#999"><a href="${esc(link)}">Unsubscribe</a></p>`));
          await new Promise((r) => setTimeout(r, 150));
        }
      })();
      return json(req, res, 200, { ok: true, queued: list.length });
    }
    if (route === 'upload' && m === 'POST') {
      const data = Buffer.from(String(b.data || ''), 'base64');
      if (data.length < 100 || data.length > 6 * 1024 * 1024) return fail(req, res, 400, 'Image must be under 6MB.');
      let ext = null;
      if (data[0] === 0xFF && data[1] === 0xD8) ext = 'jpg'; else if (data.slice(0, 8).toString('hex') === '89504e470d0a1a0a') ext = 'png';
      else if (data.slice(0, 4).toString() === 'RIFF' && data.slice(8, 12).toString() === 'WEBP') ext = 'webp'; else if (data.slice(0, 3).toString() === 'GIF') ext = 'gif';
      if (!ext) return fail(req, res, 400, 'Only JPG, PNG, WEBP or GIF images are allowed.');
      const name = Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(UPLOADS, name), data);
      return json(req, res, 200, { url: '/uploads/' + name });
    }
    if ((route === 'orders.csv' || route === 'subscribers.csv' || route === 'reservations.csv') && m === 'GET') {
      const cell = (v) => { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
      let rows;
      if (route === 'orders.csv') rows = [['Ref', 'Date', 'Status', 'Type', 'Name', 'Phone', 'Email', 'Total', 'Items']].concat(db.orders.map((o) => [o.ref, o.createdAt, o.status, o.type, o.name, o.phone, o.email, o.total, o.items.map((i) => i.qty + 'x ' + i.name).join('; ')]));
      else if (route === 'reservations.csv') rows = [['Ref', 'Date', 'Time', 'Guests', 'Status', 'Name', 'Phone', 'Email', 'Notes']].concat(db.reservations.map((r) => [r.ref, r.date, r.time, r.guests, r.status, r.name, r.phone, r.email, r.notes]));
      else rows = [['Email', 'Subscribed']].concat(db.subscribers.map((x) => [x.email, x.at]));
      return send(req, res, 200, rows.map((r) => r.map(cell).join(',')).join('\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${route}"`, 'Cache-Control': 'no-store' });
    }

    // status updates + deletes for orders/reservations/messages/subscribers
    let mm = /^(orders|reservations)\/([\w-]+)$/.exec(route);
    if (mm && m === 'PATCH') {
      const rec = db[mm[1]].find((x) => x.id === mm[2]); if (!rec) return fail(req, res, 404, 'Not found');
      if (!STATUS[mm[1]].includes(b.status)) return fail(req, res, 400, 'Invalid status.');
      const prev = rec.status; rec.status = b.status; save();
      if (prev !== rec.status && rec.email) {
        const label = rec.status.replace(/_/g, ' ');
        if (mm[1] === 'orders' && ['confirmed', 'ready', 'out_for_delivery', 'cancelled'].includes(rec.status)) notifyCustomer(rec.email, `Order #${rec.ref}: ${label}`, `<p>Hi ${esc(rec.name)}, your order is now <b>${esc(label)}</b>.</p>`);
        if (mm[1] === 'reservations' && ['confirmed', 'cancelled'].includes(rec.status)) notifyCustomer(rec.email, `Reservation ${rec.ref}: ${label}`, `<p>Hi ${esc(rec.name)}, your reservation for ${rec.guests} on ${esc(rec.date)} at ${esc(rec.time)} is <b>${esc(label)}</b>.</p>`);
      }
      return json(req, res, 200, { ok: true, record: rec });
    }
    mm = /^(orders|reservations|messages)\/([\w-]+)$/.exec(route);
    if (mm && m === 'DELETE') { db[mm[1]] = db[mm[1]].filter((x) => x.id !== mm[2]); save(); return json(req, res, 200, { ok: true }); }
    mm = /^messages\/([\w-]+)\/read$/.exec(route);
    if (mm && m === 'POST') { const x = db.messages.find((y) => y.id === mm[1]); if (x) { x.read = bool(b.read); save(); } return json(req, res, 200, { ok: true }); }
    mm = /^subscribers\/delete$/.exec(route);
    if (mm && m === 'POST') { db.subscribers = db.subscribers.filter((x) => x.email !== str(b.email, 120)); save(); return json(req, res, 200, { ok: true }); }

    // generic CRUD collections
    mm = /^(\w+)(?:\/([\w-]+))?$/.exec(route);
    if (mm && COLLS.includes(mm[1])) {
      const coll = mm[1], id = mm[2], list = db[coll];
      if (m === 'POST' && !id) {
        const rec = SCHEMAS[coll](b);
        if (REQUIRED[coll].some((k) => !rec[k])) return fail(req, res, 400, 'Please fill in the required fields.');
        if (coll === 'promos' && list.some((x) => x.code === rec.code)) return fail(req, res, 400, 'That code already exists.');
        rec.id = uid(coll[0] + '_'); list.push(rec); save(); return json(req, res, 200, { ok: true, record: rec });
      }
      if (m === 'PUT' && id === 'order') {
        const ids = Array.isArray(b.ids) ? b.ids : []; const map = new Map(list.map((x) => [x.id, x]));
        const re = ids.map((i) => map.get(i)).filter(Boolean); list.forEach((x) => { if (!ids.includes(x.id)) re.push(x); });
        db[coll] = re; save(); return json(req, res, 200, { ok: true });
      }
      if (m === 'PUT' && id) {
        const i = list.findIndex((x) => x.id === id); if (i < 0) return fail(req, res, 404, 'Not found');
        const rec = SCHEMAS[coll](b);
        if (REQUIRED[coll].some((k) => !rec[k])) return fail(req, res, 400, 'Please fill in the required fields.');
        if (coll === 'promos' && list.some((x) => x.code === rec.code && x.id !== id)) return fail(req, res, 400, 'That code already exists.');
        rec.id = id; list[i] = rec; save(); return json(req, res, 200, { ok: true, record: rec });
      }
      if (m === 'DELETE' && id) {
        if (coll === 'categories' && db.menu.some((x) => x.cat === id)) return fail(req, res, 400, 'Move or delete the dishes in this category first.');
        db[coll] = list.filter((x) => x.id !== id); save(); return json(req, res, 200, { ok: true });
      }
    }
    return fail(req, res, 404, 'Not found');
  }

  // ----- Static -----
  if (m !== 'GET' && m !== 'HEAD') return fail(req, res, 405, 'Method not allowed');
  if (p === '/' || p === '/index.html') return renderIndex(req, res);
  if (p === '/robots.txt') return send(req, res, 200, `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n${SITE_URL ? 'Sitemap: ' + SITE_URL + '/sitemap.xml\n' : ''}`, 'text/plain; charset=utf-8');
  if (p === '/sitemap.xml') return send(req, res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(SITE_URL || '')}/</loc><priority>1.0</priority></url><url><loc>${esc(SITE_URL || '')}/privacy.html</loc><priority>0.3</priority></url></urlset>`, 'application/xml; charset=utf-8');
  if (p === '/admin') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
  if (p.startsWith('/uploads/')) {
    const f = path.join(UPLOADS, path.basename(p));
    return serveFile(req, res, f, 'public, max-age=604800');
  }
  const safe = path.normalize(p).replace(/^(\.\.[\/\\])+/, '');
  let file = path.join(PUB, safe);
  if (file !== PUB && !file.startsWith(PUB + path.sep)) return notFound(req, res);
  if (safe.endsWith(path.sep) || safe === '/admin/') file = path.join(file, 'index.html');
  if (p.startsWith('/admin')) { return serveFile(req, res, file, 'no-cache'); }
  if (/default-data\.json$/.test(file)) return json(req, res, 200, publicSite());
  return serveFile(req, res, file);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) fail(req, res, 500, 'Server error'); else res.end(); });
});
server.keepAliveTimeout = 65000; server.headersTimeout = 66000; server.requestTimeout = 120000;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n  Port ${PORT} is already in use. Is Kilo Kitchen already running in another window?\n  Close it, or start with a different port (PORT=3001).\n`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, () => {
  console.log(`\n  Kilo Kitchen running:  http://localhost:${PORT}`);
  console.log(`  Admin dashboard:       http://localhost:${PORT}/admin/${db.admin ? '' : '   (first visit: create your admin account)'}\n`);
});
process.on('uncaughtException', (e) => console.error('Uncaught:', e));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
