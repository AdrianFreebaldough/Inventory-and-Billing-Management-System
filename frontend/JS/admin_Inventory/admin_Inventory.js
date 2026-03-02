/* =============================================================
   OWNER INVENTORY – fully API-driven  (no mock data)
   Replaces the previous mock-data module.
   Every read / write goes through the backend via apiFetch.
   ============================================================= */
import { apiFetch } from "../utils/apiClient.js";

/* ================= API ENDPOINTS ================= */
const API = {
  activeInventory:   "/api/owner/inventory",
  archivedInventory: "/api/owner/inventory/archived",
  addProduct:        "/api/owner/inventory",
  pendingRequests:   "/api/owner/inventory/requests/pending",
  allRequests:       "/api/owner/inventory/requests/all",
  approveRequest:    (id) => `/api/owner/inventory/requests/${id}/approve`,
  rejectRequest:     (id) => `/api/owner/inventory/requests/${id}/reject`,
  archiveProduct:    (id) => `/api/owner/inventory/${id}/archive`,
  restoreProduct:    (id) => `/api/owner/inventory/${id}/restore`,
  adjustStock:       (id) => `/api/owner/inventory/${id}/adjust-stock`,
};

/* ================= LOCAL UI STATE ================= */
let inventoryItems = [];
let restockRequests = [];
let filteredItems = [];
let filteredRestockRequests = [];
let currentStatusFilter = "all";
let currentCategoryFilter = "all";
let currentRestockStatusFilter = "all";
let currentRestockCategoryFilter = "all";
let showArchivedItems = false;
let showLowStockOnly = false;

/* ================= STATUS MAPS  (DB → UI) ================= */
const DB_STATUS_TO_UI = {
  available: "in-stock",
  low:       "low-stock",
  out:       "out-of-stock",
};

const DB_REQUEST_STATUS_TO_UI = {
  pending:  "pending",
  approved: "approved",
  rejected: "denied",
};

/* ================= FILTER & COLOR CONFIGS ================= */
const FILTER_CONFIG = {
  all:           { activeBg:'bg-blue-600',   activeText:'text-white', activeBorder:'border-blue-600',   hoverBg:'hover:bg-blue-50',   hoverBorder:'hover:border-blue-500',   hoverText:'hover:text-blue-700' },
  'in-stock':    { activeBg:'bg-green-600',  activeText:'text-white', activeBorder:'border-green-600',  hoverBg:'hover:bg-green-50',  hoverBorder:'hover:border-green-500',  hoverText:'hover:text-green-700' },
  pending:       { activeBg:'bg-yellow-500', activeText:'text-white', activeBorder:'border-yellow-500', hoverBg:'hover:bg-yellow-50', hoverBorder:'hover:border-yellow-500', hoverText:'hover:text-yellow-700' },
  'low-stock':   { activeBg:'bg-orange-500', activeText:'text-white', activeBorder:'border-orange-500', hoverBg:'hover:bg-orange-50', hoverBorder:'hover:border-orange-500', hoverText:'hover:text-orange-700' },
  'out-of-stock':{ activeBg:'bg-red-700',    activeText:'text-white', activeBorder:'border-red-700',    hoverBg:'hover:bg-red-50',    hoverBorder:'hover:border-red-600',    hoverText:'hover:text-red-700' },
  approved:      { activeBg:'bg-green-600',  activeText:'text-white', activeBorder:'border-green-600',  hoverBg:'hover:bg-green-50',  hoverBorder:'hover:border-green-500',  hoverText:'hover:text-green-700' },
  denied:        { activeBg:'bg-red-600',    activeText:'text-white', activeBorder:'border-red-600',    hoverBg:'hover:bg-red-50',    hoverBorder:'hover:border-red-500',    hoverText:'hover:text-red-700' },
};

const STATUS_COLORS = {
  'in-stock':     { bg:'bg-green-100',  text:'text-green-800',  border:'border-green-500',  quantity:'text-green-700' },
  pending:        { bg:'bg-yellow-100', text:'text-yellow-800', border:'border-yellow-500', quantity:'text-yellow-700' },
  'low-stock':    { bg:'bg-orange-100', text:'text-orange-800', border:'border-orange-500', quantity:'text-orange-700' },
  'out-of-stock': { bg:'bg-red-100',    text:'text-red-800',    border:'border-red-500',    quantity:'text-red-700' },
  archived:       { bg:'bg-gray-400',   text:'text-white',      border:'border-gray-500',   quantity:'text-gray-700' },
  approved:       { bg:'bg-blue-100',   text:'text-blue-800',   border:'border-blue-500',   quantity:'text-blue-700' },
  denied:         { bg:'bg-red-100',    text:'text-red-800',    border:'border-red-500',    quantity:'text-red-700' },
};

const STATUS_DISPLAY = {
  'in-stock': 'In Stock', pending: 'Pending', 'low-stock': 'Low Stock',
  'out-of-stock': 'Out of Stock', archived: 'Archived', approved: 'Approved', denied: 'Denied',
};

const Z_INDEX = { MODAL_BASE: 10000, MODAL_OVERLAY: 9999, TOAST: 20000 };

