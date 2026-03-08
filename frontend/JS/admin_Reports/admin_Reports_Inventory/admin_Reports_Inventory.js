import { 
    INVENTORY_TIME_PERIOD_DATA 
} from './data/admin_Reports_Inventory_data.js';

const Charts = { status: null, topProducts: null, usage: null };
const State = { currentPeriod: 'Last Week' };
const DOM = {};

export function initReports() {
    const auth = window.IBMSAuth;
    if (auth && !auth.isSessionValid("owner")) {
        auth.clearAuthData();
        auth.redirectToLogin(true);
        return;
    }

    cacheDOM();
    if (typeof Chart === 'undefined') return;
    initializeView();
}

function cacheDOM() {
    DOM.content = document.getElementById('contentArea');
    DOM.stats = document.getElementById('statsCardsContainer');
}

function initializeView() {
    initCharts();
    updateStats();
}

function getInventoryStatusChartData(period) {
    const d = INVENTORY_TIME_PERIOD_DATA[period];
    const c = d.categories;
    return {
        labels: ['Medications', 'Medical Supplies', 'Diagnostic Kits', 'Vaccines'],
        datasets: [
            { label: 'In Stock', data: [c.medications.inStock, c.medicalSupplies.inStock, c.diagnosticKits.inStock, c.vaccines.inStock], backgroundColor: '#1e3a8a', borderRadius: 4 },
            { label: 'Low Stock', data: [c.medications.lowStock, c.medicalSupplies.lowStock, c.diagnosticKits.lowStock, c.vaccines.lowStock], backgroundColor: '#f59e0b', borderRadius: 4 },
            { label: 'Out of Stock', data: [c.medications.outOfStock, c.medicalSupplies.outOfStock, c.diagnosticKits.outOfStock, c.vaccines.outOfStock], backgroundColor: '#ef4444', borderRadius: 4 }
        ]
    };
}

function getTopProductsChartData(period) {
    const d = INVENTORY_TIME_PERIOD_DATA[period];
    return {
        labels: Object.keys(d.topProducts),
        datasets: [{ label: 'Units Dispensed', data: Object.values(d.topProducts), backgroundColor: '#1e3a8a', borderRadius: 4 }]
    };
}

function getUsageTrendChartData(period) {
    const d = INVENTORY_TIME_PERIOD_DATA[period];
    const t = d.usageTrend;
    return {
        labels: d.labels,
        datasets: [
            { label: 'Medications', data: t.medications, borderColor: '#1e3a8a', backgroundColor: 'rgba(30, 58, 138, 0.1)', borderWidth: 2, tension: 0.4, fill: true },
            { label: 'Vaccines', data: t.vaccines, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, tension: 0.4, fill: true },
            { label: 'Medical Supplies', data: t.medicalSupplies, borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)', borderWidth: 2, tension: 0.4, fill: true },
            { label: 'Diagnostic Kits', data: t.diagnosticKits, borderColor: '#93c5fd', backgroundColor: 'rgba(147, 197, 253, 0.1)', borderWidth: 2, tension: 0.4, fill: true }
        ]
    };
}

function initCharts() {
    Object.keys(Charts).forEach(k => { if (Charts[k]) { Charts[k].destroy(); Charts[k] = null; } });

    const statusCtx = document.getElementById('inventoryStatusChart');
    if (statusCtx) Charts.status = new Chart(statusCtx, { 
        type: 'bar', 
        data: getInventoryStatusChartData(State.currentPeriod), 
        options: getStatusOptions() 
    });

    const topCtx = document.getElementById('topProductsChart');
    if (topCtx) Charts.topProducts = new Chart(topCtx, { 
        type: 'bar', 
        data: getTopProductsChartData(State.currentPeriod), 
        options: getTopProductsOptions() 
    });

    const usageCtx = document.getElementById('usageTrendChart');
    if (usageCtx) Charts.usage = new Chart(usageCtx, { 
        type: 'line', 
        data: getUsageTrendChartData(State.currentPeriod), 
        options: getUsageOptions() 
    });
}

function getStatusOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { size: 11 } } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'Number of Items' }, grid: { color: '#f3f4f6' } } }
    };
}

function getTopProductsOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'Units Dispensed' }, grid: { color: '#f3f4f6' } } }
    };
}

function getUsageOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { size: 10 } } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'Usage Count' }, grid: { color: '#f3f4f6' } } }
    };
}

function updateStats() {
    if (!DOM.stats) return;
    const s = INVENTORY_TIME_PERIOD_DATA[State.currentPeriod].stats;
    const card = (t, v, tr, p, color) => `
        <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-md hover:shadow-lg transition-shadow duration-200">
            <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">${t}</p>
            <p class="text-3xl font-bold text-${color}-800">${v.toLocaleString()}</p>
            <p class="flex items-center gap-1 mt-1">
                <i class="fas fa-arrow-${tr} text-xs text-${tr === 'up' ? 'green' : 'red'}-500"></i>
                <span class="text-xs text-${tr === 'up' ? 'green' : 'red'}-500">${tr === 'up' ? '+' : ''}${p} from last period</span>
            </p>
        </div>`;
    DOM.stats.innerHTML = 
        card('Total Items', s.totalItems, s.totalItemsTrend, s.totalItemsTrendPercent) +
        card('In Stock', s.inStockItems, s.inStockTrend, s.inStockTrendPercent, 'green') +
        card('Low Stock', s.lowStockItems, s.lowStockTrend, s.lowStockTrendPercent, 'amber') +
        card('Out of Stock', s.outOfStockItems, s.outOfStockTrend, s.outOfStockTrendPercent, 'red');
}