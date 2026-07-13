'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('crypto');
const { encryptPayload, vapidAuthHeader, b64u, fromB64u } = require('./webpush.js');

// Build a browser-like subscription with a known "user agent" keypair so the
// test can play the browser's side and decrypt what encryptPayload produced.
function makeSubscription() {
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    ua,
    auth,
    sub: {
      endpoint: 'https://push.example.net/send/abc123',
      keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) },
    },
  };
}

// The inverse of RFC 8291 encryption — what the browser does on receipt.
function decryptBody(body, ua, authSecret) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);

  const hkdfExtract = (s, ikm) => crypto.createHmac('sha256', s).update(ikm).digest();
  const hkdfExpand = (prk, info, len) => crypto.createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);

  const ecdhSecret = ua.computeSecret(asPublic);
  const prkKey = hkdfExtract(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const padded = Buffer.concat([decipher.update(data), decipher.final()]);
  assert.equal(rs, 4096);
  // strip the 0x02 last-record delimiter
  assert.equal(padded[padded.length - 1], 0x02);
  return padded.subarray(0, padded.length - 1).toString('utf8');
}

test('encryptPayload: browser-side decryption recovers the payload (RFC 8291 roundtrip)', () => {
  const { ua, auth, sub } = makeSubscription();
  const payload = JSON.stringify({ title: 'FundPulse', body: 'SBI PSU fell 3.2% today' });
  const body = encryptPayload(sub, payload);
  assert.equal(decryptBody(body, ua, auth), payload);
});

test('encryptPayload: header layout is salt(16) rs(4) idlen(1) key(65)', () => {
  const { sub } = makeSubscription();
  const body = encryptPayload(sub, 'x');
  assert.equal(body.readUInt32BE(16), 4096); // record size
  assert.equal(body[20], 65);                // keyid length
  assert.equal(body[21], 0x04);              // uncompressed point marker
  // 1-byte payload + 1-byte delimiter + 16-byte tag after the 86-byte header
  assert.equal(body.length, 86 + 18);
});

test('encryptPayload: rejects malformed subscription keys', () => {
  const bad = { endpoint: 'https://push.example.net/x', keys: { p256dh: b64u(Buffer.alloc(10)), auth: b64u(Buffer.alloc(16)) } };
  assert.throws(() => encryptPayload(bad, 'hi'), /bad p256dh/);
});

test('vapidAuthHeader: JWT verifies against the public key and carries the right claims', () => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const vapid = {
    publicKey: b64u(ecdh.getPublicKey()),
    privateKey: b64u(ecdh.getPrivateKey()),
    subject: 'mailto:alerts@fundpulse.test',
  };
  const header = vapidAuthHeader('https://fcm.googleapis.com/fcm/send/xyz', vapid);
  const m = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(m, 'header shape');
  assert.equal(m[2], vapid.publicKey);

  const [h, c, s] = m[1].split('.');
  const claims = JSON.parse(fromB64u(c).toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, vapid.subject);
  assert.ok(claims.exp > Date.now() / 1000);

  const pub = fromB64u(vapid.publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, fromB64u(s));
  assert.ok(ok, 'ES256 signature verifies');
});
