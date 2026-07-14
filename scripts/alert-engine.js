'use strict';

const { buildEmail } = require('./email-template.js');
const { sendPush } = require('./webpush.js');
const { createEmailSender } = require('./email-sender.js');

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
  const dropVal = Number(config.drop_val);
  const riseVal = Number(config.rise_val);
  if (config.drop_on && Number.isFinite(dropVal) && dropVal > 0 && pctChange <= -dropVal) triggers.push('drop');
  if (config.rise_on && Number.isFinite(riseVal) && riseVal > 0 && pctChange >= riseVal)  triggers.push('rise');
  return triggers;
}

// mfapi.in dates are DD-MM-YYYY; compare against today in IST so a weekend/holiday
// run (stale NAV) doesn't re-send yesterday's alert.
function todayISTString(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(now).replace(/\//g, '-');
}

function isNavFresh(navDate, now = new Date()) {
  return navDate === todayISTString(now);
}

// A config only produces an email if the user kept "email" among its channels
// (missing/empty channels defaults to email — matches the app's default).
function wantsEmail(config) {
  const channels = Array.isArray(config.channels) && config.channels.length
    ? config.channels : ['email'];
  return channels.includes('email');
}

// mfapi.in 'DD-MM-YYYY' → Postgres date 'YYYY-MM-DD'
function navDateToISO(navDate) {
  const [d, m, y] = String(navDate).split('-');
  return `${y}-${m}-${d}`;
}

module.exports = { resolveSchemeCode, checkThresholds, todayISTString, isNavFresh, wantsEmail, navDateToISO };

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
  const emailMap = {};
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {   // hard stop at 50k users
    const url = `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`fetchUserEmails: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const users = data.users || [];
    for (const u of users) {
      if (u.id && u.email) emailMap[u.id] = u.email;
    }
    if (users.length < perPage) break;
  }
  return emailMap;
}

const NAV_RETRIES     = 3;
const NAV_TIMEOUT_MS  = 15000;
const NAV_BACKOFF_MS  = [2000, 5000];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchNAVOnce(schemeCode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FundPulse-AlertEngine/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.data || json.data.length < 2) throw new Error('empty/short NAV history');
    const today = parseFloat(json.data[0].nav);
    const prev  = parseFloat(json.data[1].nav);
    if (!Number.isFinite(today) || !Number.isFinite(prev) || prev === 0) {
      throw new Error(`unparseable NAV values: ${json.data[0].nav}, ${json.data[1].nav}`);
    }
    return {
      todayNav:  today,
      pctChange: ((today - prev) / prev) * 100,
      navDate:   json.data[0].date,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNAV(schemeCode) {
  let lastErr;
  for (let attempt = 1; attempt <= NAV_RETRIES; attempt++) {
    try {
      return await fetchNAVOnce(schemeCode);
    } catch (err) {
      lastErr = err.name === 'AbortError' ? new Error(`timeout after ${NAV_TIMEOUT_MS}ms`) : err;
      if (attempt < NAV_RETRIES) {
        console.warn(`  ⚠ NAV fetch attempt ${attempt}/${NAV_RETRIES} failed for scheme ${schemeCode}: ${lastErr.message} — retrying...`);
        await sleep(NAV_BACKOFF_MS[attempt - 1]);
      }
    }
  }
  throw lastErr;
}

// alert_log dedup: which (user, fund, type) alerts already went out for this NAV date.
// Missing table (schema.sql not run yet) must not break the engine — dedup just
// degrades to off with a warning.
async function fetchSentAlerts(supabaseUrl, serviceKey, isoDate) {
  try {
    const url = `${supabaseUrl}/rest/v1/alert_log?select=user_id,fund_id,alert_type&nav_date=eq.${isoDate}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    return new Set(rows.map(r => `${r.user_id}:${r.fund_id}:${r.alert_type}`));
  } catch (err) {
    console.warn(`  ⚠ Could not load alert_log (${err.message}) — dedup disabled for this run. Run db/schema.sql if you haven't.`);
    return null;
  }
}

async function logSentAlert(supabaseUrl, serviceKey, entry) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/alert_log?on_conflict=user_id,fund_id,alert_type,nav_date`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  } catch (err) {
    console.warn(`  ⚠ Could not write alert_log entry: ${err.message}`);
  }
}

// profiles.email_alerts_on — Settings screen kill-switch. Missing table/column or
// fetch failure must never block alerts, so default everyone to ON.
async function fetchEmailPrefs(supabaseUrl, serviceKey) {
  try {
    const url = `${supabaseUrl}/rest/v1/profiles?select=id,email_alerts_on`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const prefs = {};
    for (const r of rows) prefs[r.id] = r.email_alerts_on !== false;
    return prefs;
  } catch (err) {
    console.warn(`  ⚠ Could not load email preferences (${err.message}) — defaulting to ON for all users`);
    return {};
  }
}

// push_subscriptions grouped by user. Missing table (schema.sql not run yet)
// must not break the engine — push just degrades to off with a warning.
async function fetchPushSubs(supabaseUrl, serviceKey) {
  try {
    const url = `${supabaseUrl}/rest/v1/push_subscriptions?select=user_id,endpoint,p256dh,auth`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const byUser = {};
    for (const r of rows) (byUser[r.user_id] ||= []).push(r);
    return byUser;
  } catch (err) {
    console.warn(`  ⚠ Could not load push_subscriptions (${err.message}) — push channel off for this run. Run db/schema.sql if you haven't.`);
    return {};
  }
}

