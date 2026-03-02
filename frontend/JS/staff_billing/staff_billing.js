/**
 * Staff Billing Module - Production Version
 * Fully integrated with backend API. No mock data.
 */

import {
	fetchBillingProducts,
	createTransaction,
	proceedToPayment,
	completeTransaction,
	voidTransaction as apiVoidTransaction,
	fetchHistory,
	fetchReceipt,
} from "./BillingAPI.js";

/* ===== Constants ===== */

const BILLING_MODE_RETURN_KEY = "lastStaffRoute";
const VAT_RATE = 0.12;
const CLINIC_NAME = "IBMS Clinic";
const PRODUCT_CATEGORIES = [
	"All Items",
	"Medicines",
	"Medical Supplies",
	"Medical Equipment",
	"Diagnostic Kits",
	"General Supplies",
];

/* ===== State ===== */

const state = {
	products: [],
	activeCategory: "All Items",
	searchTerm: "",
	quantities: {},
	discountRate: 0,
	patientId: "",
	activeView: "sale",
	transactionLog: [],
	activeTransactionId: null,
	heldTransactions: [],
	heldCounter: 1,
	currentModal: null,
	lastCompletedSale: null,
	pendingVoidTransactionId: null,
	isLoading: false,
};

/* ===== DOM Elements ===== */

const categoryTabs = document.getElementById("categoryTabs");
const itemsTableBody = document.getElementById("itemsTableBody");
const searchInput = document.getElementById("searchInput");
const selectedItemsPanel = document.getElementById("selectedItems");
const posView = document.getElementById("posView");
const historyView = document.getElementById("historyView");
const historyTableBody = document.getElementById("historyTableBody");

const itemsCountElement = document.getElementById("itemsCount");
const subtotalElement = document.getElementById("subtotalValue");
const discountElement = document.getElementById("discountValue");
const vatElement = document.getElementById("vatValue");
const totalDueElement = document.getElementById("totalDueValue");

const txnIdElement = document.getElementById("txnId");
const txnStatusElement = document.getElementById("txnStatus");
const patientIdInput = document.getElementById("patientIdInput");
const patientIdHint = document.getElementById("patientIdHint");
const proceedButton = document.getElementById("proceedBtn");

const menuPosButton = document.getElementById("menuPosBtn");
const holdTopButton = document.getElementById("holdTopBtn");
const holdSummaryButton = document.getElementById("holdSummaryBtn");
const newSaleButton = document.getElementById("newSaleBtn");
const historyButton = document.getElementById("historyBtn");
const discountButton = document.getElementById("discountBtn");
const clearAllButton = document.getElementById("clearAllBtn");

const modalOverlay = document.getElementById("modalOverlay");
const summaryModal = document.getElementById("summaryModal");
const cashModal = document.getElementById("cashModal");
const successModal = document.getElementById("successModal");
const heldModal = document.getElementById("heldModal");
const historyViewModal = document.getElementById("historyViewModal");
const voidConfirmModal = document.getElementById("voidConfirmModal");

const summaryClinic = document.getElementById("summaryClinic");
const summaryTxnId = document.getElementById("summaryTxnId");
const summaryPatientId = document.getElementById("summaryPatientId");
const summaryItemsBody = document.getElementById("summaryItemsBody");
const summarySubtotal = document.getElementById("summarySubtotal");
const summaryDiscount = document.getElementById("summaryDiscount");
const summaryVat = document.getElementById("summaryVat");
const summaryTotal = document.getElementById("summaryTotal");
const summaryBackBtn = document.getElementById("summaryBackBtn");
const summaryProceedBtn = document.getElementById("summaryProceedBtn");

const cashTotalDue = document.getElementById("cashTotalDue");
const cashTenderedInput = document.getElementById("cashTenderedInput");
const cashChangeValue = document.getElementById("cashChangeValue");
const cashBackBtn = document.getElementById("cashBackBtn");
const finalizeBtn = document.getElementById("finalizeBtn");

