# Alert Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily GitHub Actions cron that reads Supabase alert configs, fetches NAVs from mfapi.in, and sends a branded HTML email via Resend when a fund's unit price crosses the user's threshold.

**Architecture:** Zero npm dependencies — Node 20 native `fetch` throughout. Two scripts: `email-template.js` (pure, testable) and `alert-engine.js` (orchestrator with pure functions + async network calls + `main()`). GitHub Actions cron fires at 16:00 UTC (9:30 PM IST) daily.

**Tech Stack:** Node 20, GitHub Actions, Supabase REST API, Supabase Auth Admin API, mfapi.in, Resend API

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/email-template.js` | Create | Pure function: data → `{ subject, html }` |
| `scripts/email-template.test.js` | Create | Unit tests for email-template.js |
| `scripts/alert-engine.js` | Create | Pure functions + async fetchers + `main()` |
| `scripts/alert-engine.test.js` | Create | Unit tests for pure functions |
| `.github/workflows/alert-engine.yml` | Create | Cron schedule + runs alert-engine.js |

---

## Task 1: email-template.js

**Files:**
- Create: `scripts/email-template.js`
- Create: `scripts/email-template.test.js`

- [ ] **Step 1: Create the test file**

Create `scripts/email-template.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildEmail } = require('./email-template.js');

test('subject line for drop alert', () => {
  const { subject } = buildEmail({
    fundName: 'SBI PSU Fund', fundCat: 'Thematic · PSU',
    type: 'drop', todayNav: 28.12, pctChange: -4.21,
    threshold: 3, appUrl: 'https://fundpulse.vercel.app',
  });
  assert.equal(subject, '📉 SBI PSU Fund dropped 4.21% today');
});

test('subject line for rise alert', () => {
  const { subject } = buildEmail({
    fundName: 'HDFC Flexi Cap', fundCat: 'Flexi Cap',
    type: 'rise', todayNav: 45.30, pctChange: 3.15,
    threshold: 2, appUrl: 'https://fundpulse.vercel.app',
  });
  assert.equal(subject, '📈 HDFC Flexi Cap rose 3.15% today');
});

test('html contains fund name', () => {
  const { html } = buildEmail({
    fundName: 'Quant Small Cap', fundCat: 'Small Cap',
    type: 'drop', todayNav: 180.50, pctChange: -5.0,
    threshold: 3, appUrl: 'https://fundpulse.vercel.app',
  });
  assert.ok(html.includes('Quant Small Cap'));
});

test('html contains nav and percentage', () => {
  const { html } = buildEmail({
    fundName: 'Test Fund', fundCat: 'Large Cap',
    type: 'rise', todayNav: 100.00, pctChange: 2.5,
    threshold: 2, appUrl: 'https://fundpulse.vercel.app',
  });
  assert.ok(html.includes('₹100.00'));
  assert.ok(html.includes('2.50%'));
});

test('html contains view watchlist link', () => {
  const { html } = buildEmail({
    fundName: 'Test Fund', fundCat: '',
    type: 'drop', todayNav: 50.00, pctChange: -3.5,
    threshold: 3, appUrl: 'https://myapp.vercel.app',
  });
  assert.ok(html.includes('https://myapp.vercel.app/app/watchlist.html'));
});
```

- [ ] **Step 2: Run tests — verify they fail**

```
node --test scripts/email-template.test.js
```

Expected: all 5 tests fail with `Cannot find module './email-template.js'`

- [ ] **Step 3: Create scripts/email-template.js**

```js
'use strict';

