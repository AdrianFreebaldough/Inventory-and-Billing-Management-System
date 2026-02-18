import {
  dashboardStats,
  recentTransactions,
  inventoryAlerts,
  topItemsToday,
  staffUser
} from "./data/staff_Dboard_data.js";

document.addEventListener("DOMContentLoaded", () => {

  // ---------- STAFF INFO ----------
  document.getElementById("staffName").textContent = staffUser.fullName;
  document.getElementById("staffUsername").textContent = staffUser.username;
  document.getElementById("staffAvatar").textContent =
    staffUser.fullName.charAt(0).toUpperCase();

  // ---------- STATS ----------
  document.getElementById("revenueToday").textContent =
    `₱${dashboardStats.revenueToday}`;

  document.getElementById("transactionsToday").textContent =
    dashboardStats.transactionsToday;

  document.getElementById("itemsIssuedToday").textContent =
    dashboardStats.itemsIssuedToday;

  document.getElementById("pendingRestock").textContent =
    dashboardStats.pendingRestock;

  // ---------- TRANSACTIONS ----------
  const txContainer = document.getElementById("recentTransactions");
  txContainer.innerHTML = "";

  recentTransactions.forEach(tx => {
    const row = document.createElement("div");
    row.className = "flex justify-between py-2 border-b";

    row.innerHTML = `
      <div>
        <p class="font-medium">${tx.id}</p>
        <p class="text-sm text-gray-500">${tx.patient} · ${tx.time}</p>
      </div>
      <div class="text-right">
        <p class="font-semibold">₱${tx.amount}</p>
        <p class="text-sm text-gray-500">${tx.items} item(s)</p>
      </div>
    `;
    txContainer.appendChild(row);
  });

  // ---------- INVENTORY ALERTS ----------
  const invContainer = document.getElementById("inventoryAlerts");
  invContainer.innerHTML = "";

  inventoryAlerts.forEach(item => {
    const color =
      item.status === "out" ? "text-red-600" : "text-orange-500";

    const row = document.createElement("div");
    row.className = "flex justify-between py-2 border-b";

    row.innerHTML = `
      <div>
        <p class="font-medium">${item.name}</p>
        <p class="text-sm ${color}">
          ${item.status.toUpperCase()} · ${item.remaining}
        </p>
      </div>
    `;
    invContainer.appendChild(row);
  });

  // ---------- TOP ITEMS TODAY ----------
  const topItemsContainer = document.getElementById("topItemsToday");
  topItemsContainer.innerHTML = "";

  topItemsToday.forEach(item => {
    const row = document.createElement("div");
    row.className = "flex justify-between border-b pb-2";

    row.innerHTML = `
      <div>
        <p class="font-medium">${item.name}</p>
        <p class="text-sm text-gray-500">${item.sold} sold</p>
      </div>
      <div class="font-semibold">₱${item.price}</div>
    `;
    topItemsContainer.appendChild(row);
  });
  const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to logout?")) {
    window.location.href = "../login.html";
  }
});


});
