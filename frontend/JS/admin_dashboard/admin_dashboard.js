import { apiFetch } from "../utils/apiClient.js";
import { NotificationWidget } from "../components/notificationWidget.js";

/* ════════════════════════════════════════════════════════════════
   API endpoints
   ════════════════════════════════════════════════════════════════ */
const OWNER_DASHBOARD_API = {
  summary:        "/api/owner/dashboard/summary",
  revenueTrend:   "/api/owner/dashboard/revenue-trend",
  pendingRequests:"/api/owner/dashboard/pending-requests",
  lowStock:       "/api/owner/dashboard/low-stock",
  activity:       "/api/owner/dashboard/activity",
  stockMovements: "/api/owner/dashboard/stock-movements",
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let refreshTimer = null;

/* ════════════════════════════════════════════════════════════════
   Owner display info (from localStorage / JWT)
   ════════════════════════════════════════════════════════════════ */
function getOwnerDisplayInfo() {
  const name  = localStorage.getItem("userName")  || "Admin";
  const email = localStorage.getItem("userEmail") || "";
  return {
    fullName:  name,
    username:  email || name.toUpperCase(),
    initial:   name.charAt(0).toUpperCase(),
  };
}

/* ════════════════════════════════════════════════════════════════
   Parallel data fetch – Promise.allSettled so one failing
   endpoint never blocks the rest of the dashboard.
   ════════════════════════════════════════════════════════════════ */
async function OWNER_fetchDashboardData() {
  const [summary, revenueTrend, pendingRequests, lowStock, activity, stockMovements] =
    await Promise.allSettled([
      apiFetch(OWNER_DASHBOARD_API.summary),
      apiFetch(OWNER_DASHBOARD_API.revenueTrend),
      apiFetch(OWNER_DASHBOARD_API.pendingRequests),
      apiFetch(OWNER_DASHBOARD_API.lowStock),
      apiFetch(OWNER_DASHBOARD_API.activity),
      apiFetch(OWNER_DASHBOARD_API.stockMovements),
    ]);

  return {
    summary:        summary.status        === "fulfilled" ? summary.value        : null,
    revenueTrend:   revenueTrend.status   === "fulfilled" ? revenueTrend.value   : null,
    pendingRequests:pendingRequests.status === "fulfilled" ? pendingRequests.value: null,
    lowStock:       lowStock.status       === "fulfilled" ? lowStock.value       : null,
    activity:       activity.status       === "fulfilled" ? activity.value       : null,
    stockMovements: stockMovements.status === "fulfilled" ? stockMovements.value : null,
  };
}

/* ════════════════════════════════════════════════════════════════
   Data mappers  (backend response → UI-friendly shape)
   ════════════════════════════════════════════════════════════════ */
function mapDashboardSummary(raw) {
  if (!raw) return { revenueTotal: 0, revenueToday: 0, activeStaff: 0, pendingRequests: 0, lowStockItems: 0 };
  return {
    revenueTotal:    raw.totalRevenue             ?? 0,
    revenueToday:    raw.todaysRevenue            ?? 0,
    activeStaff:     raw.activeStaffCount         ?? 0,
    pendingRequests: raw.pendingInventoryRequests  ?? 0,
    lowStockItems:   raw.lowStockItems            ?? 0,
  };
}

function mapRevenueTrend(raw) {
  if (!raw) return { labels: [], data: [] };
  return {
    labels: raw.labels || [],
    data:   raw.data   || [],
  };
}

function mapPendingRequests(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id:          r._id || "",
    itemName:    r.itemName         || "Unknown",
    requestType: r.requestType      || "",
    requestedBy: r.requestedBy      || "Unknown",
    quantity:    r.requestedQuantity ?? 0,
    status:      r.status           || "pending",
    createdAt:   r.createdAt        || "",
  }));
}

function mapLowStock(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => ({
    name:         p.name          || "Unknown",
    category:     p.category      || "",
    currentStock: p.quantity       ?? 0,
    minStock:     p.minStock       ?? 10,
    status:       p.status === "out" ? "critical"
                  : p.quantity <= (p.minStock ?? 10) * 0.25 ? "critical"
                  : "warning",
    unit:         p.unit          || "pcs",
  }));
}

