import { apiFetch } from "../utils/apiClient.js";
import {
    ALL_CATEGORIES_LABEL,
    buildAddItemCategoryOptionsMarkup,
    buildFilterCategoryOptionsMarkup,
    isAllCategories,
    normalizeInventoryCategoryKey,
    toCanonicalInventoryCategory,
} from "../utils/inventoryCategories.js";

/* ================= STATE ================= */
let inventoryItems = [];
let activityLog = [];
let restockRequests = [];
let filteredItems = [];
let currentCategoryFilter = ALL_CATEGORIES_LABEL;
let currentStatusFilter = "all";
let showLowStockOnly = false;
let showArchivedItems = false;

/* ================= API ENDPOINTS ================= */
const API = {
    ITEMS: "/api/staff/inventory/items",
    ITEM_DETAILS: (id) => `/api/staff/inventory/items/${id}`,
    ARCHIVE: (id) => `/api/staff/inventory/items/${id}/archive`,
    RESTORE: (id) => `/api/staff/inventory/items/${id}/restore`,
    RESTOCK_REQUEST: "/api/staff/inventory/requests/restock",
    ADD_ITEM_REQUEST: "/api/staff/inventory/requests/add-item",
    PRICE_CHANGE_REQUEST: "/api/staff/inventory/requests/price-change",
    PRICE_CHANGE_REQUEST_FOR_PRODUCT: (id) => `/api/staff/inventory/requests/price-change/product/${id}`,
    MY_REQUESTS: "/api/staff/inventory/requests/my",
    ACTIVITY_LOGS: "/api/staff/activity-logs",
    QUANTITY_ADJUSTMENT: "/api/staff/quantity-adjustments",
    DISPOSAL_REQUEST: "/api/staff/disposal",
};

/* ================= STATUS VOCABULARY MAPPING ================= */
/**
 * Backend returns canonical status: IN_STOCK, LOW_STOCK, OUT_OF_STOCK, PENDING
 * UI uses hyphenated keys for CSS: in-stock, low-stock, out-of-stock, pending, archived
 */
const BACKEND_STATUS_TO_UI = {
    IN_STOCK: "in-stock",
    LOW_STOCK: "low-stock",
    OUT_OF_STOCK: "out-of-stock",
    PENDING: "pending",
};

function mapBackendStatus(backendStatus) {
    return BACKEND_STATUS_TO_UI[backendStatus] || "in-stock";
}

/* ================= FILTER CONFIGURATIONS (Blue theme) ================= */
const FILTER_CONFIG = {
    'all': { activeBg: 'bg-blue-600', activeText: 'text-white', activeBorder: 'border-blue-600', hoverBg: 'hover:bg-blue-50', hoverBorder: 'hover:border-blue-500', hoverText: 'hover:text-blue-700' },
    'in-stock': { activeBg: 'bg-green-600', activeText: 'text-white', activeBorder: 'border-green-600', hoverBg: 'hover:bg-green-50', hoverBorder: 'hover:border-green-500', hoverText: 'hover:text-green-700' },
    'safe': { activeBg: 'bg-emerald-600', activeText: 'text-white', activeBorder: 'border-emerald-600', hoverBg: 'hover:bg-emerald-50', hoverBorder: 'hover:border-emerald-500', hoverText: 'hover:text-emerald-700' },
    'near-expiry': { activeBg: 'bg-amber-500', activeText: 'text-white', activeBorder: 'border-amber-500', hoverBg: 'hover:bg-amber-50', hoverBorder: 'hover:border-amber-500', hoverText: 'hover:text-amber-700' },
    'at-risk': { activeBg: 'bg-red-600', activeText: 'text-white', activeBorder: 'border-red-600', hoverBg: 'hover:bg-red-50', hoverBorder: 'hover:border-red-500', hoverText: 'hover:text-red-700' },
    'pending': { activeBg: 'bg-yellow-500', activeText: 'text-white', activeBorder: 'border-yellow-500', hoverBg: 'hover:bg-yellow-50', hoverBorder: 'hover:border-yellow-500', hoverText: 'hover:text-yellow-700' },
    'low-stock': { activeBg: 'bg-orange-500', activeText: 'text-white', activeBorder: 'border-orange-500', hoverBg: 'hover:bg-orange-50', hoverBorder: 'hover:border-orange-500', hoverText: 'hover:text-orange-700' },
    'out-of-stock': { activeBg: 'bg-red-700', activeText: 'text-white', activeBorder: 'border-red-700', hoverBg: 'hover:bg-red-50', hoverBorder: 'hover:border-red-600', hoverText: 'hover:text-red-700' }
};
function mapExpiryRiskToUi(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'green' || normalized === 'safe') return 'safe';
    if (normalized === 'yellow' || normalized === 'near-expiry' || normalized === 'near expiry') return 'near-expiry';
    if (normalized === 'red' || normalized === 'at-risk' || normalized === 'at risk') return 'at-risk';
    if (normalized === 'expired') return 'expired';
    return 'no-expiry';
}

function getExpiryRiskPill(expiryRisk, options = {}) {
    if (options.pendingDisposalOnly === true) {
        return { label: 'Disposal Pending', textClass: 'text-amber-700', dotColor: '#f59e0b' };
    }

    const normalized = mapExpiryRiskToUi(expiryRisk);
    if (normalized === 'safe') {
        return { label: 'Safe', textClass: 'text-emerald-700', dotColor: '#16a34a' };
    }
    if (normalized === 'near-expiry') {
        return { label: 'Near-Expiry', textClass: 'text-amber-700', dotColor: '#f59e0b' };
    }
    if (normalized === 'at-risk') {
        return { label: 'Immediate Review', textClass: 'text-red-700', dotColor: '#ef4444' };
    }
    if (normalized === 'expired') {
        return { label: 'Expired', textClass: 'text-red-800', dotColor: '#991b1b' };
    }
    return { label: 'No Expiry', textClass: 'text-gray-600', dotColor: '#9ca3af' };
}

const STATUS_COLORS = {
    'in-stock': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-500', quantity: 'text-green-700' },
    'pending': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500', quantity: 'text-yellow-700' },
    'low-stock': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-500', quantity: 'text-orange-700' },
    'out-of-stock': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500', quantity: 'text-red-700' },
    'archived': { bg: 'bg-gray-400', text: 'text-white', border: 'border-gray-500', quantity: 'text-gray-700' }
};

const STATUS_DISPLAY = {
    'in-stock': 'In Stock',
    'pending': 'Under Review',
    'low-stock': 'Low Stock',
    'out-of-stock': 'Out of Stock',
    'archived': 'Archived'
};

const STATUS_SORT_PRIORITY = {
    'pending': 0,
    'out-of-stock': 1,
    'low-stock': 2,
    'in-stock': 3
};

const Z_INDEX = {
    MODAL_BASE: 10000,
    MODAL_OVERLAY: 9999,
    TOAST: 20000
};
const EXPIRY_WARNING_DAYS = 7;

function normalizeStatus(status) {
    if (!status) return 'in-stock';
    return String(status).toLowerCase().replace(/\s+/g, '-');
}

function getFilterConfig(status) {
    return FILTER_CONFIG[normalizeStatus(status)] || FILTER_CONFIG['all'];
}

function getStatusColors(status) {
    return STATUS_COLORS[normalizeStatus(status)] || STATUS_COLORS['in-stock'];
}

function getStatusDisplayText(status) {
    return STATUS_DISPLAY[normalizeStatus(status)] || 'In Stock';
}

function getStatusSortPriority(status) {
    const normalized = normalizeStatus(status);
    return Object.prototype.hasOwnProperty.call(STATUS_SORT_PRIORITY, normalized)
        ? STATUS_SORT_PRIORITY[normalized]
        : Number.MAX_SAFE_INTEGER;
}

function formatCategory(category) {
    if (!category) return '';
    return toCanonicalInventoryCategory(category);
}

function normalizeCategoryKey(value) {
    return normalizeInventoryCategoryKey(value).replace(/\s+/g, '-');
}

function getInventoryCategoryOptions(items = []) {
    return Array.isArray(items) ? items : [];
}

function renderCategoryFilterSelect(items = inventoryItems) {
    const categorySelect = document.getElementById('categoryFilterSelect');
    if (!categorySelect) return;

    const selectedValue = currentCategoryFilter || ALL_CATEGORIES_LABEL;
    categorySelect.innerHTML = buildFilterCategoryOptionsMarkup(selectedValue);

    const hasSelection = categorySelect.querySelector(`option[value="${selectedValue}"]`) !== null;
    currentCategoryFilter = hasSelection ? selectedValue : ALL_CATEGORIES_LABEL;
    categorySelect.value = currentCategoryFilter;

    categorySelect.classList.toggle('border-blue-500', !isAllCategories(currentCategoryFilter));
    categorySelect.classList.toggle('bg-blue-50', !isAllCategories(currentCategoryFilter));
}

