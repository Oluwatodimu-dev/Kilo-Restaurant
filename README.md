# Kilo Kitchen: restaurant website + admin dashboard

A complete restaurant website with a password-protected admin panel.
**Zero dependencies**: no `npm install` needed. Requires Node.js 18 or newer.

## Easiest way to look at it
Double-click **PREVIEW.html**. See **START-HERE.txt**. To go live see **DEPLOY.md**.

## Run the real server
Double-click `START-WINDOWS.bat` / `START-MAC.command` / `start-linux.sh` (needs Node.js once), or:

    node server.js
    # Website: http://localhost:3000     Admin: http://localhost:3000/admin/

The **first time** you open `/admin/` you create your admin account (email + password of 10+ characters).

## What the admin controls (everything live, instantly)
- **Orders**: live board with sound alert, status workflow (confirm, prepare, ready/out for delivery, complete), print kitchen ticket, CSV export. Customers can track their order on the site.
- **Reservations**: confirm / cancel / seat, per-slot capacity limits (slots show "full"), CSV export.
- **Menu**: add / edit / delete dishes, upload photos, prices, dietary labels, sold-out toggle, reorder. Categories too.
- **Promo codes**, **Team**, **Reviews**, **Gallery**, **FAQ**.
- **Messages** from the contact form, **Subscribers** + send email campaigns (with unsubscribe link).
- **Settings**: restaurant name, logo, brand colour, hero text/photos, announcement bar, "today's special", about text, stats,
  address / phone / email / WhatsApp / map / socials, **opening hours**, **time zone & currency**, delivery fee, tax, tips,
  minimum order, prep times, reservation rules, SEO title/description, email alerts.
- **Dashboard**: revenue, 7-day chart, top dishes, today's bookings.

## First 10 minutes after launch (important)
1. Settings, Contact & hours: set your **time zone** and **currency symbol**, your real address / phone / hours.
2. Settings, Email & alerts: paste a **Resend API key** (free at resend.com) and a From address on your verified domain, then click "Send test email". This gives you new-order / booking alerts and confirmation emails for customers.
3. Replace the sample reviews, team members, photos and menu with your own.
4. Settings, Account: you can change your password any time.

## Deploy
You need a host that runs **Node.js** (a static host like Netlify alone will not run the admin/orders).
Easy options: **Render**, **Railway**, **Fly.io**, a VPS (use `pm2 start server.js`), or any Docker host (Dockerfile included).

Environment variables (see `.env.example`):
- `DATA_DIR`: folder for `db.json` and uploaded photos. **Point it at a persistent disk/volume**, otherwise data is lost on redeploy.
- `SITE_URL`: your public URL, e.g. https://www.yourrestaurant.com (emails, sitemap, SEO).
- `ADMIN_SETUP_KEY`: optional. If set, creating the admin account requires this key, so nobody can claim the admin before you.
- `TRUST_PROXY=1` when behind a proxy/CDN (Render, Railway, Cloudflare, Nginx).
- `PORT`: provided by most hosts automatically.

Always serve over **HTTPS** (all the hosts above do this automatically). Back up `DATA_DIR` regularly.

## Security notes
Passwords are hashed with scrypt; sessions use HttpOnly SameSite=Strict cookies with CSRF tokens; login and public forms are rate limited;
all prices are recalculated on the server (customers cannot change them); uploads are verified as real images; a strict Content-Security-Policy is set.

## Quality & testing
The project was tested with ~150 automated checks (API security, order maths, reservations incl. overnight hours, backups/restore,
browser flows for ordering, tracking, admin editing, uploads, downloads, session expiry, accessibility basics, layout at 320-1600px).
After you deploy, run `node tools/smoke-test.js https://your-site` for a live health and security check.

## Not included (needs extra services)
- **Online card payments**: orders are "pay on pickup/delivery". To take cards, integrate Paystack, Flutterwave or Stripe in `/api/orders`.
- **SMS / WhatsApp notifications**: email only for now (WhatsApp chat button is included).
- Multi-user admin accounts (single owner login).

## Files
    PREVIEW.html           single-file preview (site + admin, no setup)
    START-*.bat/.command   double-click launchers
    DEPLOY.md  render.yaml  Dockerfile  Procfile   deployment
    tools/                 preview builder (optional)
    server.js              API, admin auth, uploads, email, backups (single file)
    public/index.html      website shell (content comes from the admin)
    public/assets/         css, js, images, default-data.json (seed + static fallback)
    public/admin/          admin dashboard
    data/db.json           your data (created on first run)
    data/uploads/          photos you upload
