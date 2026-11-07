const API = '/api';
const categoryNames = { computer_network: 'คอมพิวเตอร์และเครือข่าย', air_conditioning: 'เครื่องปรับอากาศ', presentation: 'อุปกรณ์นำเสนอ', general: 'อุปกรณ์ทั่วไป' };
const categoryIcons = { computer_network: '⌘', air_conditioning: '❋', presentation: '▱', general: '⚙' };
const statusNames = { pending: 'รอมอบหมาย', assigned: 'รับงานแล้ว', in_progress: 'กำลังซ่อม', completed: 'เสร็จแล้ว' };
let requests = [];
let currentFilter = 'all';
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateText = (date) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const requestCode = (id) => `FF-${String(id).padStart(4, '0')}`;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'เชื่อมต่อระบบไม่สำเร็จ');
  return body;
}

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  $('#breadcrumb').textContent = { dashboard: 'ภาพรวม', request: 'แจ้งซ่อมใหม่', tickets: 'รายการแจ้งซ่อม' }[name];
  if (name === 'tickets') loadRequests();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function statusBadge(status) { return `<span class="status-badge status-${esc(status)}">${esc(statusNames[status] || status)}</span>`; }

function renderDashboard() {
  const total = requests.length;
  $('#stat-total').textContent = total;
  $('#stat-pending').textContent = requests.filter((item) => item.status === 'pending').length;
  $('#stat-progress').textContent = requests.filter((item) => ['assigned', 'in_progress'].includes(item.status)).length;
  $('#stat-completed').textContent = requests.filter((item) => item.status === 'completed').length;
  const recent = [...requests].slice(0, 5);
  $('#recent-list').innerHTML = recent.length ? recent.map((item) => `
    <div class="recent-item"><span class="ticket-symbol">${categoryIcons[item.category] || '⚙'}</span><div><div class="recent-title">${esc(item.title)}</div><div class="recent-meta">${esc(requestCode(item.id))}<span>•</span>${esc(item.location)}<span>•</span>${dateText(item.createdAt)}</div></div>${statusBadge(item.status)}</div>
  `).join('') : '<div class="empty-state"><b>ยังไม่มีคำขอแจ้งซ่อม</b>เริ่มต้นด้วยการแจ้งปัญหาใหม่</div>';
  $('#category-list').innerHTML = Object.entries(categoryNames).map(([key, name]) => {
    const count = requests.filter((item) => item.category === key).length;
    return `<div class="category-item"><span class="category-icon">${categoryIcons[key]}</span><div class="category-info"><b>${name}</b><small>${key === 'computer_network' ? 'คอมพิวเตอร์ / อินเทอร์เน็ต' : key === 'air_conditioning' ? 'แอร์และระบบทำความเย็น' : key === 'presentation' ? 'โปรเจกเตอร์ / เครื่องเสียง' : 'อุปกรณ์และสิ่งอำนวยความสะดวก'}</small></div><span class="category-value">${count}</span></div>`;
  }).join('');
}

