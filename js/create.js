import { buildEventUrl, formatDateTime, fromDateTimeLocal, generateAdminKey, generateEventId, generateFieldId, toDateTimeLocal } from './config.js';
import { renderDescription } from './content.js';
import { createEvent, ensureAuth } from './firebase-store.js';
import { saveRecentEvent } from './local-events.js';
import { renderQr } from './qr.js';

const form = document.querySelector('#event-form');
const fieldList = document.querySelector('#custom-field-list');
const preview = document.querySelector('#event-preview');
const resultPanel = document.querySelector('#created-panel');
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
  fieldList.replaceChildren();
  setDefaults();
  renderPreview();
}, 0));

document.querySelector('#add-field')?.addEventListener('click', () => {
  if (fieldList.children.length >= 20) {
    createStatus.textContent = '自訂欄位最多 20 個。';
    return;
  }
  addFieldRow();
});

fieldList?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-field]');
  if (!button) return;
  button.closest('[data-field-row]')?.remove();
  renderPreview();
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = readForm();
  if (values.registration_start_at >= values.registration_end_at) {
    createStatus.textContent = '報名結束時間必須晚於開始時間。';
    return;
  }

  const eventId = generateEventId();
  const adminKey = generateAdminKey();
  createStatus.textContent = '正在 Firebase 建立報名表單...';
  form.querySelector('button[type="submit"]').disabled = true;

  try {
    const created = await createEvent(eventId, adminKey, values);
    const respondUrl = buildEventUrl('./respond.html', eventId);
    const manageUrl = buildEventUrl('./results.html', eventId);
    document.querySelector('#event-id-output').value = eventId;
    document.querySelector('#admin-key-output').value = adminKey;
    document.querySelector('#expiry-output').value = formatDateTime(created.expires_at);
    document.querySelector('#respond-link').value = respondUrl;
    document.querySelector('#manage-link').value = manageUrl;
    renderQr(document.querySelector('#qr-code'), respondUrl);
    saveRecentEvent({ eventId, title: values.title, adminKey, expiresAt: created.expires_at });
    resultPanel.classList.remove('hidden');
    createStatus.textContent = '表單已建立。請妥善保存管理連結與六位數密鑰。';
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    createStatus.textContent = firebaseErrorMessage(error, '建立失敗，請稍後再試。');
  } finally {
    form.querySelector('button[type="submit"]').disabled = false;
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
  const now = Date.now();
  const rounded = Math.ceil(now / 1800000) * 1800000;
  form.elements.namedItem('registration_start_at').value = toDateTimeLocal(rounded);
  form.elements.namedItem('registration_end_at').value = toDateTimeLocal(rounded + 7 * 24 * 60 * 60 * 1000);
  form.elements.namedItem('capacity').value = '50';
}

function addFieldRow(value = '') {
  const row = document.createElement('div');
  row.className = 'custom-field-row';
  row.dataset.fieldRow = '';
  row.innerHTML = `<label><span>欄位名稱</span><input data-field-label maxlength="60" value="${escapeHtml(value)}" placeholder="例如：飲食需求" /></label><button class="ghost-btn small-btn" type="button" data-remove-field>移除</button>`;
  fieldList.append(row);
  row.querySelector('input').focus();
}

function readForm() {
  const data = new FormData(form);
  const customFields = {};
  [...fieldList.querySelectorAll('[data-field-label]')].map((input) => clean(input.value)).filter(Boolean).forEach((label, order) => {
    customFields[generateFieldId()] = { label, order };
  });
  return {
    title: clean(data.get('event_title')),
    organizer_name: clean(data.get('organizer_name')),
    description_content: clean(data.get('description_content')),
    description_format: data.get('description_format') === 'html' ? 'html' : 'text',
    registration_start_at: fromDateTimeLocal(data.get('registration_start_at')),
    registration_end_at: fromDateTimeLocal(data.get('registration_end_at')),
    capacity: Number(data.get('capacity')),
    custom_fields: customFields,
  };
}

function renderPreview() {
  const data = new FormData(form);
  const title = clean(data.get('event_title')) || '活動名稱';
  const organizer = clean(data.get('organizer_name')) || '未填寫';
  const labels = [...fieldList.querySelectorAll('[data-field-label]')].map((input) => clean(input.value)).filter(Boolean);
  preview.innerHTML = `<h2>${escapeHtml(title)}</h2><dl><div><dt>主辦人</dt><dd>${escapeHtml(organizer)}</dd></div><div><dt>人數上限</dt><dd>${escapeHtml(data.get('capacity') || '50')} 人</dd></div></dl><div data-description></div><h3>報名欄位</h3><ul class="field-list"><li>姓名（必填）</li><li>Email（必填）</li><li>電話（選填）</li>${labels.map((label) => `<li>${escapeHtml(label)}（選填）</li>`).join('')}</ul>`;
  renderDescription(preview.querySelector('[data-description]'), clean(data.get('description_content')), data.get('description_format'));
}

function firebaseErrorMessage(error, fallback) {
  if (error?.code === 'auth/admin-restricted-operation') return 'Firebase 匿名驗證尚未啟用。';
  if (String(error?.code).toLowerCase().includes('permission')) return 'Firebase 安全規則拒絕了這次操作。';
  return error?.message || fallback;
}

function clean(value) { return String(value || '').trim(); }
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