/* ================= DATA MAPPING (backend → UI) ================= */
function mapBackendItemToUI(p) {
  return {
    id:              p._id,
    name:            p.name || "",
    type:            p.name || "",              // brand column – use name
    category:        p.category || "",
    currentQuantity: p.quantity ?? 0,
    minStock:        p.minStock ?? 10,
    unit:            p.unit || "pcs",
    supplier:        p.supplier || "—",
    status:          p.isArchived ? "archived" : (DB_STATUS_TO_UI[p.status] || "in-stock"),
    expiryDate:      p.expiryDate ? new Date(p.expiryDate).toLocaleDateString("en-US") : "—",
    expiryDateISO:   p.expiryDate ? new Date(p.expiryDate).toISOString().split("T")[0] : "",
    batchNumber:     p.batchNumber || "—",
    archived:        !!p.isArchived,
    price:           p.unitPrice ?? 0,
    description:     p.description || "",
  };
}

function mapBackendRequestToUI(r) {
  const isRestock = r.requestType === "RESTOCK";
  const product = r.product || {};
  return {
    id:              r._id,
    requestType:     r.requestType,
    itemName:        isRestock ? (product.name || "Unknown") : (r.itemName || "Unknown"),
    type:            isRestock ? (product.name || "Unknown") : (r.itemName || "Unknown"),
    category:        isRestock ? (product.category || "") : (r.category || ""),
    currentQuantity: isRestock ? (product.quantity ?? 0) : 0,
    minStock:        isRestock ? 10 : 10,       // product minStock not populated; safe default
    unit:            r.unit || "pcs",
    requestQuantity: isRestock ? (r.requestedQuantity ?? 0) : (r.initialQuantity ?? 0),
    requestedBy:     r.requestedBy?.email || "Staff",
    requestDate:     r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-US") : "—",
    status:          DB_REQUEST_STATUS_TO_UI[r.status] || r.status,
    supplier:        "",
    productId:       isRestock ? (product._id || null) : null,
    notes:           r.rejectionReason || "",
  };
}

/* ================= API FETCH HELPERS ================= */
async function fetchInventoryItems() {
  try {
    const res = await apiFetch(API.activeInventory);
    return (res?.data || []).map(mapBackendItemToUI);
  } catch (err) {
    showToast(`Failed to load inventory: ${err.message}`, "error");
    return [];
  }
}

async function fetchArchivedItems() {
  try {
    const res = await apiFetch(API.archivedInventory);
    return (res?.data || []).map(mapBackendItemToUI);
  } catch (err) {
    showToast(`Failed to load archived items: ${err.message}`, "error");
    return [];
  }
}

async function fetchPendingRequests() {
  try {
    const res = await apiFetch(API.pendingRequests);
    return (res?.data || []).map(mapBackendRequestToUI);
  } catch (err) {
    showToast(`Failed to load requests: ${err.message}`, "error");
    return [];
  }
}

async function fetchAllRequests() {
  try {
    const res = await apiFetch(API.allRequests);
    return (res?.data || []).map(mapBackendRequestToUI);
  } catch (err) {
    showToast(`Failed to load requests: ${err.message}`, "error");
    return [];
  }
}

async function refreshInventory() {
  if (showArchivedItems) {
    inventoryItems = await fetchArchivedItems();
  } else {
    inventoryItems = await fetchInventoryItems();
  }
  applyFilters();
}

async function refreshRequests() {
  /* When filter is 'all' we need every status → use allRequests */
  if (currentRestockStatusFilter === "all" || currentRestockStatusFilter !== "pending") {
    restockRequests = await fetchAllRequests();
  } else {
    restockRequests = await fetchPendingRequests();
  }
  applyRestockFilters();
}

async function refreshAll() {
  await Promise.all([refreshInventory(), refreshRequests()]);
}

