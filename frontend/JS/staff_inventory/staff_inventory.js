import { inventoryItems, activityLog } from "./data/staff_inventory_data.js";

let filteredItems = [...inventoryItems];
let currentFilter = "all";
let showLowStockOnly = false;
let showArchivedItems = false;

// Normalize archived flag to boolean for all items to avoid truthy/undefined issues  
inventoryItems.forEach(it => { it.archived = !!it.archived; });

function normalizeStatus(status) {
  if (!status) return 'in-stock';
  return String(status).toLowerCase().replace(/\s+/g, '-');
}

function getStatusDisplay(status) {
  const normalized = normalizeStatus(status);
  const statusMap = {
    'out-of-stock': 'Out of Stock',
    'low-stock': 'Low stock', 
    'pending': 'Pending',
    'in-stock': 'In Stock'
  };
  return statusMap[normalized] || 'In Stock';
}

const Z_INDEX = {
  MODAL_BASE: 10000,
  MODAL_OVERLAY: 9999,
  TOAST: 20000
};

/* ================= ACTIVITY LOGGING SYSTEM ================= */
function logActivity(action, itemName, quantity, status) {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const timestamp = `${date} ${time}`;
  
  const newActivity = {
    id: Date.now(),
    action: action,
    item: itemName,
    quantity: quantity,
    status: status,
    user: "Staff",
    timestamp: timestamp
  };
  
  // Add to beginning of activity log
  activityLog.unshift(newActivity);
  console.log("✅ Activity logged:", newActivity);
}

const STATUS_CONFIG = {
  'distributed': { class: 'bg-red-100 text-red-700', text: 'Distributed' },
  'approved': { class: 'bg-green-100 text-green-700', text: 'Approved' },
  'archived': { class: 'bg-gray-400 text-white', text: 'Archived' },
  'pending': { class: 'bg-yellow-100 text-yellow-800', text: 'Pending' },
  'requested': { class: 'bg-blue-100 text-blue-700', text: 'Requested' },
  'restored': { class: 'bg-emerald-100 text-emerald-700', text: 'Restored' },
  'in-stock': { class: 'bg-green-100 text-green-700', text: 'In Stock' },
  'low-stock': { class: 'bg-orange-100 text-orange-700', text: 'Low stock' },
  'out-of-stock': { class: 'bg-red-100 text-red-700', text: 'Out of Stock' }
};

function getStatusBadgeClass(status) {
  const normalized = normalizeStatus(status);
  return STATUS_CONFIG[normalized]?.class || 'bg-gray-100 text-gray-700';
}

function getStatusBadgeText(status) {
  const normalized = normalizeStatus(status);
  return STATUS_CONFIG[normalized]?.text || 'In Stock';
}

/* ================= UI HELPERS: TOASTS & MANAGER NOTIFY MODAL ================= */
function ensureToastContainer() {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    // slightly up and to the left from the lower-right corner
    container.className = `fixed right-8 bottom-12 flex flex-col items-end gap-3 z-[${Z_INDEX.TOAST}]`;
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'info', duration = 3500) {
  const container = ensureToastContainer();
  container.innerHTML = '';
  const toast = document.createElement('div');
  // white background, emerald text, and an outline to match request
  const baseClass = 'bg-white text-emerald-700 border-4 border-emerald-600 rounded-md px-4 py-2 shadow-lg max-w-xs';
  toast.className = baseClass;
  toast.style.opacity = '0';
  toast.style.boxSizing = 'border-box';
  toast.innerHTML = `<div class="text-sm">${message}</div>`;
  container.appendChild(toast);

  // slide/fade in from bottom-right a little
  requestAnimationFrame(() => {
    toast.style.transition = 'opacity 160ms ease-in, transform 180ms ease-in';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // ensure initial transform so animation is meaningful
  toast.style.transform = 'translateY(6px)';

  // remove after duration
  setTimeout(() => {
    toast.style.transition = 'opacity 200ms ease-out, transform 200ms ease-out';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => { toast.remove(); }, 220);
  }, duration);
}

function cleanupModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal && modal.parentNode) {
    modal.parentNode.removeChild(modal);
  }
}