async function deletePushSub(supabaseUrl, serviceKey, endpoint) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  } catch (e) { /* best-effort cleanup */ }
}

// ── MAIN ──

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const APP_URL      = process.env.APP_URL || 'https://fundpulse-chi.vercel.app';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const mailer = createEmailSender(process.env);
  if (!mailer) {
    console.error('No email provider configured. Set BREVO_API_KEY + ALERT_FROM_EMAIL (free tier, delivers to any user) or RESEND_API_KEY + RESEND_FROM_EMAIL (needs a verified domain to reach real users).');
    process.exit(1);
  }
  console.log(`Email provider: ${mailer.provider} (from: ${mailer.from})`);

  // Push channel is optional: engine runs email-only when VAPID secrets are absent
  const VAPID = (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    ? {
        publicKey:  process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
        subject:    process.env.VAPID_SUBJECT || `mailto:${mailer.from}`,
      }
    : null;
  if (!VAPID) console.log('Push channel off (VAPID secrets not set) — email only.');

  console.log('FundPulse Alert Engine starting...');

  // Step 1: fetch data in parallel
  const [alertConfigs, watchlistRows, userEmails, emailPrefs, pushSubs] = await Promise.all([
    fetchAlertConfigs(SUPABASE_URL, SERVICE_KEY),
    fetchWatchlist(SUPABASE_URL, SERVICE_KEY),
    fetchUserEmails(SUPABASE_URL, SERVICE_KEY),
    fetchEmailPrefs(SUPABASE_URL, SERVICE_KEY),
    VAPID ? fetchPushSubs(SUPABASE_URL, SERVICE_KEY) : Promise.resolve({}),
  ]);

  const pushSubCount = Object.values(pushSubs).reduce((a, s) => a + s.length, 0);
  console.log(`Loaded: ${alertConfigs.length} alert configs | ${watchlistRows.length} watchlist rows | ${Object.keys(userEmails).length} users | ${pushSubCount} push subscriptions`);

  // build fund name/cat lookup: "userId:fundId" → name/cat
  const fundNameMap = {};
  const fundCatMap  = {};
  for (const row of watchlistRows) {
    const key = `${row.user_id}:${row.fund_id}`;
    fundNameMap[key] = row.fund_name;
    fundCatMap[key]  = row.fund_cat;
  }

  // Step 2: fetch NAVs for unique funds in parallel (with retry + timeout inside fetchNAV)
  const uniqueFundIds = [...new Set(alertConfigs.map(r => r.fund_id))];
  const navEntries = await Promise.all(
    uniqueFundIds.map(async (fundId) => {
      const code = resolveSchemeCode(fundId);
      if (!code) { console.warn(`  ⚠ Cannot resolve scheme code for fund: ${fundId}`); return { fundId, nav: null, status: 'unresolvable' }; }
      let nav;
      try {
        nav = await fetchNAV(code);
      } catch (err) {
        console.warn(`  ⚠ NAV fetch failed for: ${fundId} (scheme ${code}) after ${NAV_RETRIES} attempts: ${err.message}`);
        return { fundId, nav: null, status: 'error' };
      }
      if (!isNavFresh(nav.navDate)) {
        console.log(`  ○ NAV ${fundId} is dated ${nav.navDate} (today IST: ${todayISTString()}) — market holiday or NAV not yet published. Skipping to avoid duplicate alerts.`);
        return { fundId, nav: null, status: 'stale' };
      }
      console.log(`  NAV ${fundId}: ₹${nav.todayNav.toFixed(2)} (${nav.pctChange.toFixed(2)}%) as of ${nav.navDate}`);
      return { fundId, nav, status: 'ok' };
    })
  );
  const navMap = {};
  for (const e of navEntries) if (e.status === 'ok') navMap[e.fundId] = e.nav;

  if (uniqueFundIds.length > 0 && Object.keys(navMap).length === 0) {
    if (navEntries.every(e => e.status === 'error')) {
      console.error(`  ✗ All NAV fetches failed after ${NAV_RETRIES} attempts each — mfapi.in is unreachable. No alerts evaluated.`);
      process.exit(1);
    }
    console.log('  ○ No fresh NAVs today — market holiday/weekend or NAV not yet published. Nothing to evaluate.');
    console.log('\nDone. 0 email(s) sent, 0 error(s).');
    return;
  }

  // Step 3: load today's already-sent alerts for dedup (manual re-runs must not re-email)
  const isoToday    = navDateToISO(todayISTString());
  const alreadySent = await fetchSentAlerts(SUPABASE_URL, SERVICE_KEY, isoToday);

  // Steps 4+5: check thresholds + send emails and pushes
  let sent     = 0;
  let pushSent = 0;
  let errors   = 0;
  let deduped  = 0;

  for (const config of alertConfigs) {
    const nav = navMap[config.fund_id];
    if (!nav) continue;

    const triggers = checkThresholds(config, nav.pctChange);
    if (!triggers.length) continue;

    const email = userEmails[config.user_id];
    // email goes out only if: settings kill-switch is on, the fund's channels
    // include email, and we actually have an address. Push has its own opt-in
    // (a stored subscription) and is not gated by the email switch.
    const emailAllowed = emailPrefs[config.user_id] !== false && wantsEmail(config) && !!email;
    const subs = (VAPID && pushSubs[config.user_id]) || [];
    if (!emailAllowed && !subs.length) {
      console.log(`  ○ ${config.fund_id}: no deliverable channel for user ${config.user_id} — skipping`);
      continue;
    }
    if (!email && !subs.length) { console.warn(`  ⚠ No email found for user: ${config.user_id}`); continue; }

    const key      = `${config.user_id}:${config.fund_id}`;
    const fundName = fundNameMap[key] || config.fund_id;
    const fundCat  = fundCatMap[key]  || '';

    for (const type of triggers) {
      if (alreadySent && alreadySent.has(`${config.user_id}:${config.fund_id}:${type}`)) {
        console.log(`  ○ ${type} alert for ${fundName} already sent today — skipping (dedup)`);
        deduped++;
        continue;
      }
      const threshold = type === 'drop' ? config.drop_val : config.rise_val;

      let emailOk = false;
      if (emailAllowed) {
        try {
          const { subject, html } = buildEmail({
            fundName, fundCat, type,
            todayNav:  nav.todayNav,
            pctChange: nav.pctChange,
            threshold,
            appUrl: APP_URL,
          });
          await mailer.send(email, subject, html);
          console.log(`  ✓ Sent ${type} alert → ${email} (${fundName}: ${nav.pctChange.toFixed(2)}%)`);
          sent++;
          emailOk = true;
        } catch (err) {
          console.error(`  ✗ Failed → ${email} (${fundName}): ${err.message}`);
          errors++;
        }
      }

      // push notifications: best-effort, dead subscriptions are pruned
      let pushOk = false;
      if (subs.length) {
        const absPct = Math.abs(nav.pctChange).toFixed(2);
        const payload = JSON.stringify({
          title: `${type === 'drop' ? '📉' : '📈'} ${fundName} ${type === 'drop' ? 'fell' : 'rose'} ${absPct}% today`,
          body:  `Unit price ₹${nav.todayNav.toFixed(2)} — past your ${threshold}% alert level.`,
          url:   `${APP_URL}/app/alerts.html`,
        });
        for (const s of subs) {
          try {
            const r = await sendPush(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload, VAPID
            );
            if (r.ok) { pushSent++; pushOk = true; }
            else if (r.gone) {
              console.log(`  ○ push subscription expired for user ${config.user_id} — removing`);
              await deletePushSub(SUPABASE_URL, SERVICE_KEY, s.endpoint);
            } else {
              console.warn(`  ⚠ push rejected (${r.status}) for user ${config.user_id}`);
            }
          } catch (err) {
            console.warn(`  ⚠ push failed for user ${config.user_id}: ${err.message}`);
          }
        }
        if (pushOk) console.log(`  ✓ Sent ${type} push → user ${config.user_id} (${fundName})`);
      }

      // log for dedup + the alerts screen. If email was allowed but failed,
      // don't log — the next run should retry it.
      if (emailOk || (!emailAllowed && pushOk)) {
        await logSentAlert(SUPABASE_URL, SERVICE_KEY, {
          user_id:    config.user_id,
          fund_id:    config.fund_id,
          fund_name:  fundName,
          alert_type: type,
          pct_change: Number(nav.pctChange.toFixed(4)),
          today_nav:  nav.todayNav,
          threshold:  Number(threshold) || null,
          channel:    emailOk ? 'email' : 'push',
          nav_date:   navDateToISO(nav.navDate),
        });
      }
    }
  }

  console.log(`\nDone. ${sent} email(s) sent, ${pushSent} push(es) sent, ${errors} error(s), ${deduped} skipped as already sent.`);
  if (sent === 0 && pushSent === 0 && errors > 0) process.exit(1);
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}
