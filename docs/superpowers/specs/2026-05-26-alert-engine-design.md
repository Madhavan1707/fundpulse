# Alert Engine — Design Spec
**Date:** 2026-05-26
**Status:** Approved

## What This Is

A daily cron job that reads every user's alert config from Supabase, fetches live NAVs from mfapi.in, and sends a branded HTML email via Resend when a fund's unit price crosses the user's threshold.

This is Phase 3 of FundPulse. The Supabase tables (`watchlist`, `alert_config`) are already built and populated by the existing app.

---

## Files Added

```
.github/
  workflows/
    alert-engine.yml       — cron schedule + node runner
scripts/
  alert-engine.js          — main logic: fetch → check → send
  email-template.js        — builds branded HTML email string
```

No changes to any existing app files. No `package.json`. Uses Node 20 native `fetch`.

---

## GitHub Secrets Required

| Secret | Source |
|--------|--------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API (service_role key, not anon) |
| `RESEND_API_KEY` | Resend Dashboard after account creation |
| `RESEND_FROM_EMAIL` | Verified sender address on Resend (e.g. `alerts@yourdomain.com`) |

---

## Cron Schedule

Runs daily at **16:00 UTC (9:30 PM IST)** — 30 minutes after AMFI typically publishes daily NAVs.

```yaml
on:
  schedule:
    - cron: '0 16 * * *'
  workflow_dispatch:   # manual trigger for testing
```

`workflow_dispatch` allows manual runs from GitHub Actions UI during testing.

---

## Script Flow (`alert-engine.js`)

### Step 1 — Fetch data (parallel)
- All `alert_config` rows where `drop_on = true OR rise_on = true` via Supabase REST API
- All `watchlist` rows → build map `{ "userId:fundId" → fund_name }`
- All user emails → build map `{ userId → email }` via Supabase auth admin API (`/auth/v1/admin/users`)

All three requests fire in parallel with `Promise.all`.

### Step 2 — Resolve NAVs
- Collect unique fund IDs from alert configs
- `resolveSchemeCode(fundId)`: checks static `SCHEME_MAP` for legacy string IDs (sbi-psu etc.), falls back to parsing as integer for numeric IDs from live search. Returns `null` for unresolvable IDs (skip silently).
- Fetch `GET https://api.mfapi.in/mf/{schemeCode}` for each fund in parallel
- `data[0].nav` = today, `data[1].nav` = yesterday
- Compute `pctChange = ((today - yesterday) / yesterday) * 100`
- Build map `{ fundId → { todayNav, pctChange } }`

### Step 3 — Check thresholds
For each `alert_config` row:
- Drop alert: `drop_on === true && pctChange <= -drop_val`
- Rise alert: `rise_on === true && pctChange >= rise_val`
- Queue triggered alerts as `{ userId, fundId, fundName, type: 'drop'|'rise', pctChange, todayNav, threshold }`

### Step 4 — Send emails
For each queued alert:
- Look up user email from the auth map
- Build HTML via `email-template.js`
- `POST https://api.resend.com/emails` with the HTML and subject line
- Log success/failure per email

### Step 5 — Log summary
Print to stdout: `X alert configs checked, Y emails sent, Z errors`
Visible in the GitHub Actions run log.

---

## Email Template (`email-template.js`)

**Subject line:**
- Drop: `📉 {fundName} dropped {pctChange}% today`
- Rise: `📈 {fundName} rose {pctChange}% today`

**Layout (single column, dark theme):**
```
● FundPulse                          ← header
─────────────────────────────────────
📉 Price Alert                       ← icon: 📉 drop / 📈 rise

{Fund Name}                          ← large, white
{Category}                           ← small, muted

[₹{nav}]    [▼ −{pct}%]             ← two stat boxes side by side
[Unit price] [(threshold {x}%)]

"Unit price dropped more than your
alert threshold today."

[ View Watchlist → ]                 ← blue CTA → app/watchlist.html on Vercel
─────────────────────────────────────
FundPulse · Manage alerts            ← footer linking to app/alerts.html
```

Colors match app design system: `#070c18` background, `#2360f5` blue, `#00d47e` green, `#ff4060` red.

---

## Fund ID Resolution

Same logic as `mfapi.js`. Copied into the script (no import — no module system):

```js
const SCHEME_MAP = {
  'sbi-psu': 119732, 'hdfc-flexi': 118955, 'pp-flexi': 122639,
  'quant-sc': 120828, 'mirae-lc': 118825, 'axis-bc': 120465,
  'icici-tech': 120594, 'nippon-sc': 118778, 'hdfc-nifty': 119063,
  'motilal-mid': 127042,
};

function resolveSchemeCode(id) {
  if (SCHEME_MAP[id]) return SCHEME_MAP[id];
  const n = parseInt(id, 10);
  return isNaN(n) ? null : n;
}
```

Funds added via live search store their scheme code as a numeric string ID — these resolve automatically via the `parseInt` path.

---

## Error Handling

- If mfapi.in fails for a fund → skip that fund, log warning, continue
- If a user email is missing → skip that alert, log warning
- If Resend returns non-2xx → log the error with fund + user info, continue
- Script never throws — always runs to completion and exits 0 (so GitHub Actions doesn't mark the run red for a single failed email)
- If ALL Supabase fetches fail → log error, exit 1 (genuine infrastructure failure worth flagging)

---

## Deduplication

None. The cron runs once per day. If it somehow runs twice (manual retrigger), users may get a duplicate email. Acceptable at current scale. Can add a `sent_alerts` table later when user base grows.

---

## Setup Steps (one-time)

1. Create Resend account at resend.com → verify domain → create API key
2. Get service role key from Supabase Dashboard → Settings → API
3. Add 4 secrets to GitHub repo → Settings → Secrets → Actions
4. Set `APP_URL` constant at top of `alert-engine.js` to your Vercel URL

---

## What This Does NOT Do (yet)

- Manager change alerts (`manager_on`) — no data source for this yet, skipped
- WhatsApp / SMS channels — email only
- Batching multiple alerts into one email per user
- Unsubscribe link in email
- Alert history stored in Supabase
