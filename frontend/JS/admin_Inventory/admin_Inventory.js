/* =============================================================
   OWNER INVENTORY – fully API-driven  (no mock data)
   Replaces the previous mock-data module.
   Every read / write goes through the backend via apiFetch.
   ============================================================= */
import { apiFetch } from "../utils/apiClient.js";
import {
  ALL_CATEGORIES_LABEL,
  buildAddItemCategoryOptionsMarkup,
  buildFilterCategoryOptionsMarkup,
  isAllCategories,
  normalizeInventoryCategoryKey,
  toCanonicalInventoryCategory,
} from "../utils/inventoryCategories.js";

/* ================= API ENDPOINTS ================= */
const API = {
  activeInventory: "/api/owner/inventory",
  itemDetails: (id) => `/api/owner/inventory/items/${id}`,
  archivedInventory: "/api/owner/inventory/archived",
  addProduct: "/api/owner/inventory",
  pendingRequests: "/api/owner/inventory/requests/pending",
  allRequests: "/api/owner/inventory/requests/all",
  approveRequest: (id) => `/api/owner/inventory/requests/${id}/approve`,
  rejectRequest: (id) => `/api/owner/inventory/requests/${id}/reject`,
  updateProductPrice: (id) => `/api/owner/inventory/${id}/price`,
  archiveProduct: (id) => `/api/owner/inventory/${id}/archive`,
  restoreProduct: (id) => `/api/owner/inventory/${id}/restore`,
  adjustStock: (id) => `/api/owner/inventory/${id}/adjust-stock`,
  updateDiscrepancy: (id) => `/api/owner/inventory/${id}/discrepancy`,
  priceChangeRequests: "/api/owner/inventory/price-change-requests",
  priceChangeRequestForProduct: (id) => `/api/owner/inventory/price-change-requests/product/${id}`,
  approvePriceChangeRequest: (id) => `/api/owner/inventory/price-change-requests/${id}/approve`,
  rejectPriceChangeRequest: (id) => `/api/owner/inventory/price-change-requests/${id}/reject`,
  quantityAdjustments: "/api/owner/quantity-adjustments",
  reviewQuantityAdjustment: (id) => `/api/owner/quantity-adjustments/${id}/review`,
  disposalLogs: "/api/owner/disposal",
  disposalLogDetails: (id) => `/api/owner/disposal/${id}`,
  directDisposal: "/api/owner/disposal/direct",
  approveDisposal: (id) => `/api/owner/disposal/${id}/approve`,
  rejectDisposal: (id) => `/api/owner/disposal/${id}/reject`,
};

/* ================= LOCAL UI STATE ================= */
let inventoryItems = [];
let restockRequests = [];
let filteredItems = [];
let filteredRestockRequests = [];
let currentStatusFilter = "all";
let currentCategoryFilter = ALL_CATEGORIES_LABEL;
let currentRestockStatusFilter = "all";
let currentRestockCategoryFilter = ALL_CATEGORIES_LABEL;
let showArchivedItems = false;
let showLowStockOnly = false;
let currentInventoryPage = 1;
const INVENTORY_ITEMS_PER_PAGE = 8;
const REQUESTS_AUTO_REFRESH_MS = 30000;
let requestsAutoRefreshTimer = null;

/* ================= STATUS MAPS  (DB → UI) ================= */
const DB_STATUS_TO_UI = {
  available: "in-stock",
  low: "low-stock",
  out: "out-of-stock",
};

const API_STATUS_TO_UI = {
  IN_STOCK: "in-stock",
  LOW_STOCK: "low-stock",
  OUT_OF_STOCK: "out-of-stock",
};

const DB_REQUEST_STATUS_TO_UI = {
  pending: "pending",
  approved: "approved",
  rejected: "denied",
};

const DB_ADJUSTMENT_STATUS_TO_UI = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "denied",
};

/* ================= FILTER & COLOR CONFIGS ================= */
const FILTER_CONFIG = {
  all: { activeBg: 'bg-blue-600', activeText: 'text-white', activeBorder: 'border-blue-600', hoverBg: 'hover:bg-blue-50', hoverBorder: 'hover:border-blue-500', hoverText: 'hover:text-blue-700' },
  'in-stock': { activeBg: 'bg-green-600', activeText: 'text-white', activeBorder: 'border-green-600', hoverBg: 'hover:bg-green-50', hoverBorder: 'hover:border-green-500', hoverText: 'hover:text-green-700' },
  safe: { activeBg: 'bg-emerald-600', activeText: 'text-white', activeBorder: 'border-emerald-600', hoverBg: 'hover:bg-emerald-50', hoverBorder: 'hover:border-emerald-500', hoverText: 'hover:text-emerald-700' },
  'near-expiry': { activeBg: 'bg-amber-500', activeText: 'text-white', activeBorder: 'border-amber-500', hoverBg: 'hover:bg-amber-50', hoverBorder: 'hover:border-amber-500', hoverText: 'hover:text-amber-700' },
  'at-risk': { activeBg: 'bg-red-600', activeText: 'text-white', activeBorder: 'border-red-600', hoverBg: 'hover:bg-red-50', hoverBorder: 'hover:border-red-500', hoverText: 'hover:text-red-700' },
  pending: { activeBg: 'bg-yellow-500', activeText: 'text-white', activeBorder: 'border-yellow-500', hoverBg: 'hover:bg-yellow-50', hoverBorder: 'hover:border-yellow-500', hoverText: 'hover:text-yellow-700' },
  'low-stock': { activeBg: 'bg-orange-500', activeText: 'text-white', activeBorder: 'border-orange-500', hoverBg: 'hover:bg-orange-50', hoverBorder: 'hover:border-orange-500', hoverText: 'hover:text-orange-700' },
  'out-of-stock': { activeBg: 'bg-red-700', activeText: 'text-white', activeBorder: 'border-red-700', hoverBg: 'hover:bg-red-50', hoverBorder: 'hover:border-red-600', hoverText: 'hover:text-red-700' },
  approved: { activeBg: 'bg-green-600', activeText: 'text-white', activeBorder: 'border-green-600', hoverBg: 'hover:bg-green-50', hoverBorder: 'hover:border-green-500', hoverText: 'hover:text-green-700' },
  denied: { activeBg: 'bg-red-600', activeText: 'text-white', activeBorder: 'border-red-600', hoverBg: 'hover:bg-red-50', hoverBorder: 'hover:border-red-500', hoverText: 'hover:text-red-700' },
};

const STATUS_COLORS = {
  'in-stock': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-500', quantity: 'text-green-700' },
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500', quantity: 'text-yellow-700' },
  'low-stock': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-500', quantity: 'text-orange-700' },
  'out-of-stock': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500', quantity: 'text-red-700' },
  archived: { bg: 'bg-gray-400', text: 'text-white', border: 'border-gray-500', quantity: 'text-gray-700' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-500', quantity: 'text-blue-700' },
  denied: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500', quantity: 'text-red-700' },
};

const STATUS_DISPLAY = {
  'in-stock': 'In Stock', pending: 'Pending', 'low-stock': 'Low Stock',
  'out-of-stock': 'Out of Stock', archived: 'Archived', approved: 'Approved', denied: 'Rejected',
};

const STATUS_SORT_PRIORITY = {
  pending: 0,
  'out-of-stock': 1,
  'low-stock': 2,
  'in-stock': 3,
};

const REQUEST_STATUS_SORT_PRIORITY = {
  pending: 1,
  approved: 2,
  denied: 3,
};

const Z_INDEX = { MODAL_BASE: 10000, MODAL_OVERLAY: 9999, TOAST: 20000 };
const EXPIRY_WARNING_DAYS = 7;

/* ================= DATA MAPPING (backend → UI) ================= */
function mapBackendItemToUI(p) {
  const batches = Array.isArray(p.batches)
    ? p.batches.map((batch) => ({
      id: batch._id,
      batchNumber: batch.batchNumber || "—",
      quantity: Number(batch.quantity ?? 0),
      currentQuantity: Number(batch.currentQuantity ?? batch.quantity ?? 0),
      originalQuantity: Number(batch.originalQuantity ?? batch.quantity ?? 0),
      supplier: batch.supplier || "—",
      createdAt: batch.createdAt || null,
      expiryDateISO: batch.expiryDate ? new Date(batch.expiryDate).toISOString().split("T")[0] : "",
      expiryDate: batch.expiryDate ? formatDateDisplay(batch.expiryDate, "N/A") : "N/A",
      expiryRisk: mapExpiryRiskToUi(batch.expiryRisk || null),
      status: batch.status || null,
      statusKey: batch.statusKey || "active",
      canDispose: (Number(batch.currentQuantity ?? batch.quantity ?? 0) > 0) && (batch.statusKey !== "disposed") && (!batch.isPendingDisposal),
      isExpired: !!batch.isExpired,
      isImmediateReview: !!batch.isImmediateReview,
      isPendingDisposal: !!batch.isPendingDisposal,
    }))
    : [];

  const nearestExpiry = p.nearestExpiryDate || p.expiryDate || null;
  const batchCount = Number.isFinite(Number(p.batchCount)) ? Number(p.batchCount) : batches.length;
  const apiStockStatus = String(p.stockStatus || "").trim().toUpperCase();
  const resolvedStatus = p.isArchived
    ? "archived"
    : (API_STATUS_TO_UI[apiStockStatus] || DB_STATUS_TO_UI[p.status] || "in-stock");

  return {
    id: String(p._id || p.itemId || ""),
    name: p.name || p.itemName || "",
    type: p.brandName || p.brand || "",              // brand column
    category: toCanonicalInventoryCategory(p.category || ""),
    currentQuantity: p.currentQuantity ?? p.quantity ?? 0,
    minStock: p.minStock ?? 10,
    unit: p.unit || "pcs",
    supplier: p.nearestBatchSupplier || p.supplier || p.supplierName || "—",
    status: resolvedStatus,
    expiryDate: nearestExpiry ? formatDateDisplay(nearestExpiry, "—") : "—",
    expiryDateISO: nearestExpiry ? new Date(nearestExpiry).toISOString().split("T")[0] : "",
    batchNumber: p.nearestBatchNumber || p.batchNumber || "—",
    batchCount,
    batches,
    expiryRisk: mapExpiryRiskToUi(p.expiryRisk || p.expiryRiskKey || null),
    archived: !!p.isArchived,
    price: p.unitPrice ?? 0,
    description: p.description || "",
    genericName: p.genericName || p.generic || "",
    brandName: p.brandName || p.brand || "",
    medicineName: p.medicineName || p.name || p.itemName || "",
    dosageForm: p.dosageForm || p.dosage || "",
    strength: p.strength || p.Strength || p.dose || p.dosageStrength || "",
    expectedRemaining: Number.isFinite(Number(p.expectedRemaining))
      ? Number(p.expectedRemaining)
      : Number(p.quantity ?? 0),
    physicalCount: Number.isFinite(Number(p.physicalCount))
      ? Number(p.physicalCount)
      : Number(p.expectedRemaining ?? p.quantity ?? 0),
    variance: Number.isFinite(Number(p.variance))
      ? Number(p.variance)
      : Number(p.physicalCount ?? p.quantity ?? 0) - Number(p.expectedRemaining ?? p.quantity ?? 0),
    discrepancyStatus: p.discrepancyStatus || "Balanced",
    hasPendingDisposalOnlyStock: p.hasPendingDisposalOnlyStock === true,
  };
}

function mapExpiryRiskToUi(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "green" || normalized === "safe") return "safe";
  if (normalized === "yellow" || normalized === "near-expiry" || normalized === "near expiry") return "near-expiry";
  if (normalized === "red" || normalized === "at-risk" || normalized === "at risk") return "at-risk";
  if (normalized === "expired") return "expired";
  return "no-expiry";
}

function getExpiryRiskPill(expiryRisk, options = {}) {
  if (options.pendingDisposalOnly === true) {
    return { label: "Under Review", textClass: "text-amber-700", dotColor: "#f59e0b" };
  }

  const normalized = mapExpiryRiskToUi(expiryRisk);
  if (normalized === "safe") {
    return { label: "Safe", textClass: "text-emerald-700", dotColor: "#16a34a" };
  }
  if (normalized === "near-expiry") {
    return { label: "Near-Expiry", textClass: "text-amber-700", dotColor: "#f59e0b" };
  }
  if (normalized === "at-risk") {
    return { label: "Immediate Review", textClass: "text-red-700", dotColor: "#ef4444" };
  }
  if (normalized === "expired") {
    return { label: "Expired", textClass: "text-red-800", dotColor: "#991b1b" };
  }
  return { label: "No Expiry", textClass: "text-gray-600", dotColor: "#9ca3af" };
}