const successClinic = document.getElementById("successClinic");
const successTxnId = document.getElementById("successTxnId");
const successPatientId = document.getElementById("successPatientId");
const successItems = document.getElementById("successItems");
const successSubtotal = document.getElementById("successSubtotal");
const successDiscount = document.getElementById("successDiscount");
const successVat = document.getElementById("successVat");
const successTotal = document.getElementById("successTotal");
const printSlipBtn = document.getElementById("printSlipBtn");
const nextSaleBtn = document.getElementById("nextSaleBtn");

const heldCloseBtn = document.getElementById("heldCloseBtn");
const heldList = document.getElementById("heldList");

const historyViewCloseBtn = document.getElementById("historyViewCloseBtn");
const historyViewTxnId = document.getElementById("historyViewTxnId");
const historyViewDateTime = document.getElementById("historyViewDateTime");
const historyViewPatientId = document.getElementById("historyViewPatientId");
const historyViewStatus = document.getElementById("historyViewStatus");
const historyViewItemsBody = document.getElementById("historyViewItemsBody");
const historyViewSubtotal = document.getElementById("historyViewSubtotal");
const historyViewDiscount = document.getElementById("historyViewDiscount");
const historyViewVat = document.getElementById("historyViewVat");
const historyViewTotal = document.getElementById("historyViewTotal");
const voidCancelBtn = document.getElementById("voidCancelBtn");
const voidConfirmBtn = document.getElementById("voidConfirmBtn");

const toastContainer = document.getElementById("toastContainer");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");

/* ===== Auth & Navigation ===== */

function getCurrentTokenRole() {
	const tokenKeys = ["token", "authToken", "jwtToken", "ibmsToken"];
	for (const key of tokenKeys) {
		const token = localStorage.getItem(key);
		if (!token || !token.trim()) continue;
		const parts = token.split(".");
		if (parts.length < 2) continue;
		try {
			const payload = JSON.parse(atob(parts[1]));
			const role = String(payload?.role || "").toLowerCase();
			if (role) return role;
		} catch {
			return "";
		}
	}
	return "";
}

function enforceStaffAccessOrRedirect() {
	const role = getCurrentTokenRole();
	if (role !== "staff") {
		window.location.href = "../../HTML/loginPage/loginPage.html";
		return false;
	}
	return true;
}

function exitBillingMode() {
	const lastRoute = (sessionStorage.getItem(BILLING_MODE_RETURN_KEY) || "dashboard").toLowerCase();
	const safeRoute = ["dashboard", "inventory", "profile"].includes(lastRoute) ? lastRoute : "dashboard";
	window.location.href = `../../HTML/staff_dashboard/staff_dashboard.html#${safeRoute}`;
}

/* ===== UI Utilities ===== */

function formatPeso(value) {
	return `₱${Number(value).toFixed(2)}`;
}

function showToast(message, type = "info") {
	const toast = document.createElement("div");
	const bgColor = {
		success: "bg-emerald-500",
		error: "bg-rose-500",
		info: "bg-cyan-500",
		warning: "bg-amber-500",
	}[type] || "bg-slate-700";

	toast.className = `${bgColor} text-white px-4 py-2 rounded shadow-lg text-sm animate-fade-in`;
	toast.textContent = message;
	toastContainer.appendChild(toast);

	setTimeout(() => {
		toast.classList.add("opacity-0", "transition-opacity");
		setTimeout(() => toast.remove(), 300);
	}, 3000);
}

function showLoading(text = "Processing...") {
	state.isLoading = true;
	loadingText.textContent = text;
	loadingOverlay.classList.remove("hidden");
	loadingOverlay.classList.add("flex");
}

function hideLoading() {
	state.isLoading = false;
	loadingOverlay.classList.add("hidden");
	loadingOverlay.classList.remove("flex");
}

function generatePatientId() {
	const suffix = Math.floor(100000 + Math.random() * 900000);
	return `PAT-${suffix}`;
}

function generateHeldId() {
	const id = `HLD-${String(state.heldCounter).padStart(4, "0")}`;
	state.heldCounter += 1;
	return id;
}

function formatDateTime(isoString) {
	if (!isoString) return { date: "N/A", time: "N/A" };
	const d = new Date(isoString);
	const month = d.getMonth() + 1;
	const day = d.getDate();
	const year = d.getFullYear();
	const hour = d.getHours();
	const minute = String(d.getMinutes()).padStart(2, "0");
	return { date: `${month}/${day}/${year}`, time: `${hour}:${minute}` };
}

