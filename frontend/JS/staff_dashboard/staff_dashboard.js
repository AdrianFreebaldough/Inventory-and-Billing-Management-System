import {
  staffUser,
  dashboardStats,
  recentTransactions,
  inventoryAlerts,
  topItemsToday
} from "./data/staff_Dboard_data.js";

document.addEventListener("DOMContentLoaded", () => {
  const BILLING_MODE_RETURN_KEY = "lastStaffRoute";
  const STAFF_CURRENT_ROUTE_KEY = "staffCurrentRoute";

  /* ================= ELEMENTS ================= */
  const mainContent   = document.getElementById("mainContent");
  const navDashboard  = document.getElementById("navDashboard");
  const navBilling    = document.getElementById("navBilling");
  const navInventory  = document.getElementById("navInventory");

  const staffNameEl     = document.getElementById("staffName");
  const staffUsernameEl = document.getElementById("staffUsername");
  const staffAvatarEl   = document.getElementById("staffAvatar");
  const profileBtn      = document.getElementById("profileBtn");
  const menuPosHeaderBtn = document.getElementById("menuPosHeaderBtn");

  function getCurrentTokenRole() {
    const tokenKeys = ["token", "authToken", "jwtToken", "ibmsToken"];

    for (const key of tokenKeys) {
      const token = localStorage.getItem(key);
      if (!token || !token.trim()) continue;

      const parts = token.split(".");
      if (parts.length < 2) continue;

      try {
        const payload = JSON.parse(atob(parts[1]));
        const role = String(payload?.role || "").toLowerCase();
        if (role) return role;
      } catch {
        return "";
      }
    }

    return "";
  }

  /* ================= STAFF INFO ================= */
  if (staffUser) {
    staffNameEl.textContent = staffUser.fullName;
    staffUsernameEl.textContent = staffUser.username;
    staffAvatarEl.textContent = staffUser.fullName.charAt(0).toUpperCase();
  }

  const currentRole = getCurrentTokenRole();
  let currentStaffRoute = "dashboard";

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

  /* ================= NAV ACTIVE ================= */
  function setActive(activeEl) {
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.remove("bg-blue-600", "text-white");
      link.classList.add("text-gray-700");
    });

    activeEl.classList.add("bg-blue-600", "text-white");
    activeEl.classList.remove("text-gray-700");
  }

  /* ================= DASHBOARD ================= */
  function loadDashboard() {
    setCurrentStaffRoute("dashboard");
    setActive(navDashboard);

    mainContent.innerHTML = `
      <div class="grid grid-cols-4 gap-4 mb-8">
        <div class="bg-white p-4 rounded shadow">
          <p class="text-sm text-gray-500">Today's Revenue</p>
          <p id="revenueToday" class="text-2xl font-bold">₱0</p>
        </div>
        <div class="bg-white p-4 rounded shadow">
          <p class="text-sm text-gray-500">Transactions</p>
          <p id="transactionsToday" class="text-2xl font-bold">0</p>
        </div>
        <div class="bg-white p-4 rounded shadow">
          <p class="text-sm text-gray-500">Items Issued</p>
          <p id="itemsIssuedToday" class="text-2xl font-bold">0</p>
        </div>
        <div class="bg-white p-4 rounded shadow">
          <p class="text-sm text-gray-500">Pending Restock</p>
          <p id="pendingRestock" class="text-2xl font-bold">0</p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-6">
        <div class="bg-white p-4 rounded shadow">
          <h2 class="font-semibold mb-4">Recent Transactions</h2>
          <div id="recentTransactions"></div>
        </div>

        <div class="bg-white p-4 rounded shadow">
          <h2 class="font-semibold mb-4">Inventory Alerts</h2>
          <div id="inventoryAlerts"></div>
        </div>

        <div class="bg-white p-4 rounded shadow">
          <h2 class="font-semibold mb-4">Top Items Today</h2>
          <div id="topItemsToday"></div>
        </div>
      </div>
    `;

    document.getElementById("revenueToday").textContent =
      `₱${dashboardStats?.revenueToday ?? 0}`;
    document.getElementById("transactionsToday").textContent =
      dashboardStats?.transactionsToday ?? 0;
    document.getElementById("itemsIssuedToday").textContent =
      dashboardStats?.itemsIssuedToday ?? 0;
    document.getElementById("pendingRestock").textContent =
      dashboardStats?.pendingRestock ?? 0;

    document.getElementById("recentTransactions").innerHTML =
      recentTransactions.map(tx => `
        <div class="flex justify-between py-2 border-b">
          <div>
            <p class="font-medium">${tx.id}</p>
            <p class="text-sm text-gray-500">${tx.patient} · ${tx.time}</p>
          </div>
          <p class="font-semibold">₱${tx.amount}</p>
        </div>
      `).join("");

    document.getElementById("inventoryAlerts").innerHTML =
      inventoryAlerts.map(item => `
        <div class="py-2 border-b">
          <p class="font-medium">${item.name}</p>
          <p class="text-sm ${
            item.status === "out" ? "text-red-600" : "text-orange-500"
          }">
            ${item.status.toUpperCase()} · ${item.remaining}
          </p>
        </div>
      `).join("");

    document.getElementById("topItemsToday").innerHTML =
      topItemsToday.map(item => `
        <div class="flex justify-between py-2 border-b">
          <span>${item.name}</span>
          <span class="font-semibold">₱${item.price}</span>
        </div>
      `).join("");
  }

  /* ================= BILLING MODE (FULL SCREEN) ================= */
  function loadBilling() {
    setCurrentStaffRoute(currentStaffRoute || "dashboard");
    enterBillingMode();
  }

  /* ================= INVENTORY ================= */
  async function loadInventory() {
    setCurrentStaffRoute("inventory");
    setActive(navInventory);

    try {
      // ✅ correct relative path from staff_dashboard.js
      const res = await fetch("../../HTML/staff_Inventory/staff_Inventory.html");
      if (!res.ok) throw new Error("Inventory HTML not found");

      mainContent.innerHTML = await res.text();

      // wait briefly for DOM injection to settle
      await new Promise(r => setTimeout(r, 150));

      // ✅ correct module path
      console.log("Importing staff_inventory module...");
      const module = await import("../staff_inventory/staff_inventory.js");

      if (typeof module.initInventory !== "function") {
        throw new Error("initInventory() missing");
      }

      module.initInventory();
      console.log("staff_inventory.initInventory() called");

    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load Inventory module: ${error.message}
        </div>
      `;
    }
  }

  /* ================= USER PROFILE ================= */
  async function loadUserProfile() {
    setCurrentStaffRoute("profile");
    try {
      console.log('🔄 Loading User Profile...');
      
      // Show loading state
      mainContent.innerHTML = `
        <div class="flex items-center justify-center p-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span class="ml-2 text-gray-600">Loading Profile...</span>
        </div>
      `;
      
      // Load User Profile HTML
      const res = await fetch('../../HTML/user_Profile/user_Profile.html');
      if (!res.ok) throw new Error("User Profile HTML not found");

      mainContent.innerHTML = await res.text();
      console.log('✅ User Profile HTML loaded');

      // Reduce wait time
      await new Promise(r => setTimeout(r, 50));

      // Load User Profile JavaScript module
      console.log('📦 Importing User Profile module...');
      const module = await import('../../js/user_Profile/user_Profile.js');

      if (typeof module.initProfile !== "function") {
        throw new Error("initProfile() missing from user profile module");
      }

      module.initProfile('staff');
      console.log('✅ User Profile initialized');

    } catch (error) {
      console.error('❌ Error loading User Profile:', error);
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load User Profile: ${error.message}
        </div>
      `;
    }
  }

  /* ================= EVENTS ================= */
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

  menuPosHeaderBtn?.addEventListener("click", e => {
    e.preventDefault();

    if (currentRole !== "staff") {
      return;
    }

    loadBilling();
  });

  profileBtn.addEventListener("click", e => {
    e.preventDefault();
    loadUserProfile();
  });

  /* ================= DEFAULT / RESTORE ROUTE ================= */
  const hashRoute = window.location.hash.replace("#", "").toLowerCase();
  const storedRoute = (sessionStorage.getItem(STAFF_CURRENT_ROUTE_KEY) || "").toLowerCase();
  const initialRoute = ["dashboard", "inventory", "profile"].includes(hashRoute)
    ? hashRoute
    : ["dashboard", "inventory", "profile"].includes(storedRoute)
      ? storedRoute
      : "dashboard";

  if (initialRoute === "inventory") {
    loadInventory();
  } else if (initialRoute === "profile") {
    loadUserProfile();
  } else {
    loadDashboard();
  }
});
