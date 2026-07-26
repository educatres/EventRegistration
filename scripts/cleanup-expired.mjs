const apiKey = 'AIzaSyA9RSw733qK-ffR1XZ9Y6JQkkjAjTaTTYo';
const databaseUrl = 'https://schedule-a-meeting-tw-default-rtdb.asia-southeast1.firebasedatabase.app';

const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ returnSecureToken: true }),
});

if (!authResponse.ok) throw new Error(`Firebase anonymous auth failed: ${authResponse.status}`);
const { idToken } = await authResponse.json();
const now = Date.now();
const query = new URLSearchParams({
  auth: idToken,
  orderBy: JSON.stringify('expires_at'),
  endAt: String(now),
});
const catalogResponse = await fetch(`${databaseUrl}/meetingCatalog.json?${query}`);
if (!catalogResponse.ok) throw new Error(`Firebase catalog read failed: ${catalogResponse.status}`);

const catalog = await catalogResponse.json() || {};
const meetingIds = Object.keys(catalog).filter((meetingId) => catalog[meetingId]?.expires_at <= now);

if (meetingIds.length === 0) {
  console.log('No expired meetings.');
  process.exit(0);
}

const removals = {};
for (const meetingId of meetingIds) {
  removals[`meetings/${meetingId}`] = null;
  removals[`adminKeys/${meetingId}`] = null;
  removals[`adminKeyClaims/${meetingId}`] = null;
  removals[`meetingCatalog/${meetingId}`] = null;
}

const deleteResponse = await fetch(`${databaseUrl}/.json?auth=${encodeURIComponent(idToken)}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(removals),
});
if (!deleteResponse.ok) throw new Error(`Firebase cleanup failed: ${deleteResponse.status}`);
console.log(`Deleted ${meetingIds.length} expired meeting(s).`);