function getBatchStatusPill(batch) {
  const normalizedStatus = String(batch?.statusKey || "").trim().toLowerCase();
  if (normalizedStatus === "pending-disposal") {
    return { label: "Pending Disposal", textClass: "text-orange-700", dotColor: "#f97316" };
  }
  if (normalizedStatus === "disposed") {
    return { label: "Disposed", textClass: "text-red-700", dotColor: "#dc2626" };
  }
  if (normalizedStatus === "empty" || normalizedStatus === "out-of-stock") {
    return { label: "Out of Stock", textClass: "text-slate-600", dotColor: "#94a3b8" };
  }
  if (normalizedStatus === "expired") {
    return { label: "Expired", textClass: "text-red-800", dotColor: "#991b1b" };
  }
  if (normalizedStatus === "immediate-review") {
    return { label: "Immediate Review", textClass: "text-red-700", dotColor: "#ef4444" };
  }
  return { label: "Active", textClass: "text-emerald-700", dotColor: "#16a34a" };
}

function mapBackendRequestToUI(r) {
  const isRestock = r.requestType === "RESTOCK";
  const submittedAt = r.date_requested || r.createdAt || null;
  const requestDate = submittedAt
    ? new Date(submittedAt).toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    : "-";

  const product = r.product || {};
  return {
    id: r._id,
    requestType: r.requestType,
    itemName: isRestock ? (product.name || "Unknown") : (r.itemName || "Unknown"),
    type: isRestock ? (product.name || "Unknown") : (r.itemName || "Unknown"),
    category: toCanonicalInventoryCategory(isRestock ? (product.category || "") : (r.category || "")),
    currentQuantity: isRestock ? (product.quantity ?? 0) : 0,
    minStock: isRestock ? 10 : 10,       // product minStock not populated; safe default
    unit: r.unit || "pcs",
    requestQuantity: isRestock ? (r.requestedQuantity ?? 0) : (r.initialQuantity ?? 0),
    requestedBy: r.requestedBy?.name || r.requestedByName || "Staff",
    requestDate,
    status: DB_REQUEST_STATUS_TO_UI[r.status] || r.status,
    supplier: "",
    productId: isRestock ? (product._id || null) : null,
    notes: r.rejectionReason || "",
    submittedAt,
  };
}

function mapBackendDiscrepancyToUI(r) {
  const submittedAt = r.date_requested || r.createdAt || null;
  const requestDate = submittedAt
    ? new Date(submittedAt).toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    : "—";

  return {
    id: String(r._id),
    requestType: "DISCREPANCY",
    itemName: r.productName || "Unknown",
    type: r.productName || "Unknown",
    category: r.productId?.category || "",
    currentQuantity: Number(r.systemQuantity ?? 0),
    minStock: 0,
    unit: "",
    requestQuantity: Number(r.actualQuantity ?? 0),
    requestedBy: r.staffName || r.staffId?.name || "Staff",
    requestDate,
    status: DB_ADJUSTMENT_STATUS_TO_UI[r.status] || "pending",
    supplier: "",
    productId: String(r.productId?._id || r.productId || ""),
    notes: r.rejectionReason || "",
    isDiscrepancy: true,
    systemQuantity: Number(r.systemQuantity ?? 0),
    actualQuantity: Number(r.actualQuantity ?? 0),
    variance: Number(r.difference ?? 0),
    reason: r.reason || "",
    submittedAt,
  };
}

function mapBackendDisposalToUI(r) {
  const submittedAt = r.date_requested || r.dateRequested || r.createdAt || null;
  const requestDate = submittedAt
    ? new Date(submittedAt).toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    : "-";

  const normalizedStatus = String(r.status || "").trim().toLowerCase();
  const uiStatus = normalizedStatus === "pending"
    ? "pending"
    : normalizedStatus === "rejected"
      ? "denied"
      : "approved";

  return {
    id: String(r.id || r._id || ""),
    requestType: "DISPOSAL",
    itemName: r.itemName || "Unknown",
    type: r.genericName || r.itemName || "Disposal Request",
    category: "",
    currentQuantity: 0,
    minStock: 0,
    unit: "pcs",
    requestQuantity: Number(r.quantity_requested ?? r.quantityDisposed ?? 0),
    requestedBy: r.requestedBy?.name || r.requestedByName || "Unknown",
    requestDate,
    status: uiStatus,
    supplier: "",
    productId: String(r.itemId || ""),
    notes: r.remarks || r.reason || "",
    submittedAt,
    reason: r.reason || "",
    batchNumber: r.batchNumber || "-",
    referenceId: r.referenceId || "",
    isDisposal: true,
  };
}

function mapBackendPriceChangeToUI(r) {
  const submittedAt = r.createdAt || null;
  const requestDate = submittedAt
    ? new Date(submittedAt).toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    : "-";

  return {
    id: String(r._id || ""),
    requestType: "PRICE_CHANGE",
    itemName: r.productName || "Unknown",
    type: "Price Update",
    category: "Medicine",
    currentQuantity: 0,
    minStock: 0,
    unit: "",
    requestQuantity: 0,
    requestedBy: r.requestedByName || "Staff",
    requestDate,
    status: String(r.status || "pending").toLowerCase() === "rejected" ? "denied" : String(r.status || "pending").toLowerCase(),
    supplier: "",
    productId: String(r.productId || ""),
    notes: r.reason || "",
    submittedAt,
    oldPrice: Number(r.oldPrice ?? 0),
    requestedPrice: Number(r.requestedPrice ?? 0),
    reason: r.reason || "",
    isPriceChange: true,
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

async function fetchDiscrepancyRequests() {
  try {
    const res = await apiFetch(API.quantityAdjustments);
    return (res?.data || []).map(mapBackendDiscrepancyToUI);
  } catch (err) {
    showToast(`Failed to load discrepancy requests: ${err.message}`, "error");
    return [];
  }
}

async function fetchDisposalRequests() {
  try {
    const res = await apiFetch(API.disposalLogs);
    return (res?.data || []).map(mapBackendDisposalToUI);
  } catch (err) {
    showToast(`Failed to load disposal requests: ${err.message}`, "error");
    return [];
  }
}

async function fetchPriceChangeRequests() {
  try {
    const res = await apiFetch(`${API.priceChangeRequests}?status=pending`);
    return (res?.data || []).map(mapBackendPriceChangeToUI);
  } catch (err) {
    showToast(`Failed to load price change requests: ${err.message}`, "error");
    return [];
  }
}

async function refreshInventory() {
  if (showArchivedItems) {
    inventoryItems = await fetchArchivedItems();
  } else {
    inventoryItems = await fetchInventoryItems();
  }
  renderInventoryCategorySelect(inventoryItems);
  applyFilters();
}

async function refreshRequests() {
  const [inventoryReqs, discrepancyReqs, disposalReqs, priceChangeReqs] = await Promise.all([
    fetchAllRequests(),
    fetchDiscrepancyRequests(),
    fetchDisposalRequests(),
    fetchPriceChangeRequests(),
  ]);

  restockRequests = [...inventoryReqs, ...discrepancyReqs, ...disposalReqs, ...priceChangeReqs];
  renderRestockCategorySelect(restockRequests);
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
function getRequestTimestamp(request) {
  const raw = request?.submittedAt || request?.date_requested || request?.createdAt || null;
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}
function getRequestStatusSortPriority(status) {
  const normalized = normalizeStatus(status);
  return Object.prototype.hasOwnProperty.call(REQUEST_STATUS_SORT_PRIORITY, normalized)
    ? REQUEST_STATUS_SORT_PRIORITY[normalized]
    : Number.MAX_SAFE_INTEGER;
}
function getFilterConfig(status) { return FILTER_CONFIG[normalizeStatus(status)] || FILTER_CONFIG["all"]; }
function getStatusColors(status) { return STATUS_COLORS[normalizeStatus(status)] || STATUS_COLORS["in-stock"]; }
function getStatusDisplayText(status) { return STATUS_DISPLAY[normalizeStatus(status)] || "In Stock"; }
function formatCategory(cat) {
  if (!cat) return "";
  return toCanonicalInventoryCategory(cat);
}
function getStatusSortPriority(status) {
  const normalized = normalizeStatus(status);
  return Object.prototype.hasOwnProperty.call(STATUS_SORT_PRIORITY, normalized)
    ? STATUS_SORT_PRIORITY[normalized]
    : Number.MAX_SAFE_INTEGER;
}

function formatDateDisplay(value, fallback = "N/A") {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function normalizeCategoryKey(value) {
  return normalizeInventoryCategoryKey(value).replace(/\s+/g, "-");
}

function getCategoryOptions(items = []) {
  return Array.isArray(items) ? items : [];
}

function renderInventoryCategorySelect(items = inventoryItems) {
  const categorySelect = document.getElementById("categoryFilterSelect");
  if (!categorySelect) return;

  const selectedValue = currentCategoryFilter || ALL_CATEGORIES_LABEL;
  categorySelect.innerHTML = buildFilterCategoryOptionsMarkup(selectedValue);

  const hasSelection = categorySelect.querySelector(`option[value="${selectedValue}"]`) !== null;
  currentCategoryFilter = hasSelection ? selectedValue : ALL_CATEGORIES_LABEL;
  categorySelect.value = currentCategoryFilter;
  categorySelect.classList.toggle("border-blue-500", !isAllCategories(currentCategoryFilter));
  categorySelect.classList.toggle("bg-blue-50", !isAllCategories(currentCategoryFilter));
}

function renderRestockCategorySelect(items = restockRequests) {
  const categorySelect = document.getElementById("categoryFilterSelectRestock");
  if (!categorySelect) return;

  const selectedValue = currentRestockCategoryFilter || ALL_CATEGORIES_LABEL;
  categorySelect.innerHTML = buildFilterCategoryOptionsMarkup(selectedValue);

  const hasSelection = categorySelect.querySelector(`option[value="${selectedValue}"]`) !== null;
  currentRestockCategoryFilter = hasSelection ? selectedValue : ALL_CATEGORIES_LABEL;
  categorySelect.value = currentRestockCategoryFilter;
  categorySelect.classList.toggle("border-blue-500", !isAllCategories(currentRestockCategoryFilter));
  categorySelect.classList.toggle("bg-blue-50", !isAllCategories(currentRestockCategoryFilter));
}

function getExpiryMeta(expiryValue) {
  if (!expiryValue) {
    return {
      date: null,
      diffDays: null,
      badgeText: "Unknown",
      badgeClass: "text-xs font-medium text-gray-600",
      dotHtml: "",
    };
  }

  const date = new Date(expiryValue);
  if (Number.isNaN(date.getTime())) {
    return {
      date: null,
      diffDays: null,
      badgeText: "Unknown",
      badgeClass: "text-xs font-medium text-gray-600",
      dotHtml: "",
    };
  }

  const diffDays = Math.ceil((date - new Date()) / 86400000);
  if (diffDays < 0) {
    return {
      date,
      diffDays,
      badgeText: "Expired",
      badgeClass: "text-xs font-medium text-red-700",
      dotHtml: '<span class="w-3 h-3 rounded-full bg-red-600 inline-block ml-1" title="Expired"></span>',
    };
  }

  if (diffDays <= EXPIRY_WARNING_DAYS) {
    return {
      date,
      diffDays,
      badgeText: "Expiring Soon",
      badgeClass: "text-xs font-medium text-red-600",
      dotHtml: '<span class="w-3 h-3 rounded-full bg-red-500 inline-block ml-1" title="Expiring soon"></span>',
    };
  }

  if (diffDays <= 30) {
    return {
      date,
      diffDays,
      badgeText: "Expiring Soon",
      badgeClass: "text-xs font-medium text-orange-600",
      dotHtml: '<span class="w-3 h-3 rounded-full bg-orange-400 inline-block ml-1" title="Expiring soon"></span>',
    };
  }

  return {
    date,
    diffDays,
    badgeText: "Safe",
    badgeClass: "text-xs font-medium text-green-600",
    dotHtml: "",
  };
}

function getModalStatusTextClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "in-stock") return "text-sm font-medium text-green-600";
  if (normalized === "low-stock") return "text-sm font-medium text-orange-600";
  if (normalized === "out-of-stock") return "text-sm font-medium text-red-700";
  if (normalized === "pending") return "text-sm font-medium text-yellow-600";
  if (normalized === "archived") return "text-sm font-medium text-gray-600";
  return "text-sm font-medium text-gray-700";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateBatchNumber(request) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const key = (request?.itemName || "ITEM").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "ITEM";
  return `RST-${key}-${stamp}`;
}

function hasExpiringSoonBatch(batches) {
  if (!Array.isArray(batches) || !batches.length) return false;
  return batches.some((batch) => {
    if (!batch?.expiryDateISO) return false;
    const meta = getExpiryMeta(batch.expiryDateISO);
    return Number.isFinite(meta.diffDays) && meta.diffDays >= 0 && meta.diffDays <= EXPIRY_WARNING_DAYS;
  });
}

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

/* ================= VOICE RECOGNITION HELPER ================= */
function initVoiceRecognitionForModal(modal) {
  const voiceBtn = getElement(modal, '#voiceInputBtn');
  const descriptionField = getElement(modal, '#addDescription');
  const micIcon = getElement(modal, '#micIcon');
  const statusText = getElement(modal, '#voiceStatusText');
  const errorText = getElement(modal, '#voiceErrorText');

  if (!voiceBtn || !descriptionField) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-PH';

  let isListening = false;
  // Text that was in the field before recording started
  let baseText = '';
  // Accumulated finalized transcripts from previous result segments
  let finalizedText = '';

  function setListeningUI(active) {
    isListening = active;
    if (active) {
      micIcon.classList.remove('text-gray-500');
      micIcon.classList.add('text-red-600', 'animate-pulse');
      statusText.classList.remove('hidden');
    } else {
      micIcon.classList.remove('text-red-600', 'animate-pulse');
      micIcon.classList.add('text-gray-500');
      statusText.classList.add('hidden');
    }
  }

  voiceBtn.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
      errorText.classList.add('hidden');
    } else {
      try {
        // Capture whatever text the user has already typed
        baseText = descriptionField.value;
        finalizedText = '';
        recognition.start();
        setListeningUI(true);
        errorText.classList.add('hidden');
      } catch (err) {
        errorText.textContent = 'Failed to start voice recognition';
        errorText.classList.remove('hidden');
      }
    }
  });

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let newFinal = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        newFinal += text;
      } else {
        interimTranscript += text;
      }
    }

    if (newFinal) {
      finalizedText += newFinal;
    }

    // Build the full textarea value: base text + finalized speech + live interim
    const separator = baseText && !baseText.endsWith(' ') ? ' ' : '';
    descriptionField.value = baseText + separator + (finalizedText + interimTranscript).trimStart();
  };

  recognition.onend = () => {
    setListeningUI(false);
  };

  recognition.onerror = (event) => {
    setListeningUI(false);

    // 'aborted' fires when user clicks stop – not a real error
    if (event.error === 'aborted') return;

    let errorMessage = 'Voice recognition error';
    if (event.error === 'no-speech') {
      errorMessage = 'No speech detected. Please try again.';
    } else if (event.error === 'audio-capture') {
      errorMessage = 'No microphone found or permission denied.';
    } else if (event.error === 'not-allowed') {
      errorMessage = 'Microphone access denied. Please allow microphone access.';
    } else if (event.error === 'network') {
      errorMessage = 'Network error. Please check your connection.';
    }

    errorText.textContent = errorMessage;
    errorText.classList.remove('hidden');
    setTimeout(() => { errorText.classList.add('hidden'); }, 5000);
  };
}