function ticketCard(item) {
  const controls = item.status !== 'completed' ? `
    <div class="ticket-controls">
      <label class="control-field">มอบหมายช่าง<select data-assign="${item.id}" ${item.status === 'in_progress' ? 'disabled' : ''}><option value="">เลือกช่าง</option>${['ช่างคอมพิวเตอร์', 'ช่างระบบเครือข่าย', 'ช่างอาคาร'].map((name) => `<option value="${esc(name)}" ${item.technician === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
      <button class="control-button subtle" data-action="assign" data-id="${item.id}" ${item.status === 'in_progress' ? 'disabled' : ''}>บันทึกผู้รับงาน</button>
      ${item.technician ? `<label class="control-field">อัปเดตสถานะ<select data-status="${item.id}"><option value="assigned" ${item.status === 'assigned' ? 'selected' : ''}>รับงานแล้ว</option><option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>กำลังซ่อม</option><option value="completed">เสร็จแล้ว</option></select></label>${item.status !== 'completed' ? `<input aria-label="ผลการซ่อม" data-resolution="${item.id}" placeholder="ผลการซ่อม (ต้องกรอกเมื่อปิดงาน)" value="${esc(item.resolution || '')}"><button class="control-button" data-action="status" data-id="${item.id}">บันทึกสถานะ</button>` : ''}` : ''}
    </div>` : `<div class="ticket-controls"><span class="control-field">ช่างผู้รับผิดชอบ <b>${esc(item.technician || '-')}</b></span><span class="control-field">ผลการซ่อม <b>${esc(item.resolution || '-')}</b></span>${item.rating ? `<span class="control-field">คะแนน <b class="rating-stars">${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}</b></span>` : `<label class="control-field">ประเมินงาน<select data-rating="${item.id}"><option value="">เลือกคะแนน</option><option value="5">5 - ดีมาก</option><option value="4">4 - ดี</option><option value="3">3 - ปานกลาง</option><option value="2">2 - ควรปรับปรุง</option><option value="1">1 - ควรปรับปรุงมาก</option></select></label><button class="control-button" data-action="rate" data-id="${item.id}">ส่งคะแนน</button>`}</div>`;
  return `<article class="ticket-card"><div class="ticket-main"><span class="ticket-symbol">${categoryIcons[item.category] || '⚙'}</span><div class="ticket-content"><div class="ticket-heading"><h3>${esc(item.title)}</h3><span class="ticket-id">${esc(requestCode(item.id))}</span>${statusBadge(item.status)}</div><div class="ticket-meta"><span>${esc(categoryNames[item.category] || item.category)}</span><span>•</span><span>${esc(item.location)}</span><span>•</span><span>ผู้แจ้ง ${esc(item.reporterName)}</span><span>•</span><span>${dateText(item.createdAt)}</span>${item.technician ? `<span>•</span><span>ช่าง ${esc(item.technician)}</span>` : ''}</div><p class="ticket-description">${esc(item.description)}</p>${item.photoUrl ? `<a href="${esc(item.photoUrl)}" target="_blank" rel="noopener"><img class="ticket-photo" src="${esc(item.photoUrl)}" alt="รูปประกอบคำขอ ${esc(requestCode(item.id))}"></a>` : ''}</div></div>${controls}</article>`;
}

function renderTickets() {
  const counts = { all: requests.length, pending: 0, assigned: 0, progress: 0, completed: 0 };
  for (const item of requests) {
    if (item.status === 'pending') counts.pending++;
    if (item.status === 'assigned') counts.assigned++;
    if (item.status === 'in_progress') counts.progress++;
    if (item.status === 'completed') counts.completed++;
  }
  $('#count-all').textContent = counts.all;
  $('#count-pending').textContent = counts.pending;
  $('#count-assigned').textContent = counts.assigned;
  $('#count-progress').textContent = counts.progress;
  $('#count-completed').textContent = counts.completed;
  const visible = currentFilter === 'all' ? requests : requests.filter((item) => item.status === currentFilter);
  $('#ticket-list').innerHTML = visible.length ? visible.map(ticketCard).join('') : '<div class="empty-state"><b>ไม่พบรายการในหมวดนี้</b>คำขอแจ้งซ่อมจะแสดงที่นี่เมื่อมีรายการ</div>';
}

async function loadRequests() {
  try {
    requests = await api('/requests');
    renderDashboard();
    renderTickets();
  } catch (error) {
    $('#recent-list').innerHTML = `<div class="empty-state"><b>เชื่อมต่อ API ไม่สำเร็จ</b>${esc(error.message)}</div>`;
    $('#ticket-list').innerHTML = `<div class="empty-state"><b>โหลดรายการไม่สำเร็จ</b>${esc(error.message)}</div>`;
  }
}

async function onRequestSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = $('#form-error');
  const button = $('#submit-request');
  errorBox.style.display = 'none';
  const file = $('#photo').files[0];
  if (file && file.size > 5 * 1024 * 1024) { errorBox.textContent = 'รูปต้องมีขนาดไม่เกิน 5 MB'; errorBox.style.display = 'block'; return; }
  button.disabled = true;
  button.textContent = 'กำลังส่งคำขอ...';
  try {
    await api('/requests', { method: 'POST', body: new FormData(form) });
    form.reset();
    $('#file-name').textContent = '';
    notify('ส่งคำขอแจ้งซ่อมแล้ว');
    await loadRequests();
    showView('tickets');
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.style.display = 'block';
  } finally {
    button.disabled = false;
    button.innerHTML = 'ส่งคำขอแจ้งซ่อม <span>→</span>';
  }
}

async function handleTicketAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  button.disabled = true;
  try {
    if (action === 'assign') {
      const technician = $(`[data-assign="${id}"]`).value;
      if (!technician) throw new Error('เลือกช่างผู้รับผิดชอบก่อนบันทึก');
      await api(`/requests/${id}/assignment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ technician }) });
      notify('มอบหมายงานให้ช่างแล้ว');
    } else if (action === 'status') {
      const status = $(`[data-status="${id}"]`).value;
      const resolution = $(`[data-resolution="${id}"]`)?.value || '';
      if (status === 'completed' && !resolution.trim()) throw new Error('กรอกผลการซ่อมก่อนปิดงาน');
      await api(`/requests/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, resolution }) });
      notify('อัปเดตสถานะงานแล้ว');
    } else if (action === 'rate') {
      const rating = Number($(`[data-rating="${id}"]`).value);
      if (!rating) throw new Error('เลือกคะแนนก่อนส่ง');
      await api(`/requests/${id}/rating`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating }) });
      notify('ขอบคุณสำหรับการประเมิน');
    }
    await loadRequests();
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', (event) => {
  const go = event.target.closest('[data-go]');
  if (go) showView(go.dataset.go);
  const nav = event.target.closest('[data-view]');
  if (nav) showView(nav.dataset.view);
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    currentFilter = filter.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach((tab) => tab.classList.toggle('selected', tab === filter));
    renderTickets();
  }
});
$('#request-form').addEventListener('submit', onRequestSubmit);
$('#ticket-list').addEventListener('click', handleTicketAction);
$('#refresh').addEventListener('click', loadRequests);
$('#photo').addEventListener('change', (event) => { $('#file-name').textContent = event.target.files[0]?.name || ''; });
$('#today').textContent = new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
loadRequests();
