import { buildEventUrl, eventAvailability, formatDateTime, fromDateTimeLocal, getEventId, toDateTimeLocal } from './config.js';
import { renderDescription } from './content.js';
import { claimAdminKey, closeEvent, deleteEvent, isEventUnavailableError, subscribeEventPublic, subscribeRegistrations, updateEventSchedule } from './firebase-store.js';
import { getLocalAdminKey, removeLocalEvent } from './local-events.js';
import { renderQr } from './qr.js';

const eventId = getEventId();
const app = document.querySelector('#manage-app');
const configError = document.querySelector('#config-error');
const summary = document.querySelector('#event-summary');
const syncStatus = document.querySelector('#sync-status');
const adminForm = document.querySelector('#admin-form');
const adminStatus = document.querySelector('#admin-status');
const adminContent = document.querySelector('#admin-content');
const scheduleForm = document.querySelector('#schedule-form');
const table = document.querySelector('#registration-table');
const deletionDate = document.querySelector('#deletion-date');
const deletionCountdown = document.querySelector('#deletion-countdown');
const deleteEventDialog = document.querySelector('#delete-event-dialog');
const deleteEventId = document.querySelector('#delete-event-id');
const deleteEventConfirmation = document.querySelector('#delete-event-confirmation');
const deleteEventConfirm = document.querySelector('#delete-event-confirm');
const deleteEventStatus = document.querySelector('#delete-event-status');
const participantSharePanel = document.querySelector('#participant-share-panel');
const participantLink = document.querySelector('#participant-link');
const participantQrCode = document.querySelector('#participant-qr-code');
const participantLinkStatus = document.querySelector('#participant-link-status');
let eventData;
let registrations = [];
let adminUnlocked = false;
let unsubscribeRegistrations;

if (!eventId) {
  configError.classList.remove('hidden');
} else {
  app.classList.remove('hidden');
  beginSync();
  setInterval(updateDeletionCountdown, 1000);
}

adminForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await unlock(String(new FormData(adminForm).get('admin_key') || '').trim());
});

scheduleForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(scheduleForm);
  const startAt = fromDateTimeLocal(data.get('registration_start_at'));
  const endAt = fromDateTimeLocal(data.get('registration_end_at'));
  const scheduleStatus = document.querySelector('#schedule-status');
  if (startAt >= endAt) {
    scheduleStatus.textContent = '結束時間必須晚於開始時間。';
    return;
  }
  if (endAt > Number(eventData.expires_at)) {
    scheduleStatus.textContent = '結束時間不可晚於四週資料刪除時間。';
    return;
  }
  scheduleStatus.textContent = '正在儲存...';
  try {
    await updateEventSchedule(eventId, startAt, endAt);
    scheduleStatus.textContent = '報名起訖時間已更新。';
  } catch (error) {
    scheduleStatus.textContent = error?.message || '儲存失敗。';
  }
});

document.querySelector('#close-registration')?.addEventListener('click', async () => {
  if (!window.confirm('確定關閉報名？關閉後不可重新開啟。')) return;
  const closeStatus = document.querySelector('#close-status');
  closeStatus.textContent = '正在關閉...';
  try {
    await closeEvent(eventId);
    closeStatus.textContent = '報名已關閉，既有資料仍可下載。';
  } catch (error) {
    closeStatus.textContent = error?.message || '關閉失敗。';
  }
});

document.querySelector('#download-csv')?.addEventListener('click', downloadCsv);

document.querySelector('#show-participant-link')?.addEventListener('click', showParticipantLink);
document.querySelector('#close-participant-link')?.addEventListener('click', () => participantSharePanel.classList.add('hidden'));
document.querySelector('#copy-participant-link')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(participantLink.value);
    participantLinkStatus.textContent = '報名網址已複製。';
  } catch {
    participantLink.select();
    participantLinkStatus.textContent = '請手動複製報名網址。';
  }
});

document.querySelector('#delete-event')?.addEventListener('click', () => {
  deleteEventId.textContent = eventId;
  deleteEventConfirmation.value = '';
  deleteEventConfirm.disabled = true;
  deleteEventStatus.textContent = '';
  deleteEventDialog.showModal();
  deleteEventConfirmation.focus();
});

document.querySelector('#delete-event-cancel')?.addEventListener('click', () => deleteEventDialog.close());
deleteEventDialog?.addEventListener('click', (event) => {
  if (event.target === deleteEventDialog) deleteEventDialog.close();
});

deleteEventConfirmation?.addEventListener('input', () => {
  deleteEventConfirm.disabled = deleteEventConfirmation.value.trim() !== eventId;
});

deleteEventConfirm?.addEventListener('click', async () => {
  if (deleteEventConfirmation.value.trim() !== eventId) return;
  deleteEventConfirm.disabled = true;
  deleteEventStatus.textContent = '正在永久刪除活動與所有報名資料...';
  try {
    unsubscribeRegistrations?.();
    await deleteEvent(eventId);
    removeLocalEvent(eventId);
    window.location.replace('./index.html');
  } catch (error) {
    deleteEventStatus.textContent = error?.message || '刪除失敗，請稍後再試。';
    deleteEventConfirm.disabled = deleteEventConfirmation.value.trim() !== eventId;
  }
});

async function beginSync() {
  try {
    await subscribeEventPublic(eventId, (data) => {
      eventData = data;
      renderSummary();
      fillScheduleForm();
      syncStatus.textContent = `已同步 ${new Date().toLocaleTimeString('zh-TW')}`;
      if (!adminUnlocked) restoreLocalKey();
    }, handleError);
  } catch (error) {
    handleError(error);
  }
}

