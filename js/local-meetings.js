const RECENT_MEETINGS_KEY = 'scheduleAMeeting.recent.v1';
const DRAFT_PREFIX = 'scheduleAMeeting.draft:';

export function readRecentMeetings(storage = localStorage) {
  try {
    const entries = JSON.parse(storage.getItem(RECENT_MEETINGS_KEY) || '[]');
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function writeRecentMeetings(entries, storage = localStorage) {
  const limitedEntries = entries.slice(0, 20);
  if (limitedEntries.length === 0) {
    storage.removeItem(RECENT_MEETINGS_KEY);
    return;
  }
  storage.setItem(RECENT_MEETINGS_KEY, JSON.stringify(limitedEntries));
}

export function saveRecentMeeting(entry, storage = localStorage) {
  const entries = readRecentMeetings(storage);
  writeRecentMeetings([
    entry,
    ...entries.filter((item) => item.meetingId !== entry.meetingId),
  ], storage);
}

export function getLocalAdminKey(meetingId, storage = localStorage) {
  return readRecentMeetings(storage).find((item) => item.meetingId === meetingId)?.adminKey || '';
}

export function readMeetingDraft(meetingId, storage = localStorage) {
  try {
    return JSON.parse(storage.getItem(`${DRAFT_PREFIX}${meetingId}`) || '{}');
  } catch {
    return {};
  }
}

export function saveMeetingDraft(meetingId, draft, storage = localStorage) {
  storage.setItem(`${DRAFT_PREFIX}${meetingId}`, JSON.stringify(draft));
}

export function removeLocalMeeting(meetingId, storage = localStorage) {
  writeRecentMeetings(
    readRecentMeetings(storage).filter((item) => item.meetingId !== meetingId),
    storage,
  );
  storage.removeItem(`${DRAFT_PREFIX}${meetingId}`);
}

export function clearAllLocalMeetingData(storage = localStorage) {
  storage.removeItem(RECENT_MEETINGS_KEY);
  const draftKeys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(DRAFT_PREFIX)) draftKeys.push(key);
  }
  draftKeys.forEach((key) => storage.removeItem(key));
}
