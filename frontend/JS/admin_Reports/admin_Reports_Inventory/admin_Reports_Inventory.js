import { apiFetch } from "../../utils/apiClient.js";

const Charts = { status: null, topProducts: null, usage: null };
const State = {
  currentPeriod: "Last Week",
  reportData: null,
};
const DOM = {};

const emptyData = () => ({
  charts: {
    status: {
      labels: ["Medications", "Medical Supplies", "Diagnostic Kits", "Vaccines"],
      datasets: {
        inStock: [0, 0, 0, 0],
        lowStock: [0, 0, 0, 0],
        outOfStock: [0, 0, 0, 0],
      },
    },
    topProducts: { labels: [], data: [] },
    usageTrend: {
      labels: [],
      datasets: {
        medications: [],
        vaccines: [],
        medicalSupplies: [],
        diagnosticKits: [],
      },
    },
  },
  stats: {
    totalItems: 0,
    inStockItems: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    totalItemsTrend: "up",
    totalItemsTrendPercent: "0.0%",
    inStockTrend: "up",
    inStockTrendPercent: "0.0%",
    lowStockTrend: "up",
    lowStockTrendPercent: "0.0%",
    outOfStockTrend: "up",
    outOfStockTrendPercent: "0.0%",
  },
});

const getSelectedPeriod = () => {
  const selector = document.getElementById("period-select");
  return selector?.value || State.currentPeriod || "Last Week";
};

const fetchInventoryReport = async (period) => {
  const payload = await apiFetch(`/api/owner/reports/inventory?period=${encodeURIComponent(period)}`);
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
}

export async function refreshData(period) {
  State.currentPeriod = period || getSelectedPeriod();

  try {
    State.reportData = await fetchInventoryReport(State.currentPeriod);
  } catch (error) {
    console.error("Failed to fetch inventory report:", error);
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
}

function initializeView() {
  initCharts();
  updateStats();
}

function getInventoryStatusChartData() {
  const statusData = (State.reportData || emptyData()).charts.status;
  return {
    labels: statusData.labels,
    datasets: [
      {
        label: "In Stock",
        data: statusData.datasets.inStock,
        backgroundColor: "#1e3a8a",
        borderRadius: 4,
      },
      {
        label: "Low Stock",
        data: statusData.datasets.lowStock,
        backgroundColor: "#f59e0b",
        borderRadius: 4,
      },
      {
        label: "Out of Stock",
        data: statusData.datasets.outOfStock,
        backgroundColor: "#ef4444",
        borderRadius: 4,
      },
    ],
  };
}

function getTopProductsChartData() {
  const topProducts = (State.reportData || emptyData()).charts.topProducts;
  return {
    labels: topProducts.labels,
    datasets: [
      {
        label: "Units Dispensed",
        data: topProducts.data,
        backgroundColor: "#1e3a8a",
        borderRadius: 4,
      },
    ],
  };
}

function getUsageTrendChartData() {
  const usageTrend = (State.reportData || emptyData()).charts.usageTrend;
  return {
    labels: usageTrend.labels,
    datasets: [
      {
        label: "Medications",
        data: usageTrend.datasets.medications,
        borderColor: "#1e3a8a",
        backgroundColor: "rgba(30, 58, 138, 0.1)",
        borderWidth: 2,
        tension: 0.4,
        fill: true,
      },
      {
        label: "Vaccines",
        data: usageTrend.datasets.vaccines,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderWidth: 2,
        tension: 0.4,
        fill: true,
      },
      {
        label: "Medical Supplies",
        data: usageTrend.datasets.medicalSupplies,
        borderColor: "#60a5fa",
        backgroundColor: "rgba(96, 165, 250, 0.1)",
        borderWidth: 2,
        tension: 0.4,
        fill: true,
      },
      {
        label: "Diagnostic Kits",
        data: usageTrend.datasets.diagnosticKits,
        borderColor: "#93c5fd",
        backgroundColor: "rgba(147, 197, 253, 0.1)",
        borderWidth: 2,
        tension: 0.4,
        fill: true,
      },
    ],
  };
}

function initCharts() {
  cleanup();

  const statusCtx = document.getElementById("inventoryStatusChart");
  if (statusCtx) {
    Charts.status = new Chart(statusCtx, {
      type: "bar",
      data: getInventoryStatusChartData(),
      options: getStatusOptions(),
    });
  }

  const topCtx = document.getElementById("topProductsChart");
  if (topCtx) {
    Charts.topProducts = new Chart(topCtx, {
      type: "bar",
      data: getTopProductsChartData(),
      options: getTopProductsOptions(),
    });
  }

  const usageCtx = document.getElementById("usageTrendChart");
  if (usageCtx) {
    Charts.usage = new Chart(usageCtx, {
      type: "line",
      data: getUsageTrendChartData(),
      options: getUsageOptions(),
    });
  }
}

function getStatusOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { usePointStyle: true, padding: 15, font: { size: 11 } } },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        title: { display: true, text: "Number of Items" },
        grid: { color: "#f3f4f6" },
      },
    },
  };
}

function getTopProductsOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        title: { display: true, text: "Units Dispensed" },
        grid: { color: "#f3f4f6" },
      },
    },
  };
}

function getUsageOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom", labels: { usePointStyle: true, padding: 15, font: { size: 10 } } },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        title: { display: true, text: "Usage Count" },
        grid: { color: "#f3f4f6" },
      },
    },
  };
}

function updateStats() {
  if (!DOM.stats) return;

  const stats = (State.reportData || emptyData()).stats;
  const card = (title, value, trendDirection, trendPercent, color = "slate") => `
    <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-md hover:shadow-lg transition-shadow duration-200">
      <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">${title}</p>
      <p class="text-3xl font-bold text-${color}-800">${Number(value || 0).toLocaleString()}</p>
      <p class="flex items-center gap-1 mt-1">
        <i class="fas fa-arrow-${trendDirection} text-xs text-${trendDirection === "up" ? "green" : "red"}-500"></i>
        <span class="text-xs text-${trendDirection === "up" ? "green" : "red"}-500">${trendDirection === "up" ? "+" : ""}${trendPercent} from last period</span>
      </p>
    </div>`;

  DOM.stats.innerHTML =
    card("Total Items", stats.totalItems, stats.totalItemsTrend, stats.totalItemsTrendPercent) +
    card("In Stock", stats.inStockItems, stats.inStockTrend, stats.inStockTrendPercent, "green") +
    card("Low Stock", stats.lowStockItems, stats.lowStockTrend, stats.lowStockTrendPercent, "amber") +
    card("Out of Stock", stats.outOfStockItems, stats.outOfStockTrend, stats.outOfStockTrendPercent, "red");
}
