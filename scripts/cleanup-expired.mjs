import { createSign } from 'node:crypto';

const databaseUrl = 'https://eventregistration-tw-default-rtdb.asia-southeast1.firebasedatabase.app';
const credentials = parseCredentials(process.env.FIREBASE_SERVICE_ACCOUNT);
const accessToken = await createAccessToken(credentials);
const now = Date.now();
const query = new URLSearchParams({ orderBy: JSON.stringify('expires_at'), endAt: String(now) });
const catalogResponse = await fetch(`${databaseUrl}/eventCatalog.json?${query}`, {
  headers: { authorization: `Bearer ${accessToken}` },
});
if (!catalogResponse.ok) throw new Error(`Firebase catalog read failed: ${catalogResponse.status}`);

const catalog = await catalogResponse.json() || {};
const eventIds = Object.keys(catalog).filter((eventId) => Number(catalog[eventId]?.expires_at) <= now);
if (!eventIds.length) {
  console.log('No expired events.');
  process.exit(0);
}

const removals = {};
for (const eventId of eventIds) {
  removals[`events/${eventId}`] = null;
  removals[`adminKeys/${eventId}`] = null;
  removals[`adminKeyClaims/${eventId}`] = null;
  removals[`eventCatalog/${eventId}`] = null;
}

const deleteResponse = await fetch(`${databaseUrl}/.json`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
  body: JSON.stringify(removals),
});
if (!deleteResponse.ok) throw new Error(`Firebase cleanup failed: ${deleteResponse.status}`);
console.log(`Deleted ${eventIds.length} expired event(s).`);

function parseCredentials(raw) {
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured.');
  const value = JSON.parse(raw);
  if (!value.client_email || !value.private_key) throw new Error('Invalid Firebase service account JSON.');
  return value;
}

async function createAccessToken(value) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({
    iss: value.client_email,
    sub: value.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(value.private_key, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${signature}` }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${response.status}`);
  return (await response.json()).access_token;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
