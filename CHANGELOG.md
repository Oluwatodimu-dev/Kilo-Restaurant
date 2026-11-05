# Changelog

## 1.0.5 : the nav bar is the only fixed element
- Removed the mobile bottom bar (Order / Reserve / Contact) that stayed pinned to the bottom of the screen. Order and Reserve remain in the hero, the menu and the nav menu; WhatsApp stays in the contact section and footer.
- The cookie notice is a normal bar at the top of the page content (scrolls away with the page, disappears when dismissed) instead of a pinned bar.
- Confirmation messages ("Classic Hummus added") now slide out from under the nav bar itself instead of being a separate pinned bar at the bottom.
- The server now always revalidates CSS/JS (ETag, no stale 5-minute cache), so visitors never see an old layout after an update.
- Verified on the server version and the single-file preview at five widths (including phone emulation): exactly one pinned element, the nav bar.

## 1.0.4 : only the nav bar is fixed
- The menu filter/search bar (category tabs, search, dietary chips) is no longer pinned. It is a normal full-width band that scrolls with the page. The nav bar remains the only fixed bar (flush at the top, opaque, nothing shows through it).

## 1.0.3 : fixed header and fixed menu/search bar
- The header (announcement bar + navigation) is `position:fixed`, flush with the top-left of the screen (including the notch/status-bar area on phones), full width and fully opaque. Nothing can show above, beside or through it at any scroll position. The page reserves exactly its height.
- The menu filter/search bar (category tabs, search, dietary chips) is now a full-width, opaque band pinned flush under the header while you browse the menu, with no gap, and it scrolls away when the menu section ends. On phones it is compact (tabs, search and chips each on one scrollable row).
- Fixed a mobile layout bug found during this work: the chip row could make the page wider than the screen. Also fixed a few pixels of overflow in the newsletter form on the narrowest phones.
- New automated checks: opaque + flush + nothing-visible-through probes (every pixel row of the header and menu bar, 10 scroll positions, 5 screen widths), alignment with the dish grid, and no sideways overflow.

## 1.0.2 : flat bars, no floating UI, no glitches
Found by a systematic audit (fixed/sticky element scan, layout-shift + flicker measurement, overlap detection, screenshots at 5 widths).
- **Nothing floats any more.** Header (announcement + nav), menu/filter bar, mobile menu panel, mobile action bar, cookie notice and notifications are flat, full-width bars attached to the screen edge (no pills, margins, rounded corners, shadows or glass). Mobile bars stack flush (header, menu panel, cookie bar above action bar).
- Removed floating action buttons (WhatsApp, back-to-top). WhatsApp lives in the contact section, footer and mobile action bar; "Back to top" is a footer link.
- Hero and About imagery is a static grid (no overlapping/floating photos or cards).
- Header is `position:sticky` in normal flow: always visible, never moves, no layout jump (no padding hack).
- **Flicker fixed:** the menu search/filters no longer rebuild every dish card on each keystroke (cards are filtered in place).
- **Blank-area glitch fixed:** content no longer starts invisible and fades in on scroll.
- **Empty-page flash fixed:** the page stays hidden until fully drawn (with a 4s safety net and a no-JS fallback).
- Reviews slider no longer changes the section height between slides (slides share one grid cell).
- Removed the full-screen noise overlay (blend-mode layer that causes scroll jank on phones) and the cursor-following hover glow.
- Mobile menu closes when you tap outside it. Page no longer jumps sideways when a dialog opens (scrollbar-gutter).
- Cookie/notification bars measure the real action-bar height so stacked bars align exactly.
- Admin: top bar and save bar are opaque and attached; notifications are an attached bar; sidebar scrollbar slimmed.

## 1.0.1 : stable layout
- Header (announcement bar + navigation) is now truly `position:fixed`, always visible, and never slides or hides on scroll. The page reserves exactly its height, so nothing sits underneath it, and anchor links land below it. The header band is frosted so content never reads through it.
- Removed all idle/ambient motion: bobbing hero photos, drifting background blobs, scrolling marquee (now a static strip), parallax hero image, spinning button border, pulsing status dots, magnetic buttons.
- Removed hover movement (cards, buttons, images, icons no longer lift, zoom or rotate). Hover now changes colour/shadow only.
- Menu category bar is static (no longer sticky). Floating WhatsApp and back-to-top buttons are hidden on mobile (the bottom action bar replaces them, with a Chat shortcut).
- Scroll-reveal is a fade only (no sliding). Remaining animations are one-shot open/close transitions for dialogs and the cart panel.

## 1.0.0 : first release
Release hardening
- The real site now ships **clean**: no sample guest reviews, no sample staff, no invented statistics, no placeholder phone/address/email.
  Sections with no content (reviews, team, stats) and their menu links hide automatically. Contact rows only appear once you fill them in.
- Sample reviews/staff/contact details exist only in `PREVIEW.html` so the demo looks complete.
- Hero/about/FAQ copy no longer contains factual claims (years, plate counts, delivery minutes, percentages).
- Launch checklist and `tools/smoke-test.js` check for starter photos, sample content and missing contact details.
- Added `PUBLISH-NOW.md` and `NODE_VERSION` in `render.yaml`.

## 2.2.0 : bug-fix and deployment-readiness release
Fixed
- Owner text containing `$&`, `$'` or `$$` could corrupt the page (unsafe string replacement). Now rendered literally.
- Late-night hours (e.g. 18:00 to 02:00): "Open now" and after-midnight reservations now work (site, server and preview).
- A default 10% tip could be added silently when no tip options were configured. Default is now "No tip", and the field hides when unused.
- A deactivated promo code left customers stuck at checkout. It is now removed automatically with a clear message.
- Admin Delete / Cancel / Restore buttons relied on native confirm dialogs, which are blocked in sandboxed pages (hosted preview). Replaced with in-app confirmations.
- Admin sign-in form did nothing after a session expired mid-use. Fixed.
- Time-slot list clipped its last row; layout overflowed by a few pixels at 320px and 768px widths. Fixed.
- Malformed URLs returned 500 (now 400); oversized uploads reset the connection (now a clean error).
- Announcement-bar links could point at `javascript:` URLs. Only #anchors, /paths, http(s), mailto and tel are accepted.
- Email campaigns blocked the admin request and produced broken unsubscribe links without SITE_URL. Now sent in the background and require SITE_URL.
- Quoted values in `.env` (SITE_URL="https://...") are handled.
- Upgrading from an older database now fills in any new settings without touching the owner's values.
Improved
- Admin stays signed in across server restarts and redeploys; tokens stored hashed; password change signs out other devices.
- Promo-code guessing is rate-limited. Order and booking references are guaranteed unique.
- Static files: ETag/304 revalidation, in-memory gzip cache, sensible cache lifetimes.
- Security headers: frame-ancestors, HSTS (over HTTPS), noindex on /admin and /api, Permissions-Policy.
- Keep-alive and request timeouts tuned for Render/Railway/Nginx proxies.
- Added `tools/smoke-test.js` post-deployment check, daily automatic backups, backup/restore, and the admin Launch checklist.