/* ================= UTILITY HELPERS ================= */
function normalizeStatus(status) {
  if (!status) return "in-stock";
  return String(status).toLowerCase().replace(/\s+/g, "-");
}
function getFilterConfig(status)     { return FILTER_CONFIG[normalizeStatus(status)]  || FILTER_CONFIG["all"]; }
function getStatusColors(status)     { return STATUS_COLORS[normalizeStatus(status)]  || STATUS_COLORS["in-stock"]; }
function getStatusDisplayText(status){ return STATUS_DISPLAY[normalizeStatus(status)] || "In Stock"; }
function formatCategory(cat)         { return cat ? cat.split(/[-_\s]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") : ""; }

/* ================= TOAST ================= */
function ensureToastContainer() {
  let c = document.getElementById("toastContainer");
  if (!c) {
    c = document.createElement("div");
    c.id = "toastContainer";
    c.className = `fixed right-8 bottom-12 flex flex-col items-end gap-3 z-[${Z_INDEX.TOAST}]`;
    document.body.appendChild(c);
  }
  return c;
}

function showToast(message, type = "success", duration = 3500) {
  const container = ensureToastContainer();
  container.innerHTML = "";
  const toast = document.createElement("div");
  const isError = type === "error";
  const base = isError
    ? "bg-white text-red-700 border-4 border-red-600 rounded-md px-4 py-3 shadow-lg max-w-xs transform transition-all duration-300 translate-y-2 opacity-0"
    : "bg-white text-blue-700 border-4 border-blue-600 rounded-md px-4 py-3 shadow-lg max-w-xs transform transition-all duration-300 translate-y-2 opacity-0";
  toast.className = base;
  toast.innerHTML = `<div class="text-sm font-medium">${message}</div>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove("translate-y-2", "opacity-0"));
  setTimeout(() => { toast.classList.add("translate-y-2", "opacity-0"); setTimeout(() => toast.remove(), 300); }, duration);
}

function debounce(func, wait) {
  let timeout;
  return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}

function getElement(modal, sel) {
  return modal?.querySelector(sel) || document.getElementById(sel);
}

function createModal(options) {
  const { id, content, width = "520px" } = options;
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const closeBtnId = `close${id.charAt(0).toUpperCase() + id.slice(1)}`;
  const wrapper = document.createElement("div");
  wrapper.id = id;
  wrapper.className = `fixed inset-0 bg-black/40 flex items-center justify-center z-[${Z_INDEX.MODAL_BASE}]`;
  wrapper.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 max-w-[95vw] max-h-[90vh] overflow-y-auto relative" style="width:${width};min-width:${width};">
      <button id="${closeBtnId}" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
      ${content}
    </div>`;
  document.body.appendChild(wrapper);
  return wrapper;
}

/* ================= FILTER BUTTONS ================= */
function updateFilterButtonStyles(containerSelector, activeStatus) {
  document.querySelectorAll(`${containerSelector} .status-filter, ${containerSelector} .status-filter-restock`).forEach(btn => {
    const status = btn.dataset.status;
    const cfg = getFilterConfig(status);
    const active = status === activeStatus;
    let cls = "status-filter px-4 py-1 rounded-full border text-sm shadow-sm transition-all cursor-pointer ";
    cls += active
      ? `${cfg.activeBg} ${cfg.activeText} ${cfg.activeBorder}`
      : `bg-white text-gray-700 border-gray-300 ${cfg.hoverBg} ${cfg.hoverBorder} ${cfg.hoverText}`;
    btn.className = cls;
  });
}

/* ================= FILTERS & RENDERS ================= */
function applyFilters() {
  const search = (document.getElementById("searchInventory")?.value || "").toLowerCase();
  filteredItems = inventoryItems.filter(item => {
    if (showArchivedItems) { if (!item.archived) return false; }
    else                   { if (item.archived)  return false; }
    const matchSearch = (item.name || "").toLowerCase().includes(search) ||
                        (item.type || "").toLowerCase().includes(search) ||
                        (item.id   || "").toLowerCase().includes(search);
    const matchStatus   = currentStatusFilter   === "all" || item.status   === currentStatusFilter;
    const matchCategory = currentCategoryFilter === "all" || item.category === currentCategoryFilter;
    return matchSearch && matchStatus && matchCategory;
  });
  filteredItems.sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0));
  updateFilterButtonStyles("#statusFiltersContainer", currentStatusFilter);
  renderInventory();
}

function applyRestockFilters() {
  const search = (document.getElementById("searchRestock")?.value || "").toLowerCase();
  filteredRestockRequests = restockRequests.filter(req => {
    const matchSearch = (req.itemName || "").toLowerCase().includes(search) ||
                        (req.id   || "").toLowerCase().includes(search) ||
                        (req.type || "").toLowerCase().includes(search);
    const matchStatus   = currentRestockStatusFilter   === "all" || req.status   === currentRestockStatusFilter;
    const matchCategory = currentRestockCategoryFilter === "all" || req.category === currentRestockCategoryFilter;
    return matchSearch && matchStatus && matchCategory;
  });
  updateFilterButtonStyles("#restockStatusFiltersContainer", currentRestockStatusFilter);
  renderRestockRequests();
}

/* ================= RENDER: Inventory Grid ================= */
function renderInventory() {
  const grid = document.getElementById("inventoryGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!filteredItems.length) {
    grid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500"><p>No items found matching your criteria.</p></div>`;
    return;
  }

  filteredItems.forEach(item => {
    const colors = getStatusColors(item.status);
    const statusText = getStatusDisplayText(item.status);
    const archivedPill = item.archived ? `<span class="ml-2 inline-block px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">Archived</span>` : "";

    let buttonsHtml;
    if (item.archived) {
      buttonsHtml = `
        <button class="restore-btn flex-1 bg-emerald-600 text-white py-2 rounded text-xs font-medium hover:bg-emerald-700 transition-colors" data-item-id="${item.id}">Restore</button>
        <button class="view-details-btn flex-1 border border-gray-300 py-2 rounded text-xs font-medium hover:bg-gray-100 transition-colors">View Details</button>`;
    } else {
      buttonsHtml = `<button class="view-details-btn w-full border border-gray-300 py-2 rounded text-xs font-medium hover:bg-gray-100 transition-colors">View Details</button>`;
    }

    const card = document.createElement("div");
    card.className = "border border-gray-200 rounded-lg p-4 bg-white shadow-md hover:shadow-lg transition-all duration-200 h-full flex flex-col transform hover:-translate-y-1";
    card.setAttribute("data-card-id", item.id);
    card.innerHTML = `
      <div class="flex justify-between items-start mb-3 gap-2">
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800 text-sm">${item.name}</h3>
          <p class="text-xs text-gray-500">${item.type}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text} whitespace-nowrap border ${colors.border}">${statusText}</span>
          ${archivedPill}
        </div>
      </div>
      <div class="space-y-2 mb-4 text-xs flex-1">
        <div class="flex justify-between"><span class="text-gray-600">Current Quantity</span><span class="font-semibold ${colors.quantity}">${item.currentQuantity} ${item.unit}</span></div>
        <div class="text-gray-500">Min: ${item.minStock} ${item.unit}</div>
        <div class="text-gray-500 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <span>Expires: ${item.expiryDate}</span>
        </div>
        <div class="text-gray-500">Batch: ${item.batchNumber}</div>
        <div class="flex justify-between items-center pt-2 border-t border-gray-100 mt-2">
          <span class="text-gray-600">Price</span>
          <span class="font-bold text-blue-700 text-sm">₱${Number(item.price).toFixed(2)}</span>
        </div>
      </div>
      <div class="flex gap-2 mt-auto">${buttonsHtml}</div>`;
    grid.appendChild(card);
  });
}

