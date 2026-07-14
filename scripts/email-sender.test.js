'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createEmailSender } = require('./email-sender.js');

function fakeFetch(status = 200, body = '{"ok":true}') {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
  fn.calls = calls;
  return fn;
}

// provider selection
test('picks brevo when BREVO_API_KEY is set', () => {
  const s = createEmailSender({ BREVO_API_KEY: 'k', ALERT_FROM_EMAIL: 'a@b.com' });
  assert.equal(s.provider, 'brevo');
  assert.equal(s.from, 'a@b.com');
});
test('brevo wins when both providers are configured', () => {
  const s = createEmailSender({
    BREVO_API_KEY: 'k', ALERT_FROM_EMAIL: 'a@b.com',
    RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'x@y.com',
  });
  assert.equal(s.provider, 'brevo');
});
test('falls back to resend when only resend is configured', () => {
  const s = createEmailSender({ RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'x@y.com' });
  assert.equal(s.provider, 'resend');
  assert.equal(s.from, 'x@y.com');
});
test('returns null when no provider is configured', () => {
  assert.equal(createEmailSender({}), null);
});
test('throws when brevo is set without a from address', () => {
  assert.throws(() => createEmailSender({ BREVO_API_KEY: 'k' }), /ALERT_FROM_EMAIL/);
});
test('brevo reuses RESEND_FROM_EMAIL when ALERT_FROM_EMAIL is absent', () => {
  const s = createEmailSender({ BREVO_API_KEY: 'k', RESEND_FROM_EMAIL: 'x@y.com' });
  assert.equal(s.from, 'x@y.com');
});

// brevo payload
test('brevo send posts the correct payload and headers', async () => {
  const f = fakeFetch();
  const s = createEmailSender({ BREVO_API_KEY: 'brevo-key', ALERT_FROM_EMAIL: 'alerts@fp.com' }, f);
  await s.send('user@example.com', 'Subject!', '<b>hi</b>');
  assert.equal(f.calls.length, 1);
  const { url, opts } = f.calls[0];
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(opts.headers['api-key'], 'brevo-key');
  const body = JSON.parse(opts.body);
  assert.deepEqual(body.sender, { name: 'FundPulse', email: 'alerts@fp.com' });
  assert.deepEqual(body.to, [{ email: 'user@example.com' }]);
  assert.equal(body.subject, 'Subject!');
  assert.equal(body.htmlContent, '<b>hi</b>');
});

// resend payload
test('resend send posts the correct payload and headers', async () => {
  const f = fakeFetch();
  const s = createEmailSender({ RESEND_API_KEY: 'resend-key', RESEND_FROM_EMAIL: 'alerts@fp.com' }, f);
  await s.send('user@example.com', 'Subject!', '<b>hi</b>');
  const { url, opts } = f.calls[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(opts.headers.Authorization, 'Bearer resend-key');
  const body = JSON.parse(opts.body);
  assert.equal(body.from, 'FundPulse <alerts@fp.com>');
  assert.equal(body.to, 'user@example.com');
});

// errors
test('brevo send throws with status and body on failure', async () => {
  const f = fakeFetch(403, 'sender not verified');
  const s = createEmailSender({ BREVO_API_KEY: 'k', ALERT_FROM_EMAIL: 'a@b.com' }, f);
  await assert.rejects(() => s.send('u@e.com', 's', 'h'), /Brevo error for u@e.com: 403 sender not verified/);
});
test('resend send throws with status and body on failure', async () => {
  const f = fakeFetch(422, 'domain not verified');
  const s = createEmailSender({ RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'a@b.com' }, f);
  await assert.rejects(() => s.send('u@e.com', 's', 'h'), /Resend error for u@e.com: 422 domain not verified/);
});
