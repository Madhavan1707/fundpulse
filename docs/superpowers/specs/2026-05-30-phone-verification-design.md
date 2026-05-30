# Phone Number Verification — Design Spec

**Date:** 2026-05-30
**Status:** Approved
**Scope:** Add phone number collection and OTP verification to the signup flow using Supabase native phone auth + Twilio.

---

## Background

FundPulse promises SMS and WhatsApp alerts. Currently no phone number is collected or verified at signup. The `profiles.whatsapp_number` column exists but is never populated. This spec adds phone verification as a required step during signup so the number is confirmed before the user reaches the app.

---

## User Flow

```
1. Signup form (index.html)
   - Fields: Full name, Email, Password, Phone number (+91 prefix)
   - Validation: name present, email valid, password rules, phone 10 digits
   - On submit: supabase.auth.signUp() → email verification sent
                phone stored in localStorage as fp_pending_phone (E.164 format)
   - Screen shown: existing "Check your inbox" UI (no change)

2. Email verification (existing)
   - User clicks link in email → redirected to verified.html
   - verified.html establishes session as it does today

3. Phone OTP step (verified.html — new)
   - Reads fp_pending_phone from localStorage
   - If present: calls supabase.auth.updateUser({ phone }) → Twilio sends 6-digit OTP
   - Shows OTP entry screen (6-digit input)
   - On submit: supabase.auth.verifyOtp({ phone, token, type: 'phone_change' })
   - On success:
       - Copies verified phone to profiles.whatsapp_number via upsert
       - Clears fp_pending_phone from localStorage
       - Redirects to app/feed.html
   - If fp_pending_phone absent: redirects to app/feed.html immediately (existing behaviour)

4. App access (app/feed.html)
   - No change to boot sequence
```

---

## Signup Form Changes (index.html)

### New field
- Positioned below Password, above the submit button
- Label: "Phone number"
- Input: type="tel", placeholder="98765 43210"
- Prefix display: "+91" shown as a static label inside/beside the input (not editable)
- Stored value: `+91` + 10 digits → E.164 format `+91XXXXXXXXXX`

### Validation (client-side, before signUp call)
- Strip spaces and dashes from input
- Must be exactly 10 digits after stripping
- Must not start with 0
- Error shown inline via existing `showFieldError()`: "Enter a valid 10-digit Indian mobile number."

### Storage
- After successful `signUp()` call (before showing verify screen):
  `localStorage.setItem('fp_pending_phone', '+91' + digits)`

---

## Phone OTP Screen (verified.html)

### Trigger condition
`localStorage.getItem('fp_pending_phone')` is non-null after session is established.

### UI — two states

**State 1: Sending OTP**
- Brief "Sending a code to +91 XXXXX XXXXX…" message with spinner
- `updateUser({ phone })` called automatically, no user action needed

**State 2: Enter code**
- Heading: "Verify your phone"
- Sub-text: "Enter the 6-digit code we sent to +91 XXXXX XXXXX"
- Single input: type="number", maxlength=6, auto-focus
- Button: "Verify"
- Secondary link: "Resend code" (calls `updateUser({ phone })` again, shown after 30s)
- Error state: inline error below input for wrong/expired OTP

### OTP verification
```js
const { error } = await supabase.auth.verifyOtp({
  phone: pendingPhone,
  token: userEnteredCode,
  type: 'phone_change'
});
```

### On success
```js
// Save to profiles for alert delivery
await supabase.from('profiles').upsert({
  id: session.user.id,
  whatsapp_number: pendingPhone
}, { onConflict: 'id' });

localStorage.removeItem('fp_pending_phone');
window.location.href = 'app/feed.html';
```

### On error
- "That code is incorrect or has expired. Try again or resend."
- Input cleared, re-focused

---

## Supabase Setup (one-time, done before testing)

1. **Supabase Dashboard → Authentication → Providers → Phone**
   - Enable Phone provider
   - SMS provider: Twilio
   - Enter: Account SID, Auth Token, Twilio phone number (or Messaging Service SID)

2. **Twilio setup**
   - Create free account at twilio.com
   - Get a phone number (free trial number works)
   - Note: Account SID, Auth Token from Twilio Console
   - Trial accounts can only send to verified numbers — verify your own number for testing

3. **No environment variables needed in the frontend** — Twilio credentials live only in the Supabase dashboard, never in client code.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| User verifies email on a different device | `fp_pending_phone` absent on that device → phone step skipped → user lands in feed. Phone can be added later via Settings (Phase 2). |
| User enters wrong OTP 3+ times | Supabase/Twilio rate-limits automatically. Show "Too many attempts. Request a new code." |
| OTP expires (10 min default) | `verifyOtp` returns error → show resend option |
| User closes tab mid-OTP | On next login, `fp_pending_phone` may still be in localStorage. verified.html won't run again (email already confirmed). Phone remains unverified. |
| Phone number already in use | `updateUser` returns error → show "This number is linked to another account." |
| signUp fails before phone is stored | `fp_pending_phone` never set → no phone step |

---

## Files Changed

| File | Change |
|---|---|
| `index.html` | Add phone field, validation, store `fp_pending_phone` |
| `verified.html` | Add phone OTP step after session established |
| `app/supabase.js` | No changes |
| `app/settings.html` | No changes (phone editing is Phase 2) |

---

## Out of Scope

- Changing/re-verifying phone after signup (Settings — Phase 2)
- Non-Indian numbers (international format support — future)
- WhatsApp OTP as an alternative to SMS OTP (future)
- Users who signed up before this feature (they get no phone prompt — existing behaviour preserved)