/* ================= FILTER BUTTONS ================= */
function updateFilterButtonStyles(containerSelector, activeStatus) {
  document.querySelectorAll(`${containerSelector} .status-filter, ${containerSelector} .status-filter-restock`).forEach(btn => {
    const status = btn.dataset.status;
    const cfg = getFilterConfig(status);
    const active = status === activeStatus;
    let cls = "status-filter px-3 py-0.5 rounded-full border text-xs shadow-sm transition-all cursor-pointer ";
    cls += active
      ? `${cfg.activeBg} ${cfg.activeText} ${cfg.activeBorder}`
      : `bg-white text-gray-700 border-gray-300 ${cfg.hoverBg} ${cfg.hoverBorder} ${cfg.hoverText}`;
    btn.className = cls;
  });
}

/* ================= FILTERS & RENDERS ================= */
function applyFilters() {
  const search = (document.getElementById("searchInventory")?.value || "").toLowerCase();
  const riskFilters = new Set(["safe", "near-expiry", "at-risk"]);
  filteredItems = inventoryItems.filter(item => {
    if (showArchivedItems) { if (!item.archived) return false; }
    else { if (item.archived) return false; }
    const matchSearch = (item.name || "").toLowerCase().includes(search) ||
      (item.type || "").toLowerCase().includes(search) ||
      (item.id || "").toLowerCase().includes(search);
    const matchStatus = (() => {
      if (currentStatusFilter === "all") return true;
      if (riskFilters.has(currentStatusFilter)) return item.expiryRisk === currentStatusFilter;
      return item.status === currentStatusFilter;
    })();
    const itemCategoryKey = normalizeCategoryKey(item.category);
    const activeCategoryKey = normalizeCategoryKey(currentCategoryFilter);
    const matchCategory = isAllCategories(currentCategoryFilter) || itemCategoryKey === activeCategoryKey;
    const matchStockFilter = !showLowStockOnly || item.status === "low-stock" || item.status === "out-of-stock";
    return matchSearch && matchStatus && matchCategory && matchStockFilter;
  });
  filteredItems.sort((a, b) => getStatusSortPriority(a.status) - getStatusSortPriority(b.status));

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / INVENTORY_ITEMS_PER_PAGE));
  if (currentInventoryPage > totalPages) {
    currentInventoryPage = totalPages;
  }

  updateFilterButtonStyles("#statusFiltersContainer", currentStatusFilter);
  renderInventory();
}

function applyRestockFilters() {
  const search = (document.getElementById("searchRestock")?.value || "").toLowerCase();
  filteredRestockRequests = restockRequests.filter(req => {
    const matchSearch = (req.itemName || "").toLowerCase().includes(search) ||
      (req.id || "").toLowerCase().includes(search) ||
      (req.type || "").toLowerCase().includes(search);
    const matchStatus = currentRestockStatusFilter === "all" || req.status === currentRestockStatusFilter;
    const requestCategoryKey = normalizeCategoryKey(req.category);
    const activeCategoryKey = normalizeCategoryKey(currentRestockCategoryFilter);
    const matchCategory = isAllCategories(currentRestockCategoryFilter) || requestCategoryKey === activeCategoryKey;
    return matchSearch && matchStatus && matchCategory;
  });

  filteredRestockRequests.sort((a, b) => {
    if (currentRestockStatusFilter === "all") {
      const priorityDiff = getRequestStatusSortPriority(a.status) - getRequestStatusSortPriority(b.status);
      if (priorityDiff !== 0) return priorityDiff;
    }
    return getRequestTimestamp(b) - getRequestTimestamp(a);
  });

  updateFilterButtonStyles("#restockStatusFiltersContainer", currentRestockStatusFilter);
  renderRestockRequests();
}