/* ================= RENDER: Restock Grid ================= */
function renderRestockRequests() {
  const grid = document.getElementById("restockGrid");
  if (!grid) return;

  if (!filteredRestockRequests.length) {
    grid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500"><p>No restock requests found.</p></div>`;
    return;
  }
  grid.innerHTML = "";

  filteredRestockRequests.forEach(req => {
    const colors = getStatusColors(req.status);
    const stockColor = req.currentQuantity === 0 ? "text-red-700"
                     : req.currentQuantity <= req.minStock ? "text-orange-700" : "text-green-700";

    const isPending = req.status === "pending";
    const reviewBtnHtml = isPending
      ? `<button class="review-request-btn w-full bg-blue-600 text-white py-2 rounded text-xs font-medium hover:bg-blue-700 transition-colors">Review Request</button>`
      : "";

    const card = document.createElement("div");
    card.className = "border border-gray-200 rounded-lg p-4 bg-white shadow-md hover:shadow-lg transition-all duration-200 h-full flex flex-col transform hover:-translate-y-1";
    card.setAttribute("data-request-id", req.id);
    card.innerHTML = `
      <div class="flex justify-between items-start mb-3 gap-2">
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800 text-sm">${req.itemName}</h3>
          <p class="text-xs text-gray-500">${req.type}</p>
          <p class="text-xs text-blue-600 font-mono mt-1">${req.requestType}</p>
        </div>
        <div><span class="px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text} whitespace-nowrap border ${colors.border}">${getStatusDisplayText(req.status)}</span></div>
      </div>
      <div class="space-y-2 mb-4 text-xs flex-1">
        <div class="flex justify-between"><span class="text-gray-600">Current Stock</span><span class="font-semibold ${stockColor}">${req.currentQuantity} ${req.unit}</span></div>
        <div class="flex justify-between"><span class="text-gray-600">Requested</span><span class="font-semibold text-blue-700">${req.requestQuantity} ${req.unit}</span></div>
        <div class="text-gray-500 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          <span>By: ${req.requestedBy}</span>
        </div>
        <div class="text-gray-500 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>${req.requestDate}</span>
        </div>
      </div>
      <div class="flex gap-2 mt-auto">${reviewBtnHtml}</div>`;
    grid.appendChild(card);
  });
}

/* ================= SHOW ITEM DETAILS ================= */
function showItemDetails(item) {
  const modal = document.getElementById("itemDetailsModal");
  if (!modal) return;
  modal.currentItem = item;
  const colors = getStatusColors(item.status);

  document.getElementById("detailsItemName").textContent = item.name;
  document.getElementById("detailsBrand").textContent = `Brand: ${item.type}`;
  document.getElementById("detailsStock").textContent = `${item.currentQuantity} ${item.unit}`;
  document.getElementById("detailsStock").className = `px-4 py-3 text-left font-semibold ${colors.quantity}`;
  document.getElementById("detailsMinStock").textContent = `${item.minStock} ${item.unit}`;
  document.getElementById("detailsUnit").textContent = item.unit || "";
  document.getElementById("detailsPrice").textContent = `₱${Number(item.price || 0).toFixed(2)}`;
  document.getElementById("detailsExpiry").textContent = item.expiryDate || "";
  document.getElementById("detailsDescription").textContent = item.description || "No description available.";
  document.getElementById("detailsCategory").textContent = formatCategory(item.category);
  document.getElementById("detailsCriticalText").textContent = `${item.minStock} ${item.unit || ""}`;

  const statusBadge = document.getElementById("detailsStatusBadge");
  const statusTextContainer = document.getElementById("detailsStatusText");
  if (statusBadge) {
    statusBadge.textContent = getStatusDisplayText(item.status);
    statusBadge.className = `inline-block px-3 py-1 rounded-full text-sm font-medium ${colors.bg} ${colors.text} border ${colors.border}`;
  }
  if (statusTextContainer) {
    statusTextContainer.innerHTML = `<span class="inline-block px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}">${getStatusDisplayText(item.status)}</span>`;
  }

  /* Expiry badge logic */
  const expiryTextEl = document.getElementById("detailsExpiresIn");
  const expiryBadge = document.getElementById("detailsExpiryBadge");
  const parseDate = (str) => { if (!str) return null; return new Date(str); };
  const expDate = parseDate(item.expiryDateISO || item.expiryDate);
  if (expiryTextEl && expiryBadge && expDate && !isNaN(expDate)) {
    const diff = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
    expiryTextEl.textContent = `Expires in ${diff} days`;
    if (diff < 0) {
      expiryBadge.textContent = "Expired";
      expiryBadge.className = "inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200";
    } else if (diff <= 30) {
      expiryBadge.textContent = "Expiring Soon";
      expiryBadge.className = "inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200";
    } else {
      expiryBadge.textContent = "Safe";
      expiryBadge.className = "inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200";
    }
  }

  /* Detail modal buttons */
  const btnCloseTop = getElement(modal, "#closeItemDetails");
  const btnCancel   = getElement(modal, "#closeDetails");
  const btnMove     = getElement(modal, "#moveToArchive");

  const hideDetails = () => { modal.classList.add("hidden"); modal.style.display = ""; };

  if (btnCloseTop) { const n = btnCloseTop.cloneNode(true); btnCloseTop.parentNode.replaceChild(n, btnCloseTop); n.onclick = hideDetails; }
  if (btnCancel)   { const n = btnCancel.cloneNode(true); btnCancel.parentNode.replaceChild(n, btnCancel); n.onclick = hideDetails; }
  if (btnMove) {
    const n = btnMove.cloneNode(true);
    btnMove.parentNode.replaceChild(n, btnMove);
    if (item.archived) {
      n.textContent = "Restore from Archive";
      n.className = "w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors";
      n.onclick = (e) => { e?.stopPropagation?.(); showRestoreConfirm(item); };
    } else {
      n.textContent = "Move to Archive";
      n.className = "w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors";
      n.onclick = (e) => { e?.stopPropagation?.(); showArchiveConfirm(item); };
    }
  }
  modal.classList.remove("hidden");
}

