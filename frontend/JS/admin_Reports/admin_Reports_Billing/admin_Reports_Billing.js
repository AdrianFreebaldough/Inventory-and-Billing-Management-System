import { 
    BILLING_TIME_PERIOD_DATA, 
    BILLING_TABLE_DATA 
} from './data/admin_Reports_Billing_data.js';

const Charts = { collection: null, discount: null };
const State = { 
    currentPeriod: 'Last Week', 
    currentSort: '', 
    currentFilter: 'All Types',
    searchQuery: ''
};
const DOM = {};

export function initReports() {
    cacheDOM();
    if (typeof Chart === 'undefined') return;
    initializeView();
    setupListeners();
}

function cacheDOM() {
    DOM.content = document.getElementById('contentArea');
    DOM.stats = document.getElementById('statsCardsContainer');
    DOM.cashierTable = document.getElementById('cashier-table-body');
    DOM.transactionTable = document.getElementById('transaction-table-body');
    DOM.resultsCount = document.getElementById('results-count');
    
    // Controls
    DOM.sortSelect = document.getElementById('sort-select');
    DOM.filterSelect = document.getElementById('filter-select');
    DOM.searchInput = document.getElementById('search-input');
}

function initializeView() {
    initCharts();
    updateStats();
    populateCashierTable();
    populateTransactionTable();
}

function getCollectionTrendChartData(period) {
    const d = BILLING_TIME_PERIOD_DATA[period];
    const t = d.collectionTrend;
    return {
        labels: d.labels,
        datasets: [
            { label: 'Gross Billed', data: t.gross, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 2, fill: true, tension: 0.3 },
            { label: 'Net Collection', data: t.net, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, fill: true, tension: 0.3 }
        ]
    };
}

function getDiscountBreakdownChartData(period) {
    const d = BILLING_TIME_PERIOD_DATA[period];
    const db = d.discountBreakdown;
    return {
        labels: ['Statutory', 'Senior Citizen', 'PWD'],
        datasets: [{ data: [db.statutory, db.senior, db.pwd], backgroundColor: ['#065f46', '#34d399', '#f59e0b'], borderWidth: 0 }]
    };
}

function initCharts() {
    Object.keys(Charts).forEach(k => { if (Charts[k]) { Charts[k].destroy(); Charts[k] = null; } });

    const colCtx = document.getElementById('collectionTrendChart');
    if (colCtx) Charts.collection = new Chart(colCtx, { 
        type: 'line', 
        data: getCollectionTrendChartData(State.currentPeriod), 
        options: getCollectionOptions() 
    });

    const disCtx = document.getElementById('discountChart');
    if (disCtx) Charts.discount = new Chart(disCtx, { 
        type: 'pie', 
        data: getDiscountBreakdownChartData(State.currentPeriod), 
        options: getDiscountOptions() 
    });
}

function getCollectionOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
            legend: { position: 'top', labels: { usePointStyle: true, padding: 20, font: { size: 12 } } },
            tooltip: { callbacks: { label: (c) => (c.dataset.label || '') + ': ₱' + c.parsed.y.toLocaleString('en-PH') } }
        },
        scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => '₱' + v.toLocaleString('en-PH') }, grid: { color: '#f3f4f6' } },
            x: { grid: { display: false } }
        }
    };
}

function getDiscountOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { size: 12 } } },
            tooltip: { callbacks: { label: (c) => (c.label || '') + ': ₱' + c.parsed.toLocaleString('en-PH') } }
        }
    };
}

function updateStats(period = State.currentPeriod) {
    if (!DOM.stats) return;
    const s = BILLING_TIME_PERIOD_DATA[period].stats;
    const card = (t, v, tr, p, color) => `
        <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-md hover:shadow-lg transition-shadow duration-200">
            <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">${t}</p>
            <p class="text-3xl font-bold text-${color}-600">${formatCurrency(v)}</p>
            <p class="flex items-center gap-1 mt-1">
                <i class="fas fa-arrow-${tr} text-xs text-${tr === 'up' ? 'green' : 'red'}-500"></i>
                <span class="text-xs text-${tr === 'up' ? 'green' : 'red'}-500">${tr === 'up' ? '+' : ''}${p} from last period</span>
            </p>
        </div>`;
    DOM.stats.innerHTML = 
        card('Gross Billed', s.grossBilled, s.grossBilledTrend, s.grossBilledTrendPercent, 'gray') +
        card('Total Discounts', s.totalDiscounts, s.totalDiscountsTrend, s.totalDiscountsTrendPercent, 'amber') +
        card('Net Collection', s.netCollection, s.netCollectionTrend, s.netCollectionTrendPercent, 'emerald') +
        card('Average Transaction', s.avgTransaction, s.avgTransactionTrend, s.avgTransactionTrendPercent, 'blue');
}

