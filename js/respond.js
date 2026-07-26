import { getMeetingId } from './config.js';
import { isMeetingUnavailableError, submitResponse, subscribeMeetingSettings } from './firebase-store.js';
import { buildSlots, groupSlotsByDate, isPastDeadline, summarizeAvailability } from './calendar.js';
import { readMeetingDraft, removeLocalMeeting, saveMeetingDraft } from './local-meetings.js';

const meetingId = getMeetingId();
const configError = document.querySelector('#config-error');
const app = document.querySelector('#respond-app');
const info = document.querySelector('#meeting-info');
const form = document.querySelector('#response-form');
const slotGrid = document.querySelector('#slot-grid');
const summary = document.querySelector('#selection-summary');
const status = document.querySelector('#response-status');

let meeting;
let slots = [];
let selected = new Set();
let initialized = false;

if (!meetingId) {
  configError.classList.remove('hidden');
} else {
  app.classList.remove('hidden');
  loadMeeting();
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!meeting || isPastDeadline(meeting.response_deadline)) {
    status.textContent = '已超過回覆截止時間，無法送出。';
    return;
  }

  const data = new FormData(form);
  const participantName = clean(data.get('participant_name'));
  const note = clean(data.get('note'));
  if (!participantName) return;
  status.textContent = '正在送出回覆...';

  try {
    await submitResponse(meetingId, participantName, Array.from(selected), note);
    saveMeetingDraft(meetingId, {
      participantName, note, availability: Array.from(selected),
    });
    status.textContent = `已儲存 ${participantName} 的最新回覆，共 ${selected.size} 個時段。若同名再次送出，會覆蓋這筆資料。`;
  } catch (error) {
    status.textContent = error?.message || '送出失敗，請稍後再試。';
  }
});

document.querySelectorAll('[data-quick]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.quick;
    if (action === 'all') selected = new Set(slots.map((slot) => slot.key));
    if (action === 'clear') selected.clear();
    if (action === 'weekdays') selected = new Set(slots.filter((slot) => {
      const day = new Date(`${slot.date}T00:00:00`).getDay();
      return day !== 0 && day !== 6;
    }).map((slot) => slot.key));
    renderSlots();
  });
});

async function loadMeeting() {
  status.textContent = '正在從 Firebase 讀取會議...';
  try {
    await subscribeMeetingSettings(meetingId, (settings) => {
      meeting = settings;
      slots = buildSlots(meeting);
      if (!initialized) restoreDraft();
      initialized = true;
      renderInfo();
      renderSlots();
      status.textContent = '已與 Firebase 同步；填寫不需要管理密鑰。';
    }, handleMeetingError);
  } catch (error) {
    handleMeetingError(error);
  }
}

function restoreDraft() {
  const draft = readMeetingDraft(meetingId);
  if (draft.participantName) form.elements.namedItem('participant_name').value = draft.participantName;
  if (draft.note) form.elements.namedItem('note').value = draft.note;
  selected = new Set((draft.availability || []).filter((key) => slots.some((slot) => slot.key === key)));
}

function handleMeetingError(error) {
  status.textContent = error?.message || '無法載入會議。';
  form.querySelector('button[type="submit"]').disabled = true;
  if (!isMeetingUnavailableError(error)) return;

  removeLocalMeeting(meetingId);
  meeting = undefined;
  slots = [];
  selected.clear();
  info.innerHTML = '<h1>會議已不存在</h1><p>Firebase 資料已刪除或到期，本機草稿與會議記錄也已清除。</p>';
  slotGrid.replaceChildren();
  summary.replaceChildren();
}

function renderInfo() {
  info.innerHTML = `
    <h1>${escapeHtml(meeting.title || '未命名會議')}</h1>
    <dl>
      <div><dt>發起人</dt><dd>${escapeHtml(meeting.organizer_name || '未填')}</dd></div>
      <div><dt>日期</dt><dd>${escapeHtml(meeting.start_date)} 至 ${escapeHtml(meeting.end_date)}</dd></div>
      <div><dt>截止</dt><dd>${escapeHtml(meeting.response_deadline || '未設定')}</dd></div>
      <div><dt>資料清除</dt><dd>${new Date(meeting.expires_at).toLocaleString('zh-TW')}</dd></div>
    </dl>
    ${meeting.description ? `<p>${escapeHtml(meeting.description)}</p>` : ''}
  `;
  form.querySelector('button[type="submit"]').disabled = meeting.status !== 'open'
    || isPastDeadline(meeting.response_deadline);
}

function renderSlots() {
  slotGrid.innerHTML = groupSlotsByDate(slots).map((group) => `
    <section class="day-card">
      <h3>${group.date} <span>${group.slots[0].weekday}</span></h3>
      <div class="slot-list">
        ${group.slots.map((slot) => `<button class="slot-button ${selected.has(slot.key) ? 'selected' : ''}" type="button" data-slot="${slot.key}">${slot.start_time}-${slot.end_time}</button>`).join('')}
      </div>
    </section>
  `).join('');
  slotGrid.querySelectorAll('[data-slot]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.slot;
    if (selected.has(key)) selected.delete(key); else selected.add(key);
    renderSlots();
  }));
  const data = summarizeAvailability(Array.from(selected), slots);
  summary.innerHTML = `<span>已選日期：${data.dateCount}</span><span>已選時段：${data.slotCount}</span><span>最早：${data.firstSlot || '-'}</span><span>最晚：${data.lastSlot || '-'}</span>`;
}

function clean(value) { return String(value || '').trim(); }
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
