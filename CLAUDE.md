# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Live Status (as of 2026-07-14)

**FundPulse is LIVE and public.** Phase 3 (real backend) is shipped end to end.

> **Founder launch + scale guide:** see `docs/LAUNCH_PLAYBOOK.md` for the full go-to-market,
> legal (SEBI/DPDP), domain, trademark/IP, cybersecurity, scaling, and marketing checklist.

| Thing | Value |
|---|---|
| **Public site (share this)** | **https://fundpulse-chi.vercel.app** |
| GitHub repo | https://github.com/Madhavan1707/fundpulse (branch: `main`) |
| Hosting | Vercel, auto-deploys on push to `main`, zero-config static |
| Supabase project | `acwrtldncexhhlzutppv` (`https://acwrtldncexhhlzutppv.supabase.co`) |

**URL gotcha:** the Vercel *Domains* value `fundpulse-chi.vercel.app` is the stable public production URL. The per-deploy `fundpulse-<hash>-madhavan1707s-projects.vercel.app` URLs are build snapshots and are SSO-protected (that's normal). `fundpulse.vercel.app` is a **different, unrelated project** — do not use it.

**What is live and verified:**
- Landing + auth (signup asks name/email/password only — no phone; signup requires a consent checkbox linking Terms + Privacy, and shows a live password checklist), feed, alerts, watchlist, settings, profile, privacy page, terms page.
- Live NAV + fund search (mfapi.in), live news (`news-fetcher.js`, every 2h), email alerts (Brevo default, Resend fallback).
- **Email for real users (2026-07-14):** provider is pluggable (`scripts/email-sender.js`). Brevo (free 300/day) delivers to any recipient with a verified sender — Resend's shared domain only reached the account owner. Engine picks Brevo when `BREVO_API_KEY` is set, else Resend. Verified live: manual run logged `Email provider: brevo`.
- **Desktop layout (2026-07-14):** app screens (feed/alerts/watchlist/settings/profile) widen from a 480px phone column to a 680px centered column with a top-docked nav at `min-width:900px`. Landing page was already responsive.
- **Legal pages (2026-07-14):** `terms.html` (information-only / not-advice, data-accuracy + liability disclaimers, governing law India) linked from footer, signup consent, and alert emails. `privacy.html` expanded with DPDP Act 2023 rights (access/correct, withdraw consent, erasure, grievance contact) + legal-basis section. Advice-adjacent wording ("recommended") removed. "Past performance isn't indicative of future results" on watchlist returns + emails.
- **PWA + web push (2026-07-13):** installable app (`manifest.webmanifest`, `sw.js`, `icons/`), push channel in the engine (`scripts/webpush.js`, RFC 8291/8292 on plain node:crypto — no deps). Push opt-in is the "Notifications on this device" toggle in Settings; subscriptions live in `push_subscriptions` (table applied to prod). Push is free — it bypasses the Resend 100/day cap.
- **Engagement features (2026-07-13):** feed pulse card ("All quiet" vs "X moved past your alert level"), 🔖 Saved tab, onboarding starter packs, watchlist 30-day sparklines, alerts threshold hints ("typically moves ±X%/day → alert reaches you ~N×/month"), sample-alert preview in Settings.
- Feed fund tabs pull tagged news across the whole 7-day window (`overlaps` query merged with newest-50); all app screens render synchronously from localStorage before the auth SDK loads (no flash between pages).
- **Alert engine** runs daily 10:00 PM IST via GitHub Actions. Manual run verified 2026-07-13: retries transient NAV failures, skips stale NAVs (no weekend/holiday duplicate emails), dedups via `alert_log`, exits green when there's nothing fresh. The old "All NAV fetches failed → exit 1" bug is fixed.
- **Security:** `db/schema.sql` has been run — news table is read-only to clients (anon INSERT/DELETE were open before), `alert_log` created. `delete-account` edge function deployed. RLS re-verified live 2026-07-14 with the anon key: news insert denied (401), a real news row survived a delete attempt, watchlist/profiles/alert_log/push_subscriptions all return `[]` to anon. **Hardening (2026-07-14):** fund names escaped before `innerHTML` across feed/alerts/watchlist and in the alert email template (defense-in-depth). Added `.gitignore` so local `.env` / Supabase CLI tokens can't be committed. No secrets found in git history.

**GitHub Actions secrets set:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL` (= `https://fundpulse-chi.vercel.app`), `NEWSDATA_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. **To reach real users, add `BREVO_API_KEY` + `ALERT_FROM_EMAIL`** (the sender you verified in Brevo) — the workflow already passes them through. The VAPID public key is also hardcoded in `app/settings.html` (`VAPID_PUBLIC_KEY` const) — client and engine must use the same pair; regenerating keys invalidates every stored subscription.

**Still deliberately deferred (free-tier, pre-scale):** custom domain (+ SPF/DKIM on it, one-click `List-Unsubscribe`), lifting the Brevo 300/day cap, WhatsApp/SMS channels + phone OTP at opt-in, manager-change alert data source, analytics, monetisation. See "Phase 4" below and `docs/LAUNCH_PLAYBOOK.md`.

**Needs a human (not code) before scaling:** SEBI sign-off on positioning + the starter-packs feature (naming specific funds edges toward "recommendation"); NewsData.io free-tier commercial-use/redistribution check; trademark search + registration for "FundPulse"; move NAV to AMFI's official feed for cleaner licensing. Full list in `docs/LAUNCH_PLAYBOOK.md`.

## gstack
Use /browse from gstack for all web browsing, never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy,
/canary, /benchmark, /browse, /open-gstack-browser, /qa, /qa-only, /design-review,
/setup-browser-cookies, /setup-deploy, /setup-gbrain, /sync-gbrain, /retro, /investigate,
/document-release, /document-generate, /codex, /cso, /autoplan, /pair-agent, /careful,
/freeze, /guard, /unfreeze, /gstack-upgrade, /learn.

## Token Efficiency Rules
- Never use /design-html, /ui-ux-pro-max, or /design-shotgun for simple tasks
- For quick UI changes or bug fixes, just write code directly — no skill pipeline
- Only use gstack skills for full production feature buil
## What This App Is

FundPulse is a proactive alert and news feed platform for Indian Mutual Funds and ETFs. It is **not** a portfolio tracker — users enter no financial data. The core value: users add funds they care about, set movement thresholds, and get notified when something happens (email, WhatsApp, SMS).

Positioning: "Google Alerts, but purpose-built for Mutual Funds and ETFs."

## Development

No build step, no package manager. Development workflow:
- Edit `.html`, `.css`, `.js` files directly
- Open the relevant HTML file in a browser or use a local static server (`python -m http.server`)
- Push to `main` → Vercel auto-deploys to https://fundpulse-chi.vercel.app
- `.vercelignore` keeps backend-only dirs (`supabase/`, `db/`, `scripts/`, `docs/`) out of the web deploy — the static site is served zero-config, so anything that flips Vercel's framework detection breaks it.

Node scripts (`scripts/`) run in GitHub Actions, not Vercel. Tests: `node --test scripts/` (38 tests). Run before pushing anything in `scripts/`.

Frontend will stay as plain HTML/JS until there is a validated user base — Next.js migration is deferred deliberately.

## Screen Inventory

| File | Status | Purpose |
|---|---|---|
| `index.html` | Working | Landing page, signup/login modals, Supabase auth (inline). Signup asks name/email/password only — **no phone** (phone is asked later when WhatsApp alerts launch) |
| `verified.html` | Working | Post email-verification confirmation (inline Supabase). Phone-OTP step only runs if `fp_pending_phone` exists (legacy / future WhatsApp opt-in) |
| `privacy.html` | Working | Privacy policy + "not investment advice" disclaimer + DPDP Act 2023 rights/grievance contact (linked from landing footer, signup consent, alert emails) |
| `terms.html` | Working | Terms of Use: information-only/not-advice, data-accuracy + liability disclaimers, governing law India (linked from landing footer, signup consent, alert emails) |
| `app/feed.html` | Working | News feed (default landing after login) |
| `app/alerts.html` | Working | Per-fund alert configuration + real alert history from `alert_log` |
| `app/watchlist.html` | Working | Watchlist management + live NAV stats |
| `app/supabase.js` | Working | Shared auth, data, and UI helpers loaded by all app screens |
| `app/profile.html` | Working | Name edit, email display, password reset |
| `app/settings.html` | Working | Email alerts toggle, default thresholds, password reset, delete account |
| `app/mfapi.js` | Working | Live NAV fetch + fund search against mfapi.in (feed, watchlist, alerts, settings). Also exposes `typicalDailyMove()` / `estAlertsPerMonth()` for threshold hints |
| `manifest.webmanifest`, `sw.js`, `icons/` | Working | PWA: installable app, offline-tolerant cache, push + notification-click handlers. SW registered from `app/supabase.js` and inline in `index.html` |
| `scripts/webpush.js` | Working | Dependency-free web push sender (RFC 8291 aes128gcm + RFC 8292 VAPID) used by the alert engine; tested in `scripts/webpush.test.js` |

**Important:** `index.html` and `verified.html` define their own inline Supabase client (same credentials) and do **not** load `app/supabase.js`. Only `app/feed.html`, `app/alerts.html`, and `app/watchlist.html` use `supabase.js`.

## Shared Library: `app/supabase.js`

Loaded via `<script src="supabase.js">` on all three app screens. It dynamically injects the Supabase CDN script, then fires a `supabase_ready` event on `window` once `window._supabase` is initialised. App screens wait for this event before calling `boot()`.

What it exports (global functions):

| Function | Purpose |
|---|---|
| `requireAuth()` | Session guard — call first in every app screen; redirects to `../index.html` if no session |
| `getSession()` / `getUser()` | Auth state |
| `signUp()` / `signIn()` / `signOut()` | Auth actions. `signOut()` clears localStorage entirely and redirects to `../index.html` |
| `fetchWatchlist()` | Returns array of watchlist rows for current user |
| `addToWatchlist(fund)` / `removeFromWatchlist(fundId)` | Supabase writes |
| `fetchAlertConfig()` | Returns object keyed by `fund_id` |
| `saveAlertConfig(fundId, cfg)` / `deleteAlertConfig(fundId)` | Supabase writes |
| `fetchProfile()` | Reads `profiles` table |
| `fetchSettings()` / `saveSettings()` | `profiles` columns: `email_alerts_on`, `default_drop_val`, `default_rise_val`, `whatsapp_number` |
| `saveProfileName(fullName)` | Upserts `profiles.full_name` + syncs auth metadata |
| `fetchAlertHistory(limit)` | Reads own rows from `alert_log` (real alerts the engine sent). Returns `[]` if table missing |
| `initProfileDrawer()` | Injects the slide-up profile drawer into the page. Takes **no arguments** — reads `fp_username` and `fp_email` from localStorage directly (HTML-escaped before injection) |

## Boot Sequence Pattern

Every app screen (`feed`, `alerts`, `watchlist`) follows this pattern:

```
window.addEventListener('supabase_ready', boot, { once: true });
if (window._supabase) { setTimeout(boot, 0); }  // handles cached SDK
```

Inside `boot()`:
1. `getSession()` → redirect to `../index.html` if no session
2. Read funds / alert config from localStorage → render immediately (no spinner delay)
3. Call `init()` to render with local data
4. Call `initProfileDrawer()` (reads `fp_username`/`fp_email` from localStorage)
5. Fetch fresh data from Supabase in background (sequential awaits, not Promise.all)
6. Write fresh data to localStorage and re-render silently

**The feed screen is slightly different:** It has a two-phase visual — onboarding screen vs feed screen — decided by whether `fp_funds` exists in localStorage. The Supabase sync happens in background and can switch from onboarding to feed silently if funds are found.

## Supabase Tables

| Table | Column names (actual) | Used By |
|---|---|---|
| `watchlist` | `user_id`, `fund_id`, `fund_name`, `fund_amc`, `fund_cat`, `added_at` | feed, alerts, watchlist |
| `alert_config` | `user_id`, `fund_id`, `drop_on`, `drop_val`, `rise_on`, `rise_val`, `manager_on`, `channels`, `updated_at` | alerts, watchlist |
| `profiles` | `id`, `full_name`, `email_alerts_on`, `default_drop_val`, `default_rise_val`, `whatsapp_number` | verified, profile, settings, alert engine |
| `news` | `article_id`, `title`, `description`, `source_name`, `url`, `published_at`, `fund_tags` | feed (read), news-fetcher (service-role write) |
| `alert_log` | `user_id`, `fund_id`, `fund_name`, `alert_type`, `pct_change`, `today_nav`, `threshold`, `channel`, `nav_date`, `sent_at` | alerts screen (read own), alert engine (service-role write, dedup key `user_id,fund_id,alert_type,nav_date`) |
| `push_subscriptions` | `user_id`, `endpoint` (unique), `p256dh`, `auth`, `created_at` | settings (insert/delete own via toggle), alert engine (service-role read all + prune dead endpoints) |

`upsert` with `onConflict: 'user_id,fund_id'` is used for both watchlist and alert_config writes.

**RLS:** `db/schema.sql` is the source of truth — run it in Supabase SQL Editor after any table change. Critical: `news` must be select-only for clients (anon INSERT/DELETE was open until 2026-07-13); `alert_log` is select-own only; only the service role writes news/alert_log. `watchlist`/`alert_config`/`profiles` are scoped to `auth.uid()`.

**Edge Functions:** `supabase/functions/delete-account` deletes a user's data + auth account (settings screen calls it, with a client-side data-wipe fallback if not deployed). Deploy: `supabase functions deploy delete-account`.

## localStorage Key Structure

Keys are **not** UID-scoped in the current code — they are generic. The concept doc describes UID-scoping as a completed fix, but the code still uses generic keys.

| Key | Written By | Read By | Contains |
|---|---|---|---|
| `fp_funds` | feed.html, watchlist.html | feed, alerts, watchlist, supabase.js | JSON array of fund objects `{id, name, amc, cat}` |
| `fp_setup_done` | feed.html | feed.html | `'1'` if user has completed onboarding |
| `fp_username` | index.html (login), feed.html (sync) | supabase.js (drawer), all screens | Display name string |
| `fp_email` | index.html (login), feed.html (sync) | supabase.js (drawer) | Email string |
| `fp_alert_config` | alerts.html | alerts.html, watchlist.html | JSON object keyed by fund_id |
| `fp_expand_fund` | watchlist.html | alerts.html (on load, then removed) | Fund id to auto-expand |
| `fp_settings` | settings.html | settings.html, alerts.html (default thresholds) | JSON settings object |
| `fp_read` / `fp_bookmarks` | feed.html | feed.html | JSON arrays of article ids (capped at 200) |
| `fp_nav_<schemeCode>` | mfapi.js | mfapi.js, watchlist (sparklines), alerts (threshold hints), feed (pulse card) | Cached NAV + `spark` (30-session series) + `dailyMoves` (60 daily %); kept all day once it's today's published NAV, else 1h TTL. Entries without `spark` are treated stale and refetched |
| `fp_fund_list` / `fp_fund_list_ts` | mfapi.js | mfapi.js, feed, watchlist | Slimmed Direct+Growth AMFI scheme list, 24h TTL, in-memory fallback on quota failure |
| `fp_pending_phone` | (future WhatsApp opt-in flow only) | index.html, verified.html | E.164 phone awaiting OTP — no longer set at signup |

`signOut()` in supabase.js calls `localStorage.clear()` (clears everything). `clearUserData()` in index.html removes specific keys on new login.

## Fund Object Shape

Fund objects are stored in `fp_funds` and passed to Supabase helpers with this shape:
```js
{ id: 'sbi-psu', name: 'SBI PSU Direct Fund', amc: 'SBI Mutual Fund', cat: 'Thematic · PSU' }
```

When fetched back from Supabase, they are mapped: `{ id: r.fund_id, name: r.fund_name, amc: r.fund_amc, cat: r.fund_cat }`.

## Alert Config Object Shape

`fetchAlertConfig()` returns an object where each key is a `fund_id`:
```js
{
  'sbi-psu': {
    drop:    { on: true,  val: '3'   },
    rise:    { on: false, val: '2'   },
    manager: { on: true  },
    channels: ['email'],
  }
}
```

`saveAlertConfig(fundId, cfg)` maps this to flat DB columns: `drop_on`, `drop_val`, `rise_on`, `rise_val`, `manager_on`, `channels`.

## Data Sources (All Live — No Fake Data Rule)

- **Fund search** — live AMFI list from mfapi.in (Direct+Growth schemes only), with the 10 hardcoded funds (`FUNDS` in feed.html, `ALL_FUNDS` in watchlist.html) as offline fallback
- **Unit prices** — live mfapi.in NAV via `app/mfapi.js` (`fetchNAVs`)
- **News** — `news` table, populated by `scripts/news-fetcher.js` (NewsData.io) every 2h via GitHub Actions
- **Alert history** — `alert_log` table, written by the engine when it actually sends an email

**Rule: never show fabricated data as if it were real.** The old hardcoded demo history/prices are gone — an alerts product that shows alerts that never happened loses trust permanently. Empty states are fine; fake data is not.

## Alert Types

| Alert | Config keys | Default | Jargon-free label |
|---|---|---|---|
| Daily unit price drop | `drop.on`, `drop.val` | 3% | "Notify me if unit price drops more than X%" |
| Daily unit price rise | `rise.on`, `rise.val` | 2% | "Notify me if unit price rises more than X%" |
| Fund manager change | `manager.on` | false | "Alert me the day a manager change is announced" |

All-time high, drawdown, and AUM change alerts are in the product concept but not yet implemented in the UI.

**Channels:** Email and device push (web push) are live. WhatsApp/SMS pills in alerts.html show a "SOON" badge and a coming-soon toast — they cannot be selected. Email is gated server-side by `wantsEmail()` and the Settings kill-switch (`profiles.email_alerts_on`); push is gated only by the existence of a `push_subscriptions` row (the Settings toggle creates/deletes it). If email is allowed but fails, no `alert_log` row is written so the next run retries; push-only sends log with `channel: 'push'`.

## Backend Connections (Live)

| Integration | Purpose | Notes |
|---|---|---|
| mfapi.in | Live NAV data + fund search | Free, no key. Engine retries 3× with 15s timeout |
| NewsData.io | News feed | Free tier; fetched every 2h by GitHub Actions |
| GitHub Actions cron | Alert engine, daily 10:00 PM IST (`30 16 * * *` UTC) | Skips stale NAVs (weekend/holiday), dedups via `alert_log` |
| Brevo | Email alerts (default) | Free tier: 300/day. Delivers to ANY recipient once the sender address is verified in Brevo — no custom domain needed. Selected when `BREVO_API_KEY` + `ALERT_FROM_EMAIL` are set. |
| Resend | Email alerts (fallback) | Free tier: 100/day, but without a verified custom domain only delivers to the Resend account owner. Used only if Brevo isn't configured. |

**Email provider is pluggable** — `scripts/email-sender.js` (`createEmailSender`) picks Brevo if `BREVO_API_KEY` is set, else Resend. To reach real users, set the Brevo secrets (see below). The alert engine no longer hard-requires Resend.

## Deletion Consent Rule

- **Onboarding screen** (`screen-onboard` in feed.html): remove a fund instantly, no confirmation — uses `removeFundInstant()`
- **Feed filter chips, alerts screen, watchlist** (inside the app): removing a fund MUST show confirmation modal — uses `askRemoveFundFromFeed()` / `askRemove()` / `confirmRemove()`

When a fund is removed from any app screen, its `fp_alert_config` entry must also be deleted (localStorage + Supabase).

## Design System

**CSS variables** (defined in `:root` in every file):
- `--navy: #070c18` (base), `--navy-2: #0b1220`, `--navy-3: #0f1a2e`, `--navy-4: #142038`
- `--blue: #2360f5`, `--blue-light: #4a7cff`
- `--green: #00d47e`, `--red: #ff4060`, `--yellow: #ffb400`
- `--white: #edf2ff`, `--muted: #7a8fb0`, `--muted-2: #4a5878`

**Fonts:** Outfit (headings/numbers) + Plus Jakarta Sans (body) — loaded from Google Fonts CDN.

All styles are inline per page in `<style>` blocks. No external CSS framework. CSS variables are copy-pasted across all files (not shared).

**Desktop centering:** App screens cap at `max-width: 480px` and center with `left: 50%; transform: translateX(-50%)`. This applies to the main screen, confirm modals, and article sheets.

## Non-Negotiable Language Rule

FundPulse must never use financial jargon anywhere — news cards, alert messages, onboarding, empty states, tooltips, or any new feature:

| Never use | Always use instead |
|---|---|
| NAV | Unit price |
| AUM | Total money in this fund |
| Drawdown | How far it has fallen from its best point |
| Expense ratio | Annual fee |
| Benchmark | Target index this fund tries to beat |
| Redemption | Withdrawal / selling your units |
| Folio | Your account with this fund house |

## Build Phases

| Phase | What | Status |
|---|---|---|
| 1 | Landing page | ✅ Done |
| 2 | Web app core (feed + alerts + watchlist + Supabase auth) | ✅ Done |
| 3 | Real alert engine + live NAV (mfapi.in) + live news (NewsData.io) + email (Resend) + settings/profile + privacy policy | ✅ Done |
| 4 | **Deferred until it scales** (deliberate, free-tier first — see below) | Future |

### Phase 4 — Deferred Until It Scales

Deliberately postponed while the product is free-tier and pre-validation:

- **Custom domain + email deliverability**: buy a domain, verify it in Resend, set SPF/DKIM, add a one-click `List-Unsubscribe` header (Gmail bulk-sender requirement). Until then alerts send from the Resend shared domain and are capped at 100/day.
- **WhatsApp alerts**: WhatsApp Business Cloud API. When this ships, re-enable the phone flow — ask for the number **at WhatsApp opt-in, not signup** (set `fp_pending_phone`, route through the existing OTP step in `verified.html`, store in `profiles.whatsapp_number`).
- **SMS alerts**: after WhatsApp.
- **Manager-change alerts**: toggle exists in UI (`manager_on`) but no data source watches it yet.
- **Hindi support, trending funds, sentiment reactions.**
- **Analytics** (Plausible/PostHog) before serious marketing, to see the activation funnel.
- **Monetisation**: free 3 funds → premium unlimited + WhatsApp (see tiers below).

## Open TODOs (Known, Agreed, Pending)

- **Run `db/schema.sql`** in Supabase SQL Editor (news lockdown + `alert_log`) and **deploy the delete-account edge function** (`supabase functions deploy delete-account`). Until then: news table is writable by anyone with the anon key, engine dedup degrades to off, delete-account falls back to data-wipe-only.
- **Cross-device email verification**: polling with `refreshSession()` implemented in index.html but not fully tested due to Supabase rate limits. Verify email template in Supabase Dashboard redirects to `verified.html`. Temporarily disable email confirmation in Supabase during local testing.
- **UID-scoped localStorage**: keys are generic, not per-user. If two users share a browser, logout + `clearUserData()` clears the previous user's data, but there's no true isolation. Fix would be: scope all keys to `fp_funds_<uid>` etc.

## Monetisation Tiers (For Context)

| Tier | Includes | Price |
|---|---|---|
| Free | 3 funds, email alerts, basic news feed | Free forever |
| Premium | Unlimited funds, WhatsApp alerts, manager/drawdown alerts, weekly digest | Paid (TBD) |
| Advisor | Verified presence, recommendations, analytics | B2B (TBD) |

Free users get real value — the freemium split should never cripple the free experience.
