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