function mapActivity(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    id:        a._id       || "",
    actor:     a.actor      || "System",
    action:    a.action     || "",
    type:      a.type       || "general",
    createdAt: a.createdAt  || "",
  }));
}

function mapStockMovements(raw) {
  if (!raw) return { totalAdditions: 0, totalDeductions: 0, movementCount: 0, recentMovements: [] };
  return {
    totalAdditions:  raw.totalAdditions  ?? 0,
    totalDeductions: raw.totalDeductions ?? 0,
    movementCount:   raw.movementCount   ?? 0,
    recentMovements: (raw.recentMovements || []).map((m) => ({
      productName:    m.productName    || "Unknown",
      movementType:   m.movementType   || "",
      quantityChange: m.quantityChange ?? 0,
      performedBy:    m.performedBy    || "System",
      source:         m.source         || "",
      createdAt:      m.createdAt      || "",
    })),
  };
}

/* ════════════════════════════════════════════════════════════════
   Time-ago helper
   ════════════════════════════════════════════════════════════════ */
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ════════════════════════════════════════════════════════════════
   Movement-type badge helpers
   ════════════════════════════════════════════════════════════════ */
function movementBadge(type) {
  const map = {
    SALE:           { label: "Sale",     bg: "bg-rose-50",    text: "text-rose-600" },
    RESTOCK:        { label: "Restock",  bg: "bg-emerald-50", text: "text-emerald-600" },
    ADJUST:         { label: "Adjust",   bg: "bg-amber-50",   text: "text-amber-600" },
    VOID_REVERSAL:  { label: "Void Rev", bg: "bg-blue-50",    text: "text-blue-600" },
  };
  const m = map[type] || { label: type, bg: "bg-slate-50", text: "text-slate-600" };
  return `<span class="text-xs font-medium px-2 py-0.5 rounded-full ${m.bg} ${m.text}">${m.label}</span>`;
}