function formatDateDisplay(value, fallback = "N/A") {
    if (!value) return fallback;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getExpiryMeta(expiryValue) {
    if (!expiryValue) {
        return {
            date: null,
            diffDays: null,
            badgeText: "Unknown",
            badgeClass: "text-xs font-medium text-gray-600",
        };
    }

    const date = new Date(expiryValue);
    if (Number.isNaN(date.getTime())) {
        return {
            date: null,
            diffDays: null,
            badgeText: "Unknown",
            badgeClass: "text-xs font-medium text-gray-600",
        };
    }

    const diffDays = Math.ceil((date - new Date()) / 86400000);
    if (diffDays < 0) {
        return {
            date,
            diffDays,
            badgeText: "Expired",
            badgeClass: "text-xs font-medium text-red-700",
        };
    }

    if (diffDays <= EXPIRY_WARNING_DAYS) {
        return {
            date,
            diffDays,
            badgeText: "Expiring Soon",
            badgeClass: "text-xs font-medium text-red-600",
        };
    }

    if (diffDays <= 30) {
        return {
            date,
            diffDays,
            badgeText: "Expiring Soon",
            badgeClass: "text-xs font-medium text-orange-600",
        };
    }

    return {
        date,
        diffDays,
        badgeText: "Safe",
        badgeClass: "text-xs font-medium text-green-600",
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

function hasExpiringSoonBatch(batches) {
    if (!Array.isArray(batches) || !batches.length) return false;
    return batches.some((batch) => {
        if (!batch?.expiryDateISO) return false;
        const meta = getExpiryMeta(batch.expiryDateISO);
        return Number.isFinite(meta.diffDays) && meta.diffDays >= 0 && meta.diffDays <= EXPIRY_WARNING_DAYS;
    });
}

function getBatchStatusPill(batch) {
    const normalized = String(batch?.statusKey || "").trim().toLowerCase();
    if (normalized === "pending-disposal") {
        return { label: "Pending Disposal", textClass: "text-orange-700", dotColor: "#f97316" };
    }
    if (normalized === "disposed") {
        return { label: "Disposed", textClass: "text-red-700", dotColor: "#dc2626" };
    }
    if (normalized === "empty" || normalized === "out-of-stock") {
        return { label: "Out of Stock", textClass: "text-slate-600", dotColor: "#94a3b8" };
    }
    return null;
}

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ================= BACKEND DATA FETCHING ================= */

/**
 * Fetch inventory items from backend and update local state.
 * Maps backend response shape to UI item shape.
 */
async function fetchInventoryItems() {
    try {
        const query = {};
        if (showArchivedItems) query.includeArchived = "true";
        if (!showArchivedItems) query.includePending = "true";
        if (showLowStockOnly) query.lowStockOnly = "true";

        const qs = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
        const url = qs ? `${API.ITEMS}?${qs}` : API.ITEMS;

        /* Always refresh requests to identify items with pending actions accurately */
        await fetchMyRequests();

        const result = await apiFetch(url);
        let items = (result.data || []).map(mapBackendItemToUI);

        if (!showArchivedItems) {
            // 1. Mark existing items that have a pending request
            items = items.map(item => {
                const hasPending = restockRequests.some(req =>
                    (req.requestType === "RESTOCK" || req.requestType === "PRICE_CHANGE" || req.requestType === "DISPOSAL" || req.requestType === "DISCREPANCY" || req.isDiscrepancy || req.isPriceChange || req.isDisposal) &&
                    String(req.productId || "") === String(item.id) &&
                    req.status === "pending"
                );
                const hasPendingRestock = restockRequests.some(req =>
                    req.requestType === "RESTOCK" &&
                    String(req.productId || "") === String(item.id) &&
                    req.status === "pending"
                );
                return { ...item, hasPendingRequest: hasPending, hasPendingRestock };
            });
        }

        inventoryItems = items;
        renderCategoryFilterSelect(inventoryItems);
        return inventoryItems;
    } catch (error) {
        console.error("Failed to fetch inventory:", error);
        showToast("Failed to load inventory: " + error.message, "error");
        return [];
    }
}

/**
 * Map a single backend item payload to the UI item shape.
 */
function mapBackendItemToUI(item) {
    const uiStatus = item.isArchived ? "archived" : mapBackendStatus(item.stockStatus);

    const batches = Array.isArray(item.batches)
        ? item.batches.map((batch) => ({
            id: batch.batchId,
            batchNumber: batch.batchNumber || "—",
            quantity: Number(batch.quantity ?? 0),
            currentQuantity: Number(batch.currentQuantity ?? batch.quantity ?? 0),
            originalQuantity: Number(batch.originalQuantity ?? batch.quantity ?? 0),
            supplier: batch.supplier || "—",
            expiryDateISO: batch.expiryDate ? new Date(batch.expiryDate).toISOString().slice(0, 10) : "",
            expiryDate: batch.expiryDate ? formatDateDisplay(batch.expiryDate, "N/A") : "N/A",
            createdAt: batch.createdAt || null,
            expiryRisk: mapExpiryRiskToUi(batch.expiryRisk || null),
            statusKey: batch.statusKey || String(batch.status || "").toLowerCase().replace(/\s+/g, "-"),
            canDispose: (Number(batch.currentQuantity ?? batch.quantity ?? 0) > 0) && (String(batch.status || "").toLowerCase().replace(/\s+/g, "-") !== "disposed") && (!batch.isPendingDisposal),
            isExpired: !!batch.isExpired,
            isPendingDisposal: !!batch.isPendingDisposal,
        }))
        : [];

    const nearestExpiry = item.expiryDate || null;
    const batchCount = Number.isFinite(Number(item.batchCount)) ? Number(item.batchCount) : batches.length;

    return {
        id: String(item.itemId),
        name: item.itemName || "",
        category: toCanonicalInventoryCategory(item.category || ""),
        type: item.category ? formatCategory(item.category) : "",
        currentQuantity: item.currentQuantity ?? 0,
        unit: item.unit || "pcs",
        minStock: item.minStock ?? 10,
        expiryDate: nearestExpiry ? formatDateDisplay(nearestExpiry, "—") : "—",
        expiryDateISO: nearestExpiry ? new Date(nearestExpiry).toISOString().slice(0, 10) : "",
        batchNumber: item.batchNumber || "",
        batchCount,
        batches,
        expiryRisk: mapExpiryRiskToUi(item.expiryRisk || item.expiryRiskKey || null),
        price: item.unitPrice ?? 0,
        supplier: item.supplier || item.supplierName || "N/A",
        status: uiStatus,
        description: item.description || "",
        genericName: item.genericName || item.generic || "",
        brandName: item.brandName || item.brand || "",
        dosageForm: item.dosageForm || item.dosage || "",
        strength: item.strength || item.Strength || item.dose || item.dosageStrength || "",
        medicineName: item.medicineName || item.itemName || item.name || "",
        archived: !!item.isArchived,
        isPendingRequest: !!item.isPendingRequest,
        hasPendingDisposalOnlyStock: item.hasPendingDisposalOnlyStock === true,
    };
}

/**
 * Fetch staff activity logs from backend.
 */
async function fetchActivityLogs() {
    try {
        const result = await apiFetch(`${API.ACTIVITY_LOGS}?limit=50`);
        activityLog = (result.data || []).map(log => ({
            id: log.id,
            action: log.actionType || "",
            item: log.description || "",
            quantity: null,
            status: log.status || "completed",
            user: "Staff",
            timestamp: log.timestamp ? new Date(log.timestamp).toLocaleString("en-US", {
                month: "2-digit", day: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit", hour12: true
            }) : "",
        }));
        return activityLog;
    } catch (error) {
        console.error("Failed to fetch activity logs:", error);
        return [];
    }
}

/**
 * Fetch staff's own restock/add-item requests from backend.
 */
async function fetchMyRequests() {
    try {
        const result = await apiFetch(`${API.MY_REQUESTS}?limit=50`);
        restockRequests = (result.data || []).map(r => ({
            id: r.requestId,
            requestType: r.requestType,
            item: r.itemName || r.productName || "Unknown",
            category: r.category || "",
            quantity: r.requestedQuantity || r.initialQuantity || 0,
            currentQuantity: r.currentQuantity,
            unit: r.unit || "pcs",
            status: r.status || "pending",
            timestamp: r.createdAt ? new Date(r.createdAt).toLocaleString("en-US", {
                month: "2-digit", day: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit", hour12: true
            }) : "",
            rejectionReason: r.rejectionReason,
            productId: r.productId || null,
            isPriceChange: !!r.isPriceChange,
            isDisposal: !!r.isDisposal,
            isDiscrepancy: !!r.isDiscrepancy,
        }));

        /* Update summary counts */
        const summary = result.summary || {};
        const pendingEl = document.getElementById('pendingCount');
        const approvedEl = document.getElementById('approvedCount');
        const fulfilledEl = document.getElementById('fulfilledCount');
        if (pendingEl) pendingEl.textContent = summary.pending || 0;
        if (approvedEl) approvedEl.textContent = summary.approved || 0;
        if (fulfilledEl) fulfilledEl.textContent = summary.approved || 0;

        return restockRequests;
    } catch (error) {
        console.error("Failed to fetch requests:", error);
        return [];
    }
}

/* ================= UI HELPERS: TOASTS ================= */

function ensureToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = `fixed right-8 bottom-12 flex flex-col items-end gap-3 z-[${Z_INDEX.TOAST}]`;
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = 'success', duration = 3500) {
    const container = ensureToastContainer();
    container.innerHTML = '';
    const toast = document.createElement('div');
    const baseClass = type === 'error'
        ? 'bg-white text-red-700 border-4 border-red-600 rounded-md px-4 py-3 shadow-lg max-w-xs transform transition-all duration-300 translate-y-2 opacity-0'
        : 'bg-white text-blue-700 border-4 border-blue-600 rounded-md px-4 py-3 shadow-lg max-w-xs transform transition-all duration-300 translate-y-2 opacity-0';
    toast.className = baseClass;
    toast.innerHTML = `<div class="text-sm font-medium">${message}</div>`;
    container.appendChild(toast);

    requestAnimationFrame(() => { toast.classList.remove('translate-y-2', 'opacity-0'); });
    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function getElement(modal, selector) {
    return modal?.querySelector(selector) || document.getElementById(selector);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function createModal(options) {
    const { id, title, content, width = '520px' } = options;
    const existingModal = document.getElementById(id);
    if (existingModal) existingModal.remove();

    const closeBtnId = `close${id.charAt(0).toUpperCase() + id.slice(1)}`;
    const wrapper = document.createElement('div');
    wrapper.id = id;
    wrapper.className = `fixed inset-0 bg-black/40 flex items-center justify-center z-[${Z_INDEX.MODAL_BASE}]`;
    wrapper.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-6 max-w-[95vw] max-h-[90vh] overflow-y-auto relative" style="width: ${width}; min-width: ${width};">
            <button id="${closeBtnId}" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
            ${content}
        </div>
    `;
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

function updateFilterButtonStyles(containerSelector, activeStatus) {
    const buttons = document.querySelectorAll(`${containerSelector} .status-filter`);
    buttons.forEach(btn => {
        const status = btn.dataset.status;
        const config = getFilterConfig(status);
        const isActive = status === activeStatus;
        let classes = 'status-filter px-3 py-0.5 rounded-full border text-xs shadow-sm transition-all cursor-pointer ';
        if (isActive) {
            classes += `${config.activeBg} ${config.activeText} ${config.activeBorder}`;
        } else {
            classes += `bg-white text-gray-700 border-gray-300 ${config.hoverBg} ${config.hoverBorder} ${config.hoverText}`;
        }
        btn.className = classes;
    });
}

/* ================= APPLY FILTERS ================= */

function applyFilters() {
    const search = document.getElementById("searchInventory")?.value?.toLowerCase() || "";

    const riskFilters = new Set(['safe', 'near-expiry', 'at-risk']);
    filteredItems = inventoryItems.filter(item => {
        if (showArchivedItems) {
            if (!item.archived) return false;
        } else {
            if (item.archived) return false;
        }

        const matchesSearch = (
            (item.name || '').toLowerCase().includes(search) ||
            (item.id || '').toLowerCase().includes(search) ||
            (item.type || '').toLowerCase().includes(search)
        );

        const itemCategoryKey = normalizeCategoryKey(item.category);
        const activeCategoryKey = normalizeCategoryKey(currentCategoryFilter);
        const matchesCategory = isAllCategories(currentCategoryFilter) || itemCategoryKey === activeCategoryKey;
        const matchesStatus = (() => {
            if (currentStatusFilter === 'all') return true;
            if (riskFilters.has(currentStatusFilter)) return item.expiryRisk === currentStatusFilter;
            if (currentStatusFilter === 'pending') {
                return item.status === 'pending' || item.hasPendingRequest === true || item.hasPendingDisposalOnlyStock === true;
            }
            return item.status === currentStatusFilter;
        })();
        const matchesStockFilter = !showLowStockOnly || item.status === 'low-stock' || item.status === 'out-of-stock' || item.status === 'pending' || item.hasPendingRequest === true || item.hasPendingDisposalOnlyStock === true;

        return matchesSearch && matchesCategory && matchesStatus && matchesStockFilter;
    });

    filteredItems.sort((a, b) => getStatusSortPriority(a.status) - getStatusSortPriority(b.status));

    updateFilterButtonStyles('#statusFiltersContainer', currentStatusFilter);
    renderInventory();
}

/* ================= RENDER INVENTORY ================= */

function renderInventory() {
    const inventoryGrid = document.getElementById("inventoryGrid");
    if (!inventoryGrid) return;
    inventoryGrid.innerHTML = "";

    if (showLowStockOnly) {
        filteredItems = filteredItems.filter(item => item.status === "low-stock" || item.status === "out-of-stock" || item.status === "pending" || item.hasPendingRequest === true || item.hasPendingDisposalOnlyStock === true);
    }

    if (filteredItems.length === 0) {
        inventoryGrid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500"><p>No items found matching your criteria.</p></div>`;
        return;
    }

    filteredItems.forEach(item => {
        const isPending = item.status === 'pending' || item.hasPendingRequest === true || item.isPendingRequest === true;
        const colors = isPending ? STATUS_COLORS['pending'] : getStatusColors(item.status);
        const statusText = isPending ? 'Under Review' : getStatusDisplayText(item.status);
        const archivedPill = item.archived === true ? `<span class="ml-2 inline-block px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">Archived</span>` : '';
        const hasBatchWarning = hasExpiringSoonBatch(item.batches || []);
        const riskPill = getExpiryRiskPill(item.expiryRisk, {
            pendingDisposalOnly: item.hasPendingDisposalOnlyStock === true,
        });

        const card = document.createElement("div");
        card.className = "border border-gray-200 rounded-lg p-4 bg-white shadow-md hover:shadow-lg transition-all duration-200 h-full flex flex-col transform hover:-translate-y-1";
        card.setAttribute("data-card-id", item.id);

        const quantityColorClass = colors.quantity;

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
                <div class="flex justify-between">
                    <span class="text-gray-600">Current Quantity</span>
                    <span class="font-semibold ${quantityColorClass}">${item.currentQuantity} ${item.unit}</span>
                </div>
                <div class="text-gray-500">Strength: ${(String(item.strength || "").trim()) || "N/A"}</div>
                <div class="text-gray-500 flex items-center gap-2">
                    <img src="../../assets/calendar_icon.png" alt="Calendar" class="w-4 h-4">
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
                    <span class="font-bold text-blue-700 text-sm">₱${item.price.toFixed(2)}</span>
                </div>
            </div>

            <div class="flex flex-col gap-2 mt-auto">
                <div class="flex gap-2">
                    <button class="view-details-btn flex-1 border border-gray-300 py-2 rounded text-xs font-medium hover:bg-gray-100 transition-colors">
                        View Details
                    </button>
                    ${item.archived === true ?
                `<button class="restore-btn flex-1 bg-blue-600 text-white py-2 rounded text-xs font-medium hover:bg-blue-700 transition-colors" data-item-id="${item.id}">Restore</button>` :
                (item.hasPendingRestock ?
                    `<span class="flex-1 bg-yellow-50 text-yellow-700 py-2 rounded text-xs font-medium text-center border border-yellow-200">Under Review</span>` :
                    `<button class="restock-btn flex-1 bg-blue-600 text-white py-2 rounded text-xs font-medium hover:bg-blue-700 transition-colors">Request Restock</button>`
                )
            }
                </div>
                ${!item.archived && !item.isPendingRequest ?
                `<button class="archive-btn w-full border border-gray-400 bg-gray-50 text-gray-700 py-2 rounded text-xs font-medium hover:bg-gray-100 transition-colors" data-item-id="${item.id}"> Archive</button>` :
                ''
            }
            </div>
        `;
        inventoryGrid.appendChild(card);
    });
}

/* ================= SHOW ITEM DETAILS ================= */

async function showItemDetails(item) {
    const modal = document.getElementById("itemDetailsModal");
    if (!modal) { console.error('Modal element not found'); return; }

    /* If not a pending request, fetch fresh details from backend */
    let detailItem = item;
    if (!item.isPendingRequest) {
        try {
            const result = await apiFetch(API.ITEM_DETAILS(item.id));
            if (result.data) {
                detailItem = mapBackendItemToUI(result.data);
            }
        } catch (error) {
            console.error("Failed to fetch item details:", error);
        }
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
    setText("detailsBrandName", detailItem.brandName || detailItem.brand);
    setText("detailsCategory", formatCategory(detailItem.category));
    setText("detailsSellingPrice", `₱${(detailItem.price || 0).toFixed(2)}`);

    const requestedPricePreview = getElement(modal, '#detailsRequestedPricePreview');
    if (requestedPricePreview) {
        requestedPricePreview.classList.add('hidden');
        requestedPricePreview.textContent = '';
        try {
            const pendingPriceResponse = await apiFetch(API.PRICE_CHANGE_REQUEST_FOR_PRODUCT(detailItem.id));
            const pendingPriceRequest = pendingPriceResponse?.data || null;
            if (pendingPriceRequest && String(pendingPriceRequest.status || '') === 'pending') {
                requestedPricePreview.textContent = `Under Review · Requested: ₱${Number(pendingPriceRequest.requestedPrice || 0).toFixed(2)}`;
                requestedPricePreview.classList.remove('hidden');
            }
        } catch {
            // Keep details modal usable even if pending request lookup fails.
        }
    }

    // Medicine Information section
    setText("detailsMedicineName", detailItem.medicineName || detailItem.name);
    setText("detailsMedicineGeneric", detailItem.genericName || detailItem.generic);
    setText("detailsMedicineBrand", detailItem.brandName || detailItem.brand);
    setText("detailsDosageForm", detailItem.dosageForm || detailItem.dosage);
    setText("detailsStrength", detailItem.strength || detailItem.Strength || detailItem.dose || detailItem.dosageStrength);
    setText("detailsMedicineUnit", detailItem.unit);
    setText("detailsMedicineDescription", detailItem.description);

    // Inventory Details
    setText("detailsStock", `${detailItem.currentQuantity} ${detailItem.unit}`);
    setText("detailsMinStock", `${detailItem.minStock} ${detailItem.unit}`);
    setText("detailsBatchCount", String(detailItem.batchCount || (detailItem.batches || []).length || 0));
    setText("detailsExpiry", detailItem.expiryDate || "N/A");
    setText("detailsSupplier", detailItem.supplier);

    const statusTextContainer = getElement(modal, '#detailsStatusText');
    if (statusTextContainer) {
        statusTextContainer.innerHTML = `<span class="${getModalStatusTextClass(detailItem.status)}">${getStatusDisplayText(detailItem.status)}</span>`;
    }

    const batchRows = getElement(modal, "#detailsBatchRows");
    if (batchRows) {
        const rows = (detailItem.batches || []).map((batch) => {
            const expiryLabel = batch.expiryDateISO ? formatDateDisplay(batch.expiryDateISO, "N/A") : "N/A";
            const batchRiskPill = getExpiryRiskPill(batch.expiryRisk || null);
            const batchStatusOverride = getBatchStatusPill(batch);
            const displayPill = batchStatusOverride || batchRiskPill;
            const statusHtml = `<span class="inline-flex items-center gap-1 text-xs font-medium ${displayPill.textClass}"><span class="w-2 h-2 rounded-full inline-block" style="background:${displayPill.dotColor};"></span>${displayPill.label}</span>`;

            let actionHtml;
            if (batch.isPendingDisposal) {
                actionHtml = `<span class="text-xs font-medium text-orange-600">Under Review</span>`;
            } else if (batch.canDispose) {
                actionHtml = `<button class="staff-dispose-batch-btn inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors" data-batch-id="${escapeHtml(batch.id || "")}">Dispose</button>`;
            } else {
                actionHtml = `<span class="text-xs text-slate-500">No Action</span>`;
            }

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

        batchRows.querySelectorAll(".staff-dispose-batch-btn").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                const selectedBatch = (detailItem.batches || []).find(
                    (entry) => String(entry.id || "") === String(button.dataset.batchId || "")
                );
                if (selectedBatch) {
                    showStaffDisposalRequestModal(detailItem, selectedBatch);
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
            expiryTextEl.textContent = 'Expiry date not available';
            expiryBadge.textContent = expiryMeta.badgeText;
            expiryBadge.className = expiryMeta.badgeClass;
        }
    }

    /* ---- Modal buttons ---- */
    const btnCloseTop = getElement(modal, '#closeItemDetails');
    const btnCancel = getElement(modal, '#closeDetails');
    const btnRequestRestock = getElement(modal, '#detailsRequestRestockBtn');
    const btnReportDiscrepancy = getElement(modal, '#detailsReportDiscrepancyBtn');
    const btnEditPrice = getElement(modal, '#detailsEditPriceBtn');
    const btnEditPriceSecondary = getElement(modal, '#detailsEditPriceBtnSecondary');

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
    if (btnRequestRestock) {
        const newBtn = btnRequestRestock.cloneNode(true);
        btnRequestRestock.parentNode.replaceChild(newBtn, btnRequestRestock);
        newBtn.onclick = (e) => {
            e?.stopPropagation?.();
            requestRestock(detailItem);
        };
    }

    if (btnReportDiscrepancy) {
        const newBtn = btnReportDiscrepancy.cloneNode(true);
        btnReportDiscrepancy.parentNode.replaceChild(newBtn, btnReportDiscrepancy);
        newBtn.onclick = (e) => {
            e?.stopPropagation?.();
            openQuantityAdjustmentModal(detailItem);
        };
    }

    if (btnEditPrice) {
        const newBtn = btnEditPrice.cloneNode(true);
        btnEditPrice.parentNode.replaceChild(newBtn, btnEditPrice);
        newBtn.onclick = (e) => {
            e?.stopPropagation?.();
            showStaffEditPriceRequestModal(detailItem);
        };
    }

    if (btnEditPriceSecondary) {
        const newBtn = btnEditPriceSecondary.cloneNode(true);
        btnEditPriceSecondary.parentNode.replaceChild(newBtn, btnEditPriceSecondary);
        newBtn.onclick = (e) => {
            e?.stopPropagation?.();
            showStaffEditPriceRequestModal(detailItem);
        };
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function showStaffEditPriceRequestModal(item) {
    const currentPrice = Number(item?.price ?? 0);
    const content = `
        <h3 class="text-lg font-semibold mb-1">Edit Price</h3>
        <p class="text-sm text-gray-600 mb-4">Submit a price change request for <span class="font-semibold text-gray-800">${escapeHtml(item?.name || 'Item')}</span>.</p>
        <div class="space-y-3 text-sm">
            <div>
                <label class="block text-xs text-gray-700 mb-1">Current Price</label>
                <input type="text" value="₱${currentPrice.toFixed(2)}" class="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50" readonly />
            </div>
            <div>
                <label class="block text-xs text-gray-700 mb-1">New Price</label>
                <input id="staffRequestedPriceInput" type="number" min="0.01" step="0.01" value="${currentPrice.toFixed(2)}" class="w-full border border-gray-300 rounded px-3 py-2" />
                <p id="staffRequestedPriceError" class="text-red-600 text-xs mt-1 hidden"></p>
            </div>
            <div>
                <label class="block text-xs text-gray-700 mb-1">Reason for Change <span class="text-red-600">*</span></label>
                <textarea id="staffPriceChangeReasonInput" rows="3" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Explain why this price should change..."></textarea>
            </div>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-3">
            <button id="staffPriceChangeCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 text-gray-700">Cancel</button>
            <button id="staffPriceChangeSubmitBtn" class="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">Submit Request</button>
        </div>`;

    const modal = createModal({ id: 'staffEditPriceModal', content, width: '480px' });

    const hide = () => {
        modal.classList.add('hidden');
        modal.style.display = '';
        setTimeout(() => modal.remove(), 200);
    };

    getElement(modal, '#closeStaffEditPriceModal')?.addEventListener('click', hide);
    getElement(modal, '#staffPriceChangeCancelBtn')?.addEventListener('click', hide);

    const priceInput = getElement(modal, "#staffRequestedPriceInput");
    const priceError = getElement(modal, "#staffRequestedPriceError");
    const saveBtn = getElement(modal, "#staffPriceChangeSubmitBtn");

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

    // Initial validation check
    if (priceInput) {
        validatePrice();
    }

    priceInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (saveBtn && !saveBtn.disabled) {
                saveBtn.click();
            }
        }
    });

    getElement(modal, '#staffPriceChangeSubmitBtn')?.addEventListener('click', async () => {
        const newPrice = Number(getElement(modal, '#staffRequestedPriceInput')?.value || 0);
        const reason = String(getElement(modal, '#staffPriceChangeReasonInput')?.value || '').trim();

        if (!Number.isFinite(newPrice) || newPrice <= 0) {
            showToast('Price must be greater than zero.', 'error');
            return;
        }

        if (newPrice === currentPrice) {
            showToast('Requested price must be different from current price', 'error');
            return;
        }

        if (!reason) {
            showToast('Reason is required for staff price change requests', 'error');
            return;
        }

        try {
            await apiFetch(API.PRICE_CHANGE_REQUEST, {
                method: 'POST',
                body: JSON.stringify({
                    productId: item.id,
                    newPrice,
                    reason,
                }),
            });

            showToast('Price change request submitted for review', 'success');
            hide();
            await fetchInventoryItems();
            applyFilters();
            await showItemDetails(item);
        } catch (err) {
            showToast(`Request failed: ${err.message}`, 'error');
        }
    });

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

/* ================= STAFF DISPOSAL REQUEST MODAL ================= */

function showStaffDisposalRequestModal(item, batch) {
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
        <h3 class="text-lg font-semibold mb-1">Submit Disposal Request</h3>
        <p class="text-sm text-gray-600 mb-4">Submit a disposal request for this batch. The owner will review and approve or reject it.</p>
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
                <input id="staffDisposeQuantityInput" type="number" min="1" max="${Number(batch.currentQuantity ?? batch.quantity ?? 0)}" value="1" class="w-full border border-gray-300 rounded px-3 py-2" />
            </label>
            <label class="md:col-span-2">
                <span class="block text-xs font-medium text-gray-500 mb-1">Reason for Disposal</span>
                <select id="staffDisposeReasonInput" class="w-full border border-gray-300 rounded px-3 py-2">${reasonOptions}</select>
            </label>
            <label class="md:col-span-2">
                <span class="block text-xs font-medium text-gray-500 mb-1">Disposal Method</span>
                <select id="staffDisposeMethodInput" class="w-full border border-gray-300 rounded px-3 py-2">${methodOptions}</select>
            </label>
            <label class="md:col-span-2">
                <span class="block text-xs font-medium text-gray-500 mb-1">Remarks (Optional)</span>
                <textarea id="staffDisposeRemarksInput" rows="3" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Add remarks for the digital audit trail..."></textarea>
            </label>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-3">
            <button id="staffCancelDisposalBtn" class="w-full border border-gray-300 py-2 rounded-lg bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button id="staffSubmitDisposalBtn" class="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700">Submit for Review</button>
        </div>`;

    const modal = createModal({ id: "staffDisposalRequestModal", content, width: "640px" });
    const hide = () => {
        modal.classList.add("hidden");
        modal.style.display = "none";
        setTimeout(() => modal.remove(), 200);
    };

    getElement(modal, "#closeStaffDisposalRequestModal")?.addEventListener("click", hide);
    getElement(modal, "#staffCancelDisposalBtn")?.addEventListener("click", hide);

    getElement(modal, "#staffSubmitDisposalBtn")?.addEventListener("click", async () => {
        const disposeQuantity = Number(getElement(modal, "#staffDisposeQuantityInput")?.value || 0);
        const reason = getElement(modal, "#staffDisposeReasonInput")?.value || "Expired";
        const disposalMethod = getElement(modal, "#staffDisposeMethodInput")?.value || null;
        const remarks = getElement(modal, "#staffDisposeRemarksInput")?.value || "";

        if (!Number.isInteger(disposeQuantity) || disposeQuantity <= 0) {
            showToast("Dispose quantity must be a positive whole number", "error");
            return;
        }

        if (disposeQuantity > Number(batch.currentQuantity ?? batch.quantity ?? 0)) {
            showToast("Dispose quantity must not exceed the available batch quantity", "error");
            return;
        }

        try {
            const response = await apiFetch(API.DISPOSAL_REQUEST, {
                method: "POST",
                body: JSON.stringify({
                    productId: item.id,
                    batchId: batch.id,
                    quantityDisposed: disposeQuantity,
                    reason,
                    remarks,
                    disposalMethod: disposalMethod || null,
                }),
            });
            const referenceId = response?.reference_id || response?.data?.referenceId;
            showToast(referenceId
                ? `Disposal request submitted successfully (${referenceId}). Status: Under Review.`
                : "Disposal request submitted successfully. Status: Under Review.", "success");
            hide();
            try {
                const result = await apiFetch(API.ITEM_DETAILS(item.id));
                if (result.data) {
                    const updatedItem = mapBackendItemToUI(result.data);
                    const idx = inventoryItems.findIndex((entry) => entry.id === item.id);
                    if (idx !== -1) inventoryItems[idx] = updatedItem;
                    await showItemDetails(updatedItem);
                }
            } catch (refreshError) {
                console.warn("Disposal request created but item refresh failed", refreshError);
            }
        } catch (err) {
            showToast(err.message || "Failed to submit disposal request", "error");
        }
    });
}

/* ================= SHOW ARCHIVE CONFIRM ================= */

function showArchiveConfirm(item) {
    const detailsModal = document.getElementById('itemDetailsModal');

    const content = `
        <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <img src="../../assets/alert_circle_icon.png" alt="Alert" class="w-10 h-10">
            </div>
            <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900">Are you sure you want to Archive this item?</h3>
                <p id="archiveItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
                <p class="text-sm text-gray-600 mt-1">Note: Archived items will be moved to archive page and can be restored later</p>
            </div>
        </div>
        <div class="mt-6 grid grid-cols-2 gap-4">
            <button id="archiveCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
            <button id="archiveConfirmBtn" class="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">Confirm</button>
        </div>
    `;

    const archiveModal = createModal({ id: 'archiveConfirmModal', content });
    archiveModal.classList.add('hidden');
    archiveModal.style.display = 'none';
    setTimeout(() => { archiveModal.classList.remove('hidden'); archiveModal.style.display = 'flex'; }, 10);

    const nameEl = getElement(archiveModal, '#archiveItemName');
    if (nameEl) nameEl.textContent = item.name || '';
    setTimeout(() => { if (detailsModal) { detailsModal.classList.add('hidden'); detailsModal.style.display = ''; } }, 50);

    const hide = () => { archiveModal.classList.add('hidden'); archiveModal.style.display = ''; };

    getElement(archiveModal, '#closeArchiveConfirmModal')?.addEventListener('click', hide);
    getElement(archiveModal, '#archiveCancelBtn')?.addEventListener('click', hide);

    getElement(archiveModal, '#archiveConfirmBtn')?.addEventListener('click', async () => {
        const detailsModalEl = document.getElementById('itemDetailsModal');
        if (detailsModalEl) { detailsModalEl.classList.add('hidden'); detailsModalEl.style.display = ''; }

        try {
            await apiFetch(API.ARCHIVE(item.id), {
                method: "PATCH",
                body: JSON.stringify({ reason: "Staff archived product" }),
            });

            showToast('Archived Successfully', 'success');
        } catch (error) {
            console.error("Archive failed:", error);
            showToast('Archive failed: ' + error.message, 'error');
        }

        /* Refresh all data from backend */
        await refreshAllData();
        hide();
    });
}

/* ================= SHOW RESTORE CONFIRM ================= */

function showRestoreConfirm(item) {
    const detailsModal = document.getElementById('itemDetailsModal');

    const content = `
        <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <img src="../../assets/alert_circle_icon.png" alt="Restore" class="w-10 h-10">
            </div>
            <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900">Are you sure you want to Restore this item?</h3>
                <p id="restoreItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
                <p class="text-sm text-gray-600 mt-1">Note: Restored items will be returned to the active inventory list.</p>
            </div>
        </div>
        <div class="mt-6 grid grid-cols-2 gap-4">
            <button id="restoreCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
            <button id="restoreConfirmBtn" class="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">Confirm</button>
        </div>
    `;

    const restoreModal = createModal({ id: 'restoreConfirmModal', content });
    restoreModal.classList.add('hidden');
    restoreModal.style.display = 'none';
    setTimeout(() => { restoreModal.classList.remove('hidden'); restoreModal.style.display = 'flex'; }, 10);

    const nameEl = getElement(restoreModal, '#restoreItemName');
    if (nameEl) nameEl.textContent = item.name || '';
    setTimeout(() => { if (detailsModal) { detailsModal.classList.add('hidden'); detailsModal.style.display = ''; } }, 50);

    const hide = () => { restoreModal.classList.add('hidden'); restoreModal.style.display = ''; };

    const closeBtn = getElement(restoreModal, '#closeRestoreConfirmModal');
    const cancelBtn = getElement(restoreModal, '#restoreCancelBtn');
    const confirmBtn = getElement(restoreModal, '#restoreConfirmBtn');

    if (closeBtn) closeBtn.onclick = hide;
    if (cancelBtn) cancelBtn.onclick = hide;

    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const detailsModalEl = document.getElementById('itemDetailsModal');
            if (detailsModalEl) { detailsModalEl.classList.add('hidden'); detailsModalEl.style.display = ''; }

            try {
                await apiFetch(API.RESTORE(item.id), { method: "PATCH" });
                showToast('Restored Successfully', 'success');
            } catch (error) {
                console.error("Restore failed:", error);
                showToast('Restore failed: ' + error.message, 'error');
            }

            await refreshAllData();
            hide();
        };
    }
}

/* ================= QUANTITY ADJUSTMENT ================= */

function openQuantityAdjustmentModal(item) {
    // Close item details modal first to prevent UI overlap
    const itemDetailsModal = document.getElementById("itemDetailsModal");
    if (itemDetailsModal) {
        itemDetailsModal.classList.add('hidden');
        itemDetailsModal.style.display = '';
    }

    // Create or reuse modal
    let modal = document.getElementById("quantityAdjustmentModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "quantityAdjustmentModal";
        modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4";
        document.body.appendChild(modal);
    }

    const expectedRemaining = Number(item.expectedRemaining ?? item.currentQuantity ?? 0);
    const initialPhysicalCount = Number(item.physicalCount ?? expectedRemaining);
    const currentGenericName = String(item.genericName || item.generic || "");
    const currentDosageForm = String(item.dosageForm || item.dosage || "");
    const currentStrength = String(item.strength || item.dose || "");
    const currentCategory = String(item.category || "");

    modal.innerHTML = `
        <div class="w-full max-w-[480px] bg-white rounded-xl shadow-sm p-6 relative">
            <button id="adjustCloseBtn" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
            <h2 class="text-lg font-semibold text-gray-900 mb-1">Report Discrepancy</h2>
            <p class="text-sm text-gray-600 mb-4">Submit discrepancy for approval. Inventory will not update until approved.</p>

            <div class="space-y-3 text-sm">
                <div class="flex justify-between py-2 border-b border-gray-100">
                    <span class="text-gray-600">Expected Remaining</span>
                    <span class="font-semibold text-gray-900">${expectedRemaining} ${escapeHtml(item.unit || "pcs")}</span>
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

                <div>
                    <label class="block text-xs text-gray-700 mb-1">Physical Count (Actual Quantity) <span class="text-red-600">*</span></label>
                    <input id="actualQtyInput" type="number" min="0" value="${initialPhysicalCount}" class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    <p id="adjustQtyError" class="text-red-600 text-xs mt-1 hidden">Physical count is required.</p>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div class="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <p class="text-xs text-gray-500">Variance</p>
                        <p id="discrepancyVariancePreview" class="text-sm font-semibold text-gray-800 mt-1">0 ${escapeHtml(item.unit || "pcs")}</p>
                    </div>
                    <div class="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <p class="text-xs text-gray-500">Status</p>
                        <p id="discrepancyStatusPreview" class="text-sm font-semibold text-gray-800 mt-1">Balanced</p>
                    </div>
                </div>
            </div>

            <div class="mt-5 grid grid-cols-2 gap-3">
                <button id="adjustCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
                <button id="adjustSubmitBtn" class="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">Submit Discrepancy</button>
            </div>
        </div>
    `;

    modal.style.display = "flex";

    const close = () => { modal.style.display = "none"; };
    modal.querySelector("#adjustCloseBtn").addEventListener("click", close);
    modal.querySelector("#adjustCancelBtn").addEventListener("click", close);

    const actualQtyInput = modal.querySelector("#actualQtyInput");
    const variancePreview = modal.querySelector("#discrepancyVariancePreview");
    const statusPreview = modal.querySelector("#discrepancyStatusPreview");

    const updateVariancePreview = () => {
        const physicalCount = Number(actualQtyInput?.value ?? initialPhysicalCount);
        const variance = physicalCount - expectedRemaining;
        if (variancePreview) {
            variancePreview.textContent = `${variance >= 0 ? "+" : ""}${variance} ${item.unit}`;
            variancePreview.className = `text-sm font-semibold mt-1 ${variance === 0 ? "text-green-700" : "text-amber-700"}`;
        }
        if (statusPreview) {
            const status = variance === 0 ? "Balanced" : "With Variance";
            statusPreview.textContent = status;
            statusPreview.className = `text-sm font-semibold mt-1 ${status === "Balanced" ? "text-green-700" : "text-amber-700"}`;
        }
    };

    updateVariancePreview();
    actualQtyInput?.addEventListener("input", updateVariancePreview);

    modal.querySelector("#adjustSubmitBtn").addEventListener("click", async () => {
        const actualQtyEl = modal.querySelector("#actualQtyInput");
        const qtyErrorEl = modal.querySelector("#adjustQtyError");
        const category = String(modal.querySelector("#discrepancyCategoryInput")?.value || "").trim();
        const genericName = String(modal.querySelector("#discrepancyGenericNameInput")?.value || "").trim();
        const dosageForm = String(modal.querySelector("#discrepancyDosageFormInput")?.value || "").trim();
        const strength = String(modal.querySelector("#discrepancyStrengthInput")?.value || "").trim();

        qtyErrorEl.classList.add("hidden");

        const actualQuantity = actualQtyEl.value.trim();
        let valid = true;

        if (actualQuantity === "" || isNaN(Number(actualQuantity)) || Number(actualQuantity) < 0) {
            qtyErrorEl.classList.remove("hidden");
            valid = false;
        }
        if (!valid) return;

        const variance = Number(actualQuantity) - expectedRemaining;
        const discrepancyStatus = variance === 0 ? "Balanced" : "With Variance";
        const reason = `Discrepancy report submitted by staff. Category: ${category || "N/A"}; Generic: ${genericName || "N/A"}; Dosage Form: ${dosageForm || "N/A"}; Strength: ${strength || "N/A"}; Variance: ${variance}; Status preview: ${discrepancyStatus}.`;

        try {
            await apiFetch(API.QUANTITY_ADJUSTMENT, {
                method: "POST",
                body: JSON.stringify({ productId: item.id, actualQuantity: Number(actualQuantity), reason }),
            });
            showToast("Discrepancy report submitted successfully. Status: Pending", "success");
            close();
            await refreshAllData();
        } catch (error) {
            showToast("Failed to submit discrepancy: " + error.message, "error");
        }
    });
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
    } else if (item.status === 'pending') {
        alertHtml = `<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2 mb-2">
            <img src="../../assets/alert_circle_icon.png" class="w-5 h-5 flex-shrink-0 mt-0.5" alt="pending">
            <div class="text-sm text-yellow-800"><p class="font-semibold">Pending</p>
            <p class="mt-0.5 text-xs">This item is still pending</p></div></div>`;
    } else {
        alertHtml = `<div class="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 mb-2">
            <img src="../../assets/inventory_lowstock_alert.png" class="w-5 h-5 flex-shrink-0 mt-0.5" alt="in stock">
            <div class="text-sm text-blue-700"><p class="font-semibold">In Stock</p>
            <p class="mt-0.5 text-xs">This item is currently in stock.</p></div></div>`;
    }

    modalContent.innerHTML = `
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl closeRestockBtn">&times;</button>
        <h2 class="text-lg font-semibold">Request Restock</h2>
        <p class="text-sm text-gray-600 mt-1 mb-2">Submit a restock request for <span>${item.name}</span></p>
        ${alertHtml}
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1 mb-2">
            <div class="flex justify-between"><span class="text-gray-600">Item :</span><span class="font-semibold">${item.name}</span></div>
            <div class="flex justify-between"><span class="text-gray-600">Current Stock :</span><span class="font-semibold text-blue-700">${item.currentQuantity} ${item.unit}</span></div>
            <div class="flex justify-between"><span class="text-gray-600">Minimum Stock :</span><span class="font-semibold text-red-600">${item.minStock} ${item.unit}</span></div>
            <div class="flex justify-between"><span class="text-gray-600">Supplier :</span><span class="font-semibold">${item.supplier || "N/A"}</span></div>
        </div>
        <div class="mb-2"><label class="block text-sm font-semibold mb-1">Quantity <span class="text-red-600">*</span></label>
        <input id="restockQuantityInput" type="number" min="1" placeholder="Enter quantity" value="${item.minStock || ""}" class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <p id="restockQuantityError" class="text-red-600 text-xs mt-1 hidden">Quantity is required.</p></div>
        <div class="mb-2"><label class="block text-sm font-semibold mb-1">Notes (Optional) :</label>
        <textarea id="restockNotesInput" placeholder="Add any notes..." class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows="2"></textarea></div>
        <div class="flex gap-2">
            <button class="flex-1 border border-gray-300 py-2 rounded bg-white text-sm font-semibold hover:bg-gray-50 cancelRestockBtn">Cancel</button>
            <button id="restockSubmitBtn" class="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700">Submit Request</button>
        </div>
    `;

    const closeBtn = getElement(modalContent, ".closeRestockBtn");
    const cancelBtn = getElement(modalContent, ".cancelRestockBtn");
    const submitBtn = getElement(modalContent, "#restockSubmitBtn");

    if (closeBtn) closeBtn.addEventListener("click", (e) => { e.stopPropagation(); modal.style.display = 'none'; modal.classList.add("hidden"); });
    if (cancelBtn) cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); modal.style.display = 'none'; modal.classList.add("hidden"); });

    if (submitBtn) {
        submitBtn.addEventListener("click", async () => {
            const qtyInput = modalContent.querySelector("#restockQuantityInput");
            const errorEl = modalContent.querySelector("#restockQuantityError");
            const quantity = qtyInput ? parseFloat(qtyInput.value) : 0;

            if (errorEl) errorEl.classList.add("hidden");
            if (!qtyInput?.value || qtyInput.value === "" || quantity <= 0) {
                if (errorEl) { errorEl.classList.remove("hidden"); errorEl.textContent = "Quantity is required."; }
                if (qtyInput) qtyInput.focus();
                return;
            }

            try {
                await apiFetch(API.RESTOCK_REQUEST, {
                    method: "POST",
                    body: JSON.stringify({ productId: item.id, quantity }),
                });
                showToast('Request Restock Successfully', 'success');
                modal.style.display = 'none';
                modal.classList.add("hidden");
                await refreshAllData();
            } catch (error) {
                console.error("Restock request failed:", error);
                showToast('Restock request failed: ' + error.message, 'error');
            }
        });
    }

    modal.style.display = 'flex';
    modal.classList.remove("hidden");
    const detailsModal = document.getElementById("itemDetailsModal");
    if (detailsModal) detailsModal.classList.add('hidden');
}

