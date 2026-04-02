import { apiFetch, buildQueryString } from "../utils/apiClient.js";
import { printStandardClinicReport } from "../utils/reportPrintTemplate.js";

const API = {
  logs: "/api/owner/disposal",
  details: (id) => `/api/owner/disposal/${id}`,
  approve: (id) => `/api/owner/disposal/${id}/approve`,
  reject: (id) => `/api/owner/disposal/${id}/reject`,
};

const AUTO_REFRESH_MS = 15000;
let disposalAutoRefreshTimer = null;
let disposalRowsSnapshot = [];

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getStatusBadge = (status) => {
  if (status === "Approved") return "bg-green-100 text-green-700";
  if (status === "Disposed") return "bg-slate-900 text-white";
  if (status === "Pending") return "bg-amber-100 text-amber-800";
  if (status === "Rejected") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
};

const showToast = (message, type = "success") => {
  let container = document.getElementById("disposalBinToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "disposalBinToastContainer";
    container.className = "fixed right-8 bottom-12 flex flex-col items-end gap-3 z-[10010]";
    document.body.appendChild(container);
  }
  container.innerHTML = "";
  const toast = document.createElement("div");
  const isError = type === "error";
  toast.className = isError
    ? "bg-white text-red-700 border-4 border-red-600 rounded-md px-4 py-3 shadow-lg max-w-xs transform transition-all duration-300 translate-y-2 opacity-0"
    : "bg-white text-blue-700 border-4 border-blue-600 rounded-md px-4 py-3 shadow-lg max-w-xs transform transition-all duration-300 translate-y-2 opacity-0";
  toast.innerHTML = `<div class="text-sm font-medium">${escapeHtml(message)}</div>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove("translate-y-2", "opacity-0"));
  setTimeout(() => { toast.classList.add("translate-y-2", "opacity-0"); setTimeout(() => toast.remove(), 300); }, 3500);
};

const showApprovalModal = (row) => {
  const existing = document.getElementById("disposalApprovalModal");
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "disposalApprovalModal";
  wrapper.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[10005]";
  wrapper.innerHTML = `
    <div class="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
      <button id="closeDisposalApprovalModal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
      <h3 class="text-lg font-semibold text-slate-900 mb-1">Approve Disposal Request</h3>
      <p class="text-sm text-slate-600 mb-4">Review and confirm approval of this disposal request.</p>
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1 text-sm mb-4">
        <p><span class="font-medium text-slate-900">Item:</span> ${escapeHtml(row.itemName)}</p>
        <p><span class="font-medium text-slate-900">Batch:</span> ${escapeHtml(row.batchNumber)}</p>
        <p><span class="font-medium text-slate-900">Quantity to Dispose:</span> ${escapeHtml(row.quantityDisposed)}</p>
        <p><span class="font-medium text-slate-900">Reason:</span> ${escapeHtml(row.reason)}</p>
        <p><span class="font-medium text-slate-900">Requested By:</span> ${escapeHtml(row.requestedBy?.name || "—")}</p>
      </div>
      <div class="mb-4">
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-2">Enter Owner Password to Approve</label>
        <input id="disposalApprovalPasswordInput" type="password" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Owner password" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button id="cancelDisposalApprovalBtn" class="w-full border border-slate-300 py-2 rounded-lg bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button id="confirmDisposalApprovalBtn" class="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700">Approve Disposal</button>
      </div>
    </div>`;

  document.body.appendChild(wrapper);

  const hide = () => {
    wrapper.remove();
  };

  wrapper.addEventListener("click", (e) => { if (e.target === wrapper) hide(); });
  wrapper.querySelector("#closeDisposalApprovalModal")?.addEventListener("click", hide);
  wrapper.querySelector("#cancelDisposalApprovalBtn")?.addEventListener("click", hide);
  wrapper.querySelector("#confirmDisposalApprovalBtn")?.addEventListener("click", async () => {
    const adminPassword = wrapper.querySelector("#disposalApprovalPasswordInput")?.value || "";
    if (!adminPassword.trim()) {
      showToast("Owner password is required", "error");
      return;
    }
    try {
      await apiFetch(API.approve(row.id), {
        method: "PATCH",
        body: JSON.stringify({ adminPassword }),
      });
      showToast("Disposal request approved and completed", "success");
      hide();
      await loadDisposalLogs();
    } catch (err) {
      showToast(err.message || "Approval failed", "error");
    }
  });
};

const getFilters = () => ({
  startDate: document.getElementById("disposalStartDate")?.value || "",
  endDate: document.getElementById("disposalEndDate")?.value || "",
  itemName: document.getElementById("disposalItemName")?.value || "",
  reason: document.getElementById("disposalReasonFilter")?.value || "",
  status: document.getElementById("disposalStatusFilter")?.value || "",
});

const getPrintFilterMap = (filters = getFilters()) => {
  const formattedDateRange = filters.startDate || filters.endDate
    ? `${filters.startDate ? formatDate(filters.startDate) : "Any"} to ${filters.endDate ? formatDate(filters.endDate) : "Any"}`
    : "All Dates";

  return {
    "Date Range": formattedDateRange,
    "Item Name": filters.itemName || "",
    Reason: filters.reason || "",
    Status: filters.status || "",
  };
};

const renderPrintTable = (rows) => {
  const body = document.getElementById("disposalPrintTableBody");
  if (!body) {
    return;
  }

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10" class="px-2 py-2 text-center">No disposal records found for the selected filters.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td class="ibms-report-col-reference">${escapeHtml(row.referenceId)}</td>
        <td class="ibms-report-col-date">${escapeHtml(formatDate(row.dateDisposed || row.dateApproved || row.dateRequested))}</td>
        <td class="ibms-report-col-item">${escapeHtml(row.itemName)}</td>
        <td class="ibms-report-col-batch">${escapeHtml(row.batchNumber)}</td>
        <td class="ibms-report-col-expiration">${escapeHtml(formatDate(row.expirationDate))}</td>
        <td class="ibms-report-col-quantity">${escapeHtml(row.quantityDisposed)}</td>
        <td class="ibms-report-col-reason">${escapeHtml(row.reason)}</td>
        <td class="ibms-report-col-requested">${escapeHtml(row.requestedBy?.name || "-")}</td>
        <td class="ibms-report-col-approved">${escapeHtml(row.approvedBy?.name || "-")}</td>
        <td class="ibms-report-col-status">${escapeHtml(row.status)}</td>
      </tr>`
    )
    .join("");
};

