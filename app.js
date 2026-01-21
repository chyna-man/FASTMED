// Fast Med Orders Dashboard - app.js
// Runs inside the iframe (GitHub Pages or embedded site).
// Talks to Wix via postMessage.

const pageSize = 50;
const nearBottomPx = 220;

let cursor = 0;
let loading = false;
let hasMore = true;

let activeTab = "TST";     // "TST" | "CENTRAL" | "ADMIN"
let searchTerm = "";

let requestKey = "";
let selected = null; // { id, orderNumber, handlingSite }

const els = {
  tableWrap: document.getElementById("tableWrap"),
  tbody: document.getElementById("tbody"),
  meta: document.getElementById("meta"),

  tabs: Array.from(document.querySelectorAll(".tab")),
  search: document.getElementById("search"),
  refresh: document.getElementById("refresh"),

  selInfo: document.getElementById("selInfo"),
  btnTransfer: document.getElementById("btnTransfer"),

  modalOverlay: document.getElementById("modalOverlay"),
  modalClose: document.getElementById("modalClose"),
  modalOrderInfo: document.getElementById("modalOrderInfo"),
  toSiteSelect: document.getElementById("toSiteSelect"),
  transferNote: document.getElementById("transferNote"),
  modalCancel: document.getElementById("modalCancel"),
  modalConfirm: document.getElementById("modalConfirm"),

  toastHost: document.getElementById("toastHost"),
};

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function fmtDate(v) {
  if (!v) return "";
  try {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
  } catch {
    return String(v);
  }
}

function toast(msg, type = "ok") {
  if (!els.toastHost) return;
  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.textContent = msg;
  els.toastHost.appendChild(div);
  setTimeout(() => div.classList.add("show"), 10);
  setTimeout(() => {
    div.classList.remove("show");
    setTimeout(() => div.remove(), 250);
  }, 2400);
}

function setMeta(text) {
  if (els.meta) els.meta.textContent = text;
}

function clearTable() {
  els.tbody.innerHTML = "";
  cursor = 0;
  hasMore = true;
  loading = false;
  selected = null;
  els.selInfo.textContent = "No order selected";
  els.btnTransfer.disabled = true;
}

function buildRequestKey() {
  return `${activeTab}__${searchTerm}__${cursor}__${pageSize}__${Date.now()}`;
}

function requestMore() {
  if (loading || !hasMore) return;

  loading = true;
  setMeta("Loading…");

  requestKey = buildRequestKey();

  parent.postMessage(
    {
      type: "GET_ORDERS",
      payload: { cursor, pageSize, tab: activeTab, search: searchTerm },
      requestKey,
    },
    "*"
  );
}

function urgencySelectHtml(current) {
  const val = String(current || "").toUpperCase();
  const opts = ["", "LOW", "NORMAL", "HIGH", "URGENT"];
  return `
    <select class="urgSel" data-role="urgency">
      ${opts
        .map(o => `<option value="${o}" ${o === val ? "selected" : ""}>${o || "AUTO"}</option>`)
        .join("")}
    </select>
  `;
}

function preConsultHtml(flag) {
  if (flag === true) return `<span class="badge">Matched</span>`;
  return `<span class="badge red">Not yet</span>`;
}

function renderRow(o) {
  const tr = document.createElement("tr");

  // IMPORTANT: we use _id for update/transfer
  tr.dataset.id = o._id;
  tr.dataset.orderNumber = o.orderNumber || "";
  tr.dataset.handlingSite = o.handlingSite || "";

  const urgency = o.urgencyFinal || o.urgencyOverride || o.urgencyAuto || "";
  const orderStatus = o.fulfillmentStatusFinal || o.fulfillmentStatus || o.status || "";
  const recv = o.fulfillmentType || "";
  const pickup = o.pickupLocation || "";

  tr.innerHTML = `
    <td>${urgencySelectHtml(urgency)}</td>
    <td class="mono">${escapeHtml(o.orderNumber || "")}</td>
    <td>${escapeHtml(o.customerName || "")}</td>
    <td>${preConsultHtml(!!o.preConsultMatched)}</td>
    <td class="mono">${escapeHtml(o.phoneNorm || o.phone || o.phoneDigits || "")}</td>
    <td>${escapeHtml(o.paymentStatus || "")}</td>
    <td class="mono">${escapeHtml(fmtDate(o.createdAt))}</td>
    <td class="mono">${escapeHtml(o.total ?? "")}</td>
    <td>${escapeHtml(recv)}</td>
    <td>${escapeHtml(orderStatus)}</td>
    <td>${escapeHtml(pickup)}</td>
  `;

  // Row click selects
  tr.addEventListener("click", (e) => {
    // ignore click on dropdown (still allow selection after)
    selectRow(tr);
  });

  // Urgency change
  tr.querySelector('[data-role="urgency"]').addEventListener("change", (e) => {
    const newVal = e.target.value; // "" means AUTO
    const id = tr.dataset.id;

    parent.postMessage(
      {
        type: "SET_URGENCY",
        id,
        value: newVal,
        requestKey
      },
      "*"
    );
  });

  return tr;
}

