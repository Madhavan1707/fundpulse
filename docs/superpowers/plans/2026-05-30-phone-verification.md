# Phone Number Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a phone number field to signup and OTP verification via Supabase native phone auth + Twilio, so every new user has a verified Indian mobile number before reaching the app.

**Architecture:** Phone field added to the signup form in `index.html`. After `signUp()` succeeds, the 10-digit number is stored as `fp_pending_phone` in localStorage (E.164 format). When the user clicks the email verification link, `verified.html` detects `fp_pending_phone`, calls `supabase.auth.updateUser({ phone })` (which triggers a Twilio OTP), shows a 6-digit entry screen, verifies via `supabase.auth.verifyOtp()`, saves the number to `profiles.whatsapp_number`, then redirects to feed. Auth redirect paths in `index.html` are updated to route through `verified.html` whenever a pending phone exists.

**Tech Stack:** Supabase JS v2 (CDN), Twilio (configured in Supabase dashboard — no client-side keys), plain HTML/JS

---

## Prerequisites (manual steps — do these before running any task)

- [ ] Create a free Twilio account at https://twilio.com
- [ ] In Twilio Console: get a phone number → note the **Account SID**, **Auth Token**, and **Twilio phone number**
- [ ] In Supabase Dashboard → Authentication → Providers → Phone:
  - Enable Phone provider
  - SMS provider: **Twilio**
  - Paste Account SID, Auth Token, Twilio phone number
  - Save
- [ ] In Twilio Console (free trial only): verify your personal Indian mobile number under "Verified Caller IDs" so you can receive test OTPs

---

## File Map

| File | What changes |
|---|---|
| `index.html` | Add phone field to signup form; add phone validation; store `fp_pending_phone`; update `onAuthStateChange` and login redirect to route through `verified.html` when phone is pending; update `editEmail()` to preserve phone |
| `verified.html` | Detect `fp_pending_phone`; call `updateUser({ phone })`; show OTP entry UI; verify OTP; save to `profiles.whatsapp_number`; clear localStorage; redirect to feed |

---

## Task 1: Add phone field to signup form (index.html)

**Files:** Modify `index.html`

The signup form template is built inside `render()` as a template literal. Find the signup branch (the second branch of the ternary inside `render()`).

- [ ] **Step 1: Add phone field to signup form HTML**

In `index.html`, find the signup form template literal (the string starting with the Full name field). Replace it with:

```js
`
    <div class="mf"><label class="ml">Full name</label><input class="mi" type="text" placeholder="Your name"/></div>
    <div class="mf"><label class="ml">Email address</label><input class="mi" type="email" placeholder="you@email.com"/></div>
    <div class="mf"><label class="ml">Password</label><input class="mi" type="password" placeholder="Create a password"/></div>
    <div class="mf">
      <label class="ml">Phone number</label>
      <div style="display:flex;gap:6px;">
        <span style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:11px 12px;color:var(--muted);font-family:'Plus Jakarta Sans',sans-serif;font-size:.88rem;flex-shrink:0;display:flex;align-items:center;">+91</span>
        <input class="mi" type="tel" placeholder="98765 43210" style="flex:1;min-width:0;" maxlength="11"/>
      </div>
    </div>
    <button class="mb" onclick="ha('signup')">Create Free Account</button>
    <div class="mswitch">Have an account? <a onclick="switchTab('login')">Log in</a></div>
  `
```

- [ ] **Step 2: Verify form renders — open http://localhost:8765 in browser, click Sign up, confirm phone field appears below Password with +91 prefix**

---

## Task 2: Add phone validation and storage to ha('signup') (index.html)

**Files:** Modify `index.html`

- [ ] **Step 1: Add phone input read + validation**

In `ha('signup')`, after the password inputs are read (after the line `const pass = passInput ? passInput.value.trim() : '';`), add:

```js
const phoneInput = document.querySelector('.mi[type="tel"]');
const phoneDigits = phoneInput ? phoneInput.value.replace(/[\s\-]/g, '') : '';
```

Then after the existing password validation checks (after the `/[0-9]/` check), add:

```js
if (!/^[6-9]\d{9}$/.test(phoneDigits)) {
  showFieldError(phoneInput, 'Enter a valid 10-digit Indian mobile number.');
  return;
}
```

- [ ] **Step 2: Store phone in localStorage after successful signUp**

In the same `withSupabase` callback, after the existing user/identities checks pass and before the `showVerifyScreen` call, add:

```js
localStorage.setItem('fp_pending_phone', '+91' + phoneDigits);
```

The block should now look like:
```js
// store name and pending phone locally
localStorage.setItem('fp_username', capitaliseWords(name));
localStorage.setItem('fp_pending_phone', '+91' + phoneDigits);
// show verify screen — pass name for edit email pre-fill
showVerifyScreen(email, capitaliseWords(name));
```