function getElement(modal, selector) {
  return modal?.querySelector(selector) || document.getElementById(selector);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function createModal(options) {
  const { id, title, content, width = '520px' } = options;
  
  // ALWAYS remove existing modal first
  const existingModal = document.getElementById(id);
  if (existingModal) {
    existingModal.remove();
  }
  
  const closeBtnId = `close${id.charAt(0).toUpperCase() + id.slice(1)}`;
  
  // Always create fresh modal
  const wrapper = document.createElement('div');
  wrapper.id = id;
  wrapper.className = `fixed inset-0 bg-black/40 flex items-center justify-center z-[${Z_INDEX.MODAL_BASE}]`;
  wrapper.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 w-[${width}] max-w-[95vw] max-h-[90vh] overflow-y-auto relative">
      <button id="${closeBtnId}" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
      ${content}
    </div>
  `;
  document.body.appendChild(wrapper);
  
  return wrapper;
}

/* ================= APPLY FILTERS ================= */
function applyFilters() {
  const search = document.getElementById("searchInventory")?.value?.toLowerCase() || "";
  filteredItems = inventoryItems.filter(item => {
    if (showArchivedItems) {
      if (!item.archived) return false;
    } else {
      if (item.archived) return false;
    }
    const matchesSearch = (
      (item.name || "").toLowerCase().includes(search) ||
      (item.id || "").toLowerCase().includes(search) ||
      (item.type || "").toLowerCase().includes(search)
    );
    const matchesCategory = currentFilter === "all" || item.category === currentFilter;
    const matchesStockFilter = !showLowStockOnly || item.status === "low-stock" || item.status === "out-of-stock";
    return matchesSearch && matchesCategory && matchesStockFilter;
  });
  renderInventory();
}

/* ================= RENDER INVENTORY ================= */
function renderInventory() {
  const inventoryGrid = document.getElementById("inventoryGrid");
  if (!inventoryGrid) return;
  inventoryGrid.innerHTML = "";

  if (showLowStockOnly) {
    const lowStockCountEl = document.getElementById("lowStockItemCount");
    const bulkSubmitBtn = document.getElementById("bulkSubmitRestock");
    if (lowStockCountEl) lowStockCountEl.textContent = filteredItems.length;
    if (bulkSubmitBtn) {
      if (filteredItems.length === 0) {
        bulkSubmitBtn.disabled = true;
        bulkSubmitBtn.classList.add("opacity-50", "cursor-not-allowed");
      } else {
        bulkSubmitBtn.disabled = false;
        bulkSubmitBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    }
  }

  if (filteredItems.length === 0) {
    inventoryGrid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500"><p>No items found matching your criteria.</p></div>`;
    return;
  }

  filteredItems.forEach(item => {
    const statusBadgeClass = getStatusBadgeClass(item.status);
    const statusText = getStatusBadgeText(item.status);
    const archivedPill = item.archived === true ? `<span class="ml-2 inline-block px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">Archived</span>` : '';

    const card = document.createElement("div");
    card.className = "border border-gray-200 rounded-lg p-4 bg-white shadow-md hover:shadow-lg transition h-full flex flex-col";
    card.setAttribute("data-card-id", item.id);
    card.innerHTML = `
      <div class="flex justify-between items-start mb-3 gap-2">
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800 text-sm">${item.name}</h3>
          <p class="text-xs text-gray-500">${item.type}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-1 rounded text-xs font-medium ${statusBadgeClass} whitespace-nowrap">${statusText}</span>
          ${archivedPill}
        </div>
      </div>

      <div class="space-y-3 mb-4 text-xs flex-1">
        <div class="flex justify-between">
          <span class="text-gray-600">Current Quantity</span>
          <span class="font-semibold text-emerald-700">${item.currentQuantity} ${item.unit}</span>
        </div>
        <div class="text-gray-500">Min: ${item.minStock} ${item.unit}</div>
        <div class="text-gray-500 flex items-center gap-2">
          <img src="../../assets/calendar_icon.png" alt="Calendar" class="w-4 h-4">
          <span>Expires: ${item.expiryDate}</span>
        </div>
        <div class="text-gray-500">Batch: ${item.batchNumber}</div>
      </div>

      <div class="flex gap-2 mt-auto">
        <button class="view-details-btn flex-1 border border-gray-300 py-2 rounded text-xs font-medium hover:bg-gray-100 transition">
          View Details
        </button>
        ${item.archived === true ? `<button class="restore-btn flex-1 bg-emerald-600 text-white py-2 rounded text-xs font-medium hover:bg-emerald-700 transition" data-item-id="${item.id}">Restore</button>` : `<button class="restock-btn flex-1 bg-emerald-600 text-white py-2 rounded text-xs font-medium hover:bg-emerald-700 transition">Request Restock</button>`}
      </div>
    `;
    inventoryGrid.appendChild(card);
  });
}

/* ================= SHOW ITEM DETAILS ================= */
function showItemDetails(item) {
  const modal = document.getElementById("itemDetailsModal");
  if (!modal) {
    console.error('Modal element not found');
    return;
  }

  modal.currentItem = item;

  const setText = (id, value) => {
  const el = getElement(modal, '#' + id);
  if (el) el.textContent = value;
};

  setText("detailsItemName", item.name);
  setText("detailsBrand", `Brand : ${item.type}`);
  setText("detailsItemCode", item.id);
  setText("detailsStock", `${item.currentQuantity} ${item.unit}`);
  setText("detailsMinStock", `${item.minStock} ${item.unit}`);
  setText("detailsUnit", item.unit || '');
  setText("detailsExpiry", item.expiryDate || '');
  setText("detailsBatch", item.batchNumber || '');
  setText("detailsPrice", `₱${(item.price||0).toFixed(2)}`);
  setText("detailsSupplier", item.supplier || '');
  setText("detailsDescription", item.description || 'No description available.');
  
  const formatCategory = (s) => !s ? '' : s.split(/[-_\s]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  setText("detailsCategory", formatCategory(item.category));
  const criticalText = (item.minStock || item.minStock === 0) ? `${item.minStock} ${item.unit || ''}` : '—';
  setText("detailsCriticalText", criticalText);

  const status = item.status || 'in-stock';
  const statusBadge = getElement(modal, '#detailsStatusBadge');
  const statusTextContainer = getElement(modal, '#detailsStatusText');
  if (statusBadge) {
    const config = STATUS_CONFIG[normalizeStatus(status)];
    statusBadge.textContent = config?.text || 'In Stock';
    statusBadge.className = `inline-block px-3 py-1 rounded-full text-sm font-medium ${config?.class || 'bg-gray-100 text-gray-700'}`;
  }
  if (statusTextContainer) {
    const config = STATUS_CONFIG[normalizeStatus(status)];
    const displayText = config?.text || 'In Stock';
    const badgeClass = config?.class || 'bg-gray-100 text-gray-700';
    statusTextContainer.innerHTML = `<span class="inline-block px-2 py-1 rounded-full text-xs font-medium ${badgeClass}">${displayText}</span>`;
  }

  const expiryTextEl = getElement(modal, '#detailsExpiresIn');
  const expiryBadge = getElement(modal, '#detailsExpiryBadge');
  const parseDate = (str) => {
    if (!str) return null;
    const parts = str.split(/[\/\-\.]/);
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) {
      const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, d = parseInt(parts[2], 10);
      return new Date(y, m, d);
    } else {
      const m = parseInt(parts[0], 10) - 1, d = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
      return new Date(y, m, d);
    }
  };
  const expDate = parseDate(item.expiryDateISO || item.expiryDate);
  if (expiryTextEl && expiryBadge) {
    if (expDate) {
      const now = new Date();
      const diff = Math.ceil((expDate - now) / (1000*60*60*24));
      expiryTextEl.textContent = `Expires in ${diff} days`;
      if (diff < 0) { expiryBadge.textContent = 'Expired'; expiryBadge.className = 'inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700'; }
      else if (diff <= 30) { expiryBadge.textContent = 'Expiring Soon'; expiryBadge.className = 'inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700'; }
      else { expiryBadge.textContent = 'Safe'; expiryBadge.className = 'inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700'; }
    } else {
      expiryTextEl.textContent = 'Expiry date not available';
      expiryBadge.textContent = 'Unknown';
      expiryBadge.className = 'inline-block px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700';
    }
  }

  const btnCloseTop = getElement(modal, '#closeItemDetails');
  const btnCancel = getElement(modal, '#closeDetails');
  const btnMove = getElement(modal, '#moveToArchive');

  if (btnCloseTop) {
    const newBtn = btnCloseTop.cloneNode(true);
    btnCloseTop.parentNode.replaceChild(newBtn, btnCloseTop);
    newBtn.onclick = () => { modal.classList.add('hidden'); modal.style.display = ''; };
  }
  if (btnCancel) {
    const newBtn = btnCancel.cloneNode(true);
    btnCancel.parentNode.replaceChild(newBtn, btnCancel);
    newBtn.onclick = () => { modal.classList.add('hidden'); modal.style.display = ''; };
  }
  if (btnMove) {
    if (item.archived) {
      btnMove.style.display = 'none';
    } else {
      const newBtn = btnMove.cloneNode(true);
      btnMove.parentNode.replaceChild(newBtn, btnMove);
      newBtn.style.display = 'block';
      newBtn.textContent = 'Move to Archive';
      newBtn.className = 'w-full bg-red-600 text-white py-2 rounded text-sm font-semibold hover:bg-red-700';
      newBtn.onclick = (e) => { e?.stopPropagation?.(); showArchiveConfirm(item); };
    }
  }
  modal.style.display = 'flex';
  modal.classList.remove('hidden');
}