/* ===== Modals ===== */

function closeAllModals() {
	[summaryModal, cashModal, successModal, heldModal, historyViewModal, voidConfirmModal].forEach((modal) => {
		modal.classList.add("hidden");
		modal.classList.remove("flex");
	});
	modalOverlay.classList.add("hidden");
	document.body.classList.remove("overflow-hidden");
	state.currentModal = null;
}

function openModal(modal) {
	closeAllModals();
	modalOverlay.classList.remove("hidden");
	modal.classList.remove("hidden");
	modal.classList.add("flex");
	document.body.classList.add("overflow-hidden");
	state.currentModal = modal.id;
}

/* ===== Data Computation ===== */

function getSelectedItems() {
	return state.products
		.filter((item) => (state.quantities[item.id] || 0) > 0)
		.map((item) => ({ ...item, qty: state.quantities[item.id] }));
}

function getFilteredItems() {
	const term = state.searchTerm.trim().toLowerCase();
	return state.products.filter((item) => {
		const categoryMatch = state.activeCategory === "All Items" || item.category === state.activeCategory;
		const searchMatch = item.name.toLowerCase().includes(term);
		return categoryMatch && searchMatch;
	});
}

function computeSaleTotals() {
	const selected = getSelectedItems();
	const itemCount = selected.reduce((total, item) => total + item.qty, 0);
	const subtotal = selected.reduce((total, item) => total + item.price * item.qty, 0);
	const discount = subtotal * state.discountRate;
	const taxableAmount = Math.max(subtotal - discount, 0);
	const vat = taxableAmount * VAT_RATE;
	const totalDue = taxableAmount + vat;
	return { selected, itemCount, subtotal, discount, vat, totalDue };
}

/* ===== Rendering ===== */

function setProceedButtonEnabled(enabled) {
	proceedButton.disabled = !enabled;
	proceedButton.className = enabled
		? "w-full bg-emerald-500 py-2.5 text-xs font-semibold text-white hover:bg-emerald-400"
		: "w-full cursor-not-allowed bg-slate-200 py-2.5 text-xs font-semibold text-slate-400";
}

function updatePaymentLockStatus() {
	const { itemCount } = computeSaleTotals();
	if (!state.patientId) {
		txnStatusElement.textContent = "WAITING FOR PATIENT ID";
		txnStatusElement.className = "font-semibold text-amber-300";
		patientIdHint.textContent = "Patient ID auto-generates when first item is added.";
		patientIdHint.className = "mt-1 text-[10px] text-slate-400";
		setProceedButtonEnabled(false);
		return;
	}

	txnStatusElement.textContent = itemCount > 0 ? "READY FOR PAYMENT" : "WAITING FOR ITEMS";
	txnStatusElement.className = itemCount > 0 ? "font-semibold text-emerald-400" : "font-semibold text-amber-300";
	patientIdHint.textContent = itemCount > 0 ? "Patient ID ready. You can proceed to payment." : "Patient ID ready. Add items to continue.";
	patientIdHint.className = itemCount > 0 ? "mt-1 text-[10px] text-emerald-300" : "mt-1 text-[10px] text-slate-400";
	setProceedButtonEnabled(itemCount > 0 && Boolean(state.patientId));
}

function renderTabs() {
	categoryTabs.innerHTML = PRODUCT_CATEGORIES
		.map((tab) => {
			const isActive = tab === state.activeCategory;
			return `
				<button
					type="button"
					data-category="${tab}"
					class="min-w-24 border px-3 py-1.5 text-[11px] font-medium transition ${
						isActive
							? "border-slate-800 bg-slate-900 text-white"
							: "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
					}"
				>
					${tab}
				</button>
			`;
		})
		.join("");
}