- [ ] **Step 3: Update editEmail() to include phone field with pre-filled value**

Find `editEmail()`. The function builds a form HTML string. Replace the template literal inside it with:

```js
const pendingPhone = localStorage.getItem('fp_pending_phone') || '';
const phonePrefilled = pendingPhone.startsWith('+91') ? pendingPhone.slice(3) : '';
document.getElementById('mform').innerHTML = `
  <div class="mf"><label class="ml">Full name</label><input class="mi" type="text" placeholder="Your name" value="${pendingSignupName}"/></div>
  <div class="mf"><label class="ml">Email address</label><input class="mi" type="email" placeholder="you@email.com" value="${pendingSignupEmail}"/></div>
  <div class="mf"><label class="ml">Password</label><input class="mi" type="password" placeholder="Create a password"/></div>
  <div class="mf">
    <label class="ml">Phone number</label>
    <div style="display:flex;gap:6px;">
      <span style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:11px 12px;color:var(--muted);font-family:'Plus Jakarta Sans',sans-serif;font-size:.88rem;flex-shrink:0;display:flex;align-items:center;">+91</span>
      <input class="mi" type="tel" placeholder="98765 43210" style="flex:1;min-width:0;" maxlength="11" value="${phonePrefilled}"/>
    </div>
  </div>
  <button class="mb" onclick="ha('signup')">Create Free Account</button>
  <div class="mswitch">Have an account? <a onclick="switchTab('login')">Log in</a></div>
`;
```

- [ ] **Step 4: Verify validation works**

Open http://localhost:8765, open Sign up modal, try submitting with:
- Empty phone → "Enter a valid 10-digit Indian mobile number."
- Phone starting with 5 (e.g. 5123456789) → same error
- Phone with letters → same error
- Valid phone (e.g. 9876543210) → no phone error, signup proceeds

- [ ] **Step 5: Commit**

```
git add index.html
git commit -m "feat: add phone field and validation to signup form"
```

---

## Task 3: Update auth redirect paths in index.html

**Files:** Modify `index.html`

When a pending phone exists, both the `onAuthStateChange` listener (same-browser email confirmation) and the login success handler must route through `verified.html` instead of `app/feed.html` so the phone OTP step runs.

- [ ] **Step 1: Update onAuthStateChange redirect in showVerifyScreen**

Find the `onAuthStateChange` callback inside `showVerifyScreen`. It currently has:
```js
localStorage.setItem('fp_username', uname);
window.location.href = 'app/feed.html';
```

Replace those two lines with:
```js
localStorage.setItem('fp_username', uname);
const dest = localStorage.getItem('fp_pending_phone') ? 'verified.html' : 'app/feed.html';
window.location.href = dest;
```

- [ ] **Step 2: Update login success redirect in ha('login')**

Find the login success block inside `ha('login')`. It currently has:
```js
b.textContent = '✓ Welcome back!'; b.style.opacity = '1';
b.style.background = 'var(--green)';
b.style.boxShadow = '0 0 20px rgba(0,212,126,.45)';
setTimeout(() => { window.location.href = 'app/feed.html'; }, 1200);
```

Replace the last line with:
```js
setTimeout(() => {
  const dest = localStorage.getItem('fp_pending_phone') ? 'verified.html' : 'app/feed.html';
  window.location.href = dest;
}, 1200);
```

- [ ] **Step 3: Commit**

```
git add index.html
git commit -m "feat: route auth redirects through verified.html when phone OTP is pending"
```

---

## Task 4: Add phone OTP step to verified.html

**Files:** Modify `verified.html`

`verified.html` currently loads the Supabase SDK, gets the session, and shows a static success screen. We keep the existing success screen for the no-phone path and add the phone OTP flow when `fp_pending_phone` is in localStorage.

- [ ] **Step 1: Add OTP UI styles to verified.html `<style>` block**

Append inside the existing `<style>` tag (before the closing `</style>`):

