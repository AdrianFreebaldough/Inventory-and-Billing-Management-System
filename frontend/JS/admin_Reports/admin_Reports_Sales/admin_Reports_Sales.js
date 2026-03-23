import { 
    TIME_PERIOD_DATA, 
    SERVICES_CHART_DATA, 
    TOP_SERVICES_CHART_DATA, 
    TABLE_DATA 
} from './data/admin_Reports_Sales_data.js';

const Charts = { revenue: null, services: null, topServices: null };
const State = { 
    isLoading: false, 
    pendingLoad: null, 
    currentTab: 'sales', 
    currentFilter: 'All Types', 
    currentSort: '',
    currentPeriod: 'Last Week',
    abortController: null
};
const DOM = {};
const ReportCache = { sales: null, inventory: null, billing: null };

// Track current module for cleanup
let currentModule = null;
let exportListenerAttached = false;

export function initReports() {
    const auth = window.IBMSAuth;
    if (auth && !auth.isSessionValid("owner")) {
        auth.clearAuthData();
        auth.redirectToLogin(true);
        return;
    }

    if (!ReportCache.sales) {
        const contentArea = document.getElementById('contentArea');
        if (contentArea) ReportCache.sales = contentArea.innerHTML;
    }
    
    cacheDOM();
    if (typeof Chart === 'undefined') return;
    initializeView();
    setupNavigation();
    setupPreload();
}

function cacheDOM() {
    DOM.content = document.getElementById('contentArea');
    DOM.nav = document.querySelector('.flex.bg-white.rounded-full');
    DOM.periodSelect = document.getElementById('period-select');
    DOM.exportBtn = document.getElementById('export-btn');
    DOM.stats = document.getElementById('statsCardsContainer');
    DOM.tableBody = document.getElementById('table-body');
    DOM.sortSelect = document.getElementById('sort-select');
    DOM.filterSelect = document.getElementById('filter-select');
}

function resetScroll() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('.overflow-y-auto, .max-h-96').forEach(el => el.scrollTop = 0);
}

function initializeView() {
    initCharts();
    updateStats();
    populateTable();
    setupEventListeners();
    resetScroll();
}

function setupNavigation() {
    if (!DOM.nav) return;
    DOM.nav.addEventListener('click', handleNavClick);
    updateActiveTab('sales');
}

function setupPreload() {
    if (!DOM.nav) return;
    
    const preloadMap = {
        'tab-inventory': () => import('../../admin_Reports/admin_Reports_Inventory/admin_Reports_Inventory.js'),
        'tab-billing': () => import('../admin_Reports_Billing/admin_Reports_Billing.js')
    };
    
    DOM.nav.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('button');
        if (!btn || btn.id === 'tab-sales') return;
        
        const preloader = preloadMap[btn.id];
        if (preloader) {
            preloader().catch(() => {});
        }
    });
}

function handleNavClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const tabMap = { 
        'tab-sales': 'sales', 
        'tab-inventory': 'inventory', 
        'tab-billing': 'billing' 
    };
    const tab = tabMap[btn.id];
    
    if (!tab || tab === State.currentTab) return;
    e.preventDefault();
    
    if (State.abortController) {
        State.abortController.abort();
    }
    
    // Cleanup current module before switching
    cleanupCurrentModule();
    cleanupCurrentTab();
    
    State.currentTab = tab;
    updateActiveTab(tab);
    resetScroll();
    
    const loaders = { 
        sales: loadSales, 
        inventory: loadInventory, 
        billing: loadBilling 
    };
    
    debouncedLoad(loaders[tab]);
}

// NEW: Cleanup external module before switching
function cleanupCurrentModule() {
    if (currentModule && currentModule.cleanup) {
        try {
            currentModule.cleanup();
        } catch (err) {
            console.warn('Module cleanup error:', err);
        }
    }
    currentModule = null;
}

function cleanupCurrentTab() {
    Object.keys(Charts).forEach(k => {
        if (Charts[k]) {
            Charts[k].destroy();
            Charts[k] = null;
        }
    });
}

