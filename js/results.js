import { buildMeetingUrl, getMeetingId } from './config.js';
import { claimAdminKey, isMeetingUnavailableError, subscribeMeeting, updateMeetingSettings } from './firebase-store.js';
import { buildSlots, formatSlotKey, groupSlotsByDate } from './calendar.js';
import { buildSlotStatistics, getRecommendedSlots, meetingFromRecord, responsesFromRecord } from './meeting-store.js';
import { renderQr } from './qr.js';
import { getLocalAdminKey, removeLocalMeeting } from './local-meetings.js';

const meetingId = getMeetingId();
const configError = document.querySelector('#config-error');
const app = document.querySelector('#results-app');
const info = document.querySelector('#result-info');
const statsGrid = document.querySelector('#stats-grid');
const participantTable = document.querySelector('#participant-table tbody');
const recommendations = document.querySelector('#recommendations');
const finalPanel = document.querySelector('#final-panel');
const status = document.querySelector('#sync-status');
const qrCode = document.querySelector('#qr-code');
const participantLink = document.querySelector('#participant-link');
const adminForm = document.querySelector('#admin-form');
const adminStatus = document.querySelector('#admin-status');

let meeting;
let responses = [];
let statistics = [];
let adminUnlocked = false;

if (!meetingId) {
  configError.classList.remove('hidden');
} else {
  app.classList.remove('hidden');
  beginSync();
  restoreLocalAdminKey();
}

adminForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = String(new FormData(adminForm).get('admin_key') || '').trim();
  adminStatus.textContent = '正在驗證管理密鑰...';
  try {
    await claimAdminKey(meetingId, key);
    adminUnlocked = true;
    adminStatus.textContent = '管理權限已解鎖；現在可以修改最終時間。';
    renderStats();
  } catch {
    adminUnlocked = false;
    adminStatus.textContent = '密鑰不正確，請確認六位數字後重試。';
  }
});

statsGrid?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-final-slot]');
  if (!button || !adminUnlocked) return;
  status.textContent = '正在更新最終時間...';
  try {
    await updateMeetingSettings(meetingId, {
      selected_final_slot: button.dataset.finalSlot,
      status: 'finalized',
    });
    status.textContent = '最終時間已更新。';
  } catch (error) {
    status.textContent = error?.message || '更新失敗。';
  }
});

async function beginSync() {
  status.textContent = '連線 Firebase...';
  try {
    await subscribeMeeting(meetingId, (record) => {
      meeting = meetingFromRecord(record);
      responses = responsesFromRecord(record);
      statistics = buildSlotStatistics(buildSlots(meeting), responses, meeting.selected_final_slot);
      renderAll();
      status.textContent = `即時同步：${new Date().toLocaleTimeString('zh-TW')}`;
    }, (error) => {
      handleSyncError(error);
    });
  } catch (error) {
    handleSyncError(error);
  }
}

async function restoreLocalAdminKey() {
  try {
    const key = getLocalAdminKey(meetingId);
    if (!key) return;
    adminForm.elements.namedItem('admin_key').value = key;
    await claimAdminKey(meetingId, key);
    adminUnlocked = true;
    adminStatus.textContent = '已使用本瀏覽器保存的密鑰解鎖管理權限。';
    renderStats();
  } catch {
    // 本機記錄可能已過期或被修改，維持唯讀即可。
  }
}

function handleSyncError(error) {
  status.textContent = error?.message || '同步失敗。';
  if (!isMeetingUnavailableError(error)) return;

  removeLocalMeeting(meetingId);
  meeting = undefined;
  responses = [];
  statistics = [];
  adminUnlocked = false;
  info.innerHTML = '<h1>會議已不存在</h1><p>Firebase 資料已刪除或到期，本機會議記錄與草稿也已清除。</p>';
  statsGrid.replaceChildren();
  participantTable.replaceChildren();
  recommendations.replaceChildren();
  finalPanel.innerHTML = '<p class="empty-text">沒有可顯示的 Firebase 資料。</p>';
  participantLink.value = '';
  qrCode.replaceChildren();
  adminForm.elements.namedItem('admin_key').value = '';
  adminForm.querySelector('button[type="submit"]').disabled = true;
  adminStatus.textContent = 'Firebase 會議已不存在，管理功能已停用。';
}

