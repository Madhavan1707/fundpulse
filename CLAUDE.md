# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Is

FundPulse is a proactive alert and news feed platform for Indian Mutual Funds and ETFs. It is **not** a portfolio tracker — users enter no financial data. The core value: users add funds they care about, set movement thresholds, and get notified when something happens (email, WhatsApp, SMS).

Positioning: "Google Alerts, but purpose-built for Mutual Funds and ETFs."

## Development

No build step, no package manager. Development workflow:
- Edit `.html`, `.css`, `.js` files directly
- Open the relevant HTML file in a browser or use a local static server
- Deployed on Vercel (plain static files)

Frontend will stay as plain HTML/JS until there is a validated user base — Next.js migration is deferred deliberately.

## Screen Inventory

| File | Status | Purpose |
|---|---|---|
| `index.html` | Frozen | Landing page, signup/login modals, Supabase auth (inline) |
| `verified.html` | Working | Post email-verification confirmation (inline Supabase) |
| `app/feed.html` | Frozen | News feed (default landing after login) |
| `app/alerts.html` | Frozen | Per-fund alert configuration |
| `app/watchlist.html` | Frozen | Watchlist management + fund stats |
| `app/supabase.js` | Working | Shared auth, data, and UI helpers loaded by all app screens |
| `app/profile.html` | Not built | Phase 2 — name, email, notification prefs |
| `app/settings.html` | Not built | Phase 2 — navigating to Settings tab currently causes a 404 |

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
| `initProfileDrawer()` | Injects the slide-up profile drawer into the page. Takes **no arguments** — reads `fp_username` and `fp_email` from localStorage directly |

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
| `profiles` | `id`, `full_name` (and others) | verified.html, future profile screen |

`upsert` with `onConflict: 'user_id,fund_id'` is used for both watchlist and alert_config writes.

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
| `fp_swipe_tutored` | feed.html | feed.html | `'1'` once swipe tutorial has run |

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

## Static / Demo Data (Not Yet Live)

All three data sources are currently hardcoded — backend connections are Phase 3:

- **10 hardcoded funds** — defined in `FUNDS` (feed.html) and `ALL_FUNDS` (watchlist.html): SBI PSU, HDFC Flexi Cap, Parag Parikh Flexi Cap, Quant Small Cap, Mirae Asset Large Cap, Axis Bluechip, ICICI Pru Technology, Nippon India Small Cap, HDFC Nifty 50, Motilal Oswal Midcap
- **10 hardcoded news articles** — in `NEWS` array (feed.html), each with jargon-free summaries and optional alert badge
- **Hardcoded demo prices** — `DEMO_PRICES` in watchlist.html (e.g. `₹28.34 −3.2%`)
- **Hardcoded alert history** — `ALL_HISTORY` in alerts.html (7 sample entries)

When Phase 3 connects the backend: fund list comes from mfapi.in, news from NewsData.io, prices from mfapi.in daily NAV.

## Alert Types

| Alert | Config keys | Default | Jargon-free label |
|---|---|---|---|
| Daily unit price drop | `drop.on`, `drop.val` | 3% | "Notify me if unit price drops more than X%" |
| Daily unit price rise | `rise.on`, `rise.val` | 2% | "Notify me if unit price rises more than X%" |
| Fund manager change | `manager.on` | false | "Alert me the day a manager change is announced" |

All-time high, drawdown, and AUM change alerts are in the product concept but not yet implemented in the UI.

## Swipe Gesture Direction (feed.html)

- **Swipe right** → bookmark (gold `Saved` tag on card)
- **Swipe left** → dismiss (card slides out and collapses)

The `swipe-action-left` div (behind the card on the left) shows the bookmark icon, and `swipe-action-right` shows the dismiss icon — but the actual swipe handlers are wired the opposite way. The swipe tutorial currently has a visual mismatch because of this z-index/overflow issue (known open TODO).

## Planned Backend Connections (Phase 3)

| Integration | Purpose | API |
|---|---|---|
| mfapi.in | Live NAV data + fund search | Free, no key needed |
| NewsData.io / GNews | News feed | Free tier, keyword search |
| GitHub Actions cron | Alert engine (runs daily at 9:30 PM IST after AMFI publishes NAV) | Free |
| Resend | Email alerts | 3,000/month free |
| WhatsApp Business Cloud API | WhatsApp alerts | 1,000 conv/month free (Phase 3 / Premium) |

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
| 1 | Landing page | ✅ Frozen |
| 2 | Web app core (feed + alerts + watchlist + Supabase auth) | ✅ Frozen — all screens built and connected |
| 3 | Real alert engine + live NAV (mfapi.in) + live news (NewsData.io) + email (Resend) | Next |
| 4 | WhatsApp alerts, Hindi support, trending funds, sentiment reactions | Future |

## Open TODOs (Known, Agreed, Pending)

- **Settings screen** (`app/settings.html`): not built. Clicking the Settings tab in any screen navigates to `settings.html` which returns a 404.
- **Profile screen** (`app/profile.html`): not built. Drawer shows "coming soon" placeholders for Profile, Appearance, Preferences.
- **Cross-device email verification**: polling with `refreshSession()` implemented in index.html but not fully tested due to Supabase rate limits. Verify email template in Supabase Dashboard redirects to `verified.html`. Temporarily disable email confirmation in Supabase during local testing.
- **Swipe tutorial animation**: The `swipe-action-left` background (bookmark/gold) and `swipe-action-right` background (dismiss/red) should be revealed when the card physically slides. Currently the card slides but the backgrounds aren't cleanly visible — z-index/overflow issue on `.swipe-wrapper`.
- **UID-scoped localStorage**: The concept doc describes this as fixed, but the code still uses generic keys. If two users log in on the same browser, logout + `clearUserData()` clears the previous user's data, but there's no true isolation. Fix would be: scope all keys to `fp_funds_<uid>` etc.
- **Real alert engine**: Phase 3. All alert config is stored in Supabase — ready to connect a GitHub Actions cron job.
- **Live unit prices and fund search**: Phase 3. Replace `DEMO_PRICES`, `FUNDS`, and `ALL_FUNDS` with live mfapi.in data.
- **Password validation**: 8+ chars, one capital, one number check is partially implemented (checks length ≥ 8 only). Full validation not yet added.

## Monetisation Tiers (For Context)

| Tier | Includes | Price |
|---|---|---|
| Free | 3 funds, email alerts, basic news feed | Free forever |
| Premium | Unlimited funds, WhatsApp alerts, manager/drawdown alerts, weekly digest | Paid (TBD) |
| Advisor | Verified presence, recommendations, analytics | B2B (TBD) |

Free users get real value — the freemium split should never cripple the free experience.
