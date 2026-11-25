# IIDMF 2026 — landing page, registration and admin panel

```
mus-dance/ index.html, iidmf.css, iidmf.js, assets/  → the landing page (host this folder)
admin/     index.html                        → one-page admin panel (host anywhere)
supabase/  migrations/001_registrations.sql  → database (one table)
           migrations/002_cleanup_old_setup.sql → only for databases made from older versions
           functions/register/index.ts       → saves a registration
           functions/admin/index.ts          → admin login, list and export
           config.toml                       → function settings
```

Everything runs on the Supabase free tier. The landing page has **no third-party
scripts** (only optional Google Fonts), which keeps it friendly to government
site security policies.

---

## 1. Supabase setup (about 15 minutes)

1. Create a project at supabase.com. Pick the **Mumbai (ap-south-1)** region so data stays in India.
2. **SQL Editor** → paste `supabase/migrations/001_registrations.sql` → Run.
3. Deploy the two functions (needs the Supabase CLI):
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase secrets set ALLOWED_ORIGINS="https://www.THEIR-SITE.gov.in,https://THEIR-SITE.gov.in"
   supabase secrets set IP_HASH_SALT="$(openssl rand -hex 32)"
   supabase secrets set ADMIN_PASSWORD="choose-a-long-password-12-or-more-characters"
   supabase functions deploy register --no-verify-jwt
   supabase functions deploy admin --no-verify-jwt
   ```
   (Or in the dashboard: **Edge Functions** → create `register` and `admin`, paste each
   `index.ts`, turn **off** "Verify JWT" on both, and add the three secrets under
   **Edge Functions → Secrets**.)
   While testing locally you can add `http://localhost:5500` (or whatever you use) to
   `ALLOWED_ORIGINS`, then remove it before going live.

**The admin login** is the username `admin` and whatever you set as `ADMIN_PASSWORD`.
There is no Supabase Auth user, no email and no admins table. The password is a Supabase
secret, so it never appears in the code or the page. It must be at least 12 characters;
with a shorter one (or none) the admin function refuses everyone. To change the password,
set the secret again; everyone is signed out. To use a different username, also set
`ADMIN_USERNAME`.

The registration URL is `https://YOUR-PROJECT-REF.supabase.co/functions/v1/register`
and the admin URL is `https://YOUR-PROJECT-REF.supabase.co/functions/v1/admin`.

## 2. Landing page

In `mus-dance/index.html`, set the function URL on the wrapper:

```html
<div class="iidmf" id="iidmf" lang="en"
     data-function-url="https://YOUR-PROJECT-REF.supabase.co/functions/v1/register">
```

### What the website team needs to do

1. Upload `iidmf.css`, `iidmf.js`, the `assets/` folder (ICCR logo and hero artwork) and the country photos to their server.
2. In the page `<head>`: the Google Fonts `<link>` tags and `iidmf.css`.
3. In the page body: everything between `EMBED START` and `EMBED END`.
4. Before `</body>`: `<script src="iidmf.js" defer></script>`.

All classes and IDs start with `iidmf`, so nothing clashes with their site's styles.
The page has no navbar of its own; it sits under the ICCR site's header. If that header
is sticky, set `--sticky-top` in `iidmf.css` (for example `--sticky-top: 64px;`) so
in-page links like "Register here" don't scroll content underneath it.

### Things to send them with the code

- **Content-Security-Policy**: if the site uses one, it must allow
  `connect-src https://YOUR-PROJECT-REF.supabase.co` (the form posts there), plus
  `img-src blob:` (the pass preview). For fonts: `style-src https://fonts.googleapis.com`
  and `font-src https://fonts.gstatic.com` — or they can self-host Oswald,
  Montserrat and Kaushan Script (all free, SIL Open Font License). The page falls back to
  system fonts if they're blocked, but the poster look depends on them.
- No inline scripts or inline styles are used, so a strict CSP is fine.

### Logo

`assets/iccr-logo-white.png` (State Emblem + ICCR mark, white) appears on the hero's date
card and on the downloadable pass. The pass reads its path from `data-logo` on
`#iidmf`; keep the logo on the **same domain** as the page (or serve it with CORS
headers), otherwise the pass is drawn without it. The emblem is shown at its original
proportions and colour, as the State Emblem rules require; don't stretch or recolour it.

### Look and hero artwork

Colours, type and the hero follow the official festival poster. The performers
illustration (`assets/hero-performers-1600.jpg` and `-900.jpg`) was cut from a
WhatsApp copy of the poster; ask the designer for the original high-resolution
artwork and re-export it at the same sizes for a sharper hero.

### Country photos

Each country card reads its photos from `data-photos` (comma-separated paths) and
the alt text from `data-alt`. Missing photos show a placeholder instead of a broken
image. Default paths are `assets/countries/<country>-1.jpg` to `-3.jpg`. Use
landscape images around 1200 × 750, compressed to under 200 KB each.

## 3. Admin panel

Set one value, `FUNCTION_URL`, near the top of the script in `admin/index.html`
(the admin URL above). Sign in with username `admin` and the `ADMIN_PASSWORD` you set.
The page holds no keys and no password; it loads no outside scripts. Sessions last
12 hours (and end when you press Sign out).

Host it anywhere static (Netlify, Cloudflare Pages, GitHub Pages, or the client's own
server). It's marked `noindex`. Features: totals per evening, search by name, email,
mobile or pass code (useful at the gate), filter by evening, and CSV download of the
current filter.

## How it behaves

- **One registration per email.** If someone registers again with the same email
  and mobile, they get their original pass back (so "lost my pass" is self-service).
  Same email with a different mobile is rejected.
- **Spam protection**: hidden honeypot field, minimum form-fill time, 20 registrations
  per network per hour, and the function only accepts requests from the origins in
  `ALLOWED_ORIGINS`. IP addresses are stored only as salted hashes.
- **The pass** is drawn in the browser as a PNG: a tall, phone-screen pass on phones (big pass code to show at the gate) and a landscape, printable pass on larger screens. Nothing is emailed.
- **The database is closed to browsers.** Row Level Security is on, with no policies,
  so nobody can read or write the table directly; only the two functions can.
- **Admin sign-in protection**: the password is compared in constant time, every wrong
  guess is answered one second late, 8 wrong guesses from one network block further
  attempts for 15 minutes (best effort), and the function stays shut until a password of
  12+ characters is set. Pick a long, unique password: that is the real protection.

## Free-tier limits to keep in mind

Supabase free projects **pause after 7 days without activity**. Open the admin panel
or make a test registration at least once a week until the event, or upgrade for the
event month. Free limits (500 MB database, 500k function calls a month) are far above
what this needs.
