#!/usr/bin/env node
/* Post-deployment smoke test. Usage:  node tools/smoke-test.js https://your-site.com
   Checks that the live site is healthy and safely configured. Read-only: it places no orders. */
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
let fails = 0;
const ok = (name, cond, hint) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond || !hint ? '' : '\n         -> ' + hint)); if (!cond) fails++; };
(async () => {
  console.log('\nTesting ' + base + '\n');
  const get = async (p, o) => { try { const r = await fetch(base + p, Object.assign({ redirect: 'manual' }, o)); return { r, t: await r.text() }; } catch (e) { return { err: e }; } };
  let x = await get('/healthz'); if (x.err) { console.log('  Cannot reach the site: ' + x.err.message); process.exit(1); }
  ok('Server is up (/healthz)', x.r.status === 200);
  x = await get('/'); ok('Home page loads', x.r.status === 200 && x.t.includes('<html'));
  ok('No leftover template placeholders', !/\{\{[A-Z_]+\}\}/.test(x.t), 'The page was not rendered by server.js. Is the host serving files statically instead of running Node?');
  ok('Site data is embedded', x.t.includes('id="site-data"') && x.t.includes('"menu"'));
  const h = x.r.headers;
  ok('Content-Security-Policy header', !!h.get('content-security-policy'));
  ok('HTTPS in use', base.startsWith('https://'), 'Use https:// (your host should provide it automatically).');
  if (base.startsWith('https://')) ok('HSTS header present', !!h.get('strict-transport-security'), 'Set TRUST_PROXY=1 so the server knows it is behind HTTPS.');
  x = await get('/api/site'); let site = {}; try { site = JSON.parse(x.t); } catch (e) { /* ignore */ }
  ok('Public API returns the menu', Array.isArray(site.menu) && site.menu.length > 0);
  ok('No secrets in public API', !/apiKey|passw|secret|scrypt/i.test(x.t));
  const s = site.settings || {};
  ok('Time zone is set (not UTC)', s.timezone && s.timezone !== 'UTC', 'Admin > Settings > Contact & hours > Time zone');
  ok('Address and phone are filled in', !!(s.contact && s.contact.address && s.contact.phone), 'Admin > Settings > Contact & hours');
  ok('No sample reviews are public', !(site.reviews || []).some((r) => /^Sample Guest/.test(r.name)), 'Admin > Reviews: hide or delete them');
  ok('No sample team members are public', !(site.team || []).some((t) => ['Alex Smith', 'Margaret Theresa', 'Mary Reuben', 'Hussein Wahab'].includes(t.name)), 'Admin > Team');
  ok('Menu photos are your own', !(site.menu || []).some((m) => /^assets\/img\/(food|feast)/.test(m.img)), 'Admin > Menu: upload photos of your real dishes (the starter photos are placeholders)');
  x = await get('/api/admin/data'); ok('Admin data requires login', x.r.status === 401);
  x = await get('/admin/'); ok('Admin page loads', x.r.status === 200); ok('Admin is hidden from search engines', /noindex/.test(x.r.headers.get('x-robots-tag') || ''));
  x = await get('/data/db.json'); ok('Database file is NOT downloadable', x.r.status === 404);
  x = await get('/server.js'); ok('Source code is NOT downloadable', x.r.status === 404);
  x = await get('/..%2fserver.js'); ok('Path traversal blocked', x.r.status !== 200 || !x.t.includes('createServer'));
  x = await get('/robots.txt'); ok('robots.txt blocks /admin', /Disallow: \/admin/.test(x.t));
  x = await get('/sitemap.xml'); ok('sitemap.xml uses your real domain', x.r.status === 200 && !x.t.includes('example.com') && !/<loc>\/</.test(x.t), 'Set the SITE_URL environment variable on your host.');
  x = await get('/definitely-not-a-page'); ok('Unknown pages return 404', x.r.status === 404);
  x = await get('/assets/img/hero.jpg'); ok('Images are served', x.r.status === 200);
  console.log(fails ? `\n${fails} check(s) need attention. Fix the items above, then run this again.\n` : '\nAll checks passed. Your site looks ready.\n');
  process.exit(fails ? 1 : 0);
})();