const updatePrintState = (rows) => {
  const printBtn = document.getElementById("disposalPrintBtn");
  const safeRows = Array.isArray(rows) ? rows : [];
  const hasRows = safeRows.length > 0;

  if (printBtn) {
    printBtn.disabled = !hasRows;
    printBtn.title = hasRows ? "Print current filtered results" : "No records to print";
  }
};

const printDisposalTable = () => {
  if (!disposalRowsSnapshot.length) {
    showToast("No records to print", "error");
    return;
  }

  renderPrintTable(disposalRowsSnapshot);

  printStandardClinicReport({
    printRootId: "disposalReportPrintLayout",
    reportTitle: "Disposal Records Report",
    moduleName: "Disposal Records Module",
    clinicName: "ZCMMF Clinic",
    systemName: "IBMS",
    logoUrl: "../../assets/zealLogo.png",
    filters: getPrintFilterMap(),
    recordCount: disposalRowsSnapshot.length,
    columnCount: 10,
    orientation: "landscape",
    onBeforePrint: () => {
      renderPrintTable(disposalRowsSnapshot);
    },
  });
};

const renderSummary = (rows) => {
  const pendingCount = rows.filter((row) => row.status === "Pending").length;
  const disposedRows = rows.filter((row) => row.status === "Disposed" || row.status === "Approved");
  const disposedCount = disposedRows.length;
  const disposedUnits = disposedRows.reduce((sum, row) => sum + Number(row.quantityDisposed || 0), 0);

  document.getElementById("disposalPendingCount").textContent = String(pendingCount);
  document.getElementById("disposalDisposedCount").textContent = String(disposedCount);
  document.getElementById("disposalUnitsCount").textContent = String(disposedUnits);
};

const renderDetails = (record) => {
  const body = document.getElementById("disposalDetailsBody");
  if (!body) return;

  const fields = [
    ["Item Name", record.itemName],
    ["Generic Name", record.genericName || "—"],
    ["Batch Number", record.batchNumber],
    ["Expiration Date", formatDate(record.expirationDate)],
    ["Quantity Disposed", record.quantityDisposed],
    ["Reason", record.reason],
    ["Remarks", record.remarks || "—"],
    ["Requested By", record.requestedBy?.name || "—"],
    ["Approved By", record.approvedBy?.name || "—"],
    ["Disposal Method", record.disposalMethod || "—"],
    ["Reference ID", record.referenceId],
    ["Date Requested", formatDateTime(record.dateRequested)],
    ["Date Approved", formatDateTime(record.dateApproved)],
    ["Date Disposed", formatDateTime(record.dateDisposed)],
    ["Status", record.status],
  ];

  body.innerHTML = fields
    .map(
      ([label, value]) => `
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">${escapeHtml(label)}</p>
          <p class="mt-1 break-words text-sm font-medium text-slate-900">${escapeHtml(value)}</p>
        </div>`
    )
    .join("");
};

