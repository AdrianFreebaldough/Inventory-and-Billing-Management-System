import { apiFetch } from "../utils/apiClient.js";
import { NotificationWidget } from "../components/notificationWidget.js";

/* ════════════════════════════════════════════════════════════════
   API endpoints
   ════════════════════════════════════════════════════════════════ */
const STAFF_DASHBOARD_API = {
  summary: "/api/staff/dashboard/summary",
  recentTransactions: "/api/staff/dashboard/recent-transactions",
  inventoryAlerts: "/api/staff/dashboard/inventory-alerts",
  topItemsToday: "/api/staff/dashboard/top-items-today",
  recentItemUsage: "/api/staff/dashboard/recent-item-usage",
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/* ════════════════════════════════════════════════════════════════
   Parallel data fetch – uses Promise.allSettled so one failing
   endpoint never blocks the rest of the dashboard.
   ════════════════════════════════════════════════════════════════ */
async function STAFF_fetchDashboardData() {
  const [summary, transactions, alerts, topItems, usage] = await Promise.allSettled([
    apiFetch(STAFF_DASHBOARD_API.summary),
    apiFetch(STAFF_DASHBOARD_API.recentTransactions),
    apiFetch(STAFF_DASHBOARD_API.inventoryAlerts),
    apiFetch(STAFF_DASHBOARD_API.topItemsToday),
    apiFetch(STAFF_DASHBOARD_API.recentItemUsage),
  ]);

  return {
    summary: summary.status === "fulfilled" ? summary.value : null,
    transactions: transactions.status === "fulfilled" ? transactions.value : null,
    alerts: alerts.status === "fulfilled" ? alerts.value : null,
    topItems: topItems.status === "fulfilled" ? topItems.value : null,
    usage: usage.status === "fulfilled" ? usage.value : null,
  };
}

/* ════════════════════════════════════════════════════════════════
   Data mappers  (backend response → UI-friendly shape)
   ════════════════════════════════════════════════════════════════ */
function mapSummary(raw) {
  if (!raw) return { revenueToday: 0, transactionsToday: 0, itemsIssuedToday: 0, pendingRestock: 0 };
  return {
    revenueToday: raw.todaysRevenue ?? 0,
    transactionsToday: raw.todaysTransactions ?? 0,
    itemsIssuedToday: raw.itemsIssuedToday ?? 0,
    pendingRestock: raw.pendingRestockRequests ?? 0,
  };
}

function mapTransactions(raw) {
  if (!raw?.data) return [];
  return raw.data.map(tx => ({
    id: tx.transactionId ? String(tx.transactionId).slice(-6).toUpperCase() : "—",
    patient: tx.patientId || "Walk-in",
    time: tx.dateTime
      ? new Date(tx.dateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "",
    amount: tx.totalAmount ?? 0,
    items: tx.itemCount ?? 0,
    status: tx.status ?? "",
  }));
}

function mapAlerts(raw) {
  if (!raw?.data) return [];
  return raw.data.map(item => ({
    name: item.genericName || item.itemName || "",
    status: item.stockStatus ?? "low",
    remaining: item.stockStatus === "out"
      ? "Out of stock"
      : `${item.remainingQuantity ?? 0} left`,
  }));
}

function mapTopItems(raw) {
  if (!raw?.data) return [];
  return raw.data.map(item => ({
    name: item.genericName || item.itemName || "",
    sold: item.quantityDispensed ?? 0,
    price: item.totalSalesValue ?? 0,
  }));
}

function mapUsage(raw) {
  if (!raw?.data) return [];
  return raw.data.map(item => ({
    name: item.genericName || item.itemName || "",
    quantity: item.quantity ?? 0,
    unit: item.unitType ?? "pcs",
  }));
}

/* ════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════ */
const formatCurrency = value => `₱${Number(value ?? 0).toLocaleString()}`;

function decodeTokenPayload() {
  const tokenKeys = ["token", "authToken", "jwtToken", "ibmsToken"];
  for (const key of tokenKeys) {
    const token = localStorage.getItem(key);
    if (!token || !token.trim()) continue;
    const parts = token.split(".");
    if (parts.length < 2) continue;
    try {
      return JSON.parse(atob(parts[1]));
    } catch { /* skip */ }
  }
  return null;
}

function toFirstLastName(value, fallback = "Staff") {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function getInitial(value, fallback = "S") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase();
}

function toRoleLabel(value, fallback = "Staff") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getStaffDisplayInfo() {
  const payload = decodeTokenPayload();
  const name = localStorage.getItem("userName") || "";
  const displayName = toFirstLastName(name, "Staff");
  const initial = getInitial(displayName, "S");
  const roleLabel = toRoleLabel(payload?.role, "Staff");

  return {
    displayName,
    subtitle: roleLabel,
    initial,
    role: String(payload?.role || "").toLowerCase(),
  };
}

async function hydrateStaffHeaderIdentity({ staffNameEl, staffUsernameEl, staffAvatarEl }) {
  try {
    const payload = await apiFetch("/api/auth/profile/me", { method: "GET" });
    const rawFullName = String(payload?.data?.fullName || "").trim();
    const roleLabel = String(payload?.data?.role || "").trim() || "Staff";
    const displayName = toFirstLastName(
      rawFullName,
      String(staffNameEl?.textContent || "").trim() || "Staff"
    );

    if (staffNameEl) {
      staffNameEl.textContent = displayName;
    }

    if (staffAvatarEl) {
      staffAvatarEl.textContent = getInitial(displayName, "S");
    }

    if (staffUsernameEl) {
      staffUsernameEl.textContent = roleLabel;
      staffUsernameEl.classList.remove("hidden");
      staffUsernameEl.removeAttribute("aria-hidden");
    }

    localStorage.setItem("userName", displayName);
  } catch {
    if (staffUsernameEl) {
      const fallback = getStaffDisplayInfo();
      staffUsernameEl.textContent = fallback.subtitle;
      staffUsernameEl.classList.remove("hidden");
      staffUsernameEl.removeAttribute("aria-hidden");
    }
  }
}

/* ════════════════════════════════════════════════════════════════
   Main init
   ════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const auth = window.IBMSAuth;
  if (auth) {
    auth.protectPage({ requiredRole: "staff" });
    if (!auth.isSessionValid("staff")) return;
  }

  const BILLING_MODE_RETURN_KEY = "lastStaffRoute";
  const STAFF_CURRENT_ROUTE_KEY = "staffCurrentRoute";

  const mainContent = document.getElementById("mainContent");
  const navDashboard = document.getElementById("navDashboard");
  const navBilling = document.getElementById("navBilling");
  const navInventory = document.getElementById("navInventory");
  const navStockRequest = document.getElementById("navStockRequest");
  const navExpenses = document.getElementById("navExpenses");
  const navActivityLog = document.getElementById("navActivityLog");
  const staffNameEl = document.getElementById("staffName");
  const staffUsernameEl = document.getElementById("staffUsername");
  const staffAvatarEl = document.getElementById("staffAvatar");
  const profileBtn = document.getElementById("profileBtn");
  const menuPosHeaderBtn = document.getElementById("menuPosHeaderBtn");

  /* ── Staff header display ── */
  const staffInfo = getStaffDisplayInfo();
  if (staffNameEl) {
    staffNameEl.textContent = staffInfo.displayName;
  }
  if (staffUsernameEl) {
    staffUsernameEl.textContent = staffInfo.subtitle;
    staffUsernameEl.classList.remove("hidden");
    staffUsernameEl.removeAttribute("aria-hidden");
  }
  if (staffAvatarEl) {
    staffAvatarEl.textContent = staffInfo.initial;
  }

  hydrateStaffHeaderIdentity({ staffNameEl, staffUsernameEl, staffAvatarEl });

  const currentRole = staffInfo.role;
  let currentStaffRoute = "dashboard";
  let refreshTimer = null;

  function setCurrentStaffRoute(route) {
    currentStaffRoute = route;
    sessionStorage.setItem(STAFF_CURRENT_ROUTE_KEY, route);
  }

  function enterBillingMode() {
    sessionStorage.setItem(BILLING_MODE_RETURN_KEY, currentStaffRoute || "dashboard");
    window.location.href = "../../HTML/Staff_Billing/Staff_Billing.html";
  }

  if (menuPosHeaderBtn) {
    if (currentRole === "staff") {
      menuPosHeaderBtn.classList.remove("hidden");
    } else {
      menuPosHeaderBtn.classList.add("hidden");
    }
  }

  function setActive(activeEl) {
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.remove("bg-blue-600", "text-white");
      link.classList.add("text-gray-700");
    });
    activeEl.classList.add("bg-blue-600", "text-white");
    activeEl.classList.remove("text-gray-700");
  }

  /* ─────────────────────────────────────────────
     Clear / set auto-refresh
     ───────────────────────────────────────────── */
  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(() => {
      if (currentStaffRoute === "dashboard") refreshDashboardData();
    }, REFRESH_INTERVAL_MS);
  }

  function bindDashboardRefreshButton() {
    const refreshBtn = document.getElementById("refreshDashboardBtn");
    if (!refreshBtn) return;

    refreshBtn.onclick = async () => {
      if (currentStaffRoute !== "dashboard") return;
      await loadDashboard();
    };
  }

  /* ─────────────────────────────────────────────
     loadDashboard  (async, API-driven)
     ───────────────────────────────────────────── */
  async function loadDashboard() {
    setCurrentStaffRoute("dashboard");
    setActive(navDashboard);

    /* Show skeleton / loading state */
    mainContent.innerHTML = `
      <div class="mx-auto max-w-7xl space-y-6">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold text-gray-900">Dashboard</h1>
          <button id="refreshDashboardBtn" type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition">
            ↻ Refresh
          </button>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="h-[140px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
            <p class="text-xs font-medium text-gray-500">Today's Revenue</p>
            <p id="revenueToday" class="mt-2 text-4xl font-bold tracking-tight text-gray-900 animate-pulse bg-gray-100 rounded h-10 w-32"></p>
          </div>
          <div class="h-[140px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
            <p class="text-xs font-medium text-gray-500">Today's Transactions</p>
            <p id="transactionsToday" class="mt-2 text-4xl font-bold tracking-tight text-gray-900 animate-pulse bg-gray-100 rounded h-10 w-16"></p>
          </div>
          <div class="h-[140px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
            <p class="text-xs font-medium text-gray-500">Items Issued Today</p>
            <p id="itemsIssuedToday" class="mt-2 text-4xl font-bold tracking-tight text-gray-900 animate-pulse bg-gray-100 rounded h-10 w-16"></p>
          </div>
          <div class="h-[140px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
            <p class="text-xs font-medium text-gray-500">Pending Restock Requests</p>
            <p id="pendingRestock" class="mt-2 text-4xl font-bold tracking-tight text-gray-900 animate-pulse bg-gray-100 rounded h-10 w-12"></p>
          </div>
        </div>

        <div class="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <div class="space-y-6">
            <section class="h-[400px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col">
              <div class="mb-4">
                <h2 class="text-2xl font-semibold text-gray-900">Recent Transactions</h2>
                <p class="mt-1 text-xs text-gray-500">Recent sales activity</p>
              </div>
              <div id="recentTransactions" class="flex-1 overflow-y-auto divide-y divide-gray-200">
                <p class="py-3 text-sm text-gray-400 animate-pulse">Loading…</p>
              </div>
            </section>

            <section class="h-[400px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col">
              <div class="mb-4">
                <h2 class="text-2xl font-semibold text-gray-900">Top Items Today</h2>
                <p class="mt-1 text-xs text-gray-500">Best performing products</p>
              </div>
              <div id="topItemsToday" class="flex-1 overflow-y-auto divide-y divide-gray-200">
                <p class="py-3 text-sm text-gray-400 animate-pulse">Loading…</p>
              </div>
            </section>
          </div>

          <div class="space-y-6">
            <section class="h-[400px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col">
              <div class="mb-4">
                <h2 class="text-2xl font-semibold text-gray-900">Inventory Alerts</h2>
                <p class="mt-1 text-xs text-gray-500">Items requiring attention</p>
              </div>

              <div class="mb-4 flex items-center gap-3 border-b border-gray-200 pb-3 text-xs font-medium text-gray-500">
                <button type="button" data-inv-filter="all" class="inventory-tab border-b-2 border-gray-900 pb-1 text-gray-900">All</button>
                <button type="button" data-inv-filter="low" class="inventory-tab border-b-2 border-transparent pb-1 hover:text-gray-700">Low Stock</button>
                <button type="button" data-inv-filter="out" class="inventory-tab border-b-2 border-transparent pb-1 hover:text-gray-700">Out of Stock</button>
              </div>

              <div id="inventoryAlerts" class="flex-1 overflow-y-auto divide-y divide-gray-200">
                <p class="py-3 text-sm text-gray-400 animate-pulse">Loading…</p>
              </div>
            </section>

            <section class="h-[400px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col">
              <div class="mb-4">
                <h2 class="text-2xl font-semibold text-gray-900">Recent Item Usage</h2>
                <p class="mt-1 text-xs text-gray-500">Items dispensed today</p>
              </div>
              <div id="recentItemUsage" class="flex-1 overflow-y-auto divide-y divide-gray-200">
                <p class="py-3 text-sm text-gray-400 animate-pulse">Loading…</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    /* Wire refresh button */
    bindDashboardRefreshButton();

    /* Fetch & render */
    await refreshDashboardData();

    /* Start auto-refresh timer */
    startAutoRefresh();
  }

  /* ─────────────────────────────────────────────
     refreshDashboardData  – fetch + re-render
     ───────────────────────────────────────────── */
  let _cachedAlerts = [];  // held for inventory-tab filtering

  async function refreshDashboardData() {
    try {
      const raw = await STAFF_fetchDashboardData();

      /* ── Summary cards ── */
      const stats = mapSummary(raw.summary);
      const revenueEl = document.getElementById("revenueToday");
      const transactionsEl = document.getElementById("transactionsToday");
      const itemsIssuedEl = document.getElementById("itemsIssuedToday");
      const pendingEl = document.getElementById("pendingRestock");

      if (revenueEl) { revenueEl.textContent = formatCurrency(stats.revenueToday); revenueEl.className = "mt-2 text-4xl font-bold tracking-tight text-gray-900"; }
      if (transactionsEl) { transactionsEl.textContent = stats.transactionsToday; transactionsEl.className = "mt-2 text-4xl font-bold tracking-tight text-gray-900"; }
      if (itemsIssuedEl) { itemsIssuedEl.textContent = stats.itemsIssuedToday; itemsIssuedEl.className = "mt-2 text-4xl font-bold tracking-tight text-gray-900"; }
      if (pendingEl) { pendingEl.textContent = stats.pendingRestock; pendingEl.className = "mt-2 text-4xl font-bold tracking-tight text-gray-900"; }

      /* ── Recent Transactions ── */
      const transactions = mapTransactions(raw.transactions);
      const recentTransactionsEl = document.getElementById("recentTransactions");
      if (recentTransactionsEl) {
        recentTransactionsEl.innerHTML = transactions.length
          ? transactions.map(tx => `
              <div class="flex items-start justify-between py-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">TX-${tx.id}</p>
                  <p class="text-xs uppercase tracking-wide text-gray-500">${tx.patient}</p>
                  <p class="text-xs text-gray-500">${tx.time}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold text-gray-900">${formatCurrency(tx.amount)}</p>
                  <p class="text-xs text-gray-500">${tx.items} ${tx.items === 1 ? "item" : "items"}</p>
                </div>
              </div>
            `).join("")
          : `<p class="py-3 text-sm text-gray-500">No recent transactions.</p>`;
      }

      /* ── Inventory Alerts ── */
      _cachedAlerts = mapAlerts(raw.alerts);
      renderInventoryAlerts("all");
      bindInventoryTabs();

      /* ── Top Items Today ── */
      const topItems = mapTopItems(raw.topItems);
      const topItemsEl = document.getElementById("topItemsToday");
      if (topItemsEl) {
        topItemsEl.innerHTML = topItems.length
          ? topItems.map(item => `
              <div class="flex items-center justify-between py-3">
                <div>
                  <p class="text-sm font-medium text-gray-900">${item.name}</p>
                  <p class="text-xs text-gray-500">${item.sold} sold</p>
                </div>
                <p class="text-right text-sm font-semibold text-gray-900">${formatCurrency(item.price)}</p>
              </div>
            `).join("")
          : `<p class="py-3 text-sm text-gray-500">No top items yet.</p>`;
      }

      /* ── Recent Item Usage ── */
      const usageItems = mapUsage(raw.usage);
      const usageEl = document.getElementById("recentItemUsage");
      if (usageEl) {
        usageEl.innerHTML = usageItems.length
          ? usageItems.map(item => `
              <div class="flex items-center justify-between py-3">
                <p class="text-sm font-medium text-gray-900">${item.name}</p>
                <p class="text-sm text-gray-600">${item.quantity} ${item.unit}</p>
              </div>
            `).join("")
          : `<p class="py-3 text-sm text-gray-500">No recent usage data.</p>`;
      }

    } catch (err) {
      console.error("[Staff Dashboard] refresh error:", err);
    }
  }

  /* ─────────────────────────────────────────────
     Inventory alerts – filter & restock button
     ───────────────────────────────────────────── */
  function renderInventoryAlerts(filter) {
    const alertsEl = document.getElementById("inventoryAlerts");
    if (!alertsEl) return;

    const filtered = filter === "all"
      ? _cachedAlerts
      : _cachedAlerts.filter(item => item.status === filter);

    alertsEl.innerHTML = filtered.length
      ? filtered.map(item => {
        const isOut = item.status === "out";
        const statusText = isOut ? "Out of Stock" : "Low Stock";
        const statusClass = isOut ? "text-red-600" : "text-orange-500";

        return `
            <div class="flex items-center justify-between gap-4 py-3">
              <div>
                <p class="text-sm font-medium text-gray-900">${item.name}</p>
                <p class="text-xs ${statusClass}">
                  ${statusText} · ${item.remaining}
                </p>
              </div>
              <button type="button"
                      data-restock-item="${item.name}"
                      class="restock-btn whitespace-nowrap rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                Request Restock
              </button>
            </div>
          `;
      }).join("")
      : `<p class="py-3 text-sm text-gray-500">No items for this filter.</p>`;

    /* Wire restock buttons → navigate to inventory */
    alertsEl.querySelectorAll(".restock-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        loadInventory();
      });
    });
  }

  function bindInventoryTabs() {
    const tabs = document.querySelectorAll(".inventory-tab");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const filter = tab.dataset.invFilter || "all";
        tabs.forEach(btn => {
          btn.classList.remove("border-gray-900", "text-gray-900");
          btn.classList.add("border-transparent", "text-gray-500");
        });
        tab.classList.remove("border-transparent", "text-gray-500");
        tab.classList.add("border-gray-900", "text-gray-900");
        renderInventoryAlerts(filter);
      });
    });
  }

  /* ─────────────────────────────────────────────
     Other route loaders (unchanged)
     ───────────────────────────────────────────── */
  function loadBilling() {
    setCurrentStaffRoute(currentStaffRoute || "dashboard");
    enterBillingMode();
  }

  async function loadInventory() {
    stopAutoRefresh();
    setCurrentStaffRoute("inventory");
    setActive(navInventory);

    try {
      const res = await fetch("../../HTML/staff_Inventory/staff_Inventory.html");
      if (!res.ok) throw new Error("Inventory HTML not found");

      mainContent.innerHTML = await res.text();
      await new Promise(r => setTimeout(r, 150));

      const module = await import("../staff_inventory/staff_inventory.js");
      if (typeof module.initInventory !== "function") {
        throw new Error("initInventory() missing");
      }

      module.initInventory();
    } catch (error) {
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load Inventory module: ${error.message}
        </div>
      `;
    }
  }

  async function loadUserProfile() {
    stopAutoRefresh();
    setCurrentStaffRoute("profile");

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
      await new Promise(r => setTimeout(r, 50));

      const module = await import("../../js/user_Profile/user_Profile.js");
      if (typeof module.initProfile !== "function") {
        throw new Error("initProfile() missing from user profile module");
      }

      module.initProfile("staff");
    } catch (error) {
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load User Profile: ${error.message}
        </div>
      `;
    }
  }

  function loadRequestStock() {
    stopAutoRefresh();
    setCurrentStaffRoute("stock-request");
    if (navStockRequest) setActive(navStockRequest);

    mainContent.innerHTML = `
      <div class="mx-auto max-w-7xl">
        <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <iframe
            title="Request Stock"
            src="../../HTML/STAFF_StockRequest/STAFF_StockRequest.html"
            class="h-[calc(100vh-220px)] min-h-[560px] w-full border-0"
          ></iframe>
        </div>
      </div>
    `;
  }

  async function loadServiceManagement() {
    stopAutoRefresh();
    setCurrentStaffRoute("service-management");
    const navServiceManagement = document.getElementById("navServiceManagement");
    if (navServiceManagement) setActive(navServiceManagement);

    try {
      const res = await fetch("../../HTML/service_management/service_management.html");
      if (!res.ok) throw new Error("ServiceManagement HTML not found");

      mainContent.innerHTML = await res.text();
      await new Promise(r => setTimeout(r, 150));

      const module = await import("../service_management/service_management.js");
      if (typeof module.initServiceManagement !== "function") {
        throw new Error("initServiceManagement() missing");
      }
      module.initServiceManagement();
    } catch (error) {
      mainContent.innerHTML = `<div class="text-red-500 p-4 font-medium">Failed to load Service Management module: ${error.message}</div>`;
    }
  }

  async function loadExpenses() {
    stopAutoRefresh();
    setCurrentStaffRoute("expenses");
    if (navExpenses) setActive(navExpenses);

    try {
      const response = await fetch('../../HTML/STAFF_Expenses/STAFF_Expenses.html');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      mainContent.innerHTML = html;

      // Re-execute inline scripts (innerHTML does not run them)
      mainContent.querySelectorAll('script').forEach(oldScript => {
        const newScript = document.createElement('script');
        [...oldScript.attributes].forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript);
        oldScript.remove();
      });

      // Move modals to body so fixed inset-0 covers the full screen (not just the right panel)
      ['customAlertModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) document.body.appendChild(el);
      });
    } catch (error) {
      console.error('Failed to load Expenses:', error);
      mainContent.innerHTML = `<div class="p-8 text-red-500 font-medium">Error loading Expenses module: ${error.message}</div>`;
    }
  }

  function loadActivityLog() {
    stopAutoRefresh();
    setCurrentStaffRoute("activity-log");
    if (navActivityLog) setActive(navActivityLog);

    mainContent.innerHTML = `
      <div class="mx-auto max-w-7xl">
        <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <iframe
            title="Activity Log"
            src="../../HTML/STAFF_ActivityLog/STAFF_ActivityLog.html"
            class="h-[calc(100vh-220px)] min-h-[560px] w-full border-0"
          ></iframe>
        </div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────────
     Navigation event listeners
     ───────────────────────────────────────────── */
  navDashboard.addEventListener("click", e => {
    e.preventDefault();
    loadDashboard();
  });

  navBilling.addEventListener("click", e => {
    e.preventDefault();
    loadBilling();
  });

  navInventory.addEventListener("click", e => {
    e.preventDefault();
    loadInventory();
  });

  const navServiceManagement = document.getElementById("navServiceManagement");
  navServiceManagement?.addEventListener("click", e => {
    e.preventDefault();
    loadServiceManagement();
  });

  navStockRequest?.addEventListener("click", e => {
    e.preventDefault();
    loadRequestStock();
  });

  navExpenses?.addEventListener("click", e => {
    e.preventDefault();
    loadExpenses();
  });

  navActivityLog?.addEventListener("click", e => {
    e.preventDefault();
    loadActivityLog();
  });

  menuPosHeaderBtn?.addEventListener("click", e => {
    e.preventDefault();
    if (currentRole !== "staff") return;
    loadBilling();
  });

  profileBtn.addEventListener("click", e => {
    e.preventDefault();
    loadUserProfile();
  });

  /* ─────────────────────────────────────────────
     Logout functionality
     ───────────────────────────────────────────── */
  const logoutBtn = document.getElementById("logoutBtn");
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

  /* ─────────────────────────────────────────────
     Initial route resolution
     ───────────────────────────────────────────── */
  const hashRoute = window.location.hash.replace("#", "").toLowerCase();
  const storedRoute = (sessionStorage.getItem(STAFF_CURRENT_ROUTE_KEY) || "").toLowerCase();
  const validRoutes = ["dashboard", "inventory", "profile", "stock-request", "expenses", "activity-log", "service-management"];

  const initialRoute = validRoutes.includes(hashRoute)
    ? hashRoute
    : validRoutes.includes(storedRoute)
      ? storedRoute
      : "dashboard";

  if (initialRoute === "inventory") {
    loadInventory();
  } else if (initialRoute === "stock-request") {
    loadRequestStock();
  } else if (initialRoute === "service-management") {
    loadServiceManagement();
  } else if (initialRoute === "expenses") {
    loadExpenses();
  } else if (initialRoute === "activity-log") {
    loadActivityLog();
  } else if (initialRoute === "profile") {
    loadUserProfile();
  } else {
    loadDashboard();
  }

  // Initialize notification widget
  const notifToken = ["token", "authToken", "jwtToken", "ibmsToken"]
    .map(k => localStorage.getItem(k))
    .find(v => v && v.trim()) || "";
  if (notifToken) {
    const configuredBase = String(window.IBMS_API_BASE_URL || "").trim().replace(/\/+$/, "");
    const localHost = String(window.location.hostname || "").toLowerCase();
    const notificationApiBase = configuredBase
      ? (configuredBase.endsWith("/api") ? configuredBase : `${configuredBase}/api`)
      : ((localHost === "localhost" || localHost === "127.0.0.1") ? "http://localhost:3000/api" : "/api");

    const notificationWidget = new NotificationWidget(notificationApiBase, notifToken);
    window.notificationWidget = notificationWidget;
    notificationWidget.init();
  }

  // Expose navigation functions globally for notification widget
  window.loadInventory = loadInventory;
  window.loadRequestStock = loadRequestStock;
  window.loadExpenses = loadExpenses;
  window.loadActivityLog = loadActivityLog;
  window.loadDashboard = loadDashboard;
});
