# NDC Atwima Kwanwoma — Vice Chairman Election Collation System

**Official NDC branding:** logo supplied by the constituency (`public/img/logo.png`).
Theme colours are sampled directly from it — green `#036439`, red `#d20f2d`,
black `#202020` on white.

Live web app for collating the **Vice Chairman** results of the NDC Atwima Kwanwoma
Constituency Delegates Conference (October 2026).

**Candidates:** 1. Lawrence Obiri Yeboah · 2. John Junior Owusu Ansah · 3. Nana Kofi Nti

---

## 1. Sign-in details (change these before real use)

| Role | Username | Password |
|---|---|---|
| Administrator (System Administrator) | `admin` | `Admin@2026` |
| Branch Officer (sample) | `officer` | `Officer@2026` |

- Change the admin password immediately: **user menu (top right) → Change password**.
- Create one account per officer under **Users → + Add user**. Officers can enter results
  for any branch but **cannot see the collation, infographics, progress, audit or settings** –
  every admin API endpoint returns 403 for them.
- Deactivate accounts (instead of deleting) when an officer finishes.

## 2. Running the app

```bash
cd election-app
node server.js     # serves http://0.0.0.0:3000
```

Dependencies are vendored in `vendor/deps`, so the app starts even when `node_modules/`
is absent (it is not persisted by the workspace snapshot). To refresh them:
`npm run deps`.

Data is stored in `data/db.json` and survives restarts. Back it up from
**Settings → Download backup** (JSON with results, accounts and the full audit trail).

## 3. What each role sees

**Officer:** Enter Results (branch picker + candidate votes + rejected ballots, auto
vote-cast total) and My Submissions (only their own entries).

**Administrator:** Overview (KPIs, candidate cards, area progress, latest activity),
Collation (every branch, filters, inline edit/lock/clear, CSV export), Infographics
(donut share, standings, majority mark, leading candidate per area), Progress
(area-by-area reporting), Data Entry (any branch, corrections require a reason),
Users, Branches (register + CSV import), Audit trail, Settings (open/close entry,
training sample data, clear all results, backup).

## 4. Branches & electoral areas

The app is loaded with the **official polling-station register** from
`EC_AK_CONSTITUENCY.csv`: **240 polling stations across 33 electoral areas**.

- Branch code = the EC polling-station code (e.g. `F160201A`).
- Branch name = the polling-station name (e.g. “Meth Prim Twedie”).
- Electoral area = derived from digits 3–4 of the EC code (the district's 33 areas),
  named from the station names, e.g. `Atwima Boko`, `Twedie`, `Foase`, `Kobriso/Foase`,
  `Trabuom`, `Jechi`, `Nweneso No.1–3`, `Kromoase`, `Aburaso`, `Akyeremade`, `Yabi`,
  `Dida`, `Apemanim/Kokoben`, `Darko/Bebu`, `Ampabame No.2/Nkoransa`, `Apampatia/Hemang`,
  `Adumasa`, `Brofoyedru`, `Kotwi/Twindurase`, `Trede/Akrofuom`, `Ampabame No.1`,
  `Kwanwoma/Aboabokese`, `Mpatasie`, `Ejuampong`, `Abotiaso`, `Afrancho`, `Bekwaimin`,
  `Ahenema Kokoben`, `Krofrom`, `Ampayoo`, `Chichibon/Afrancho`, `Adum Afrancho`.
- If your constituency uses different area labels, use **Branches → ✎ Rename area**
  (updates every branch in that area in one step; logged in the audit trail).

To replace the register with another list:

1. Prepare a CSV: `Code, Electoral Area, Branch` (header optional). A copy of the imported
   list is kept at `data/official-branches.csv`.
2. **Branches → Import CSV → Replace the entire branch list.**
   Replace mode clears any results already entered (accounts are unaffected).
3. Or add/edit branches one by one with **+ Add branch / Edit**.

## 5. Election controls

- **Lock** a branch result → officers can no longer edit it.
- **Correct** a locked result → admin must give a reason; before/after figures are kept
  in the audit trail and in the branch's correction history.
- **Clear** a result → resets a branch to pending (logged).
- **Close entry** (Settings) → officers cannot submit while counting is paused.
- **Clear all results** (Settings, type `CLEAR ALL RESULTS`) → wipe before the real conference.
- **Training sample data** → fills ~60% of pending branches with figures labelled
  “Sample data (training)” so the dashboard and infographics can be demonstrated.

## 6. Deploying for officers across Ghana

This workspace preview is ideal for testing and for the conference if the workspace stays
running. For a permanent public deployment:

1. Host `election-app` on any Node host (Render, Railway, Fly.io, a VPS) with a persistent
   disk for `data/`.
2. Serve it over **HTTPS** (most hosts do this automatically) so officers' passwords are
   never sent in clear text.
3. Set `ADMIN_PASSWORD` (and optionally `OFFICER_PASSWORD`) as environment variables
   **before first launch** to avoid the default credentials.
4. Keep a nightly copy of `data/db.json` (or use Settings → Download backup).

## 7. Notes & limits

- Login throttling: 6 failed attempts per IP triggers a 5-minute cool-down.
- All write actions are attributed to a user with a timestamp in the audit trail.
- Sessions last 24 hours; officers on shared phones should sign out.
- The JSON store is ideal for a one-day constituency election (a few hundred entries).
  For multi-constituency or multi-election use, migrate to Postgres/Supabase.

## 8. Interface

- **Responsive on every device**: verified with no horizontal overflow on 320, 360, 390,
  768, 1024, 1366, 1920 and 2560px viewports across all nine admin pages. The app shell is
  a CSS grid, so the top bar keeps a locked height (58px desktop / 54px phone) and spans
  the full width — it never shortens or reflows when the window is resized or the sidebar
  is toggled. Every card is flush with the header's inner edge at all widths (the old
  1480px centred cap that left cards short of the header is gone). Charts scale with the
  screen.