const openDetails = async (id) => {
  const modal = document.getElementById("disposalDetailsModal");
  try {
    const response = await apiFetch(API.details(id));
    renderDetails(response.data);
    modal?.classList.remove("hidden");
    modal?.classList.add("flex");
  } catch (error) {
    console.error("Failed to load disposal details", error);
  }
};

const renderTable = (rows) => {
  const body = document.getElementById("disposalTableBody");
  const resultCount = document.getElementById("disposalResultCount");
  if (!body) return;

  disposalRowsSnapshot = Array.isArray(rows) ? rows : [];
  resultCount.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
  updatePrintState(disposalRowsSnapshot);

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="11" class="px-4 py-8 text-center text-sm text-slate-500">No disposal records found for the selected filters.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => {
        const isPending = row.status === "Pending";
        const actionHtml = isPending
          ? `<div class="flex gap-2">
               <button class="disposal-approve-btn rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100" data-id="${escapeHtml(row.id)}">Approve</button>
               <button class="disposal-reject-btn rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100" data-id="${escapeHtml(row.id)}">Reject</button>
             </div>`
          : `<button class="disposal-view-details-btn rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" data-id="${escapeHtml(row.id)}">View Details</button>`;

        return `
          <tr class="hover:bg-slate-50">
            <td class="px-4 py-3 font-mono text-xs text-slate-700">${escapeHtml(row.referenceId)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(formatDate(row.dateDisposed || row.dateApproved || row.dateRequested))}</td>
            <td class="px-4 py-3 font-medium text-slate-900">${escapeHtml(row.itemName)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.batchNumber)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(formatDate(row.expirationDate))}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.quantityDisposed)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.reason)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.requestedBy?.name || "—")}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.approvedBy?.name || "—")}</td>
            <td class="px-4 py-3"><span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(row.status)}">${escapeHtml(row.status)}</span></td>
            <td class="px-4 py-3">${actionHtml}</td>
          </tr>`;
      }
    )
    .join("");

  body.querySelectorAll(".disposal-view-details-btn").forEach((button) => {
    button.addEventListener("click", () => openDetails(button.dataset.id));
  });

  body.querySelectorAll(".disposal-approve-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const row = rows.find((r) => String(r.id) === String(button.dataset.id));
      if (row) showApprovalModal(row);
    });
  });

  body.querySelectorAll(".disposal-reject-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to reject this disposal request? The batch will be restored to active status.")) return;
      try {
        await apiFetch(API.reject(button.dataset.id), { method: "PATCH" });
        showToast("Disposal request rejected", "success");
        await loadDisposalLogs();
      } catch (err) {
        showToast(err.message || "Failed to reject request", "error");
      }
    });
  });
};

async function loadDisposalLogs() {
  const response = await apiFetch(`${API.logs}${buildQueryString(getFilters())}`);
  const rows = Array.isArray(response?.data) ? response.data : [];
  renderSummary(rows);
  renderTable(rows);
}

export async function initOwnerDisposalBin() {
  const auth = window.IBMSAuth;
  if (auth && !auth.isSessionValid("owner")) {
    auth.clearAuthData();
    auth.redirectToLogin(true);
    return;
  }

  if (disposalAutoRefreshTimer) {
    clearInterval(disposalAutoRefreshTimer);
    disposalAutoRefreshTimer = null;
  }

  document.getElementById("disposalApplyFiltersBtn")?.addEventListener("click", loadDisposalLogs);
  document.getElementById("disposalPrintBtn")?.addEventListener("click", printDisposalTable);
  document.getElementById("disposalResetFiltersBtn")?.addEventListener("click", async () => {
    document.getElementById("disposalStartDate").value = "";
    document.getElementById("disposalEndDate").value = "";
    document.getElementById("disposalItemName").value = "";
    document.getElementById("disposalReasonFilter").value = "";
    document.getElementById("disposalStatusFilter").value = "";
    await loadDisposalLogs();
  });

  document.getElementById("closeDisposalDetailsModal")?.addEventListener("click", () => {
    document.getElementById("disposalDetailsModal")?.classList.add("hidden");
    document.getElementById("disposalDetailsModal")?.classList.remove("flex");
  });
  document.getElementById("disposalDetailsModal")?.addEventListener("click", (event) => {
    if (event.target.id === "disposalDetailsModal") {
      document.getElementById("disposalDetailsModal")?.classList.add("hidden");
      document.getElementById("disposalDetailsModal")?.classList.remove("flex");
    }
  });

  await loadDisposalLogs();
  updatePrintState(disposalRowsSnapshot);

  disposalAutoRefreshTimer = setInterval(() => {
    loadDisposalLogs();
  }, AUTO_REFRESH_MS);
}