/* ================= RENDER: Inventory Grid ================= */
function renderInventory() {
  const grid = document.getElementById("inventoryGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const startIndex = (currentInventoryPage - 1) * INVENTORY_ITEMS_PER_PAGE;
  const endIndex = startIndex + INVENTORY_ITEMS_PER_PAGE;
  const pagedItems = filteredItems.slice(startIndex, endIndex);

  if (!filteredItems.length) {
    grid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500"><p>No items found matching your criteria.</p></div>`;
    renderInventoryPagination(0, 0, 0, 1);
    return;
  }

  pagedItems.forEach(item => {
    const hasBatchWarning = hasExpiringSoonBatch(item.batches || []);
    const riskPill = getExpiryRiskPill(item.expiryRisk, {
      pendingDisposalOnly: item.hasPendingDisposalOnlyStock === true,
    });

    const colors = getStatusColors(item.status);
    const statusText = getStatusDisplayText(item.status);
    const archivedPill = item.archived ? `<span class="ml-2 inline-block px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">Archived</span>` : "";

    const card = document.createElement("div");
    card.className = "border border-gray-200 rounded-lg p-4 bg-white shadow-md hover:shadow-lg transition-all duration-200 h-full flex flex-col transform hover:-translate-y-1";
    card.setAttribute("data-card-id", item.id);
    card.innerHTML = `
      <div class="flex justify-between items-start mb-3 gap-2">
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800 text-sm">${item.genericName || item.name}</h3>
          <p class="text-xs text-gray-500">${item.brandName || ""}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text} whitespace-nowrap border ${colors.border}">${statusText}</span>
          ${archivedPill}
        </div>
      </div>
      <div class="space-y-2 mb-4 text-xs flex-1">
        <div class="flex justify-between"><span class="text-gray-600">Current Quantity</span><span class="font-semibold ${colors.quantity}">${item.currentQuantity} ${item.unit}</span></div>
        <div class="text-gray-500">Strength: ${(String(item.strength || "").trim()) || "N/A"}</div>
        <div class="text-gray-500 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <span>Next Expiry: ${item.expiryDate}</span>
          ${hasBatchWarning ? '<span class="w-3 h-3 rounded-full bg-red-600 inline-block ml-1" title="Contains batch expiring soon"></span>' : ''}
        </div>
        <div class="inline-flex items-center gap-1 ${riskPill.textClass}">
          <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${riskPill.dotColor};"></span>
          <span>${riskPill.label}</span>
        </div>
        <div class="text-gray-500">Batches: ${item.batchCount || 0}</div>
        <div class="flex justify-between items-center pt-2 border-t border-gray-100 mt-2">
          <span class="text-gray-600">Price</span>
          <span class="font-bold text-blue-700 text-sm">₱${Number(item.price).toFixed(2)}</span>
        </div>
      </div>
      <div class="flex flex-col gap-2 mt-auto">
        <div class="flex gap-2">
          <button class="view-details-btn flex-1 border border-gray-300 py-2 rounded text-xs font-medium hover:bg-gray-100 transition-colors">View Details</button>
          ${item.archived
        ? `<button class="restore-btn flex-1 bg-emerald-600 text-white py-2 rounded text-xs font-medium hover:bg-emerald-700 transition-colors" data-item-id="${item.id}">Restore</button>`
        : `<button class="edit-discrepancy-btn flex-1 bg-amber-500 text-white py-2 rounded text-xs font-medium hover:bg-amber-600 transition-colors" data-item-id="${item.id}">Edit Discrepancy</button>`
      }
        </div>
        ${!item.archived
        ? `<button class="archive-btn w-full border border-gray-400 bg-gray-50 text-gray-700 py-2 rounded text-xs font-medium hover:bg-gray-100 transition-colors" data-item-id="${item.id}">Archive</button>`
        : ''
      }
      </div>`;
    grid.appendChild(card);
  });

  renderInventoryPagination(startIndex + 1, Math.min(endIndex, filteredItems.length), filteredItems.length, Math.ceil(filteredItems.length / INVENTORY_ITEMS_PER_PAGE));
}

function renderInventoryPagination(start, end, total, totalPages) {
  const pageInfo = document.getElementById("inventoryPageInfo");
  const pageNumber = document.getElementById("inventoryPageNumber");
  const prevBtn = document.getElementById("inventoryPrevPage");
  const nextBtn = document.getElementById("inventoryNextPage");

  if (pageInfo) {
    pageInfo.textContent = `Showing ${start} to ${end} of ${total} items`;
  }
  if (pageNumber) {
    pageNumber.textContent = `Page ${currentInventoryPage} of ${Math.max(1, totalPages)}`;
  }
  if (prevBtn) {
    prevBtn.disabled = currentInventoryPage <= 1 || total === 0;
  }
  if (nextBtn) {
    nextBtn.disabled = currentInventoryPage >= Math.max(1, totalPages) || total === 0;
  }
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

    const discrepancyDetails = req.requestType === "DISCREPANCY"
      ? `
        <div class="flex justify-between"><span class="text-gray-600">System Quantity</span><span class="font-semibold text-gray-900">${req.systemQuantity}</span></div>
        <div class="flex justify-between"><span class="text-gray-600">Actual Quantity</span><span class="font-semibold text-blue-700">${req.actualQuantity}</span></div>
        <div class="flex justify-between"><span class="text-gray-600">Variance</span><span class="font-semibold ${req.variance === 0 ? "text-green-700" : "text-amber-700"}">${req.variance >= 0 ? "+" : ""}${req.variance}</span></div>
        <div class="text-gray-500 border-t pt-2 mt-1"><span class="font-medium text-gray-700">Reason:</span> ${escapeHtml(req.reason || "No reason provided")}</div>
      `
      : req.requestType === "DISPOSAL"
        ? `
          <div class="flex justify-between"><span class="text-gray-600">Batch Number</span><span class="font-semibold text-gray-900">${escapeHtml(req.batchNumber || "-")}</span></div>
          <div class="flex justify-between"><span class="text-gray-600">Quantity Requested</span><span class="font-semibold text-red-700">${req.requestQuantity} ${req.unit}</span></div>
          <div class="text-gray-500 border-t pt-2 mt-1"><span class="font-medium text-gray-700">Reason:</span> ${escapeHtml(req.reason || "No reason provided")}</div>
        `
        : req.requestType === "PRICE_CHANGE"
          ? `
          <div class="flex justify-between"><span class="text-gray-600">Current Price</span><span class="font-semibold text-gray-900">P${Number(req.oldPrice || 0).toFixed(2)}</span></div>
          <div class="flex justify-between"><span class="text-gray-600">Requested Price</span><span class="font-semibold text-indigo-700">P${Number(req.requestedPrice || 0).toFixed(2)}</span></div>
          <div class="text-gray-500 border-t pt-2 mt-1"><span class="font-medium text-gray-700">Reason:</span> ${escapeHtml(req.reason || "No reason provided")}</div>
        `
          : `
        <div class="flex justify-between"><span class="text-gray-600">Current Stock</span><span class="font-semibold ${stockColor}">${req.currentQuantity} ${req.unit}</span></div>
        <div class="flex justify-between"><span class="text-gray-600">Requested</span><span class="font-semibold text-blue-700">${req.requestQuantity} ${req.unit}</span></div>
      `;

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
        ${discrepancyDetails}
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

function getPendingDiscrepancyForItem(itemId) {
  return restockRequests.find((req) =>
    req.requestType === "DISCREPANCY" &&
    req.status === "pending" &&
    String(req.productId || "") === String(itemId || "")
  );
}

function showOwnerDirectDisposalModal(item, batch) {
  const reasonOptions = [
    "Expired",
    "Damaged",
    "Contaminated",
    "Manufacturer Recall",
    "Incorrect Storage",
    "Other",
  ].map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join("");

  const methodOptions = [
    "",
    "Incineration",
    "Return to Supplier",
    "Chemical Neutralization",
    "Waste Contractor Pickup",
    "Other",
  ].map((method) => `<option value="${escapeHtml(method)}">${escapeHtml(method || "Select disposal method (optional)")}</option>`).join("");

  const content = `
    <h3 class="text-lg font-semibold mb-1">Confirm Disposal</h3>
    <p class="text-sm text-gray-600 mb-4">Directly dispose this batch. Owner password confirmation is required.</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
      <label>
        <span class="block text-xs font-medium text-gray-500 mb-1">Item Name</span>
        <input type="text" value="${escapeHtml(item.name || "")}" class="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50" readonly />
      </label>
      <label>
        <span class="block text-xs font-medium text-gray-500 mb-1">Generic Name</span>
        <input type="text" value="${escapeHtml(item.genericName || "")}" class="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50" readonly />
      </label>
      <label>
        <span class="block text-xs font-medium text-gray-500 mb-1">Batch Number</span>
        <input type="text" value="${escapeHtml(batch.batchNumber || "")}" class="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50" readonly />
      </label>
      <label>
        <span class="block text-xs font-medium text-gray-500 mb-1">Expiration Date</span>
        <input type="text" value="${escapeHtml(batch.expiryDate || "N/A")}" class="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50" readonly />
      </label>
      <label>
        <span class="block text-xs font-medium text-gray-500 mb-1">Available Quantity</span>
        <input type="text" value="${Number(batch.currentQuantity ?? batch.quantity ?? 0)} ${escapeHtml(item.unit || "pcs")}" class="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50" readonly />
      </label>
      <label>
        <span class="block text-xs font-medium text-gray-500 mb-1">Dispose Quantity</span>
        <input id="disposeQuantityInput" type="number" min="1" max="${Number(batch.currentQuantity ?? batch.quantity ?? 0)}" value="1" class="w-full border border-gray-300 rounded px-3 py-2" />
      </label>
      <label class="md:col-span-2">
        <span class="block text-xs font-medium text-gray-500 mb-1">Reason for Disposal</span>
        <select id="disposeReasonInput" class="w-full border border-gray-300 rounded px-3 py-2">${reasonOptions}</select>
      </label>
      <label class="md:col-span-2">
        <span class="block text-xs font-medium text-gray-500 mb-1">Disposal Method</span>
        <select id="disposeMethodInput" class="w-full border border-gray-300 rounded px-3 py-2">${methodOptions}</select>
      </label>
      <label class="md:col-span-2">
        <span class="block text-xs font-medium text-gray-500 mb-1">Remarks (Optional)</span>
        <textarea id="disposeRemarksInput" rows="2" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Add remarks for the digital audit trail..."></textarea>
      </label>
      <label class="md:col-span-2">
        <span class="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Confirm Owner Password</span>
        <input id="disposeOwnerPassword" type="password" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Enter owner password to confirm disposal" />
      </label>
    </div>
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button id="cancelOwnerDisposalBtn" class="w-full border border-gray-300 py-2 rounded-lg bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
      <button id="confirmOwnerDisposalBtn" class="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700">Confirm Disposal</button>
    </div>`;

  const modal = createModal({ id: "ownerDirectDisposalModal", content, width: "640px" });
  const hide = () => {
    modal.classList.add("hidden");
    modal.style.display = "none";
    setTimeout(() => modal.remove(), 200);
  };

  getElement(modal, "#closeOwnerDirectDisposalModal")?.addEventListener("click", hide);
  getElement(modal, "#cancelOwnerDisposalBtn")?.addEventListener("click", hide);

  getElement(modal, "#confirmOwnerDisposalBtn")?.addEventListener("click", async () => {
    const disposeQuantity = Number(getElement(modal, "#disposeQuantityInput")?.value || 0);
    const reason = getElement(modal, "#disposeReasonInput")?.value || "Expired";
    const disposalMethod = getElement(modal, "#disposeMethodInput")?.value || null;
    const remarks = getElement(modal, "#disposeRemarksInput")?.value || "";
    const ownerPassword = getElement(modal, "#disposeOwnerPassword")?.value || "";

    if (!Number.isInteger(disposeQuantity) || disposeQuantity <= 0) {
      showToast("Dispose quantity must be a positive whole number", "error");
      return;
    }

    if (disposeQuantity > Number(batch.currentQuantity ?? batch.quantity ?? 0)) {
      showToast("Dispose quantity must not exceed the available batch quantity", "error");
      return;
    }

    if (!ownerPassword.trim()) {
      showToast("Owner password is required to confirm disposal", "error");
      return;
    }

    try {
      const response = await apiFetch(API.directDisposal, {
        method: "POST",
        body: JSON.stringify({
          productId: item.id,
          batchId: batch.id,
          quantityDisposed: disposeQuantity,
          reason,
          remarks,
          disposalMethod: disposalMethod || null,
          ownerPassword,
        }),
      });
      const referenceId = response?.reference_id || response?.data?.referenceId;
      showToast(referenceId ? `Disposal completed successfully (${referenceId})` : "Disposal completed successfully", "success");
      hide();
      try {
        await refreshAll();
        const refreshedItem = inventoryItems.find((entry) => entry.id === item.id) || item;
        await showItemDetails(refreshedItem);
      } catch (refreshError) {
        console.warn("Direct disposal completed but inventory refresh failed", refreshError);
      }
    } catch (err) {
      showToast(err.message || "Failed to process disposal", "error");
    }
  });
}

function showReviewDiscrepancyModal(request) {
  const content = `
    <h3 class="text-lg font-semibold mb-1">Review Discrepancy Request</h3>
    <p class="text-sm text-gray-600 mb-4">DISCREPANCY</p>
    <div class="space-y-3 text-sm">
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Item Name</span><span class="font-semibold">${request.itemName}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">System Quantity</span><span class="font-semibold text-gray-900">${request.systemQuantity}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Actual Quantity</span><span class="font-semibold text-blue-700">${request.actualQuantity}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Variance</span><span class="font-semibold ${request.variance === 0 ? "text-green-700" : "text-amber-700"}">${request.variance >= 0 ? "+" : ""}${request.variance}</span></div>
      <div class="py-2 border-b">
        <p class="text-gray-600 mb-1">Reason</p>
        <p class="font-medium text-gray-900">${escapeHtml(request.reason || "No reason provided")}</p>
      </div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Submitted By</span><span class="font-semibold">${request.requestedBy}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Date Submitted</span><span class="font-semibold">${request.requestDate}</span></div>
      <div class="py-2">
        <label class="block text-xs text-gray-700 mb-1">Rejection Reason (Optional)</label>
        <textarea id="discrepancyReviewReason" rows="3" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Provide reason when rejecting..."></textarea>
      </div>
    </div>
    <div class="mt-5 flex gap-5 justify-between">
      <button id="reviewCancelBtn" class="flex-1 border border-gray-300 py-2 px-4 rounded-lg bg-white">Cancel</button>
      <button id="reviewDenyBtn" class="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg">Reject</button>
      <button id="reviewApproveBtn" class="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg">Approve</button>
    </div>`;

  const reviewModal = createModal({ id: "reviewRestockModal", content, width: "500px" });
  reviewModal.currentRequest = request;

  const hide = () => { reviewModal.classList.add("hidden"); reviewModal.style.display = ""; setTimeout(() => reviewModal.remove(), 200); };
  getElement(reviewModal, "#closeReviewRestockModal")?.addEventListener("click", hide);
  getElement(reviewModal, "#reviewCancelBtn")?.addEventListener("click", hide);

  getElement(reviewModal, "#reviewDenyBtn")?.addEventListener("click", async () => {
    const rejectionReason = getElement(reviewModal, "#discrepancyReviewReason")?.value?.trim() || "";
    try {
      await apiFetch(API.reviewQuantityAdjustment(request.id), {
        method: "PATCH",
        body: JSON.stringify({ status: "Rejected", rejectionReason }),
      });
      showToast("Discrepancy request rejected", "success");
      hide();
      await refreshAll();
    } catch (err) {
      showToast(`Reject failed: ${err.message}`, "error");
    }
  });

  getElement(reviewModal, "#reviewApproveBtn")?.addEventListener("click", async () => {
    try {
      await apiFetch(API.reviewQuantityAdjustment(request.id), {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved" }),
      });
      showToast("Discrepancy approved and inventory updated", "success");
      hide();
      await refreshAll();
    } catch (err) {
      showToast(`Approve failed: ${err.message}`, "error");
    }
  });
}

function showReviewDisposalModal(request) {
  const content = `
    <h3 class="text-lg font-semibold mb-1">Approve Disposal Request</h3>
    <p class="text-sm text-gray-600 mb-4">DISPOSAL</p>
    <div class="space-y-3 text-sm">
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Item Name</span><span class="font-semibold">${escapeHtml(request.itemName || "Unknown")}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Batch Number</span><span class="font-semibold text-gray-900">${escapeHtml(request.batchNumber || "-")}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Requested Quantity</span><span class="font-semibold text-red-700">${Number(request.requestQuantity || 0)} ${escapeHtml(request.unit || "pcs")}</span></div>
      <div class="py-2 border-b">
        <p class="text-gray-600 mb-1">Reason</p>
        <p class="font-medium text-gray-900">${escapeHtml(request.reason || "No reason provided")}</p>
      </div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Requested By</span><span class="font-semibold">${escapeHtml(request.requestedBy || "Staff")}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Date Requested</span><span class="font-semibold">${escapeHtml(request.requestDate || "-")}</span></div>
      <div class="py-2">
        <label class="block text-xs text-gray-700 mb-1">Enter Owner Password</label>
        <input id="disposalApprovalPassword" type="password" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Owner password" />
      </div>
    </div>
    <div class="mt-5 flex gap-5 justify-between">
      <button id="reviewCancelBtn" class="flex-1 border border-gray-300 py-2 px-4 rounded-lg bg-white">Cancel</button>
      <button id="reviewDenyBtn" class="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg">Reject</button>
      <button id="reviewApproveBtn" class="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg">Approve</button>
    </div>`;

  const reviewModal = createModal({ id: "reviewRestockModal", content, width: "500px" });

  const hide = () => { reviewModal.classList.add("hidden"); reviewModal.style.display = ""; setTimeout(() => reviewModal.remove(), 200); };
  getElement(reviewModal, "#closeReviewRestockModal")?.addEventListener("click", hide);
  getElement(reviewModal, "#reviewCancelBtn")?.addEventListener("click", hide);

  getElement(reviewModal, "#reviewDenyBtn")?.addEventListener("click", async () => {
    try {
      await apiFetch(API.rejectDisposal(request.id), { method: "PATCH" });
      showToast("Disposal request rejected", "success");
      hide();
      await refreshRequests();
    } catch (err) {
      showToast(`Reject failed: ${err.message}`, "error");
    }
  });

  getElement(reviewModal, "#reviewApproveBtn")?.addEventListener("click", async () => {
    const adminPassword = (getElement(reviewModal, "#disposalApprovalPassword")?.value || "").trim();
    if (!adminPassword) {
      showToast("Owner password is required", "error");
      return;
    }

    try {
      await apiFetch(API.approveDisposal(request.id), {
        method: "PATCH",
        body: JSON.stringify({ adminPassword }),
      });
      showToast("Disposal request approved", "success");
      hide();
      await refreshAll();
    } catch (err) {
      showToast(`Approve failed: ${err.message}`, "error");
    }
  });
}

/* ================= SHOW ITEM DETAILS ================= */
async function showItemDetails(item) {
  const modal = document.getElementById("itemDetailsModal");
  if (!modal) return;

  let detailItem = item;
  try {
    const result = await apiFetch(API.itemDetails(item.id));
    if (result?.data) {
      detailItem = mapBackendItemToUI(result.data);
    }
  } catch (error) {
    console.error("Failed to fetch owner item details:", error);
  }

  modal.currentItem = detailItem;
  const colors = getStatusColors(detailItem.status);

  const setText = (id, value) => {
    const el = getElement(modal, '#' + id);
    if (el) el.textContent = value || "N/A";
  };

  // Header information
  setText("detailsItemName", detailItem.name);
  setText("detailsGenericName", detailItem.genericName || detailItem.generic);
  setText("detailsBrandName", detailItem.brandName || detailItem.brand || detailItem.type);
  setText("detailsCategory", formatCategory(detailItem.category));
  setText("detailsSellingPrice", `₱${(detailItem.price || 0).toFixed(2)}`);

  const requestedPricePreview = getElement(modal, "#detailsRequestedPricePreview");
  if (requestedPricePreview) {
    requestedPricePreview.classList.add("hidden");
    requestedPricePreview.textContent = "";
    try {
      const pendingPriceResponse = await apiFetch(API.priceChangeRequestForProduct(detailItem.id));
      const pendingPriceRequest = pendingPriceResponse?.data || null;
      if (pendingPriceRequest && String(pendingPriceRequest.status || "") === "pending") {
        requestedPricePreview.textContent = `Pending Approval · Requested: P${Number(pendingPriceRequest.requestedPrice || 0).toFixed(2)}`;
        requestedPricePreview.classList.remove("hidden");
      }
    } catch {
      // Non-blocking fetch for pending price request badge.
    }
  }

  // Medicine Information section
  setText("detailsMedicineName", detailItem.medicineName || detailItem.name);
  setText("detailsMedicineGeneric", detailItem.genericName || detailItem.generic);
  setText("detailsMedicineBrand", detailItem.brandName || detailItem.brand || detailItem.type);
  setText("detailsDosageForm", detailItem.dosageForm || detailItem.dosage);
  setText("detailsStrength", detailItem.strength || detailItem.Strength || detailItem.dose || detailItem.dosageStrength);
  setText("detailsMedicineUnit", detailItem.unit);
  setText("detailsMedicineDescription", detailItem.description);

  // Inventory Details — Stock Information
  setText("detailsStock", `${detailItem.currentQuantity} ${detailItem.unit}`);
  setText("detailsMinStock", `${detailItem.minStock} ${detailItem.unit}`);
  setText("detailsBatchCount", String(detailItem.batchCount || (detailItem.batches || []).length || 0));
  setText("detailsExpiry", detailItem.expiryDate || "N/A");
  setText("detailsSupplier", detailItem.supplier);

  const statusTextContainer = getElement(modal, '#detailsStatusText');
  if (statusTextContainer) {
    statusTextContainer.innerHTML = `<span class="${getModalStatusTextClass(detailItem.status)}">${getStatusDisplayText(detailItem.status)}</span>`;
  }

  // Discrepancy Details
  const expectedRemainingEl = getElement(modal, '#detailsExpectedRemaining');
  const physicalCountEl = getElement(modal, '#detailsPhysicalCount');
  const varianceEl = getElement(modal, '#detailsVariance');
  const discrepancyStatusEl = getElement(modal, '#detailsVarianceStatus');

  if (expectedRemainingEl) {
    expectedRemainingEl.textContent = `${Number(detailItem.expectedRemaining ?? detailItem.currentQuantity ?? 0)} ${detailItem.unit}`;
  }
  if (physicalCountEl) {
    physicalCountEl.textContent = `${Number(detailItem.physicalCount ?? detailItem.currentQuantity ?? 0)} ${detailItem.unit}`;
  }
  if (varianceEl) {
    const variance = Number(detailItem.variance ?? 0);
    const varianceClass = variance === 0 ? "text-green-700" : "text-amber-700";
    varianceEl.textContent = `${variance >= 0 ? "+" : ""}${variance} ${detailItem.unit}`;
    varianceEl.className = `font-semibold ${varianceClass}`;
  }
  if (discrepancyStatusEl) {
    const discrepancyStatus = detailItem.discrepancyStatus || (Number(detailItem.variance || 0) === 0 ? "Balanced" : "With Variance");
    const textClass = discrepancyStatus === "Balanced"
      ? "text-xs font-medium text-green-600"
      : "text-xs font-medium text-orange-600";
    discrepancyStatusEl.innerHTML = `<span class="${textClass}">${discrepancyStatus}</span>`;
  }

  const batchRows = getElement(modal, "#detailsBatchRows");
  if (batchRows) {
    const rows = (detailItem.batches || []).map((batch) => {
      const expiryLabel = batch.expiryDateISO ? formatDateDisplay(batch.expiryDateISO, "N/A") : "N/A";
      const batchStatusPill = getBatchStatusPill(batch);
      const statusHtml = `<span class="inline-flex items-center gap-1 text-xs font-medium ${batchStatusPill.textClass}"><span class="w-2 h-2 rounded-full inline-block" style="background:${batchStatusPill.dotColor};"></span>${batchStatusPill.label}</span>`;
      const actionHtml = batch.canDispose
        ? `<button class="dispose-batch-btn inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors" data-batch-id="${escapeHtml(batch.id || batch.batchId || "")}">Dispose</button>`
        : `<span class="text-xs text-slate-500">No action</span>`;

      return `
        <tr>
          <td class="px-3 py-2 text-gray-900 font-semibold break-words whitespace-normal">${escapeHtml(batch.batchNumber || "—")}</td>
          <td class="px-3 py-2 text-gray-900 font-medium">${Number(batch.originalQuantity ?? batch.quantity ?? 0)} ${escapeHtml(detailItem.unit)}</td>
          <td class="px-3 py-2 text-gray-900 font-medium">${Number(batch.currentQuantity ?? batch.quantity ?? 0)} ${escapeHtml(detailItem.unit)}</td>
          <td class="px-3 py-2 text-gray-900 font-medium">${escapeHtml(expiryLabel)}</td>
          <td class="px-3 py-2 text-gray-900">${statusHtml}</td>
          <td class="px-3 py-2 text-gray-900">${actionHtml}</td>
        </tr>`;
    });

    batchRows.innerHTML = rows.length
      ? rows.join("")
      : '<tr><td colspan="6" class="px-3 py-3 text-gray-600">No batch records available.</td></tr>';

    batchRows.querySelectorAll(".dispose-batch-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const selectedBatch = (detailItem.batches || []).find((entry) => String(entry.id || entry.batchId || "") === String(button.dataset.batchId || ""));
        if (selectedBatch) {
          showOwnerDirectDisposalModal(detailItem, selectedBatch);
        }
      });
    });
  }

  /* ---- Expiry calculation ---- */
  const expiryTextEl = getElement(modal, '#detailsExpiresIn');
  const expiryBadge = getElement(modal, '#detailsExpiryBadge');
  const expiryMeta = getExpiryMeta(detailItem.expiryDateISO || detailItem.expiryDate);
  if (expiryTextEl && expiryBadge) {
    if (expiryMeta.date) {
      expiryTextEl.textContent = `Expires in ${expiryMeta.diffDays} days`;
      expiryBadge.textContent = expiryMeta.badgeText;
      expiryBadge.className = expiryMeta.badgeClass;
    } else {
      expiryTextEl.textContent = "Expiry date not available";
      expiryBadge.textContent = expiryMeta.badgeText;
      expiryBadge.className = expiryMeta.badgeClass;
    }
  }

  /* ---- Detail modal buttons ---- */
  const btnCloseTop = getElement(modal, "#closeItemDetails");
  const btnCancel = getElement(modal, "#closeDetails");
  const btnEditDiscrepancy = getElement(modal, "#detailsEditDiscrepancyBtn");
  const btnEditPrice = getElement(modal, "#detailsEditPriceBtn");
  const btnEditPriceSecondary = getElement(modal, "#detailsEditPriceBtnSecondary");
  const btnRestock = getElement(modal, "#restockItemBtn");

  const hideDetails = () => { modal.classList.add("hidden"); modal.style.display = ""; };

  if (btnCloseTop) { const n = btnCloseTop.cloneNode(true); btnCloseTop.parentNode.replaceChild(n, btnCloseTop); n.onclick = hideDetails; }
  if (btnCancel) { const n = btnCancel.cloneNode(true); btnCancel.parentNode.replaceChild(n, btnCancel); n.onclick = hideDetails; }
  if (btnEditDiscrepancy) {
    const n = btnEditDiscrepancy.cloneNode(true);
    btnEditDiscrepancy.parentNode.replaceChild(n, btnEditDiscrepancy);
    n.onclick = (e) => {
      e?.stopPropagation?.();
      hideDetails();
      const pendingDiscrepancy = getPendingDiscrepancyForItem(detailItem.id);
      if (pendingDiscrepancy) {
        showReviewDiscrepancyModal(pendingDiscrepancy);
      } else {
        showEditDiscrepancyModal(detailItem);
      }
    };
  }
  if (btnRestock) {
    const n = btnRestock.cloneNode(true);
    btnRestock.parentNode.replaceChild(n, btnRestock);
    n.onclick = (e) => { e?.stopPropagation?.(); showAdminRestockModal(detailItem); };
  }
  if (btnEditPrice) {
    const n = btnEditPrice.cloneNode(true);
    btnEditPrice.parentNode.replaceChild(n, btnEditPrice);
    n.onclick = (e) => {
      e?.stopPropagation?.();
      showAdminEditPriceModal(detailItem);
    };
  }
  if (btnEditPriceSecondary) {
    const n = btnEditPriceSecondary.cloneNode(true);
    btnEditPriceSecondary.parentNode.replaceChild(n, btnEditPriceSecondary);
    n.onclick = (e) => {
      e?.stopPropagation?.();
      showAdminEditPriceModal(detailItem);
    };
  }
  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