/* ================= SHOW ARCHIVE CONFIRM ================= */
function showArchiveConfirm(item) {
  const detailsModal = document.getElementById('itemDetailsModal');
  
  const content = `
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
        <img src="../../assets/alert_circle_icon.png" alt="Alert" class="w-10 h-10">
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-semibold">Are you sure you want to Archive this item?</h3>
        <p id="archiveItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
        <p class="text-sm text-gray-600 mt-1">Note: Archived items will be moved to the archive page and can be restored later</p>
      </div>
    </div>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <button id="archiveCancelBtn" class="w-full border border-gray-300 py-2 rounded bg-white text-sm font-semibold hover:bg-gray-50">Cancel</button>
      <button id="archiveConfirmBtn" class="w-full bg-red-600 text-white py-2 rounded text-sm font-semibold hover:bg-red-700">Confirm</button>
    </div>
  `;
  
  const archiveModal = createModal({
    id: 'archiveConfirmModal',
    content: content
  });


  if (archiveModal && archiveModal.parentElement !== document.body) {
    document.body.appendChild(archiveModal);
  }

  archiveModal.classList.add('hidden');
  archiveModal.style.display = 'none';
  setTimeout(() => { archiveModal.classList.remove('hidden'); archiveModal.style.display = 'flex'; }, 10);

  const nameEl = getElement(archiveModal, '#archiveItemName');
  if (nameEl) nameEl.textContent = item.name || '';
  setTimeout(() => { if (detailsModal) { detailsModal.classList.add('hidden'); detailsModal.style.display = ''; } }, 50);

  const hide = () => { archiveModal.classList.add('hidden'); archiveModal.style.display = ''; };

  getElement(archiveModal, '#closeArchiveConfirmModal')
    ?.addEventListener('click', hide);

  getElement(archiveModal, '#archiveCancelBtn')
    ?.addEventListener('click', hide);

  getElement(archiveModal, '#archiveConfirmBtn')
  ?.addEventListener('click', () => {
    const detailsModalEl = document.getElementById('itemDetailsModal');
    if (detailsModalEl) { detailsModalEl.classList.add('hidden'); detailsModalEl.style.display = ''; }
    
    const itemInArray = inventoryItems.find(i => String(i.id) === String(detailsModalEl?.currentItem?.id));
    if (itemInArray) {
      itemInArray.archived = true;
      console.log(`✅ Item ${itemInArray.name} archived`);
      logActivity("Archived", itemInArray.name, itemInArray.currentQuantity, "Archived");
    } else {
      console.warn("Item not found in inventory array");
    }
    
    applyFilters();
    renderActivityLog();
    renderRestockRequests();
    showToast('Archived Successfully', 'success');
    hide();
  });
}

