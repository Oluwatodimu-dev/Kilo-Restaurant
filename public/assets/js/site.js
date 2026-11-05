/* Kilo Kitchen: public site. Renders everything from admin-managed data. */
(function () {
  'use strict';
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IMG = (p) => (p && window.__IMGMAP && window.__IMGMAP[p]) || p;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  let D, S;

  /* ---------- Boot ---------- */
  async function boot() {
    try { const t = $('#site-data').textContent.trim(); if (t && t[0] === '{') D = JSON.parse(t); } catch (e) { /* static mode */ }
    if (!D || !D.settings) {
      for (const u of ['/api/site', 'assets/default-data.json']) {
        try { const r = await fetch(u); if (r.ok) { D = await r.json(); if (D.settings) break; } } catch (e) { /* try next */ }
      }
    }
    if (!D || !D.settings) { document.body.classList.remove('pending'); document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;max-width:560px;margin:auto"><h2>This page needs the server</h2><p>To look at the website without any setup, open <b>PREVIEW.html</b>. To run the real site, double-click one of the START files (see START-HERE.txt).</p></div>'; return; }
    S = D.settings; init();
  }

  /* ---------- Helpers ---------- */
  const money = (n) => S.currency + (Math.round(n * 100) / 100).toFixed(2);
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const fmt = (min) => { min = ((min % 1440) + 1440) % 1440; const h = Math.floor(min / 60), m = min % 60; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function nowIn() {
    let p; try { p = new Intl.DateTimeFormat('en-US', { timeZone: S.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); }
    catch (e) { p = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); }
    const g = (t) => p.find((x) => x.type === t).value;
    return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), min: +g('hour') * 60 + +g('minute'), date: g('year') + '-' + g('month') + '-' + g('day') };
  }
  const dowOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return dt.toISOString().slice(0, 10); };
  function openInfo() { // handles late-night hours that run past midnight
    const n = nowIn(), H = S.hours, h = H[n.dow], pv = H[(n.dow + 6) % 7];
    if (h && !h.closed) { const o = toMin(h.open), c = toMin(h.close); if (c > o ? n.min >= o && n.min < c : n.min >= o) return { open: true, until: c }; }
    if (pv && !pv.closed) { const o = toMin(pv.open), c = toMin(pv.close); if (c <= o && n.min < c) return { open: true, until: c }; }
    return { open: false };
  }
  const isOpen = () => openInfo().open;
  let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  const reach = () => (S.contact.phone ? 'call us on ' + S.contact.phone : 'get in touch with us');
  const cat = (id) => D.categories.find((c) => c.id === id);
  const dishById = (id) => D.menu.find((m) => m.id === id);
  const waLink = (text) => 'https://wa.me/' + String(S.contact.whatsapp || '').replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
  async function api(url, body) {
    let r;
    try { r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); }
    catch (e) { const err = new Error('network'); err.network = true; throw err; }
    let data = {}; try { data = await r.json(); } catch (e) { /* non-JSON */ }
    if (!r.ok) { const err = new Error(data.error || 'Something went wrong. Please try again.'); err.status = r.status; throw err; }
    return data;
  }
  function msg(el, text, good) { el.textContent = text; el.classList.remove('ok', 'bad'); el.classList.add(good ? 'ok' : 'bad'); }
  function validate(form) {
    let ok = true, first = null;
    $$('input[required],select[required],textarea[required]', form).forEach((el) => {
      const v = el.value.trim(); let m = '';
      if (!v) m = 'Required'; else if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) m = 'Enter a valid email'; else if (el.type === 'tel' && v.replace(/\D/g, '').length < 7) m = 'Enter a valid phone number';
      mark(el, m); if (m) { ok = false; first = first || el; }
    });
    const em = $('input[type=email]:not([required])', form); if (em && em.value.trim()) { const bad = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value.trim()); mark(em, bad ? 'Enter a valid email' : ''); if (bad) { ok = false; first = first || em; } }
    if (first) first.focus(); return ok;
  }
  function mark(el, m) { el.classList.toggle('bad', !!m); el.setAttribute('aria-invalid', m ? 'true' : 'false'); const s = el.parentNode.querySelector('.err'); if (s) s.textContent = m; }

  /* ---------- Dialogs ---------- */
  function openDlg(d) { if (!d.open) d.showModal(); document.documentElement.style.overflow = 'hidden'; }
  function closeDlg(d) { if (d.open) d.close(); }
  $$('dialog').forEach((d) => {
    d.addEventListener('close', () => { if (!$$('dialog[open]').length) document.documentElement.style.overflow = ''; });
    d.addEventListener('click', (e) => { if (e.target === d) closeDlg(d); });
    $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => closeDlg(d)));
  });

  /* ---------- Static content ---------- */
  function renderStatic() {
    const b = S.brand, h = S.hero, a = S.about;
    document.title = S.seo.title;
    document.documentElement.style.setProperty('--accent', S.theme.accent);
    const brandHtml = `<img src="${esc(IMG(b.logo))}" alt=""><span>${esc(b.name)}</span>`;
    $('#brand').innerHTML = brandHtml; $('#fbrand').innerHTML = brandHtml; $('#fTag').textContent = b.tagline; $('#fName').textContent = b.name;
    $('#year').textContent = new Date().getFullYear();
    const an = $('#announce'); if (S.announcement.enabled && S.announcement.text) { an.hidden = false; an.innerHTML = `<p>${esc(S.announcement.text)} ${S.announcement.linkText ? `<a href="${esc(S.announcement.linkHref || '#')}">${esc(S.announcement.linkText)}</a>` : ''}</p>`; }
    $('#heroEyebrow').textContent = h.eyebrow; $('#heroTitle').innerHTML = `${esc(h.title)}<em>${esc(h.accent)}</em>`; $('#heroSub').textContent = h.subtitle;
    $('#heroImg').src = IMG(h.image); $('#heroImg2').src = IMG(h.image2); $('#heroImg3').src = IMG(h.image3);
    const sp = S.special, spc = $('#specialCard'); if (sp.enabled && sp.name) { spc.hidden = false; spc.innerHTML = `<small>${esc(sp.title)}</small><b>${esc(sp.name)}</b><span>${esc(sp.text)}</span>`; spc.addEventListener('click', () => { const d = dishById(sp.menuId); if (d) openDish(d.id); else location.hash = '#menu'; }); }
    const rv = D.reviews; if (rv.length) { const avg = rv.reduce((x, r) => x + r.rating, 0) / rv.length; $('#ratingPill').innerHTML = `<span class="stars">★</span> ${avg.toFixed(1)} · ${rv.length} review${rv.length > 1 ? 's' : ''}`; } else $('#ratingPill').remove();
    $('#bento').innerHTML = S.values.map((v) => `<div class="tile reveal"><div class="ico">${esc(v.icon)}</div><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p></div>`).join('') + S.stats.map((s) => `<div class="tile s reveal"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('');
    $('#aboutEyebrow').textContent = a.eyebrow; $('#aboutTitle').textContent = a.title; $('#aboutT1').textContent = a.text1; $('#aboutT2').textContent = a.text2;
    $('#aboutList').innerHTML = a.bullets.map((x) => `<li>${esc(x)}</li>`).join(''); $('#aboutImg').src = IMG(a.image); $('#aboutImg2').src = IMG(a.image2);
    if (S.catering.enabled) { const c = $('#catering'); c.hidden = false; $('#cateringImg').src = IMG(S.catering.image); $('#cateringTitle').textContent = S.catering.title; $('#cateringText').textContent = S.catering.text; }
    const mq = D.menu.filter((m) => m.available).map((m) => esc(m.name)); const items = mq.length ? mq : [esc(b.name)];
    const row = items.slice(0, 8).map((x) => `<span>${x}</span>`).join(''); $('#marquee').innerHTML = row;
    // team, gallery, reviews, faq
    $('#team').hidden = !D.team.length; $('#teamGrid').innerHTML = D.team.map((t) => `<article class="member reveal"><img src="${esc(IMG(t.img))}" alt="${esc(t.name)}" loading="lazy"><h3>${esc(t.name)}</h3><p class="role">${esc(t.role)}</p><p>${esc(t.bio)}</p></article>`).join('');
    $('#gallery').hidden = !D.gallery.length; $('#galleryGrid').innerHTML = D.gallery.map((g, i) => `<button class="g" data-i="${i}" aria-label="Open image: ${esc(g.alt)}"><img src="${esc(IMG(g.src))}" alt="${esc(g.alt)}" loading="lazy"></button>`).join('');
    $('#faq').hidden = !D.faq.length; $('#faqList').innerHTML = D.faq.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');
    // contact
    const c = S.contact, tel = String(c.phone).replace(/[^\d+]/g, '');
    const rows = [];
    if (c.address) rows.push(`<li><b>Address</b><span>${esc(c.address)}</span></li>`);
    if (c.phone) rows.push(`<li><b>Phone</b><a href="tel:${esc(tel)}">${esc(c.phone)}</a></li>`);
    if (c.email) rows.push(`<li><b>Email</b><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`);
    if (c.whatsapp) rows.push(`<li><b>WhatsApp</b><a href="${esc(waLink())}" target="_blank" rel="noopener">Message us</a></li>`);
    $('#contactList').innerHTML = rows.join('') || '<li><span class="muted">Use the form to get in touch and we will reply soon.</span></li>';
    const soc = S.socials, names = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', x: 'X' };
    $('#socials').innerHTML = Object.keys(names).filter((k) => soc[k]).map((k) => `<a href="${esc(soc[k])}" target="_blank" rel="noopener">${names[k]}</a>`).join('');
    $('#mapBox').innerHTML = c.mapEmbed ? `<iframe src="${esc(c.mapEmbed)}" title="Map to ${esc(b.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : '';
    if (!c.mapEmbed && c.address) $('#socials').insertAdjacentHTML('beforeend', `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}" target="_blank" rel="noopener">Get directions ↗</a>`);
    $('#fContact').innerHTML = '<li><a href="#contact">Contact</a></li>' + (c.email ? `<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : '') + (c.phone ? `<li><a href="tel:${esc(tel)}">${esc(c.phone)}</a></li>` : '');
    if (c.whatsapp) { const wa = esc(waLink('Hi ' + b.name + '!')); $('#fContact').insertAdjacentHTML('beforeend', `<li><a href="${wa}" target="_blank" rel="noopener">WhatsApp</a></li>`); }
    if (!S.ordering.enabled) { const hp = $('#menu .head p.muted'); if (hp) hp.textContent = 'Online ordering is paused right now. Please ' + reach() + ' to order.'; }
    renderHours();
  }
  function renderHours() {
    const today = nowIn().dow, order = [1, 2, 3, 4, 5, 6, 0];
    const line = (i) => { const h = S.hours[i]; return [DAYS[i], h.closed ? 'Closed' : fmt(toMin(h.open)) + ' – ' + fmt(toMin(h.close))]; };
    $('#hoursCard').innerHTML = order.map((i) => { const [d, t] = line(i); return `<div class="${i === today ? 'today' : ''}"><span>${d}</span><span>${t}</span></div>`; }).join('');
    $('#fHours').innerHTML = order.map((i) => { const [d, t] = line(i); return `<li>${d.slice(0, 3)} · ${t}</li>`; }).join('');
  }
  function updateOpen() {
    const info = openInfo(), o = info.open, el = $('#openPill'), n = nowIn();
    el.className = 'pill ' + (o ? 'open' : 'closed');
    let t = o ? 'Open now · until ' + fmt(info.until) : 'Closed now';
    if (!o) { for (let k = 0; k < 7; k++) { const d = (n.dow + k) % 7, hh = S.hours[d]; if (hh && !hh.closed && !(k === 0 && n.min >= toMin(hh.open))) { t = 'Closed · opens ' + (k === 0 ? 'today' : k === 1 ? 'tomorrow' : DAYS[d]) + ' ' + fmt(toMin(hh.open)); break; } } }
    el.innerHTML = '<i></i><b>' + esc(t) + '</b>';
  }

  /* ---------- Menu ---------- */
  const mstate = { cat: 'all', q: '', diets: new Set() };
  let favs = store.get('kk_favs', []);
  function renderCats() {
    const used = D.categories.filter((c) => D.menu.some((m) => m.cat === c.id));
    $('#cats').innerHTML = [{ id: 'all', name: 'All' }].concat(used).map((c) => `<button class="cat" role="tab" data-c="${esc(c.id)}" aria-selected="${c.id === mstate.cat}">${esc(c.name)}</button>`).join('');
  }
  function buildDishes() {
    $('#dishes').innerHTML = D.menu.map((m) => `<article class="dish${m.available ? '' : ' out'}" data-id="${esc(m.id)}">
      <div class="dish-img" data-open><img src="${esc(IMG(m.img))}" alt="${esc(m.name)}" loading="lazy">${m.tag ? `<span class="tag">${esc(m.tag)}</span>` : ''}
        <button class="heart" data-fav aria-label="Save ${esc(m.name)}" aria-pressed="${favs.includes(m.id)}"><svg viewBox="0 0 24 24"><path d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z"/></svg></button>${m.available ? '' : '<div class="soldout">Sold out</div>'}</div>
      <div class="dish-body"><h3><a href="#menu" data-open style="text-decoration:none">${esc(m.name)}</a></h3>
        ${m.diet.length ? `<div class="badges">${m.diet.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div>` : ''}<p>${esc(m.desc)}</p>
        <div class="dish-foot"><span class="price">${money(m.price)}</span><button class="add" data-add aria-label="Add ${esc(m.name)} to order" ${m.available && S.ordering.enabled ? '' : 'disabled'}>+</button></div></div></article>`).join('');
  }
  function applyFilters() {
    const q = mstate.q.toLowerCase(); let shown = 0;
    $$('#dishes .dish').forEach((card) => {
      const m = dishById(card.dataset.id); let ok = true;
      if (mstate.cat !== 'all' && m.cat !== mstate.cat) ok = false;
      if (ok && q && (m.name + ' ' + m.desc + ' ' + m.tag).toLowerCase().indexOf(q) < 0) ok = false;
      if (ok) for (const d of mstate.diets) { if (d === 'fav') { if (!favs.includes(m.id)) ok = false; } else if (!m.diet.includes(d)) ok = false; }
      card.hidden = !ok; if (ok) shown++;
    });
    $('#dishesEmpty').hidden = shown > 0;
  }
  function initMenu() {
    renderCats(); buildDishes(); applyFilters();
    $('#cats').addEventListener('click', (e) => { const b = e.target.closest('.cat'); if (!b) return; mstate.cat = b.dataset.c; $$('.cat', $('#cats')).forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false')); applyFilters(); });
    $('#q').addEventListener('input', (e) => { mstate.q = e.target.value.trim(); applyFilters(); });
    $('#diets').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; const on = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', on); on ? mstate.diets.add(c.dataset.d) : mstate.diets.delete(c.dataset.d); applyFilters(); });
    $('#dishes').addEventListener('click', (e) => {
      const card = e.target.closest('.dish'); if (!card) return; const id = card.dataset.id;
      if (e.target.closest('[data-add]')) { e.preventDefault(); addToCart(id, 1); return; }
      if (e.target.closest('[data-fav]')) { const i = favs.indexOf(id); i >= 0 ? favs.splice(i, 1) : favs.push(id); store.set('kk_favs', favs); e.target.closest('[data-fav]').setAttribute('aria-pressed', i < 0); toast(i < 0 ? 'Saved to favourites' : 'Removed from favourites'); if (mstate.diets.has('fav')) applyFilters(); return; }
      if (e.target.closest('[data-open]')) { e.preventDefault(); openDish(id); }
    });
  }
  function openDish(id) {
    const m = dishById(id); if (!m) return; let qty = 1;
    $('#dishBody').innerHTML = `<div class="dm"><img src="${esc(IMG(m.img))}" alt="${esc(m.name)}"><div class="dm-info"><p class="eyebrow">${esc((cat(m.cat) || {}).name || '')}${m.tag ? ' · ' + esc(m.tag) : ''}</p><h3>${esc(m.name)}</h3>
      ${m.diet.length ? `<div class="badges">${m.diet.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div>` : ''}<p>${esc(m.desc)}</p>${m.calories ? `<p class="tiny">${m.calories} kcal</p>` : ''}
      <label class="tiny">Special requests<input id="dmNote" maxlength="120" placeholder="No onions, extra sauce…"></label>
      <div class="dm-add"><span class="qty"><button id="dmM" aria-label="Less">−</button><span id="dmQ">1</span><button id="dmP" aria-label="More">+</button></span>
      <button class="btn btn-accent" id="dmAdd" style="flex:1" ${m.available ? '' : 'disabled'}>${m.available ? 'Add · ' + money(m.price) : 'Sold out'}</button></div></div></div>`;
    const upd = () => { $('#dmQ').textContent = qty; if (m.available) $('#dmAdd').textContent = 'Add · ' + money(m.price * qty); };
    $('#dmM').onclick = () => { qty = Math.max(1, qty - 1); upd(); }; $('#dmP').onclick = () => { qty = Math.min(20, qty + 1); upd(); };
    $('#dmAdd').onclick = () => { addToCart(id, qty, $('#dmNote').value.trim()); closeDlg($('#dishDlg')); };
    openDlg($('#dishDlg'));
  }

  /* ---------- Cart ---------- */
  let cart = store.get('kk_cart2', { items: {}, promo: '', promoData: null, tip: 0, type: 'pickup' });
  const saveCart = () => { store.set('kk_cart2', cart); renderCart(); };
  function pruneCart() { Object.keys(cart.items).forEach((id) => { if (!dishById(id) || !dishById(id).available) delete cart.items[id]; }); }
  function totals(type) {
    const o = S.ordering; let sub = 0, count = 0;
    Object.keys(cart.items).forEach((id) => { const m = dishById(id); if (m) { sub += m.price * cart.items[id].qty; count += cart.items[id].qty; } });
    let disc = 0; const p = cart.promoData;
    if (p && sub >= p.min) disc = p.type === 'percent' ? sub * Math.min(100, p.value) / 100 : Math.min(p.value, sub);
    const tax = (sub - disc) * o.taxRate / 100;
    const delivery = (type || cart.type) === 'delivery' && sub > 0 && !(o.freeDeliveryOver > 0 && sub >= o.freeDeliveryOver) ? o.deliveryFee : 0;
    const tip = (sub - disc) * (cart.tip || 0) / 100;
    return { sub, count, disc, tax, delivery, tip, total: sub - disc + tax + delivery + tip };
  }
  function addToCart(id, qty, note) {
    if (!S.ordering.enabled) { toast('Online ordering is paused. Please call us.'); return; }
    const m = dishById(id); if (!m || !m.available) return;
    const it = cart.items[id] || { qty: 0, note: '' }; it.qty = Math.min(50, it.qty + qty); if (note) it.note = note; cart.items[id] = it; saveCart();
    const c = $('#cartCount'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 250); toast(m.name + ' added');
  }
  function renderCart() {
    pruneCart(); const t = totals(), ids = Object.keys(cart.items);
    $('#cartCount').textContent = t.count; $('#cartOpen').setAttribute('aria-label', 'Open your order, ' + t.count + ' items');
    $('#cartFoot').style.display = ids.length ? '' : 'none';
    if (!ids.length) { $('#cartBody').innerHTML = '<div class="cart-empty"><p style="font-family:var(--serif);font-size:1.8rem;margin-bottom:6px">Nothing here yet</p><p>Add something delicious from the menu.</p><a class="btn btn-accent" href="#menu" data-close-cart>Browse the menu</a></div>'; return; }
    $('#cartBody').innerHTML = ids.map((id) => { const m = dishById(id), it = cart.items[id]; return `<div class="ci"><img src="${esc(IMG(m.img))}" alt=""><div><h4>${esc(m.name)}</h4><small>${money(m.price)}${it.note ? ' · ' + esc(it.note) : ''}</small><br><span class="qty"><button data-dec="${esc(id)}" aria-label="Decrease">−</button><span>${it.qty}</span><button data-inc="${esc(id)}" aria-label="Increase">+</button></span></div><div style="text-align:right"><b>${money(m.price * it.qty)}</b><br><button class="rm" data-rm="${esc(id)}">Remove</button></div></div>`; }).join('');
    $('#cartTotals').innerHTML = `<div><span>Subtotal</span><b>${money(t.sub)}</b></div>${t.disc ? `<div class="disc"><span>Promo ${esc(cart.promo)}</span><b>−${money(t.disc)}</b></div>` : ''}<div><span>Tax (${S.ordering.taxRate}%)</span><b>${money(t.tax)}</b></div><div class="grand"><span>Estimated total</span><b>${money(t.sub - t.disc + t.tax)}</b></div>`;
    $('#promoIn').value = cart.promo || '';
  }
  function initCart() {
    renderCart();
    $('#cartOpen').addEventListener('click', () => openDlg($('#cartDlg')));
    $('#cartBody').addEventListener('click', (e) => {
      const t = e.target; if (t.closest('[data-close-cart]')) { closeDlg($('#cartDlg')); return; }
      const inc = t.closest('[data-inc]'), dec = t.closest('[data-dec]'), rm = t.closest('[data-rm]');
      if (inc) cart.items[inc.dataset.inc].qty = Math.min(50, cart.items[inc.dataset.inc].qty + 1);
      else if (dec) { const it = cart.items[dec.dataset.dec]; it.qty--; if (it.qty <= 0) delete cart.items[dec.dataset.dec]; }
      else if (rm) delete cart.items[rm.dataset.rm]; else return; saveCart();
    });
    $('#clearCart').addEventListener('click', () => { cart.items = {}; cart.promo = ''; cart.promoData = null; saveCart(); });
    $('#promoBtn').addEventListener('click', async () => {
      const code = $('#promoIn').value.trim().toUpperCase(), m = $('#promoMsg'); if (!code) return;
      try { const p = await api('/api/promo?code=' + encodeURIComponent(code)); const t = totals(); if (t.sub < p.min) { msg(m, `Code ${p.code} needs ${money(p.min)} minimum.`, false); return; } cart.promo = p.code; cart.promoData = p; saveCart(); msg(m, 'Code applied', true); }
      catch (e) { cart.promo = ''; cart.promoData = null; saveCart(); msg(m, e.network ? 'Promo codes need a connection to our server.' : e.message, false); }
    });
    $('#checkoutBtn').addEventListener('click', () => { if (!S.ordering.enabled) { toast('Online ordering is paused.'); return; } const t = totals(); if (t.sub < S.ordering.minOrder) { msg($('#promoMsg'), 'Minimum order is ' + money(S.ordering.minOrder) + '.', false); return; } closeDlg($('#cartDlg')); openCheckout(); });
  }

  /* ---------- Checkout ---------- */
  function whenOptions(type) {
    const o = S.ordering, n = nowIn(), lead = type === 'delivery' ? o.deliveryMinutes : o.prepMinutes, out = [];
    if (isOpen()) out.push('ASAP (~' + lead + ' min)');
    for (let day = 0; day < 2 && out.length < 18; day++) {
      const date = addDays(n.date, day), h = S.hours[dowOf(date)]; if (!h || h.closed) continue;
      const open = toMin(h.open); let close = toMin(h.close); if (close <= open) close += 1440;
      let start = open; if (day === 0) start = Math.max(open, Math.ceil((n.min + lead + 10) / 15) * 15);
      for (let t = start; t <= close - 20 && out.length < 18; t += 30) out.push((day ? 'Tomorrow ' : 'Today ') + fmt(t));
    }
    return out;
  }
  function openCheckout() {
    const o = S.ordering, types = [];
    if (o.pickup) types.push(['pickup', 'Pickup']); if (o.delivery) types.push(['delivery', 'Delivery']);
    if (!types.length) { toast('Ordering is unavailable right now.'); return; }
    if (!types.some((t) => t[0] === cart.type)) cart.type = types[0][0];
    if (!o.tips.includes(cart.tip)) cart.tip = o.tips.includes(0) ? 0 : (o.tips[0] || 0);
    $('#tips').closest('.field').hidden = !o.tips.length;
    $('#typeSeg').innerHTML = types.map((t) => `<label><input type="radio" name="type" value="${t[0]}" ${t[0] === cart.type ? 'checked' : ''}><span>${t[1]}${t[0] === 'delivery' && o.deliveryFee ? ' · ' + money(o.deliveryFee) : ''}</span></label>`).join('');
    $('#paySel').innerHTML = (o.payments.length ? o.payments : ['Pay on pickup / delivery']).map((p) => `<option>${esc(p)}</option>`).join('');
    $('#tips').innerHTML = o.tips.map((t) => `<button type="button" class="tip" data-t="${t}" aria-pressed="${t === cart.tip}">${t ? t + '%' : 'No tip'}</button>`).join('');
    const last = store.get('kk_last', null), f = $('#coForm'); if (last) { if (!f.name.value) f.name.value = last.name || ''; if (!f.phone.value) f.phone.value = last.phone || ''; if (!f.email.value) f.email.value = last.email || ''; }
    syncType(); $('#coForm').hidden = false; $('#coDone').hidden = true; $('#coMsg').textContent = ''; openDlg($('#coDlg'));
  }
  function syncType() {
    const type = ($('input[name=type]:checked') || {}).value || 'pickup'; cart.type = type; store.set('kk_cart2', cart);
    $('#addrWrap').hidden = type !== 'delivery'; const a = $('#addrWrap input'); type === 'delivery' ? a.setAttribute('required', '') : (a.removeAttribute('required'), mark(a, ''));
    const w = whenOptions(type); $('#whenSel').innerHTML = w.length ? w.map((x) => `<option>${esc(x)}</option>`).join('') : '<option>Next available</option>';
    renderSum();
  }
  function renderSum() {
    const t = totals(); const row = (a, b, c) => `<div class="${c || ''}"><span>${a}</span><b>${b}</b></div>`;
    $('#coSum').innerHTML = row('Subtotal', money(t.sub)) + (t.disc ? row('Promo ' + esc(cart.promo), '−' + money(t.disc), 'disc') : '') + row('Tax', money(t.tax)) + (t.delivery ? row('Delivery', money(t.delivery)) : '') + (t.tip ? row('Tip', money(t.tip)) : '') + row('Total', money(t.total), 'grand');
  }
  function initCheckout() {
    $('#typeSeg').addEventListener('change', syncType);
    $('#tips').addEventListener('click', (e) => { const b = e.target.closest('.tip'); if (!b) return; cart.tip = +b.dataset.t; store.set('kk_cart2', cart); $$('.tip').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderSum(); });
    $('#coForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.currentTarget, m = $('#coMsg'); if (!validate(f)) { msg(m, 'Please fix the highlighted fields.', false); return; }
      const btn = $('#coSubmit'); btn.disabled = true; btn.textContent = 'Placing order…';
      const body = { items: Object.keys(cart.items).map((id) => ({ id, qty: cart.items[id].qty, note: cart.items[id].note })), type: cart.type, name: f.name.value, phone: f.phone.value, email: f.email.value, address: f.address.value, notes: f.notes.value, when: f.when.value, pay: f.pay.value, promo: cart.promo, tip: cart.tip, website: f.website.value };
      try {
        const r = await api('/api/orders', body); store.set('kk_last', { ref: r.ref, phone: f.phone.value, name: f.name.value, email: f.email.value });
        $('#coForm').hidden = true; const d = $('#coDone'); d.hidden = false;
        d.innerHTML = `<div class="check">✓</div><h3>Order received</h3><p class="muted">Thank you, ${esc(f.name.value.split(' ')[0])}! Ready in about ${r.eta} minutes.</p><div class="refbox">${esc(r.ref)}</div><p class="muted tiny">Keep this reference to track your order. Total ${money(r.total)}.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-accent" id="goTrack">Track order</button><button class="btn btn-outline" data-close>Done</button></div>`;
        $('#goTrack').onclick = () => { closeDlg($('#coDlg')); openTrack(true); }; $('[data-close]', d).onclick = () => closeDlg($('#coDlg'));
        cart.items = {}; cart.promo = ''; cart.promoData = null; saveCart(); f.reset();
      } catch (err) {
        if (err.network) { const txt = 'Hi! I would like to order:\n' + body.items.map((i) => i.qty + ' x ' + dishById(i.id).name).join('\n') + '\nName: ' + body.name + '\nPhone: ' + body.phone; m.innerHTML = 'We could not reach our server. ' + (S.contact.whatsapp ? `<a href="${esc(waLink(txt))}" target="_blank" rel="noopener">Send this order on WhatsApp</a> or ` : '') + esc(reach()) + '.'; m.className = 'msg bad'; }
        else {
          msg(m, err.message, false);
          if (/unavailable|empty/i.test(err.message)) { pruneCart(); saveCart(); }
          if (/promo|code/i.test(err.message)) { cart.promo = ''; cart.promoData = null; saveCart(); renderSum(); msg(m, err.message + ' The code was removed, so you can place your order without it.', false); }
        }
      } finally { btn.disabled = false; btn.textContent = 'Place order'; }
    });
  }

  /* ---------- Track order ---------- */
  let trackT;
  const FLOW = { pickup: [['new', 'Order received'], ['confirmed', 'Confirmed'], ['preparing', 'Being prepared'], ['ready', 'Ready for pickup'], ['completed', 'Completed']], delivery: [['new', 'Order received'], ['confirmed', 'Confirmed'], ['preparing', 'Being prepared'], ['out_for_delivery', 'Out for delivery'], ['completed', 'Delivered']] };
  async function doTrack(ref, phone, quiet) {
    const m = $('#trMsg');
    try {
      const o = await api('/api/track?ref=' + encodeURIComponent(ref) + '&phone=' + encodeURIComponent(phone)); m.textContent = '';
      if (o.status === 'cancelled') { $('#trResult').innerHTML = `<p class="msg bad">Order #${esc(o.ref)} was cancelled. Please call us if you have questions.</p>`; return; }
      const flow = FLOW[o.type] || FLOW.pickup; let idx = flow.findIndex((s) => s[0] === o.status); if (idx < 0) idx = o.status === 'ready' ? 3 : 0;
      $('#trResult').innerHTML = `<p class="muted">Order <b>#${esc(o.ref)}</b> · ${money(o.total)} · ${esc(o.type)}</p><div class="steps">${flow.map((s, i) => `<div class="step ${i <= idx ? 'done-s' : ''} ${i === idx ? 'now' : ''}"><i>${i < idx ? '✓' : i + 1}</i><div><b>${esc(s[1])}</b></div></div>`).join('')}</div><p class="tiny muted">${o.items.map((i) => i.qty + '× ' + esc(i.name)).join(' · ')}</p>`;
      clearTimeout(trackT); if (o.status !== 'completed') trackT = setTimeout(() => $('#trackDlg').open && doTrack(ref, phone, true), 15000);
    } catch (e) { if (!quiet) { $('#trResult').innerHTML = ''; msg(m, e.network ? 'Tracking needs a connection to our server.' : e.message, false); } }
  }
  function openTrack(auto) {
    const last = store.get('kk_last', null), f = $('#trackForm'); if (last) { f.ref.value = last.ref; f.phone.value = last.phone; }
    $('#trResult').innerHTML = ''; $('#trMsg').textContent = ''; openDlg($('#trackDlg')); if (auto && last) doTrack(last.ref, last.phone);
  }

  /* ---------- Reservations ---------- */
  const R = { guests: 2, time: '' };
  async function buildSlots() {
    const rs = S.reservations, date = $('#resDate').value, box = $('#slots'), prev = R.time; R.time = '';
    if (!date) { box.innerHTML = '<span class="muted">Choose a date</span>'; return; }
    const n = nowIn(), h = S.hours[dowOf(date)];
    if (!h || h.closed) { box.innerHTML = '<span class="muted">We are closed on this day.</span>'; return; }
    let used = {}, cap = rs.coversPerSlot; try { const a = await api('/api/availability?date=' + date); used = a.used; cap = a.capacity; } catch (e) { /* offline: show all */ }
    const open = toMin(h.open); let close = toMin(h.close); if (close <= open) close += 1440; const out = [];
    for (let t = open; t <= close - 30; t += rs.slotMinutes) { if (date === n.date && t < n.min + rs.leadMinutes) continue; const key = String(Math.floor((t % 1440) / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); out.push({ key, label: fmt(t), full: (used[key] || 0) + R.guests > cap }); }
    box.innerHTML = out.length ? out.map((s) => `<button type="button" class="slot" role="radio" aria-checked="false" data-t="${s.key}" ${s.full ? 'disabled title="Fully booked"' : ''}>${s.label}</button>`).join('') : '<span class="muted">No more tables on this date. Try another day.</span>';
    const keep = prev && $(`.slot[data-t="${prev}"]:not([disabled])`, box); if (keep) { R.time = prev; keep.setAttribute('aria-checked', 'true'); }
  }
  function initReserve() {
    const f = $('#resForm'), rs = S.reservations;
    if (!rs.enabled) { f.innerHTML = '<h3>Reservations are paused</h3><p class="muted">Please ' + esc(reach()) + ' to book a table.</p>'; return; }
    const n = nowIn(), d = $('#resDate'); d.min = n.date; d.max = addDays(n.date, rs.daysAhead); d.value = n.date;
    $('#gMinus').onclick = () => { R.guests = Math.max(1, R.guests - 1); $('#gOut').textContent = R.guests; buildSlots(); };
    $('#gPlus').onclick = () => { R.guests = Math.min(rs.maxGuests, R.guests + 1); $('#gOut').textContent = R.guests; if (R.guests === rs.maxGuests) toast('For larger parties please call us.'); buildSlots(); };
    d.addEventListener('change', () => { R.time = ''; buildSlots(); });
    $('#slots').addEventListener('click', (e) => { const b = e.target.closest('.slot'); if (!b || b.disabled) return; R.time = b.dataset.t; $$('.slot').forEach((x) => x.setAttribute('aria-checked', x === b)); $('[data-for=time]').textContent = ''; });
    buildSlots().then(() => { if (!$('.slot') && !$('#slots .muted').textContent.includes('closed')) { d.value = addDays(n.date, 1); buildSlots(); } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const m = $('#resMsg'); let ok = validate(f); if (!R.time) { $('[data-for=time]').textContent = 'Pick a time'; ok = false; }
      if (!ok) { msg(m, 'Please complete the form.', false); return; }
      const btn = $('button[type=submit]', f); btn.disabled = true;
      try { const r = await api('/api/reservations', { date: d.value, time: R.time, guests: R.guests, name: f.name.value, phone: f.phone.value, email: f.email.value, notes: f.notes.value, website: f.website.value });
        msg(m, `Request received! Reference ${r.ref}. We'll confirm by email or phone shortly.`, true); toast('Reservation requested'); f.name.value = f.phone.value = f.email.value = f.notes.value = ''; buildSlots();
      } catch (err) { msg(m, err.network ? 'We could not reach our server. Please ' + reach() + '.' : err.message, false); if (err.status === 409) buildSlots(); }
      finally { btn.disabled = false; }
    });
  }

  /* ---------- Forms, reviews, gallery ---------- */
  function initForms() {
    $('#msgForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.currentTarget, m = $('#msgMsg'); if (!validate(f)) { msg(m, 'Please complete the required fields.', false); return; }
      try { await api('/api/messages', { name: f.name.value, email: f.email.value, topic: f.topic.value, message: f.message.value, website: f.website.value }); msg(m, 'Thank you! We reply within one business day.', true); f.reset(); }
      catch (err) { msg(m, err.network ? 'We could not reach our server. Please try again in a moment.' : err.message, false); }
    });
    $('#newsForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const i = $('#newsEmail'), m = $('#newsMsg');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(i.value.trim())) { msg(m, 'Please enter a valid email.', false); m.classList.add('light'); return; }
      try { await api('/api/subscribe', { email: i.value.trim(), website: e.currentTarget.website.value }); msg(m, "You're on the list. Welcome!", true); i.value = ''; } catch (err) { msg(m, err.network ? 'Could not reach our server.' : err.message, false); }
      m.classList.add('light');
    });
    $$('[data-topic]').forEach((a) => a.addEventListener('click', () => { $('#topic').value = a.dataset.topic; }));
    $('#trackOpen').addEventListener('click', () => openTrack(false));
    $('#trackForm').addEventListener('submit', (e) => { e.preventDefault(); const f = e.currentTarget; doTrack(f.ref.value.trim(), f.phone.value.trim()); });
  }
  function initSlider() {
    const rv = D.reviews, box = $('#slider'); if (!rv.length) { $('#reviews').hidden = true; return; } let i = 0, t;
    box.innerHTML = '<div class="slides">' + rv.map((r, n) => `<figure class="slide ${n ? '' : 'on'}"><span class="stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span><blockquote>“${esc(r.text)}”</blockquote><figcaption>${r.img ? `<img src="${esc(IMG(r.img))}" alt="" loading="lazy">` : ''}<span><b>${esc(r.name)}</b>${r.role ? ' · ' + esc(r.role) : ''}</span></figcaption></figure>`).join('') + '</div>' + (rv.length > 1 ? `<div class="sl-nav"><button id="slP" aria-label="Previous review">‹</button><div class="dots">${rv.map((_, n) => `<button aria-label="Review ${n + 1}" data-n="${n}" class="${n ? '' : 'on'}"></button>`).join('')}</div><button id="slN" aria-label="Next review">›</button></div>` : '');
    const go = (n) => { i = (n + rv.length) % rv.length; $$('.slide', box).forEach((s, k) => s.classList.toggle('on', k === i)); $$('.dots button', box).forEach((d, k) => d.classList.toggle('on', k === i)); };
    const auto = () => { clearInterval(t); if (rv.length > 1) t = setInterval(() => go(i + 1), 7000); };
    if (rv.length > 1) { $('#slP').onclick = () => { go(i - 1); auto(); }; $('#slN').onclick = () => { go(i + 1); auto(); }; $$('.dots button', box).forEach((d) => d.onclick = () => { go(+d.dataset.n); auto(); }); auto(); box.addEventListener('mouseenter', () => clearInterval(t)); box.addEventListener('mouseleave', auto); }
  }
  function initGallery() {
    let gi = 0; const g = D.gallery, show = (n) => { gi = (n + g.length) % g.length; $('#lbImg').src = IMG(g[gi].src); $('#lbImg').alt = g[gi].alt; $('#lbCap').textContent = g[gi].alt; };
    $('#galleryGrid').addEventListener('click', (e) => { const b = e.target.closest('.g'); if (!b) return; show(+b.dataset.i); openDlg($('#lbDlg')); });
    $('#lbPrev').onclick = (e) => { e.stopPropagation(); show(gi - 1); }; $('#lbNext').onclick = (e) => { e.stopPropagation(); show(gi + 1); };
    $('#lbDlg').addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(gi - 1); if (e.key === 'ArrowRight') show(gi + 1); });
  }

  /* ---------- Chrome: nav, theme, motion ---------- */
  function initChrome() {
    const tf = $('#topFixed'), setTop = () => document.documentElement.style.setProperty('--top-h', tf.offsetHeight + 'px');
    setTop(); addEventListener('resize', setTop); if ('ResizeObserver' in window) new ResizeObserver(setTop).observe(tf); if (document.fonts && document.fonts.ready) document.fonts.ready.then(setTop);
    const links = $('#links'), burger = $('#burger');
    burger.addEventListener('click', () => { const o = links.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
    $$('a', links).forEach((a) => a.addEventListener('click', () => { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }));
    $('#themeBtn').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      const apply = () => { document.documentElement.dataset.theme = next; try { localStorage.setItem('kk_theme', next); } catch (e) { /* ignore */ } };
      if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(apply); else apply();
    });
    $$('.links a, .footer a[href^="#"]').forEach((a) => { const t = a.getAttribute('href').length > 1 && $(a.getAttribute('href')); if (t && t.hidden) a.remove(); });
    const secs = $$('.links a').map((a) => $(a.getAttribute('href'))).filter(Boolean), as = $$('.links a');
    const onScroll = () => { const y = scrollY; let cur = ''; secs.forEach((s) => { if (!s.hidden && s.offsetTop - 160 <= y) cur = '#' + s.id; }); as.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === cur)); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    // cookie notice
    if (!store.get('kk_cookie', false)) { $('#cookie').hidden = false; $('#cookieOk').onclick = () => { store.set('kk_cookie', true); $('#cookie').hidden = true; }; }
    document.addEventListener('click', (e) => { if (links.classList.contains('open') && !e.target.closest('#links,#burger')) { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });
  }

  function init() {
    renderStatic(); updateOpen(); setInterval(updateOpen, 30000);
    initMenu(); initCart(); initCheckout(); initReserve(); initForms(); initSlider(); initGallery(); initChrome();
    document.body.classList.remove('pending');
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }
  boot();
})();
