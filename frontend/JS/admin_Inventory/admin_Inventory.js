import { inventoryItems, restockRequests, activityLog } from "./data/admin_Inventory_data.js";

let filteredItems = [...inventoryItems];
let filteredRestockRequests = [...restockRequests];
let currentStatusFilter = "all";
let currentCategoryFilter = "all";
let currentRestockStatusFilter = "all";
let currentRestockCategoryFilter = "all";
let showArchivedItems = false;
let showLowStockOnly = false;

// Status filter configurations with distinct active and hover colors
const FILTER_CONFIG = {
    'all': {
        activeBg: 'bg-blue-600', activeText: 'text-white', activeBorder: 'border-blue-600',
        hoverBg: 'hover:bg-blue-50', hoverBorder: 'hover:border-blue-500', hoverText: 'hover:text-blue-700'
    },
    'in-stock': {
        activeBg: 'bg-green-600', activeText: 'text-white', activeBorder: 'border-green-600',
        hoverBg: 'hover:bg-green-50', hoverBorder: 'hover:border-green-500', hoverText: 'hover:text-green-700'
    },
    'pending': {
        activeBg: 'bg-yellow-500', activeText: 'text-white', activeBorder: 'border-yellow-500',
        hoverBg: 'hover:bg-yellow-50', hoverBorder: 'hover:border-yellow-500', hoverText: 'hover:text-yellow-700'
    },
    'low-stock': {
        activeBg: 'bg-orange-500', activeText: 'text-white', activeBorder: 'border-orange-500',
        hoverBg: 'hover:bg-orange-50', hoverBorder: 'hover:border-orange-500', hoverText: 'hover:text-orange-700'
    },
    'out-of-stock': {
        activeBg: 'bg-red-700', activeText: 'text-white', activeBorder: 'border-red-700',
        hoverBg: 'hover:bg-red-50', hoverBorder: 'hover:border-red-600', hoverText: 'hover:text-red-700'
    },
    'approved': {
        activeBg: 'bg-green-600', activeText: 'text-white', activeBorder: 'border-green-600',
        hoverBg: 'hover:bg-green-50', hoverBorder: 'hover:border-green-500', hoverText: 'hover:text-green-700'
    },
    'denied': {
        activeBg: 'bg-red-600', activeText: 'text-white', activeBorder: 'border-red-600',
        hoverBg: 'hover:bg-red-50', hoverBorder: 'hover:border-red-500', hoverText: 'hover:text-red-700'
    }
};

// Status colors for cards and badges
const STATUS_COLORS = {
    'in-stock': { 
        bg: 'bg-green-100', 
        text: 'text-green-800', 
        border: 'border-green-500',
        quantity: 'text-green-700'
    },
    'pending': { 
        bg: 'bg-yellow-100', 
        text: 'text-yellow-800', 
        border: 'border-yellow-500',
        quantity: 'text-yellow-700'
    },
    'low-stock': { 
        bg: 'bg-orange-100', 
        text: 'text-orange-800', 
        border: 'border-orange-500',
        quantity: 'text-orange-700'
    },
    'out-of-stock': { 
        bg: 'bg-red-100', 
        text: 'text-red-800', 
        border: 'border-red-500',
        quantity: 'text-red-700'
    },
    'archived': { 
        bg: 'bg-gray-400', 
        text: 'text-white', 
        border: 'border-gray-500',
        quantity: 'text-gray-700'
    },
    'approved': { 
        bg: 'bg-blue-100', 
        text: 'text-blue-800', 
        border: 'border-blue-500',
        quantity: 'text-blue-700'
    },
    'denied': { 
        bg: 'bg-red-100', 
        text: 'text-red-800', 
        border: 'border-red-500',
        quantity: 'text-red-700'
    }
};

const STATUS_DISPLAY = {
    'in-stock': 'In Stock',
    'pending': 'Pending',
    'low-stock': 'Low Stock',
    'out-of-stock': 'Out of Stock',
    'archived': 'Archived',
    'approved': 'Approved',
    'denied': 'Denied'
};

const Z_INDEX = {
    MODAL_BASE: 10000,
    MODAL_OVERLAY: 9999,
    TOAST: 20000
};

function normalizeStatus(status) {
    if (!status) return 'in-stock';
    return String(status).toLowerCase().replace(/\s+/g, '-');
}

