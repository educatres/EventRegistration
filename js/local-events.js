const RECENT_EVENTS_KEY = 'eventRegistration.recent.v1';

export function readRecentEvents(storage = localStorage) {
  try {
    const entries = JSON.parse(storage.getItem(RECENT_EVENTS_KEY) || '[]');
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function writeRecentEvents(entries, storage = localStorage) {
  const limited = entries.slice(0, 20);
  if (limited.length === 0) {
    storage.removeItem(RECENT_EVENTS_KEY);
    return;
  }
  storage.setItem(RECENT_EVENTS_KEY, JSON.stringify(limited));
}

export function saveRecentEvent(entry, storage = localStorage) {
  writeRecentEvents([
    entry,
    ...readRecentEvents(storage).filter((item) => item.eventId !== entry.eventId),
  ], storage);
}

export function getLocalAdminKey(eventId, storage = localStorage) {
  return readRecentEvents(storage).find((item) => item.eventId === eventId)?.adminKey || '';
}

export function removeLocalEvent(eventId, storage = localStorage) {
  writeRecentEvents(readRecentEvents(storage).filter((item) => item.eventId !== eventId), storage);
}

export function clearRecentEvents(storage = localStorage) {
  storage.removeItem(RECENT_EVENTS_KEY);
}
