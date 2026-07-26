import { buildMeetingUrl, parseMeetingReference } from './config.js';
import { getMeeting, getMeetingCatalog, isMeetingUnavailableError } from './firebase-store.js';
import { clearAllLocalMeetingData, readRecentMeetings, writeRecentMeetings } from './local-meetings.js';

const openForm = document.querySelector('#open-meeting-form');
const recentList = document.querySelector('#recent-meetings');
const clearButton = document.querySelector('#clear-recent');
const debugTrigger = document.querySelector('#debug-trigger');
const debugDialog = document.querySelector('#debug-dialog');
const debugClose = document.querySelector('#debug-close');
const debugRefresh = document.querySelector('#debug-refresh');
const debugStatus = document.querySelector('#debug-status');
const debugMeetings = document.querySelector('#debug-meetings');

renderRecentMeetings();
synchronizeRecentMeetings();

openForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const meetingId = parseMeetingReference(new FormData(openForm).get('meeting_reference'));
  if (!meetingId) return;
  window.location.href = buildMeetingUrl('./results.html', meetingId);
});

clearButton?.addEventListener('click', () => {
  clearAllLocalMeetingData();
  renderRecentMeetings();
});

debugTrigger?.addEventListener('click', () => {
  debugDialog.showModal();
  loadDebugMeetings();
});

debugClose?.addEventListener('click', () => debugDialog.close());
debugRefresh?.addEventListener('click', loadDebugMeetings);
debugDialog?.addEventListener('click', (event) => {
  if (event.target === debugDialog) debugDialog.close();
});

async function loadDebugMeetings() {
  debugStatus.textContent = '正在讀取 Firebase...';
  debugMeetings.innerHTML = '<tr><td colspan="3" class="muted-text">載入中...</td></tr>';

  try {
    const now = Date.now();
    const meetings = (await getMeetingCatalog())
      .sort((a, b) => (a.expires_at || 0) - (b.expires_at || 0));
    debugMeetings.innerHTML = meetings.length ? meetings.map((meeting) => {
      const expired = Number(meeting.expires_at) <= now;
      const meetingId = meeting.meeting_id || '-';
      return `
        <tr>
          <td><code>${escapeHtml(meetingId)}</code><small>meetings/${escapeHtml(meetingId)}</small></td>
          <td>${formatDebugTime(meeting.expires_at)}</td>
          <td><span class="debug-state ${expired ? 'expired' : ''}">${expired ? '已失效，等待清除' : '有效'}</span></td>
        </tr>`;
    }).join('') : '<tr><td colspan="3" class="muted-text">Firebase 目前沒有 meeting。</td></tr>';
    debugStatus.textContent = `共 ${meetings.length} 筆，更新於 ${new Date().toLocaleTimeString('zh-TW')}`;
  } catch (error) {
    debugMeetings.innerHTML = '<tr><td colspan="3" class="muted-text">無法讀取 Firebase meeting。</td></tr>';
    debugStatus.textContent = error?.message || '讀取失敗。';
  }
}

async function synchronizeRecentMeetings() {
  const entries = readRecentMeetings();
  if (entries.length === 0) return;

  const synchronized = await Promise.all(entries.map(async (entry) => {
    try {
      const record = await getMeeting(entry.meetingId);
      return {
        ...entry,
        title: record.settings?.title || entry.title,
        expiresAt: record.settings?.expires_at || entry.expiresAt,
      };
    } catch (error) {
      return isMeetingUnavailableError(error) ? null : entry;
    }
  }));

  writeRecentMeetings(synchronized.filter(Boolean));
  renderRecentMeetings();
}

function renderRecentMeetings() {
  const meetings = readRecentMeetings();
  if (!recentList) return;
  recentList.innerHTML = meetings.length
    ? meetings.map((meeting) => `
      <li>
        <div>
          <strong>${escapeHtml(meeting.title || meeting.meetingId)}</strong>
          <small>${escapeHtml(meeting.meetingId)}</small>
        </div>
        <a class="ghost-btn as-link small-btn" href="${buildMeetingUrl('./results.html', meeting.meetingId)}">查看</a>
      </li>
    `).join('')
    : '<li class="empty-text">這個瀏覽器尚未建立任何會議。</li>';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}

function formatDebugTime(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-TW') : '-';
}
