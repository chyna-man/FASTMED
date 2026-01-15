/* Fast Med Orders Dashboard - app.js
   Wix postMessage bridge contract:
     OUT -> { type:"GET_ORDERS", payload:{tab,q,limit,offset} }
     OUT -> { type:"SET_URGENCY", id, value, payload:{...} }
     OUT -> { type:"TRANSFER_ORDER", id, toSite, note, payload:{...} }

     IN  <- { type:"ORDERS_RESULT", items:[...] }
     IN  <- { type:"ERROR", message:"..." }
*/

(() => {
  // -------- State --------
  const state = { tab: "TST", q: "", limit: 50, offset: 0 };
  const selection = { id: "", orderNumber: "", customerName: "", handlingSite: "" };
  let lastAction = ""; // "TRANSFER" | "URGENCY" | ""

  // -------- Elements --------
  const tbody = document.getElementById("tbody");
  const tableWrap = document.getElementById("tableWrap");
  const meta = document.getElementById("meta");
  const search = document.getElementById("search");
  const refreshBtn = document.getElementById("refresh");

  const selInfo = document.getElementById("selInfo");
  const btnTransfer = document.getElementById("btnTransfer");

  const modalOverlay = document.getElementById("modalOverlay");
  const modalClose = document.getElementById("modalClose");
  const modalCancel = document.getElementById("modalCancel");
  const modalConfirm = document.getElementById("modalConfirm");
  const modalOrderInfo = document.getElementById("modalOrderInfo");
  const toSiteSelect = document.getElementById("toSiteSelect");
  const transferNote = document.getElementById("transferNote");

  const toastHost = document.getElementById("toastHost");

  // -------- Helpers --------
  function setLoading(on){ tableWrap.classList.toggle("loading", !!on); }
  function post(msg){ window.parent.postMessage(msg, "*"); }

  function showToast(text, kind="ok", ms=1800){
    if(!toastHost) return;
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = text;
    toastHost.appendChild(el);
    requestAnimationFrame(()=> el.classList.add("show"));
    setTimeout(()=>{
      el.classList.remove("show");
      setTimeout(()=> el.remove(), 220);
    }, ms);
  }

  function requestOrders(){
    setLoading(true);
    post({ type:"GET_ORDERS", payload: { ...state } });
  }

  function clearSelection(){
    selection.id = ""; selection.orderNumber = ""; selection.customerName = ""; selection.handlingSite = "";
    updateSelectionUI();
    tbody.querySelectorAll("tr.selected").forEach(tr => tr.classList.remove("selected"));
  }

  function updateSelectionUI(){
    if(!selection.id){
      selInfo.textContent = "No order selected";
      btnTransfer.disabled = true;
      return;
    }
    selInfo.textContent =
      `Selected: #${selection.orderNumber || selection.id}${selection.customerName ? " · " + selection.customerName : ""}`;
    btnTransfer.disabled = false;
  }

  function openModal(){
    if(!selection.id) return;

    modalOrderInfo.textContent =
      `#${selection.orderNumber || selection.id}${selection.customerName ? " · " + selection.customerName : ""}`;

    const cur = String(selection.handlingSite || "").toUpperCase();
    const tab = String(state.tab || "").toUpperCase();
    let suggested = "CENTRAL";
    if(cur === "TST") suggested = "CENTRAL";
    else if(cur === "CENTRAL") suggested = "TST";
    else if(tab === "TST") suggested = "CENTRAL";
    else if(tab === "CENTRAL") suggested = "TST";

    toSiteSelect.value = suggested;
    transferNote.value = "";
    modalOverlay.classList.add("open");
    transferNote.focus();
  }

  function closeModal(){ modalOverlay.classList.remove("open"); }

  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  }
  function fmtDate(d){ try{ return d ? new Date(d).toLocaleString() : ""; }catch(_){ return String(d||""); } }
  function fmtTotal(x){ const n = Number(x); return Number.isFinite(n) ? n.toFixed(2) : (x ?? ""); }
  function chip(text){ return `<span class="chip">${escapeHtml(text || "")}</span>`; }
  function paymentBadge(paymentStatus){
    const s = String(paymentStatus || "").toUpperCase();
    if (s === "PAID") return `<span class="badge green">PAID</span>`;
    if (s === "UNPAID") return `<span class="badge red">UNPAID</span>`;
    if (s.includes("REFUND")) return `<span class="badge gray">${escapeHtml(s)}</span>`;
    return `<span class="badge gray">${escapeHtml(s || "-")}</span>`;
  }
  function urgencySelect(order){
    const current = String(order.urgencyFinal || "NORMAL").toUpperCase();
    const id = order._id;
    return `
      <select class="urgSel" data-id="${escapeHtml(id)}" aria-label="Urgency">
        <option value="ASAP" ${current==="ASAP" ? "selected":""}>ASAP</option>
        <option value="TODAY" ${current==="TODAY" ? "selected":""}>TODAY</option>
        <option value="NORMAL" ${current==="NORMAL" ? "selected":""}>NORMAL</option>
      </select>
    `;
  }

  function renderRows(items){
    tbody.innerHTML = (items || []).map(o => {
      const handling = String(o.handlingSite || "");
      const customer = o.customerName || "";
      return `
        <tr data-id="${escapeHtml(o._id)}"
            data-order="${escapeHtml(o.orderNumber || "")}"
            data-customer="${escapeHtml(customer)}"
            data-handling="${escapeHtml(handling)}">
          <td>${urgencySelect(o)}</td>
          <td title="${escapeHtml(o.orderNumber)}">${chip(o.orderNumber)}</td>
          <td title="${escapeHtml(customer)}">${escapeHtml(customer)}</td>
          <td>${escapeHtml(o.preConsultStatus || "")}</td>
          <td>${escapeHtml(o.phoneDigits || o.phoneNorm || "")}</td>
          <td>${paymentBadge(o.paymentStatus)}</td>
          <td>${escapeHtml(fmtDate(o.createdAt))}</td>
          <td>${escapeHtml(fmtTotal(o.total))}</td>
          <td>${escapeHtml(o.fulfillmentType || "")}</td>
          <td>${escapeHtml(o.orderStatusFinal || "")}</td>
          <td>${escapeHtml(o.pickupLocation || "")}</td>
        </tr>
      `;
    }).join("");

    // Row selection (ignore clicks on urgency select)
    tbody.querySelectorAll("tr").forEach(tr => {
      tr.addEventListener("click", (e) => {
        if (e.target && (e.target.tagName === "SELECT" || e.target.closest("select"))) return;

        tbody.querySelectorAll("tr.selected").forEach(x => x.classList.remove("selected"));
        tr.classList.add("selected");

        selection.id = tr.dataset.id || "";
        selection.orderNumber = tr.dataset.order || "";
        selection.customerName = tr.dataset.customer || "";
        selection.handlingSite = tr.dataset.handling || "";
        updateSelectionUI();
      });
    });

    // Urgency change
    tbody.querySelectorAll("select.urgSel").forEach(sel => {
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", (e) => {
        lastAction = "URGENCY";
        post({ type: "SET_URGENCY", id: e.target.dataset.id, value: e.target.value, payload: { ...state } });
      });
    });
  }

  // -------- Events --------
  document.querySelectorAll(".tab").forEach(el => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      el.classList.add("active");
      state.tab = el.dataset.tab;
      state.offset = 0;
      clearSelection();
      requestOrders();
    });
  });

  let timer = null;
  search.addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = e.target.value || "";
      state.offset = 0;
      clearSelection();
      requestOrders();
    }, 250);
  });

  refreshBtn.addEventListener("click", () => {
    clearSelection();
    requestOrders();
  });

  btnTransfer.addEventListener("click", openModal);
  modalClose.addEventListener("click", closeModal);
  modalCancel.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => { if(e.target === modalOverlay) closeModal(); });
  window.addEventListener("keydown", (e) => { if(e.key === "Escape") closeModal(); });

  modalConfirm.addEventListener("click", () => {
    if(!selection.id) return;
    const toSite = String(toSiteSelect.value || "").toUpperCase();
    const note = String(transferNote.value || "").trim();

    lastAction = "TRANSFER";
    showToast("Transferring…", "info", 1200);

    post({ type: "TRANSFER_ORDER", id: selection.id, toSite, note, payload: { ...state } });

    closeModal();
    clearSelection();
  });

  // -------- Receive messages from Wix --------
  window.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (msg.type === "ORDERS_RESULT") {
      setLoading(false);
      const items = msg.items || [];
      renderRows(items);
      meta.textContent = `${items.length} orders`;

      if (lastAction === "TRANSFER") {
        showToast("Transfer completed ✅", "ok", 1800);
        lastAction = "";
      } else if (lastAction === "URGENCY") {
        showToast("Urgency updated ✅", "ok", 1400);
        lastAction = "";
      }
    }
    if (msg.type === "ERROR") {
      setLoading(false);
      showToast(msg.message || "Error", "err", 2600);
      lastAction = "";
    }
  });

  // Initial load
  updateSelectionUI();
  requestOrders();
})();
