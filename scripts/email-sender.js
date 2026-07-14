'use strict';

// Provider-pluggable email sender for the alert engine.
//
// Why two providers: Resend's free tier without a verified custom domain only
// delivers to the Resend account owner's own address — fine for testing, useless
// for real users. Brevo's free tier (300 emails/day) delivers to any recipient
// once the sender address is verified in the Brevo dashboard, no domain needed.
// So Brevo is the default for real users; Resend stays supported for the day a
// custom domain is bought and verified.
//
// Selection: BREVO_API_KEY wins if both are set.
//   Brevo:  BREVO_API_KEY + ALERT_FROM_EMAIL (the sender verified in Brevo)
//   Resend: RESEND_API_KEY + RESEND_FROM_EMAIL

function createEmailSender(env = process.env, fetchImpl = fetch) {
  const fromName = env.ALERT_FROM_NAME || 'FundPulse';

  if (env.BREVO_API_KEY) {
    const from = env.ALERT_FROM_EMAIL || env.RESEND_FROM_EMAIL;
    if (!from) {
      throw new Error('ALERT_FROM_EMAIL is required with BREVO_API_KEY — set it to the sender address you verified in Brevo');
    }
    return {
      provider: 'brevo',
      from,
      async send(to, subject, html) {
        const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': env.BREVO_API_KEY,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sender: { name: fromName, email: from },
            to: [{ email: to }],
            subject,
            htmlContent: html,
          }),
        });
        if (!res.ok) throw new Error(`Brevo error for ${to}: ${res.status} ${await res.text()}`);
        return res.json();
      },
    };
  }

  if (env.RESEND_API_KEY) {
    const from = env.RESEND_FROM_EMAIL || env.ALERT_FROM_EMAIL;
    if (!from) {
      throw new Error('RESEND_FROM_EMAIL is required with RESEND_API_KEY');
    }
    return {
      provider: 'resend',
      from,
      async send(to, subject, html) {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: `${fromName} <${from}>`, to, subject, html }),
        });
        if (!res.ok) throw new Error(`Resend error for ${to}: ${res.status} ${await res.text()}`);
        return res.json();
      },
    };
  }

  return null;
}

module.exports = { createEmailSender };