/* ================= RENDER RESTOCK REQUESTS ================= */

function renderRestockRequests() {
    const list = document.getElementById("restockRequestsList");
    if (!list) return;

    if (restockRequests.length === 0) {
        list.innerHTML = `<div class="text-center py-8 text-gray-500">No restock requests.</div>`;
        return;
    }

    list.innerHTML = restockRequests.map(req => {
        const statusMap = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
        const statusLabel = statusMap[req.status] || req.status;
        const colors = getStatusColors(req.status === "approved" ? "in-stock" : (req.status === "rejected" ? "out-of-stock" : "pending"));
        const typeLabel = req.requestType === "ADD_ITEM" ? "Add Item" : "Restock";
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-2">
                <div class="p-2">
                    <div class="flex justify-start items-start gap-4">
                        <div>
                            <h3 class="font-semibold w-[558px]">${req.item}</h3>
                            <p class="text-sm text-gray-600">${typeLabel}</p>
                            <p class="text-sm text-gray-500">${req.category ? formatCategory(req.category) : ''}</p>
                        </div>
                        <div><span class="px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}">${statusLabel}</span></div>
                    </div>
                    <div class="mt-1 bg-gray-100 p-1 rounded text-sm grid grid-cols-2 gap-4">
                        <div>
                            <div class="text-xs text-gray-500">${req.requestType === "ADD_ITEM" ? "Initial Quantity" : "Requested Qty"} :</div>
                            <div class="font-semibold text-blue-700">${req.quantity ?? 'N/A'} ${req.unit ?? ''}</div>
                        </div>
                        ${req.currentQuantity != null ? `<div>
                            <div class="text-xs text-gray-500">Current Stock :</div>
                            <div class="font-semibold text-red-600">${req.currentQuantity} ${req.unit ?? ''}</div>
                        </div>` : ''}
                    </div>
                    <div class="mt-1 border-t border-gray-200 pt-1 text-sm text-gray-600 flex items-center gap-3">
                        <img src="../../assets/calendar_icon.png" class="w-4 h-4" alt="req">
                        <div>Requested : ${req.timestamp}</div>
                        <div class="text-gray-500">by Staff</div>
                    </div>
                    ${req.status === "pending" ? `<div class="mt-1 p-1 bg-gray-50 text-sm text-gray-500 rounded">Waiting for approval...</div>` : ''}
                    ${req.status === "rejected" && req.rejectionReason ? `<div class="mt-1 p-1 bg-red-50 text-sm text-red-600 rounded">Reason: ${req.rejectionReason}</div>` : ''}
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

    /* Map backend actionType to display-friendly action label */
    const actionDisplayMap = {
        "restock-request": "Requested",
        "add-item-request": "Added",
        "archive-item": "Archived",
        "restore-item": "Restored",
        "view-item-details": "Viewed",
    };

    activityList.innerHTML = activityLog.map(log => {
        const actionLabel = actionDisplayMap[log.action] || log.action;
        let actionIcon = "../../assets/plus_icon.png";
        let actionColor = "bg-blue-50";

        if (log.action === "archive-item") {
            actionIcon = "../../assets/archive_icon.png";
            actionColor = "bg-gray-50";
        } else if (log.action === "restore-item") {
            actionColor = "bg-blue-50";
        }

        const colors = getStatusColors(log.status || 'in-stock');

        return `
            <div class="${actionColor} rounded-lg p-3 mb-3 border border-gray-200 hover:shadow-md transition">
                <div class="flex items-start gap-3 mb-3">
                    <img src="${actionIcon}" alt="${actionLabel}" class="w-5 h-5 mt-1 flex-shrink-0">
                    <div class="flex-1">
                        <div class="flex items-center gap-40 mb-1">
                            <h3 class="font-semibold w-24 text-gray-800">${actionLabel}</h3>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}">${log.status || ''}</span>
                        </div>
                    </div>
                </div>
                <div class="ml-8 mb-2">
                    <p class="text-sm text-gray-600">${log.item}</p>
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
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Request Restock</h2>
        <p class="text-sm text-gray-600 mb-4">Submit a bulk restock request for low stock items</p>
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 mb-4">
            <img src="../../assets/inventory_lowstock_alert.png" class="w-5 h-5 flex-shrink-0 mt-0.5" alt="low stock">
            <div class="text-sm text-red-700">
                <p class="font-semibold">Low Stock Items</p>
                <p class="mt-0.5 text-xs">These items need immediate restocking.</p>
            </div>
        </div>
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
            <p class="text-xs text-gray-600 font-semibold mb-2">Low Stock Items (<span id="bulkItemCount">0</span>):</p>
            <div id="bulkItemsList" class="space-y-1 max-h-32 overflow-y-auto"></div>
        </div>
        <div class="mb-4">
            <label class="block text-sm font-semibold mb-1">Total Quantity <span class="text-red-600">*</span></label>
            <input id="bulkQuantityInput" type="number" min="1" placeholder="Enter quantity" class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <p id="bulkQuantityError" class="text-red-600 text-xs mt-1 hidden">Quantity is required.</p>
        </div>
        <div class="mb-4">
            <label class="block text-sm font-semibold mb-1">Notes (Optional):</label>
            <textarea id="bulkNotesInput" placeholder="Add any notes..." class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows="2"></textarea>
        </div>
        <div class="flex gap-2">
            <button id="bulkCancelBtn" class="flex-1 border border-gray-300 py-2 rounded bg-white text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button id="bulkSubmitBtn" class="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700">Submit Request</button>
        </div>
    `;

    const bulkRestockModal = createModal({ id: 'bulkRestockModal', content });
    bulkRestockModal.classList.add('hidden');
    bulkRestockModal.style.display = 'none';
    setTimeout(() => { bulkRestockModal.classList.remove('hidden'); bulkRestockModal.style.display = 'flex'; }, 10);

    const itemsList = getElement(bulkRestockModal, '#bulkItemsList');
    const itemCount = getElement(bulkRestockModal, '#bulkItemCount');

    /* Only include items that can be restocked (low/out, not pending requests) */
    const restockableItems = filteredItems.filter(i => !i.isPendingRequest && (i.status === "low-stock" || i.status === "out-of-stock"));

    if (itemsList) {
        itemsList.innerHTML = restockableItems.map(item => `<div class="text-sm text-gray-700">\u2022 ${item.name}</div>`).join('');
        if (itemCount) itemCount.textContent = restockableItems.length;
    }

    const closeBtn = getElement(bulkRestockModal, '#closeBulkRestockModal');
    const cancelBtn = getElement(bulkRestockModal, '#bulkCancelBtn');
    const submitBtn = getElement(bulkRestockModal, '#bulkSubmitBtn');
    const errorEl = getElement(bulkRestockModal, '#bulkQuantityError');
    const qtyInput = getElement(bulkRestockModal, '#bulkQuantityInput');

    const hide = () => { bulkRestockModal.classList.add('hidden'); bulkRestockModal.style.display = ''; };
    if (closeBtn) closeBtn.onclick = hide;
    if (cancelBtn) cancelBtn.onclick = hide;

    if (submitBtn) {
        submitBtn.onclick = async () => {
            const quantity = qtyInput ? parseInt(qtyInput.value) : 0;
            if (errorEl) errorEl.classList.add('hidden');
            if (!qtyInput?.value || qtyInput.value === "" || quantity <= 0) {
                if (errorEl) { errorEl.classList.remove('hidden'); errorEl.textContent = "Quantity is required."; }
                if (qtyInput) qtyInput.focus();
                return;
            }

            let successCount = 0;
            let failCount = 0;

            for (const item of restockableItems) {
                try {
                    await apiFetch(API.RESTOCK_REQUEST, {
                        method: "POST",
                        body: JSON.stringify({ productId: item.id, quantity }),
                    });
                    successCount++;
                } catch (error) {
                    console.error(`Bulk restock failed for ${item.name}:`, error);
                    failCount++;
                }
            }

            if (failCount > 0) {
                showToast(`Bulk Restock: ${successCount} success, ${failCount} failed`, 'error');
            } else {
                showToast('Bulk Restock Request Successfully', 'success');
            }

            hide();
            await refreshAllData();
        };
    }
}

/* ================= SHOW ADD ITEM MODAL ================= */

function showAddItemModal() {
    const content = `
        <h3 class="text-lg font-semibold text-gray-900 mb-1">Add Item</h3>
        <p class="text-sm text-gray-600 mb-4">Items will remain pending until approved</p>
        
        <!-- Basic Medicine Information -->
        <div class="mb-4 pb-4 border-b border-gray-200">
            <h4 class="text-sm font-semibold text-gray-900 mb-3">Basic Medicine Information</h4>
            <div class="space-y-3 text-sm">
                <div>
                    <label class="block text-xs text-gray-700 mb-1 font-medium">Medicine Name <span class="text-red-600">*</span></label>
                    <input id="addMedicineName" placeholder="e.g., Paracetamol" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p id="addMedicineNameError" class="text-red-600 text-xs mt-1 hidden">Required</p>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs text-gray-700 mb-1 font-medium">Generic Name <span class="text-red-600">*</span></label>
                        <input id="addGeneric" placeholder="e.g., Acetaminophen" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <p id="addGenericError" class="text-red-600 text-xs mt-1 hidden">Required</p>
                    </div>
                    <div>
                        <label class="block text-xs text-gray-700 mb-1 font-medium">Brand Name</label>
                        <input id="addBrand" placeholder="e.g., Biogesic" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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

        <!-- Inventory Details -->
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
                    <label class="block text-xs text-gray-700 mb-1 font-medium">Selling Price (\u20B1) <span class="text-red-600">*</span></label>
                    <input id="addPrice" type="number" min="0" step="0.01" placeholder="e.g., 20.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p id="addPriceError" class="text-red-600 text-xs mt-1 hidden">Required</p>
                </div>
            </div>
        </div>
        <div class="mt-5 flex gap-3 justify-end">
            <button id="addCancelBtn" class="border border-gray-300 py-2 px-4 rounded-lg bg-white hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
            <button id="addSaveBtn" class="bg-blue-700 text-white py-2 px-4 rounded-lg hover:bg-blue-800 transition-colors">Save</button>
        </div>
    `;

    const addItemModal = createModal({ id: 'addItemModal', content, width: '575px' });

    const closeBtn = getElement(addItemModal, '#closeAddItemModal');
    const cancel = getElement(addItemModal, '#addCancelBtn');
    const save = getElement(addItemModal, '#addSaveBtn');
    const hide = () => { addItemModal.classList.add('hidden'); addItemModal.style.display = ''; setTimeout(() => addItemModal.remove(), 200); };

    if (closeBtn) closeBtn.onclick = hide;
    if (cancel) cancel.onclick = hide;

    // Initialize voice recognition for the Description field
    initVoiceRecognitionForModal(addItemModal);

    // Real-time price validation
    const addPriceInput = getElement(addItemModal, '#addPrice');
    const addPriceError = getElement(addItemModal, '#addPriceError');
    const addSaveBtn = getElement(addItemModal, '#addSaveBtn');

    const validateSellingPrice = () => {
        const val = parseFloat(addPriceInput.value || 0);
        if (isNaN(val) || val <= 0) {
            addPriceError.classList.remove("hidden");
            addPriceError.textContent = "Price must be greater than zero.";
            if (addSaveBtn) {
                addSaveBtn.disabled = true;
                addSaveBtn.classList.add("opacity-50", "cursor-not-allowed");
            }
            return false;
        } else {
            addPriceError.classList.add("hidden");
            if (addSaveBtn) {
                addSaveBtn.disabled = false;
                addSaveBtn.classList.remove("opacity-50", "cursor-not-allowed");
            }
            return true;
        }
    };

    addPriceInput?.addEventListener("input", validateSellingPrice);
    addPriceInput?.addEventListener("blur", validateSellingPrice);

    // Initial validation check if value is already set (e.g. 0 by default)
    if (addPriceInput) {
        // Set default value to 0 if empty to trigger validation
        if (addPriceInput.value === "") addPriceInput.value = "0";
        validateSellingPrice();
    }

    if (save) {
        save.onclick = async () => {
            // Get all field values
            const medicineNameEl = getElement(addItemModal, '#addMedicineName');
            const genericEl = getElement(addItemModal, '#addGeneric');
            const brandEl = getElement(addItemModal, '#addBrand');
            const categoryEl = getElement(addItemModal, '#addCategory');
            const dosageFormEl = getElement(addItemModal, '#addDosageForm');
            const strengthEl = getElement(addItemModal, '#addStrength');
            const unitEl = getElement(addItemModal, '#addUnit');
            const descriptionEl = getElement(addItemModal, '#addDescription');
            const qtyEl = getElement(addItemModal, '#addQuantity');
            const minStockEl = getElement(addItemModal, '#addMinStock');
            const batchEl = getElement(addItemModal, '#addBatch');
            const expiryEl = getElement(addItemModal, '#addExpiry');
            const supplierEl = getElement(addItemModal, '#addSupplier');
            const priceEl = getElement(addItemModal, '#addPrice');

            const medicineName = (medicineNameEl?.value || '').trim();
            const generic = (genericEl?.value || '').trim();
            const brand = (brandEl?.value || '').trim();
            const category = (categoryEl?.value || '').trim();
            const dosageForm = (dosageFormEl?.value || '').trim();
            const strength = (strengthEl?.value || '').trim();
            const unit = (unitEl?.value || '').trim();
            const description = (descriptionEl?.value || '').trim();
            const qtyRaw = qtyEl?.value ?? '';
            const qty = qtyRaw === '' ? NaN : parseInt(qtyRaw, 10);
            const minStockRaw = minStockEl?.value ?? '';
            const minStock = minStockRaw === '' ? NaN : parseInt(minStockRaw, 10);
            const batch = (batchEl?.value || '').trim();
            const expiry = expiryEl?.value || '';
            const supplier = (supplierEl?.value || '').trim();
            const priceRaw = priceEl?.value ?? '';
            const validatedPrice = priceRaw === '' ? NaN : parseFloat(priceRaw);

            /* Validate required fields */
            const requiredFields = {
                medicineName: medicineNameEl, generic: genericEl, category: categoryEl,
                dosageForm: dosageFormEl, strength: strengthEl, unit: unitEl,
                quantity: qtyEl, minStock: minStockEl, batch: batchEl,
                expiry: expiryEl, price: priceEl
            };

            let hasError = false;
            Object.keys(requiredFields).forEach(key => {
                const el = requiredFields[key];
                const errorEl = document.getElementById(`add${key.charAt(0).toUpperCase() + key.slice(1)}Error`);
                if (!el?.value || el.value.trim() === '') {
                    errorEl?.classList.remove("hidden");
                    hasError = true;
                } else {
                    errorEl?.classList.add("hidden");
                }
            });

            if (hasError) return;

            // Price validation (must be > 0)
            if (isNaN(validatedPrice) || validatedPrice <= 0) {
                const priceErrorEl = document.getElementById('addPriceError');
                if (priceErrorEl) {
                    priceErrorEl.textContent = "Price must be greater than zero.";
                    priceErrorEl.classList.remove("hidden");
                }
                return;
            }

            /* Submit add-item request to backend */
            try {
                await apiFetch(API.ADD_ITEM_REQUEST, {
                    method: "POST",
                    body: JSON.stringify({
                        itemName: medicineName,
                        medicineName: medicineName,
                        genericName: generic,
                        brandName: brand,
                        category: category || 'general',
                        dosageForm: dosageForm,
                        strength: strength,
                        unit: unit || 'pcs',
                        description: description,
                        initialQuantity: isNaN(qty) ? 1 : qty,
                        minStock: isNaN(minStock) ? 10 : minStock,
                        batchNumber: batch || null,
                        expiryDate: expiry || null,
                        supplier: supplier,
                        unitPrice: isNaN(validatedPrice) ? 0 : validatedPrice,
                    }),
                });

                hide();
                showToast("Item Added \u2014 Pending Approval", 'success');
                await refreshAllData();
            } catch (error) {
                console.error("Add item request failed:", error);
                showToast('Add item request failed: ' + error.message, 'error');
            }
        };
    }

    addItemModal.classList.remove('hidden');
    addItemModal.style.display = 'flex';
}

/* ================= REFRESH ALL DATA FROM BACKEND ================= */

async function refreshAllData() {
    await fetchMyRequests();
    await fetchInventoryItems();
    applyFilters();

    /* Refresh activity log in background (non-blocking) */
    fetchActivityLogs().then(() => renderActivityLog());
}

/* ================= INIT ================= */

export async function initInventory() {
    const auth = window.IBMSAuth;
    if (auth && !auth.isSessionValid("staff")) {
        auth.clearAuthData();
        auth.redirectToLogin(true);
        return;
    }

    console.log("=== INIT INVENTORY STARTED ===");

    const inventoryGrid = document.getElementById("inventoryGrid");
    const searchInput = document.getElementById("searchInventory");
    const addItemBtn = document.getElementById("addItemBtn");
    const archivedBtn = document.getElementById("archivedBtn");
    const itemDetailsModal = document.getElementById("itemDetailsModal");
    const closeItemDetails = document.getElementById("closeItemDetails");
    const closeDetails = document.getElementById("closeDetails");
    const categoryFilterSelect = document.getElementById("categoryFilterSelect");

    if (!inventoryGrid) {
        console.error("CRITICAL: Inventory DOM not ready");
        return;
    }

    /* ================= FETCH INITIAL DATA FROM BACKEND ================= */
    await fetchInventoryItems();
    fetchActivityLogs().then(() => renderActivityLog());

    /* ================= EVENT LISTENERS - SEARCH & FILTER ================= */
    const debouncedApplyFilters = debounce(applyFilters, 300);
    searchInput?.addEventListener("input", debouncedApplyFilters);

    searchInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            applyFilters();
        }
    });

    categoryFilterSelect?.addEventListener("change", () => {
        currentCategoryFilter = categoryFilterSelect.value || ALL_CATEGORIES_LABEL;
        renderCategoryFilterSelect(inventoryItems);
        applyFilters();
    });

    /* ================= STATUS FILTERS ================= */
    document.querySelectorAll(".status-filter").forEach(btn => {
        btn.addEventListener("click", () => {
            currentStatusFilter = btn.dataset.status;
            applyFilters();
        });
    });

    /* ================= LOW STOCK TOGGLE ================= */
    const lowStockToggle = document.getElementById("lowStockToggle");
    lowStockToggle?.addEventListener("click", async () => {
        if (showArchivedItems) return;
        showLowStockOnly = !showLowStockOnly;

        const textSpan = lowStockToggle.querySelector("span");
        if (showLowStockOnly) {
            lowStockToggle.classList.remove("bg-red-50", "border-red-300", "text-red-600");
            lowStockToggle.classList.add("bg-red-600", "border-red-700", "text-white");
            if (textSpan) { textSpan.textContent = "Showing Low Stock Only"; textSpan.classList.add("text-white"); textSpan.classList.remove("text-red-600"); }
            if (archivedBtn) { archivedBtn.classList.add("opacity-50", "cursor-not-allowed"); archivedBtn.disabled = true; }
        } else {
            lowStockToggle.classList.remove("bg-red-600", "border-red-700");
            lowStockToggle.classList.add("bg-red-50", "border-red-300");
            if (textSpan) { textSpan.textContent = "Show Low Stock Only"; textSpan.classList.remove("text-white"); textSpan.classList.add("text-red-600"); }
            if (archivedBtn) { archivedBtn.classList.remove("opacity-50", "cursor-not-allowed"); archivedBtn.disabled = false; }
        }
        /* Re-fetch with low stock filter applied server-side */
        await fetchInventoryItems();
        applyFilters();
    });

    /* ================= ARCHIVED TOGGLE ================= */
    archivedBtn?.addEventListener("click", async () => {
        if (showLowStockOnly) return;
        showArchivedItems = !showArchivedItems;
        if (showArchivedItems) {
            archivedBtn.classList.remove("bg-white", "text-red-600", "border-red-600", "hover:bg-red-50");
            archivedBtn.classList.add("bg-green-600", "text-white", "border-green-600", "hover:bg-green-700");
            archivedBtn.textContent = "Active Items";
            const lowStockToggleLocal = document.getElementById("lowStockToggle");
            if (lowStockToggleLocal) { lowStockToggleLocal.classList.add("opacity-50", "cursor-not-allowed"); lowStockToggleLocal.disabled = true; }
        } else {
            archivedBtn.classList.remove("bg-green-600", "text-white", "border-green-600", "hover:bg-green-700");
            archivedBtn.classList.add("bg-white", "text-red-600", "border-red-600", "hover:bg-red-50");
            archivedBtn.textContent = "Archived Items";
            const lowStockToggleLocal = document.getElementById("lowStockToggle");
            if (lowStockToggleLocal) { lowStockToggleLocal.classList.remove("opacity-50", "cursor-not-allowed"); lowStockToggleLocal.disabled = false; }
        }
        /* Re-fetch with archive filter from backend */
        await fetchInventoryItems();
        applyFilters();
    });

    closeItemDetails?.addEventListener("click", () => itemDetailsModal.classList.add("hidden"));
    closeDetails?.addEventListener("click", () => itemDetailsModal.classList.add("hidden"));

    /* ================= BUTTON ACTIONS ================= */
    addItemBtn?.addEventListener("click", () => showAddItemModal());

    /* ================= INITIAL RENDER ================= */
    console.log("Rendering inventory...");
    updateFilterButtonStyles('#statusFiltersContainer', currentStatusFilter);
    applyFilters();
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
        const archiveBtn = e.target.closest(".archive-btn");
        const adjustBtn = e.target.closest(".adjust-btn");

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
        } else if (archiveBtn) {
            e.preventDefault();
            e.stopPropagation();
            const itemId = archiveBtn.getAttribute("data-item-id");
            const item = inventoryItems.find(i => String(i.id) === String(itemId));
            if (item) showArchiveConfirm(item);
        } else if (adjustBtn) {
            e.preventDefault();
            e.stopPropagation();
            const itemId = adjustBtn.getAttribute("data-item-id");
            const item = inventoryItems.find(i => String(i.id) === String(itemId));
            if (item) openQuantityAdjustmentModal(item);
        }
    }, false);

    window.inventoryGridListenerAttached = true;
}
