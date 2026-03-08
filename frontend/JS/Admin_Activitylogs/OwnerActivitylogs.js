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
	const auth = window.IBMSAuth;
	if (auth && !auth.isSessionValid("owner")) {
		auth.clearAuthData();
		auth.redirectToLogin(true);
		return;
	}

	// Movement Logs Tab Elements
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

	// Logs Report Tab Elements
	const reportMonthFilter = document.getElementById("reportMonthFilter");
	const generateReportBtn = document.getElementById("generateReport");

	// Chart state containers
	const chartLoadingState = document.getElementById("chartLoadingState");
	const chartEmptyState = document.getElementById("chartEmptyState");
	const chartErrorState = document.getElementById("chartErrorState");
	const chartErrorMessage = document.getElementById("chartErrorMessage");
	const chartInitialState = document.getElementById("chartInitialState");
	const inventoryChartWrapper = document.getElementById("inventoryChartWrapper");
	const varianceChartSection = document.getElementById("varianceChartSection");
	const chartTitle = document.getElementById("chartTitle");
	const chartSubtitle = document.getElementById("chartSubtitle");
	const chartItemCount = document.getElementById("chartItemCount");
	const reportTableSection = document.getElementById("reportTableSection");
	const reportTableBody = document.getElementById("reportTableBody");

	// Chart instances
	let inventoryChartInstance = null;
	let varianceChartInstance = null;
	let generatedReport = null;
	let currentReportData = [];

	// Tab Elements
	const tabMovementLogs = document.getElementById("tabMovementLogs");
	const tabLogsReport = document.getElementById("tabLogsReport");
	const movementLogsContent = document.getElementById("movementLogsContent");
	const logsReportContent = document.getElementById("logsReportContent");

	if (!tableBody) {
		return;
	}

	if (systemLabelEl) {
		systemLabelEl.textContent = "System Generated • Logs are system-generated and cannot be edited or deleted.";
	}

	// Tab Switching
	const switchTab = (activeTab) => {
		const tabs = [tabMovementLogs, tabLogsReport];
		const contents = [movementLogsContent, logsReportContent];

		tabs.forEach((tab) => {
			if (tab === activeTab) {
				tab.className = "tab-button border-b-2 border-blue-600 px-1 py-3 text-sm font-medium text-blue-600 transition-colors";
			} else {
				tab.className = "tab-button border-b-2 border-transparent px-1 py-3 text-sm font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors";
			}
		});

		if (activeTab === tabMovementLogs) {
			movementLogsContent.classList.remove("hidden");
			logsReportContent.classList.add("hidden");
		} else {
			movementLogsContent.classList.add("hidden");
			logsReportContent.classList.remove("hidden");
			populateMonthOptions();
		}
	};

	tabMovementLogs?.addEventListener("click", () => switchTab(tabMovementLogs));
	tabLogsReport?.addEventListener("click", () => switchTab(tabLogsReport));

	// Populate Month Options (last 12 months)
	const populateMonthOptions = () => {
		if (!reportMonthFilter) return;

		const months = [];
		const now = new Date();

		for (let i = 0; i < 12; i++) {
			const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
			const monthName = date.toLocaleString("default", { month: "long", year: "numeric" });
			const monthValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
			months.push({ label: monthName, value: monthValue });
		}

		reportMonthFilter.innerHTML = months
			.map(
				(m) =>
					`<option value="${m.value}">${m.label}</option>`
			)
			.join("");
	};

	// ── Chart state helpers ──
	const chartStateIds = ["chartLoadingState", "chartEmptyState", "chartErrorState", "chartInitialState", "inventoryChartWrapper"];
	const showChartState = (stateId) => {
		// Re-query DOM each time to avoid stale references
		chartStateIds.forEach((id) => {
			const el = document.getElementById(id);
			if (el) el.classList.add("hidden");
		});
		const variance = document.getElementById("varianceChartSection");
		const itemCount = document.getElementById("chartItemCount");
		if (variance) variance.classList.add("hidden");
		if (itemCount) itemCount.classList.add("hidden");
		if (typeof stateId === "string") {
			const target = document.getElementById(stateId);
			if (target) target.classList.remove("hidden");
		} else if (stateId instanceof HTMLElement) {
			stateId.classList.remove("hidden");
		}
	};

	const normalizeReportItems = (rawItems) => {
		if (!Array.isArray(rawItems)) return [];

		return rawItems.map((item) => ({
			itemId: item?.itemId || "",
			itemName: item?.itemName || item?.productName || "Unknown Item",
			genericName: item?.genericName || "",
			category: item?.category || "Uncategorized",
			batchNumber: item?.batchNumber || "",
			expiryDate: item?.expiryDate || null,
			beginningQty: Number(item?.beginningQty) || 0,
			itemsRestocked: Number(item?.itemsRestocked) || 0,
			itemsIssued: Number(item?.itemsIssued) || 0,
			systemQty: Number(item?.systemQty) || 0,
			physicalCount: Number(item?.physicalCount) || 0,
			actualBalance: Number(item?.actualBalance) || 0,
			variance: Number(item?.variance) || 0,
			checkedBy: item?.checkedBy || null,
			dateChecked: item?.dateChecked || null,
		}));
	};

	const computeReportRow = (item) => {
		const systemStock = Number(item?.systemQty) || 0;
		const variance = Number(item?.variance) || 0;
		const physicalCount = systemStock + variance;
		const status = variance === 0 ? "Balanced" : "With Variance";

		const formatDate = (d) => {
			if (!d) return "—";
			const date = new Date(d);
			if (isNaN(date.getTime())) return "—";
			return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
		};

		const formatDateTime = (d) => {
			if (!d) return "—";
			const date = new Date(d);
			if (isNaN(date.getTime())) return "—";
			return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
		};

		return {
			itemId: item?.itemId || "",
			itemName: item?.itemName || "Unknown Item",
			genericName: item?.genericName || "",
			category: item?.category || "Uncategorized",
			batchNumber: item?.batchNumber || "",
			expiryDate: formatDate(item?.expiryDate),
			systemStock,
			physicalCount,
			variance,
			status,
			checkedBy: item?.checkedBy || "—",
			dateChecked: formatDateTime(item?.dateChecked),
		};
	};

	const getAuthEmail = () => {
		const auth = window.IBMSAuth;
		if (!auth) return "";
		const payload = auth.getTokenPayload ? auth.getTokenPayload() : null;
		return payload?.email || localStorage.getItem("userEmail") || "";
	};

	const renderReportTable = (reportData) => {
		// Always re-query DOM to avoid stale references after HTML re-injection
		let section = document.getElementById("reportTableSection");
		let tbody = document.getElementById("reportTableBody");
		const saveBtn = document.getElementById("saveVarianceBtn");

		if (!section || !tbody) {
			const logsRoot = document.getElementById("logsReportContent");
			if (logsRoot) {
				const recoveredSection = document.createElement("section");
				recoveredSection.id = "reportTableSection";
				recoveredSection.className = "rounded-2xl border border-slate-100 bg-white p-6 shadow-sm";
				recoveredSection.innerHTML = `
					<div class="mb-4 flex items-center justify-between">
						<div>
							<h3 class="text-lg font-semibold text-slate-900">Monthly Inventory Report Table</h3>
							<p class="text-sm text-slate-500">Enter variance values to record physical inventory discrepancies. All other fields are system-generated.</p>
						</div>
						<button id="saveVarianceBtn" class="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed hidden">
							Save Variance
						</button>
					</div>
					<div class="overflow-x-auto max-h-[600px] overflow-y-auto rounded-lg border border-slate-200">
						<table class="min-w-full text-sm">
							<thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 sticky top-0 z-10">
								<tr>
									<th class="px-3 py-2">Item Name</th>
									<th class="px-3 py-2">Generic Name</th>
									<th class="px-3 py-2">Batch Number</th>
									<th class="px-3 py-2 text-right">System Stock</th>
									<th class="px-3 py-2">Expiration Date</th>
									<th class="px-3 py-2 text-right">Physical Count</th>
									<th class="px-3 py-2 text-center">Variance</th>
									<th class="px-3 py-2">Date Checked</th>
									<th class="px-3 py-2">Checked By</th>
									<th class="px-3 py-2 text-center">Status</th>
								</tr>
							</thead>
							<tbody id="reportTableBody" class="divide-y divide-slate-100 bg-white"></tbody>
						</table>
					</div>
				`;
				logsRoot.appendChild(recoveredSection);
				section = document.getElementById("reportTableSection");
				tbody = document.getElementById("reportTableBody");
			}
		}

		if (!section || !tbody) {
			console.error("[LogsReport] renderReportTable: Critical - DOM elements not found even after recovery", {
				section: Boolean(section),
				body: Boolean(tbody),
				domReady: document.readyState,
			});
			return;
		}

		console.log("[LogsReport] renderReportTable called with", reportData?.length || 0, "items");

		if (!Array.isArray(reportData) || reportData.length === 0) {
			console.warn("[LogsReport] No data to render");
			tbody.innerHTML = `
				<tr>
					<td colspan="10" class="px-4 py-8 text-center text-sm text-slate-500">
						No inventory data found for the selected month.
					</td>
				</tr>
			`;
			section.classList.remove("hidden");
			if (saveBtn) saveBtn.classList.add("hidden");
			console.log("[LogsReport] Empty state displayed");
			return;
		}

		const userEmail = getAuthEmail();

		// Build table rows HTML with editable variance
		const tableRowsHTML = reportData
			.map((item, index) => {
				const row = computeReportRow(item);
				const statusClass = row.status === "Balanced"
					? "bg-emerald-100 text-emerald-700"
					: "bg-rose-100 text-rose-700";
				const rowClass = row.variance !== 0
					? "hover:bg-rose-50 bg-rose-50/40"
					: index % 2 === 1 ? "bg-slate-50/60 hover:bg-slate-100" : "hover:bg-slate-50";

				return `
					<tr class="${rowClass}" data-item-id="${escapeHtml(row.itemId)}" data-system-stock="${row.systemStock}">
						<td class="px-3 py-2 font-medium text-slate-900">${escapeHtml(row.itemName)}</td>
						<td class="px-3 py-2 text-slate-700">${escapeHtml(row.genericName)}</td>
						<td class="px-3 py-2 text-slate-700">${escapeHtml(row.batchNumber) || '<span class="text-slate-400">—</span>'}</td>
						<td class="px-3 py-2 text-right text-slate-700">${row.systemStock}</td>
						<td class="px-3 py-2 text-slate-700">${row.expiryDate}</td>
						<td class="px-3 py-2 text-right text-slate-700 physical-count-cell">${row.physicalCount}</td>
						<td class="px-3 py-2 text-center">
							<input type="number" 
								class="variance-input w-20 rounded border border-slate-300 px-2 py-1 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300" 
								value="${row.variance}" 
								data-original="${row.variance}"
								step="1" />
						</td>
						<td class="px-3 py-2 text-slate-600 date-checked-cell text-xs">${row.checkedBy !== "—" ? row.dateChecked : '<span class="text-slate-400">—</span>'}</td>
						<td class="px-3 py-2 text-slate-600 checked-by-cell text-xs">${row.checkedBy !== "—" ? escapeHtml(row.checkedBy) : '<span class="text-slate-400">—</span>'}</td>
						<td class="px-3 py-2 text-center status-cell">
							<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}">${row.status}</span>
						</td>
					</tr>
				`;
			})
			.join("");

		// Insert the HTML into the table body
		tbody.innerHTML = tableRowsHTML;

		// Attach variance input listeners for real-time Physical Count computation
		tbody.querySelectorAll(".variance-input").forEach((input) => {
			input.addEventListener("input", () => {
				const tr = input.closest("tr");
				const systemStock = Number(tr.dataset.systemStock) || 0;
				const varianceVal = Number(input.value) || 0;
				const physicalCount = systemStock + varianceVal;

				// Update Physical Count cell
				const pcCell = tr.querySelector(".physical-count-cell");
				if (pcCell) pcCell.textContent = physicalCount;

				// Update status
				const statusCell = tr.querySelector(".status-cell");
				if (statusCell) {
					const isBalanced = varianceVal === 0;
					const statusClass = isBalanced ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
					statusCell.innerHTML = `<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}">${isBalanced ? "Balanced" : "With Variance"}</span>`;
				}

				// Update date checked and checked by preview
				const dateCell = tr.querySelector(".date-checked-cell");
				const checkedByCell = tr.querySelector(".checked-by-cell");
				const original = Number(input.dataset.original) || 0;
				if (varianceVal !== original) {
					if (dateCell) dateCell.innerHTML = `<span class="text-blue-600 italic">On save</span>`;
					if (checkedByCell) checkedByCell.innerHTML = `<span class="text-blue-600 italic">${escapeHtml(userEmail)}</span>`;
				}

				// Update row styling
				if (varianceVal !== 0) {
					tr.className = "hover:bg-rose-50 bg-rose-50/40";
				} else {
					const idx = Array.from(tbody.children).indexOf(tr);
					tr.className = idx % 2 === 1 ? "bg-slate-50/60 hover:bg-slate-100" : "hover:bg-slate-50";
				}
			});
		});

		// Show Save Variance button
		if (saveBtn) saveBtn.classList.remove("hidden");

		// Force the section to be visible
		section.classList.remove("hidden");
		
		console.log("[LogsReport] ✓ Table rendered successfully:", {
			rows: reportData.length,
			sectionVisible: !section.classList.contains("hidden"),
			tbodyHasContent: tbody.children.length > 0
		});
	};

	const parseMonthlyReportResponse = (response) => {
		const candidateArrays = [
			response?.data,
			response?.reportData,
			response?.results,
			response?.data?.data,
			response?.data?.reportData,
			response?.payload?.data,
		];

		const rawReportData = candidateArrays.find((value) => Array.isArray(value)) || [];
		const reportData = normalizeReportItems(rawReportData);

		const rawSummary =
			response?.summary ||
			response?.data?.summary ||
			response?.payload?.summary ||
			{};

		const summary = {
			totalItems: Number(rawSummary.totalItems),
			totalIssued: Number(rawSummary.totalIssued),
			itemsWithVariance: Number(rawSummary.itemsWithVariance),
		};

		if (!Number.isFinite(summary.totalItems)) summary.totalItems = reportData.length;
		if (!Number.isFinite(summary.totalIssued)) {
			summary.totalIssued = reportData.reduce((sum, item) => sum + item.itemsIssued, 0);
		}
		if (!Number.isFinite(summary.itemsWithVariance)) {
			summary.itemsWithVariance = reportData.filter((item) => item.variance !== 0).length;
		}

		return { reportData, summary };
	};

	// Generate Logs Report
	const generateLogsReport = async () => {
		if (!reportMonthFilter) return;

		const selectedMonth = reportMonthFilter.value;
		console.log("[LogsReport] Generate clicked — month:", selectedMonth);

		if (!selectedMonth) {
			alert("Please select a month before generating the report.");
			return;
		}

		const selectedMonthText = reportMonthFilter.options[reportMonthFilter.selectedIndex].text;
		const generateBtnText = document.getElementById("generateBtnText");

		// Reset previous state
		generatedReport = null;
		currentReportData = [];
		const _tableSection = document.getElementById("reportTableSection");
		const _tableBody = document.getElementById("reportTableBody");
		if (_tableSection) _tableSection.classList.add("hidden");
		if (_tableBody) _tableBody.innerHTML = "";

		// Disable button + show loading
		if (generateReportBtn) {
			generateReportBtn.disabled = true;
			if (generateBtnText) generateBtnText.textContent = "Generating...";
		}
		showChartState("chartLoadingState");

		// ── STEP 1: Fetch data from API ──
		let reportData, summary;
		try {
			const query = buildQueryString({ month: selectedMonth });
			console.log("[LogsReport] Fetching:", `${STOCK_LOGS_ENDPOINT}/monthly-report${query}`);
			const response = await apiFetch(`${STOCK_LOGS_ENDPOINT}/monthly-report${query}`);
			console.log("[LogsReport] API response keys:", Object.keys(response || {}));
			console.log("[LogsReport] response.data isArray:", Array.isArray(response?.data), "length:", response?.data?.length);

			({ reportData, summary } = parseMonthlyReportResponse(response));
			console.log("[LogsReport] Parsed", reportData.length, "items — summary:", summary);
		} catch (fetchError) {
			console.error("[LogsReport] API fetch failed:", fetchError);
			showChartState("chartErrorState");
			const errMsg = document.getElementById("chartErrorMessage");
			if (errMsg) errMsg.textContent = fetchError.message || "Failed to fetch report data. Please try again.";
			if (generateReportBtn) {
				generateReportBtn.disabled = false;
				if (generateBtnText) generateBtnText.textContent = "Generate Report";
			}
			return;
		}

		// ── STEP 2: Store shared data (used by both dashboard table and print) ──
		currentReportData = reportData;
		generatedReport = {
			month: selectedMonth,
			monthLabel: selectedMonthText,
			data: currentReportData,
			summary,
			generatedAt: new Date().toISOString(),
		};
		console.log("[LogsReport] Shared data stored:", { month: generatedReport.month, items: currentReportData.length });

		// Fail-safe: make the table section visible immediately with simple rows.
		// The full renderer below will replace this with interactive variance inputs.
		try {
			const fallbackSection = document.getElementById("reportTableSection");
			const fallbackBody = document.getElementById("reportTableBody");
			if (fallbackSection && fallbackBody) {
				if (currentReportData.length === 0) {
					fallbackBody.innerHTML = `
						<tr>
							<td colspan="10" class="px-4 py-8 text-center text-sm text-slate-500">
								No inventory data found for the selected month.
							</td>
						</tr>
					`;
				} else {
					fallbackBody.innerHTML = currentReportData
						.map((item) => {
							const row = computeReportRow(item);
							return `
								<tr>
									<td class="px-3 py-2 font-medium text-slate-900">${escapeHtml(row.itemName)}</td>
									<td class="px-3 py-2 text-slate-700">${escapeHtml(row.genericName)}</td>
									<td class="px-3 py-2 text-slate-700">${escapeHtml(row.batchNumber || "-")}</td>
									<td class="px-3 py-2 text-right text-slate-700">${row.systemStock}</td>
									<td class="px-3 py-2 text-slate-700">${row.expiryDate}</td>
									<td class="px-3 py-2 text-right text-slate-700">${row.physicalCount}</td>
									<td class="px-3 py-2 text-right text-slate-700">${row.variance}</td>
									<td class="px-3 py-2 text-slate-600 text-xs">${row.dateChecked}</td>
									<td class="px-3 py-2 text-slate-600 text-xs">${escapeHtml(row.checkedBy)}</td>
									<td class="px-3 py-2 text-center text-xs">${row.status}</td>
								</tr>
							`;
						})
						.join("");
				}
				fallbackSection.classList.remove("hidden");
			}
		} catch (fallbackError) {
			console.warn("[LogsReport] Fallback table render skipped:", fallbackError);
		}

		// ── STEP 3: Update summary UI ──
		const _chartTitle = document.getElementById("chartTitle");
		const _chartSubtitle = document.getElementById("chartSubtitle");
		if (_chartTitle) _chartTitle.textContent = `Inventory Overview — ${selectedMonthText}`;
		if (_chartSubtitle) {
			const itemCount = summary.totalItems || currentReportData.length;
			const issuedCount = summary.totalIssued || 0;
			const varianceCount = summary.itemsWithVariance || 0;
			_chartSubtitle.textContent = `${itemCount} items tracked  \u2022  ${issuedCount} total issued  \u2022  ${varianceCount} with variance`;
		}

		// ── STEP 4: Render TABLE FIRST (guaranteed to show even if charts fail) ──
		console.log("[LogsReport] Starting table render with", currentReportData.length, "items");
		try {
			renderReportTable(currentReportData);
			console.log("[LogsReport] Table render completed successfully");
		} catch (tableError) {
			console.error("[LogsReport] Table rendering failed:", tableError);
		}

		// ── STEP 5: Render charts (non-blocking — does not block table) ──
		try {
			if (currentReportData.length === 0) {
				showChartState("chartEmptyState");
			} else {
				renderCharts(currentReportData)
					.then((chartsOk) => {
						console.log("[LogsReport] Charts rendered:", chartsOk);
						if (!chartsOk) {
							showChartState(null);
						}
					})
					.catch((chartError) => {
						console.error("[LogsReport] Chart rendering failed:", chartError);
						showChartState(null);
					});
			}
		} catch (chartError) {
			console.error("[LogsReport] Chart setup failed:", chartError);
			showChartState(null);
		}

		// ── STEP 6: requestAnimationFrame guarantee — verify after browser reflow ──
		requestAnimationFrame(() => {
			if (currentReportData.length > 0) {
				const tableEl = document.getElementById("reportTableSection");
				const tBody = document.getElementById("reportTableBody");

				if (!tableEl || tableEl.classList.contains("hidden") || !tBody || tBody.children.length === 0) {
					console.warn("[LogsReport] ⚠ Table not visible after reflow — forcing re-render");
					renderReportTable(currentReportData);
				} else {
					console.log("[LogsReport] ✓ Table verified after reflow — rows:", tBody.children.length);
				}
			}
		});

		// Re-enable button
		if (generateReportBtn) {
			generateReportBtn.disabled = false;
			if (generateBtnText) generateBtnText.textContent = "Generate Report";
		}

		console.log("[LogsReport] Generate complete — data items:", currentReportData.length, "table visible:", !document.getElementById("reportTableSection")?.classList.contains("hidden"));
	};

	// ── Chart rendering (async — waits for layout before drawing) ──
	const renderCharts = async (reportData) => {
		try {
			if (!Array.isArray(reportData) || reportData.length === 0) {
				console.log("[LogsReport] No report rows available for chart rendering");
				showChartState("chartEmptyState");
				return false;
			}

			const ChartJS = window.Chart;
			if (!ChartJS) {
				console.warn("[LogsReport] Chart.js not available — skipping charts");
				return false;
			}
			console.log("[LogsReport] Chart.js", ChartJS.version, "available");

			// 1. Destroy old instances first
			if (inventoryChartInstance) { inventoryChartInstance.destroy(); inventoryChartInstance = null; }
			if (varianceChartInstance) { varianceChartInstance.destroy(); varianceChartInstance = null; }

			// 2. Make containers visible (re-query DOM for fresh refs)
			showChartState("inventoryChartWrapper");
			const _varianceSec = document.getElementById("varianceChartSection");
			const _chartCount = document.getElementById("chartItemCount");
			if (_varianceSec) _varianceSec.classList.remove("hidden");
			if (_chartCount) {
				_chartCount.textContent = `${reportData.length} items`;
				_chartCount.classList.remove("hidden");
			}

			// 3. Wait for browser reflow (with timeout safety net)
			await Promise.race([
				new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
				new Promise((r) => setTimeout(r, 500)),
			]);

			// 4. Replace canvas elements with fresh ones (avoids stale Chart state)
			const replaceCanvas = (id) => {
				const old = document.getElementById(id);
				if (!old || !old.parentElement) { console.warn("[LogsReport]", id, "not found in DOM"); return null; }
				const fresh = document.createElement("canvas");
				fresh.id = id;
				fresh.style.display = "block";
				fresh.style.width = "100%";
				fresh.style.height = "100%";
				old.parentElement.replaceChild(fresh, old);
				return fresh;
			};

			const overviewCanvas = replaceCanvas("inventoryOverviewChart");
			const varianceCanvas = replaceCanvas("varianceChart");
			if (!overviewCanvas && !varianceCanvas) {
				console.warn("[LogsReport] Chart canvases not found — skipping charts");
				return false;
			}

			// Prepare data arrays
			const labels = reportData.map((item) => item.itemName);
			const beginningData = reportData.map((item) => item.beginningQty);
			const issuedData = reportData.map((item) => item.itemsIssued);
			const systemData = reportData.map((item) => item.systemQty);
			const actualData = reportData.map((item) => item.actualBalance);
			const varianceData = reportData.map((item) => item.variance);

			// ── Inventory Overview (grouped bar) ──
			if (overviewCanvas) {
			const parentW = overviewCanvas.parentElement.clientWidth;
			const parentH = overviewCanvas.parentElement.clientHeight;
			console.log("[LogsReport] Overview canvas parent:", parentW, "×", parentH);

			const maxVal = Math.max(...beginningData, ...issuedData, ...systemData, ...actualData, 10);
			const yMax = Math.ceil(maxVal * 1.2 / 10) * 10;

			inventoryChartInstance = new ChartJS(overviewCanvas, {
				type: "bar",
				data: {
					labels,
					datasets: [
						{
							label: "Beginning Qty",
							data: beginningData,
							backgroundColor: "rgba(99, 102, 241, 0.75)",
							borderColor: "rgba(99, 102, 241, 1)",
							borderWidth: 1,
							borderRadius: 4,
						},
						{
							label: "Items Issued",
							data: issuedData,
							backgroundColor: "rgba(244, 63, 94, 0.75)",
							borderColor: "rgba(244, 63, 94, 1)",
							borderWidth: 1,
							borderRadius: 4,
						},
						{
							label: "System Qty",
							data: systemData,
							backgroundColor: "rgba(14, 165, 233, 0.75)",
							borderColor: "rgba(14, 165, 233, 1)",
							borderWidth: 1,
							borderRadius: 4,
						},
						{
							label: "Actual Balance",
							data: actualData,
							backgroundColor: "rgba(16, 185, 129, 0.75)",
							borderColor: "rgba(16, 185, 129, 1)",
							borderWidth: 1,
							borderRadius: 4,
						},
					],
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: "top",
							labels: {
								usePointStyle: true,
								pointStyle: "rectRounded",
								padding: 20,
								color: "#475569",
								font: { size: 11, weight: "500" },
							},
						},
						tooltip: {
							backgroundColor: "#1e293b",
							titleColor: "#f8fafc",
							bodyColor: "#cbd5e1",
							padding: 12,
							cornerRadius: 8,
							displayColors: true,
							boxPadding: 4,
						},
					},
					scales: {
						y: {
							beginAtZero: true,
							max: yMax,
							ticks: { color: "#94a3b8", font: { size: 11 } },
							grid: { color: "#f1f5f9", drawBorder: false },
						},
						x: {
							ticks: {
								color: "#64748b",
								font: { size: 10 },
								maxRotation: 45,
								minRotation: 0,
							},
							grid: { display: false },
						},
					},
					interaction: { intersect: false, mode: "index" },
				},
			});
				console.log("[LogsReport] Overview chart created successfully");
			}

			// ── Variance Analysis (horizontal bar) ──
			if (varianceCanvas) {
			const barColors = varianceData.map((v) =>
				v > 0 ? "rgba(16, 185, 129, 0.8)" : v < 0 ? "rgba(244, 63, 94, 0.8)" : "rgba(203, 213, 225, 0.8)"
			);
			const borderColors = varianceData.map((v) =>
				v > 0 ? "rgba(16, 185, 129, 1)" : v < 0 ? "rgba(244, 63, 94, 1)" : "rgba(203, 213, 225, 1)"
			);

			varianceChartInstance = new ChartJS(varianceCanvas, {
				type: "bar",
				data: {
					labels,
					datasets: [
						{
							label: "Variance",
							data: varianceData,
							backgroundColor: barColors,
							borderColor: borderColors,
							borderWidth: 1,
							borderRadius: 4,
						},
					],
				},
				options: {
					indexAxis: "y",
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false },
						tooltip: {
							backgroundColor: "#1e293b",
							titleColor: "#f8fafc",
							bodyColor: "#cbd5e1",
							padding: 12,
							cornerRadius: 8,
							displayColors: false,
							callbacks: {
								label: (context) => {
									const v = context.parsed.x;
									const prefix = v > 0 ? "+" : "";
									const status = v > 0 ? "Surplus" : v < 0 ? "Shortage" : "Matched";
									return `${prefix}${v}  (${status})`;
								},
							},
						},
					},
					scales: {
						x: {
							ticks: { color: "#94a3b8", font: { size: 11 } },
							grid: { color: "#f1f5f9", drawBorder: false },
						},
						y: {
							ticks: { color: "#64748b", font: { size: 10 } },
							grid: { display: false },
						},
					},
				},
			});
				console.log("[LogsReport] Variance chart created successfully");
			}

			// Safety resize after browser settles
			setTimeout(() => {
				if (inventoryChartInstance) inventoryChartInstance.resize();
				if (varianceChartInstance) varianceChartInstance.resize();
			}, 150);

			return Boolean(inventoryChartInstance || varianceChartInstance);
		} catch (error) {
			console.error("[LogsReport] Chart rendering failed:", error);
			if (inventoryChartInstance) { inventoryChartInstance.destroy(); inventoryChartInstance = null; }
			if (varianceChartInstance) { varianceChartInstance.destroy(); varianceChartInstance = null; }
			return false;
		}
	};

	// ── Print functionality ──
	const printMonthlyReport = () => {
		if (!reportMonthFilter) return;

		const selectedMonthText = reportMonthFilter.options[reportMonthFilter.selectedIndex]?.text || "Unknown Month";

		if (!generatedReport || currentReportData.length === 0) {
			alert("Please generate a report first before printing.");
			return;
		}
		console.log("[LogsReport] Print requested for stored report", {
			month: generatedReport.month,
			items: currentReportData.length,
			hasOverviewChart: Boolean(inventoryChartInstance),
			hasVarianceChart: Boolean(varianceChartInstance),
		});

		// Create a print window with the charts as images
		const printWindow = window.open("", "_blank");
		if (!printWindow) {
			alert("Please allow pop-ups to print the report.");
			return;
		}

		// Convert charts to images
		const overviewChartImg = inventoryChartInstance ? inventoryChartInstance.toBase64Image() : "";
		const varianceChartImg = varianceChartInstance ? varianceChartInstance.toBase64Image() : "";

		// Build print rows from current table state (reflects any variance edits)
		const tableRowsHtml = currentReportData
			.map((item) => {
				const row = computeReportRow(item);
				return `
					<tr>
						<td>${escapeHtml(row.itemName)}</td>
						<td>${escapeHtml(row.genericName)}</td>
						<td>${escapeHtml(row.batchNumber) || "—"}</td>
						<td class="num">${row.systemStock}</td>
						<td>${row.expiryDate}</td>
						<td class="num">${row.physicalCount}</td>
						<td class="num">${row.variance}</td>
						<td>${row.dateChecked}</td>
						<td>${escapeHtml(row.checkedBy)}</td>
						<td>${row.status}</td>
					</tr>
				`;
			})
			.join("");

		// Get the chart title and subtitle (fresh DOM query)
		const titleText = document.getElementById("chartTitle")?.textContent || `Inventory Overview — ${selectedMonthText}`;
		const subtitleText = document.getElementById("chartSubtitle")?.textContent || "";

		// Build the print document
		const printContent = `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Monthly Physical Inventory Report - ${escapeHtml(selectedMonthText)}</title>
				<style>
					* { margin: 0; padding: 0; box-sizing: border-box; }
					body {
						font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
						padding: 20mm;
						background: white;
						color: #1e293b;
					}
					.header {
						text-align: center;
						margin-bottom: 30px;
						border-bottom: 2px solid #e2e8f0;
						padding-bottom: 20px;
					}
					.header h1 {
						font-size: 24px;
						color: #0f172a;
						margin-bottom: 8px;
					}
					.header p {
						font-size: 14px;
						color: #64748b;
					}
					.chart-section {
						margin-bottom: 40px;
						page-break-inside: avoid;
					}
					.chart-section h2 {
						font-size: 18px;
						color: #0f172a;
						margin-bottom: 12px;
					}
					table {
						width: 100%;
						border-collapse: collapse;
						font-size: 11px;
					}
					th, td {
						border: 1px solid #e2e8f0;
						padding: 5px;
						text-align: left;
					}
					th {
						background: #f8fafc;
						font-weight: 600;
					}
					td.num {
						text-align: right;
					}
					.chart-section img {
						width: 100%;
						height: auto;
						border: 1px solid #e2e8f0;
						border-radius: 8px;
					}
					.footer {
						margin-top: 40px;
						padding-top: 20px;
						border-top: 1px solid #e2e8f0;
						text-align: center;
						font-size: 12px;
						color: #94a3b8;
					}
					@media print {
						body { padding: 10mm; }
						.chart-section { page-break-inside: avoid; }
					}
				</style>
			</head>
			<body>
				<div class="header">
					<h1>Monthly Physical Inventory Report</h1>
					<p>${escapeHtml(selectedMonthText)} — ${subtitleText}</p>
				</div>
				${overviewChartImg ? `
				<div class="chart-section">
					<h2>Inventory Overview</h2>
					<img src="${overviewChartImg}" alt="Inventory Overview Chart" />
				</div>
				` : ""}
				${varianceChartImg ? `
				<div class="chart-section">
					<h2>Variance Analysis</h2>
					<img src="${varianceChartImg}" alt="Variance Analysis Chart" />
				</div>
				` : ""}
				<div class="chart-section">
					<h2>Physical Inventory Details</h2>
					<table>
						<thead>
							<tr>
								<th>Item Name</th>
								<th>Generic Name</th>
								<th>Batch Number</th>
								<th>System Stock</th>
								<th>Expiration Date</th>
								<th>Physical Count</th>
								<th>Variance</th>
								<th>Date Checked</th>
								<th>Checked By</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							${tableRowsHtml}
						</tbody>
					</table>
				</div>
				<div class="footer">
					<p>Generated on ${new Date().toLocaleString()} | Inventory & Billing Management System</p>
				</div>
			</body>
			</html>
		`;

		printWindow.document.write(printContent);
		printWindow.document.close();

		// Wait for images to load before printing
		printWindow.onload = () => {
			printWindow.focus();
			setTimeout(() => {
				printWindow.print();
			}, 250);
		};
	};

	// ── Save Variance functionality ──
	const saveVariance = async () => {
		if (!generatedReport || !currentReportData.length) {
			alert("Please generate a report first.");
			return;
		}

		const tbody = document.getElementById("reportTableBody");
		if (!tbody) return;

		const rows = tbody.querySelectorAll("tr[data-item-id]");
		const changedItems = [];

		rows.forEach((tr) => {
			const input = tr.querySelector(".variance-input");
			if (!input) return;
			const currentVal = Number(input.value) || 0;
			const originalVal = Number(input.dataset.original) || 0;
			if (currentVal !== originalVal) {
				changedItems.push({
					itemId: tr.dataset.itemId,
					variance: currentVal,
					systemStock: Number(tr.dataset.systemStock) || 0,
				});
			}
		});

		if (changedItems.length === 0) {
			alert("No variance changes to save.");
			return;
		}

		const saveBtn = document.getElementById("saveVarianceBtn");
		if (saveBtn) {
			saveBtn.disabled = true;
			saveBtn.textContent = "Saving...";
		}

		try {
			const response = await apiFetch(`${STOCK_LOGS_ENDPOINT}/monthly-report/variance`, {
				method: "POST",
				body: JSON.stringify({
					month: generatedReport.month,
					items: changedItems,
				}),
			});

			console.log("[LogsReport] Variance saved:", response);

			// Update local data with saved results
			if (Array.isArray(response?.data)) {
				response.data.forEach((saved) => {
					const idx = currentReportData.findIndex((d) => d.itemId === saved.itemId?.toString());
					if (idx !== -1) {
						currentReportData[idx].variance = saved.variance;
						currentReportData[idx].physicalCount = saved.physicalCount;
						currentReportData[idx].checkedBy = saved.checkedBy;
						currentReportData[idx].dateChecked = saved.dateChecked;
					}
				});
			}

			// Re-render table with updated data
			renderReportTable(currentReportData);

			alert(`Variance saved for ${changedItems.length} item(s) successfully.`);
		} catch (error) {
			console.error("[LogsReport] Failed to save variance:", error);
			alert("Failed to save variance: " + (error.message || "Unknown error"));
		} finally {
			if (saveBtn) {
				saveBtn.disabled = false;
				saveBtn.textContent = "Save Variance";
			}
		}
	};

	// Make print function globally accessible
	window.printMonthlyReport = printMonthlyReport;

	// Generate Report Button
	generateReportBtn?.addEventListener("click", generateLogsReport);

	// Save Variance Button
	document.getElementById("saveVarianceBtn")?.addEventListener("click", saveVariance);
	generateReportBtn?.addEventListener("click", generateLogsReport);

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