async function restoreLocalKey() {
  const key = getLocalAdminKey(eventId);
  if (!key) return;
  adminForm.elements.namedItem('admin_key').value = key;
  await unlock(key, true);
}

async function unlock(key, restored = false) {
  adminStatus.textContent = '正在驗證管理密鑰...';
  adminForm.querySelector('button').disabled = true;
  try {
    await claimAdminKey(eventId, key);
    adminUnlocked = true;
    adminContent.classList.remove('hidden');
    updateDeletionCountdown();
    adminStatus.textContent = restored ? '已使用本瀏覽器保存的密鑰解鎖。' : '管理權限已解鎖。';
    unsubscribeRegistrations?.();
    unsubscribeRegistrations = await subscribeRegistrations(eventId, (data) => {
      registrations = data;
      renderTable();
    }, (error) => { adminStatus.textContent = error?.message || '無法載入報名資料。'; });
  } catch {
    adminUnlocked = false;
    adminContent.classList.add('hidden');
    adminStatus.textContent = '密鑰不正確，請確認六位數字後重試。';
  } finally {
    adminForm.querySelector('button').disabled = false;
  }
}

function renderSummary() {
  const availability = eventAvailability(eventData);
  summary.innerHTML = `<div class="section-heading"><p class="eyebrow">${escapeHtml(eventId)}</p><h2>${escapeHtml(eventData.title)}</h2></div><dl><div><dt>活動聯絡人</dt><dd>${escapeHtml(eventData.organizer_name || '未填寫')}</dd></div><div><dt>報名狀態</dt><dd><span class="availability-badge ${availability.state}">${availability.label}</span></dd></div><div><dt>目前人數</dt><dd>${eventData.registration_count}/${eventData.capacity}</dd></div><div><dt>報名期間</dt><dd>${formatDateTime(eventData.registration_start_at)} 至 ${formatDateTime(eventData.registration_end_at)}</dd></div><div><dt>自動刪除</dt><dd>${formatDateTime(eventData.expires_at)}</dd></div></dl><div data-description></div>`;
  renderDescription(summary.querySelector('[data-description]'), eventData.description_content, eventData.description_format);
  const closeButton = document.querySelector('#close-registration');
  if (closeButton) closeButton.disabled = eventData.status === 'closed';
}

function updateDeletionCountdown() {
  if (!adminUnlocked || !eventData) return;
  const expiresAt = Number(eventData.expires_at);
  deletionDate.textContent = `預計刪除：${formatDateTime(expiresAt)}`;
  const remaining = Math.max(0, expiresAt - Date.now());
  if (remaining <= 0) {
    deletionCountdown.textContent = '已到期，等待系統清除';
    deletionCountdown.classList.add('expired');
    return;
  }
  deletionCountdown.classList.remove('expired');
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  deletionCountdown.textContent = `${days} 天 ${pad(hours)} 時 ${pad(minutes)} 分 ${pad(seconds)} 秒`;
}

function fillScheduleForm() {
  if (!eventData || document.activeElement?.closest('#schedule-form')) return;
  scheduleForm.elements.namedItem('registration_start_at').value = toDateTimeLocal(eventData.registration_start_at);
  scheduleForm.elements.namedItem('registration_end_at').value = toDateTimeLocal(eventData.registration_end_at);
}

function renderTable() {
  const fields = customFields();
  table.querySelector('thead').innerHTML = `<tr><th>報名時間</th><th>姓名</th><th>Email</th><th>電話</th>${fields.map(([, field]) => `<th>${escapeHtml(field.label)}</th>`).join('')}</tr>`;
  table.querySelector('tbody').innerHTML = registrations.length ? registrations.map((registration) => `<tr><td>${formatDateTime(registration.submitted_at)}</td><td>${escapeHtml(registration.name)}</td><td>${escapeHtml(registration.email)}</td><td>${escapeHtml(registration.phone)}</td>${fields.map(([fieldId]) => `<td>${escapeHtml(registration.custom_answers?.[fieldId] || '')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${4 + fields.length}" class="empty-text">目前沒有報名資料。</td></tr>`;
  document.querySelector('#registration-count').textContent = `共 ${registrations.length} 筆，名額上限 ${eventData.capacity} 人。`;
}

function downloadCsv() {
  const fields = customFields();
  const rows = [
    ['報名時間', '姓名', 'Email', '電話', ...fields.map(([, field]) => field.label)],
    ...registrations.map((registration) => [formatDateTime(registration.submitted_at), registration.name, registration.email, registration.phone, ...fields.map(([fieldId]) => registration.custom_answers?.[fieldId] || '')]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(eventData.title)}-registrations.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function showParticipantLink() {
  const url = buildEventUrl('./respond.html', eventId);
  participantLink.value = url;
  participantLinkStatus.textContent = '';
  renderQr(participantQrCode, url);
  participantSharePanel.classList.remove('hidden');
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFilename(value) { return String(value || 'event').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80); }
function pad(value) { return String(value).padStart(2, '0'); }
function customFields() { return Object.entries(eventData?.custom_fields || {}).sort(([, a], [, b]) => Number(a.order) - Number(b.order)); }

function handleError(error) {
  syncStatus.textContent = error?.message || '同步失敗';
  if (!isEventUnavailableError(error)) return;
  removeLocalEvent(eventId);
  summary.innerHTML = '<h2>活動已不存在</h2><p>Firebase 資料已刪除或四週期限已到。</p>';
  adminForm.querySelector('button').disabled = true;
  adminContent.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
