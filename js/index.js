import { buildMeetingUrl, parseMeetingReference } from './config.js';

const openForm = document.querySelector('#open-meeting-form');
const recentList = document.querySelector('#recent-meetings');
const clearButton = document.querySelector('#clear-recent');

renderRecentMeetings();

openForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const meetingId = parseMeetingReference(new FormData(openForm).get('meeting_reference'));
  if (!meetingId) return;
  window.location.href = buildMeetingUrl('./results.html', meetingId);
});

clearButton?.addEventListener('click', () => {
  localStorage.removeItem('scheduleAMeeting.recent.v1');
  renderRecentMeetings();
});

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

function readRecentMeetings() {
  try {
    return JSON.parse(localStorage.getItem('scheduleAMeeting.recent.v1') || '[]');
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}
