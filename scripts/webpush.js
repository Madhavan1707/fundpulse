'use strict';

// Web Push without dependencies: RFC 8291 (aes128gcm message encryption)
// + RFC 8292 (VAPID) on plain node:crypto. The repo has no package manager
// by design, so the web-push npm library is not an option.

const crypto = require('crypto');

const b64u = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) =>
  Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function hkdfExtract(salt, ikm) {
  return crypto.createHmac('sha256', salt).update(ikm).digest();
}

function hkdfExpand(prk, info, length) {
  // single-block expand is enough: web push never needs more than 32 bytes
  const t = crypto.createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest();
  return t.subarray(0, length);
}

// RFC 8291: encrypt a payload for a push subscription.
// sub: { endpoint, keys: { p256dh, auth } } — the browser's PushSubscription JSON.
// Options (tests only): asKeyPair (ECDH object), salt (16 bytes).
function encryptPayload(sub, payload, opts = {}) {
  const uaPublic = fromB64u(sub.keys.p256dh);   // 65-byte uncompressed P-256 point
  const authSecret = fromB64u(sub.keys.auth);   // 16 bytes
  if (uaPublic.length !== 65) throw new Error(`bad p256dh length: ${uaPublic.length}`);
  if (authSecret.length !== 16) throw new Error(`bad auth length: ${authSecret.length}`);

  const asKeys = opts.asKeyPair || crypto.createECDH('prime256v1');
  if (!opts.asKeyPair) asKeys.generateKeys();
  const asPublic = asKeys.getPublicKey();
  const salt = opts.salt || crypto.randomBytes(16);

  const ecdhSecret = asKeys.computeSecret(uaPublic);
  const prkKey = hkdfExtract(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);

  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);

  // single record: payload + 0x02 delimiter (last record), no extra padding
  const plaintext = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  // aes128gcm body header: salt(16) | rs(4) | idlen(1) | keyid(65)
  const header = Buffer.concat([
    salt,
    Buffer.from([0x00, 0x00, 0x10, 0x00]), // rs = 4096
    Buffer.from([asPublic.length]),
    asPublic,
  ]);
  return Buffer.concat([header, ciphertext]);
}

// RFC 8292: VAPID Authorization header for a push endpoint.
// vapid: { publicKey, privateKey, subject } — base64url point / scalar / mailto:
function vapidAuthHeader(endpoint, vapid) {
  const { origin } = new URL(endpoint);
  const pub = fromB64u(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('bad VAPID public key');
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: b64u(pub.subarray(1, 33)),
    y: b64u(pub.subarray(33, 65)),
    d: vapid.privateKey,
  };
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: vapid.subject,
  }));
  const signingInput = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), {
    key, dsaEncoding: 'ieee-p1363', // raw r||s, as JWS requires
  });
  return `vapid t=${signingInput}.${b64u(sig)}, k=${vapid.publicKey}`;
}

// Send one push message. Returns { ok, gone, status }.
// gone=true (404/410) means the subscription is dead and should be deleted.
async function sendPush(sub, payload, vapid, ttlSeconds = 86400) {
  const body = encryptPayload(sub, payload);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'normal',
      Authorization: vapidAuthHeader(sub.endpoint, vapid),
    },
    body,
  });
  // push services return 201 on accept
  return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
}

module.exports = { encryptPayload, vapidAuthHeader, sendPush, b64u, fromB64u };
