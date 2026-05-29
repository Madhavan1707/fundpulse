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
    email, password, options: { data: { full_name: fullName } }
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

// ── PROFILE DRAWER ──
// Call initProfileDrawer() once per page after boot() completes
// It injects the drawer HTML + CSS into the page and wires the avatar button

function initProfileDrawer() {
  // inject CSS once
  if (!document.getElementById('fp-drawer-style')) {
    const style = document.createElement('style');
    style.id = 'fp-drawer-style';
    style.textContent = `
      .fp-drawer-overlay {
        position: fixed; inset: 0; z-index: 600;
        background: rgba(4,9,18,.8); backdrop-filter: blur(12px);
        opacity: 0; pointer-events: none; transition: opacity .28s;
      }
      .fp-drawer-overlay.open { opacity: 1; pointer-events: all; }
      .fp-drawer {
        position: fixed; bottom: 0; left: 50%; z-index: 601;
        transform: translateX(-50%) translateY(100%);
        width: 100%; max-width: 480px;
        background: #0f1a2e; border-radius: 20px 20px 0 0;
        border-top: 1px solid rgba(255,255,255,.08);
        transition: transform .35s cubic-bezier(.4,0,.2,1);
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }
      .fp-drawer-overlay.open .fp-drawer { transform: translateX(-50%) translateY(0); }
      .fp-drawer-handle {
        width: 36px; height: 4px; border-radius: 2px;
        background: rgba(255,255,255,.12); margin: 14px auto 0;
      }
      .fp-drawer-user {
        display: flex; align-items: center; gap: 14px;
        padding: 20px 22px 16px;
        border-bottom: 1px solid rgba(255,255,255,.06);
      }
      .fp-drawer-avatar {
        width: 44px; height: 44px; border-radius: 50%;
        background: linear-gradient(135deg,#2360f5,#0a1f5c);
        border: 2px solid rgba(35,96,245,.4);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Outfit',sans-serif; font-weight: 800;
        font-size: 1.1rem; color: #edf2ff; flex-shrink: 0;
      }
      .fp-drawer-name {
        font-family: 'Outfit',sans-serif; font-weight: 700;
        font-size: .98rem; color: #edf2ff; margin-bottom: 2px;
      }
      .fp-drawer-email { font-size: .72rem; color: #7a8fb0; }
      .fp-drawer-items { padding: 8px 0; }
      .fp-drawer-item {
        display: flex; align-items: center; gap: 14px;
        padding: 13px 22px; cursor: pointer;
        transition: background .18s;
        touch-action: manipulation; -webkit-tap-highlight-color: transparent;
      }
      .fp-drawer-item:hover { background: rgba(255,255,255,.04); }
      .fp-drawer-icon {
        width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: .95rem;
      }
      .fp-drawer-icon.grey  { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); }
      .fp-drawer-icon.red   { background: rgba(255,64,96,.1);    border: 1px solid rgba(255,64,96,.2); }
      .fp-drawer-label { flex: 1; font-size: .88rem; color: #edf2ff; font-weight: 500; }
      .fp-drawer-badge {
        font-size: .65rem; font-weight: 600; letter-spacing: .06em;
        text-transform: uppercase; color: #4a5878;
        background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
        border-radius: 100px; padding: 2px 8px;
      }
      .fp-drawer-item.logout .fp-drawer-label { color: #ff4060; }
      .fp-drawer-sep { height: 1px; background: rgba(255,255,255,.06); margin: 6px 0; }
      .fp-drawer-chevron { color: #4a5878; font-size: .75rem; }

      .fp-confirm-overlay {
        position: fixed; inset: 0; z-index: 700;
        background: rgba(4,9,18,.88); backdrop-filter: blur(14px);
        display: flex; align-items: center; justify-content: center; padding: 24px;
        opacity: 0; pointer-events: none; transition: opacity .25s;
      }
      .fp-confirm-overlay.open { opacity: 1; pointer-events: all; }
      .fp-confirm-modal {
        background: #0f1a2e; border: 1px solid rgba(255,255,255,.08);
        border-radius: 18px; padding: 28px 24px;
        width: 100%; max-width: 340px;
        transform: scale(.94); transition: transform .28s cubic-bezier(.34,1.56,.64,1);
      }
      .fp-confirm-overlay.open .fp-confirm-modal { transform: scale(1); }
      .fp-confirm-icon { font-size: 2rem; text-align: center; margin-bottom: 12px; display: block; }
      .fp-confirm-title {
        font-family: 'Outfit',sans-serif; font-weight: 800;
        font-size: 1.05rem; text-align: center; color: #edf2ff; margin-bottom: 8px;
      }
      .fp-confirm-body {
        font-size: .82rem; color: #7a8fb0; line-height: 1.65;
        text-align: center; margin-bottom: 22px;
      }
      .fp-confirm-actions { display: flex; gap: 10px; }
      .fp-confirm-cancel {
        flex: 1; padding: 12px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,.1); background: transparent; color: #edf2ff;
        font-family: 'Plus Jakarta Sans',sans-serif; font-size: .88rem; font-weight: 500;
        cursor: pointer; transition: background .2s;
      }
      .fp-confirm-cancel:hover { background: rgba(255,255,255,.06); }
      .fp-confirm-logout {
        flex: 1; padding: 12px; border-radius: 10px;
        border: 1px solid rgba(255,64,96,.2); background: rgba(255,64,96,.1); color: #ff4060;
        font-family: 'Plus Jakarta Sans',sans-serif; font-size: .88rem; font-weight: 600;
        cursor: pointer; transition: all .2s;
      }
      .fp-confirm-logout:hover { background: #ff4060; color: #fff; border-color: #ff4060; }
    `;
    document.head.appendChild(style);
  }

  // inject drawer HTML once
  if (!document.getElementById('fp-drawer-overlay')) {
    const name  = localStorage.getItem('fp_username') || 'there';
    const email = localStorage.getItem('fp_email')    || '';
    const initial = name.charAt(0).toUpperCase();

    const overlay = document.createElement('div');
    overlay.className = 'fp-drawer-overlay';
    overlay.id = 'fp-drawer-overlay';
    overlay.innerHTML = `
      <div class="fp-drawer">
        <div class="fp-drawer-handle"></div>
        <div class="fp-drawer-user">
          <div class="fp-drawer-avatar">${initial}</div>
          <div>
            <div class="fp-drawer-name">${name}</div>
            <div class="fp-drawer-email">${email}</div>
          </div>
        </div>
        <div class="fp-drawer-items">
          <div class="fp-drawer-item" onclick="window.location.href='profile.html'">
            <div class="fp-drawer-icon grey">👤</div>
            <span class="fp-drawer-label">Profile</span>
            <span class="fp-drawer-chevron">›</span>
          </div>
          <div class="fp-drawer-item" onclick="window.location.href='settings.html#appearance'">
            <div class="fp-drawer-icon grey">🎨</div>
            <span class="fp-drawer-label">Appearance</span>
            <span class="fp-drawer-chevron">›</span>
          </div>
          <div class="fp-drawer-item" onclick="window.location.href='settings.html#notifications'">
            <div class="fp-drawer-icon grey">⚙️</div>
            <span class="fp-drawer-label">Preferences</span>
            <span class="fp-drawer-chevron">›</span>
          </div>
          <div class="fp-drawer-sep"></div>
          <div class="fp-drawer-item logout" onclick="fpConfirmLogout()">
            <div class="fp-drawer-icon red">🚪</div>
            <span class="fp-drawer-label">Log out</span>
          </div>
        </div>
        <div style="height:8px;"></div>
      </div>`;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeProfileDrawer();
    });
    document.body.appendChild(overlay);
  }

  // inject logout confirm modal once
  if (!document.getElementById('fp-confirm-overlay')) {
    const confirm = document.createElement('div');
    confirm.className = 'fp-confirm-overlay';
    confirm.id = 'fp-confirm-overlay';
    confirm.innerHTML = `
      <div class="fp-confirm-modal">
        <span class="fp-confirm-icon">🚪</span>
        <div class="fp-confirm-title">Log out of FundPulse?</div>
        <p class="fp-confirm-body">You can always log back in. Your funds, alerts, and settings will all be waiting for you.</p>
        <div class="fp-confirm-actions">
          <button class="fp-confirm-cancel" onclick="closeFpConfirm()">Stay in</button>
          <button class="fp-confirm-logout" onclick="doLogout()">Yes, log out</button>
        </div>
      </div>`;
    document.body.appendChild(confirm);
  }

  // wire the header avatar button
  const avatar = document.getElementById('header-avatar') || document.getElementById('feed-avatar');
  if (avatar) {
    avatar.style.cursor = 'pointer';
    avatar.onclick = openProfileDrawer;
  }
}

