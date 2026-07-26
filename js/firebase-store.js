import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { get, getDatabase, onValue, ref, set, update } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { emailKey, EVENT_LIFETIME_MS, normalizeEmail } from './config.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
let authPromise;

export function ensureAuth() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (authPromise) return authPromise;

  authPromise = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        unsubscribe();
        resolve(user);
        return;
      }
      try {
        const credential = await signInAnonymously(auth);
        unsubscribe();
        resolve(credential.user);
      } catch (error) {
        unsubscribe();
        authPromise = undefined;
        reject(error);
      }
    }, reject);
  });
  return authPromise;
}

export async function createEvent(eventId, adminKey, values) {
  const user = await ensureAuth();
  const createdAt = Date.now();
  const expiresAt = createdAt + EVENT_LIFETIME_MS;
  if (values.registration_end_at > expiresAt) throw new Error('報名結束時間不可晚於資料自動刪除時間。');

  const publicData = {
    title: values.title,
    organizer_name: values.organizer_name,
    description_content: values.description_content,
    description_format: values.description_format,
    registration_start_at: values.registration_start_at,
    registration_end_at: values.registration_end_at,
    capacity: values.capacity,
    registration_count: 0,
    custom_fields: values.custom_fields,
    status: 'open',
    created_at: createdAt,
    expires_at: expiresAt,
    created_by: user.uid,
  };

  try {
    await set(ref(database, `adminKeys/${eventId}`), adminKey);
    await set(ref(database, `adminKeyClaims/${eventId}/${user.uid}`), adminKey);
    await set(ref(database, `events/${eventId}/public`), publicData);
    await set(ref(database, `eventCatalog/${eventId}`), {
      event_id: eventId,
      created_at: createdAt,
      expires_at: expiresAt,
    });
  } catch (error) {
    try {
      await update(ref(database), {
        [`events/${eventId}`]: null,
        [`adminKeys/${eventId}`]: null,
        [`adminKeyClaims/${eventId}`]: null,
        [`eventCatalog/${eventId}`]: null,
      });
    } catch {
      // 保留原始錯誤；殘留資料會由到期清除工作移除。
    }
    throw error;
  }
  return { event_id: eventId, ...publicData };
}

export async function getEventPublic(eventId) {
  await ensureAuth();
  const snapshot = await get(ref(database, `events/${eventId}/public`));
  if (!snapshot.exists()) throw createEventUnavailableError();
  return { event_id: eventId, ...snapshot.val() };
}

export async function getEventCatalog() {
  await ensureAuth();
  const snapshot = await get(ref(database, 'eventCatalog'));
  if (!snapshot.exists()) return [];
  return Object.entries(snapshot.val()).map(([eventId, entry]) => ({
    ...entry,
    event_id: entry.event_id || eventId,
  }));
}

export async function subscribeEventPublic(eventId, onData, onError) {
  await ensureAuth();
  return onValue(ref(database, `events/${eventId}/public`), (snapshot) => {
    if (!snapshot.exists()) {
      onError?.(createEventUnavailableError());
      return;
    }
    onData({ event_id: eventId, ...snapshot.val() });
  }, onError);
}

export async function submitRegistration(eventId, eventData, values) {
  const user = await ensureAuth();
  const registrationId = await emailKey(values.email);
  const count = Number(eventData.registration_count || 0);
  await update(ref(database), {
    [`events/${eventId}/public/registration_count`]: count + 1,
    [`events/${eventId}/registrations/${registrationId}`]: {
      name: values.name,
      email: normalizeEmail(values.email),
      phone: values.phone,
      custom_answers: { _placeholder: '', ...values.custom_answers },
      submitted_at: Date.now(),
      submitted_by: user.uid,
    },
  });
}

export async function claimAdminKey(eventId, adminKey) {
  const user = await ensureAuth();
  const key = String(adminKey || '').trim();
  if (!/^\d{6}$/.test(key)) throw new Error('密鑰必須是六位數字。');
  await set(ref(database, `adminKeyClaims/${eventId}/${user.uid}`), key);
}

export async function subscribeRegistrations(eventId, onData, onError) {
  await ensureAuth();
  return onValue(ref(database, `events/${eventId}/registrations`), (snapshot) => {
    onData(Object.values(snapshot.val() || {}).sort((a, b) => (a.submitted_at || 0) - (b.submitted_at || 0)));
  }, onError);
}

export async function updateEventSchedule(eventId, startAt, endAt) {
  await ensureAuth();
  await update(ref(database, `events/${eventId}/public`), {
    registration_start_at: startAt,
    registration_end_at: endAt,
  });
}

export async function updateEventStatus(eventId, status) {
  await ensureAuth();
  if (!['open', 'closed'].includes(status)) throw new Error('無效的報名狀態。');
  await update(ref(database, `events/${eventId}/public`), { status });
}

export async function deleteEvent(eventId) {
  await ensureAuth();
  await update(ref(database), {
    [`events/${eventId}`]: null,
    [`eventCatalog/${eventId}`]: null,
    [`adminKeyClaims/${eventId}`]: null,
    [`adminKeys/${eventId}`]: null,
  });
}

export function isEventUnavailableError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'event_not_found' || code.includes('permission_denied')
    || code.includes('permission-denied') || message.includes('permission denied');
}

function createEventUnavailableError() {
  const error = new Error('找不到這個活動，或資料已在四週到期後清除。');
  error.code = 'EVENT_NOT_FOUND';
  return error;
}