```css
.otp-wrap { margin-top: 8px; }
.otp-input {
  width: 100%; background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.09); border-radius: 10px;
  padding: 14px; color: var(--white);
  font-family: 'Outfit', sans-serif; font-weight: 700;
  font-size: 1.6rem; letter-spacing: .35em; text-align: center;
  outline: none; transition: border-color .22s;
  -moz-appearance: textfield;
}
.otp-input::-webkit-outer-spin-button,
.otp-input::-webkit-inner-spin-button { -webkit-appearance: none; }
.otp-input:focus { border-color: #2360f5; }
.otp-input.error { border-color: #ff4060; }
.otp-btn {
  display: block; width: 100%; margin-top: 12px;
  padding: 13px; border-radius: 10px; border: none;
  background: #2360f5; color: #fff;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: .9rem; font-weight: 600; cursor: pointer;
  transition: all .25s; box-shadow: 0 0 24px rgba(35,96,245,.4);
}
.otp-btn:hover { background: #4a7cff; transform: translateY(-1px); }
.otp-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.otp-error {
  font-size: .75rem; color: #ff4060;
  margin-top: 8px; min-height: 1.2em;
}
.otp-resend {
  font-size: .72rem; color: var(--muted);
  margin-top: 14px;
}
.otp-resend span {
  color: #4a7cff; cursor: pointer; font-weight: 500;
}
.otp-resend span:hover { text-decoration: underline; }
```

- [ ] **Step 2: Replace the entire `<script>` block in verified.html**

Replace everything between `<script>` and `</script>` with:

```js
const SUPABASE_URL  = 'https://acwrtldncexhhlzutppv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjd3J0bGRuY2V4aGhsenV0cHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNzQ4NzcsImV4cCI6MjA5Mzk1MDg3N30.DTojjCkw2xY-XQ_-AOai5VlKHsN98XBpgt8AalN4cj4';

const s = document.createElement('script');
s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
s.onload = async () => {
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: { session } } = await sb.auth.getSession();

  const pendingPhone = localStorage.getItem('fp_pending_phone');

  if (session && pendingPhone) {
    showPhoneStep(sb, session, pendingPhone);
  } else if (session) {
    showSuccessScreen(session);
  } else {
    showSuccessScreen(null);
  }
};
document.head.appendChild(s);

function maskPhone(e164) {
  // '+919876543210' → '+91 98765 XXXXX'
  const digits = e164.slice(3); // remove +91
  return '+91 ' + digits.slice(0, 5) + ' ' + 'X'.repeat(5);
}

async function showPhoneStep(sb, session, phone) {
  // Update DOM to phone OTP screen
  document.querySelector('.check-icon').textContent = '📱';
  document.querySelector('h1').innerHTML = 'Verify your <span>phone</span>';
  document.getElementById('msg').textContent =
    'Sending a code to ' + maskPhone(phone) + '…';
  document.getElementById('continue-btn').style.display = 'none';
  document.getElementById('note').textContent = '';

  // Send OTP
  const { error: sendErr } = await sb.auth.updateUser({ phone });
  if (sendErr) {
    document.getElementById('msg').textContent =
      'Could not send code: ' + (sendErr.message || 'unknown error') +
      '. Please go back and try again.';
    return;
  }

  // Show OTP entry UI
  document.getElementById('msg').textContent =
    'Enter the 6-digit code sent to ' + maskPhone(phone);

  const wrap = document.createElement('div');
  wrap.className = 'otp-wrap';
  wrap.innerHTML = `
    <input class="otp-input" id="otp-code" type="number" placeholder="——————" maxlength="6" autocomplete="one-time-code"/>
    <button class="otp-btn" id="otp-btn" onclick="verifyOTP()">Verify phone</button>
    <div class="otp-error" id="otp-error"></div>
    <div class="otp-resend" id="otp-resend" style="display:none;">
      Didn't get it? <span onclick="resendOTP()">Resend code</span>
    </div>
  `;
  document.querySelector('.wrap').appendChild(wrap);

  // Auto-focus OTP input
  setTimeout(() => document.getElementById('otp-code').focus(), 100);

  // Show resend link after 30s
  setTimeout(() => {
    const resendEl = document.getElementById('otp-resend');
    if (resendEl) resendEl.style.display = 'block';
  }, 30000);

  // Attach globals that onclick handlers need
  window._sb = sb;
  window._pendingPhone = phone;
  window._session = session;
}

async function verifyOTP() {
  const code = (document.getElementById('otp-code').value || '').trim();
  const errEl = document.getElementById('otp-error');
  const btn   = document.getElementById('otp-btn');
  const input = document.getElementById('otp-code');

  if (code.length !== 6) {
    errEl.textContent = 'Enter the full 6-digit code.';
    input.classList.add('error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verifying…';
  errEl.textContent = '';
  input.classList.remove('error');

  const { error } = await window._sb.auth.verifyOtp({
    phone: window._pendingPhone,
    token: code,
    type: 'phone_change',
  });

  if (error) {
    btn.disabled = false;
    btn.textContent = 'Verify phone';
    input.classList.add('error');
    errEl.textContent = 'That code is incorrect or has expired. Try again or resend.';
    return;
  }

  // Save verified phone to profiles for alert delivery
  await window._sb.from('profiles').upsert({
    id: window._session.user.id,
    whatsapp_number: window._pendingPhone,
  }, { onConflict: 'id' });

  localStorage.removeItem('fp_pending_phone');

  // Show brief success then redirect
  document.querySelector('.check-icon').textContent = '✓';
  document.querySelector('h1').innerHTML = 'Phone <span>verified!</span>';
  document.getElementById('msg').textContent = 'Taking you to FundPulse…';
  document.querySelector('.otp-wrap').remove();

  setTimeout(() => { window.location.href = 'app/feed.html'; }, 1200);
}

async function resendOTP() {
  const resendEl = document.getElementById('otp-resend');
  if (resendEl) resendEl.style.display = 'none';
  document.getElementById('otp-error').textContent = '';
  document.getElementById('msg').textContent =
    'Resending code to ' + maskPhone(window._pendingPhone) + '…';

  await window._sb.auth.updateUser({ phone: window._pendingPhone });

  document.getElementById('msg').textContent =
    'New code sent to ' + maskPhone(window._pendingPhone);

  // Show resend again after another 30s
  setTimeout(() => {
    const el = document.getElementById('otp-resend');
    if (el) el.style.display = 'block';
  }, 30000);
}

function showSuccessScreen(session) {
  if (session) {
    const name = session.user?.user_metadata?.full_name || 'there';
    // update profile to mark as verified
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    sb.from('profiles').update({ full_name: name }).eq('id', session.user.id);
    document.getElementById('msg').textContent =
      'Your email is confirmed! You can now sign in — go back to FundPulse and reload the page, or open it on this device.';
    document.getElementById('continue-btn').style.display = 'inline-block';
    document.getElementById('note').textContent =
      'Confirmed on a different device? Just reload the sign-up page and sign in with your email and password.';
  } else {
    document.getElementById('msg').textContent =
      'Email confirmed! Reload the sign-up page to sign in, or open FundPulse directly on this device.';
    document.getElementById('continue-btn').style.display = 'inline-block';
  }
}
```