function renderItemRows() {
	const filtered = getFilteredItems();
	if (!filtered.length) {
		itemsTableBody.innerHTML = `
			<tr>
				<td colspan="4" class="px-3 py-6 text-center text-sm text-slate-500">No items found.</td>
			</tr>
		`;
		return;
	}

	itemsTableBody.innerHTML = filtered
		.map((item) => {
			const currentQty = state.quantities[item.id] || 0;
			const isMinusDisabled = currentQty <= 0;
			const isPlusDisabled = currentQty >= item.stock;
			return `
				<tr class="text-sm text-slate-800">
					<td class="px-3 py-3 font-medium">${item.name}</td>
					<td class="px-3 py-3">${formatPeso(item.price)}</td>
					<td class="px-3 py-3 text-slate-600">${item.stock} units</td>
					<td class="px-3 py-3">
						<div class="mx-auto flex w-fit items-center gap-2">
							<button
								type="button"
								data-action="decrement"
								data-id="${item.id}"
								${isMinusDisabled ? "disabled" : ""}
								class="h-6 w-6 border text-xs leading-none ${
									isMinusDisabled
										? "cursor-not-allowed border-slate-200 text-slate-300"
										: "border-slate-400 text-slate-700 hover:bg-slate-100"
								}"
							>−</button>
							<span class="w-5 text-center text-xs font-semibold">${currentQty}</span>
							<button
								type="button"
								data-action="increment"
								data-id="${item.id}"
								${isPlusDisabled ? "disabled" : ""}
								class="h-6 w-6 border text-xs leading-none ${
									isPlusDisabled
										? "cursor-not-allowed border-slate-200 text-slate-300"
										: "border-slate-400 text-slate-700 hover:bg-slate-100"
								}"
							>+</button>
						</div>
					</td>
				</tr>
			`;
		})
		.join("");
}

function renderSummaryPanel() {
	const { selected, itemCount, subtotal, discount, vat, totalDue } = computeSaleTotals();
	if (!selected.length) {
		selectedItemsPanel.innerHTML = "No items selected.";
		itemsCountElement.textContent = "0";
		subtotalElement.textContent = formatPeso(0);
		discountElement.textContent = formatPeso(0);
		vatElement.textContent = formatPeso(0);
		totalDueElement.textContent = formatPeso(0);
		return;
	}

	selectedItemsPanel.innerHTML = selected
		.map((item) => {
			const lineTotal = item.price * item.qty;
			return `
				<div class="mb-2 border-b border-slate-200 pb-2 text-sm last:mb-0 last:border-b-0 last:pb-0">
					<div class="flex items-start justify-between gap-2">
						<p class="font-medium text-slate-800">${item.name}</p>
						<p class="whitespace-nowrap font-semibold text-slate-700">${formatPeso(lineTotal)}</p>
					</div>
					<p class="text-xs text-slate-500">${item.qty} × ${formatPeso(item.price)}</p>
				</div>
			`;
		})
		.join("");

	itemsCountElement.textContent = String(itemCount);
	subtotalElement.textContent = formatPeso(subtotal);
	discountElement.textContent = formatPeso(discount);
	vatElement.textContent = formatPeso(vat);
	totalDueElement.textContent = formatPeso(totalDue);
}

function renderHistoryTable() {
	const transactions = [...state.transactionLog].sort((a, b) => {
		const dateA = new Date(a.dateTime).getTime();
		const dateB = new Date(b.dateTime).getTime();
		return dateB - dateA;
	});

	if (!transactions.length) {
		historyTableBody.innerHTML = `
			<tr>
				<td colspan="6" class="px-2 py-6 text-center text-xs text-black">No transactions available.</td>
			</tr>
		`;
		return;
	}

	historyTableBody.innerHTML = transactions
		.map((txn) => {
			const isVoided = txn.status === "VOIDED";
			const { date, time } = formatDateTime(txn.dateTime);
			const itemCount = txn.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
			const rowClass = isVoided ? "bg-slate-100 text-slate-500" : "text-black";
			const cellClass = isVoided ? "text-slate-500" : "text-black";

			return `
				<tr class="text-xs ${rowClass}">
					<td class="px-2 py-2 font-semibold ${cellClass}">${String(txn.transactionId).slice(-8).toUpperCase()}</td>
					<td class="px-2 py-2 ${cellClass}">
						<div>${date}</div>
						<div>${time}</div>
					</td>
					<td class="px-2 py-2 ${cellClass}">${itemCount} item(s)</td>
					<td class="px-2 py-2 ${cellClass}">${txn.patientId || "N/A"}</td>
					<td class="px-2 py-2 font-medium ${cellClass}">
						${isVoided ? formatPeso(0) : formatPeso(txn.totalAmount || 0)}
						<div class="text-[10px] ${isVoided ? "text-rose-600" : "text-emerald-600"}">${txn.status}</div>
					</td>
					<td class="px-2 py-2">
						<div class="flex items-center justify-end gap-2">
							<button type="button" data-action="view" data-transaction-id="${txn.transactionId}" class="min-w-14 border border-slate-400 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-200">
								VIEW
							</button>
							${
								isVoided
									? '<span class="min-w-14 border border-rose-300 bg-rose-100 px-2 py-1 text-center text-[10px] font-semibold text-rose-600">VOIDED</span>'
									: `<button type="button" data-action="void" data-transaction-id="${txn.transactionId}" class="min-w-14 border border-rose-700 bg-rose-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-rose-600">VOID</button>`
							}
						</div>
					</td>
				</tr>
			`;
		})
		.join("");
}