function renderAll() {
  const respondUrl = buildMeetingUrl('./respond.html', meetingId);
  participantLink.value = respondUrl;
  renderQr(qrCode, respondUrl);
  info.innerHTML = `
    <h1>${escapeHtml(meeting.title || '未命名會議')}</h1>
    <dl>
      <div><dt>會議 ID</dt><dd>${escapeHtml(meetingId)}</dd></div>
      <div><dt>日期</dt><dd>${escapeHtml(meeting.start_date)} 至 ${escapeHtml(meeting.end_date)}</dd></div>
      <div><dt>回覆人數</dt><dd>${responses.length}</dd></div>
      <div><dt>自動清除</dt><dd>${new Date(meeting.expires_at).toLocaleString('zh-TW')}</dd></div>
    </dl>`;
  renderStats();
  participantTable.innerHTML = responses.map((response) => `
    <tr><td>${escapeHtml(response.participant_name)}</td><td>${response.availability.length}</td><td>${formatTimestamp(response.submitted_at)}</td><td>${escapeHtml(response.note)}</td></tr>
  `).join('');
  recommendations.innerHTML = getRecommendedSlots(statistics, 3).map((slot, index) => `
    <li><strong>推薦 ${index + 1}</strong><span>${escapeHtml(formatSlotKey(slot.slot_key, meeting.slot_minutes))}</span><em>${slot.available_count}/${slot.total_participants} 人可參加</em></li>
  `).join('');
  renderFinal();
}

function renderStats() {
  if (!meeting) return;
  statsGrid.innerHTML = groupSlotsByDate(statistics).map((group) => `
    <section class="day-card">
      <h3>${group.date} <span>${group.slots[0].weekday}</span></h3>
      <div class="slot-list vertical">${group.slots.map(renderStatSlot).join('')}</div>
    </section>
  `).join('');
}

function renderStatSlot(slot) {
  const names = slot.participant_names.length ? slot.participant_names.join('、') : '無';
  const intensity = slot.total_participants === 0 ? 0 : slot.available_count / slot.total_participants;
  return `
    <article class="stat-slot ${slot.is_all_available ? 'all-available' : ''} ${slot.is_final_slot ? 'final' : ''}" style="--heat:${intensity.toFixed(2)}">
      <div><strong>${slot.start_time}-${slot.end_time}</strong><span>${slot.available_count}/${slot.total_participants} 人，${slot.available_rate}%</span><small>${escapeHtml(names)}</small></div>
      <button class="ghost-btn small-btn" type="button" data-final-slot="${slot.slot_key}" ${adminUnlocked ? '' : 'disabled'}>${slot.is_final_slot ? '已定案' : '設為最終'}</button>
    </article>`;
}

function renderFinal() {
  if (!meeting.selected_final_slot) {
    finalPanel.innerHTML = '<p class="empty-text">尚未設定最終會議時間。</p>';
    return;
  }
  const slot = statistics.find((item) => item.slot_key === meeting.selected_final_slot);
  const unavailable = responses.filter((response) => !response.availability.includes(meeting.selected_final_slot)).map((response) => response.participant_name);
  finalPanel.innerHTML = `
    <h3>${escapeHtml(formatSlotKey(meeting.selected_final_slot, meeting.slot_minutes))}</h3>
    <p>${slot?.available_count || 0}/${responses.length} 人可參加</p>
    <textarea readonly rows="3">會議時間已確定為 ${formatSlotKey(meeting.selected_final_slot, meeting.slot_minutes)}。</textarea>
    <p class="muted-text">無法參加：${escapeHtml(unavailable.join('、') || '無')}</p>`;
}

function formatTimestamp(value) {
  return value ? new Date(value).toLocaleString('zh-TW') : '-';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