/* ================= REVIEW RESTOCK MODAL ================= */
function showReviewRestockModal(request) {
  const content = `
    <h3 class="text-lg font-semibold mb-1">Review Request Restock</h3>
    <p class="text-sm text-gray-600 mb-4">${request.requestType}</p>
    <div class="space-y-3 text-sm">
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Item Name</span><span class="font-semibold">${request.itemName}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Category</span><span class="font-semibold">${formatCategory(request.category)}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Current Stock</span><span class="font-semibold ${request.currentQuantity === 0 ? "text-red-700" : request.currentQuantity <= request.minStock ? "text-orange-700" : "text-green-700"}">${request.currentQuantity} ${request.unit}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Requested Quantity</span><span class="font-semibold text-blue-700">${request.requestQuantity} ${request.unit}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Requested By</span><span class="font-semibold">${request.requestedBy}</span></div>
      <div class="py-2">
        <label class="block text-xs text-gray-700 mb-1">Approved Quantity</label>
        <input id="approvedQuantity" type="number" min="0" value="${request.requestQuantity}" class="w-full border border-gray-300 rounded px-3 py-2" />
      </div>
      <div class="py-2">
        <label class="block text-xs text-gray-700 mb-1">Notes</label>
        <textarea id="adminNotesInput" rows="3" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Add admin notes..."></textarea>
      </div>
    </div>
    <div class="mt-5 flex gap-5 justify-between">
      <button id="reviewCancelBtn" class="flex-1 border border-gray-300 py-2 px-4 rounded-lg bg-white">Cancel</button>
      <button id="reviewDenyBtn" class="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg">Deny</button>
      <button id="reviewApproveBtn" class="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg">Approve</button>
    </div>`;

  const reviewModal = createModal({ id: "reviewRestockModal", content, width: "500px" });
  reviewModal.currentRequest = request;

  const hide = () => { reviewModal.classList.add("hidden"); reviewModal.style.display = ""; setTimeout(() => reviewModal.remove(), 200); };
  getElement(reviewModal, "#closeReviewRestockModal")?.addEventListener("click", hide);
  getElement(reviewModal, "#reviewCancelBtn")?.addEventListener("click", hide);

  /* DENY */
  getElement(reviewModal, "#reviewDenyBtn")?.addEventListener("click", () => {
    const reason = getElement(reviewModal, "#adminNotesInput")?.value || "";
    showDenyConfirmModal(request, reason, async () => {
      try {
        await apiFetch(API.rejectRequest(request.id), {
          method: "PATCH",
          body: JSON.stringify({ reason }),
        });
        showToast("Request Denied", "success");
        hide();
        await refreshRequests();
      } catch (err) {
        showToast(`Deny failed: ${err.message}`, "error");
      }
    });
  });

  /* APPROVE */
  getElement(reviewModal, "#reviewApproveBtn")?.addEventListener("click", () => {
    const approvedQty = parseInt(getElement(reviewModal, "#approvedQuantity")?.value || request.requestQuantity, 10);
    const adminNotes  = getElement(reviewModal, "#adminNotesInput")?.value || "";
    showApproveConfirmModal(request, approvedQty, adminNotes, async () => {
      try {
        await apiFetch(API.approveRequest(request.id), {
          method: "PATCH",
          body: JSON.stringify({ approvedQuantity: approvedQty }),
        });
        showToast("Request Approved & Stock Updated", "success");
        hide();
        await refreshAll();
      } catch (err) {
        showToast(`Approve failed: ${err.message}`, "error");
      }
    });
  });
}

/* ================= APPROVE CONFIRM ================= */
function showApproveConfirmModal(request, approvedQty, adminNotes, onConfirm) {
  const content = `
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-semibold text-gray-900">Are you sure you want to Approve this request?</h3>
        <p id="approveItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
        <p class="text-sm text-gray-600 mt-1">Note: This will add the item to inventory and remove the request</p>
      </div>
    </div>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <button id="approveCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
      <button id="approveConfirmBtn" class="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">Confirm</button>
    </div>`;
  const m = createModal({ id: "approveConfirmModal", content });
  m.classList.add("hidden"); m.style.display = "none";
  setTimeout(() => { m.classList.remove("hidden"); m.style.display = "flex"; }, 10);

  const nameEl = getElement(m, "#approveItemName");
  if (nameEl) nameEl.textContent = `${request.itemName} (${approvedQty} ${request.unit})`;

  const hide = () => { m.classList.add("hidden"); m.style.display = ""; };
  getElement(m, "#closeApproveConfirmModal")?.addEventListener("click", hide);
  getElement(m, "#approveCancelBtn")?.addEventListener("click", hide);
  getElement(m, "#approveConfirmBtn")?.addEventListener("click", () => { hide(); onConfirm(); });
}

