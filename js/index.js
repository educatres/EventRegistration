import { buildMeetingUrl, parseMeetingReference } from './config.js';
import { getMeeting, isMeetingUnavailableError } from './firebase-store.js';
import { clearAllLocalMeetingData, readRecentMeetings, writeRecentMeetings } from './local-meetings.js';

const openForm = document.querySelector('#open-meeting-form');
const recentList = document.querySelector('#recent-meetings');
const clearButton = document.querySelector('#clear-recent');

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
