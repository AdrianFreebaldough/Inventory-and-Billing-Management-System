import { apiFetch, buildQueryString } from "../utils/apiClient.js";

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

const STOCK_LOGS_ENDPOINT = "/api/stock-logs";

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

const renderStatusRow = (tableBody, message) => {
	tableBody.innerHTML = `
		<tr>
			<td colspan="8" class="px-4 py-8 text-center text-sm text-slate-500">${escapeHtml(message)}</td>
		</tr>
	`;
};

const toStockLogRecord = (log) => ({
	dateTime: log.createdAt,
	productName: log?.product?.name || "Unknown Product",
	movementType: log.movementType,
	qtyChange: Number(log.quantityChange) || 0,
	beforeQty: Number(log.beforeQuantity) || 0,
	afterQty: Number(log.afterQuantity) || 0,
	performedBy: log?.performedBy?.name || "Unknown User",
	referenceId: log.referenceId || "N/A",
});

const setFilterOptions = (selectElement, options) => {
	if (!selectElement) {
		return;
	}

	const currentValue = selectElement.value;
	const defaultOption = selectElement.querySelector("option")?.outerHTML || "<option value=\"\">All</option>";

	selectElement.innerHTML = defaultOption;

	options.forEach((entry) => {
		const option = document.createElement("option");
		option.value = entry.value;
		option.textContent = entry.label;
		selectElement.append(option);
	});

	if ([...selectElement.options].some((option) => option.value === currentValue)) {
		selectElement.value = currentValue;
	}
};

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
		systemLabelEl.textContent = "System Generated • Logs are system-generated and cannot be edited or deleted.";
	}

	const renderSummary = (summary) => {
		if (totalSaleEl) totalSaleEl.textContent = String(summary?.totalSale || 0);
		if (totalRestockEl) totalRestockEl.textContent = String(summary?.totalRestock || 0);
		if (totalAdjustEl) totalAdjustEl.textContent = String(summary?.totalAdjust || 0);
	};

	const renderTable = (logs) => {
		tableBody.innerHTML = "";

		if (!logs.length) {
			renderStatusRow(tableBody, "No stock log records found for the selected filters.");
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

	const getFilters = () => ({
		startDate: startDateInput?.value || "",
		endDate: endDateInput?.value || "",
		productId: productFilterEl?.value || "",
		movementType: movementFilterEl?.value || "",
		performedBy: performedByFilterEl?.value || "",
		referenceId: referenceFilterEl?.value || "",
	});

	const refreshFilterOptions = (records) => {
		const productsMap = new Map();
		const usersMap = new Map();

		records.forEach((record) => {
			if (record?.product?._id && record?.product?.name) {
				productsMap.set(record.product._id, record.product.name);
			}

			if (record?.performedBy?._id && record?.performedBy?.name) {
				usersMap.set(record.performedBy._id, record.performedBy.name);
			}
		});

		const productOptions = [...productsMap.entries()]
			.map(([value, label]) => ({ value, label }))
			.sort((a, b) => a.label.localeCompare(b.label));

		const userOptions = [...usersMap.entries()]
			.map(([value, label]) => ({ value, label }))
			.sort((a, b) => a.label.localeCompare(b.label));

		setFilterOptions(productFilterEl, productOptions);
		setFilterOptions(performedByFilterEl, userOptions);
	};

	const fetchAndRenderLogs = async () => {
		renderStatusRow(tableBody, "Loading stock logs...");
		if (resultCountEl) {
			resultCountEl.textContent = "Loading...";
		}

		try {
			const queryString = buildQueryString(getFilters());
			const response = await apiFetch(`${STOCK_LOGS_ENDPOINT}${queryString}`);

			const rawData = Array.isArray(response?.data) ? response.data : [];
			const normalizedData = rawData.map(toStockLogRecord);

			renderSummary(response?.summary || {});
			renderTable(normalizedData);
			refreshFilterOptions(rawData);
		} catch (error) {
			renderSummary({ totalSale: 0, totalRestock: 0, totalAdjust: 0 });
			renderStatusRow(tableBody, error.message || "Failed to load stock logs.");
			if (resultCountEl) {
				resultCountEl.textContent = "0 log(s)";
			}
		}
	};

	[
		startDateInput,
		endDateInput,
		productFilterEl,
		movementFilterEl,
		performedByFilterEl,
		referenceFilterEl,
	].forEach((el) => {
		el?.addEventListener("input", fetchAndRenderLogs);
		el?.addEventListener("change", fetchAndRenderLogs);
	});

	resetFiltersEl?.addEventListener("click", () => {
		if (startDateInput) startDateInput.value = "";
		if (endDateInput) endDateInput.value = "";
		if (productFilterEl) productFilterEl.value = "";
		if (movementFilterEl) movementFilterEl.value = "";
		if (performedByFilterEl) performedByFilterEl.value = "";
		if (referenceFilterEl) referenceFilterEl.value = "";
		fetchAndRenderLogs();
	});

	fetchAndRenderLogs();
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initOwnerActivitylogs);
} else {
	initOwnerActivitylogs();
}
