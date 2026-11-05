# Deploying Kilo Kitchen (go live for real customers)

Your site needs a host that can run **Node.js** (a normal "website only" host is not enough, because orders,
reservations and the admin panel need the server). All the options below give you free HTTPS.

> Prices and plan names change, so check the host's pricing page. What you must have: **Node.js 18+**,
> a **persistent disk / volume** (so your menu, orders and photos survive restarts), and **HTTPS**.

---------------------------------------------------------------------
## 0. Before you deploy (10 minutes)
1. Double-click `PREVIEW.html` (or run the real server locally) and open the admin dashboard.
*(Quickest path: PUBLISH-NOW.md. This file has the alternatives.)*
2. After deploying, work through the **Launch checklist** on the admin dashboard. The real site starts clean (no sample reviews, staff or contact details). At minimum:
   - Settings, Contact & hours: your real address, phone, email, **time zone**, **currency**, opening hours.
   - Replace the sample reviews and starter photos with your own.
   - Set delivery fee / tax / minimum order to match your business.
3. Create a free account at **resend.com**, verify your domain, and create an API key (for order/booking emails).
   You can do this after launch too: the site works without it, you just won't get email alerts.
4. Optional but recommended: buy a domain name (e.g. yourrestaurant.com).

> The preview's data lives only in your browser. On the real server you re-enter (or restore from a backup) your content.
> In the real admin: Settings, Account, **Restore from backup** also accepts a backup you downloaded from the preview.

---------------------------------------------------------------------
## Option A: Render.com (easiest, no command line)
1. Create a free account at **github.com**, then click **New repository** (name it `kilo-kitchen`, keep it Private).
2. Click **uploading an existing file**, drag in the *contents* of this folder (not the zip), and **Commit**.
   (Do not upload a `data` folder from your computer if you used the local server and want a fresh start.)
3. Create an account at **render.com** and connect your GitHub.
4. Click **New + > Blueprint**, choose your repository. Render reads `render.yaml` and sets everything up
   (web service + 1 GB persistent disk + a random admin setup key).
5. When asked, type **SITE_URL** = your final web address (e.g. `https://kilo-kitchen.onrender.com` or your own domain).
6. Click **Apply** and wait for the first deploy to turn green.
7. In the Render dashboard open your service > **Environment**, copy the value of `ADMIN_SETUP_KEY`.
8. Visit `https://YOUR-SITE/admin/`, enter the setup key, and create your admin email + password. Done!
9. Custom domain: Render > your service > **Settings > Custom Domains**, add your domain, and create the DNS record Render shows you
   at your domain registrar. HTTPS is automatic. Then update **SITE_URL** to your domain.

## Option B: Railway.app
1. Push the files to a GitHub repo (as in A.1-A.2). On railway.app choose **New Project > Deploy from GitHub repo**.
2. Add a **Volume** to the service and mount it at `/data`.
3. Variables: `DATA_DIR=/data`, `TRUST_PROXY=1`, `SITE_URL=https://your-domain`, `ADMIN_SETUP_KEY=choose-a-long-random-phrase`.
4. Generate a domain (or add yours), then open `/admin/` and create your account.

## Option C: Your own server (VPS, Ubuntu)
    # install Node 20+ (https://nodejs.org), then:
    git clone <your repo> kilo && cd kilo        # or upload the folder
    cp .env.example .env                          # edit SITE_URL, DATA_DIR, ADMIN_SETUP_KEY
    npm i -g pm2 && pm2 start server.js --name kilo && pm2 save && pm2 startup
    # HTTPS with Caddy (auto certificates): in /etc/caddy/Caddyfile
    #   yourrestaurant.com { reverse_proxy localhost:3000 }
Open ports 80/443 only. Keep `TRUST_PROXY=1`.

## Option D: Docker (any Docker host)
    docker build -t kilo .
    docker run -d -p 3000:3000 -v kilo-data:/data -e SITE_URL=https://yourdomain.com -e ADMIN_SETUP_KEY=long-random-phrase kilo

## Option E: cPanel shared hosting
If your host offers **Setup Node.js App**: upload the files, set the startup file to `server.js`, add the environment variables above
(set `DATA_DIR` to a folder **outside** `public_html`), start the app and open `/admin/`.

---------------------------------------------------------------------
## After you deploy: test everything once (5 minutes)
- [ ] **Automatic check (recommended):** on any computer with Node.js run
      `node tools/smoke-test.js https://YOUR-SITE`
      It verifies HTTPS, security headers, that your database and source code are not publicly downloadable, that admin needs a login,
      and reminds you of anything still left at sample values (time zone, contact details, sample reviews, SITE_URL). Re-run until all PASS.
- [ ] Open the site on your phone. Does it look right? Is "Open now" correct? (If not: time zone in Settings.)
- [ ] Place a **test order** and a **test reservation**. Do they appear in Admin > Orders / Reservations?
- [ ] Admin > Settings > Email: click **Send test email**. Do you get it? Do you get new-order alerts?
- [ ] Change a menu price in admin and refresh the website: does it update?
- [ ] Download a **backup** (Settings > Account). Keep it somewhere safe.
- [ ] Open the Launch checklist on the dashboard: everything ticked?

## Keeping it healthy
- **Backups:** the server saves a safety copy every day (last 14 kept in `data/backups`). Also download a manual backup monthly.
- **Updating the code:** replace the files but never delete your `data` folder / disk. Restart the app.
- **Staying signed in:** admin sessions survive restarts and redeploys (12 hours). Changing your password signs out every other device.
- **Forgot your admin password?** Stop the app, open `data/db.json`, set `"admin": null`, start again: the setup screen returns
  (keep your `ADMIN_SETUP_KEY` set so nobody else can claim it).
- **Health check URL:** `/healthz` returns `{"ok":true}`.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Open now" / booking times are wrong | Set the **time zone** in Settings, Contact & hours |
| Data disappears after redeploy | The disk is not mounted. Set `DATA_DIR` to the mounted path |
| No emails arrive | Settings > Email: add Resend key + From address on a **verified domain**; check "Recent emails" for the error |
| Everyone shows the same IP / rate-limits trip | Set `TRUST_PROXY=1` when behind a proxy/CDN |
| Cannot create admin account | `ADMIN_SETUP_KEY` is set: enter it on the setup screen |
| "Port already in use" locally | The site is already running in another window. Close it first |

## What is not included (add later if you need it)
- Online card payments (add Paystack, Flutterwave or Stripe to `/api/orders` in `server.js`)
- SMS notifications, multiple staff logins, delivery driver tracking
