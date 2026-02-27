import { ownerStockLogs, ownerClinicInfo } from "./OwnerActivitylogsData/OwnerStocklogsData.js";

const formatDateTime = (dateTime) => {
	const date = new Date(dateTime);
	return date.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const escapeHtml = (value) =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const movementBadgeClass = {
	SALE: "bg-rose-50 text-rose-700 border border-rose-200",
	RESTOCK: "bg-emerald-50 text-emerald-700 border border-emerald-200",
	ADJUST: "bg-amber-100 text-amber-900 border-2 border-amber-400",
};

const qtyClass = (qtyChange) =>
	qtyChange >= 0
		? "text-emerald-700 font-semibold"
		: "text-rose-700 font-semibold";

export function initOwnerActivitylogs() {
	const totalSaleEl = document.getElementById("summaryTotalSale");
	const totalRestockEl = document.getElementById("summaryTotalRestock");
	const totalAdjustEl = document.getElementById("summaryTotalAdjust");
	const systemLabelEl = document.getElementById("systemGeneratedLabel");

	const startDateInput = document.getElementById("filterStartDate");
	const endDateInput = document.getElementById("filterEndDate");
	const productFilterEl = document.getElementById("filterProduct");
	const movementFilterEl = document.getElementById("filterMovementType");
	const performedByFilterEl = document.getElementById("filterPerformedBy");
	const referenceFilterEl = document.getElementById("filterReferenceId");
	const resetFiltersEl = document.getElementById("resetFilters");

	const tableBody = document.getElementById("stockLogsTableBody");
	const resultCountEl = document.getElementById("resultCount");

	if (!tableBody) {
		return;
	}

	if (systemLabelEl) {
		systemLabelEl.textContent = `${ownerClinicInfo.generatedBy} • Logs are system-generated and cannot be edited or deleted.`;
	}

	const uniqueProducts = [...new Set(ownerStockLogs.map((log) => log.productName))].sort();
	const uniquePerformedBy = [...new Set(ownerStockLogs.map((log) => log.performedBy))].sort();

	uniqueProducts.forEach((product) => {
		const option = document.createElement("option");
		option.value = product;
		option.textContent = product;
		productFilterEl?.append(option);
	});

	uniquePerformedBy.forEach((person) => {
		const option = document.createElement("option");
		option.value = person;
		option.textContent = person;
		performedByFilterEl?.append(option);
	});

	const renderSummary = (logs) => {
		const saleTotal = logs
			.filter((log) => log.movementType === "SALE")
			.reduce((sum, log) => sum + Math.abs(Number(log.qtyChange)), 0);

		const restockTotal = logs
			.filter((log) => log.movementType === "RESTOCK")
			.reduce((sum, log) => sum + Number(log.qtyChange), 0);

		const adjustTotal = logs
			.filter((log) => log.movementType === "ADJUST")
			.reduce((sum, log) => sum + Math.abs(Number(log.qtyChange)), 0);

		if (totalSaleEl) totalSaleEl.textContent = saleTotal.toString();
		if (totalRestockEl) totalRestockEl.textContent = restockTotal.toString();
		if (totalAdjustEl) totalAdjustEl.textContent = adjustTotal.toString();
	};

	const renderTable = (logs) => {
		tableBody.innerHTML = "";

		if (!logs.length) {
			tableBody.innerHTML = `
				<tr>
					<td colspan="8" class="px-4 py-8 text-center text-sm text-slate-500">No stock log records found for the selected filters.</td>
				</tr>
			`;
			if (resultCountEl) resultCountEl.textContent = "0 log(s)";
			return;
		}

		logs.forEach((log) => {
			const row = document.createElement("tr");
			row.className = "border-b border-slate-100 hover:bg-slate-50";

			const isAdjust = log.movementType === "ADJUST";
			const qtyText = `${log.qtyChange > 0 ? "+" : ""}${log.qtyChange}`;

			row.innerHTML = `
				<td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">${escapeHtml(formatDateTime(log.dateTime))}</td>
				<td class="px-4 py-3 text-sm font-medium text-slate-900">${escapeHtml(log.productName)}</td>
				<td class="px-4 py-3 text-sm">
					<span
						class="inline-flex cursor-default select-none items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${movementBadgeClass[log.movementType]}"
						title="Manual stock adjustment performed by the owner to correct inventory discrepancies."
					>
						${escapeHtml(log.movementType)}${isAdjust ? " " : ""}
					</span>
					${
						isAdjust
							? '<span class="mt-1 inline-flex cursor-default select-none items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600" title="Manual stock adjustment performed by the owner to correct inventory discrepancies.">Manual Correction</span>'
							: ""
					}
				</td>
				<td class="px-4 py-3 text-sm ${qtyClass(log.qtyChange)}">${qtyText}</td>
				<td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(log.beforeQty)}</td>
				<td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(log.afterQty)}</td>
				<td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(log.performedBy)}</td>
				<td class="px-4 py-3 text-sm font-mono text-slate-700">${escapeHtml(log.referenceId)}</td>
			`;

			tableBody.appendChild(row);
		});

		if (resultCountEl) resultCountEl.textContent = `${logs.length} log(s)`;
	};

	const applyFilters = () => {
		const startDate = startDateInput?.value ? new Date(startDateInput.value) : null;
		const endDate = endDateInput?.value ? new Date(endDateInput.value) : null;
		if (endDate) {
			endDate.setHours(23, 59, 59, 999);
		}

		const product = productFilterEl?.value || "";
		const movementType = movementFilterEl?.value || "";
		const performedBy = performedByFilterEl?.value || "";
		const referenceKeyword = (referenceFilterEl?.value || "").trim().toLowerCase();

		const filtered = ownerStockLogs.filter((log) => {
			const logDate = new Date(log.dateTime);
			const matchesStart = !startDate || logDate >= startDate;
			const matchesEnd = !endDate || logDate <= endDate;
			const matchesProduct = !product || log.productName === product;
			const matchesMovement = !movementType || log.movementType === movementType;
			const matchesPerformedBy = !performedBy || log.performedBy === performedBy;
			const matchesReference =
				!referenceKeyword || log.referenceId.toLowerCase().includes(referenceKeyword);

			return (
				matchesStart &&
				matchesEnd &&
				matchesProduct &&
				matchesMovement &&
				matchesPerformedBy &&
				matchesReference
			);
		});

		renderSummary(filtered);
		renderTable(filtered);
	};

	[
		startDateInput,
		endDateInput,
		productFilterEl,
		movementFilterEl,
		performedByFilterEl,
		referenceFilterEl,
	].forEach((el) => {
		el?.addEventListener("input", applyFilters);
		el?.addEventListener("change", applyFilters);
	});

	resetFiltersEl?.addEventListener("click", () => {
		if (startDateInput) startDateInput.value = "";
		if (endDateInput) endDateInput.value = "";
		if (productFilterEl) productFilterEl.value = "";
		if (movementFilterEl) movementFilterEl.value = "";
		if (performedByFilterEl) performedByFilterEl.value = "";
		if (referenceFilterEl) referenceFilterEl.value = "";
		applyFilters();
	});

	applyFilters();
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initOwnerActivitylogs);
} else {
	initOwnerActivitylogs();
}