/* ================= DENY CONFIRM ================= */
function showDenyConfirmModal(request, adminNotes, onConfirm) {
  const content = `
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-semibold text-gray-900">Are you sure you want to Deny this request?</h3>
        <p id="denyItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
        <p class="text-sm text-gray-600 mt-1">Note: This will reject the request</p>
      </div>
    </div>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <button id="denyCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
      <button id="denyConfirmBtn" class="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">Confirm</button>
    </div>`;
  const m = createModal({ id: "denyConfirmModal", content });
  m.classList.add("hidden"); m.style.display = "none";
  setTimeout(() => { m.classList.remove("hidden"); m.style.display = "flex"; }, 10);

  const nameEl = getElement(m, "#denyItemName");
  if (nameEl) nameEl.textContent = `${request.itemName} (${request.requestQuantity} ${request.unit})`;

  const hide = () => { m.classList.add("hidden"); m.style.display = ""; };
  getElement(m, "#closeDenyConfirmModal")?.addEventListener("click", hide);
  getElement(m, "#denyCancelBtn")?.addEventListener("click", hide);
  getElement(m, "#denyConfirmBtn")?.addEventListener("click", () => { hide(); onConfirm(); });
}

/* ================= ARCHIVE CONFIRM ================= */
function showArchiveConfirm(item) {
  const detailsModal = document.getElementById("itemDetailsModal");
  const content = `
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-semibold text-gray-900">Are you sure you want to Archive this item?</h3>
        <p id="archiveItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
        <p class="text-sm text-gray-600 mt-1">Note: Archived items can be restored later</p>
      </div>
    </div>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <button id="archiveCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
      <button id="archiveConfirmBtn" class="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">Confirm</button>
    </div>`;
  const m = createModal({ id: "archiveConfirmModal", content });
  m.classList.add("hidden"); m.style.display = "none";
  setTimeout(() => { m.classList.remove("hidden"); m.style.display = "flex"; }, 10);

  const nameEl = getElement(m, "#archiveItemName");
  if (nameEl) nameEl.textContent = item.name || "";
  setTimeout(() => { if (detailsModal) { detailsModal.classList.add("hidden"); detailsModal.style.display = ""; } }, 50);

  const hide = () => { m.classList.add("hidden"); m.style.display = ""; };
  getElement(m, "#closeArchiveConfirmModal")?.addEventListener("click", hide);
  getElement(m, "#archiveCancelBtn")?.addEventListener("click", hide);

  getElement(m, "#archiveConfirmBtn")?.addEventListener("click", async () => {
    try {
      await apiFetch(API.archiveProduct(item.id), { method: "PATCH" });
      showToast("Archived Successfully", "success");
      hide();
      if (detailsModal) { detailsModal.classList.add("hidden"); detailsModal.style.display = ""; }
      await refreshInventory();
    } catch (err) {
      showToast(`Archive failed: ${err.message}`, "error");
    }
  });
}

/* ================= ADD ITEM MODAL ================= */
function showAddItemModal() {
  const content = `
    <h3 class="text-lg font-semibold mb-1">Add Item</h3>
    <p class="text-sm text-gray-600 mb-4">Items will be added directly to inventory</p>
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
          <option value="first-aid">First Aid & Medical Supplies</option><option value="vitamins">Vitamins</option>
          <option value="personal-care">Personal Care</option>
        </select>
        <p id="addCategoryError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Quantity :</label>
        <input id="addQuantity" type="number" min="0" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addQuantityError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Unit :</label>
        <input id="addUnit" placeholder="e.g., tablets, bottles, pieces" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addUnitError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Min Stock Level :</label>
        <input id="addMinStock" type="number" min="0" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addMinStockError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Price (₱) :</label>
        <input id="addPrice" type="number" min="0" step="0.01" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addPriceError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Expiration Date :</label>
        <input id="addExpiry" type="date" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addExpiryError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Batch No. :</label>
        <input id="addBatch" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="addBatchError" class="text-red-600 text-xs mt-1 hidden">Required</p></div>
      <div><label class="block text-xs text-gray-700 mb-1">Description :</label>
        <textarea id="addDescription" rows="3" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Optional description..."></textarea></div>
    </div>
    <div class="mt-5 flex gap-5 justify-between">
      <button id="addCancelBtn" class="flex-1 border border-gray-300 py-2 px-4 rounded-lg bg-white">Cancel</button>
      <button id="addSaveBtn" class="flex-1 bg-emerald-700 text-white py-2 px-4 rounded-lg">Save</button>
    </div>`;
  const addItemModal = createModal({ id: "addItemModal", content, width: "575px" });

  const hide = () => { addItemModal.classList.add("hidden"); addItemModal.style.display = ""; setTimeout(() => addItemModal.remove(), 200); };
  getElement(addItemModal, "#closeAddItemModal")?.addEventListener("click", hide);
  getElement(addItemModal, "#addCancelBtn")?.addEventListener("click", hide);

  getElement(addItemModal, "#addSaveBtn")?.addEventListener("click", async () => {
    const val = (id) => (getElement(addItemModal, id)?.value || "").trim();
    const brand    = val("#addBrand");
    const generic  = val("#addGeneric");
    const category = val("#addCategory");
    const qtyRaw   = val("#addQuantity");
    const qty      = qtyRaw === "" ? NaN : parseInt(qtyRaw, 10);
    const unit     = val("#addUnit");
    const minStockRaw = val("#addMinStock");
    const minStock    = minStockRaw === "" ? NaN : parseInt(minStockRaw, 10);
    const priceRaw = val("#addPrice");
    const price    = priceRaw === "" ? NaN : parseFloat(priceRaw);
    const expiry   = val("#addExpiry");
    const batch    = val("#addBatch");
    const desc     = val("#addDescription");

    const required = { brand: "#addBrand", generic: "#addGeneric", category: "#addCategory", quantity: "#addQuantity", unit: "#addUnit", minStock: "#addMinStock", price: "#addPrice", expiry: "#addExpiry", batch: "#addBatch" };
    let hasError = false;
    Object.entries(required).forEach(([key, sel]) => {
      const el = getElement(addItemModal, sel);
      const errId = `add${key.charAt(0).toUpperCase() + key.slice(1)}Error`;
      const errEl = document.getElementById(errId);
      if (!el?.value || el.value.trim() === "") { errEl?.classList.remove("hidden"); hasError = true; }
      else { errEl?.classList.add("hidden"); }
    });
    if (hasError) return;

    try {
      await apiFetch(API.addProduct, {
        method: "POST",
        body: JSON.stringify({
          name:        generic || brand,
          category:    category || "general",
          quantity:    isNaN(qty)  ? 0 : qty,
          unit:        unit || "pcs",
          unitPrice:   isNaN(price) ? 0 : price,
          minStock:    isNaN(minStock) ? 10 : minStock,
          expiryDate:  expiry || null,
          batchNumber: batch  || null,
          description: desc   || "",
          supplier:    brand  || null,
        }),
      });
      showToast("Item Added Successfully", "success");
      hide();
      await refreshInventory();
    } catch (err) {
      showToast(`Add failed: ${err.message}`, "error");
    }
  });

  addItemModal.classList.remove("hidden");
  addItemModal.style.display = "flex";
}

