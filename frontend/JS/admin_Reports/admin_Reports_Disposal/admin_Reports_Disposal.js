import { apiFetch, buildQueryString } from "../../utils/apiClient.js";

const API = {
  report: "/api/owner/disposal/report",
};

let reportRows = [];

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

const getFilters = () => ({
  startDate: document.getElementById("disposalReportStartDate")?.value || "",
  endDate: document.getElementById("disposalReportEndDate")?.value || "",
  itemName: document.getElementById("disposalReportItemName")?.value || "",
  reason: document.getElementById("disposalReportReason")?.value || "",
  status: "Disposed",
});

const renderStats = (rows) => {
  const statsEl = document.getElementById("disposalReportStats");
  const totalUnits = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const uniqueItems = new Set(rows.map((row) => row.item)).size;

  statsEl.innerHTML = `
    <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-xs uppercase tracking-wide text-slate-500">Disposed Rows</p>
      <p class="mt-2 text-3xl font-semibold text-slate-900">${rows.length}</p>
    </article>
    <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-xs uppercase tracking-wide text-slate-500">Units Disposed</p>
      <p class="mt-2 text-3xl font-semibold text-rose-700">${totalUnits}</p>
    </article>
    <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-xs uppercase tracking-wide text-slate-500">Unique Items</p>
      <p class="mt-2 text-3xl font-semibold text-slate-900">${uniqueItems}</p>
    </article>`;
};

const renderTable = (rows) => {
  const body = document.getElementById("disposalReportTableBody");
  document.getElementById("disposalReportCount").textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-slate-500">No disposed records found for the selected filters.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr class="hover:bg-slate-50">
      <td class="px-4 py-3 text-slate-700">${escapeHtml(formatDate(row.date))}</td>
      <td class="px-4 py-3 font-medium text-slate-900">${escapeHtml(row.item)}</td>
      <td class="px-4 py-3 text-slate-700">${escapeHtml(row.batch)}</td>
      <td class="px-4 py-3 text-slate-700">${escapeHtml(row.quantity)}</td>
      <td class="px-4 py-3 text-slate-700">${escapeHtml(row.reason)}</td>
      <td class="px-4 py-3 text-slate-700">${escapeHtml(row.approvedBy)}</td>
      <td class="px-4 py-3 font-mono text-xs text-slate-700">${escapeHtml(row.referenceId)}</td>
    </tr>`).join("");
};

async function loadReport() {
  const response = await apiFetch(`${API.report}${buildQueryString(getFilters())}`);
  reportRows = Array.isArray(response?.data) ? response.data : [];
  renderStats(reportRows);
  renderTable(reportRows);
}

const downloadBlob = (content, fileName, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function exportReport(format = "csv") {
  if (!reportRows.length) return;

  if (String(format).toLowerCase() === "pdf") {
    const printable = `
      <html>
        <head><title>Disposal Report</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h1>Disposal Report</h1>
          <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; width: 100%; font-size: 12px;">
            <thead>
              <tr>
                <th>Date</th><th>Item</th><th>Batch</th><th>Quantity</th><th>Reason</th><th>Approved By</th><th>Reference ID</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows.map((row) => `<tr><td>${escapeHtml(formatDate(row.date))}</td><td>${escapeHtml(row.item)}</td><td>${escapeHtml(row.batch)}</td><td>${escapeHtml(row.quantity)}</td><td>${escapeHtml(row.reason)}</td><td>${escapeHtml(row.approvedBy)}</td><td>${escapeHtml(row.referenceId)}</td></tr>`).join("")}
            </tbody>
          </table>
        </body>
      </html>`;
    const printWindow = window.open("", "_blank", "width=960,height=720");
    printWindow.document.write(printable);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return;
  }

  const csv = [
    ["Date", "Item", "Batch", "Quantity", "Reason", "Approved By", "Reference ID"].join(","),
    ...reportRows.map((row) => [
      formatDate(row.date),
      row.item,
      row.batch,
      row.quantity,
      row.reason,
      row.approvedBy,
      row.referenceId,
    ].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")),
  ].join("\n");

  downloadBlob(csv, "disposal-report.csv", "text/csv;charset=utf-8");
}

export function cleanup() {
  reportRows = [];
}

export async function initReports() {
  const auth = window.IBMSAuth;
  if (auth && !auth.isSessionValid("owner")) {
    auth.clearAuthData();
    auth.redirectToLogin(true);
    return;
  }

  document.getElementById("disposalReportApplyBtn")?.addEventListener("click", loadReport);
  document.getElementById("disposalReportResetBtn")?.addEventListener("click", async () => {
    document.getElementById("disposalReportStartDate").value = "";
    document.getElementById("disposalReportEndDate").value = "";
    document.getElementById("disposalReportItemName").value = "";
    document.getElementById("disposalReportReason").value = "";
    await loadReport();
  });

  await loadReport();
}