/* ================= SHOW RESTORE CONFIRM ================= */
function showRestoreConfirm(item) {
  const detailsModal = document.getElementById('itemDetailsModal');
  
  const content = `
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
        <img src="../../assets/alert_circle_icon.png" alt="Restore" class="w-10 h-10">
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-semibold">Are you sure you want to Restore this item?</h3>
        <p id="restoreItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
        <p class="text-sm text-gray-600 mt-1">Note: Restored items will be returned to the active inventory list.</p>
      </div>
    </div>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <button id="restoreCancelBtn" class="w-full border border-gray-300 py-2 rounded bg-white text-sm font-semibold hover:bg-gray-50">Cancel</button>
      <button id="restoreConfirmBtn" class="w-full bg-emerald-600 text-white py-2 rounded text-sm font-semibold hover:bg-emerald-700">Confirm</button>
    </div>
  `;
  
  const restoreModal = createModal({
    id: 'restoreConfirmModal',
    content: content
  });

  restoreModal.classList.add('hidden');
  restoreModal.style.display = 'none';
  setTimeout(() => {
    restoreModal.classList.remove('hidden');
    restoreModal.style.display = 'flex';
  }, 10);

  const nameEl = getElement(restoreModal, '#restoreItemName');
  if (nameEl) nameEl.textContent = item.name || '';
  setTimeout(() => { if (detailsModal) { detailsModal.classList.add('hidden'); detailsModal.style.display = ''; } }, 50);

  const hide = () => { 
    restoreModal.classList.add('hidden'); 
    restoreModal.style.display = ''; 
  };

  const closeBtn = getElement(restoreModal, '#closeRestoreConfirmModal');
  const cancelBtn = getElement(restoreModal, '#restoreCancelBtn');
  const confirmBtn = getElement(restoreModal, '#restoreConfirmBtn');

  if (closeBtn) closeBtn.onclick = hide;
  if (cancelBtn) cancelBtn.onclick = hide;

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      const detailsModalEl = document.getElementById('itemDetailsModal');
      if (detailsModalEl) { detailsModalEl.classList.add('hidden'); detailsModalEl.style.display = ''; }
      
      // Use the item parameter directly instead of relying on detailsModal.currentItem
      const itemInArray = inventoryItems.find(i => String(i.id) === String(item.id));
      if (itemInArray) {
        itemInArray.archived = false;
        console.log(`✅ Item ${itemInArray.name} restored`);
        logActivity("Restored", itemInArray.name, itemInArray.currentQuantity, "Restored");
      } else {
        console.warn("Item not found in inventory array");
      }
      
      applyFilters();
      renderActivityLog();
      renderRestockRequests();
      showToast('Restored Successfully', 'success');
      hide();
    };
  }
}

/* ================= REQUEST RESTOCK ================= */
function requestRestock(item) {
  const modal = document.getElementById("requestRestockModal");
  if (!modal) { console.error('Restock modal not found'); return; }

  modal.currentItem = item;
  const modalContent = modal.querySelector(".bg-white");
  if (!modalContent) { console.error('Modal content not found'); return; }

  let alertHtml = "";
  if (item.status === "low-stock" || item.status === "out-of-stock") {
    alertHtml = `<div class="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 mb-2">
      <img src="../../assets/inventory_lowstock_alert.png" class="w-5 h-5 flex-shrink-0 mt-0.5" alt="low stock">
      <div class="text-sm text-red-700"><p class="font-semibold">Low Stock</p>
      <p class="mt-0.5 text-xs">This item needs immediate restocking.</p></div></div>`;
  } else if (item.status === 'Pending') {
    alertHtml = `<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2 mb-2">
      <img src="../../assets/alert_circle_icon.png" class="w-5 h-5 flex-shrink-0 mt-0.5" alt="pending">
      <div class="text-sm text-yellow-800"><p class="font-semibold">Pending</p>
      <p class="mt-0.5 text-xs">This item is still pending</p></div></div>`;
  } else {
    alertHtml = `<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex gap-2 mb-2">
      <img src="../../assets/inventory_lowstock_alert.png" class="w-5 h-5 flex-shrink-0 mt-0.5" alt="in stock">
      <div class="text-sm text-emerald-700"><p class="font-semibold">In Stock</p>
      <p class="mt-0.5 text-xs">This item is currently in stock.</p></div></div>`;
  }

  modalContent.innerHTML = `
    <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl closeRestockBtn">&times;</button>
    <h2 class="text-lg font-semibold">Request Restock</h2>
    <p class="text-sm text-gray-600 mt-1 mb-2">Submit a restock request for <span>${item.name}</span></p>
    ${alertHtml}
    <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1 mb-2">
      <div class="flex justify-between"><span class="text-gray-600">Item :</span><span class="font-semibold">${item.name}</span></div>
      <div class="flex justify-between"><span class="text-gray-600">Current Stock :</span><span class="font-semibold text-emerald-700">${item.currentQuantity} ${item.unit}</span></div>
      <div class="flex justify-between"><span class="text-gray-600">Minimum Stock :</span><span class="font-semibold text-red-600">${item.minStock} ${item.unit}</span></div>
      <div class="flex justify-between"><span class="text-gray-600">Supplier :</span><span class="font-semibold">${item.supplier || "N/A"}</span></div>
    </div>
    <div class="mb-2"><label class="block text-sm font-semibold mb-1">Quantity <span class="text-red-600">*</span></label>
    <input id="restockQuantityInput" type="number" min="1" placeholder="Enter quantity" value="${item.minStock || ""}" class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
    <p id="restockQuantityError" class="text-red-600 text-xs mt-1 hidden">Quantity is required.</p></div>
    <div class="mb-2"><label class="block text-sm font-semibold mb-1">Notes (Optional) :</label>
    <textarea id="restockNotesInput" placeholder="Add any notes..." class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" rows="2"></textarea></div>
    <div class="flex gap-2">
      <button class="flex-1 border border-gray-300 py-2 rounded bg-white text-sm font-semibold hover:bg-gray-50 cancelRestockBtn">Cancel</button>
      <button id="restockSubmitBtn" class="flex-1 bg-emerald-700 text-white py-2 rounded text-sm font-semibold hover:bg-emerald-800">Submit Request</button>
    </div>
  `;

  const closeBtn = getElement(modalContent, ".closeRestockBtn");
  const cancelBtn = getElement(modalContent, ".cancelRestockBtn");
  const submitBtn = getElement(modalContent, "#restockSubmitBtn");

  if (closeBtn) closeBtn.addEventListener("click", (e) => { e.stopPropagation(); modal.style.display = 'none'; modal.classList.add("hidden"); });
  if (cancelBtn) cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); modal.style.display = 'none'; modal.classList.add("hidden"); });

  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const qtyInput = modalContent.querySelector("#restockQuantityInput");
      const notesInput = modalContent.querySelector("#restockNotesInput");
      const errorEl = modalContent.querySelector("#restockQuantityError");
      const quantity = qtyInput ? parseInt(qtyInput.value) : 0;

      if (errorEl) errorEl.classList.add("hidden");
      if (!qtyInput?.value || qtyInput.value === "" || quantity <= 0) {
        if (errorEl) { errorEl.classList.remove("hidden"); errorEl.textContent = "Quantity is required."; }
        if (qtyInput) qtyInput.focus();
        return;
      }

      const notes = notesInput?.value || "";
      logActivity("Requested", item.name, quantity, "Requested");
      showToast('Request Restock Successfully', 'success');
      modal.style.display = 'none';
      modal.classList.add("hidden");
      renderActivityLog();
      renderRestockRequests();
    });
  }

  modal.style.display = 'flex';
  modal.classList.remove('hidden');
  const detailsModal = document.getElementById("itemDetailsModal");
  if (detailsModal) detailsModal.classList.add('hidden');
}