function updateActiveTab(active) {
    document.querySelectorAll('[role="tab"]').forEach(btn => {
        const isActive = btn.id === `tab-${active}`;
        btn.classList.toggle('bg-blue-700', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('text-gray-600', !isActive);
        btn.setAttribute('aria-selected', isActive);
    });
}

function debouncedLoad(fn) {
    if (State.isLoading) {
        if (State.pendingLoad) clearTimeout(State.pendingLoad);
        State.pendingLoad = setTimeout(() => debouncedLoad(fn), 100);
        return;
    }
    State.isLoading = true;
    fn().finally(() => { 
        State.isLoading = false; 
        State.pendingLoad = null; 
    });
}

const exportBtn = document.getElementById('export-btn');
const toggleBtn = document.getElementById('toggle-btn');
const btnLabel = document.getElementById('btn-label');
const btnIcon = document.getElementById('btn-icon');

let isPdf = true;

toggleBtn.addEventListener('click', () => {
    isPdf = !isPdf;
    
    if (isPdf) {
        // Switch to PDF - Blue
        exportBtn.className = 'bg-blue-600 text-white pl-6 pr-4 py-2 rounded-l-xl text-sm font-medium flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
        toggleBtn.className = 'bg-blue-600 text-white px-3 py-2 rounded-r-xl text-sm font-medium flex items-center hover:bg-blue-700 transition-all shadow-md border-l border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
        toggleBtn.title = 'Switch to CSV';
        
        exportBtn.innerHTML = `
            <img src="../../assets/download_icon.png" class="w-4 h-4" aria-hidden="true">
            <span>PDF</span>
        `;
    } else {
        // Switch to Excel - Green
        exportBtn.className = 'bg-green-700 text-white pl-6 pr-4 py-2 rounded-l-xl text-sm font-medium flex items-center gap-2 hover:bg-green-700 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2';
        toggleBtn.className = 'bg-green-700 text-white px-3 py-2 rounded-r-xl text-sm font-medium flex items-center hover:bg-green-700 transition-all shadow-md border-l border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2';
        toggleBtn.title = 'Switch to PDF';
        
        exportBtn.innerHTML = `
            <img src="../../assets/download_icon.png" class="w-4 h-4" aria-hidden="true">
            <span>CSV</span>
        `;
    }
});

// Main button click exports current format
exportBtn.addEventListener('click', () => {
    const format = isPdf ? 'pdf' : 'csv';
    if (currentModule && typeof currentModule.exportReport === 'function') {
        currentModule.exportReport(format);
        return;
    }
    console.log('Export requested for tab without export handler:', State.currentTab, format);
});

async function loadSales() {
    if (!DOM.content) return;
    
    if (ReportCache.sales) {
        DOM.content.innerHTML = ReportCache.sales;
    }
    
    cacheSalesDOM();
    await new Promise(r => setTimeout(r, 10));
    
    initCharts();
    updateStats();
    populateTable();
    setupEventListeners();
}

function cacheSalesDOM() {
    DOM.stats = document.getElementById('statsCardsContainer');
    DOM.tableBody = document.getElementById('table-body');
    DOM.sortSelect = document.getElementById('sort-select');
    DOM.filterSelect = document.getElementById('filter-select');
}

async function loadInventory() {
    if (!DOM.content) return;
    
    State.abortController = new AbortController();
    const signal = State.abortController.signal;
    
    try {
        showLoading();
        
        if (signal.aborted) return;
        
        if (!ReportCache.inventory) {
            const res = await fetch('../../HTML/admin_Reports/admin_Reports_Inventory/admin_Reports_Inventory.html', { signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch inventory HTML`);
            const html = await res.text();
            const temp = document.createElement('div');
            temp.innerHTML = html;
            ReportCache.inventory = temp.querySelector('#contentArea')?.innerHTML || temp.innerHTML;
        }
        
        if (signal.aborted) return;
        DOM.content.innerHTML = ReportCache.inventory;
        
        let module;
        try {
            module = await import('../../admin_Reports/admin_Reports_Inventory/admin_Reports_Inventory.js');
        } catch (importErr) {
            throw new Error(`Failed to load inventory module: ${importErr.message}`);
        }
        
        if (signal.aborted) return;
        
        // Store module reference for cleanup
        currentModule = module;
        
        if (module.initReports) {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Inventory initialization timeout')), 10000)
            );
            await Promise.race([module.initReports(), timeoutPromise]);
        } else {
            console.warn('Inventory module loaded but initReports not found');
        }
        
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Inventory load error:', err);
        showError('Inventory Reports', err);
        currentModule = null;
    } finally {
        if (State.abortController?.signal === signal) {
            State.abortController = null;
        }
    }
}

async function loadBilling() {
    if (!DOM.content) return;
    
    State.abortController = new AbortController();
    const signal = State.abortController.signal;
    
    try {
        showLoading();
        
        if (signal.aborted) return;
        
        if (!ReportCache.billing) {
            const res = await fetch('../../HTML/admin_Reports/admin_Reports_Billing/admin_Reports_Billing.html', { signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch billing HTML`);
            const html = await res.text();
            const temp = document.createElement('div');
            temp.innerHTML = html;
            ReportCache.billing = temp.querySelector('#contentArea')?.innerHTML || temp.innerHTML;
        }
        
        if (signal.aborted) return;
        DOM.content.innerHTML = ReportCache.billing;
        
        let module;
        try {
            module = await import('../admin_Reports_Billing/admin_Reports_Billing.js');
        } catch (importErr) {
            throw new Error(`Failed to load billing module: ${importErr.message}`);
        }
        
        if (signal.aborted) return;
        
        // Store module reference for cleanup
        currentModule = module;
        
        if (module.initReports) {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Billing initialization timeout')), 10000)
            );
            await Promise.race([module.initReports(), timeoutPromise]);
        } else {
            console.warn('Billing module loaded but initReports not found');
        }
        
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Billing load error:', err);
        showError('Billing Reports', err);
        currentModule = null;
    } finally {
        if (State.abortController?.signal === signal) {
            State.abortController = null;
        }
    }
}

function showLoading() {
    if (!DOM.content) return;
    DOM.content.innerHTML = `
        <div class="flex items-center justify-center p-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span class="ml-2 text-gray-600">Loading...</span>
        </div>`;
}

function showError(name, err) {
    if (!DOM.content) return;
    DOM.content.innerHTML = `
        <div class="text-red-500 p-4 font-medium text-center">
            <i class="fas fa-exclamation-circle mb-2"></i>
            <p>Failed to load ${name}</p>
            <p class="text-sm text-gray-500 mt-2">${err.message}</p>
            <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Retry
            </button>
        </div>`;
}

function getRevenueChartData(period = 'Last Week') {
    const d = TIME_PERIOD_DATA[period];
    return {
        labels: d.labels,
        datasets: [
            { label: 'Revenue (₱)', data: d.revenue, backgroundColor: '#1e3a8a', borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8, yAxisID: 'y' },
            { label: 'Transactions', data: d.transactions, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8, yAxisID: 'y1' }
        ]
    };
}

function getStatsData(period = 'Last Week') {
    return TIME_PERIOD_DATA[period].stats;
}

function initCharts() {
    Object.keys(Charts).forEach(k => { 
        if (Charts[k]) { Charts[k].destroy(); Charts[k] = null; } 
    });

    const rev = document.getElementById('revenueChart');
    if (rev) Charts.revenue = new Chart(rev, { 
        type: 'bar', 
        data: getRevenueChartData(State.currentPeriod), 
        options: getRevenueChartOptions() 
    });

    const svc = document.getElementById('servicesChart');
    if (svc) Charts.services = new Chart(svc, { 
        type: 'pie', 
        data: SERVICES_CHART_DATA, 
        options: getServicesChartOptions() 
    });

    const top = document.getElementById('topServicesChart');
    if (top) Charts.topServices = new Chart(top, { 
        type: 'doughnut', 
        data: TOP_SERVICES_CHART_DATA, 
        options: getTopServicesChartOptions() 
    });
}

function getRevenueChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            title: {
                display: true,
                text: 'Revenue Overview',
                font: { size: 16, weight: 'bold' },
                padding: { top: 10, bottom: 20 }
            },
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { size: 12 } } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.dataset.label === 'Revenue (₱)' ? '₱' : ''}${c.parsed.y.toLocaleString()}` } }
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 12 } } },
            y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Revenue (₱)', font: { size: 12 } }, ticks: { font: { size: 11 }, callback: (v) => '₱' + v.toLocaleString() }, grid: { color: '#f3f4f6' } },
            y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'Transactions', font: { size: 12 } }, ticks: { font: { size: 11 } }, grid: { display: false } }
        }
    };
}

function getServicesChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: 'Services Distribution',
                font: { size: 16, weight: 'bold' },
                padding: { top: 10, bottom: 20 }
            },
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { size: 12 } } },
            tooltip: { callbacks: { label: (c) => `${c.label}: ₱${c.parsed.toLocaleString()}` } }
        }
    };
}

function getTopServicesChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
            title: {
                display: true,
                text: 'Top Performing Services',
                font: { size: 16, weight: 'bold' },
                padding: { top: 10, bottom: 20 }
            },
            legend: { position: 'right', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } }
        }
    };
}

function updateStats(period = State.currentPeriod) {
    if (!DOM.stats) return;
    const s = getStatsData(period);
    const card = (t, v, tr, p, pre = '') => `
        <div class="bg-white rounded-2xl shadow-md p-4 hover:shadow-lg transition-shadow duration-200">
            <p class="text-gray-500 text-sm mb-1">${t}</p>
            <h3 class="text-3xl font-bold text-gray-800">${pre}${v.toLocaleString()}</h3>
            <p class="flex items-center gap-1 mt-1">
                <i class="fas fa-arrow-${tr} text-xs text-${tr === 'up' ? 'green' : 'red'}-500"></i>
                <span class="text-xs text-${tr === 'up' ? 'green' : 'red'}-500">${tr === 'up' ? '+' : ''}${p} from last period</span>
            </p>
        </div>`;
    DOM.stats.innerHTML = card('TOTAL REVENUE', s.totalRevenue, s.revenueTrend, s.revenueTrendPercent, '₱') +
                          card('TOTAL TRANSACTION', s.totalTransactions, s.transactionsTrend, s.transactionsTrendPercent) +
                          card('AVERAGE TRANSACTION', s.averageTransaction, s.averageTrend, s.averageTrendPercent, '₱');
}

function getFilteredAndSortedData() {
    let data = [...TABLE_DATA];
    
    if (State.currentFilter !== 'All Types') {
        data = data.filter(item => item.category === State.currentFilter);
    }
    
    if (State.currentSort && State.currentSort !== '') {
        const sortFunctions = {
            'Highest Revenue': (a, b) => b.totalRevenue - a.totalRevenue,
            'Highest Quantity': (a, b) => b.timesAvailed - a.timesAvailed,
            'A-Z': (a, b) => a.item.localeCompare(b.item)
        };
        
        const sortFn = sortFunctions[State.currentSort];
        if (sortFn) data.sort(sortFn);
    }
    
    return data;
}

function populateTable() {
    if (!DOM.tableBody) {
        console.error('Table body not found');
        return;
    }
    
    const displayData = getFilteredAndSortedData();
    DOM.tableBody.innerHTML = '';
    
    if (displayData.length === 0) {
        DOM.tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="py-8 text-center text-gray-500">
                    No data found for the selected filter
                </td>
            </tr>`;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    displayData.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150';
        row.innerHTML = `
            <td class="py-3 px-2">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.category === 'Services' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                    ${item.category}
                </span>
            </td>
            <td class="py-3 px-2 text-sm text-gray-600">${item.subCategory}</td>
            <td class="py-3 px-2 font-medium text-gray-900">${item.item}</td>
            <td class="py-3 px-2 text-center text-sm text-gray-600">${item.timesAvailed.toLocaleString()}</td>
            <td class="py-3 px-2 text-right font-semibold text-gray-900">₱${item.totalRevenue.toLocaleString()}</td>
        `;
        fragment.appendChild(row);
    });
    
    DOM.tableBody.appendChild(fragment);
}

