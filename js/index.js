import { buildEventUrl, parseEventReference } from './config.js';
import { getEventPublic, isEventUnavailableError } from './firebase-store.js';
import { clearRecentEvents, readRecentEvents, removeLocalEvent, writeRecentEvents } from './local-events.js';

const openForm = document.querySelector('#open-event-form');
const recentList = document.querySelector('#recent-events');
const clearButton = document.querySelector('#clear-recent');

renderRecentEvents();
synchronizeRecentEvents();

openForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const eventId = parseEventReference(new FormData(openForm).get('event_reference'));
  if (!eventId) return;
  window.location.href = buildEventUrl('./results.html', eventId);
});

clearButton?.addEventListener('click', () => {
  clearRecentEvents();
  renderRecentEvents();
});

async function synchronizeRecentEvents() {
  const entries = readRecentEvents();
  if (!entries.length) return;
  const synchronized = await Promise.all(entries.map(async (entry) => {
    try {
      const event = await getEventPublic(entry.eventId);
      return { ...entry, title: event.title, expiresAt: event.expires_at };
    } catch (error) {
      if (isEventUnavailableError(error)) {
        removeLocalEvent(entry.eventId);
        return null;
      }
      return entry;
    }
  }));
  writeRecentEvents(synchronized.filter(Boolean));
  renderRecentEvents();
}

function renderRecentEvents() {
  const events = readRecentEvents();
  recentList.innerHTML = events.length ? events.map((event) => `
    <li>
      <div><strong>${escapeHtml(event.title || event.eventId)}</strong><small>${escapeHtml(event.eventId)}</small></div>
      <a class="ghost-btn as-link small-btn" href="${buildEventUrl('./results.html', event.eventId)}">管理</a>
    </li>
  `).join('') : '<li class="empty-text">這個瀏覽器尚未建立任何活動。</li>';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}