/* ════════════════════════════════════════════════════════════════════
   MAIN  – DOMContentLoaded
   ════════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const auth = window.IBMSAuth;
  if (auth) {
    auth.protectPage({ requiredRole: "owner" });
    if (!auth.isSessionValid("owner")) return;
  }

  /* ================= ELEMENTS ================= */
  const mainContent       = document.getElementById("mainContent");
  const navDashboard      = document.getElementById("navDashboard");
  const navInventory      = document.getElementById("navInventory");
  const navUserManagement = document.getElementById("navUserManagement");
  const navReports        = document.getElementById("navReports");
  const navExpenses       = document.getElementById("navExpenses");
  const navStockLogs      = document.getElementById("navStockLogs");

  const staffNameEl       = document.getElementById("staffName");
  const staffUsernameEl   = document.getElementById("staffUsername");
  const staffAvatarEl     = document.getElementById("staffAvatar");
  const profileBtn        = document.getElementById("profileBtn");
  const logoutBtn         = document.getElementById("logoutBtn");

  /* ================= OWNER INFO ================= */
  const ownerInfo = getOwnerDisplayInfo();
  if (staffNameEl)     staffNameEl.textContent     = ownerInfo.fullName;
  if (staffUsernameEl) staffUsernameEl.textContent = ownerInfo.username;
  if (staffAvatarEl)   staffAvatarEl.textContent   = ownerInfo.initial;

  /* ================= NAV ACTIVE ================= */
  function setActive(activeEl) {
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.remove("bg-blue-600", "text-white");
      link.classList.add("text-gray-700");
    });
    activeEl.classList.add("bg-blue-600", "text-white");
    activeEl.classList.remove("text-gray-700");
  }

  /* ================= LOADING SKELETON ================= */
  function renderLoadingSkeleton() {
    mainContent.innerHTML = `
      <div class="p-8 max-w-7xl mx-auto animate-pulse">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          ${Array(4).fill(`
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <div class="h-4 bg-slate-200 rounded w-24 mb-3"></div>
              <div class="h-8 bg-slate-200 rounded w-32 mb-2"></div>
              <div class="h-3 bg-slate-100 rounded w-28"></div>
            </div>
          `).join("")}
        </div>
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8">
          <div class="h-5 bg-slate-200 rounded w-40 mb-4"></div>
          <div class="h-64 bg-slate-100 rounded"></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div class="h-5 bg-slate-200 rounded w-48 mb-4"></div>
            <div class="space-y-3">${Array(3).fill('<div class="h-16 bg-slate-100 rounded"></div>').join("")}</div>
          </div>
          <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div class="h-5 bg-slate-200 rounded w-36 mb-4"></div>
            <div class="space-y-4">${Array(3).fill('<div class="h-14 bg-slate-100 rounded"></div>').join("")}</div>
          </div>
        </div>
      </div>
    `;
  }

  /* ================= DASHBOARD ================= */
  async function loadDashboard() {
    setActive(navDashboard);
    clearInterval(refreshTimer);
    renderLoadingSkeleton();

    try {
      const raw = await OWNER_fetchDashboardData();
      renderDashboardContent(raw);
    } catch (err) {
      console.error("Dashboard load failed:", err);
      mainContent.innerHTML = `
        <div class="p-8 max-w-7xl mx-auto">
          <div class="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p class="text-red-600 font-semibold mb-2">Failed to load dashboard</p>
            <p class="text-red-500 text-sm mb-4">${err.message || "Unknown error"}</p>
            <button id="retryDashboard" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Retry</button>
          </div>
        </div>
      `;
      document.getElementById("retryDashboard")?.addEventListener("click", () => loadDashboard());
    }

    /* Auto-refresh */
    refreshTimer = setInterval(async () => {
      try {
        const raw = await OWNER_fetchDashboardData();
        /* Only re-render if still on dashboard */
        if (navDashboard.classList.contains("bg-blue-600")) {
          renderDashboardContent(raw);
        }
      } catch { /* silent background refresh failure */ }
    }, REFRESH_INTERVAL_MS);
  }

  /* ================= RENDER DASHBOARD CONTENT ================= */
  function renderDashboardContent(raw) {
    const summary        = mapDashboardSummary(raw.summary);
    const revenueTrend   = mapRevenueTrend(raw.revenueTrend);
    const requests       = mapPendingRequests(raw.pendingRequests);
    const lowStockItems  = mapLowStock(raw.lowStock);
    const activities     = mapActivity(raw.activity);
    const stockMovements = mapStockMovements(raw.stockMovements);

    mainContent.innerHTML = `
      <div class="p-8 max-w-7xl mx-auto animate-fade-in">
        
        <!-- Metrics Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          ${renderMetricsCards(summary)}
        </div>

        <!-- Revenue Chart + Stock Movement Summary -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div class="lg:col-span-2">
            ${renderRevenueChart()}
          </div>
          ${renderStockMovementSummary(stockMovements)}
        </div>

        <!-- Pending Requests + Low Stock -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          ${renderPendingRequests(requests)}
          ${renderLowStockAlerts(lowStockItems)}
        </div>

        <!-- Recent Stock Movements -->
        ${renderRecentMovements(stockMovements.recentMovements)}

        <!-- Recent Activity -->
        ${renderRecentActivity(activities)}
      </div>
    `;

    /* Initialize chart after DOM is painted */
    initializeRevenueChart(revenueTrend);
    animateProgressBars();
  }

  /* ================= RENDER METRICS CARDS ================= */
  function renderMetricsCards(s) {
    return `
      <!-- Total Revenue -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.1s">
        <div class="text-slate-500 text-sm font-medium mb-1">Total Revenue</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">₱${s.revenueTotal.toLocaleString()}</div>
        <div class="flex items-center text-emerald-500 text-sm font-medium">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          All time
        </div>
      </div>

      <!-- Today's Revenue -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.15s">
        <div class="text-slate-500 text-sm font-medium mb-1">Today's Revenue</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">₱${s.revenueToday.toLocaleString()}</div>
        <div class="flex items-center text-blue-500 text-sm font-medium">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          Today
        </div>
      </div>

      <!-- Active Staff -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.2s">
        <div class="text-slate-500 text-sm font-medium mb-1">Active Staff</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">${s.activeStaff}</div>
        <div class="flex items-center text-slate-400 text-sm">
          <span class="w-2 h-2 bg-emerald-400 rounded-full mr-2 animate-pulse"></span>
          Currently on duty
        </div>
      </div>

      <!-- Low Stock Items -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.3s">
        <div class="text-slate-500 text-sm font-medium mb-1">Low Stock Items</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">${s.lowStockItems}</div>
        <div class="flex items-center text-rose-500 text-sm font-medium">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          Requires attention
        </div>
      </div>

      <!-- Pending Requests -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.4s">
        <div class="text-slate-500 text-sm font-medium mb-1">Pending Requests</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">${s.pendingRequests}</div>
        <div class="flex items-center text-amber-500 text-sm font-medium">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Awaiting approval
        </div>
      </div>
    `;
  }

  /* ================= RENDER REVENUE CHART ================= */
  function renderRevenueChart() {
    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-slide-up" style="animation-delay: 0.5s">
        <div class="flex justify-between items-center mb-6">
          <div>
            <h3 class="text-lg font-semibold text-slate-900">Revenue Overview</h3>
            <p class="text-sm text-slate-500">Last 7 days</p>
          </div>
        </div>
        <div class="relative h-64 w-full">
          <canvas id="revenueChart"></canvas>
        </div>
      </div>
    `;
  }

  /* ================= RENDER STOCK MOVEMENT SUMMARY ================= */
  function renderStockMovementSummary(sm) {
    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-slide-up" style="animation-delay: 0.55s">
        <h3 class="text-lg font-semibold text-slate-900 mb-4">Inventory Movement</h3>
        <p class="text-xs text-slate-400 mb-6">Last 7 days</p>

        <div class="space-y-5">
          <!-- Additions -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
                </svg>
              </div>
              <span class="text-sm font-medium text-slate-700">Stock In</span>
            </div>
            <span class="text-lg font-bold text-emerald-600">+${sm.totalAdditions.toLocaleString()}</span>
          </div>

          <!-- Deductions -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
                </svg>
              </div>
              <span class="text-sm font-medium text-slate-700">Stock Out</span>
            </div>
            <span class="text-lg font-bold text-rose-600">-${sm.totalDeductions.toLocaleString()}</span>
          </div>

          <!-- Movement Count -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center">
                <svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
                </svg>
              </div>
              <span class="text-sm font-medium text-slate-700">Total Movements</span>
            </div>
            <span class="text-lg font-bold text-slate-700">${sm.movementCount}</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ================= RENDER PENDING REQUESTS ================= */
  function renderPendingRequests(requests) {
    const items = requests.length
      ? requests.map((r) => renderRequestItem(r)).join("")
      : '<p class="text-sm text-slate-400 text-center py-4">No pending requests</p>';

    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-slide-up" style="animation-delay: 0.6s">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg font-semibold text-slate-900">Pending Inventory Requests</h3>
          <span class="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
        </div>
        <div class="space-y-4">${items}</div>
      </div>
    `;
  }

  /* ================= RENDER REQUEST ITEM ================= */
  function renderRequestItem(request) {
    const typeColors = {
      RESTOCK:  { bg: "bg-blue-50",   text: "text-blue-600",   icon: "bg-blue-100",   svg: "text-blue-600" },
      ADD_ITEM: { bg: "bg-emerald-50", text: "text-emerald-600", icon: "bg-emerald-100", svg: "text-emerald-600" },
    };
    const c = typeColors[request.requestType] || typeColors.RESTOCK;

    return `
      <div class="flex items-start space-x-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer group">
        <div class="w-10 h-10 rounded-lg ${c.icon} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
          <svg class="w-5 h-5 ${c.svg}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-start">
            <h4 class="text-sm font-semibold text-slate-900">${request.itemName}</h4>
            <span class="text-xs ${c.text} font-medium ${c.bg} px-2 py-1 rounded-full">${request.requestType === "ADD_ITEM" ? "New Item" : "Restock"}</span>
          </div>
          <p class="text-xs text-slate-500 mt-1">Requested by: ${request.requestedBy}${request.quantity ? ` · Qty: ${request.quantity}` : ""}</p>
          <p class="text-xs text-slate-400 mt-1">${timeAgo(request.createdAt)}</p>
        </div>
      </div>
    `;
  }

  /* ================= RENDER LOW STOCK ALERTS ================= */
  function renderLowStockAlerts(alerts) {
    const items = alerts.length
      ? alerts.map((a) => renderStockAlert(a)).join("")
      : '<p class="text-sm text-slate-400 text-center py-4">All items are well stocked</p>';

    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-slide-up" style="animation-delay: 0.7s">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg font-semibold text-slate-900">Low Stock Alerts</h3>
          <span class="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
        </div>
        <div class="space-y-6">${items}</div>
      </div>
    `;
  }

  /* ================= RENDER STOCK ALERT ================= */
  function renderStockAlert(alert) {
    const statusColors = {
      critical: { bg: "bg-rose-500", text: "text-rose-500" },
      warning:  { bg: "bg-amber-500", text: "text-amber-500" },
    };
    const colors = statusColors[alert.status] || statusColors.warning;
    const minStock = alert.minStock || 1;
    const percentage = Math.min(100, Math.round((alert.currentStock / minStock) * 100));

    return `
      <div>
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm font-medium text-slate-900">${alert.name}</span>
          <span class="text-xs font-semibold ${colors.text}">${alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2.5 mb-1 overflow-hidden">
          <div class="${colors.bg} h-2.5 rounded-full progress-bar" style="width: ${percentage}%"></div>
        </div>
        <div class="flex justify-between text-xs text-slate-500">
          <span>${alert.currentStock} ${alert.unit} left</span>
          <span>Min: ${minStock}</span>
        </div>
      </div>
    `;
  }

  /* ================= RENDER RECENT STOCK MOVEMENTS ================= */
  function renderRecentMovements(movements) {
    if (!movements.length) return "";
    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8 animate-slide-up" style="animation-delay: 0.75s">
        <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
          </svg>
          Recent Stock Movements
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-slate-500 border-b border-slate-100">
                <th class="pb-2 font-medium">Product</th>
                <th class="pb-2 font-medium">Type</th>
                <th class="pb-2 font-medium text-right">Change</th>
                <th class="pb-2 font-medium">By</th>
                <th class="pb-2 font-medium">Source</th>
                <th class="pb-2 font-medium text-right">When</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${movements.map((m) => `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="py-2.5 font-medium text-slate-800">${m.productName}</td>
                  <td class="py-2.5">${movementBadge(m.movementType)}</td>
                  <td class="py-2.5 text-right font-semibold ${m.quantityChange > 0 ? "text-emerald-600" : "text-rose-600"}">
                    ${m.quantityChange > 0 ? "+" : ""}${m.quantityChange}
                  </td>
                  <td class="py-2.5 text-slate-600">${m.performedBy}</td>
                  <td class="py-2.5"><span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">${m.source}</span></td>
                  <td class="py-2.5 text-right text-slate-400">${timeAgo(m.createdAt)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ================= RENDER RECENT ACTIVITY ================= */
  function renderRecentActivity(activities) {
    const items = activities.length
      ? activities.map((a) => renderActivityItem(a)).join("")
      : '<p class="text-sm text-slate-400 text-center py-4">No recent activity</p>';

    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-slide-up" style="animation-delay: 0.8s">
        <h3 class="text-lg font-semibold text-slate-900 mb-6 flex items-center">
          <svg class="w-5 h-5 mr-2 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Recent Activity
        </h3>
        <div class="space-y-4">${items}</div>
      </div>
    `;
  }

  /* ================= RENDER ACTIVITY ITEM ================= */
  function renderActivityItem(activity) {
    const activityColors = {
      billing:   { border: "border-emerald-400", dot: "bg-emerald-400" },
      inventory: { border: "border-blue-400",    dot: "bg-blue-400" },
      approval:  { border: "border-purple-400",  dot: "bg-purple-400" },
      user:      { border: "border-cyan-400",    dot: "bg-cyan-400" },
      general:   { border: "border-amber-400",   dot: "bg-amber-400" },
    };
    const colors = activityColors[activity.type] || activityColors.general;

    return `
      <div class="flex items-center space-x-4 p-3 rounded-lg hover:bg-slate-50 transition-colors border-l-4 ${colors.border}">
        <div class="w-2 h-2 ${colors.dot} rounded-full"></div>
        <div class="flex-1">
          <p class="text-sm text-slate-700"><span class="font-semibold text-slate-900">${activity.actor}</span> ${activity.action}</p>
          <p class="text-xs text-slate-400 mt-1">${timeAgo(activity.createdAt)}</p>
        </div>
      </div>
    `;
  }

  /* ================= INITIALIZE REVENUE CHART ================= */
  function initializeRevenueChart(revenueTrend) {
    const canvas = document.getElementById("revenueChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (typeof Chart === "undefined") {
      console.warn("Chart.js not loaded, skipping chart initialization");
      return;
    }

    const maxVal = Math.max(...revenueTrend.data, 1000);
    const yMax   = Math.ceil(maxVal * 1.2 / 1000) * 1000;     // round up nicely

    new Chart(ctx, {
      type: "line",
      data: {
        labels: revenueTrend.labels,
        datasets: [
          {
            label: "Revenue",
            data: revenueTrend.data,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderWidth: 3,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: "#10b981",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointHoverRadius: 6,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1e293b",
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: (context) => "₱" + context.parsed.y.toLocaleString(),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: yMax,
            ticks: {
              callback: (value) => (value >= 1000 ? value / 1000 + "k" : value),
              color: "#94a3b8",
              font: { size: 11 },
            },
            grid: { color: "#f1f5f9", drawBorder: false },
          },
          x: {
            ticks: { color: "#94a3b8", font: { size: 11 } },
            grid: { display: false },
          },
        },
        interaction: { intersect: false, mode: "index" },
      },
    });
  }

  /* ================= ANIMATE PROGRESS BARS ================= */
  function animateProgressBars() {
    const progressBars = document.querySelectorAll(".progress-bar");
    progressBars.forEach((bar) => {
      const width = bar.style.width;
      bar.style.width = "0%";
      setTimeout(() => {
        bar.style.width = width;
      }, 500);
    });
  }

  /* ================= INVENTORY ================= */
  async function loadInventory() {
    setActive(navInventory);

    try {
      const res = await fetch("../../HTML/admin_Inventory/admin_Inventory.html");
      if (!res.ok) throw new Error("Inventory HTML not found");

      mainContent.innerHTML = await res.text();
      await new Promise((r) => setTimeout(r, 150));

      const module = await import("../admin_Inventory/admin_Inventory.js");
      if (typeof module.initAdminInventory !== "function") throw new Error("initAdminInventory() missing");
      await module.initAdminInventory();
    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `<div class="text-red-500 p-4 font-medium">Failed to load Inventory module: ${error.message}</div>`;
    }
  }

  /* ================= USER MANAGEMENT ================= */
  async function loadUserManagement() {
    setActive(navUserManagement);

    try {
      const res = await fetch("../../HTML/Owner_UserManagement/UserManagement.html");
      if (!res.ok) throw new Error("UserManagement HTML not found");

      mainContent.innerHTML = await res.text();
      await new Promise((r) => setTimeout(r, 150));

      const module = await import("../Owner_Usermanagement/UserManagement.js");
      if (typeof module.initUserManagement !== "function") throw new Error("initUserManagement() missing");
      module.initUserManagement();
    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `<div class="text-red-500 p-4 font-medium">Failed to load UserManagement module: ${error.message}</div>`;
    }
  }

  /* ================= REPORTS ================= */
  async function loadReports() {
    setActive(navReports);

    try {
      const res = await fetch("../../HTML/admin_Reports/admin_Reports_Sales/admin_Reports_Sales.html");
      if (!res.ok) throw new Error("Reports HTML not found");

      mainContent.innerHTML = await res.text();
      await new Promise((r) => setTimeout(r, 150));

      const module = await import("../admin_Reports/admin_Reports_Sales/admin_Reports_Sales.js");
      if (typeof module.initReports !== "function") throw new Error("initReports() missing");
      module.initReports();
    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `<div class="text-red-500 p-4 font-medium">Failed to load Reports module: ${error.message}</div>`;
    }
  }

  /* ================= USER PROFILE ================= */
  async function loadUserProfile() {
    try {
      mainContent.innerHTML = `
        <div class="flex items-center justify-center p-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span class="ml-2 text-gray-600">Loading Profile...</span>
        </div>
      `;

      const res = await fetch("../../HTML/user_Profile/user_Profile.html");
      if (!res.ok) throw new Error("User Profile HTML not found");

      mainContent.innerHTML = await res.text();
      await new Promise((r) => setTimeout(r, 50));

      const module = await import("../../js/user_Profile/user_Profile.js");
      if (typeof module.initProfile !== "function") throw new Error("initProfile() missing from user profile module");
      module.initProfile("admin");
    } catch (error) {
      console.error("Error loading User Profile:", error);
      mainContent.innerHTML = `<div class="text-red-500 p-4 font-medium">Failed to load User Profile: ${error.message}</div>`;
    }
  }

  /* ================= STOCK LOGS ================= */
  async function loadStockLogs() {
    setActive(navStockLogs);

    try {
      const res = await fetch(`../../HTML/Admin_Activitylogs/OwnerActivitylogs.html?v=${Date.now()}`);
      if (!res.ok) throw new Error("Stock Logs HTML not found");

      mainContent.innerHTML = await res.text();
      await new Promise((r) => setTimeout(r, 150));

      const module = await import(`../Admin_Activitylogs/OwnerActivitylogs.js?v=${Date.now()}`);
      if (typeof module.initOwnerActivitylogs !== "function") throw new Error("initOwnerActivitylogs() missing");
      module.initOwnerActivitylogs();
    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `<div class="text-red-500 p-4 font-medium">Failed to load Stock Logs module: ${error.message}</div>`;
    }
  }

  function loadExpenses() {
    setActive(navExpenses);
    clearInterval(refreshTimer);

    mainContent.innerHTML = `
      <div class="mx-auto max-w-7xl">
        <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <iframe
            title="Owner Expenses"
            src="../../HTML/OWNER_Expenses/OWNER_Expenses.html"
            class="h-[calc(100vh-220px)] min-h-[560px] w-full border-0"
          ></iframe>
        </div>
      </div>
    `;
  }

  /* ================= EVENTS ================= */
  navDashboard.addEventListener("click", (e) => {
    e.preventDefault();
    loadDashboard();
  });

  navInventory.addEventListener("click", (e) => {
    e.preventDefault();
    loadInventory();
  });

  navUserManagement.addEventListener("click", (e) => {
    e.preventDefault();
    loadUserManagement();
  });

  navReports.addEventListener("click", (e) => {
    e.preventDefault();
    loadReports();
  });

  navExpenses?.addEventListener("click", (e) => {
    e.preventDefault();
    loadExpenses();
  });

  profileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    loadUserProfile();
  });
    

  navStockLogs.addEventListener("click", (e) => {
    e.preventDefault();
    loadStockLogs();
  });

  if (auth) {
    auth.bindLogoutButton(logoutBtn, {
      redirectTo: "../../HTML/loginPage/loginPage.html",
      replace: true,
      confirmBeforeLogout: true,
      confirmTitle: "Confirm Logout",
      confirmMessage: "Are you sure you want to log out?",
      confirmButtonText: "Logout",
      cancelButtonText: "Cancel",
    });
  }

  /* ================= DEFAULT ================= */
  loadDashboard();

  // Initialize notification widget
  const notifToken = ["token", "authToken", "jwtToken", "ibmsToken"]
    .map(k => localStorage.getItem(k))
    .find(v => v && v.trim()) || "";
  if (notifToken) {
    const notificationWidget = new NotificationWidget("http://localhost:3000/api", notifToken);
    window.notificationWidget = notificationWidget;
    notificationWidget.init();
  }

  // Expose navigation functions globally for notification widget
  window.loadInventory = loadInventory;
  window.loadExpenses = loadExpenses;
  window.loadReports = loadReports;
  window.loadUserManagement = loadUserManagement;
  window.loadStockLogs = loadStockLogs;
  window.loadDashboard = loadDashboard;
});