- **Box size never depends on its data**: a card is exactly as wide with 0 rows, 1 row or
  60 rows (verified at 390, 768, 1024, 1152, 1366 and 1920px). `contain: inline-size` plus
  `min-width: 0` on the shell, content, cards and grid tracks make the width independent of
  the table; the table's own `min-width` is clamped to `min(860px, 100%)` so it never
  invents a phantom scroll.
- **Only the box scrolls sideways**: the page itself cannot scroll horizontally at all —
  `html { overflow-x: hidden }` plus a runtime guard that resets `window.scrollX` to 0 on
  every scroll/resize. Verified by forcing `window.scrollTo(600, 0)` at seven widths:
  `scrollX` stays 0. Columns that do not fit stay outside the box and come in as you scroll
  that box's own bar; no column is pinned.
- **Stale builds are impossible to run silently**: every asset is versioned (`?v=10`), the
  server sends `Cache-Control: no-store` and `Clear-Site-Data: "cache"` for the app shell,
  an inline watchdog reloads once if an old script is loaded, and the running build is shown
  as a **V10 chip in the header** (and under Settings → App build).
- **Assets are versioned** (`?v=10` on `app.css` and every script). Bump this number in
  `public/index.html` whenever CSS/JS changes so browsers never run stale code; Settings
  shows the running build under “App build”.
- **Every data table box has its own scrollbar**: a slim bar sits directly above the
  table (arrows + draggable green thumb + clickable track). It appears only when that one
  table is wider than its box, and scrolls that table alone — the page never moves
  sideways. The bar is re-attached automatically whenever a table re-renders (polling,
  filtering, page switches) and disappears when the table fits.
- **Table boxes are self-contained**: a table never widens its card or the page. The box
  is exactly as wide as the header, and anything wider scrolls on that box's own
  horizontal scrollbar (green, with edge shadows that appear only when there is more to
  scroll). Scrolling a table never moves the page or the header. Enforced with
  `min-width: 0` on the shell/content/cards/grid tracks, `max-width: 100%` on
  `.table-wrap`, and `overflow-x: clip` on the main column as a backstop.
- **Left sidebar navigation** with a hamburger button (top-left) to open/close it.
  The choice is remembered per browser. On phones/tablets the sidebar becomes a
  slide-in drawer that closes automatically after you pick a page.
- **Searchable branch picker** in Data Entry: type a polling-station code
  (e.g. `F1602`), a branch name (e.g. `Twedie`) or an area name. Results filter as you
  type; use ↑/↓ then Enter, or click. The optional electoral-area dropdown narrows the list.
