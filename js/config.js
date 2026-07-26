export const MEETING_LIFETIME_MS = 21 * 24 * 60 * 60 * 1000;

export function generateMeetingId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const token = Array.from(bytes, (value) => value.toString(36).padStart(2, '0')).join('').slice(0, 15);
  return `m-${token.match(/.{1,5}/g).join('-')}`;
}

export function generateAdminKey() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (values[0] % 900000));
}

export function getMeetingId(search = window.location.search) {
  return new URLSearchParams(search).get('meeting_id')?.trim() || '';
}

export function buildMeetingUrl(page, meetingId, baseHref = window.location.href) {
  const url = new URL(page, baseHref);
  url.search = '';
  url.searchParams.set('meeting_id', meetingId);
  return url.toString();
}

export function parseMeetingReference(value, baseHref = window.location.href) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^m-[a-z0-9-]+$/i.test(raw)) return raw;

  try {
    return getMeetingId(new URL(raw, baseHref).search) || raw;
  } catch {
    return raw;
  }
}

export function normalizeParticipantName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('zh-Hant');
}

export async function participantNameKey(value) {
  const normalized = normalizeParticipantName(value);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