function selectRow(tr) {
  // clear previous
  Array.from(els.tbody.querySelectorAll("tr.selected")).forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");

  selected = {
    id: tr.dataset.id,
    orderNumber: tr.dataset.orderNumber,
    handlingSite: tr.dataset.handlingSite
  };

  els.selInfo.textContent = `Selected: ${selected.orderNumber || selected.id}`;
  els.btnTransfer.disabled = false;
}

function appendRows(items) {
  const frag = document.createDocumentFragment();
  for (const o of items) frag.appendChild(renderRow(o));
  els.tbody.appendChild(frag);
}

function removeRowById(id) {
  const tr = els.tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
  if (tr) tr.remove();
}

function updateRow(item) {
  const tr = els.tbody.querySelector(`tr[data-id="${CSS.escape(item._id)}"]`);
  if (!tr) return;

  // If tab-filtered and item moved to another site, remove it from view
  const newSite = item.handlingSite || "";
  if (activeTab === "TST" && newSite !== "TST") {
    removeRowById(item._id);
    toast(`Moved order to ${newSite}`, "ok");
    return;
  }
  if (activeTab === "CENTRAL" && newSite !== "Central") {
    removeRowById(item._id);
    toast(`Moved order to ${newSite}`, "ok");
    return;
  }

  // simplest: replace the row HTML by re-rendering
  const newTr = renderRow(item);
  newTr.classList.toggle("selected", tr.classList.contains("selected"));
  tr.replaceWith(newTr);
}

window.addEventListener("message", (event) => {
  const msg = event.data;

  if (msg?.type === "ORDERS_RESULT") {
    // ignore stale responses
    if (msg.requestKey && msg.requestKey !== requestKey) return;

    const items = msg.items || [];
    appendRows(items);

    cursor = msg.nextCursor ?? cursor;
    hasMore = !!msg.hasMore;
    loading = false;

    setMeta(`${els.tbody.querySelectorAll("tr").length} orders${hasMore ? "" : " (end)"}`);
  }

  if (msg?.type === "ORDER_UPDATED") {
    if (msg.requestKey && msg.requestKey !== requestKey) return;
    if (msg.item?._id) updateRow(msg.item);
  }

  if (msg?.type === "ERROR") {
    loading = false;
    toast(msg.message || "Error", "err");
    setMeta("Error");
    console.error(msg);
  }
});

// Infinite scroll
els.tableWrap.addEventListener("scroll", () => {
  const el = els.tableWrap;
  const nearBottom =
    el.scrollTop + el.clientHeight >= el.scrollHeight - nearBottomPx;
  if (nearBottom) requestMore();
});

// Tabs
els.tabs.forEach((t) => {
  t.addEventListener("click", () => {
    els.tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");

    activeTab = t.dataset.tab; // "TST" / "CENTRAL" / "ADMIN"
    clearTable();
    requestMore();
  });
});

// Search (debounced)
let searchTimer = null;
els.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTerm = (els.search.value || "").trim();
    clearTable();
    requestMore();
  }, 250);
});

// Refresh
els.refresh.addEventListener("click", () => {
  clearTable();
  requestMore();
});

// Transfer modal controls
function openModal() {
  if (!selected) return;

  els.modalOverlay.classList.add("show");
  els.modalOrderInfo.textContent = `Order: ${selected.orderNumber || selected.id}`;

  // default target to opposite site
  const current = selected.handlingSite;
  const def = current === "Central" ? "TST" : "Central";
  els.toSiteSelect.value = def;

  els.transferNote.value = "";
}

function closeModal() {
  els.modalOverlay.classList.remove("show");
}

els.btnTransfer.addEventListener("click", openModal);
els.modalClose.addEventListener("click", closeModal);
els.modalCancel.addEventListener("click", closeModal);
els.modalOverlay.addEventListener("click", (e) => {
  if (e.target === els.modalOverlay) closeModal();
});

els.modalConfirm.addEventListener("click", () => {
  if (!selected) return;

  parent.postMessage(
    {
      type: "TRANSFER_ORDER",
      id: selected.id,
      toSite: els.toSiteSelect.value,
      note: els.transferNote.value || "",
      requestKey
    },
    "*"
  );

  closeModal();
});

// initial load
setMeta("Loading…");
requestMore();