/* ================= RESTORE CONFIRM ================= */
function showRestoreConfirm(item) {
  const detailsModal = document.getElementById("itemDetailsModal");
  const content = `
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
        <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-semibold text-gray-900">Are you sure you want to Restore this item?</h3>
        <p id="restoreItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
        <p class="text-sm text-gray-600 mt-1">Note: Restored items will be returned to the active inventory list.</p>
      </div>
    </div>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <button id="restoreCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
      <button id="restoreConfirmBtn" class="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors">Confirm</button>
    </div>`;
  const m = createModal({ id: "restoreConfirmModal", content });
  m.classList.add("hidden"); m.style.display = "none";
  setTimeout(() => { m.classList.remove("hidden"); m.style.display = "flex"; }, 10);

  const nameEl = getElement(m, "#restoreItemName");
  if (nameEl) nameEl.textContent = item.name || "";
  setTimeout(() => { if (detailsModal) { detailsModal.classList.add("hidden"); detailsModal.style.display = ""; } }, 50);

  const hide = () => { m.classList.add("hidden"); m.style.display = ""; };
  getElement(m, "#closeRestoreConfirmModal")?.addEventListener("click", hide);
  getElement(m, "#restoreCancelBtn")?.addEventListener("click", hide);

  getElement(m, "#restoreConfirmBtn")?.addEventListener("click", async () => {
    try {
      await apiFetch(API.restoreProduct(item.id), { method: "PATCH" });
      showToast("Restored Successfully", "success");
      hide();
      if (detailsModal) { detailsModal.classList.add("hidden"); detailsModal.style.display = ""; }
      await refreshInventory();
    } catch (err) {
      showToast(`Restore failed: ${err.message}`, "error");
    }
  });
}

/* ================= CLOSE ALL MODALS ================= */
function closeAllModals() {
  ["itemDetailsModal","reviewRestockModal","addItemModal","archiveConfirmModal","restoreConfirmModal","approveConfirmModal","denyConfirmModal"]
    .forEach(id => { const m = document.getElementById(id); if (m) m.classList.add("hidden"); });
}

