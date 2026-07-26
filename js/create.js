import { buildMeetingUrl, generateAdminKey, generateMeetingId } from './config.js';
import { createMeeting, ensureAuth } from './firebase-store.js';
import { buildSlots, groupSlotsByDate } from './calendar.js';
import { renderQr } from './qr.js';

const form = document.querySelector('#meeting-form');
const preview = document.querySelector('#slot-preview');
const resultPanel = document.querySelector('#created-panel');
const respondLink = document.querySelector('#respond-link');
const resultsLink = document.querySelector('#results-link');
const meetingIdOutput = document.querySelector('#meeting-id-output');
const adminKeyOutput = document.querySelector('#admin-key-output');
const expiryOutput = document.querySelector('#expiry-output');
const qrCode = document.querySelector('#qr-code');
const createStatus = document.querySelector('#create-status');

initialize();

async function initialize() {
  setDefaults();
  renderPreview();
  try {
    await ensureAuth();
  } catch {
    createStatus.textContent = '無法連線 Firebase，請重新整理後再試。';
  }
}

form?.addEventListener('input', renderPreview);
form?.addEventListener('reset', () => setTimeout(() => {
  setDefaults();
  renderPreview();
}, 0));

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const meetingId = generateMeetingId();
  const adminKey = generateAdminKey();
  const meeting = readMeetingForm();
  createStatus.textContent = '正在 Firebase 建立調查...';

  try {
    const created = await createMeeting(meetingId, adminKey, meeting);
    const respondUrl = buildMeetingUrl('./respond.html', meetingId);
    const resultsUrl = buildMeetingUrl('./results.html', meetingId);
    meetingIdOutput.value = meetingId;
    adminKeyOutput.value = adminKey;
    expiryOutput.value = new Date(created.expires_at).toLocaleString('zh-TW');
    respondLink.value = respondUrl;
    resultsLink.value = resultsUrl;
    renderQr(qrCode, respondUrl);
    resultPanel.classList.remove('hidden');
    saveRecentMeeting({ meetingId, title: meeting.meeting_title, adminKey, expiresAt: created.expires_at });
    createStatus.textContent = '調查已建立並開始即時同步。請另外保存六位數管理密鑰。';
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    createStatus.textContent = firebaseErrorMessage(error, '建立失敗，請稍後再試。');
  }
});

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.querySelector(button.dataset.copyTarget);
    if (!target?.value) return;
    await navigator.clipboard.writeText(target.value);
    createStatus.textContent = '已複製。';
  });
});

function setDefaults() {
  form.elements.namedItem('start_time').value = '10:00';
  form.elements.namedItem('end_time').value = '17:00';
  form.elements.namedItem('slot_minutes').value = '60';
}

function renderPreview() {
  const groups = groupSlotsByDate(buildSlots(readMeetingForm()));
  preview.innerHTML = groups.length ? groups.map((group) => `
    <article class="day-card">
      <h3>${group.date} <span>${group.slots[0].weekday}</span></h3>
      <div class="slot-list">
        ${group.slots.map((slot) => `<span class="slot-chip">${slot.start_time}-${slot.end_time}</span>`).join('')}
      </div>
    </article>
  `).join('') : '<p class="empty-text">請選擇有效日期區間。</p>';
}

function readMeetingForm() {
  const data = new FormData(form);
  return {
    meeting_title: clean(data.get('meeting_title')),
    meeting_description: clean(data.get('meeting_description')),
    organizer_name: clean(data.get('organizer_name')),
    start_date: clean(data.get('start_date')),
    end_date: clean(data.get('end_date')),
    start_time: clean(data.get('start_time')) || '10:00',
    end_time: clean(data.get('end_time')) || '17:00',
    slot_minutes: clean(data.get('slot_minutes')) || '60',
    include_saturday: data.get('include_saturday') === 'on',
    include_sunday: data.get('include_sunday') === 'on',
    response_deadline: clean(data.get('response_deadline')),
  };
}

function saveRecentMeeting(entry) {
  let entries = [];
  try {
    entries = JSON.parse(localStorage.getItem('scheduleAMeeting.recent.v1') || '[]');
  } catch {
    entries = [];
  }
  localStorage.setItem('scheduleAMeeting.recent.v1', JSON.stringify([
    entry,
    ...entries.filter((item) => item.meetingId !== entry.meetingId),
  ].slice(0, 20)));
}

function firebaseErrorMessage(error, fallback) {
  if (error?.code === 'auth/admin-restricted-operation') return 'Firebase 匿名驗證尚未啟用。';
  if (error?.code === 'PERMISSION_DENIED') return 'Firebase 安全規則拒絕了這次操作。';
  return error?.message || fallback;
}

function clean(value) {
  return String(value || '').trim();
}
