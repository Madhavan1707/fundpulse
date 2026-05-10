const SUPABASE_URL  = 'https://acwrtldncexhhlzutppv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjd3J0bGRuY2V4aGhsenV0cHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNzQ4NzcsImV4cCI6MjA5Mzk1MDg3N30.DTojjCkw2xY-XQ_-AOai5VlKHsN98XBpgt8AalN4cj4';

// Dynamically load Supabase SDK then initialise client
(function() {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.onload = function() {
    window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    window.dispatchEvent(new Event('supabase_ready'));
  };
  s.onerror = function() {
    console.error('FundPulse: Failed to load Supabase. Check your internet connection.');
  };
  document.head.appendChild(s);
})();

// ── AUTH HELPERS ──

async function signUp(fullName, email, password) {
  const { data, error } = await window._supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  return { data, error };
}

async function signIn(email, password) {
  const { data, error } = await window._supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function signOut() {
  await window._supabase.auth.signOut();
  localStorage.clear();
  window.location.href = '../index.html';
}

async function getSession() {
  const { data } = await window._supabase.auth.getSession();
  return data.session;
}

async function getUser() {
  const { data } = await window._supabase.auth.getUser();
  return data.user;
}

// ── WATCHLIST HELPERS ──

async function fetchWatchlist() {
  const { data, error } = await window._supabase
    .from('watchlist')
    .select('*')
    .order('added_at', { ascending: true });
  if (error) { console.error('fetchWatchlist:', error); return []; }
  return data;
}

async function addToWatchlist(fund) {
  const user = await getUser();
  if (!user) return;
  const { error } = await window._supabase
    .from('watchlist')
    .upsert({
      user_id:   user.id,
      fund_id:   fund.id,
      fund_name: fund.name,
      fund_amc:  fund.amc,
      fund_cat:  fund.cat,
    }, { onConflict: 'user_id,fund_id' });
  if (error) console.error('addToWatchlist:', error);
}

async function removeFromWatchlist(fundId) {
  const user = await getUser();
  if (!user) return;
  const { error } = await window._supabase
    .from('watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('fund_id', fundId);
  if (error) console.error('removeFromWatchlist:', error);
}

// ── ALERT CONFIG HELPERS ──

async function fetchAlertConfig() {
  const { data, error } = await window._supabase
    .from('alert_config')
    .select('*');
  if (error) { console.error('fetchAlertConfig:', error); return {}; }
  // convert array to object keyed by fund_id for easy lookup
  const config = {};
  data.forEach(row => {
    config[row.fund_id] = {
      drop:    { on: row.drop_on,    val: String(row.drop_val)  },
      rise:    { on: row.rise_on,    val: String(row.rise_val)  },
      manager: { on: row.manager_on },
      channels: row.channels || ['email'],
    };
  });
  return config;
}

async function saveAlertConfig(fundId, cfg) {
  const user = await getUser();
  if (!user) return;
  const { error } = await window._supabase
    .from('alert_config')
    .upsert({
      user_id:    user.id,
      fund_id:    fundId,
      drop_on:    cfg.drop.on,
      drop_val:   parseFloat(cfg.drop.val),
      rise_on:    cfg.rise.on,
      rise_val:   parseFloat(cfg.rise.val),
      manager_on: cfg.manager.on,
      channels:   cfg.channels,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,fund_id' });
  if (error) console.error('saveAlertConfig:', error);
}

async function deleteAlertConfig(fundId) {
  const user = await getUser();
  if (!user) return;
  const { error } = await window._supabase
    .from('alert_config')
    .delete()
    .eq('user_id', user.id)
    .eq('fund_id', fundId);
  if (error) console.error('deleteAlertConfig:', error);
}

// ── PROFILE HELPER ──

async function fetchProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await window._supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) { console.error('fetchProfile:', error); return null; }
  return data;
}

// ── SESSION GUARD ──
// Call this at the top of every app screen (feed, alerts, watchlist)
// If user is not logged in, redirect to landing page
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '../index.html';
    return null;
  }
  return session;
}