/* ================= RENDER RESTOCK REQUESTS ================= */
function renderRestockRequests() {
  const list = document.getElementById("restockRequestsList");
  if (!list) return;

  const requests = activityLog.filter(a => (a.action === "Requested" || a.status === "Requested"));
  const pendingCount = requests.length;
  const approvedCount = activityLog.filter(a => a.status === "Approved").length;
  const fulfilledCount = activityLog.filter(a => a.status === "Fulfilled").length;

  const pendingEl = document.getElementById('pendingCount');
  const approvedEl = document.getElementById('approvedCount');
  const fulfilledEl = document.getElementById('fulfilledCount');
  if (pendingEl) pendingEl.textContent = pendingCount;
  if (approvedEl) approvedEl.textContent = approvedCount;
  if (fulfilledEl) fulfilledEl.textContent = fulfilledCount;

  if (requests.length === 0) {
    list.innerHTML = `<div class="text-center py-8 text-gray-500">No restock requests.</div>`;
    return;
  }

  list.innerHTML = requests.map(req => {
    const item = inventoryItems.find(i => i.name === req.item) || {};
    const statusDisplay = req.status || req.action || 'Pending';
    const statusBadgeClass = getStatusBadgeClass(statusDisplay);
    return `
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-2">
        <div class="p-2">
          <div class="flex justify-start items-start gap-4">
            <div>
              <h3 class="font-semibold w-[558px]">${req.item}</h3>
              <p class="text-sm text-gray-600">${item.type || ''}</p>
              <p class="text-sm text-gray-500">${item.category ? (item.category.charAt(0).toUpperCase() + item.category.slice(1)) : ''}</p>
            </div>
            <div><span class="px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass}">${statusDisplay}</span></div>
          </div>
          <div class="mt-1 bg-gray-100 p-1 rounded text-sm grid grid-cols-2 gap-4">
            <div>
              <div class="text-xs text-gray-500">Current Stock :</div>
              <div class="font-semibold text-emerald-700">${item.currentQuantity ?? 'N/A'} ${item.unit ?? ''}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500">Minimum Stock :</div>
              <div class="font-semibold text-red-600">${item.minStock ?? 'N/A'} ${item.unit ?? ''}</div>
            </div>
          </div>
          <div class="mt-1 border-t border-gray-200 pt-1 text-sm text-gray-600 flex items-center gap-3">
            <img src="../../assets/calendar_icon.png" class="w-4 h-4" alt="req">
            <div>Requested : ${req.timestamp}</div>
            <div class="text-gray-500">by ${req.user || 'Staff'}</div>
          </div>
          <div class="mt-1 p-1 bg-gray-50 text-sm text-gray-500 rounded">Waiting for approval...</div>
        </div>
      </div>
    `;
  }).join("");
}

