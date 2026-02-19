import {
  staffUser,
  dashboardStats,
  recentTransactions,
  inventoryAlerts,
  topItemsToday
} from "./data/staff_Dboard_data.js";


document.addEventListener("DOMContentLoaded", () => {
  

  /* ===== ELEMENTS ===== */
  const mainContent = document.getElementById("mainContent");
  const navDashboard = document.getElementById("navDashboard");
  const navBilling = document.getElementById("navBilling");

  const staffNameEl = document.getElementById("staffName");
  const staffUsernameEl = document.getElementById("staffUsername");
  const staffAvatarEl = document.getElementById("staffAvatar");

  /* ===== STAFF INFO ===== */
  if (staffUser) {
    staffNameEl.textContent = staffUser.fullName;
    staffUsernameEl.textContent = staffUser.username;
    staffAvatarEl.textContent = staffUser.fullName.charAt(0).toUpperCase();
  }

  /* ===== ACTIVE NAV ===== */
  function setActive(activeEl) {
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.remove("bg-emerald-600", "text-white");
      link.classList.add("text-gray-700");
    });

    if (activeEl) {
      activeEl.classList.add("bg-emerald-600", "text-white");
      activeEl.classList.remove("text-gray-700");
    }
  }

  /* ===== DASHBOARD ===== */
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
          <h2 class="font-semibold mb-2">Top Items Today</h2>
          <div id="topItemsToday"></div>
        </div>
      </div>
    `;

    /* ===== RENDER DATA SAFELY ===== */

    document.getElementById("revenueToday").textContent =
      `₱${dashboardStats?.revenueToday ?? 0}`;

    document.getElementById("transactionsToday").textContent =
      dashboardStats?.transactionsToday ?? 0;

    document.getElementById("itemsIssuedToday").textContent =
      dashboardStats?.itemsIssuedToday ?? 0;

    document.getElementById("pendingRestock").textContent =
      dashboardStats?.pendingRestock ?? 0;

    const txContainer = document.getElementById("recentTransactions");
    recentTransactions?.forEach(tx => {
      txContainer.innerHTML += `
        <div class="flex justify-between py-2 border-b">
          <div>
            <p class="font-medium">${tx.id}</p>
            <p class="text-sm text-gray-500">${tx.patient} · ${tx.time}</p>
          </div>
          <p class="font-semibold">₱${tx.amount}</p>
        </div>
      `;
    });

    const invContainer = document.getElementById("inventoryAlerts");
    inventoryAlerts?.forEach(item => {
      invContainer.innerHTML += `
        <div class="py-2 border-b">
          <p class="font-medium">${item.name}</p>
          <p class="text-sm ${
            item.status === "out" ? "text-red-600" : "text-orange-500"
          }">
            ${item.status.toUpperCase()} · ${item.remaining}
          </p>
        </div>
      `;
    });

    const topItemsContainer = document.getElementById("topItemsToday");
    topItemsToday?.forEach(item => {
      topItemsContainer.innerHTML += `
        <div class="flex justify-between py-2 border-b">
          <span>${item.name}</span>
          <span class="font-semibold">₱${item.price}</span>
        </div>
      `;
    });
  }

  /* ===== BILLING ===== */
async function loadBilling() {
  setActive(navBilling);

  try {
    console.log("Starting to load billing...");
    
    // Try multiple paths to handle different server configurations
    let html;
    let fetchPath = "/frontend/HTML/staffinventory/staffbilling.html";
    
    let res = await fetch(fetchPath);
    
    // If absolute path fails, try relative path
    if (!res.ok) {
      fetchPath = "../HTML/staffinventory/staffbilling.html";
      res = await fetch(fetchPath);
    }
    
    if (!res.ok) {
      throw new Error(`Failed to fetch from ${fetchPath}: ${res.status}`);
    }
    
    html = await res.text();
    console.log("Billing HTML fetched successfully");

    // 1️⃣ Inject billing HTML
    mainContent.innerHTML = html;
    console.log("Billing HTML injected");

    // 2️⃣ Give DOM time to process the injection
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log("DOM ready, loading billing module...");

    // 3️⃣ Load billing JS with cache busting
    const timestamp = Date.now();
    const module = await import(`../staff_inventory/staff_billing.js?t=${timestamp}`);
    console.log("Billing module imported");

    // 4️⃣ Initialize billing logic with error handling
    try {
      module.initBilling();
      console.log("Billing module initialized successfully");
    } catch (initError) {
      console.error("Error during initBilling():", initError);
      throw initError;
    }
  } catch (error) {
    console.error("Error loading billing:", error);
    mainContent.innerHTML = `<div class="text-red-500 p-4"><strong>Error:</strong> ${error.message}</div>`;
  }
}



  /* ===== EVENTS ===== */
  navDashboard.addEventListener("click", e => {
    e.preventDefault();
    loadDashboard();
  });

  navBilling.addEventListener("click", e => {
    e.preventDefault();
    loadBilling();
  });

  /* ===== DEFAULT ===== */
  loadDashboard(); // ← THIS MUST RUN
});
