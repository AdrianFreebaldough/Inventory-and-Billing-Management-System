import {
  staffUser,
  dashboardStats,
  recentTransactions,
  inventoryAlerts,
  topItemsToday
} from "./data/staff_Dboard_data.js";

document.addEventListener("DOMContentLoaded", () => {

  /* ================= ELEMENTS ================= */
  const mainContent   = document.getElementById("mainContent");
  const navDashboard  = document.getElementById("navDashboard");
  const navBilling    = document.getElementById("navBilling");
  const navInventory  = document.getElementById("navInventory");

  const staffNameEl     = document.getElementById("staffName");
  const staffUsernameEl = document.getElementById("staffUsername");
  const staffAvatarEl   = document.getElementById("staffAvatar");

  /* ================= STAFF INFO ================= */
  if (staffUser) {
    staffNameEl.textContent = staffUser.fullName;
    staffUsernameEl.textContent = staffUser.username;
    staffAvatarEl.textContent = staffUser.fullName.charAt(0).toUpperCase();
  }

  /* ================= NAV ACTIVE ================= */
  function setActive(activeEl) {
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.remove("bg-emerald-600", "text-white");
      link.classList.add("text-gray-700");
    });

    activeEl.classList.add("bg-emerald-600", "text-white");
    activeEl.classList.remove("text-gray-700");
  }

  /* ================= DASHBOARD ================= */
  function loadDashboard() {
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

  /* ================= BILLING (FIXED) ================= */
  async function loadBilling() {
    setActive(navBilling);

    try {
      // ✅ correct relative path from staff_dashboard.js
      const res = await fetch("../../HTML/staffinventory/staffbilling.html");
      if (!res.ok) throw new Error("Billing HTML not found");

      mainContent.innerHTML = await res.text();

      // wait for DOM injection
      await new Promise(r => setTimeout(r, 50));

      // ✅ correct module path
      const module = await import("../staff_inventory/staff_billing.js");

      if (typeof module.initBilling !== "function") {
        throw new Error("initBilling() missing");
      }

      module.initBilling();

    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load Billing module.
        </div>
      `;
    }
  }

  /* ================= INVENTORY ================= */
  function loadInventory() {
    setActive(navInventory);

    mainContent.innerHTML = `
      <div class="bg-white p-6 rounded shadow">
        <h1 class="text-2xl font-semibold mb-4">Inventory</h1>
        <p class="text-gray-500 mb-4">
          Inventory module ready for connection.
        </p>
      </div>
    `;
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

  /* ================= DEFAULT ================= */
  loadDashboard();
});