function setupEventListeners() {
    if (DOM.periodSelect) {
        DOM.periodSelect.addEventListener('change', (e) => {
            State.currentPeriod = e.target.value;
            if (State.currentTab === 'sales') updateChartsAndStats();
        });
    }

    if (DOM.exportBtn && !exportListenerAttached) {
        DOM.exportBtn.addEventListener('click', () => {
            alert('Export functionality coming soon! This feature is under development.');
        });
        exportListenerAttached = true;
    }

    if (DOM.sortSelect) {
        const newSortSelect = DOM.sortSelect.cloneNode(true);
        DOM.sortSelect.parentNode.replaceChild(newSortSelect, DOM.sortSelect);
        DOM.sortSelect = newSortSelect;
        
        DOM.sortSelect.addEventListener('change', (e) => {
            const value = e.target.value;
            State.currentSort = (value === 'Sort By' || value === '') ? '' : value;
            populateTable();
        });
    }

    if (DOM.filterSelect) {
        const newFilterSelect = DOM.filterSelect.cloneNode(true);
        DOM.filterSelect.parentNode.replaceChild(newFilterSelect, DOM.filterSelect);
        DOM.filterSelect = newFilterSelect;
        
        DOM.filterSelect.addEventListener('change', (e) => {
            State.currentFilter = e.target.value || 'All Types';
            populateTable();
        });
    }
}

function updateChartsAndStats() {
    if (Charts.revenue) {
        Charts.revenue.data = getRevenueChartData(State.currentPeriod);
        Charts.revenue.update();
    }
    updateStats(State.currentPeriod);
}