function getFilterConfig(status) {
    const normalized = normalizeStatus(status);
    return FILTER_CONFIG[normalized] || FILTER_CONFIG['all'];
}

function getStatusColors(status) {
    const normalized = normalizeStatus(status);
    return STATUS_COLORS[normalized] || STATUS_COLORS['in-stock'];
}

function getStatusDisplayText(status) {
    const normalized = normalizeStatus(status);
    return STATUS_DISPLAY[normalized] || 'In Stock';
}

function formatCategory(category) {
    if (!category) return '';
    return category.split(/[-_\s]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/* ================= TOAST SYSTEM (Reused from staff) ================= */
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
    
    // Blue theme for admin (matching admin color scheme)
    const baseClass = 'bg-white text-blue-700 border-4 border-blue-600 rounded-md px-4 py-3 shadow-lg max-w-xs transform transition-all duration-300 translate-y-2 opacity-0';
    toast.className = baseClass;
    toast.innerHTML = `<div class="text-sm font-medium">${message}</div>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function logActivity(action, itemName, quantity, status) {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    activityLog.unshift({
        id: Date.now(),
        action,
        item: itemName,
        quantity,
        status,
        user: "Admin",
        timestamp: `${date} ${time}`
    });
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

function getElement(modal, selector) {
    return modal?.querySelector(selector) || document.getElementById(selector);
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
        <div class="bg-white rounded-lg shadow-lg p-6 max-w-[95vw] max-h-[90vh] overflow-y-auto relative" style="width: ${width}; min-width: ${width};">
            <button id="${closeBtnId}" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
            ${content}
        </div>
    `;
    document.body.appendChild(wrapper);
    
    return wrapper;
}

function updateFilterButtonStyles(containerSelector, activeStatus) {
    const buttons = document.querySelectorAll(`${containerSelector} .status-filter, ${containerSelector} .status-filter-restock`);
    
    buttons.forEach(btn => {
        const status = btn.dataset.status;
        const config = getFilterConfig(status);
        const isActive = status === activeStatus;
        
        let classes = 'status-filter px-4 py-1 rounded-full border text-sm shadow-sm transition-all cursor-pointer ';
        
        if (isActive) {
            classes += `${config.activeBg} ${config.activeText} ${config.activeBorder}`;
        } else {
            classes += `bg-white text-gray-700 border-gray-300 ${config.hoverBg} ${config.hoverBorder} ${config.hoverText}`;
        }
        
        btn.className = classes;
    });
}

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
        
        const matchesStatus = currentStatusFilter === "all" || item.status === currentStatusFilter;
        const matchesCategory = currentCategoryFilter === "all" || item.category === currentCategoryFilter;
        
        return matchesSearch && matchesStatus && matchesCategory;
    });

    filteredItems.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return 0;
    });

    updateFilterButtonStyles('#statusFiltersContainer', currentStatusFilter);
    renderInventory();
}

function applyRestockFilters() {
    const search = document.getElementById("searchRestock")?.value?.toLowerCase() || "";
    
    filteredRestockRequests = restockRequests.filter(req => {
        const matchesSearch = (
            (req.itemName || "").toLowerCase().includes(search) ||
            (req.id || "").toLowerCase().includes(search) ||
            (req.type || "").toLowerCase().includes(search)
        );
        
        const matchesStatus = currentRestockStatusFilter === "all" || req.status === currentRestockStatusFilter;
        const matchesCategory = currentRestockCategoryFilter === "all" || req.category === currentRestockCategoryFilter;
        
        return matchesSearch && matchesStatus && matchesCategory;
    });

    updateFilterButtonStyles('#restockStatusFiltersContainer', currentRestockStatusFilter);
    renderRestockRequests();
}

