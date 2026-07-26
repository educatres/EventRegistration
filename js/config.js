export const EVENT_LIFETIME_MS = 28 * 24 * 60 * 60 * 1000;
export const EVENT_TIME_ZONE = 'Asia/Taipei';

export function generateEventId() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  const digits = String(values[0] % 1_000_000_000).padStart(9, '0');
  return `e${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
}

export function generateAdminKey() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (values[0] % 900000));
}

export function generateFieldId() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return `f_${values[0].toString(36).padStart(8, '0').slice(-8)}`;
}

export function getEventId(search = window.location.search) {
  return new URLSearchParams(search).get('event_id')?.trim() || '';
}

export function buildEventUrl(page, eventId, baseHref = window.location.href) {
  const url = new URL(page, baseHref);
  url.search = '';
  url.searchParams.set('event_id', eventId);
  return url.toString();
}

export function parseEventReference(value, baseHref = window.location.href) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^e\d{3}-\d{3}-\d{3}$/.test(raw)) return raw;

  try {
    return getEventId(new URL(raw, baseHref).search) || raw;
  } catch {
    return raw;
  }
}

export function normalizeEmail(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export async function emailKey(value) {
  const bytes = new TextEncoder().encode(normalizeEmail(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function eventAvailability(event, now = Date.now()) {
  if (!event) return { state: 'unavailable', label: '無法使用', open: false };
  if (Number(event.expires_at) <= now) return { state: 'expired', label: '資料已到期', open: false };
  if (event.status === 'closed') return { state: 'closed', label: '主辦人已關閉報名', open: false };
  if (Number(event.registration_count) >= Number(event.capacity)) return { state: 'full', label: '報名已額滿', open: false };
  if (Number(event.registration_start_at) > now) return { state: 'upcoming', label: '報名尚未開始', open: false };
  if (Number(event.registration_end_at) <= now) return { state: 'ended', label: '報名已截止', open: false };
  return { state: 'open', label: '開放報名中', open: true };
}

export function formatDateTime(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return '-';
  return new Date(timestamp).toLocaleString('zh-TW', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function toDateTimeLocal(value) {
  const date = new Date(Number(value));
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function fromDateTimeLocal(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return NaN;
  return new Date(`${raw}:00+08:00`).getTime();
}
