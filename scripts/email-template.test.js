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

test('throws if pctChange sign mismatches type', () => {
  assert.throws(
    () => buildEmail({ fundName: 'X', fundCat: '', type: 'drop', todayNav: 50, pctChange: 3.5, threshold: 3, appUrl: 'https://x.com' }),
    { name: 'RangeError' }
  );
});

test('throws if todayNav is not a finite number', () => {
  assert.throws(
    () => buildEmail({ fundName: 'X', fundCat: '', type: 'drop', todayNav: NaN, pctChange: -3.5, threshold: 3, appUrl: 'https://x.com' }),
    { name: 'TypeError' }
  );
});
