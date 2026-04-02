import { apiFetch } from "../../utils/apiClient.js";

const Charts = { collection: null, discount: null };
const State = {
  currentPeriod: "Last Week",
  currentSort: "",
  currentFilter: "All Types",
  searchQuery: "",
  reportData: null,
};
const DOM = {};

const emptyData = () => ({
  charts: {
    collectionTrend: { labels: [], gross: [], net: [] },
    discountBreakdown: { statutory: 0, senior: 0, pwd: 0 },
  },
  stats: {
    grossBilled: 0,
    totalDiscounts: 0,
    netCollection: 0,
    avgTransaction: 0,
    grossBilledTrend: "up",
    grossBilledTrendPercent: "0.0%",
    totalDiscountsTrend: "up",
    totalDiscountsTrendPercent: "0.0%",
    netCollectionTrend: "up",
    netCollectionTrendPercent: "0.0%",
    avgTransactionTrend: "up",
    avgTransactionTrendPercent: "0.0%",
  },
  cashierRevenue: [],
  transactions: [],
});

const getSelectedPeriod = () => {
  const selector = document.getElementById("period-select");
  return selector?.value || State.currentPeriod || "Last Week";
};

const fetchBillingReport = async (period) => {
  const payload = await apiFetch(`/api/owner/reports/billing?period=${encodeURIComponent(period)}`);
  return payload || emptyData();
};

export async function initReports() {
  const auth = window.IBMSAuth;
  if (auth && !auth.isSessionValid("owner")) {
    auth.clearAuthData();
    auth.redirectToLogin(true);
    return;
  }

  cacheDOM();
  if (typeof Chart === "undefined") return;

  await refreshData(getSelectedPeriod());
  setupListeners();
}

export async function refreshData(period) {
  State.currentPeriod = period || getSelectedPeriod();

  try {
    State.reportData = await fetchBillingReport(State.currentPeriod);
  } catch (error) {
    console.error("Failed to fetch billing report data:", error);
    State.reportData = emptyData();
  }

  initializeView();
}

export function cleanup() {
  Object.keys(Charts).forEach((key) => {
    if (Charts[key]) {
      Charts[key].destroy();
      Charts[key] = null;
    }
  });
}

function cacheDOM() {
  DOM.content = document.getElementById("contentArea");
  DOM.stats = document.getElementById("statsCardsContainer");
  DOM.cashierTable = document.getElementById("cashier-table-body");
  DOM.transactionTable = document.getElementById("transaction-table-body");
  DOM.resultsCount = document.getElementById("results-count");

  DOM.sortSelect = document.getElementById("sort-select");
  DOM.filterSelect = document.getElementById("filter-select");
  DOM.searchInput = document.getElementById("search-input");
}

function initializeView() {
  initCharts();
  updateStats();
  populateCashierTable();
  populateTransactionTable();
}

function getCollectionTrendChartData() {
  const data = (State.reportData || emptyData()).charts.collectionTrend;
  return {
    labels: data.labels,
    datasets: [
      {
        label: "Gross Billed",
        data: data.gross,
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
      },
      {
        label: "Net Collection",
        data: data.net,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
      },
    ],
  };
}

function getDiscountBreakdownChartData() {
  const breakdown = (State.reportData || emptyData()).charts.discountBreakdown;
  return {
    labels: ["Statutory", "Senior Citizen", "PWD"],
    datasets: [
      {
        data: [breakdown.statutory, breakdown.senior, breakdown.pwd],
        backgroundColor: ["#065f46", "#34d399", "#f59e0b"],
        borderWidth: 0,
      },
    ],
  };
}

function initCharts() {
  cleanup();

  const collectionCanvas = document.getElementById("collectionTrendChart");
  if (collectionCanvas) {
    Charts.collection = new Chart(collectionCanvas, {
      type: "line",
      data: getCollectionTrendChartData(),
      options: getCollectionOptions(),
    });
  }

  const discountCanvas = document.getElementById("discountChart");
  if (discountCanvas) {
    Charts.discount = new Chart(discountCanvas, {
      type: "pie",
      data: getDiscountBreakdownChartData(),
      options: getDiscountOptions(),
    });
  }
}

function getCollectionOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: "Collection Trend Analysis",
        font: { size: 16, weight: "bold" },
        padding: { top: 10, bottom: 20 },
      },
      legend: { position: "top", labels: { usePointStyle: true, padding: 20, font: { size: 12 } } },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: PHP ${Number(context.parsed.y || 0).toLocaleString("en-PH")}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (value) => `PHP ${Number(value).toLocaleString("en-PH")}` },
        grid: { color: "#f3f4f6" },
      },
      x: { grid: { display: false } },
    },
  };
}

function getDiscountOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: "Discount Breakdown",
        font: { size: 16, weight: "bold" },
        padding: { top: 10, bottom: 20 },
      },
      legend: { position: "bottom", labels: { usePointStyle: true, padding: 20, font: { size: 12 } } },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: PHP ${Number(context.parsed || 0).toLocaleString("en-PH")}`,
        },
      },
    },
  };
}

function updateStats() {
  if (!DOM.stats) return;

  const stats = (State.reportData || emptyData()).stats;
  const card = (title, value, trendDirection, trendPercent, color) => `
    <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-md hover:shadow-lg transition-shadow duration-200">
      <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">${title}</p>
      <p class="text-3xl font-bold text-${color}-600">${formatCurrency(value)}</p>
      <p class="flex items-center gap-1 mt-1">
        <i class="fas fa-arrow-${trendDirection} text-xs text-${trendDirection === "up" ? "green" : "red"}-500"></i>
        <span class="text-xs text-${trendDirection === "up" ? "green" : "red"}-500">${trendDirection === "up" ? "+" : ""}${trendPercent} from last period</span>
      </p>
    </div>`;

  DOM.stats.innerHTML =
    card("Gross Billed", stats.grossBilled, stats.grossBilledTrend, stats.grossBilledTrendPercent, "gray") +
    card("Total Discounts", stats.totalDiscounts, stats.totalDiscountsTrend, stats.totalDiscountsTrendPercent, "amber") +
    card("Net Collection", stats.netCollection, stats.netCollectionTrend, stats.netCollectionTrendPercent, "emerald") +
    card("Average Transaction", stats.avgTransaction, stats.avgTransactionTrend, stats.avgTransactionTrendPercent, "blue");
}

function populateCashierTable() {
  if (!DOM.cashierTable) return;

  const data = (State.reportData || emptyData()).cashierRevenue;
  const fragment = document.createDocumentFragment();

  data.forEach((cashier) => {
    const row = document.createElement("tr");
    row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
    row.innerHTML = `
      <td class="py-3 px-2 text-sm text-gray-700 font-medium">${cashier.staff}</td>
      <td class="py-3 px-2 text-sm text-gray-700 text-right font-medium">${formatCurrency(cashier.netCollected)}</td>
      <td class="py-3 px-2 text-sm text-gray-500 text-right">${Number(cashier.transactions || 0)}</td>
    `;
    fragment.appendChild(row);
  });

  DOM.cashierTable.innerHTML = "";
  DOM.cashierTable.appendChild(fragment);
}

function getFilteredAndSearchedTransactions() {
  const allTransactions = [...((State.reportData || emptyData()).transactions || [])];
  let data = allTransactions;

  if (State.searchQuery.trim()) {
    const query = State.searchQuery.toLowerCase();
    data = data.filter((tx) =>
      [tx.orNumber, tx.patientId, tx.staff, tx.dateTime].some((field) =>
        String(field || "").toLowerCase().includes(query)
      )
    );
  }

  if (State.currentFilter !== "All Types") {
    switch (State.currentFilter) {
      case "Paid":
        data = data.filter((item) => item.status === "Paid");
        break;
      case "Voided":
        data = data.filter((item) => item.status === "Voided");
        break;
      case "Senior Discount":
        data = data.filter((item) => item.discount?.type === "Senior");
        break;
      case "PWD Discount":
        data = data.filter((item) => item.discount?.type === "PWD");
        break;
      default:
        break;
    }
  }

  if (State.currentSort) {
    switch (State.currentSort) {
      case "Highest Amount":
        data.sort((a, b) => Number(b.netCollected || 0) - Number(a.netCollected || 0));
        break;
      case "Lowest Amount":
        data.sort((a, b) => Number(a.netCollected || 0) - Number(b.netCollected || 0));
        break;
      case "A-Z":
        data.sort((a, b) => String(a.orNumber || "").localeCompare(String(b.orNumber || "")));
        break;
      case "Latest":
        data.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
        break;
      default:
        break;
    }
  }

  return data;
}

function populateTransactionTable() {
  if (!DOM.transactionTable) return;

  const filtered = getFilteredAndSearchedTransactions();
  const all = (State.reportData || emptyData()).transactions || [];

  if (DOM.resultsCount) {
    DOM.resultsCount.textContent =
      filtered.length === all.length
        ? `Showing all ${all.length} transactions`
        : `Showing ${filtered.length} of ${all.length} transactions`;
  }

  if (filtered.length === 0) {
    DOM.transactionTable.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-8 text-gray-500">
          <i class="fas fa-search mb-2 text-gray-300 text-2xl"></i>
          <p>No transactions found matching your criteria</p>
        </td>
      </tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((tx) => {
    const statusClass = tx.status === "Paid" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";
    const discount = tx.discount || { amount: 0, type: "None" };
    const discountText =
      Number(discount.amount || 0) > 0
        ? `${formatCurrency(discount.amount)} (${discount.type})`
        : `${formatCurrency(0)} (None)`;

    const row = document.createElement("tr");
    row.className = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
    row.innerHTML = `
      <td class="py-3">${tx.dateTime || "-"}</td>
      <td class="py-3 font-medium">${tx.orNumber || "-"}</td>
      <td class="py-3">${tx.patientId || "-"}</td>
      <td class="py-3 text-right font-medium">${formatCurrency(tx.gross || 0)}</td>
      <td class="py-3 text-right text-sm">${discountText}</td>
      <td class="py-3 text-right font-semibold">${formatCurrency(tx.netCollected || 0)}</td>
      <td class="py-3 text-center">
        <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusClass}">${tx.status || "Paid"}</span>
      </td>
      <td class="py-3 text-sm">${tx.staff || "Staff"}</td>
    `;
    fragment.appendChild(row);
  });

  DOM.transactionTable.innerHTML = "";
  DOM.transactionTable.appendChild(fragment);
}

function setupListeners() {
  if (DOM.searchInput) {
    let debounceTimer;
    DOM.searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        State.searchQuery = e.target.value;
        populateTransactionTable();
      }, 300);
    });
  }

  if (DOM.sortSelect) {
    DOM.sortSelect.addEventListener("change", (e) => {
      State.currentSort = e.target.value === "Sort By" ? "" : e.target.value;
      populateTransactionTable();
    });
  }

  if (DOM.filterSelect) {
    DOM.filterSelect.addEventListener("change", (e) => {
      State.currentFilter = e.target.value;
      populateTransactionTable();
    });
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(amount || 0));
}