function populateCashierTable() {
    if (!DOM.cashierTable) return;
    const data = BILLING_TABLE_DATA.cashierRevenue;
    const frag = document.createDocumentFragment();
    data.forEach(c => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-50 hover:bg-gray-50 transition-colors';
        row.innerHTML = `<td class="py-3 px-2 text-sm text-gray-700 font-medium">${c.staff}</td><td class="py-3 px-2 text-sm text-gray-700 text-right font-medium">${formatCurrency(c.netCollected)}</td><td class="py-3 px-2 text-sm text-gray-500 text-right">${c.transactions}</td>`;
        frag.appendChild(row);
    });
    DOM.cashierTable.innerHTML = '';
    DOM.cashierTable.appendChild(frag);
}

// ==================== SEARCH & FILTER LOGIC ====================

function getFilteredAndSearchedTransactions() {
    let data = [...BILLING_TABLE_DATA.transactions];
    
    // Apply search filter first
    if (State.searchQuery.trim()) {
        const query = State.searchQuery.toLowerCase();
        data = data.filter(tx => 
            tx.orNumber.toLowerCase().includes(query) ||
            tx.patientId.toLowerCase().includes(query) ||
            tx.staff.toLowerCase().includes(query) ||
            tx.dateTime.toLowerCase().includes(query)
        );
    }
    
    // Apply type filter
    if (State.currentFilter !== 'All Types') {
        switch(State.currentFilter) {
            case 'Paid': data = data.filter(t => t.status === 'Paid'); break;
            case 'Voided': data = data.filter(t => t.status === 'Voided'); break;
            case 'Senior Discount': data = data.filter(t => t.discount.type === 'Senior'); break;
            case 'PWD Discount': data = data.filter(t => t.discount.type === 'PWD'); break;
        }
    }
    
    // Apply sort
    if (State.currentSort) {
        switch(State.currentSort) {
            case 'Highest Amount': data.sort((a, b) => b.netCollected - a.netCollected); break;
            case 'Lowest Amount': data.sort((a, b) => a.netCollected - b.netCollected); break;
            case 'A-Z': data.sort((a, b) => a.orNumber.localeCompare(b.orNumber)); break;
            case 'Latest': data.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)); break;
        }
    }
    
    return data;
}

function populateTransactionTable() {
    if (!DOM.transactionTable) return;
    
    const data = getFilteredAndSearchedTransactions();
    
    // Update results count
    if (DOM.resultsCount) {
        const total = BILLING_TABLE_DATA.transactions.length;
        const showing = data.length;
        DOM.resultsCount.textContent = showing === total 
            ? `Showing all ${total} transactions` 
            : `Showing ${showing} of ${total} transactions`;
    }
    
    if (data.length === 0) {
        DOM.transactionTable.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-500">
                    <i class="fas fa-search mb-2 text-gray-300 text-2xl"></i>
                    <p>No transactions found matching your criteria</p>
                </td>
            </tr>`;
        return;
    }

    const frag = document.createDocumentFragment();
    data.forEach(tx => {
        const statusClass = tx.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
        const discountText = tx.discount.amount > 0 ? `₱${tx.discount.amount.toLocaleString()} (${tx.discount.type})` : '₱0 (None)';
        
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-100 hover:bg-gray-50 transition-colors';
        row.innerHTML = `
            <td class="py-3">${tx.dateTime}</td>
            <td class="py-3 font-medium">${tx.orNumber}</td>
            <td class="py-3">${tx.patientId}</td>
            <td class="py-3 text-right font-medium">₱${tx.gross.toLocaleString()}</td>
            <td class="py-3 text-right text-sm">${discountText}</td>
            <td class="py-3 text-right font-semibold">₱${tx.netCollected.toLocaleString()}</td>
            <td class="py-3 text-center">
                <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusClass}">${tx.status}</span>
            </td>
            <td class="py-3 text-sm">${tx.staff}</td>
        `;
        frag.appendChild(row);
    });
    
    DOM.transactionTable.innerHTML = '';
    DOM.transactionTable.appendChild(frag);
}

function setupListeners() {
    // Search input with debounce
    if (DOM.searchInput) {
        let debounceTimer;
        DOM.searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                State.searchQuery = e.target.value;
                populateTransactionTable();
            }, 300); // 300ms debounce
        });
    }

    // Sort dropdown
    if (DOM.sortSelect) {
        DOM.sortSelect.addEventListener('change', (e) => {
            State.currentSort = e.target.value === 'Sort By' ? '' : e.target.value;
            populateTransactionTable();
        });
    }

    // Filter dropdown
    if (DOM.filterSelect) {
        DOM.filterSelect.addEventListener('change', (e) => {
            State.currentFilter = e.target.value;
            populateTransactionTable();
        });
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}