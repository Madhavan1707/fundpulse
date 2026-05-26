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
