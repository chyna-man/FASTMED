// Fast Med Orders Dashboard - app.js
// Runs inside Wix HTML iframe. Talks to parent page via postMessage.

let cursor = 0;
let pageSize = 50;
let loading = false;
let hasMore = true;
let activeTab = 'ADMIN';
let searchTerm = '';

let selectedOrderId = '';
let selectedOrderNumber = '';

const el = (id) => document.getElementById(id);

function setMeta(text) {
  const m = el('meta');
  if (m) m.textContent = text;
}

function setLoading(v) {
  loading = !!v;
  const wrap = el('tableWrap');
  if (wrap) wrap.classList.toggle('loading', loading);
}

function resetList() {
  cursor = 0;
  hasMore = true;
  setLoading(false);
  selectedOrderId = '';
  selectedOrderNumber = '';
  const tbody = el('tbody');
  if (tbody) tbody.innerHTML = '';
  const selInfo = el('selInfo');
  if (selInfo) selInfo.textContent = 'No order selected';
  const btnTransfer = el('btnTransfer');
  if (btnTransfer) btnTransfer.disabled = true;
}

function requestMore() {
  if (loading || !hasMore) return;
  setLoading(true);
  window.parent.postMessage(
    {
      type: 'GET_ORDERS',
      payload: { cursor, pageSize, tab: activeTab, search: searchTerm }
    },
    '*'
  );
}

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function badgeHtml(text) {
  const t = String(text || '').trim();
  if (!t) return '<span class="badge gray">—</span>';
  const upper = t.toUpperCase();
  if (upper.includes('PAID') || upper.includes('SUCCESS')) return `<span class="badge green">${escapeHtml(t)}</span>`;
  if (upper.includes('PENDING') || upper.includes('UNPAID')) return `<span class="badge red">${escapeHtml(t)}</span>`;
  return `<span class="badge gray">${escapeHtml(t)}</span>`;
}

function appendRows(items) {
  const tbody = el('tbody');
  if (!tbody) return;

  for (const o of items) {
    const tr = document.createElement('tr');
    tr.dataset.id = o._id || o.id || o.orderId || '';
    tr.dataset.orderNumber = o.orderNumber || '';

    tr.innerHTML = `
      <td>${escapeHtml(o.urgencyFinal || o.urgencyOverride || o.urgencyAuto || '')}</td>
      <td title="${escapeHtml(o.orderNumber || '')}">${escapeHtml(o.orderNumber || '')}</td>
      <td title="${escapeHtml(o.customerName || '')}">${escapeHtml(o.customerName || '')}</td>
      <td>${o.matchedPreConsult ? '<span class="badge green">Matched</span>' : '<span class="badge gray">—</span>'}</td>
      <td title="${escapeHtml(o.phoneNorm || o.phone || '')}">${escapeHtml(o.phoneNorm || o.phone || '')}</td>
      <td>${badgeHtml(o.paymentStatus)}</td>
      <td title="${escapeHtml(o.createdAt || '')}">${escapeHtml(fmtDate(o.createdAt))}</td>
      <td>${escapeHtml(o.total ?? '')}</td>
      <td>${escapeHtml(o.fulfillmentType || '')}</td>
      <td>${escapeHtml(o.fulfillmentStatusFinal || o.fulfillmentStatusOverride || o.fulfillmentStatusAuto || '')}</td>
      <td>${escapeHtml(o.pickupLocation || '')}</td>
    `;

    tr.addEventListener('click', () => {
      // clear previous selection
      tbody.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      selectedOrderId = tr.dataset.id;
      selectedOrderNumber = tr.dataset.orderNumber;
      const selInfo = el('selInfo');
      if (selInfo) selInfo.textContent = selectedOrderNumber ? `Selected: ${selectedOrderNumber}` : 'Selected';
      const btnTransfer = el('btnTransfer');
      if (btnTransfer) btnTransfer.disabled = !selectedOrderId;
    });

    tbody.appendChild(tr);
  }
}

function toast(msg, type = 'info') {
  const host = el('toastHost');
  if (!host) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => {
    t.classList.add('hide');
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

// Receive data from Wix page
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'ORDERS_RESULT') {
    const items = msg.items || [];
    appendRows(items);
    cursor = msg.nextCursor ?? cursor;
    hasMore = !!msg.hasMore;
    setLoading(false);

    const totalNow = (el('tbody')?.children?.length) || 0;
    setMeta(`${totalNow} orders${hasMore ? ' (loading more...)' : ''}`);
  }

  if (msg.type === 'ERROR') {
    setLoading(false);
    toast(msg.message || 'Error', 'error');
    console.error('Parent ERROR:', msg);
  }
});

// Infinite scroll on the table container
function onScroll() {
  const wrap = el('tableWrap');
  if (!wrap) return;
  const nearBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 240;
  if (nearBottom) requestMore();
}

// Tabs
function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  resetList();
  requestMore();
}

// Search debounce
let searchTimer = null;
function setSearchTerm(v) {
  searchTerm = String(v || '').trim();
  resetList();
  requestMore();
}

// Modal / transfer (optional wiring; sends TRANSFER_ORDER to parent)
function openModal() {
  if (!selectedOrderId) return;
  el('modalOverlay')?.classList.add('open');
  const info = el('modalOrderInfo');
  if (info) info.textContent = selectedOrderNumber || selectedOrderId;
}
function closeModal() {
  el('modalOverlay')?.classList.remove('open');
}

function init() {
  // scroll
  const wrap = el('tableWrap');
  if (wrap) wrap.addEventListener('scroll', onScroll);

  // tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => setActiveTab(t.dataset.tab || 'ADMIN'));
  });

  // refresh
  el('refresh')?.addEventListener('click', () => {
    resetList();
    requestMore();
  });

  // search
  el('search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setSearchTerm(e.target.value), 300);
  });

  // transfer
  el('btnTransfer')?.addEventListener('click', openModal);
  el('modalClose')?.addEventListener('click', closeModal);
  el('modalCancel')?.addEventListener('click', closeModal);
  el('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === el('modalOverlay')) closeModal();
  });
  el('modalConfirm')?.addEventListener('click', () => {
    const toSite = el('toSiteSelect')?.value || 'TST';
    const note = el('transferNote')?.value || '';
    window.parent.postMessage({ type: 'TRANSFER_ORDER', id: selectedOrderId, toSite, note }, '*');
    closeModal();
    toast('Transfer requested', 'info');
  });

  // initial
  setActiveTab('ADMIN');
}

document.addEventListener('DOMContentLoaded', init);