function renderInventory() {
    const grid = document.getElementById("inventoryGrid");
    if (!grid) return;
    grid.innerHTML = "";

    if (filteredItems.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500"><p>No items found matching your criteria.</p></div>`;
        return;
    }

    filteredItems.forEach(item => {
        const colors = getStatusColors(item.status);
        const statusText = getStatusDisplayText(item.status);
        const isPending = item.status === 'pending';
        const archivedPill = item.archived ? `<span class="ml-2 inline-block px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">Archived</span>` : '';

        const card = document.createElement("div");
        card.className = "border border-gray-200 rounded-lg p-4 bg-white shadow-md hover:shadow-lg transition-all duration-200 h-full flex flex-col transform hover:-translate-y-1";
        card.setAttribute("data-card-id", item.id);
        
        let buttonsHtml = '';
        if (isPending && !item.archived) {
            buttonsHtml = `
                <button class="reject-btn flex-1 bg-red-600 text-white py-2 rounded text-xs font-medium hover:bg-red-700 transition-colors" data-item-id="${item.id}">
                    Reject
                </button>
                <button class="approve-btn flex-1 bg-blue-600 text-white py-2 rounded text-xs font-medium hover:bg-blue-700 transition-colors" data-item-id="${item.id}">
                    Approve
                </button>
            `;
        } else if (item.archived) {
            buttonsHtml = `
                <button class="restore-btn flex-1 bg-emerald-600 text-white py-2 rounded text-xs font-medium hover:bg-emerald-700 transition-colors" data-item-id="${item.id}">
                    Restore
                </button>
                <button class="view-details-btn flex-1 border border-gray-300 py-2 rounded text-xs font-medium hover:bg-gray-100 transition-colors">
                    View Details
                </button>
            `;
        } else {
            buttonsHtml = `
                <button class="view-details-btn w-full border border-gray-300 py-2 rounded text-xs font-medium hover:bg-gray-100 transition-colors">
                    View Details
                </button>
            `;
        }

        const quantityColorClass = colors.quantity;

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
                <div class="flex justify-between">
                    <span class="text-gray-600">Current Quantity</span>
                    <span class="font-semibold ${quantityColorClass}">${item.currentQuantity} ${item.unit}</span>
                </div>
                <div class="text-gray-500">Min: ${item.minStock} ${item.unit}</div>
                <div class="text-gray-500 flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <span>Expires: ${item.expiryDate}</span>
                </div>
                <div class="text-gray-500">Batch: ${item.batchNumber}</div>
                <div class="flex justify-between items-center pt-2 border-t border-gray-100 mt-2">
                    <span class="text-gray-600">Price</span>
                    <span class="font-bold text-blue-700 text-sm">₱${item.price.toFixed(2)}</span>
                </div>
            </div>

            <div class="flex gap-2 mt-auto">
                ${buttonsHtml}
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderRestockRequests() {
    const grid = document.getElementById("restockGrid");
    
    if (!grid) return;

    if (filteredRestockRequests.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500"><p>No restock requests found.</p></div>`;
        return;
    }

    grid.innerHTML = "";

    filteredRestockRequests.forEach(req => {
        const colors = getStatusColors(req.status);
        
        const card = document.createElement("div");
        card.className = "border border-gray-200 rounded-lg p-4 bg-white shadow-md hover:shadow-lg transition-all duration-200 h-full flex flex-col transform hover:-translate-y-1";
        card.setAttribute("data-request-id", req.id);
        
        const stockColorClass = req.currentQuantity === 0 ? 'text-red-700' : 
                               req.currentQuantity <= req.minStock ? 'text-orange-700' : 'text-green-700';
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3 gap-2">
                <div class="flex-1">
                    <h3 class="font-semibold text-gray-800 text-sm">${req.itemName}</h3>
                    <p class="text-xs text-gray-500">${req.type}</p>
                    <p class="text-xs text-blue-600 font-mono mt-1">${req.id}</p>
                </div>
                <div>
                    <span class="px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text} whitespace-nowrap border ${colors.border}">${getStatusDisplayText(req.status)}</span>
                </div>
            </div>

            <div class="space-y-2 mb-4 text-xs flex-1">
                <div class="flex justify-between">
                    <span class="text-gray-600">Current Stock</span>
                    <span class="font-semibold ${stockColorClass}">${req.currentQuantity} ${req.unit}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Requested</span>
                    <span class="font-semibold text-blue-700">${req.requestQuantity} ${req.unit}</span>
                </div>
                <div class="text-gray-500 flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    <span>By: ${req.requestedBy}</span>
                </div>
                <div class="text-gray-500 flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span>${req.requestDate}</span>
                </div>
            </div>

            <div class="flex gap-2 mt-auto">
                <button class="review-request-btn w-full bg-blue-600 text-white py-2 rounded text-xs font-medium hover:bg-blue-700 transition-colors">
                    Review Request
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

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
    document.getElementById("detailsUnit").textContent = item.unit || '';
    document.getElementById("detailsPrice").textContent = `₱${(item.price || 0).toFixed(2)}`;
    document.getElementById("detailsExpiry").textContent = item.expiryDate || '';
    document.getElementById("detailsDescription").textContent = item.description || 'No description available.';
    document.getElementById("detailsCategory").textContent = formatCategory(item.category);
    document.getElementById("detailsCriticalText").textContent = `${item.minStock} ${item.unit || ''}`;

    const statusBadge = document.getElementById("detailsStatusBadge");
    const statusTextContainer = document.getElementById("detailsStatusText");
    
    if (statusBadge) {
        statusBadge.textContent = getStatusDisplayText(item.status);
        statusBadge.className = `inline-block px-3 py-1 rounded-full text-sm font-medium ${colors.bg} ${colors.text} border ${colors.border}`;
    }
    
    if (statusTextContainer) {
        statusTextContainer.innerHTML = `<span class="inline-block px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}">${getStatusDisplayText(item.status)}</span>`;
    }

    const expiryTextEl = document.getElementById('detailsExpiresIn');
    const expiryBadge = document.getElementById('detailsExpiryBadge');
    const parseDate = (str) => {
        if (!str) return null;
        const parts = str.split(/[\/\-\.]/);
        if (parts.length !== 3) return null;
        if (parts[0].length === 4) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        } else {
            return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
        }
    };
    
    const expDate = parseDate(item.expiryDateISO || item.expiryDate);
    if (expiryTextEl && expiryBadge && expDate) {
        const now = new Date();
        const diff = Math.ceil((expDate - now) / (1000*60*60*24));
        expiryTextEl.textContent = `Expires in ${diff} days`;
        
        if (diff < 0) {
            expiryBadge.textContent = 'Expired';
            expiryBadge.className = 'inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200';
        } else if (diff <= 30) {
            expiryBadge.textContent = 'Expiring Soon';
            expiryBadge.className = 'inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200';
        } else {
            expiryBadge.textContent = 'Safe';
            expiryBadge.className = 'inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200';
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
            const newBtn = btnMove.cloneNode(true);
            btnMove.parentNode.replaceChild(newBtn, btnMove);
            newBtn.textContent = 'Restore from Archive';
            newBtn.className = 'w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors';
            newBtn.onclick = (e) => { e?.stopPropagation?.(); showRestoreConfirm(item); };
        } else {
            const newBtn = btnMove.cloneNode(true);
            btnMove.parentNode.replaceChild(newBtn, btnMove);
            newBtn.textContent = 'Move to Archive';
            newBtn.className = 'w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors';
            newBtn.onclick = (e) => { e?.stopPropagation?.(); showArchiveConfirm(item); };
        }
    }

    modal.classList.remove('hidden');
}

/* ================= REVIEW RESTOCK MODAL (Reuses Request Restock structure) ================= */
function showReviewRestockModal(request) {
    const content = `
        <h3 class="text-lg font-semibold mb-1">Review Request Restock</h3>
        <p class="text-sm text-gray-600 mb-4">${request.id}</p>
        <div class="space-y-3 text-sm">
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-600">Item Name</span>
                <span class="font-semibold">${request.itemName}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-600">Category</span>
                <span class="font-semibold">${formatCategory(request.category)}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-600">Current Stock</span>
                <span class="font-semibold ${request.currentQuantity === 0 ? 'text-red-700' : request.currentQuantity <= request.minStock ? 'text-orange-700' : 'text-green-700'}">${request.currentQuantity} ${request.unit}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-600">Requested Quantity</span>
                <span class="font-semibold text-blue-700">${request.requestQuantity} ${request.unit}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-600">Requested By</span>
                <span class="font-semibold">${request.requestedBy}</span>
            </div>
            <div class="py-2">
                <label class="block text-xs text-gray-700 mb-1">Approved Quantity</label>
                <input id="approvedQuantity" type="number" min="0" max="${request.requestQuantity}" value="${request.requestQuantity}" class="w-full border border-gray-300 rounded px-3 py-2" />
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
        </div>
    `;

    const reviewModal = createModal({
        id: 'reviewRestockModal',
        content: content,
        width: '500px'
    });

    reviewModal.currentRequest = request;

    const closeBtn = getElement(reviewModal, '#closeReviewRestockModal');
    const cancel = getElement(reviewModal, '#reviewCancelBtn');
    const deny = getElement(reviewModal, '#reviewDenyBtn');
    const approve = getElement(reviewModal, '#reviewApproveBtn');
    const hide = () => { reviewModal.classList.add('hidden'); reviewModal.style.display = ''; setTimeout(() => reviewModal.remove(), 200); };

    if (closeBtn) closeBtn.onclick = hide;
    if (cancel) cancel.onclick = hide;

    if (deny) {
        deny.onclick = () => {
            const adminNotes = getElement(reviewModal, '#adminNotesInput')?.value || '';
            
            showDenyConfirmModal(request, adminNotes, () => {
                // Remove request from restock list when denied
                const requestIndex = restockRequests.findIndex(r => r.id === request.id);
                if (requestIndex > -1) {
                    restockRequests.splice(requestIndex, 1);
                }
                
                logActivity("Denied Restock", request.itemName, request.requestQuantity, "Denied");
                showToast('Request Denied and Removed', 'error');
                hide();
                applyRestockFilters();
            });
        };
    }

    if (approve) {
    approve.onclick = () => {
        const approvedQty = parseInt(getElement(reviewModal, '#approvedQuantity')?.value || request.requestQuantity);
        const adminNotes = getElement(reviewModal, '#adminNotesInput')?.value || '';
        
        showApproveConfirmModal(request, approvedQty, adminNotes, () => {
            // Find existing item by itemId (e.g., "INV001")
            let item = inventoryItems.find(i => i.id === request.itemId);
            
            if (item) {
                // Update existing item
                item.currentQuantity += approvedQty;
                item.status = item.currentQuantity > item.minStock ? 'in-stock' : 
                             item.currentQuantity === 0 ? 'out-of-stock' : 'low-stock';
                item.lastRestocked = new Date().toISOString().split('T')[0];
            } else {
                // Create new inventory item
                item = {
                    id: `ITEM-${Date.now()}`,
                    name: request.itemName,
                    type: request.type,
                    category: request.category,
                    currentQuantity: approvedQty,
                    minStock: request.minStock,
                    unit: request.unit,
                    supplier: request.supplier || request.requestedBy,
                    status: approvedQty > request.minStock ? 'in-stock' : 'low-stock',
                    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US'),
                    expiryDateISO: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    batchNumber: `BATCH-${Date.now()}`,
                    archived: false,
                    price: 0,
                    description: ''
                };
                inventoryItems.unshift(item);
            }
            
            // Remove request from restock list
            const requestIndex = restockRequests.findIndex(r => r.id === request.id);
            if (requestIndex > -1) {
                restockRequests.splice(requestIndex, 1);
            }
            
            logActivity("Approved Restock", request.itemName, approvedQty, "Approved");
            showToast('Request Approved & Stock Updated', 'success');
            hide();
            applyRestockFilters();
            applyFilters();
        });
    };
}
}

/* ================= APPROVE CONFIRM MODAL ================= */
function showApproveConfirmModal(request, approvedQty, adminNotes, onConfirm) {
    const content = `
        <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
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
        </div>
    `;
    
    const approveModal = createModal({
        id: 'approveConfirmModal',
        content: content
    });

    if (approveModal && approveModal.parentElement !== document.body) {
        document.body.appendChild(approveModal);
    }

    approveModal.classList.add('hidden');
    approveModal.style.display = 'none';
    setTimeout(() => { approveModal.classList.remove('hidden'); approveModal.style.display = 'flex'; }, 10);

    const nameEl = getElement(approveModal, '#approveItemName');
    if (nameEl) nameEl.textContent = `${request.itemName} (${approvedQty} ${request.unit})`;

    const hide = () => { approveModal.classList.add('hidden'); approveModal.style.display = ''; };

    getElement(approveModal, '#closeApproveConfirmModal')
        ?.addEventListener('click', hide);

    getElement(approveModal, '#approveCancelBtn')
        ?.addEventListener('click', hide);

    getElement(approveModal, '#approveConfirmBtn')
        ?.addEventListener('click', () => {
            hide();
            onConfirm();
        });
}

/* ================= DENY CONFIRM MODAL ================= */
function showDenyConfirmModal(request, adminNotes, onConfirm) {
    const content = `
        <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900">Are you sure you want to Deny this request?</h3>
                <p id="denyItemName" class="text-sm font-semibold text-gray-800 mt-2"></p>
                <p class="text-sm text-gray-600 mt-1">Note: This will remove the request from the list</p>
            </div>
        </div>
        <div class="mt-6 grid grid-cols-2 gap-4">
            <button id="denyCancelBtn" class="w-full border border-gray-300 py-2.5 rounded-lg bg-white text-sm font-semibold hover:bg-gray-50 transition-colors text-gray-700">Cancel</button>
            <button id="denyConfirmBtn" class="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">Confirm</button>
        </div>
    `;
    
    const denyModal = createModal({
        id: 'denyConfirmModal',
        content: content
    });

    if (denyModal && denyModal.parentElement !== document.body) {
        document.body.appendChild(denyModal);
    }

    denyModal.classList.add('hidden');
    denyModal.style.display = 'none';
    setTimeout(() => { denyModal.classList.remove('hidden'); denyModal.style.display = 'flex'; }, 10);

    const nameEl = getElement(denyModal, '#denyItemName');
    if (nameEl) nameEl.textContent = `${request.itemName} (${request.requestQuantity} ${request.unit})`;

    const hide = () => { denyModal.classList.add('hidden'); denyModal.style.display = ''; };

    getElement(denyModal, '#closeDenyConfirmModal')
        ?.addEventListener('click', hide);

    getElement(denyModal, '#denyCancelBtn')
        ?.addEventListener('click', hide);

    getElement(denyModal, '#denyConfirmBtn')
        ?.addEventListener('click', () => {
            hide();
            onConfirm();
        });
}

/* ================= ARCHIVE CONFIRM MODAL (Reused from staff pattern) ================= */
function showArchiveConfirm(item) {
    const detailsModal = document.getElementById('itemDetailsModal');
    
    const content = `
        <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
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
        showToast('Archived Successfully', 'success');
        hide();
    });
}

/* ================= ADD ITEM MODAL (Reused from staff pattern) ================= */
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
                <textarea id="addDescription" rows="3" class="w-full border border-gray-300 rounded px-3 py-2" placeholder="Optional description..."></textarea>
            </div>
        </div>
        <div class="mt-5 flex gap-5 justify-between">
            <button id="addCancelBtn" class="flex-1 border border-gray-300 py-2 px-4 rounded-lg bg-white">Cancel</button>
            <button id="addSaveBtn" class="flex-1 bg-emerald-700 text-white py-2 px-4 rounded-lg">Save</button>
        </div>
    `;

    const addItemModal = createModal({
        id: 'addItemModal',
        content: content,
        width: '575px'
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
            const unitEl = getElement(addItemModal, '#addUnit');
            const minStockEl = getElement(addItemModal, '#addMinStock');
            const priceEl = getElement(addItemModal, '#addPrice');
            const expiryEl = getElement(addItemModal, '#addExpiry');
            const batchEl = getElement(addItemModal, '#addBatch');
            const descEl = getElement(addItemModal, '#addDescription');

            const brand = (brandEl?.value || '').trim();
            const generic = (genericEl?.value || '').trim();
            const category = (categoryEl?.value || '').trim();
            const qtyRaw = qtyEl?.value ?? '';
            const qty = qtyRaw === '' ? NaN : parseInt(qtyRaw, 10);
            const unit = (unitEl?.value || '').trim();
            const minStockRaw = minStockEl?.value ?? '';
            const minStock = minStockRaw === '' ? NaN : parseInt(minStockRaw, 10);
            const priceRaw = priceEl?.value ?? '';
            const price = priceRaw === '' ? NaN : parseFloat(priceRaw);
            const expiry = expiryEl?.value || '';
            const batch = (batchEl?.value || '').trim();
            const description = (descEl?.value || '').trim();

            // Only validate required fields (description is optional)
            const requiredFields = {
                brand: brandEl,
                generic: genericEl,
                category: categoryEl,
                quantity: qtyEl,
                unit: unitEl,
                minStock: minStockEl,
                price: priceEl,
                expiry: expiryEl,
                batch: batchEl
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

            const newItem = {
                id: `ITEM-${Date.now()}`,
                name: generic || brand,
                type: brand || generic,
                category: category || 'general',
                currentQuantity: isNaN(qty) ? 0 : qty,
                minStock: isNaN(minStock) ? 0 : minStock,
                unit: unit || 'pcs',
                supplier: 'Admin Added',
                status: 'in-stock',
                expiryDate: expiry ? new Date(expiry).toLocaleDateString('en-US') : '',
                expiryDateISO: expiry,
                batchNumber: batch || '',
                archived: false,
                price: isNaN(price) ? 0 : price,
                description: description || ''
            };

            inventoryItems.unshift(newItem);
            logActivity("Added", newItem.name, newItem.currentQuantity, "In Stock");
            hide();
            applyFilters();
            showToast("Item Added Successfully", 'success');
        };
    }
    addItemModal.classList.remove('hidden');
    addItemModal.style.display = 'flex';
}

function showRestoreConfirm(item) {
    const detailsModal = document.getElementById('itemDetailsModal');
    
    const content = `
        <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
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
            showToast('Restored Successfully', 'success');
            hide();
        };
    }
}

function closeAllModals() {
    const modals = [
        'itemDetailsModal',
        'reviewRestockModal',
        'addItemModal',
        'archiveConfirmModal',
        'restoreConfirmModal',
        'approveConfirmModal',
        'denyConfirmModal'
    ];
    
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
    });
}

export function initAdminInventory() {
    console.log("=== INIT ADMIN INVENTORY STARTED ===");

    const tabInventory = document.getElementById("tabInventory");
    const tabRestock = document.getElementById("tabRestock");
    const inventorySection = document.getElementById("inventorySection");
    const restockSection = document.getElementById("restockSection");

    function switchTab(tab) {
        if (tab === 'inventory') {
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

    tabInventory?.addEventListener("click", () => switchTab('inventory'));
    tabRestock?.addEventListener("click", () => switchTab('restock'));

    // Inventory status filters
    document.querySelectorAll(".status-filter").forEach(btn => {
        btn.addEventListener("click", () => {
            currentStatusFilter = btn.dataset.status;
            applyFilters();
        });
    });

    // Restock status filters
    document.querySelectorAll(".status-filter-restock").forEach(btn => {
        btn.addEventListener("click", () => {
            currentRestockStatusFilter = btn.dataset.status;
            applyRestockFilters();
        });
    });

    // Inventory category dropdown
    const filterBtn = document.getElementById("filterBtn");
    const categoryDropdown = document.getElementById("categoryDropdown");
    
    filterBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        categoryDropdown.classList.toggle("hidden");
    });

    // Restock category dropdown
    const filterBtnRestock = document.getElementById("filterBtnRestock");
    const categoryDropdownRestock = document.getElementById("categoryDropdownRestock");
    
    filterBtnRestock?.addEventListener("click", (e) => {
        e.stopPropagation();
        categoryDropdownRestock.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
        if (!categoryDropdown?.contains(e.target) && e.target !== filterBtn) {
            categoryDropdown?.classList.add("hidden");
        }
        if (!categoryDropdownRestock?.contains(e.target) && e.target !== filterBtnRestock) {
            categoryDropdownRestock?.classList.add("hidden");
        }
    });

    // Inventory category items
    document.querySelectorAll(".category-dropdown-item").forEach(btn => {
        btn.addEventListener("click", () => {
            currentCategoryFilter = btn.dataset.category;
            categoryDropdown.classList.add("hidden");
            
            const categoryText = btn.textContent;
            filterBtn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                </svg>
                ${categoryText}
            `;
            
            applyFilters();
        });
    });

    // Restock category items
    document.querySelectorAll(".category-dropdown-item-restock").forEach(btn => {
        btn.addEventListener("click", () => {
            currentRestockCategoryFilter = btn.dataset.category;
            categoryDropdownRestock.classList.add("hidden");
            
            const categoryText = btn.textContent;
            filterBtnRestock.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                </svg>
                ${categoryText}
            `;
            
            applyRestockFilters();
        });
    });

    // Search inputs
    document.getElementById("searchInventory")?.addEventListener("input", debounce(applyFilters, 300));
    document.getElementById("searchRestock")?.addEventListener("input", debounce(applyRestockFilters, 300));

    // Archived toggle - reused from staff inventory pattern
    const archivedBtn = document.getElementById("archivedBtn");
    archivedBtn?.addEventListener("click", () => {
        if (showLowStockOnly) return;
        showArchivedItems = !showArchivedItems;
        
        if (showArchivedItems) {
            archivedBtn.classList.remove("bg-white", "text-red-600");
            archivedBtn.classList.add("bg-red-600", "text-white");
        } else {
            archivedBtn.classList.remove("bg-red-600", "text-white");
            archivedBtn.classList.add("bg-white", "text-red-600");
        }
        applyFilters();
    });

    // Add item modal - reused from staff inventory pattern
    document.getElementById("addItemBtn")?.addEventListener("click", showAddItemModal);
    document.getElementById("closeAddItemModal")?.addEventListener("click", closeAllModals);
    document.getElementById("addCancelBtn")?.addEventListener("click", closeAllModals);

    // Item details modal
    document.getElementById("closeItemDetails")?.addEventListener("click", closeAllModals);
    document.getElementById("closeDetails")?.addEventListener("click", closeAllModals);

    document.getElementById("moveToArchive")?.addEventListener("click", () => {
        const modal = document.getElementById("itemDetailsModal");
        const item = modal?.currentItem;
        if (item) {
            closeAllModals();
            if (item.archived) {
                showRestoreConfirm(item);
            } else {
                showArchiveConfirm(item);
            }
        }
    });

    // Archive confirm modal - reused from staff pattern
    document.getElementById("archiveCancelBtn")?.addEventListener("click", closeAllModals);
    document.getElementById("archiveConfirmBtn")?.addEventListener("click", () => {
        const modal = document.getElementById("archiveConfirmModal");
        const item = modal.currentItem;
        if (item) {
            const itemInArray = inventoryItems.find(i => i.id === item.id);
            if (itemInArray) {
                itemInArray.archived = true;
                logActivity("Archived", itemInArray.name, itemInArray.currentQuantity, "Archived");
                showToast("Item Archived Successfully");
                applyFilters();
            }
        }
        closeAllModals();
    });

    // Review restock modal - reuses Request Restock structure
    document.getElementById("closeReviewModal")?.addEventListener("click", closeAllModals);
    document.getElementById("reviewCancelBtn")?.addEventListener("click", closeAllModals);

    // Grid event delegation - Restock
    document.getElementById("restockGrid")?.addEventListener("click", (e) => {
        const reviewBtn = e.target.closest(".review-request-btn");
        if (reviewBtn) {
            const card = reviewBtn.closest("[data-request-id]");
            const request = restockRequests.find(r => r.id === card?.dataset.requestId);
            if (request) showReviewRestockModal(request);
        }
    });

    // Grid event delegation - Inventory
    document.getElementById("inventoryGrid")?.addEventListener("click", (e) => {
        const viewBtn = e.target.closest(".view-details-btn");
        const approveBtn = e.target.closest(".approve-btn");
        const rejectBtn = e.target.closest(".reject-btn");
        const restoreBtn = e.target.closest(".restore-btn");
        
        if (viewBtn) {
            const card = viewBtn.closest("[data-card-id]");
            const item = inventoryItems.find(i => i.id === card?.dataset.cardId);
            if (item) showItemDetails(item);
        } else if (approveBtn) {
            const itemId = approveBtn.dataset.itemId;
            const item = inventoryItems.find(i => i.id === itemId);
            if (item) {
                item.status = "in-stock";
                logActivity("Approved", item.name, item.currentQuantity, "In Stock");
                showToast("Item Approved");
                applyFilters();
            }
        } else if (rejectBtn) {
            const itemId = rejectBtn.dataset.itemId;
            const item = inventoryItems.find(i => i.id === itemId);
            if (item) {
                item.archived = true;
                logActivity("Rejected", item.name, item.currentQuantity, "Rejected");
                showToast("Item Rejected & Archived");
                applyFilters();
            }
        } else if (restoreBtn) {
            const itemId = restoreBtn.dataset.itemId;
            const item = inventoryItems.find(i => i.id === itemId);
            if (item) {
                showRestoreConfirm(item);
            }
        }
    });

    // Close modals on backdrop click
    document.querySelectorAll('[id$="Modal"]').forEach(modal => {
        modal?.addEventListener("click", (e) => {
            if (e.target === modal) {
                closeAllModals();
            }
        });
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeAllModals();
        }
    });

    // Initialize filter buttons
    updateFilterButtonStyles('#statusFiltersContainer', currentStatusFilter);
    updateFilterButtonStyles('#restockStatusFiltersContainer', currentRestockStatusFilter);
    applyFilters();
    applyRestockFilters();
    console.log("Admin Inventory initialized successfully");
}