- **Vote entry**: each candidate's photo and name sits directly beside its vote box
  (12px apart) at every screen size.
- **Edit & delete your own entries**
  - Officers: *Enter Results → Your entries* and *My Submissions* both have Edit/Delete.
    Delete returns the branch to “Pending”; both actions are written to the audit trail.
    Officers cannot delete entries made by someone else, or any locked entry.
    Since **v12** an officer can only *change* an entry they created: once another officer
    or an administrator has saved an update, the entry becomes read-only for them (“Submitted
    by another officer”) and the System Administrator handles the correction.
  - Administrators: *Data Entry → Recent entries — all users* shows who entered each branch
    with Edit/Delete for every entry (locked ones need a correction reason), plus the same
    controls in the *Collation* tab.

## 8b. Running it online

The app is full stack and self-contained. To give officers a public HTTPS address:

- **Free hosting:** **[FREE-HOSTING.md](FREE-HOSTING.md)** — Oracle Cloud Always Free
  (recommended), or Render + Neon with a storage change. `deploy/oracle-setup.sh` automates
  the free VM path end to end.
- **Deploy:** see **[DEPLOY.md](DEPLOY.md)** — Render (easiest), Fly.io, or a VPS with
  Docker / systemd. `Dockerfile`, `docker-compose.yml`, `render.yaml`, `fly.toml`,
  `deploy/nginx.conf`, `deploy/Caddyfile` and `deploy/election-app.service` are included.
- **Data lives on a volume**, not in the image: mount it at `DATA_DIR` (default `/data`).
  `deploy/seed.db.json` is copied into an empty volume on first boot so a fresh deploy
  starts with the real 240-branch register instead of a placeholder one.
- **Health probe:** `GET /healthz` → `{ ok, uptime, branches, users, dataDir, dataWritable }`.
- **Backups:** automatic safety copies before destructive admin actions, plus
  `scripts/backup.sh` for scheduled snapshots that validate before they are kept.
- **One instance only** — the datastore is a single JSON file. See the scale notes.

## 9. Minimal dependencies

The app needs **only Express** — password hashing uses Node's built-in `scrypt`
(`crypto.scryptSync`, 64-byte key, per-user salt, timing-safe comparison), so there is no
bcrypt/native build step. Charts are hand-written SVG and icons are inline SVG: no CDN,
no font downloads, no framework.

Latest activity lives in the **Audit Trail** tab; the Overview stays focused on totals,
candidate standing and reporting progress.


---

## 12. Changelog

### v12 — audit fixes

**Security & correctness**
- Result payloads are strict: all four figures (three candidates + rejected) must be present,
  so a partial save can never zero a candidate's votes.
- Officers may only change entries they created; the API returns `403` and the branch detail
  exposes `canEdit` for the UI. Administrators keep full access.
- Session tokens are accepted only from the `x-session` header or the `ndc_sid` cookie —
  `?token=` in a URL is ignored. Cookies are `Secure` on HTTPS.
- Failed sign-ins are written to the audit trail with username and IP (pruned to the most
  recent 500 attempts).
- Unknown `/api/*` paths return a JSON 404; server errors return a generic message.
- Import-with-replace requires `confirm: "REPLACE BRANCHES"` and writes an automatic backup;
  clearing all results does the same.
- Sessions are pruned at boot and hourly; SIGTERM/SIGINT flush the database before exit.
- Security headers: `X-Content-Type-Options`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy`, `trust proxy 1`.

**Data Entry**
- Ownership banner + disabled form when the selected branch was entered by someone else.
- Unsaved figures are kept in `localStorage` per branch and offered back after a reload,
  dropped connection or flat battery (with a *Discard* button); network failures now show *Retry*.
- A plausibility warning appears when one branch reports more than 1,000 votes.
- Every request times out after 20 s instead of spinning forever.

**Navigation & accessibility**
- Hash routing (`#/collation`) — refresh and back/forward keep your place.
- Colour contrast brought to WCAG AA on every page; select filters labelled; heading order
  fixed; the sign-in screen is a `<main>` landmark.
- Layout breakpoint at 1000 px; polling is 10 s on desktop and 20 s on phones.
- Responsive down to 320 px and up to 2560 px with zero page-level horizontal scroll.