function renderHeldModalList() {
	if (!state.heldTransactions.length) {
		heldList.innerHTML = '<p class="text-center text-xs text-slate-500">No held transactions.</p>';
		return;
	}

	heldList.innerHTML = state.heldTransactions
		.map(
			(entry) => `
				<div class="border border-slate-200 bg-slate-50 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="font-semibold text-slate-900">${entry.heldId}</p>
							<p class="text-[11px] text-slate-600">${entry.itemCount} item(s) • ${formatPeso(entry.totalDue)}</p>
						</div>
						<button type="button" data-resume-id="${entry.heldId}" class="min-w-20 border border-emerald-600 bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-400">
							RESUME
						</button>
					</div>
				</div>
			`
		)
		.join("");
}

function updateTopTabs() {
	const saleActive = state.activeView === "sale";
	newSaleButton.className = saleActive
		? "min-w-20 border border-cyan-500 bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-500"
		: "min-w-20 border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-600";
	historyButton.className = !saleActive
		? "min-w-20 border border-cyan-500 bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-500"
		: "min-w-20 border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-600";
}

function renderActiveView() {
	const showingSaleView = state.activeView === "sale";
	posView.classList.toggle("hidden", !showingSaleView);
	posView.classList.toggle("block", showingSaleView);
	historyView.classList.toggle("hidden", showingSaleView);
	historyView.classList.toggle("block", !showingSaleView);
	updateTopTabs();
	if (!showingSaleView) {
		renderHistoryTable();
	}
}

function refreshUi() {
	txnIdElement.textContent = state.activeTransactionId ? String(state.activeTransactionId).slice(-8).toUpperCase() : "NEW";
	patientIdInput.value = state.patientId;
	renderTabs();
	renderItemRows();
	renderSummaryPanel();
	updatePaymentLockStatus();
	renderActiveView();
	renderHeldModalList();
}

/* ===== Cart Actions ===== */

function setQuantity(itemId, nextQty) {
	const item = state.products.find((entry) => entry.id === itemId);
	if (!item) return;

	const boundedQty = Math.max(0, Math.min(nextQty, item.stock));
	state.quantities[itemId] = boundedQty;

	const { itemCount } = computeSaleTotals();
	if (itemCount > 0 && !state.patientId) {
		state.patientId = generatePatientId();
	}
	if (itemCount === 0) {
		state.patientId = "";
	}
	refreshUi();
}

function resetActiveSale() {
	Object.keys(state.quantities).forEach((key) => {
		state.quantities[key] = 0;
	});
	state.discountRate = 0;
	state.patientId = "";
	state.activeTransactionId = null;
	searchInput.value = "";
	state.searchTerm = "";
	state.activeCategory = "All Items";
}

/* ===== Transaction Flow ===== */

