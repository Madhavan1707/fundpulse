'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveSchemeCode, checkThresholds, todayISTString, isNavFresh, navAgeDays, wantsEmail, navDateToISO } = require('./alert-engine.js');

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
test('does not trigger when threshold value is null (would otherwise fire on any move)', () => {
  const result = checkThresholds({ drop_on: true, drop_val: null, rise_on: true, rise_val: null }, -0.5);
  assert.deepEqual(result, []);
});
test('does not trigger when threshold value is zero or negative', () => {
  assert.deepEqual(checkThresholds({ drop_on: true, drop_val: 0,  rise_on: false, rise_val: 2 }, -5), []);
  assert.deepEqual(checkThresholds({ drop_on: true, drop_val: -3, rise_on: false, rise_val: 2 }, -5), []);
});
test('accepts numeric strings for threshold values (frontend stores strings)', () => {
  const result = checkThresholds({ drop_on: true, drop_val: '3', rise_on: false, rise_val: '2' }, -4.0);
  assert.deepEqual(result, ['drop']);
});

// NAV freshness (mfapi.in dates are DD-MM-YYYY)
test('todayISTString formats as DD-MM-YYYY in IST', () => {
  // 2026-07-13T10:00:00Z is 3:30 PM IST on 13 July
  assert.equal(todayISTString(new Date('2026-07-13T10:00:00Z')), '13-07-2026');
});
test('todayISTString rolls to next day after 6:30 PM UTC', () => {
  // 2026-07-13T19:00:00Z is 12:30 AM IST on 14 July
  assert.equal(todayISTString(new Date('2026-07-13T19:00:00Z')), '14-07-2026');
});
test('isNavFresh accepts today and rejects a NAV older than the bound', () => {
  const now = new Date('2026-07-13T16:30:00Z');
  assert.equal(isNavFresh('13-07-2026', now), true);
  assert.equal(isNavFresh('08-07-2026', now), false);   // 5 days, past the bound
});
// Regression: GitHub delayed this cron past IST midnight on 2026-08-31 (run
// started 21:34 UTC = 03:04 IST next day). The old `navDate === today` gate
// then rejected Monday's real NAV as stale and no run could ever recover it,
// because the gate only ever matched the current IST date.
test('isNavFresh accepts yesterday NAV when the run drifts past IST midnight', () => {
  const now = new Date('2026-08-31T21:34:50Z');          // 03:04 IST on 01-09
  assert.equal(todayISTString(now), '01-09-2026');
  assert.equal(isNavFresh('31-08-2026', now), true);
});
test('isNavFresh tolerates a long weekend but not stale upstream data', () => {
  const now = new Date('2026-07-13T16:30:00Z');          // 10:00 PM IST, 13 July
  assert.equal(isNavFresh('09-07-2026', now), true);     // 4 days, at the bound
  assert.equal(isNavFresh('01-06-2026', now), false);    // months stale
});
test('isNavFresh rejects a future NAV date', () => {
  const now = new Date('2026-07-13T16:30:00Z');
  assert.equal(isNavFresh('14-07-2026', now), false);
});
test('navAgeDays counts IST calendar days and survives month boundaries', () => {
  const now = new Date('2026-09-01T10:00:00Z');          // 3:30 PM IST, 01 Sep
  assert.equal(navAgeDays('01-09-2026', now), 0);
  assert.equal(navAgeDays('31-08-2026', now), 1);
  assert.equal(navAgeDays('28-08-2026', now), 4);
  assert.equal(navAgeDays('not-a-date', now), Infinity);
});

// nav date conversion for alert_log
test('navDateToISO converts mfapi DD-MM-YYYY to YYYY-MM-DD', () => {
  assert.equal(navDateToISO('10-07-2026'), '2026-07-10');
  assert.equal(navDateToISO('01-01-2027'), '2027-01-01');
});

// channel gating
test('wantsEmail true when email is among channels', () => {
  assert.equal(wantsEmail({ channels: ['email', 'whatsapp'] }), true);
});
test('wantsEmail false when user chose only non-email channels', () => {
  assert.equal(wantsEmail({ channels: ['whatsapp'] }), false);
});
test('wantsEmail defaults to true when channels missing or empty', () => {
  assert.equal(wantsEmail({}), true);
  assert.equal(wantsEmail({ channels: [] }), true);
  assert.equal(wantsEmail({ channels: null }), true);
});
