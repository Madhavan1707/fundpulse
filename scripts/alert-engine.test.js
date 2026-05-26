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