/* ================= RENDER ACTIVITY LOG ================= */
function renderActivityLog() {
  const activityList = document.getElementById("activityLogList");
  if (!activityList) return;

  if (activityLog.length === 0) {
    activityList.innerHTML = `<div class="text-center py-8 text-gray-500">No activities recorded yet.</div>`;
    return;
  }

  activityList.innerHTML = activityLog.map(log => {
    let actionIcon = "../../assets/plus_icon.png";
    let actionColor = "bg-blue-50";
    
    if (log.status === "Requested" || log.action === "Requested") {
      actionIcon = "../../assets/plus_icon.png";
      actionColor = "bg-blue-50";
    } else if (log.status === "Archived" || log.action === "Archived") {
      actionIcon = "../../assets/archive_icon.png";
      actionColor = "bg-gray-50";
    } else if (log.status === "Restored" || log.action === "Restored") {
      actionIcon = "../../assets/plus_icon.png";
      actionColor = "bg-emerald-50";
    }
    
    const statusBadgeClass = getStatusBadgeClass(log.status || log.action);
    const statusDisplay = log.status || log.action;
    
    return `
      <div class="${actionColor} rounded-lg p-3 mb-3 border border-gray-200 hover:shadow-md transition">
        <div class="flex items-start gap-3 mb-3">
          <img src="${actionIcon}" alt="${statusDisplay}" class="w-5 h-5 mt-1 flex-shrink-0">
          <div class="flex-1">
            <div class="flex items-center gap-40 mb-1">
              <h3 class="font-semibold w-24 text-gray-800">${log.item}</h3>
              <span class="px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass}">${statusDisplay}</span>
            </div>
          </div>
        </div>
        <div class="ml-8 mb-2">
          <p class="text-sm text-gray-600">${log.quantity || 0} ${log.quantity === 1 ? 'unit' : 'units'} ${log.status === "Requested" || log.action === "Requested" ? 'requested' : (log.status === "Archived" || log.action === "Archived" ? 'archived' : (log.status === "Restored" || log.action === "Restored" ? 'restored' : ''))}</p>
        </div>
        <div class="flex items-center justify-start ml-8 pt-2 border-t border-gray-200">
          <div class="flex items-center gap-3 w-64">
            <img src="../../assets/person_icon.png" alt="User" class="w-4 h-4">
            <span class="text-xs w-28 text-gray-600">${log.user || 'System'}</span>
          </div>
          <div class="flex items-center">
            <span class="text-xs text-gray-500">${log.timestamp}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/* ================= SHOW BULK RESTOCK MODAL ================= */
function showBulkRestockModal() {
  const content = `
    <h2 class="text-lg font-semibold mb-4">Request Restock</h2>
    <p class="text-sm text-gray-600 mb-4">Submit a bulk restock request for low stock items</p>
    <div class="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 mb-4">
      <img src="../../assets/inventory_lowstock_alert.png" class="w-5 h-5 flex-shrink-0 mt-0.5" alt="low stock">
      <div class="text-sm text-red-700"><p class="font-semibold">Low Stock Items</p>
      <p class="mt-0.5 text-xs">These items need immediate restocking.</p></div>
    </div>
    <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
      <p class="text-xs text-gray-600 font-semibold mb-2">Low Stock Items (<span id="bulkItemCount">0</span>):</p>
      <div id="bulkItemsList" class="space-y-1"></div>
    </div>
    <div class="mb-4"><label class="block text-sm font-semibold mb-1">Total Quantity <span class="text-red-600">*</span></label>
    <input id="bulkQuantityInput" type="number" min="1" placeholder="Enter quantity" class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
    <p id="bulkQuantityError" class="text-red-600 text-xs mt-1 hidden">Quantity is required.</p></div>
    <div class="mb-4"><label class="block text-sm font-semibold mb-1">Notes (Optional):</label>
    <textarea id="bulkNotesInput" placeholder="Add any notes..." class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" rows="2"></textarea></div>
    <div class="flex gap-2">
      <button id="bulkCancelBtn" class="flex-1 border border-gray-300 py-2 rounded bg-white text-sm font-semibold hover:bg-gray-50">Cancel</button>
      <button id="bulkSubmitBtn" class="flex-1 bg-emerald-700 text-white py-2 rounded text-sm font-semibold hover:bg-emerald-800">Submit Request</button>
    </div>
  `;

  const bulkRestockModal = createModal({
    id: 'bulkRestockModal',
    content: content
  });

  bulkRestockModal.classList.add('hidden');
  bulkRestockModal.style.display = 'none';
  setTimeout(() => { bulkRestockModal.classList.remove('hidden'); bulkRestockModal.style.display = 'flex'; }, 10);

  const itemsList = getElement(bulkRestockModal, '#bulkItemsList');
  const itemCount = getElement(bulkRestockModal, '#bulkItemCount');

  if (itemsList) {
    itemsList.innerHTML = filteredItems.map(item => `<div class="text-sm text-gray-700">• ${item.name}</div>`).join('');
    if (itemCount) itemCount.textContent = filteredItems.length;
  }

  const closeBtn = getElement(bulkRestockModal, '#closeBulkRestockModal');
  const cancelBtn = getElement(bulkRestockModal, '#bulkCancelBtn');
  const submitBtn = getElement(bulkRestockModal, '#bulkSubmitBtn');
  const errorEl = getElement(bulkRestockModal, '#bulkQuantityError');
  const qtyInput = getElement(bulkRestockModal, '#bulkQuantityInput');
  const notesInput = getElement(bulkRestockModal, '#bulkNotesInput');

  const hide = () => { bulkRestockModal.classList.add('hidden'); bulkRestockModal.style.display = ''; };
  if (closeBtn) closeBtn.onclick = hide;
  if (cancelBtn) cancelBtn.onclick = hide;

  if (submitBtn) {
    submitBtn.onclick = () => {
      const quantity = qtyInput ? parseInt(qtyInput.value) : 0;
      if (errorEl) errorEl.classList.add('hidden');
      if (!qtyInput?.value || qtyInput.value === "" || quantity <= 0) {
        if (errorEl) { errorEl.classList.remove('hidden'); errorEl.textContent = "Quantity is required."; }
        if (qtyInput) qtyInput.focus();
        return;
      }
      filteredItems.forEach(item => logActivity("Requested", item.name, quantity, "Requested"));
      showToast('Bulk Restock Request Successfully', 'success');
      hide();
      renderActivityLog();
      renderRestockRequests();
    };
  }
}

/* ================= SHOW ADD ITEM MODAL ================= */
function showAddItemModal() {
  const content = `
    <h3 class="text-lg font-semibold mb-1">Add Item</h3>
    <p class="text-sm text-gray-600 mb-4">Items will remain pending until approved</p>
    <div class="space-y-3 text-sm">
      <div><label class="block text-xs text-gray-700 mb-1">Brand :</label>
        <input id="addBrand" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addBrandError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Generic :</label>
        <input id="addGeneric" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addGenericError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Category :</label>
        <select id="addCategory" class="w-full border border-gray-300 rounded px-3 py-2 bg-white">
          <option value="">Select category</option><option value="medicine">Medicine</option>
          <option value="first-aid">First Aid & Medical Supplies</option><option value="vitamins-personal-care">Vitamins & Personal Care</option>
        </select>
        <p id="addCategoryError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Quantity :</label>
        <input id="addQuantity" type="number" min="0" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addQuantityError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Expiration Date :</label>
        <input id="addExpiry" type="date" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addExpiryError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Batch No. :</label>
        <input id="addBatch" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addBatchError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
    </div>
    <div class="mt-5 flex gap-3 justify-end">
      <button id="addCancelBtn" class="border border-gray-300 py-2 px-4 rounded bg-white">Cancel</button>
      <button id="addSaveBtn" class="bg-emerald-700 text-white py-2 px-4 rounded">Save</button>
    </div>
  `;

  const addItemModal = createModal({
    id: 'addItemModal',
    content: content
  });

  const closeBtn = getElement(addItemModal, '#closeAddItemModal');
  const cancel = getElement(addItemModal, '#addCancelBtn');
  const save = getElement(addItemModal, '#addSaveBtn');
  const hide = () => { addItemModal.classList.add('hidden'); addItemModal.style.display = ''; setTimeout(() => addItemModal.remove(), 200); };
  if (closeBtn) closeBtn.onclick = hide;
  if (cancel) cancel.onclick = hide;

  if (save) {
    save.onclick = () => {
      const brandEl = getElement(addItemModal, '#addBrand');
      const genericEl = getElement(addItemModal, '#addGeneric');
      const categoryEl = getElement(addItemModal, '#addCategory');
      const qtyEl = getElement(addItemModal, '#addQuantity');
      const expiryEl = getElement(addItemModal, '#addExpiry');
      const batchEl = getElement(addItemModal, '#addBatch');

      const brand = (brandEl?.value || '').trim();
      const generic = (genericEl?.value || '').trim();
      const category = (categoryEl?.value || '').trim();
      const qtyRaw = qtyEl?.value ?? '';
      const qty = qtyRaw === '' ? NaN : parseInt(qtyRaw, 10);
      const expiry = expiryEl?.value || '';
      const batch = (batchEl?.value || '').trim();

      const setHidden = (id, hide) => { const e = addItemModal.querySelector('#' + id); if (e) { if (hide) e.classList.add('hidden'); else e.classList.remove('hidden'); } };
      setHidden('addBrandError', true);
      setHidden('addGenericError', true);
      setHidden('addCategoryError', true);
      setHidden('addQuantityError', true);
      setHidden('addExpiryError', true);
      setHidden('addBatchError', true);

      let hasError = false;
      if (!brand) { setHidden('addBrandError', false); hasError = true; }
      if (!generic) { setHidden('addGenericError', false); hasError = true; }
      if (!category) { setHidden('addCategoryError', false); hasError = true; }
      if (isNaN(qty)) { setHidden('addQuantityError', false); hasError = true; }
      if (!expiry) { setHidden('addExpiryError', false); hasError = true; }
      if (!batch) { setHidden('addBatchError', false); hasError = true; }

      if (hasError) return;

      const newItem = {
        id: 'ITEM-' + Date.now(),
        name: generic || brand,
        type: brand || generic,
        category: category || 'general',
        currentQuantity: isNaN(qty) ? 0 : qty,
        minStock: 0,
        unit: 'pcs',
        supplier: '',
        status: 'Pending',
        expiryDate: expiry || '',
        batchNumber: batch || '',
        archived: false,
        price: 0,
        description: ''
      };

      inventoryItems.unshift(newItem);
      logActivity('Added', newItem.name, newItem.currentQuantity, 'Pending');
      hide();
      applyFilters();
      renderActivityLog();
      renderRestockRequests();
      showToast('Item Added — Pending Approval', 'success');
    };
  }

  modal.style.display = 'flex';
  modal.classList.remove('hidden');
}

/* ================= INIT ================= */
export function initInventory() {
  console.log("=== INIT INVENTORY STARTED ===");

  const inventoryGrid = document.getElementById("inventoryGrid");
  const searchInput = document.getElementById("searchInventory");
  const categoryFilters = document.querySelectorAll(".category-filter");
  const lowStockToggle = document.getElementById("lowStockToggle");
  const tabInventory = document.getElementById("tabInventory");
  const tabRestock = document.getElementById("tabRestock");
  const tabActivity = document.getElementById("tabActivity");
  const inventorySection = document.getElementById("inventorySection");
  const restockSection = document.getElementById("restockSection");
  const activitySection = document.getElementById("activitySection");
  const addItemBtn = document.getElementById("addItemBtn");
  const archivedBtn = document.getElementById("archivedBtn");
  const itemDetailsModal = document.getElementById("itemDetailsModal");
  const closeItemDetails = document.getElementById("closeItemDetails");
  const closeDetails = document.getElementById("closeDetails");

  if (!inventoryGrid) {
    console.error("CRITICAL: Inventory DOM not ready");
    return;
  }

  /* ================= EVENT LISTENERS - SEARCH & FILTER ================= */
  const debouncedApplyFilters = debounce(applyFilters, 300);
  searchInput?.addEventListener("input", debouncedApplyFilters);

  categoryFilters.forEach(btn => {
    btn.addEventListener("click", () => {
      categoryFilters.forEach(b => b.classList.remove("bg-emerald-500", "text-white", "border-emerald-500"));
      btn.classList.add("bg-emerald-500", "text-white", "border-emerald-500");
      currentFilter = btn.dataset.category;
      debouncedApplyFilters();
    });
  });

  lowStockToggle?.addEventListener("click", () => {
    if (showArchivedItems) return;
    showLowStockOnly = !showLowStockOnly;
    
    const textSpan = lowStockToggle.querySelector("span");
    const bottomBar = document.getElementById("lowStockBottomBar");
    if (showLowStockOnly) {
      lowStockToggle.classList.remove("bg-red-50", "border-red-300", "text-red-600");
      lowStockToggle.classList.add("bg-red-600", "border-red-700", "text-white");
      textSpan.textContent = "Showing Low Stock Only";
      textSpan.classList.add("text-white");
      textSpan.classList.remove("text-red-600");
      if (bottomBar) bottomBar.classList.remove("hidden");
      if (archivedBtn) {
        archivedBtn.classList.add("opacity-50", "cursor-not-allowed");
        archivedBtn.disabled = true;
      }
    } else {
      lowStockToggle.classList.remove("bg-red-600", "border-red-700");
      lowStockToggle.classList.add("bg-red-50", "border-red-300");
      textSpan.textContent = "Show Low Stock Only";
      textSpan.classList.remove("text-white");
      textSpan.classList.add("text-red-600");
      if (bottomBar) bottomBar.classList.add("hidden");
      if (archivedBtn) {
        archivedBtn.classList.remove("opacity-50", "cursor-not-allowed");
        archivedBtn.disabled = false;
      }
    }
    applyFilters();
  });

  archivedBtn?.addEventListener("click", () => {
    if (showLowStockOnly) return;
    showArchivedItems = !showArchivedItems;
    if (showArchivedItems) {
      archivedBtn.classList.remove("bg-white", "text-red-600");
      archivedBtn.classList.add("bg-red-600", "text-white");
      const lowStockToggleLocal = document.getElementById("lowStockToggle");
      if (lowStockToggleLocal) {
        lowStockToggleLocal.classList.add("opacity-50", "cursor-not-allowed");
        lowStockToggleLocal.disabled = true;
      }
    } else {
      archivedBtn.classList.remove("bg-red-600", "text-white");
      archivedBtn.classList.add("bg-white", "text-red-600");
      const lowStockToggleLocal = document.getElementById("lowStockToggle");
      if (lowStockToggleLocal) {
        lowStockToggleLocal.classList.remove("opacity-50", "cursor-not-allowed");
        lowStockToggleLocal.disabled = false;
      }
    }
    applyFilters();
  });

  document.querySelector('[data-category="all"]')?.classList.add("bg-emerald-500", "text-white", "border-emerald-500");

  closeItemDetails?.addEventListener("click", () => itemDetailsModal.classList.add("hidden"));
  closeDetails?.addEventListener("click", () => itemDetailsModal.classList.add("hidden"));

  /* ================= TAB SWITCHING ================= */
  function switchTab(showSection) {
    inventorySection.classList.toggle("hidden", showSection !== inventorySection);
    restockSection.classList.toggle("hidden", showSection !== restockSection);
    activitySection.classList.toggle("hidden", showSection !== activitySection);

    tabInventory.classList.toggle("bg-emerald-700", showSection === inventorySection);
    tabInventory.classList.toggle("text-white", showSection === inventorySection);
    tabInventory.classList.toggle("bg-gray-200", showSection !== inventorySection);
    tabInventory.classList.toggle("text-gray-700", showSection !== inventorySection);

    tabRestock.classList.toggle("bg-emerald-700", showSection === restockSection);
    tabRestock.classList.toggle("text-white", showSection === restockSection);
    tabRestock.classList.toggle("bg-gray-200", showSection !== restockSection);
    tabRestock.classList.toggle("text-gray-700", showSection !== restockSection);

    tabActivity.classList.toggle("bg-emerald-700", showSection === activitySection);
    tabActivity.classList.toggle("text-white", showSection === activitySection);
    tabActivity.classList.toggle("bg-gray-200", showSection !== activitySection);
    tabActivity.classList.toggle("text-gray-700", showSection !== activitySection);
  }

  tabInventory?.addEventListener("click", e => { e.preventDefault(); switchTab(inventorySection); });
  tabRestock?.addEventListener("click", e => { e.preventDefault(); switchTab(restockSection); renderRestockRequests(); });
  tabActivity?.addEventListener("click", e => { e.preventDefault(); switchTab(activitySection); renderActivityLog(); });

  /* ================= BUTTON ACTIONS ================= */
  const bulkSubmitBtn = document.getElementById('bulkSubmitRestock');
  bulkSubmitBtn?.addEventListener("click", () => showBulkRestockModal());
  addItemBtn?.addEventListener("click", () => showAddItemModal());

  /* ================= INITIAL RENDER ================= */
  console.log("Rendering inventory...");
  applyFilters();
  renderActivityLog();
  renderRestockRequests();
  console.log("Inventory initialized successfully");
}

/* ================= GLOBAL EVENT DELEGATION FOR INVENTORY CARDS ================= */
if (!window.inventoryGridListenerAttached) {
  document.addEventListener("click", (e) => {
    const inventoryGrid = document.getElementById("inventoryGrid");
    if (!inventoryGrid || !inventoryGrid.contains(e.target)) return;

    const viewDetailsBtn = e.target.closest(".view-details-btn");
    const restockBtn = e.target.closest(".restock-btn");
    const restoreBtn = e.target.closest(".restore-btn");

    if (viewDetailsBtn) {
      const card = viewDetailsBtn.closest("[data-card-id]");
      if (!card) return;
      const itemId = card.getAttribute("data-card-id");
      const item = inventoryItems.find(i => String(i.id) === String(itemId));
      if (item) showItemDetails(item);
    } else if (restockBtn) {
      const card = restockBtn.closest("[data-card-id]");
      if (!card) return;
      const itemId = card.getAttribute("data-card-id");
      const item = inventoryItems.find(i => String(i.id) === String(itemId));
      if (item) requestRestock(item);
    } else if (restoreBtn) {
      e.preventDefault();
      e.stopPropagation();
      const itemId = restoreBtn.getAttribute("data-item-id");
      const item = inventoryItems.find(i => String(i.id) === String(itemId));
      if (item) showRestoreConfirm(item);
    }
  }, false);

  window.inventoryGridListenerAttached = true;
}