function openSummaryModal() {
	const totals = computeSaleTotals();
	if (!state.patientId || totals.itemCount === 0) return;

	summaryClinic.textContent = CLINIC_NAME;
	summaryTxnId.textContent = state.activeTransactionId ? String(state.activeTransactionId).slice(-8).toUpperCase() : "PENDING";
	summaryPatientId.textContent = state.patientId;
	summaryItemsBody.innerHTML = totals.selected
		.map(
			(item) => `
				<tr class="text-xs text-slate-700">
					<td class="px-3 py-2">${item.name}</td>
					<td class="px-3 py-2 text-center">${item.qty}</td>
					<td class="px-3 py-2 text-right">${formatPeso(item.qty * item.price)}</td>
				</tr>
			`
		)
		.join("");
	summarySubtotal.textContent = formatPeso(totals.subtotal);
	summaryDiscount.textContent = formatPeso(totals.discount);
	summaryVat.textContent = formatPeso(totals.vat);
	summaryTotal.textContent = formatPeso(totals.totalDue);

	openModal(summaryModal);
}

async function handleProceedToPayment() {
	const totals = computeSaleTotals();
	if (!state.patientId || totals.itemCount === 0) return;

	showLoading("Creating transaction...");

	try {
		// Build items array for API
		const items = totals.selected.map((item) => ({
			productId: item.id,
			quantity: item.qty,
		}));

		// Create transaction on backend
		const result = await createTransaction({
			patientId: state.patientId,
			items,
			discountRate: state.discountRate,
		});

		state.activeTransactionId = result.transactionId;

		// Proceed to payment
		await proceedToPayment(result.transactionId);

		hideLoading();
		openCashModal();
	} catch (error) {
		hideLoading();
		showToast(error.message || "Failed to create transaction", "error");
	}
}

function openCashModal() {
	const totals = computeSaleTotals();
	cashTotalDue.textContent = formatPeso(totals.totalDue);
	cashTenderedInput.value = "";
	cashChangeValue.textContent = formatPeso(0);
	setFinalizeEnabled(false);
	openModal(cashModal);
}

function setFinalizeEnabled(enabled) {
	finalizeBtn.disabled = !enabled;
	finalizeBtn.className = enabled
		? "min-w-28 border border-emerald-600 bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
		: "min-w-28 cursor-not-allowed border border-slate-300 bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-400";
}

function updateCashChange() {
	const { totalDue } = computeSaleTotals();
	const tendered = Number(cashTenderedInput.value || 0);
	const change = tendered - totalDue;
	cashChangeValue.textContent = formatPeso(Math.max(change, 0));
	setFinalizeEnabled(tendered >= totalDue && totalDue > 0);
}

async function handleCompleteSale() {
	if (!state.activeTransactionId) {
		showToast("No active transaction", "error");
		return;
	}

	const tendered = Number(cashTenderedInput.value || 0);
	const { totalDue } = computeSaleTotals();

	if (tendered < totalDue) {
		showToast("Insufficient cash tendered", "error");
		return;
	}

	showLoading("Processing payment...");

	try {
		const result = await completeTransaction(state.activeTransactionId, tendered);

		// Refresh products to get updated stock
		await loadProducts();

		// Build success display data
		const totals = computeSaleTotals();
		state.lastCompletedSale = {
			clinicName: CLINIC_NAME,
			transactionId: result.transactionId,
			patientId: state.patientId,
			selected: totals.selected,
			subtotal: totals.subtotal,
			discount: totals.discount,
			vat: totals.vat,
			totalDue: totals.totalDue,
		};

		hideLoading();
		showSuccessModal();
		showToast("Sale completed successfully!", "success");
	} catch (error) {
		hideLoading();
		showToast(error.message || "Failed to complete sale", "error");
	}
}

function showSuccessModal() {
	if (!state.lastCompletedSale) return;

	successClinic.textContent = state.lastCompletedSale.clinicName;
	successTxnId.textContent = String(state.lastCompletedSale.transactionId).slice(-8).toUpperCase();
	successPatientId.textContent = state.lastCompletedSale.patientId;
	successItems.innerHTML = state.lastCompletedSale.selected
		.map((item) => `<p>${item.name} (${item.qty}) - ${formatPeso(item.qty * item.price)}</p>`)
		.join("");
	successSubtotal.textContent = formatPeso(state.lastCompletedSale.subtotal);
	successDiscount.textContent = formatPeso(state.lastCompletedSale.discount);
	successVat.textContent = formatPeso(state.lastCompletedSale.vat);
	successTotal.textContent = formatPeso(state.lastCompletedSale.totalDue);

	openModal(successModal);
}

