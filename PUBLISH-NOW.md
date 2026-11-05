# PUBLISH NOW: go live in about 30 minutes

**What you need:** a free GitHub account, a Render account (render.com), and a payment card
(a hosted server with a *persistent disk* is a paid plan on Render; check their current price).
A custom domain name is optional: you get a free `*.onrender.com` address first.

> Why not a free/static host? Orders, reservations and the admin panel need a running server and a disk to keep your data.

---------------------------------------------------------------------
## Part 1: Put the files on GitHub (5 min, no command line)
1. Unzip `kilo-pro.zip`. Open the `kilo-pro` folder.
2. On github.com click **+ > New repository**. Name: `my-restaurant`. Choose **Private**. Click **Create repository**.
3. On the new repo page click **uploading an existing file**.
4. Select **everything inside** the `kilo-pro` folder (`server.js`, `public`, `render.yaml`, `package.json`, `Dockerfile`, ...) and drag it into the page.
   Wait for the upload to finish, then click **Commit changes**.
   (If your computer hides files starting with a dot, that is fine: you do not need them.)

## Part 2: Deploy on Render (10 min)
5. Go to **render.com**, sign up with GitHub and allow access to your `my-restaurant` repository.
6. Click **New + > Blueprint**, pick the repository, click **Connect**.
7. Render reads `render.yaml` and shows one web service with a 1 GB disk. It asks for **SITE_URL**: type
   `https://YOUR-SERVICE-NAME.onrender.com` (the service name is `kilo-kitchen` unless you change it, so `https://kilo-kitchen.onrender.com`).
   If that name is taken Render gives a different one: you will fix SITE_URL in step 9.
8. Click **Apply**. Wait until the deploy shows **Live** (a few minutes).
9. Click your service, copy the real web address at the top. If it differs from what you typed, open **Environment**,
   edit `SITE_URL` to the real address and save (the service restarts).
10. In **Environment**, copy the value of **ADMIN_SETUP_KEY** (you need it once).

> If the Blueprint option gives an error, create it by hand: **New + > Web Service**, connect the repo, Runtime **Node**,
> Build command `echo ok`, Start command `node server.js`, add a **Disk** (mount path `/data`, 1 GB) and environment variables
> `DATA_DIR=/data`, `TRUST_PROXY=1`, `SITE_URL=your address`, `ADMIN_SETUP_KEY=a long random phrase`.

## Part 3: Make it yours (15 min)
11. Open `https://YOUR-ADDRESS/admin/`. Enter the setup key, your email and a strong password. You are in.
12. The dashboard shows a **Launch checklist**. Work through it (each item has a Fix button):
    - **Settings > Contact & hours:** time zone, currency, address, phone, WhatsApp, your **real opening hours**, social links.
    - **Menu:** edit or delete every sample dish; upload photos of **your own** food (the starter photos are placeholders).
    - **Settings > Brand & homepage:** your name, logo, colours, headline, about text. Turn the announcement bar on if you want it.
    - **Team / Reviews:** add real people and real guest reviews (they stay hidden until you add them).
    - **Settings > Email:** create a free account at **resend.com**, verify your domain, paste the API key and a From address,
      click **Send test email**. This gives you new-order and booking alerts.
    - **Settings > Ordering / Reservations:** delivery fee, tax, minimum order, prep times, how many guests per time slot.
13. Read `public/privacy.html` (it is template text) and have it checked for your country before you advertise widely.

## Part 4: Test like a customer (5 min)
14. On your phone open your address. Check: "Open now" is right, photos look good, the menu is yours.
15. Place a **test order** and a **test reservation**. Confirm they appear in **Admin > Orders / Reservations**
    and that you received the alert email. Change an order's status and check the tracking page updates.
16. Download a **backup** (Settings > Account). Optional: run `node tools/smoke-test.js https://YOUR-ADDRESS` for an automatic check.

## Part 5: Announce it
17. Share the link. Add it to Instagram/Google Business Profile/WhatsApp status.
18. **Own domain (optional):** Render > your service > **Settings > Custom Domains**, add your domain, create the DNS record
    Render shows at your domain registrar, wait for the green tick, then change `SITE_URL` to `https://yourdomain.com`.

---------------------------------------------------------------------
### Things to know
- **Costs:** the hosting plan, your domain, and (optional) Resend if you outgrow its free tier. Check current prices.
- **Your data lives on the Render disk.** Download a backup monthly (Settings > Account). A daily safety copy is also kept on the disk.
- **Updating the site later:** change things in the admin: no redeploy needed. Code updates: upload new files to GitHub, Render redeploys.
- **Online card payments are not included.** Orders are pay on pickup/delivery (Paystack/Flutterwave/Stripe can be added later).
- **Not on Render?** Other options (Railway, your own server, Docker, cPanel) are in `DEPLOY.md`.