/* ================= REVIEW RESTOCK MODAL ================= */
function showReviewRestockModal(request) {
  if (request.requestType === "PRICE_CHANGE") {
    showReviewPriceChangeModal(request);
    return;
  }

  if (request.requestType === "DISCREPANCY") {
    showReviewDiscrepancyModal(request);
    return;
  }

  if (request.requestType === "DISPOSAL") {
    showReviewDisposalModal(request);
    return;
  }

  const defaultBatchNumber = request.batchNumber && request.batchNumber !== "—"
    ? request.batchNumber
    : generateBatchNumber(request);

  const defaultExpiryDate = (() => {
    const plusMonth = new Date();
    plusMonth.setMonth(plusMonth.getMonth() + 1);
    return plusMonth.toISOString().split("T")[0];
  })();

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
      <div class="pt-2 border-t border-gray-100">
        <p class="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">New Batch Details (For Approved Stock Only)</p>
        <div class="space-y-2">
          <div>
            <label class="block text-xs text-gray-700 mb-1">Batch Number</label>
            <input id="approvalBatchNumber" type="text" value="${defaultBatchNumber}" class="w-full border border-gray-300 rounded px-3 py-2" />
          </div>
          <div>
            <label class="block text-xs text-gray-700 mb-1">Expiration Date</label>
            <input id="approvalExpirationDate" type="date" value="${defaultExpiryDate}" class="w-full border border-gray-300 rounded px-3 py-2" />
          </div>
          <div>
            <label class="block text-xs text-gray-700 mb-1">Supplier (Optional)</label>
            <input id="approvalSupplier" type="text" value="${request.supplier && request.supplier !== "—" ? request.supplier : ""}" placeholder="Supplier name" class="w-full border border-gray-300 rounded px-3 py-2" />
          </div>
        </div>
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
    const adminNotes = getElement(reviewModal, "#adminNotesInput")?.value || "";
    const approvalBatchNumber = (getElement(reviewModal, "#approvalBatchNumber")?.value || "").trim();
    const approvalExpirationDate = (getElement(reviewModal, "#approvalExpirationDate")?.value || "").trim();
    const approvalSupplier = (getElement(reviewModal, "#approvalSupplier")?.value || "").trim();

    if (!approvalExpirationDate) {
      showToast("Expiration Date is required for approved restock batches", "error");
      return;
    }

    showApproveConfirmModal(request, approvedQty, adminNotes, async () => {
      try {
        await apiFetch(API.approveRequest(request.id), {
          method: "PATCH",
          body: JSON.stringify({
            approvedQuantity: approvedQty,
            batchNumber: approvalBatchNumber || generateBatchNumber(request),
            expirationDate: approvalExpirationDate,
            supplier: approvalSupplier || null,
          }),
        });
        showToast("Request Approved and New Batch Added", "success");
        hide();
        await refreshAll();
      } catch (err) {
        showToast(`Approve failed: ${err.message}`, "error");
      }
    });
  });
}