function buildEmail({ fundName, fundCat, type, todayNav, pctChange, threshold, appUrl }) {
  const isDown  = type === 'drop';
  const icon    = isDown ? '📉' : '📈';
  const arrow   = isDown ? '▼' : '▲';
  const color   = isDown ? '#ff4060' : '#00d47e';
  const absPct  = Math.abs(pctChange).toFixed(2);
  const subject = `${icon} ${fundName} ${isDown ? 'dropped' : 'rose'} ${absPct}% today`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#070c18;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#070c18;min-height:100vh;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

      <tr><td style="padding-bottom:28px;">
        <span style="font-size:0.75rem;font-weight:800;color:#edf2ff;letter-spacing:-0.02em;">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#2360f5;margin-right:7px;vertical-align:middle;"></span>FundPulse
        </span>
      </td></tr>

      <tr><td style="background:#0f1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px 24px;">

        <p style="margin:0 0 16px;font-size:1rem;font-weight:700;color:#edf2ff;">${icon} Price Alert</p>

        <p style="margin:0 0 4px;font-size:1.3rem;font-weight:800;color:#edf2ff;letter-spacing:-0.02em;">${fundName}</p>
        <p style="margin:0 0 24px;font-size:0.75rem;color:#7a8fb0;">${fundCat || 'Mutual Fund'}</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr>
            <td width="48%" style="background:#142038;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:0.62rem;color:#4a5878;text-transform:uppercase;letter-spacing:0.06em;">Unit price today</p>
              <p style="margin:0;font-size:1.2rem;font-weight:800;color:#edf2ff;">&#8377;${todayNav.toFixed(2)}</p>
            </td>
            <td width="4%"></td>
            <td width="48%" style="background:#142038;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:0.62rem;color:#4a5878;text-transform:uppercase;letter-spacing:0.06em;">Change</p>
              <p style="margin:0;font-size:1.2rem;font-weight:800;color:${color};">${arrow} ${absPct}%</p>
              <p style="margin:2px 0 0;font-size:0.65rem;color:#4a5878;">threshold ${threshold}%</p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px;font-size:0.86rem;color:#7a8fb0;line-height:1.6;">
          ${isDown
            ? 'Unit price dropped more than your alert threshold today.'
            : 'Unit price rose more than your alert threshold today.'}
        </p>

        <a href="${appUrl}/app/watchlist.html"
           style="display:block;text-align:center;background:#2360f5;color:#ffffff;text-decoration:none;font-weight:700;font-size:0.9rem;padding:14px 24px;border-radius:100px;">
          View Watchlist &#8594;
        </a>

      </td></tr>

      <tr><td style="padding-top:20px;text-align:center;">
        <p style="margin:0;font-size:0.72rem;color:#4a5878;">
          FundPulse &middot;
          <a href="${appUrl}/app/alerts.html" style="color:#4a5878;text-decoration:none;">Manage alerts</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

module.exports = { buildEmail };
```

- [ ] **Step 4: Run tests — verify they pass**

```
node --test scripts/email-template.test.js
```

Expected output:
```
✔ subject line for drop alert
✔ subject line for rise alert
✔ html contains fund name
✔ html contains nav and percentage
✔ html contains view watchlist link
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

- [ ] **Step 5: Commit**

```
git add scripts/email-template.js scripts/email-template.test.js
git commit -m "feat: add email template builder with tests"
```

---

## Task 2: Pure functions in alert-engine.js

**Files:**
- Create: `scripts/alert-engine.js` (pure functions + module.exports only — no main() yet)
- Create: `scripts/alert-engine.test.js`

- [ ] **Step 1: Create the test file**

Create `scripts/alert-engine.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveSchemeCode, checkThresholds } = require('./alert-engine.js');

// resolveSchemeCode
test('resolves known legacy string id', () => {
  assert.equal(resolveSchemeCode('sbi-psu'), 119732);
});
test('resolves another legacy id', () => {
  assert.equal(resolveSchemeCode('pp-flexi'), 122639);
});
test('resolves numeric string id from live search', () => {
  assert.equal(resolveSchemeCode('120503'), 120503);
});
test('returns null for unresolvable string', () => {
  assert.equal(resolveSchemeCode('unknown-fund-xyz'), null);
});

// checkThresholds
test('triggers drop when pct crosses threshold', () => {
  const result = checkThresholds({ drop_on: true, drop_val: 3, rise_on: false, rise_val: 2 }, -4.0);
  assert.deepEqual(result, ['drop']);
});
test('does not trigger drop when pct is within threshold', () => {
  const result = checkThresholds({ drop_on: true, drop_val: 3, rise_on: false, rise_val: 2 }, -2.9);
  assert.deepEqual(result, []);
});
test('triggers rise when pct crosses threshold', () => {
  const result = checkThresholds({ drop_on: false, drop_val: 3, rise_on: true, rise_val: 2 }, 3.5);
  assert.deepEqual(result, ['rise']);
});
test('does not trigger rise when pct is within threshold', () => {
  const result = checkThresholds({ drop_on: false, drop_val: 3, rise_on: true, rise_val: 2 }, 1.9);
  assert.deepEqual(result, []);
});
test('does not trigger when alert is turned off', () => {
  const result = checkThresholds({ drop_on: false, drop_val: 3, rise_on: false, rise_val: 2 }, -10.0);
  assert.deepEqual(result, []);
});
test('triggers at exact threshold boundary', () => {
  const drop = checkThresholds({ drop_on: true, drop_val: 3, rise_on: false, rise_val: 2 }, -3.0);
  assert.deepEqual(drop, ['drop']);
  const rise = checkThresholds({ drop_on: false, drop_val: 3, rise_on: true, rise_val: 2 }, 2.0);
  assert.deepEqual(rise, ['rise']);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```
node --test scripts/alert-engine.test.js
```

Expected: all 8 tests fail with `Cannot find module './alert-engine.js'`

- [ ] **Step 3: Create scripts/alert-engine.js with pure functions**

```js
'use strict';

const { buildEmail } = require('./email-template.js');

// ── SCHEME MAP (mirrors mfapi.js) ──
const SCHEME_MAP = {
  'sbi-psu':     119732,
  'hdfc-flexi':  118955,
  'pp-flexi':    122639,
  'quant-sc':    120828,
  'mirae-lc':    118825,
  'axis-bc':     120465,
  'icici-tech':  120594,
  'nippon-sc':   118778,
  'hdfc-nifty':  119063,
  'motilal-mid': 127042,
};

function resolveSchemeCode(id) {
  if (SCHEME_MAP[id]) return SCHEME_MAP[id];
  const n = parseInt(id, 10);
  return isNaN(n) ? null : n;
}

function checkThresholds(config, pctChange) {
  const triggers = [];
  if (config.drop_on && pctChange <= -config.drop_val) triggers.push('drop');
  if (config.rise_on && pctChange >= config.rise_val)  triggers.push('rise');
  return triggers;
}

module.exports = { resolveSchemeCode, checkThresholds };
```

- [ ] **Step 4: Run tests — verify they pass**

```
node --test scripts/alert-engine.test.js
```

Expected output:
```
✔ resolves known legacy string id
✔ resolves another legacy id
✔ resolves numeric string id from live search
✔ returns null for unresolvable string
✔ triggers drop when pct crosses threshold
✔ does not trigger drop when pct is within threshold
✔ triggers rise when pct crosses threshold
✔ does not trigger rise when pct is within threshold
✔ does not trigger when alert is turned off
✔ triggers at exact threshold boundary
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

- [ ] **Step 5: Commit**

```
git add scripts/alert-engine.js scripts/alert-engine.test.js
git commit -m "feat: add alert engine pure functions with tests"
```

---

## Task 3: Async network functions in alert-engine.js

These call external services, so no unit tests. Add them to `scripts/alert-engine.js` **below** the `module.exports` line.

**Files:**
- Modify: `scripts/alert-engine.js`

- [ ] **Step 1: Add async fetch functions after module.exports**

Append to `scripts/alert-engine.js`:

```js
// ── SUPABASE HELPERS ──

async function fetchAlertConfigs(supabaseUrl, serviceKey) {
  const url = `${supabaseUrl}/rest/v1/alert_config?or=(drop_on.eq.true,rise_on.eq.true)&select=*`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`fetchAlertConfigs: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchWatchlist(supabaseUrl, serviceKey) {
  const url = `${supabaseUrl}/rest/v1/watchlist?select=user_id,fund_id,fund_name,fund_cat`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`fetchWatchlist: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchUserEmails(supabaseUrl, serviceKey) {
  const url = `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`fetchUserEmails: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const emailMap = {};
  for (const u of (data.users || [])) {
    if (u.id && u.email) emailMap[u.id] = u.email;
  }
  return emailMap;
}

async function fetchNAV(schemeCode) {
  const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.data || json.data.length < 2) return null;
  const today = parseFloat(json.data[0].nav);
  const prev  = parseFloat(json.data[1].nav);
  return { todayNav: today, pctChange: ((today - prev) / prev) * 100 };
}

async function sendEmail(to, subject, html, resendKey, fromEmail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error for ${to}: ${res.status} ${await res.text()}`);
  return res.json();
}
```

- [ ] **Step 2: Verify existing tests still pass after the edit**

```
node --test scripts/alert-engine.test.js
```

Expected: all 8 pass (the new async functions don't affect the exported pure functions)

- [ ] **Step 3: Commit**

```
git add scripts/alert-engine.js
git commit -m "feat: add alert engine network fetch functions"
```

---

## Task 4: main() orchestrator + GitHub Actions workflow

**Files:**
- Modify: `scripts/alert-engine.js` (append `main()`)
- Create: `.github/workflows/alert-engine.yml`

- [ ] **Step 1: Append main() to scripts/alert-engine.js**

Append to the bottom of `scripts/alert-engine.js`:

```js
// ── MAIN ──

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY   = process.env.RESEND_API_KEY;
  const FROM_EMAIL   = process.env.RESEND_FROM_EMAIL;
  const APP_URL      = process.env.APP_URL || 'https://fundpulse.vercel.app';

  if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_KEY || !FROM_EMAIL) {
    console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL');
    process.exit(1);
  }

  console.log('FundPulse Alert Engine starting...');

  // Step 1: fetch data in parallel
  const [alertConfigs, watchlistRows, userEmails] = await Promise.all([
    fetchAlertConfigs(SUPABASE_URL, SERVICE_KEY),
    fetchWatchlist(SUPABASE_URL, SERVICE_KEY),
    fetchUserEmails(SUPABASE_URL, SERVICE_KEY),
  ]);

  console.log(`Loaded: ${alertConfigs.length} alert configs | ${watchlistRows.length} watchlist rows | ${Object.keys(userEmails).length} users`);

  // build fund name/cat lookup: "userId:fundId" → name/cat
  const fundNameMap = {};
  const fundCatMap  = {};
  for (const row of watchlistRows) {
    const key = `${row.user_id}:${row.fund_id}`;
    fundNameMap[key] = row.fund_name;
    fundCatMap[key]  = row.fund_cat;
  }

  // Step 2: fetch NAVs for unique funds in parallel
  const uniqueFundIds = [...new Set(alertConfigs.map(r => r.fund_id))];
  const navEntries = await Promise.all(
    uniqueFundIds.map(async (fundId) => {
      const code = resolveSchemeCode(fundId);
      if (!code) { console.warn(`  ⚠ Cannot resolve scheme code for fund: ${fundId}`); return [fundId, null]; }
      const nav = await fetchNAV(code).catch(() => null);
      if (!nav) { console.warn(`  ⚠ NAV fetch failed for: ${fundId} (scheme ${code})`); return [fundId, null]; }
      console.log(`  NAV ${fundId}: ₹${nav.todayNav.toFixed(2)} (${nav.pctChange.toFixed(2)}%)`);
      return [fundId, nav];
    })
  );
  const navMap = Object.fromEntries(navEntries);

  // Steps 3+4: check thresholds + send emails
  let sent   = 0;
  let errors = 0;

  for (const config of alertConfigs) {
    const nav = navMap[config.fund_id];
    if (!nav) continue;

    const triggers = checkThresholds(config, nav.pctChange);
    if (!triggers.length) continue;

    const email = userEmails[config.user_id];
    if (!email) { console.warn(`  ⚠ No email found for user: ${config.user_id}`); continue; }

    const key      = `${config.user_id}:${config.fund_id}`;
    const fundName = fundNameMap[key] || config.fund_id;
    const fundCat  = fundCatMap[key]  || '';

    for (const type of triggers) {
      const threshold = type === 'drop' ? config.drop_val : config.rise_val;
      try {
        const { subject, html } = buildEmail({
          fundName, fundCat, type,
          todayNav:  nav.todayNav,
          pctChange: nav.pctChange,
          threshold,
          appUrl: APP_URL,
        });
        await sendEmail(email, subject, html, RESEND_KEY, FROM_EMAIL);
        console.log(`  ✓ Sent ${type} alert → ${email} (${fundName}: ${nav.pctChange.toFixed(2)}%)`);
        sent++;
      } catch (err) {
        console.error(`  ✗ Failed → ${email} (${fundName}): ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\nDone. ${sent} email(s) sent, ${errors} error(s).`);
  if (sent === 0 && errors > 0) process.exit(1);
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}
```

- [ ] **Step 2: Verify tests still pass**

```
node --test scripts/alert-engine.test.js
```

Expected: all 10 pass (the `if (require.main === module)` guard prevents `main()` from running during tests)

- [ ] **Step 3: Create .github/workflows/alert-engine.yml**

Create the directory first, then the file:

```yaml
name: Alert Engine

on:
  schedule:
    - cron: '0 16 * * *'  # 9:30 PM IST daily (after AMFI publishes NAVs)
  workflow_dispatch:        # manual trigger for testing

jobs:
  run-alerts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run alert engine
        env:
          SUPABASE_URL:              ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          RESEND_API_KEY:            ${{ secrets.RESEND_API_KEY }}
          RESEND_FROM_EMAIL:         ${{ secrets.RESEND_FROM_EMAIL }}
          APP_URL:                   ${{ secrets.APP_URL }}
        run: node scripts/alert-engine.js
```

- [ ] **Step 4: Commit**

```
git add scripts/alert-engine.js .github/workflows/alert-engine.yml
git commit -m "feat: add alert engine main orchestrator and GitHub Actions workflow"
```

- [ ] **Step 5: Push**

```
git push origin main
```

---

## Task 5: Add secrets + manual test run

This task is manual steps — no code.

- [ ] **Step 1: Create Resend account**

1. Go to resend.com → sign up
2. Verify your email
3. Go to **Domains** → Add your domain (or use the default `onboarding@resend.dev` for initial testing — no domain setup needed)
4. Go to **API Keys** → Create key → copy it

- [ ] **Step 2: Get Supabase service role key**

1. Go to supabase.com → your project → **Settings → API**
2. Under **Project API keys**, copy the `service_role` key (labeled "secret" — NOT the `anon` key)

- [ ] **Step 3: Add secrets to GitHub**

Go to `github.com/Madhavan1707/fundpulse` → **Settings → Secrets and variables → Actions → New repository secret**

Add all five:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | `https://acwrtldncexhhlzutppv.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (from Supabase dashboard) |
| `RESEND_API_KEY` | (from Resend dashboard) |
| `RESEND_FROM_EMAIL` | Your verified sender, e.g. `alerts@yourdomain.com` or `onboarding@resend.dev` for testing |
| `APP_URL` | Your Vercel URL, e.g. `https://fundpulse-chi.vercel.app` |

- [ ] **Step 4: Set an alert with a low threshold to test**

In the FundPulse app:
1. Go to Alerts tab
2. Pick any fund
3. Set drop alert to **0.1%** (so it fires almost every day)
4. Save

- [ ] **Step 5: Trigger the workflow manually**

1. Go to `github.com/Madhavan1707/fundpulse` → **Actions → Alert Engine**
2. Click **Run workflow → Run workflow**
3. Watch the run log — you should see:
   ```
   FundPulse Alert Engine starting...
   Loaded: 1 alert configs | 1 watchlist rows | 1 users
     NAV sbi-psu: ₹28.12 (-0.34%)
     ✓ Sent drop alert → your@email.com (SBI PSU Fund: -0.34%)
   Done. 1 email(s) sent, 0 error(s).
   ```
4. Check your inbox for the branded email

- [ ] **Step 6: Reset the threshold back to a real value**

Go back to the Alerts tab and set the threshold to your actual desired value (e.g. 3%).

- [ ] **Step 7: Commit nothing — task complete**

The workflow is now live. It will fire automatically every day at 9:30 PM IST.
