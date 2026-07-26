import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { get, getDatabase, onValue, ref, set, update } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { MEETING_LIFETIME_MS, participantNameKey } from './config.js';
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
        reject(error);
      }
    }, reject);
  });

  return authPromise;
}

export async function createMeeting(meetingId, adminKey, meeting) {
  const user = await ensureAuth();
  const createdAt = Date.now();
  const expiresAt = createdAt + MEETING_LIFETIME_MS;
  const settings = {
    title: meeting.meeting_title,
    description: meeting.meeting_description,
    organizer_name: meeting.organizer_name,
    start_date: meeting.start_date,
    end_date: meeting.end_date,
    start_time: meeting.start_time,
    end_time: meeting.end_time,
    slot_minutes: Number(meeting.slot_minutes),
    include_saturday: meeting.include_saturday,
    include_sunday: meeting.include_sunday,
    response_deadline: meeting.response_deadline,
    status: 'open',
    selected_final_slot: '',
    created_at: createdAt,
    expires_at: expiresAt,
    created_by: user.uid,
  };

  await set(ref(database, `adminKeys/${meetingId}`), adminKey);
  await set(ref(database, `adminKeyClaims/${meetingId}/${user.uid}`), adminKey);
  await set(ref(database, `meetings/${meetingId}/settings`), settings);
  await set(ref(database, `meetingCatalog/${meetingId}`), {
    meeting_id: meetingId,
    created_at: createdAt,
    expires_at: expiresAt,
  });

  return { ...settings, meeting_id: meetingId };
}

export async function getMeeting(meetingId) {
  await ensureAuth();
  const snapshot = await get(ref(database, `meetings/${meetingId}`));
  if (!snapshot.exists()) throw createMeetingUnavailableError();
  return { meeting_id: meetingId, ...snapshot.val() };
}

export async function getMeetingCatalog() {
  await ensureAuth();
  const snapshot = await get(ref(database, 'meetingCatalog'));
  if (!snapshot.exists()) return [];
  return Object.entries(snapshot.val()).map(([meetingId, entry]) => ({
    ...entry,
    meeting_id: entry.meeting_id || meetingId,
  }));
}

export async function subscribeMeeting(meetingId, onData, onError) {
  await ensureAuth();
  return onValue(ref(database, `meetings/${meetingId}`), (snapshot) => {
    if (!snapshot.exists()) {
      onError?.(createMeetingUnavailableError());
      return;
    }
    onData({ meeting_id: meetingId, ...snapshot.val() });
  }, onError);
}

export async function subscribeMeetingSettings(meetingId, onData, onError) {
  await ensureAuth();
  return onValue(ref(database, `meetings/${meetingId}/settings`), (snapshot) => {
    if (!snapshot.exists()) {
      onError?.(createMeetingUnavailableError());
      return;
    }
    onData({ meeting_id: meetingId, ...snapshot.val() });
  }, onError);
}

export function isMeetingUnavailableError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'meeting_not_found'
    || code.includes('permission_denied')
    || code.includes('permission-denied')
    || message.includes('permission denied');
}

export async function submitResponse(meetingId, participantName, availability, note) {
  const user = await ensureAuth();
  const nameKey = await participantNameKey(participantName);
  await set(ref(database, `meetings/${meetingId}/responses/${nameKey}`), {
    participant_name: participantName.trim(),
    name_key: nameKey,
    availability: {
      _placeholder: false,
      ...Object.fromEntries([...new Set(availability)].sort().map((slot) => [slot, true])),
    },
    note: note.trim(),
    updated_at: Date.now(),
    updated_by: user.uid,
  });
}

export async function claimAdminKey(meetingId, adminKey) {
  const user = await ensureAuth();
  const key = String(adminKey || '').trim();
  if (!/^\d{6}$/.test(key)) throw new Error('密鑰必須是六位數字。');
  await set(ref(database, `adminKeyClaims/${meetingId}/${user.uid}`), key);
  return true;
}

export async function updateMeetingSettings(meetingId, values) {
  await ensureAuth();
  await update(ref(database, `meetings/${meetingId}/settings`), values);
}

export async function deleteExpiredMeeting(meetingId) {
  await ensureAuth();
  const catalogSnapshot = await get(ref(database, `meetingCatalog/${meetingId}`));
  const expiresAt = catalogSnapshot.val()?.expires_at;
  if (!expiresAt || expiresAt > Date.now()) return false;

  await update(ref(database), {
    [`meetings/${meetingId}`]: null,
    [`adminKeys/${meetingId}`]: null,
    [`adminKeyClaims/${meetingId}`]: null,
    [`meetingCatalog/${meetingId}`]: null,
  });
  return true;
}

export async function deleteMeeting(meetingId) {
  await ensureAuth();
  await update(ref(database), {
    [`meetings/${meetingId}`]: null,
    [`adminKeys/${meetingId}`]: null,
    [`adminKeyClaims/${meetingId}`]: null,
    [`meetingCatalog/${meetingId}`]: null,
  });
}

function createMeetingUnavailableError() {
  const error = new Error('找不到這個會議，或資料已在三週到期後清除。');
  error.code = 'MEETING_NOT_FOUND';
  return error;
}
