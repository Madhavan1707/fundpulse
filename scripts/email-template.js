'use strict';

// Escape values that originate from user/watchlist data before they go into the
// email HTML. Fund names come from a user's own watchlist, but never interpolate
// unescaped data into markup.
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildEmail({ fundName, fundCat, type, todayNav, pctChange, threshold, appUrl }) {
  const isDown  = type === 'drop';
  if (!Number.isFinite(todayNav) || !Number.isFinite(pctChange)) {
    throw new TypeError('todayNav and pctChange must be finite numbers');
  }
  if (isDown && pctChange > 0) throw new RangeError('pctChange must be negative for type "drop"');
  if (!isDown && pctChange < 0) throw new RangeError('pctChange must be positive for type "rise"');
  const icon    = isDown ? '📉' : '📈';
  const arrow   = isDown ? '▼' : '▲';
  const color   = isDown ? '#ff4060' : '#00d47e';
  const absPct  = Math.abs(pctChange).toFixed(2);
  const subject = `${icon} ${fundName} ${isDown ? 'dropped' : 'rose'} ${absPct}% today`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#070c18;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#070c18;min-height:100vh;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

      <tr><td style="padding-bottom:28px;">
        <span style="font-size:0.75rem;font-weight:800;color:#edf2ff;letter-spacing:-0.02em;">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#2360f5;margin-right:7px;vertical-align:middle;"></span>FundPulse
        </span>
      </td></tr>

      <tr><td style="background:#0f1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px 24px;">

        <p style="margin:0 0 16px;font-size:1rem;font-weight:700;color:#edf2ff;">${icon} Price Alert</p>

        <p style="margin:0 0 4px;font-size:1.3rem;font-weight:800;color:#edf2ff;letter-spacing:-0.02em;">${escHtml(fundName)}</p>
        <p style="margin:0 0 24px;font-size:0.75rem;color:#7a8fb0;">${escHtml(fundCat || 'Mutual Fund')}</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr>
            <td width="48%" style="background:#142038;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:0.62rem;color:#4a5878;text-transform:uppercase;letter-spacing:0.06em;">Unit price today</p>
              <p style="margin:0;font-size:1.2rem;font-weight:800;color:#edf2ff;">₹${todayNav.toFixed(2)}</p>
            </td>
            <td width="4%"></td>
            <td width="48%" style="background:#142038;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:0.62rem;color:#4a5878;text-transform:uppercase;letter-spacing:0.06em;">Change</p>
              <p style="margin:0;font-size:1.2rem;font-weight:800;color:${color};">${arrow} ${absPct}%</p>
              <p style="margin:2px 0 0;font-size:0.65rem;color:#4a5878;">threshold ${threshold}%</p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px;font-size:0.86rem;color:#7a8fb0;line-height:1.6;">
          ${isDown
            ? 'Unit price dropped more than your alert threshold today.'
            : 'Unit price rose more than your alert threshold today.'}
        </p>

        <a href="${appUrl}/app/watchlist.html"
           style="display:block;text-align:center;background:#2360f5;color:#ffffff;text-decoration:none;font-weight:700;font-size:0.9rem;padding:14px 24px;border-radius:100px;">
          View Watchlist &#8594;
        </a>

      </td></tr>

      <tr><td style="padding-top:20px;text-align:center;">
        <p style="margin:0 0 8px;font-size:0.72rem;color:#4a5878;">
          FundPulse &middot;
          <a href="${appUrl}/app/alerts.html" style="color:#4a5878;text-decoration:none;">Manage alerts</a>
          &middot;
          <a href="${appUrl}/terms.html" style="color:#4a5878;text-decoration:none;">Terms</a>
          &middot;
          <a href="${appUrl}/privacy.html" style="color:#4a5878;text-decoration:none;">Privacy</a>
        </p>
        <p style="margin:0;font-size:0.66rem;color:#4a5878;line-height:1.6;">
          This is information about a fund you chose to track — not investment advice.
          Past performance is not indicative of future results.
          You get this email because you set this alert; turn it off any time from the link above.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

module.exports = { buildEmail };