/* ===== Hold Transactions (UI-Only) ===== */

function holdCurrentTransaction() {
	const totals = computeSaleTotals();
	if (!totals.itemCount) return;

	state.heldTransactions.push({
		heldId: generateHeldId(),
		patientId: state.patientId,
		items: totals.selected,
		itemCount: totals.itemCount,
		subtotal: totals.subtotal,
		discount: totals.discount,
		vat: totals.vat,
		totalDue: totals.totalDue,
	});

	resetActiveSale();
	closeAllModals();
	refreshUi();
	showToast("Transaction held", "info");
}

function resumeHeldTransaction(heldId) {
	const index = state.heldTransactions.findIndex((entry) => entry.heldId === heldId);
	if (index < 0) return;

	const held = state.heldTransactions[index];
	resetActiveSale();
	held.items.forEach((item) => {
		state.quantities[item.id] = item.qty;
	});
	state.patientId = held.patientId;
	state.heldTransactions.splice(index, 1);
	closeAllModals();
	refreshUi();
	showToast("Transaction resumed", "info");
}

/* ===== History & Void ===== */

function findTransaction(transactionId) {
	return state.transactionLog.find((entry) => String(entry.transactionId) === String(transactionId));
}

function openHistoryTransactionModal(transactionId) {
	const transaction = findTransaction(transactionId);
	if (!transaction) return;

	const { date, time } = formatDateTime(transaction.dateTime);

	historyViewTxnId.textContent = String(transaction.transactionId).slice(-8).toUpperCase();
	historyViewDateTime.textContent = `${date} ${time}`;
	historyViewPatientId.textContent = transaction.patientId || "N/A";
	historyViewStatus.textContent = transaction.status;
	historyViewStatus.className =
		transaction.status === "VOIDED"
			? "rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700"
			: "rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700";

	historyViewItemsBody.innerHTML = (transaction.items || [])
		.map(
			(item) => `
				<tr class="text-xs text-slate-700">
					<td class="px-3 py-2">${item.name}</td>
					<td class="px-3 py-2 text-center">${item.quantity}</td>
					<td class="px-3 py-2 text-right">${formatPeso(item.unitPrice)}</td>
					<td class="px-3 py-2 text-right">${formatPeso(item.lineTotal)}</td>
				</tr>
			`
		)
		.join("");

	historyViewSubtotal.textContent = formatPeso(transaction.subtotal || 0);
	historyViewDiscount.textContent = formatPeso(transaction.discountAmount || 0);
	historyViewVat.textContent = formatPeso(transaction.vatAmount || 0);
	historyViewTotal.textContent = formatPeso(transaction.totalAmount || 0);

	openModal(historyViewModal);
}

function openVoidConfirmation(transactionId) {
	const transaction = findTransaction(transactionId);
	if (!transaction || transaction.status === "VOIDED") return;
	state.pendingVoidTransactionId = transactionId;
	openModal(voidConfirmModal);
}

async function handleVoidTransaction() {
	if (!state.pendingVoidTransactionId) return;

	const transaction = findTransaction(state.pendingVoidTransactionId);
	if (!transaction || transaction.status === "VOIDED") {
		state.pendingVoidTransactionId = null;
		closeAllModals();
		return;
	}

	showLoading("Voiding transaction...");

	try {
		await apiVoidTransaction(state.pendingVoidTransactionId);

		// Refresh history and products
		await Promise.all([loadHistory(), loadProducts()]);

		state.pendingVoidTransactionId = null;
		hideLoading();
		closeAllModals();
		refreshUi();
		showToast("Transaction voided successfully", "success");
	} catch (error) {
		hideLoading();
		showToast(error.message || "Failed to void transaction", "error");
	}
}

/* ===== API Data Loading ===== */

async function loadProducts() {
	try {
		const products = await fetchBillingProducts();
		state.products = products;
	} catch (error) {
		showToast("Failed to load products: " + error.message, "error");
		state.products = [];
	}
}

async function loadHistory() {
	try {
		const history = await fetchHistory();
		state.transactionLog = history;
	} catch (error) {
		showToast("Failed to load history: " + error.message, "error");
		state.transactionLog = [];
	}
}

