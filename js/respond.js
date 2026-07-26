import { eventAvailability, formatDateTime, getEventId } from './config.js';
import { renderDescription } from './content.js';
import { isEventUnavailableError, submitRegistration, subscribeEventPublic } from './firebase-store.js';

const eventId = getEventId();
const configError = document.querySelector('#config-error');
const app = document.querySelector('#respond-app');
const info = document.querySelector('#event-info');
const form = document.querySelector('#registration-form');
const customFieldsContainer = document.querySelector('#custom-answer-fields');
const status = document.querySelector('#registration-status');
let eventData;

if (!eventId) {
  configError.classList.remove('hidden');
} else {
  app.classList.remove('hidden');
  beginSync();
  setInterval(renderState, 30000);
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const availability = eventAvailability(eventData);
  if (!availability.open) {
    status.textContent = availability.label;
    renderState();
    return;
  }

  const data = new FormData(form);
  const customAnswers = {};
  customFields().forEach(([fieldId]) => {
    customAnswers[fieldId] = clean(data.get(`custom_${fieldId}`));
  });
  const values = {
    name: clean(data.get('name')),
    email: clean(data.get('email')),
    phone: clean(data.get('phone')),
    custom_answers: customAnswers,
  };

  status.textContent = '正在送出報名資料...';
  form.querySelector('button[type="submit"]').disabled = true;
  try {
    await submitRegistration(eventId, eventData, values);
    form.reset();
    status.textContent = '報名成功！資料已安全送達主辦人。';
  } catch (error) {
    status.textContent = String(error?.code).toLowerCase().includes('permission')
      ? '無法送出：可能已額滿、報名時間已結束，或這個 Email 已報名。'
      : (error?.message || '送出失敗，請稍後再試。');
  } finally {
    renderState();
  }
});

async function beginSync() {
  status.textContent = '正在載入活動...';
  try {
    await subscribeEventPublic(eventId, (data) => {
      const firstRender = !eventData;
      eventData = data;
      renderInfo();
      if (firstRender) renderCustomFields();
      renderState();
    }, handleError);
  } catch (error) {
    handleError(error);
  }
}

function renderInfo() {
  info.innerHTML = `<div class="section-heading"><p class="eyebrow">Event registration</p><h1>${escapeHtml(eventData.title)}</h1></div><dl><div><dt>主辦人</dt><dd>${escapeHtml(eventData.organizer_name || '未填寫')}</dd></div><div><dt>報名期間</dt><dd>${formatDateTime(eventData.registration_start_at)} 至 ${formatDateTime(eventData.registration_end_at)}</dd></div><div><dt>名額</dt><dd>${eventData.registration_count}/${eventData.capacity}</dd></div><div><dt>資料刪除</dt><dd>${formatDateTime(eventData.expires_at)}</dd></div></dl><div data-description></div><p class="availability-badge" data-availability></p>`;
  renderDescription(info.querySelector('[data-description]'), eventData.description_content, eventData.description_format);
}

function renderCustomFields() {
  customFieldsContainer.innerHTML = customFields().map(([fieldId, field]) => `<label><span>${escapeHtml(field.label)}（選填）</span><input name="custom_${fieldId}" maxlength="500" /></label>`).join('');
}

function renderState() {
  if (!eventData) return;
  const availability = eventAvailability(eventData);
  info.querySelector('[data-availability]').textContent = availability.label;
  info.querySelector('[data-availability]').className = `availability-badge ${availability.state}`;
  form.querySelectorAll('input, button[type="submit"]').forEach((control) => { control.disabled = !availability.open; });
  if (!status.textContent || status.textContent.startsWith('正在載入')) status.textContent = availability.open ? '請填寫資料完成報名。' : availability.label;
}

function customFields() {
  return Object.entries(eventData?.custom_fields || {}).sort(([, a], [, b]) => Number(a.order) - Number(b.order));
}

function handleError(error) {
  status.textContent = error?.message || '無法載入活動。';
  form.querySelectorAll('input, button').forEach((control) => { control.disabled = true; });
  if (isEventUnavailableError(error)) info.innerHTML = '<h1>活動已不存在</h1><p>Firebase 資料已刪除或四週期限已到。</p>';
}

function clean(value) { return String(value || '').trim(); }
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