- [ ] **Step 3: Commit**

```
git add verified.html
git commit -m "feat: phone OTP verification step in verified.html"
```

---

## Task 5: End-to-end smoke test

**No code changes — manual verification only.**

- [ ] **Step 1: Test phone validation on signup form**

  Open http://localhost:8765 → Sign up modal → leave phone blank → submit → expect "Enter a valid 10-digit Indian mobile number."

  Enter phone `5123456789` → expect same error (starts with 5, not valid Indian mobile prefix).

  Enter phone `9876543210` → no phone error.

- [ ] **Step 2: Test full signup flow (requires Twilio + Supabase Phone auth enabled)**

  - Sign up with a real name, email, password, and your verified Twilio test number (e.g. 9876543210)
  - Confirm `fp_pending_phone` is in localStorage: open browser devtools → Application → Local Storage → look for `fp_pending_phone` with value `+919876543210`
  - Click the verification link in the email → `verified.html` loads
  - Confirm OTP UI appears: "Verify your phone", masked number, 6-digit input
  - Enter the OTP received via SMS → click Verify phone
  - Confirm redirect to `app/feed.html`
  - Confirm `fp_pending_phone` is gone from localStorage
  - Confirm `profiles.whatsapp_number` is set: Supabase Dashboard → Table Editor → profiles → find your user row

- [ ] **Step 3: Test wrong OTP**

  In Step 2, enter `000000` as the code → expect "That code is incorrect or has expired. Try again or resend."

- [ ] **Step 4: Test resend (wait 30s on OTP screen)**

  Wait 30 seconds after OTP screen appears → "Didn't get it? Resend code" link appears → click it → new SMS received.

- [ ] **Step 5: Test existing login flow is unchanged**

  Log in with an existing account that has NO `fp_pending_phone` in localStorage → should go directly to `app/feed.html`, no phone step shown.

- [ ] **Step 6: Test duplicate email flow still works**

  Try signing up with an existing email → expect "An account with this email already exists. Log in instead →"

- [ ] **Step 7: Commit final push**

```
git push
```

---

## Self-Review Notes

- `fp_pending_phone` is in E.164 format (`+91XXXXXXXXXX`) consistently across all writes/reads
- `verifyOtp` uses `type: 'phone_change'` which is correct for the `updateUser({ phone })` flow (not `type: 'sms'`)
- `maskPhone` only handles +91 numbers — fine for Phase 1 (Indian only per spec)
- `window._sb`, `window._pendingPhone`, `window._session` are set as globals in verified.html because the `verifyOTP` and `resendOTP` functions are called via `onclick` attributes
- The `showSuccessScreen` function preserves the exact existing behaviour for users without a pending phone
- No changes to `app/supabase.js`, `app/feed.html`, `app/watchlist.html`, `app/alerts.html`