/* ================= INIT ================= */
export async function initAdminInventory() {
  console.log("=== INIT ADMIN INVENTORY STARTED ===");

  const tabInventory    = document.getElementById("tabInventory");
  const tabRestock      = document.getElementById("tabRestock");
  const inventorySection = document.getElementById("inventorySection");
  const restockSection   = document.getElementById("restockSection");

  /* ---- Tab switching ---- */
  function switchTab(tab) {
    if (tab === "inventory") {
      inventorySection.classList.remove("hidden");
      restockSection.classList.add("hidden");
      tabInventory.classList.add("bg-blue-700", "text-white");
      tabInventory.classList.remove("bg-gray-200", "text-gray-700");
      tabRestock.classList.remove("bg-blue-700", "text-white");
      tabRestock.classList.add("bg-gray-200", "text-gray-700");
      applyFilters();
    } else {
      inventorySection.classList.add("hidden");
      restockSection.classList.remove("hidden");
      tabRestock.classList.add("bg-blue-700", "text-white");
      tabRestock.classList.remove("bg-gray-200", "text-gray-700");
      tabInventory.classList.remove("bg-blue-700", "text-white");
      tabInventory.classList.add("bg-gray-200", "text-gray-700");
      applyRestockFilters();
    }
  }

  tabInventory?.addEventListener("click", () => switchTab("inventory"));
  tabRestock?.addEventListener("click", () => switchTab("restock"));

  /* ---- Inventory status filters ---- */
  document.querySelectorAll(".status-filter").forEach(btn =>
    btn.addEventListener("click", () => { currentStatusFilter = btn.dataset.status; applyFilters(); })
  );

  /* ---- Restock status filters ---- */
  document.querySelectorAll(".status-filter-restock").forEach(btn =>
    btn.addEventListener("click", async () => {
      currentRestockStatusFilter = btn.dataset.status;
      await refreshRequests();
    })
  );

  /* ---- Category dropdowns (inventory) ---- */
  const filterBtn       = document.getElementById("filterBtn");
  const categoryDropdown = document.getElementById("categoryDropdown");
  filterBtn?.addEventListener("click", (e) => { e.stopPropagation(); categoryDropdown.classList.toggle("hidden"); });

  /* ---- Category dropdowns (restock) ---- */
  const filterBtnRestock       = document.getElementById("filterBtnRestock");
  const categoryDropdownRestock = document.getElementById("categoryDropdownRestock");
  filterBtnRestock?.addEventListener("click", (e) => { e.stopPropagation(); categoryDropdownRestock.classList.toggle("hidden"); });

  document.addEventListener("click", (e) => {
    if (!categoryDropdown?.contains(e.target) && e.target !== filterBtn) categoryDropdown?.classList.add("hidden");
    if (!categoryDropdownRestock?.contains(e.target) && e.target !== filterBtnRestock) categoryDropdownRestock?.classList.add("hidden");
  });

  document.querySelectorAll(".category-dropdown-item").forEach(btn =>
    btn.addEventListener("click", () => {
      currentCategoryFilter = btn.dataset.category;
      categoryDropdown.classList.add("hidden");
      filterBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg> ${btn.textContent}`;
      applyFilters();
    })
  );

  document.querySelectorAll(".category-dropdown-item-restock").forEach(btn =>
    btn.addEventListener("click", () => {
      currentRestockCategoryFilter = btn.dataset.category;
      categoryDropdownRestock.classList.add("hidden");
      filterBtnRestock.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg> ${btn.textContent}`;
      applyRestockFilters();
    })
  );

  /* ---- Search inputs ---- */
  document.getElementById("searchInventory")?.addEventListener("input", debounce(applyFilters, 300));
  document.getElementById("searchRestock")?.addEventListener("input", debounce(applyRestockFilters, 300));

  /* ---- Archived toggle ---- */
  const archivedBtn = document.getElementById("archivedBtn");
  archivedBtn?.addEventListener("click", async () => {
    if (showLowStockOnly) return;
    showArchivedItems = !showArchivedItems;
    if (showArchivedItems) {
      archivedBtn.classList.remove("bg-white", "text-red-600");
      archivedBtn.classList.add("bg-red-600", "text-white");
    } else {
      archivedBtn.classList.remove("bg-red-600", "text-white");
      archivedBtn.classList.add("bg-white", "text-red-600");
    }
    await refreshInventory();
  });

  /* ---- Add item ---- */
  document.getElementById("addItemBtn")?.addEventListener("click", showAddItemModal);
  document.getElementById("closeAddItemModal")?.addEventListener("click", closeAllModals);
  document.getElementById("addCancelBtn")?.addEventListener("click", closeAllModals);

  /* ---- Item details modal (static HTML buttons) ---- */
  document.getElementById("closeItemDetails")?.addEventListener("click", closeAllModals);
  document.getElementById("closeDetails")?.addEventListener("click", closeAllModals);

  document.getElementById("moveToArchive")?.addEventListener("click", () => {
    const modal = document.getElementById("itemDetailsModal");
    const item = modal?.currentItem;
    if (item) { closeAllModals(); item.archived ? showRestoreConfirm(item) : showArchiveConfirm(item); }
  });

  document.getElementById("archiveCancelBtn")?.addEventListener("click", closeAllModals);
  document.getElementById("closeReviewModal")?.addEventListener("click", closeAllModals);
  document.getElementById("reviewCancelBtn")?.addEventListener("click", closeAllModals);

  /* ---- Grid delegation: Restock ---- */
  document.getElementById("restockGrid")?.addEventListener("click", (e) => {
    const reviewBtn = e.target.closest(".review-request-btn");
    if (reviewBtn) {
      const card = reviewBtn.closest("[data-request-id]");
      const req = restockRequests.find(r => r.id === card?.dataset.requestId);
      if (req) showReviewRestockModal(req);
    }
  });

  /* ---- Grid delegation: Inventory ---- */
  document.getElementById("inventoryGrid")?.addEventListener("click", (e) => {
    const viewBtn    = e.target.closest(".view-details-btn");
    const restoreBtn = e.target.closest(".restore-btn");

    if (viewBtn) {
      const card = viewBtn.closest("[data-card-id]");
      const item = inventoryItems.find(i => i.id === card?.dataset.cardId);
      if (item) showItemDetails(item);
    } else if (restoreBtn) {
      const itemId = restoreBtn.dataset.itemId;
      const item = inventoryItems.find(i => i.id === itemId);
      if (item) showRestoreConfirm(item);
    }
  });

  /* ---- Backdrop / Escape ---- */
  document.querySelectorAll('[id$="Modal"]').forEach(m =>
    m?.addEventListener("click", (e) => { if (e.target === m) closeAllModals(); })
  );
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllModals(); });

  /* ---- Initial data load ---- */
  updateFilterButtonStyles("#statusFiltersContainer", currentStatusFilter);
  updateFilterButtonStyles("#restockStatusFiltersContainer", currentRestockStatusFilter);

  await refreshAll();
  console.log("Admin Inventory initialized successfully");
}
