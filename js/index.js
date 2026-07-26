import { buildEventUrl, formatDateTime, parseEventReference } from './config.js';
import { getEventCatalog, getEventPublic, isEventUnavailableError } from './firebase-store.js';
import { clearRecentEvents, readRecentEvents, removeLocalEvent, writeRecentEvents } from './local-events.js';

const openForm = document.querySelector('#open-event-form');
const recentList = document.querySelector('#recent-events');
const clearButton = document.querySelector('#clear-recent');
const systemEventsTrigger = document.querySelector('#system-events-trigger');
const systemEventsDialog = document.querySelector('#system-events-dialog');
const systemEventsClose = document.querySelector('#system-events-close');
const systemEventsRefresh = document.querySelector('#system-events-refresh');
const systemEventsStatus = document.querySelector('#system-events-status');
const systemEventsBody = document.querySelector('#system-events-body');

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

systemEventsTrigger?.addEventListener('click', () => {
  systemEventsDialog.showModal();
  loadSystemEvents();
});

systemEventsClose?.addEventListener('click', () => systemEventsDialog.close());
systemEventsRefresh?.addEventListener('click', loadSystemEvents);
systemEventsDialog?.addEventListener('click', (event) => {
  if (event.target === systemEventsDialog) systemEventsDialog.close();
});

async function loadSystemEvents() {
  systemEventsStatus.textContent = '正在讀取 Firebase...';
  systemEventsBody.innerHTML = '<tr><td colspan="3" class="muted-text">載入中...</td></tr>';
  try {
    const now = Date.now();
    const events = (await getEventCatalog()).sort((a, b) => Number(a.expires_at) - Number(b.expires_at));
    systemEventsBody.innerHTML = events.length ? events.map((event) => {
      const expired = Number(event.expires_at) <= now;
      return `<tr><td><code>${escapeHtml(event.event_id)}</code></td><td>${formatDateTime(event.expires_at)}</td><td><span class="catalog-state ${expired ? 'expired' : ''}">${expired ? '已到期，等待清除' : '有效'}</span></td></tr>`;
    }).join('') : '<tr><td colspan="3" class="empty-text">Firebase 目前沒有活動。</td></tr>';
    systemEventsStatus.textContent = `共 ${events.length} 筆，更新於 ${new Date().toLocaleTimeString('zh-TW')}`;
  } catch (error) {
    systemEventsBody.innerHTML = '<tr><td colspan="3" class="empty-text">無法讀取活動索引。</td></tr>';
    systemEventsStatus.textContent = error?.message || '讀取失敗。';
  }
}

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