/* ===== Event Handlers ===== */

function attachEvents() {
	categoryTabs.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const selectedCategory = target.dataset.category;
		if (!selectedCategory) return;
		state.activeCategory = selectedCategory;
		renderTabs();
		renderItemRows();
	});

	searchInput.addEventListener("input", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		state.searchTerm = target.value;
		renderItemRows();
	});

	itemsTableBody.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) return;
		const action = target.dataset.action;
		const idValue = target.dataset.id;
		if (!action || !idValue) return;
		const currentQty = state.quantities[idValue] || 0;
		const nextQty = action === "increment" ? currentQty + 1 : currentQty - 1;
		setQuantity(idValue, nextQty);
	});

	menuPosButton.addEventListener("click", exitBillingMode);

	holdTopButton.addEventListener("click", () => {
		renderHeldModalList();
		openModal(heldModal);
	});

	holdSummaryButton.addEventListener("click", holdCurrentTransaction);
	heldCloseBtn.addEventListener("click", closeAllModals);

	heldList.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) return;
		const heldId = target.dataset.resumeId;
		if (!heldId) return;
		resumeHeldTransaction(heldId);
	});

	newSaleButton.addEventListener("click", async () => {
		state.activeView = "sale";
		resetActiveSale();
		await loadProducts();
		closeAllModals();
		refreshUi();
	});

	historyButton.addEventListener("click", async () => {
		state.activeView = "history";
		showLoading("Loading history...");
		await loadHistory();
		hideLoading();
		renderActiveView();
	});

	historyTableBody.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) return;
		const action = target.dataset.action;
		const transactionId = target.dataset.transactionId;
		if (!action || !transactionId) return;
		if (action === "view") {
			openHistoryTransactionModal(transactionId);
			return;
		}
		if (action === "void") {
			openVoidConfirmation(transactionId);
		}
	});

	historyViewCloseBtn.addEventListener("click", closeAllModals);

	voidCancelBtn.addEventListener("click", () => {
		state.pendingVoidTransactionId = null;
		closeAllModals();
	});

	voidConfirmBtn.addEventListener("click", handleVoidTransaction);

	discountButton.addEventListener("click", () => {
		const input = prompt("Enter discount percentage (0-100):", String(state.discountRate * 100));
		if (input === null) return;
		const percent = parseFloat(input);
		if (isNaN(percent) || percent < 0 || percent > 100) {
			showToast("Invalid discount percentage", "error");
			return;
		}
		state.discountRate = percent / 100;
		refreshUi();
		showToast(`Discount set to ${percent}%`, "info");
	});

	clearAllButton.addEventListener("click", () => {
		resetActiveSale();
		refreshUi();
	});

	proceedButton.addEventListener("click", () => {
		if (proceedButton.disabled) return;
		openSummaryModal();
	});

	summaryBackBtn.addEventListener("click", closeAllModals);
	summaryProceedBtn.addEventListener("click", handleProceedToPayment);

	cashBackBtn.addEventListener("click", openSummaryModal);
	cashTenderedInput.addEventListener("input", updateCashChange);

	finalizeBtn.addEventListener("click", () => {
		if (finalizeBtn.disabled) return;
		handleCompleteSale();
	});

	printSlipBtn.addEventListener("click", () => {
		if (state.lastCompletedSale) {
			window.print();
		}
	});

	nextSaleBtn.addEventListener("click", async () => {
		resetActiveSale();
		await loadProducts();
		closeAllModals();
		state.activeView = "sale";
		refreshUi();
	});

	modalOverlay.addEventListener("click", () => {
		const closableModals = ["summaryModal", "heldModal", "historyViewModal", "voidConfirmModal"];
		if (closableModals.includes(state.currentModal)) {
			closeAllModals();
		}
	});
}

/* ===== Initialization ===== */

async function init() {
	if (!enforceStaffAccessOrRedirect()) return;

	showLoading("Loading billing system...");

	try {
		await Promise.all([loadProducts(), loadHistory()]);
		hideLoading();
		refreshUi();
		attachEvents();
	} catch (error) {
		hideLoading();
		showToast("Failed to initialize billing system", "error");
	}
}

init();