**Output**
- “Print” on Collation and Infographics produces a clean result sheet (no sidebar, no buttons).
- Audit Trail gets “↓ CSV” with the current filters applied.
- Candidate photos converted to progressive JPEG and the logo resized: first load dropped
  from ~742 KB to ~370 KB of images, and images below the fold lazy-load.

### v16 — minimal sign-in card

- The full-bleed two-pane sign-in is gone. **Everything now lives in one compact card**
  (384 px wide, ~480 px tall — 27% of the viewport width on a laptop, 43% on the preview panel),
  centred on a quiet green/red wash. Nothing covers the page.
- Inside the card: logo + org line, **Sign in** heading, username, password with show/hide,
  the primary button and the audit-trail note. The event line sits quietly beneath the card.
- Event wording updated everywhere: **"Constituency Executives Elections - 2026"** replaces
  "Constituency Delegates Conference · October 2026" (sign-in, sidebar, top bar).
- Verified at 320 / 390 / 902 / 1440 px: card never overflows, form fully visible.

### v15 — redesigned sign-in screen

- **Two-pane layout.** Left: a deep-green brand panel with the candidate line-up (numbered
  cards, colour-coded top rules) and register figures pulled live from the API — 240 branches,
  33 electoral areas, 3 candidates. Right: one focused card with generous spacing.
- **Password visibility toggle** with `aria-pressed` and an accessible label, so officers can
  check what they typed on a phone.
- **Proper form semantics**: real `<label for>` elements, `role="alert"` on the error, visible
  focus rings, `autocomplete` hints for password managers, Enter-to-submit.
- **Mobile-first collapse below 900 px**: the hero becomes a compact banner, the candidate grid
  and figures step aside, and the card lifts over it by 22 px — verified at 320, 360 and 390 px
  with the full form visible without scrolling.
- Candidate number badges are neutral dark glass: per-candidate colours disappeared against the
  red photo backdrops (candidate 2 is red-on-red).
- Copy states plainly that every sign-in is recorded in the audit trail.

### v14 — menu hardened, stale-build self-heal

- The account menu is now **defensive by construction**: if the page it runs in is missing a
  node it expects (an older copy of `index.html`), it creates that node instead of throwing.
  A previous version threw `Cannot set properties of null` on click, which aborted the handler
  *before* the menu was shown — the visible symptom was just the menu's shadow.
- Menu **no longer closes on scroll**; it repositions, so a stray scroll can't eat it.
- **Double-tap** no longer opens then closes it (300 ms guard).
- The shell now **self-heals mismatched builds**: if `#buildChip` and the loaded script disagree,
  the page reloads once with a cache-buster, so a browser can never run an old page against new code.
- `HEAD /` now returns the shell (it used to 404; GET was already correct).
- Cache headers verified: `/` is `no-store, no-cache, must-revalidate` + `Clear-Site-Data: "cache"`,
  so every reload fetches fresh HTML.

### v13 — account menu & typeface

- **Account menu fixed.** The dropdown is no longer rendered inside the top bar. The header is
  height-locked with `overflow: hidden` (so its length can never depend on page content), and that
  was clipping the menu to a few pixels of its shadow. The menu now lives at `<body>` level, is
  `position: fixed`, and is anchored to the avatar by JS on every open — flipping above the button
  if there is no room below. It gains a header showing who is signed in, closes on outside click,
  scroll or `Escape` (returning focus to the button), and `aria-expanded` tracks its state.
  *Change password* and *Sign out* both work from it; the sidebar keeps its own Sign out.
- **Typeface: Inter** (variable, weights 100–900, optical sizing 14–32), self-hosted in `public/fonts`
  as two WOFF2 subsets (~206 KB total). Chosen for: numeral clarity in collation tables (tabular
  figures enabled on tables and stat cards), a tall x-height that holds up at 10–11 px label sizes,
  unambiguous 1/I/l and 0/O for codes like `F160101A`, and full coverage of Twi **ɔ ɛ** and the
  cedi sign **₵** via the latin-ext subset. No CDN, so it renders offline at the venue and inside
  sandboxed previews; `font-display: swap` plus a system fallback stack keeps first paint instant.
- Licences: Inter is SIL Open Font License 1.1 (free for commercial/personal use).

**Known deliberate exception:** the password policy (6-character minimum, default demo
credentials) is unchanged, as requested.