function openProfileDrawer() {
  document.getElementById('fp-drawer-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProfileDrawer() {
  document.getElementById('fp-drawer-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function fpDrawerPlaceholder(section) {
  closeProfileDrawer();
  // small toast-style message
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
    background:#0f1a2e; border:1px solid rgba(255,255,255,.1);
    border-radius:100px; padding:10px 20px;
    font-size:.78rem; color:#7a8fb0; z-index:800;
    animation: fadeup .3s ease;
    white-space:nowrap;
  `;
  toast.textContent = `${section} — coming soon`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function fpConfirmLogout() {
  closeProfileDrawer();
  document.getElementById('fp-confirm-overlay').classList.add('open');
}

function closeFpConfirm() {
  document.getElementById('fp-confirm-overlay').classList.remove('open');
}

async function doLogout() {
  closeFpConfirm();
  // show brief logging out state
  const btn = document.querySelector('.fp-confirm-logout');
  if (btn) { btn.textContent = 'Logging out…'; btn.style.opacity = '.65'; }
  await signOut();
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

async function fetchSettings() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await window._supabase
    .from('profiles')
    .select('email_alerts_on, default_drop_val, default_rise_val, whatsapp_number')
    .eq('id', user.id)
    .single();
  if (error) { console.error('fetchSettings:', error); return null; }
  return data;
}

async function saveSettings(settings) {
  const user = await getUser();
  if (!user) return;
  const { error } = await window._supabase
    .from('profiles')
    .upsert({
      id:               user.id,
      email_alerts_on:  settings.email_alerts_on,
      default_drop_val: settings.default_drop_val,
      default_rise_val: settings.default_rise_val,
      whatsapp_number:  settings.whatsapp_number || null,
    }, { onConflict: 'id' });
  if (error) console.error('saveSettings:', error);
}

async function saveProfileName(fullName) {
  const user = await getUser();
  if (!user) return;
  const { error } = await window._supabase
    .from('profiles')
    .upsert({ id: user.id, full_name: fullName }, { onConflict: 'id' });
  if (error) console.error('saveProfileName:', error);
  // Keep auth metadata in sync so post-login refresh picks up the new name
  await window._supabase.auth.updateUser({ data: { full_name: fullName } });
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