function showReviewPriceChangeModal(request) {
  const content = `
    <h3 class="text-lg font-semibold mb-1">Review Price Change Request</h3>
    <p class="text-sm text-gray-600 mb-4">PRICE_CHANGE</p>
    <div class="space-y-3 text-sm">
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Product</span><span class="font-semibold">${escapeHtml(request.itemName || "Unknown")}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Current Price</span><span class="font-semibold text-gray-900">P${Number(request.oldPrice || 0).toFixed(2)}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Requested Price</span><span class="font-semibold text-indigo-700">P${Number(request.requestedPrice || 0).toFixed(2)}</span></div>
      <div class="py-2 border-b">
        <p class="text-gray-600 mb-1">Reason</p>
        <p class="font-medium text-gray-900">${escapeHtml(request.reason || "No reason provided")}</p>
      </div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Requested By</span><span class="font-semibold">${escapeHtml(request.requestedBy || "Staff")}</span></div>
      <div class="flex justify-between py-2 border-b"><span class="text-gray-600">Date Requested</span><span class="font-semibold">${escapeHtml(request.requestDate || "-")}</span></div>
    </div>
    <div class="mt-5 flex gap-5 justify-between">
      <button id="reviewCancelBtn" class="flex-1 border border-gray-300 py-2 px-4 rounded-lg bg-white">Cancel</button>
      <button id="reviewDenyBtn" class="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg">Reject</button>
      <button id="reviewApproveBtn" class="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg">Approve</button>
    </div>`;

  const reviewModal = createModal({ id: "reviewRestockModal", content, width: "500px" });

  const hide = () => { reviewModal.classList.add("hidden"); reviewModal.style.display = ""; setTimeout(() => reviewModal.remove(), 200); };
  getElement(reviewModal, "#closeReviewRestockModal")?.addEventListener("click", hide);
  getElement(reviewModal, "#reviewCancelBtn")?.addEventListener("click", hide);

  getElement(reviewModal, "#reviewDenyBtn")?.addEventListener("click", async () => {
    try {
      await apiFetch(API.rejectPriceChangeRequest(request.id), { method: "PATCH" });
      showToast("Price change request rejected", "success");
      hide();
      await refreshAll();
    } catch (err) {
      showToast(`Reject failed: ${err.message}`, "error");
    }
  });

  getElement(reviewModal, "#reviewApproveBtn")?.addEventListener("click", async () => {
    try {
      await apiFetch(API.approvePriceChangeRequest(request.id), { method: "PATCH" });
      showToast("Price change request approved", "success");
      hide();
      await refreshAll();
    } catch (err) {
      showToast(`Approve failed: ${err.message}`, "error");
    }
  });
}

function showAdminEditPriceModal(item) {
  const currentPrice = Number(item?.price ?? 0);
  const content = `
    <h3 class="text-lg font-semibold mb-1">Edit Price</h3>
    <p class="text-sm text-gray-600 mb-4">Update selling price for <span class="font-semibold text-gray-800">${escapeHtml(item?.name || "Item")}</span>.</p>
    <div class="space-y-3 text-sm">
      <div>
        <label class="block text-xs text-gray-700 mb-1">Current Price</label>
        <input type="text" value="P${currentPrice.toFixed(2)}" class="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50" readonly />
      </div>
      <div>
        <label class="block text-xs text-gray-700 mb-1">New Price</label>
        <input id="adminNewPriceInput" type="number" min="0.01" step="0.01" value="${currentPrice.toFixed(2)}" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="adminNewPriceError" class="text-red-600 text-xs mt-1 hidden"></p>
      </div>
    </div>
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button id="adminEditPriceCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 text-gray-700">Cancel</button>
      <button id="adminEditPriceSaveBtn" class="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700">Save Changes</button>
    </div>`;

  const modal = createModal({ id: "adminEditPriceModal", content, width: "460px" });
  const hide = () => {
    modal.classList.add("hidden");
    modal.style.display = "";
    setTimeout(() => modal.remove(), 200);
  };

  getElement(modal, "#closeAdminEditPriceModal")?.addEventListener("click", hide);
  getElement(modal, "#adminEditPriceCancelBtn")?.addEventListener("click", hide);

  const priceInput = getElement(modal, "#adminNewPriceInput");
  const priceError = getElement(modal, "#adminNewPriceError");
  const saveBtn = getElement(modal, "#adminEditPriceSaveBtn");

  const validatePrice = () => {
    const raw = (priceInput?.value || "").trim();
    const p = raw === "" ? NaN : parseFloat(raw);
    if (isNaN(p) || p <= 0) {
      if (priceError) {
        priceError.textContent = "Price must be greater than zero.";
        priceError.classList.remove("hidden");
      }
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
    } else {
      if (priceError) {
        priceError.classList.add("hidden");
      }
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    }
  };

  priceInput?.addEventListener("input", validatePrice);
  priceInput?.addEventListener("blur", validatePrice);

  priceInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (saveBtn && !saveBtn.disabled) {
        saveBtn.click();
      }
    }
  });

  getElement(modal, "#adminEditPriceSaveBtn")?.addEventListener("click", async () => {
    const newPrice = Number(getElement(modal, "#adminNewPriceInput")?.value || 0);
    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      showToast("Price must be greater than zero.", "error");
      return;
    }
    if (newPrice === currentPrice) {
      showToast("New price must be different from current price", "error");
      return;
    }

    try {
      await apiFetch(API.updateProductPrice(item.id), {
        method: "PATCH",
        body: JSON.stringify({ newPrice }),
      });
      showToast("Price updated successfully", "success");
      hide();
      await refreshAll();
    } catch (err) {
      showToast(`Price update failed: ${err.message}`, "error");
    }
  });

  modal.classList.remove("hidden");
  modal.style.display = "flex";
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

/* ================= EDIT DISCREPANCY MODAL ================= */
function showEditDiscrepancyModal(item) {
  const expectedRemaining = Number(item.expectedRemaining ?? item.currentQuantity ?? 0);
  const initialPhysicalCount = Number(item.physicalCount ?? expectedRemaining);
  const currentGenericName = String(item.genericName || item.generic || "");
  const currentDosageForm = String(item.dosageForm || item.dosage || "");
  const currentStrength = String(item.strength || item.dose || "");
  const currentCategory = String(item.category || "");

  const content = `
    <h3 class="text-lg font-semibold mb-1">Edit Discrepancy</h3>
    <p class="text-sm text-gray-600 mb-4">Update discrepancy values directly for <span class="font-semibold text-gray-800">${item.name}</span>.</p>

    <div class="space-y-3 text-sm">
      <div class="flex justify-between py-2 border-b border-gray-100">
        <span class="text-gray-600">Expected Remaining</span>
        <span class="font-semibold text-gray-900">${expectedRemaining} ${item.unit}</span>
      </div>
      <div>
        <label class="block text-xs text-gray-700 mb-1">Physical Count</label>
        <input id="discrepancyPhysicalCountInput" type="number" min="0" value="${initialPhysicalCount}" class="w-full border border-gray-300 rounded px-3 py-2" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-gray-700 mb-1">Category</label>
          <select id="discrepancyCategoryInput" class="w-full border border-gray-300 rounded px-3 py-2 bg-white">
            ${buildAddItemCategoryOptionsMarkup(currentCategory)}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-700 mb-1">Generic Name</label>
          <input id="discrepancyGenericNameInput" type="text" value="${escapeHtml(currentGenericName)}" placeholder="e.g., Acetaminophen" class="w-full border border-gray-300 rounded px-3 py-2" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-gray-700 mb-1">Dosage Form</label>
          <select id="discrepancyDosageFormInput" class="w-full border border-gray-300 rounded px-3 py-2 bg-white">
            <option value="">Select dosage form</option>
            <option value="Tablet" ${currentDosageForm === "Tablet" ? "selected" : ""}>Tablet</option>
            <option value="Capsule" ${currentDosageForm === "Capsule" ? "selected" : ""}>Capsule</option>
            <option value="Syrup" ${currentDosageForm === "Syrup" ? "selected" : ""}>Syrup</option>
            <option value="Injection" ${currentDosageForm === "Injection" ? "selected" : ""}>Injection</option>
            <option value="Ointment" ${currentDosageForm === "Ointment" ? "selected" : ""}>Ointment</option>
            <option value="Cream" ${currentDosageForm === "Cream" ? "selected" : ""}>Cream</option>
            <option value="Drops" ${currentDosageForm === "Drops" ? "selected" : ""}>Drops</option>
            <option value="Inhaler" ${currentDosageForm === "Inhaler" ? "selected" : ""}>Inhaler</option>
            <option value="Powder" ${currentDosageForm === "Powder" ? "selected" : ""}>Powder</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-700 mb-1">Strength</label>
          <input id="discrepancyStrengthInput" type="text" value="${escapeHtml(currentStrength)}" placeholder="e.g., 500 mg" class="w-full border border-gray-300 rounded px-3 py-2" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <p class="text-xs text-gray-500">Variance</p>
          <p id="discrepancyVariancePreview" class="text-sm font-semibold text-gray-800 mt-1">0 ${item.unit}</p>
        </div>
        <div class="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <p class="text-xs text-gray-500">Status</p>
          <p id="discrepancyStatusPreview" class="text-sm font-semibold text-gray-800 mt-1">Balanced</p>
        </div>
      </div>
    </div>

    <div class="mt-5 grid grid-cols-2 gap-3">
      <button id="editDiscrepancyCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
      <button id="editDiscrepancySaveBtn" class="w-full bg-amber-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors">Save Changes</button>
    </div>`;

  const modal = createModal({ id: "editDiscrepancyModal", content, width: "480px" });

  const hide = () => {
    modal.classList.add("hidden");
    modal.style.display = "";
    setTimeout(() => modal.remove(), 200);
  };

  const physicalCountInput = getElement(modal, "#discrepancyPhysicalCountInput");
  const variancePreview = getElement(modal, "#discrepancyVariancePreview");
  const statusPreview = getElement(modal, "#discrepancyStatusPreview");

  const updatePreview = () => {
    const physicalCount = Number(physicalCountInput?.value ?? initialPhysicalCount);
    const variance = physicalCount - expectedRemaining;
    const status = variance === 0 ? "Balanced" : "With Variance";

    if (variancePreview) {
      variancePreview.textContent = `${variance >= 0 ? "+" : ""}${variance} ${item.unit}`;
      variancePreview.className = `text-sm font-semibold mt-1 ${variance === 0 ? "text-green-700" : "text-amber-700"}`;
    }
    if (statusPreview) {
      statusPreview.textContent = status;
      statusPreview.className = `text-sm font-semibold mt-1 ${status === "Balanced" ? "text-green-700" : "text-amber-700"}`;
    }
  };

  updatePreview();
  physicalCountInput?.addEventListener("input", updatePreview);

  getElement(modal, "#closeEditDiscrepancyModal")?.addEventListener("click", hide);
  getElement(modal, "#editDiscrepancyCancelBtn")?.addEventListener("click", hide);

  getElement(modal, "#editDiscrepancySaveBtn")?.addEventListener("click", async () => {
    const physicalCount = Number(physicalCountInput?.value);
    const category = String(getElement(modal, "#discrepancyCategoryInput")?.value || "").trim();
    const genericName = String(getElement(modal, "#discrepancyGenericNameInput")?.value || "").trim();
    const dosageForm = String(getElement(modal, "#discrepancyDosageFormInput")?.value || "").trim();
    const strength = String(getElement(modal, "#discrepancyStrengthInput")?.value || "").trim();

    if (!Number.isFinite(physicalCount) || physicalCount < 0) {
      showToast("Physical count must be a non-negative number", "error");
      return;
    }

    try {
      await apiFetch(API.updateDiscrepancy(item.id), {
        method: "PATCH",
        body: JSON.stringify({
          physicalCount,
          category,
          genericName,
          dosageForm,
          strength,
        }),
      });

      showToast("Discrepancy updated successfully", "success");
      hide();
      await refreshInventory();
    } catch (err) {
      showToast(`Discrepancy update failed: ${err.message}`, "error");
    }
  });

  modal.classList.remove("hidden");
  modal.style.display = "flex";
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
      await apiFetch(API.archiveProduct(item.id), {
        method: "PATCH",
        body: JSON.stringify({ reason: "Owner archived product" }),
      });
      showToast("Archived Successfully", "success");
      hide();
      if (detailsModal) { detailsModal.classList.add("hidden"); detailsModal.style.display = ""; }
      await refreshInventory();
    } catch (err) {
      console.error("Owner archive failed:", err);
      showToast("Unable to archive item. Please try again.", "error");
    }
  });
}

/* ================= ADD ITEM MODAL ================= */
function showAddItemModal() {
  const content = `
    <h3 class="text-lg font-semibold text-gray-900 mb-1">Add Item</h3>
    <p class="text-sm text-gray-600 mb-4">Items will be added directly to inventory</p>

    <div class="mb-4 pb-4 border-b border-gray-200">
      <h4 class="text-sm font-semibold text-gray-900 mb-3">Medicine Information</h4>
      <div class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Brand</label>
            <input id="addBrand" placeholder="e.g., Biogesic" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Generic <span class="text-red-600">*</span></label>
            <input id="addGeneric" placeholder="e.g., Acetaminophen" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p id="addGenericError" class="text-red-600 text-xs mt-1 hidden">Required</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Category <span class="text-red-600">*</span></label>
            <select id="addCategory" class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              ${buildAddItemCategoryOptionsMarkup()}
            </select>
            <p id="addCategoryError" class="text-red-600 text-xs mt-1 hidden">Required</p>
          </div>
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Dosage Form <span class="text-red-600">*</span></label>
            <select id="addDosageForm" class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select dosage form</option>
              <option value="Tablet">Tablet</option>
              <option value="Capsule">Capsule</option>
              <option value="Syrup">Syrup</option>
              <option value="Injection">Injection</option>
              <option value="Ointment">Ointment</option>
              <option value="Cream">Cream</option>
              <option value="Drops">Drops</option>
              <option value="Inhaler">Inhaler</option>
              <option value="Powder">Powder</option>
            </select>
            <p id="addDosageFormError" class="text-red-600 text-xs mt-1 hidden">Required</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Strength / Dosage <span class="text-red-600">*</span></label>
            <input id="addStrength" placeholder="e.g., 500 mg, 250 mg/5 ml" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p id="addStrengthError" class="text-red-600 text-xs mt-1 hidden">Required</p>
          </div>
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Unit <span class="text-red-600">*</span></label>
            <select id="addUnit" class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select unit</option>
              <option value="Tablet">Tablet</option>
              <option value="Capsule">Capsule</option>
              <option value="Bottle">Bottle</option>
              <option value="Box">Box</option>
              <option value="Vial">Vial</option>
              <option value="Piece">Piece</option>
              <option value="Tube">Tube</option>
              <option value="Pack">Pack</option>
            </select>
            <p id="addUnitError" class="text-red-600 text-xs mt-1 hidden">Required</p>
          </div>
        </div>

        <div>
          <label class="block text-xs text-gray-700 mb-1 font-medium">Description</label>
          <div class="relative">
            <textarea id="addDescription" rows="2" placeholder="Short description of the medicine..." class="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
            <button type="button" id="voiceInputBtn" class="absolute right-2 top-2 p-1.5 rounded-full hover:bg-gray-100 transition-colors" title="Use voice input">
              <svg id="micIcon" class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
              </svg>
            </button>
          </div>
          <p id="voiceStatusText" class="text-xs text-blue-600 mt-1 hidden">Listening...</p>
          <p id="voiceErrorText" class="text-xs text-red-600 mt-1 hidden"></p>
        </div>
      </div>
    </div>

    <div class="space-y-3 text-sm">
      <h4 class="text-sm font-semibold text-gray-900">Inventory Details</h4>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-gray-700 mb-1 font-medium">Stock Quantity <span class="text-red-600">*</span></label>
          <input id="addQuantity" type="number" min="0" placeholder="e.g., 100" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p id="addQuantityError" class="text-red-600 text-xs mt-1 hidden">Required</p>
        </div>
        <div>
          <label class="block text-xs text-gray-700 mb-1 font-medium">Reorder Level <span class="text-red-600">*</span></label>
          <input id="addMinStock" type="number" min="0" placeholder="e.g., 20" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p id="addMinStockError" class="text-red-600 text-xs mt-1 hidden">Required</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-gray-700 mb-1 font-medium">Batch Number <span class="text-red-600">*</span></label>
          <input id="addBatch" placeholder="e.g., BATCH-102" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p id="addBatchError" class="text-red-600 text-xs mt-1 hidden">Required</p>
        </div>
        <div>
          <label class="block text-xs text-gray-700 mb-1 font-medium">Expiration Date <span class="text-red-600">*</span></label>
          <input id="addExpiry" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p id="addExpiryError" class="text-red-600 text-xs mt-1 hidden">Required</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-gray-700 mb-1 font-medium">Supplier</label>
          <input id="addSupplier" placeholder="e.g., ABC Pharma" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label class="block text-xs text-gray-700 mb-1 font-medium">Selling Price (₱) <span class="text-red-600">*</span></label>
          <input id="addPrice" type="number" min="0" step="0.01" placeholder="e.g., 20.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p id="addPriceError" class="text-red-600 text-xs mt-1 hidden">Required</p>
        </div>
      </div>
    </div>

    <div class="mt-5 flex gap-3 justify-end">
      <button id="addCancelBtn" class="border border-gray-300 py-2 px-4 rounded-lg bg-white hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
      <button id="addSaveBtn" class="bg-blue-700 text-white py-2 px-4 rounded-lg hover:bg-blue-800 transition-colors">Save</button>
    </div>`;
  const addItemModal = createModal({ id: "addItemModal", content, width: "575px" });

  const hide = () => { addItemModal.classList.add("hidden"); addItemModal.style.display = ""; setTimeout(() => addItemModal.remove(), 200); };
  getElement(addItemModal, "#closeAddItemModal")?.addEventListener("click", hide);
  getElement(addItemModal, "#addCancelBtn")?.addEventListener("click", hide);

  const addPriceInput = getElement(addItemModal, "#addPrice");
  const addPriceError = getElement(addItemModal, "#addPriceError");
  const addSaveBtn = getElement(addItemModal, "#addSaveBtn");

  const validateAddPrice = () => {
    const raw = (addPriceInput?.value || "").trim();
    const p = raw === "" ? NaN : parseFloat(raw);
    if (isNaN(p) || p <= 0) {
      if (addPriceError) {
        addPriceError.textContent = "Price must be greater than zero.";
        addPriceError.classList.remove("hidden");
      }
      if (addSaveBtn) {
        addSaveBtn.disabled = true;
        addSaveBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
    } else {
      if (addPriceError) {
        addPriceError.classList.add("hidden");
      }
      if (addSaveBtn) {
        addSaveBtn.disabled = false;
        addSaveBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    }
  };

  addPriceInput?.addEventListener("input", validateAddPrice);
  addPriceInput?.addEventListener("blur", validateAddPrice);

  // Initial validation check
  if (addPriceInput) {
    if ((addPriceInput.value || "").trim() === "") {
      addPriceInput.value = "0";
    }
    validateAddPrice();
  }

  addItemModal.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (addSaveBtn && !addSaveBtn.disabled) {
          addSaveBtn.click();
        }
      }
    });
  });

  // Initialize voice recognition for the Description field
  initVoiceRecognitionForModal(addItemModal);

  getElement(addItemModal, "#addSaveBtn")?.addEventListener("click", async () => {
    const val = (id) => (getElement(addItemModal, id)?.value || "").trim();
    const brand = val("#addBrand");
    const generic = val("#addGeneric");
    const category = val("#addCategory");
    const dosageForm = val("#addDosageForm");
    const strength = val("#addStrength");
    const qtyRaw = val("#addQuantity");
    const qty = qtyRaw === "" ? NaN : parseInt(qtyRaw, 10);
    const unit = val("#addUnit");
    const minStockRaw = val("#addMinStock");
    const minStock = minStockRaw === "" ? NaN : parseInt(minStockRaw, 10);
    const priceRaw = val("#addPrice");
    const price = priceRaw === "" ? NaN : parseFloat(priceRaw);
    const expiry = val("#addExpiry");
    const batch = val("#addBatch");
    const supplier = val("#addSupplier");
    const desc = val("#addDescription");

    const required = {
      generic: "#addGeneric",
      category: "#addCategory",
      dosageForm: "#addDosageForm",
      strength: "#addStrength",
      quantity: "#addQuantity",
      unit: "#addUnit",
      minStock: "#addMinStock",
      price: "#addPrice",
      expiry: "#addExpiry",
      batch: "#addBatch",
    };
    let hasError = false;
    Object.entries(required).forEach(([key, sel]) => {
      const el = getElement(addItemModal, sel);
      const errId = `add${key.charAt(0).toUpperCase() + key.slice(1)}Error`;
      const errEl = document.getElementById(errId);
      if (!el?.value || el.value.trim() === "") { errEl?.classList.remove("hidden"); hasError = true; }
      else { errEl?.classList.add("hidden"); }
    });
    if (hasError) return;

    if (!Number.isFinite(price) || price <= 0) {
      showToast("Price must be greater than zero.", "error");
      return;
    }

    try {
      await apiFetch(API.addProduct, {
        method: "POST",
        body: JSON.stringify({
          name: generic || brand,
          genericName: generic,
          brandName: brand,
          category: category || "general",
          dosageForm: dosageForm,
          strength: strength,
          quantity: isNaN(qty) ? 0 : qty,
          unit: unit || "pcs",
          unitPrice: isNaN(price) ? 0 : price,
          minStock: isNaN(minStock) ? 10 : minStock,
          expiryDate: expiry || null,
          batchNumber: batch || null,
          supplier: supplier || null,
          description: desc || "",
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

/* ================= ADMIN RESTOCK MODAL ================= */
function showAdminRestockModal(item) {
  const detailsModal = document.getElementById("itemDetailsModal");

  const defaultBatchNumber = generateBatchNumber(item);
  const defaultExpiryDate = (() => {
    const plusMonth = new Date();
    plusMonth.setMonth(plusMonth.getMonth() + 1);
    return plusMonth.toISOString().split("T")[0];
  })();

  const content = `
    <h3 class="text-lg font-semibold mb-1">Restock Item</h3>
    <p class="text-sm text-gray-600 mb-4">Add stock to <span class="font-semibold text-gray-800">${escapeHtml(item.name)}</span></p>

    <div class="space-y-4 text-sm">
      <!-- Current Stock Info -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p class="text-xs text-blue-600 font-semibold mb-2">CURRENT STOCK</p>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p class="text-blue-700 text-xs">Current Quantity</p>
            <p class="font-semibold text-blue-900">${Number(item.currentQuantity ?? item.quantity ?? 0)} ${escapeHtml(item.unit || "pcs")}</p>
          </div>
          <div>
            <p class="text-blue-700 text-xs">Minimum Stock</p>
            <p class="font-semibold text-blue-900">${Number(item.minStock ?? 10)} ${escapeHtml(item.unit || "pcs")}</p>
          </div>
        </div>
      </div>

      <!-- Restock Quantity -->
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1">Restock Quantity <span class="text-red-600">*</span></label>
        <input id="adminRestockQuantity" type="number" min="1" placeholder="Enter quantity to add" class="w-full border border-gray-300 rounded px-3 py-2" />
        <p id="restockQuantityError" class="text-red-600 text-xs mt-1 hidden">Quantity is required and must be positive.</p>
      </div>

      <!-- Batch Details Section -->
      <div class="pt-2 border-t border-gray-200">
        <p class="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">New Batch Details</p>
        <div class="space-y-2">
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Batch Number</label>
            <input id="adminRestockBatchNumber" type="text" value="${defaultBatchNumber}" class="w-full border border-gray-300 rounded px-3 py-2" />
          </div>
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Expiration Date <span class="text-red-600">*</span></label>
            <input id="adminRestockExpiryDate" type="date" value="${defaultExpiryDate}" class="w-full border border-gray-300 rounded px-3 py-2" />
            <p id="expiryDateError" class="text-red-600 text-xs mt-1 hidden">Expiration date is required.</p>
          </div>
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Supplier (Optional)</label>
            <input id="adminRestockSupplier" type="text" value="${escapeHtml(item.supplier || "")}" placeholder="Supplier name" class="w-full border border-gray-300 rounded px-3 py-2" />
          </div>
          <div>
            <label class="block text-xs text-gray-700 mb-1 font-medium">Notes (Optional)</label>
            <textarea id="adminRestockNotes" rows="2" placeholder="Add any notes..." class="w-full border border-gray-300 rounded px-3 py-2"></textarea>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-5 flex gap-3 justify-end">
      <button id="restockCancelBtn" class="border border-gray-300 py-2.5 px-4 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
      <button id="restockConfirmBtn" class="bg-blue-600 text-white py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">Add Stock</button>
    </div>`;

  const modal = createModal({ id: "adminRestockModal", content, width: "480px" });

  const hide = () => {
    modal.classList.add("hidden");
    modal.style.display = "";
    setTimeout(() => modal.remove(), 200);
  };

  getElement(modal, "#restockCancelBtn")?.addEventListener("click", hide);

  getElement(modal, "#restockConfirmBtn")?.addEventListener("click", async () => {
    const quantityInput = getElement(modal, "#adminRestockQuantity");
    const expiryInput = getElement(modal, "#adminRestockExpiryDate");
    const quantityErrorEl = getElement(modal, "#restockQuantityError");
    const expiryErrorEl = getElement(modal, "#expiryDateError");

    let hasError = false;

    // Clear previous errors
    quantityErrorEl?.classList.add("hidden");
    expiryErrorEl?.classList.add("hidden");

    const quantity = quantityInput?.value ? parseInt(quantityInput.value, 10) : 0;

    if (!quantityInput?.value || quantityInput.value === "" || !Number.isInteger(quantity) || quantity <= 0) {
      quantityErrorEl?.classList.remove("hidden");
      quantityInput?.focus();
      hasError = true;
    }

    const expiryDate = expiryInput?.value || "";
    if (!expiryDate) {
      expiryErrorEl?.classList.remove("hidden");
      expiryInput?.focus();
      hasError = true;
    }

    if (hasError) return;

    try {
      const batchNumber = (getElement(modal, "#adminRestockBatchNumber")?.value || "").trim() || defaultBatchNumber;
      const supplier = (getElement(modal, "#adminRestockSupplier")?.value || "").trim() || null;
      const notes = (getElement(modal, "#adminRestockNotes")?.value || "").trim() || "";

      await apiFetch(API.adjustStock(item.id), {
        method: "PATCH",
        body: JSON.stringify({
          quantityChange: quantity,
          batchNumber,
          expirationDate: expiryDate,
          supplier,
          notes,
          actorType: "owner",
        }),
      });

      showToast(`Restocked successfully (${quantity} ${item.unit} added)`, "success");
      hide();
      if (detailsModal) { detailsModal.classList.add("hidden"); detailsModal.style.display = ""; }
      await refreshInventory();
    } catch (err) {
      showToast(`Restock failed: ${err.message}`, "error");
    }
  });

  modal.classList.remove("hidden");
  modal.style.display = "flex";
  if (detailsModal) { detailsModal.classList.add("hidden"); detailsModal.style.display = ""; }
}

/* ================= CLOSE ALL MODALS ================= */
function closeAllModals() {
  ["itemDetailsModal", "reviewRestockModal", "addItemModal", "archiveConfirmModal", "restoreConfirmModal", "approveConfirmModal", "denyConfirmModal", "editDiscrepancyModal", "ownerDirectDisposalModal", "adminRestockModal"]
    .forEach(id => { const m = document.getElementById(id); if (m) m.classList.add("hidden"); });
}

/* ================= INIT ================= */
export async function initAdminInventory() {
  const auth = window.IBMSAuth;
  if (auth && !auth.isSessionValid("owner")) {
    auth.clearAuthData();
    auth.redirectToLogin(true);
    return;
  }

  console.log("=== INIT ADMIN INVENTORY STARTED ===");

  if (requestsAutoRefreshTimer) {
    clearInterval(requestsAutoRefreshTimer);
    requestsAutoRefreshTimer = null;
  }

  const tabInventory = document.getElementById("tabInventory");
  const tabRestock = document.getElementById("tabRestock");
  const inventorySection = document.getElementById("inventorySection");
  const restockSection = document.getElementById("restockSection");

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
    btn.addEventListener("click", () => {
      currentStatusFilter = btn.dataset.status;
      currentInventoryPage = 1;
      applyFilters();
    })
  );

  /* ---- Restock status filters ---- */
  document.querySelectorAll(".status-filter-restock").forEach(btn =>
    btn.addEventListener("click", async () => {
      currentRestockStatusFilter = btn.dataset.status;
      await refreshRequests();
    })
  );

  const categoryFilterSelect = document.getElementById("categoryFilterSelect");
  categoryFilterSelect?.addEventListener("change", () => {
    currentCategoryFilter = categoryFilterSelect.value || ALL_CATEGORIES_LABEL;
    currentInventoryPage = 1;
    renderInventoryCategorySelect(inventoryItems);
    applyFilters();
  });

  const categoryFilterSelectRestock = document.getElementById("categoryFilterSelectRestock");
  categoryFilterSelectRestock?.addEventListener("change", () => {
    currentRestockCategoryFilter = categoryFilterSelectRestock.value || ALL_CATEGORIES_LABEL;
    renderRestockCategorySelect(restockRequests);
    applyRestockFilters();
  });

  /* ---- Search inputs ---- */
  document.getElementById("searchInventory")?.addEventListener("input", debounce(() => {
    currentInventoryPage = 1;
    applyFilters();
  }, 300));

  document.getElementById("searchInventory")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      currentInventoryPage = 1;
      applyFilters();
    }
  });

  document.getElementById("searchRestock")?.addEventListener("input", debounce(applyRestockFilters, 300));

  document.getElementById("searchRestock")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyRestockFilters();
    }
  });

  /* ---- Archived toggle ---- */
  const archivedBtn = document.getElementById("archivedBtn");
  archivedBtn?.addEventListener("click", async () => {
    if (showLowStockOnly) return;
    showArchivedItems = !showArchivedItems;
    if (showArchivedItems) {
      archivedBtn.classList.remove("bg-white", "text-red-600", "border-red-600", "hover:bg-red-50");
      archivedBtn.classList.add("bg-green-600", "text-white", "border-green-600", "hover:bg-green-700");
      archivedBtn.textContent = "Active Items";
    } else {
      archivedBtn.classList.remove("bg-green-600", "text-white", "border-green-600", "hover:bg-green-700");
      archivedBtn.classList.add("bg-white", "text-red-600", "border-red-600", "hover:bg-red-50");
      archivedBtn.textContent = "Archived Items";
    }
    currentInventoryPage = 1;
    await refreshInventory();
  });

  /* ---- Low stock toggle ---- */
  const lowStockToggle = document.getElementById("lowStockToggle");
  lowStockToggle?.addEventListener("click", () => {
    if (showArchivedItems) {
      showToast("Low stock filter is available only in active inventory view", "error");
      return;
    }

    showLowStockOnly = !showLowStockOnly;
    currentInventoryPage = 1;
    if (showLowStockOnly) {
      lowStockToggle.classList.add("ring-2", "ring-red-300");
    } else {
      lowStockToggle.classList.remove("ring-2", "ring-red-300");
    }
    applyFilters();
  });

  document.getElementById("inventoryPrevPage")?.addEventListener("click", () => {
    if (currentInventoryPage > 1) {
      currentInventoryPage -= 1;
      renderInventory();
    }
  });

  document.getElementById("inventoryNextPage")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / INVENTORY_ITEMS_PER_PAGE));
    if (currentInventoryPage < totalPages) {
      currentInventoryPage += 1;
      renderInventory();
    }
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
    const viewBtn = e.target.closest(".view-details-btn");
    const restoreBtn = e.target.closest(".restore-btn");
    const editDiscrepancyBtn = e.target.closest(".edit-discrepancy-btn");
    const archiveBtn = e.target.closest(".archive-btn");

    if (viewBtn) {
      const card = viewBtn.closest("[data-card-id]");
      const item = inventoryItems.find(i => i.id === card?.dataset.cardId);
      if (item) showItemDetails(item);
    } else if (restoreBtn) {
      const itemId = restoreBtn.dataset.itemId;
      const item = inventoryItems.find(i => i.id === itemId);
      if (item) showRestoreConfirm(item);
    } else if (editDiscrepancyBtn) {
      const itemId = editDiscrepancyBtn.dataset.itemId;
      const item = inventoryItems.find(i => i.id === itemId);
      if (item) {
        const pendingDiscrepancy = getPendingDiscrepancyForItem(item.id);
        if (pendingDiscrepancy) {
          showReviewDiscrepancyModal(pendingDiscrepancy);
        } else {
          showEditDiscrepancyModal(item);
        }
      }
    } else if (archiveBtn) {
      const itemId = archiveBtn.dataset.itemId;
      const item = inventoryItems.find(i => i.id === itemId);
      if (item) showArchiveConfirm(item);
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

  requestsAutoRefreshTimer = setInterval(() => {
    refreshRequests();
  }, REQUESTS_AUTO_REFRESH_MS);

  console.log("Admin Inventory initialized successfully");
}
