import { heldTransactions, products, transactionHistory } from "./BillingData.js";

const VAT_RATE = 0.12;
const CLINIC_NAME = "IBMS Clinic";
const tabs = ["All Items", "Medicines", "Medical Supplies", "Medical Equipment", "Diagnostic Kits", "General Supplies"];

const state = {
	activeCategory: "All Items",
	searchTerm: "",
	quantities: {},
	discountRate: 0,
	patientId: "",
	activeView: "sale",
	transactionLog: [...transactionHistory],
	activeTransactionId: "",
	heldCounter: 1,
	currentModal: null,
	lastCompletedSale: null,
	pendingVoidTransactionId: null
};

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

function normalizeTransaction(entry) {
	const items = Array.isArray(entry.items) ? entry.items : [];
	const subtotal = typeof entry.subtotal === "number" ? entry.subtotal : Number(entry.totalAmount || 0);
	const discount = typeof entry.discount === "number" ? entry.discount : 0;
	const vat = typeof entry.vat === "number" ? entry.vat : 0;
	const total = typeof entry.total === "number" ? entry.total : Number(entry.totalAmount || 0);
	return {
		transactionId: entry.transactionId,
		date: entry.date,
		time: entry.time,
		patientId: entry.patientId,
		items,
		subtotal,
		discount,
		vat,
		total,
		status: entry.status === "VOIDED" ? "VOIDED" : "COMPLETED"
	};
}

function formatPeso(value) {
	return `₱${value.toFixed(2)}`;
}

function generateMockTxnId() {
	const suffix = Math.floor(100000 + Math.random() * 900000);
	return `TXN-${suffix}`;
}

function generateMockPatientId() {
	const suffix = Math.floor(100000 + Math.random() * 900000);
	return `PAT-${suffix}`;
}

function generateHeldId() {
	const id = `HLD-${String(state.heldCounter).padStart(4, "0")}`;
	state.heldCounter += 1;
	return id;
}

function getCurrentDateTimeParts() {
	const now = new Date();
	const month = now.getMonth() + 1;
	const day = now.getDate();
	const year = now.getFullYear();
	const hour = String(now.getHours());
	const minute = String(now.getMinutes()).padStart(2, "0");
	return { date: `${month}/${day}/${year}`, time: `${hour}:${minute}` };
}

function getSelectedItems() {
	return products
		.filter((item) => (state.quantities[item.id] || 0) > 0)
		.map((item) => ({ ...item, qty: state.quantities[item.id] }));
}

function getFilteredItems() {
	const term = state.searchTerm.trim().toLowerCase();
	return products.filter((item) => {
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

function renderTabs() {
	categoryTabs.innerHTML = tabs
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

function parseHistoryDateTime(entry) {
	const [month, day, year] = entry.date.split("/").map((value) => Number(value));
	const [hour, minute] = entry.time.split(":").map((value) => Number(value));
	return new Date(year, month - 1, day, hour, minute).getTime();
}

function getHistoryNewestFirst() {
	return [...state.transactionLog].sort((a, b) => parseHistoryDateTime(b) - parseHistoryDateTime(a));
}

function renderHistoryTable() {
	const transactions = getHistoryNewestFirst();
	if (!transactions.length) {
		historyTableBody.innerHTML = `
			<tr>
				<td colspan="6" class="px-2 py-6 text-center text-xs text-black">No transactions available.</td>
			</tr>
		`;
		return;
	}

	historyTableBody.innerHTML = transactions
		.map(
			(transaction) => {
				const isVoided = transaction.status === "VOIDED";
				const rowClass = isVoided ? "bg-slate-100 text-slate-500" : "text-black";
				const cellClass = isVoided ? "text-slate-500" : "text-black";
				return `
				<tr class="text-xs ${rowClass}">
					<td class="px-2 py-2 font-semibold ${cellClass}">${transaction.transactionId}</td>
					<td class="px-2 py-2 ${cellClass}">
						<div>${transaction.date}</div>
						<div>${transaction.time}</div>
					</td>
					<td class="px-2 py-2 ${cellClass}">${transaction.items.reduce((total, item) => total + item.qty, 0)} item(s)</td>
					<td class="px-2 py-2 ${cellClass}">${transaction.patientId}</td>
					<td class="px-2 py-2 font-medium ${cellClass}">
						${isVoided ? formatPeso(0) : formatPeso(transaction.total)}
						<div class="text-[10px] ${isVoided ? "text-rose-600" : "text-emerald-600"}">${transaction.status}</div>
					</td>
					<td class="px-2 py-2">
						<div class="flex items-center justify-end gap-2">
							<button type="button" data-action="view" data-transaction-id="${transaction.transactionId}" class="min-w-14 border border-slate-400 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-200">
								VIEW
							</button>
							${
								isVoided
									? '<span class="min-w-14 border border-rose-300 bg-rose-100 px-2 py-1 text-center text-[10px] font-semibold text-rose-600">VOIDED</span>'
									: `<button type="button" data-action="void" data-transaction-id="${transaction.transactionId}" class="min-w-14 border border-rose-700 bg-rose-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-rose-600">VOID</button>`
							}
						</div>
					</td>
				</tr>
			`;
			}
		)
		.join("");
}

function findTransaction(transactionId) {
	return state.transactionLog.find((entry) => entry.transactionId === transactionId);
}

function openHistoryTransactionModal(transactionId) {
	const transaction = findTransaction(transactionId);
	if (!transaction) {
		return;
	}

	historyViewTxnId.textContent = transaction.transactionId;
	historyViewDateTime.textContent = `${transaction.date} ${transaction.time}`;
	historyViewPatientId.textContent = transaction.patientId;
	historyViewStatus.textContent = transaction.status;
	historyViewStatus.className = transaction.status === "VOIDED"
		? "rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700"
		: "rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700";

	historyViewItemsBody.innerHTML = transaction.items
		.map(
			(item) => `
				<tr class="text-xs text-slate-700">
					<td class="px-3 py-2">${item.name}</td>
					<td class="px-3 py-2 text-center">${item.qty}</td>
					<td class="px-3 py-2 text-right">${formatPeso(item.price)}</td>
					<td class="px-3 py-2 text-right">${formatPeso(item.qty * item.price)}</td>
				</tr>
			`
		)
		.join("");

	historyViewSubtotal.textContent = formatPeso(transaction.subtotal);
	historyViewDiscount.textContent = formatPeso(transaction.discount);
	historyViewVat.textContent = formatPeso(transaction.vat);
	historyViewTotal.textContent = formatPeso(transaction.total);

	openModal(historyViewModal);
}

function openVoidConfirmation(transactionId) {
	const transaction = findTransaction(transactionId);
	if (!transaction || transaction.status === "VOIDED") {
		return;
	}
	state.pendingVoidTransactionId = transactionId;
	openModal(voidConfirmModal);
}

function voidTransaction() {
	if (!state.pendingVoidTransactionId) {
		return;
	}

	const transaction = findTransaction(state.pendingVoidTransactionId);
	if (!transaction || transaction.status === "VOIDED") {
		state.pendingVoidTransactionId = null;
		closeAllModals();
		return;
	}

	transaction.items.forEach((item) => {
		const product = products.find((entry) => entry.id === item.productId);
		if (product) {
			product.stock += item.qty;
		}
	});

	transaction.status = "VOIDED";
	state.pendingVoidTransactionId = null;
	closeAllModals();
	refreshUi();
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

function renderHeldModalList() {
	if (!heldTransactions.length) {
		heldList.innerHTML = '<p class="text-center text-xs text-slate-500">No held transactions.</p>';
		return;
	}

	heldList.innerHTML = heldTransactions
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

function refreshUi() {
	txnIdElement.textContent = state.activeTransactionId;
	patientIdInput.value = state.patientId;
	renderTabs();
	renderItemRows();
	renderSummaryPanel();
	updatePaymentLockStatus();
	renderActiveView();
	renderHeldModalList();
}

function setQuantity(itemId, nextQty) {
	const item = products.find((entry) => entry.id === itemId);
	if (!item) {
		return;
	}

	const boundedQty = Math.max(0, Math.min(nextQty, item.stock));
	state.quantities[itemId] = boundedQty;
	const { itemCount } = computeSaleTotals();
	if (itemCount > 0 && !state.patientId) {
		state.patientId = generateMockPatientId();
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
	searchInput.value = "";
	state.searchTerm = "";
	state.activeCategory = "All Items";
}

function openSummaryModal() {
	const totals = computeSaleTotals();
	if (!state.patientId || totals.itemCount === 0) {
		return;
	}

	summaryClinic.textContent = CLINIC_NAME;
	summaryTxnId.textContent = state.activeTransactionId;
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

function openCashModal() {
	const totals = computeSaleTotals();
	cashTotalDue.textContent = formatPeso(totals.totalDue);
	cashTenderedInput.value = "";
	cashChangeValue.textContent = formatPeso(0);
	finalizeBtn.disabled = true;
	finalizeBtn.className = "min-w-28 cursor-not-allowed border border-slate-300 bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-400";
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

function completeSale() {
	const totals = computeSaleTotals();
	if (!totals.itemCount || !state.patientId) {
		return;
	}

	const { date, time } = getCurrentDateTimeParts();
	const transactionItems = totals.selected.map((item) => ({
		productId: item.id,
		name: item.name,
		qty: item.qty,
		price: item.price,
		lineTotal: item.qty * item.price
	}));

	state.transactionLog.push({
		transactionId: state.activeTransactionId,
		date,
		time,
		items: transactionItems,
		patientId: state.patientId,
		subtotal: Number(totals.subtotal.toFixed(2)),
		discount: Number(totals.discount.toFixed(2)),
		vat: Number(totals.vat.toFixed(2)),
		total: Number(totals.totalDue.toFixed(2)),
		status: "COMPLETED"
	});

	state.lastCompletedSale = {
		clinicName: CLINIC_NAME,
		transactionId: state.activeTransactionId,
		patientId: state.patientId,
		selected: totals.selected,
		subtotal: totals.subtotal,
		discount: totals.discount,
		vat: totals.vat,
		totalDue: totals.totalDue
	};

	successClinic.textContent = state.lastCompletedSale.clinicName;
	successTxnId.textContent = state.lastCompletedSale.transactionId;
	successPatientId.textContent = state.lastCompletedSale.patientId;
	successItems.innerHTML = state.lastCompletedSale.selected
		.map(
			(item) => `<p>${item.name} (${item.qty}) - ${formatPeso(item.qty * item.price)}</p>`
		)
		.join("");
	successSubtotal.textContent = formatPeso(state.lastCompletedSale.subtotal);
	successDiscount.textContent = formatPeso(state.lastCompletedSale.discount);
	successVat.textContent = formatPeso(state.lastCompletedSale.vat);
	successTotal.textContent = formatPeso(state.lastCompletedSale.totalDue);

	openModal(successModal);
}

function holdCurrentTransaction() {
	const totals = computeSaleTotals();
	if (!totals.itemCount) {
		return;
	}

	heldTransactions.push({
		heldId: generateHeldId(),
		patientId: state.patientId,
		items: totals.selected,
		itemCount: totals.itemCount,
		subtotal: totals.subtotal,
		discount: totals.discount,
		vat: totals.vat,
		totalDue: totals.totalDue
	});

	resetActiveSale();
	state.activeTransactionId = generateMockTxnId();
	closeAllModals();
	refreshUi();
}

function resumeHeldTransaction(heldId) {
	const index = heldTransactions.findIndex((entry) => entry.heldId === heldId);
	if (index < 0) {
		return;
	}

	const held = heldTransactions[index];
	resetActiveSale();
	held.items.forEach((item) => {
		state.quantities[item.id] = item.qty;
	});
	state.patientId = held.patientId;
	heldTransactions.splice(index, 1);
	closeAllModals();
	refreshUi();
}

function attachEvents() {
	categoryTabs.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}
		const selectedCategory = target.dataset.category;
		if (!selectedCategory) {
			return;
		}
		state.activeCategory = selectedCategory;
		renderTabs();
		renderItemRows();
	});

	searchInput.addEventListener("input", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) {
			return;
		}
		state.searchTerm = target.value;
		renderItemRows();
	});

	itemsTableBody.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) {
			return;
		}
		const action = target.dataset.action;
		const idValue = Number(target.dataset.id);
		if (!action || Number.isNaN(idValue)) {
			return;
		}
		const currentQty = state.quantities[idValue] || 0;
		const nextQty = action === "increment" ? currentQty + 1 : currentQty - 1;
		setQuantity(idValue, nextQty);
	});

	menuPosButton.addEventListener("click", () => {
		console.log("MenuPOS button clicked");
	});

	holdTopButton.addEventListener("click", () => {
		renderHeldModalList();
		openModal(heldModal);
	});

	holdSummaryButton.addEventListener("click", () => {
		holdCurrentTransaction();
	});

	heldCloseBtn.addEventListener("click", () => {
		closeAllModals();
	});

	heldList.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) {
			return;
		}
		const heldId = target.dataset.resumeId;
		if (!heldId) {
			return;
		}
		resumeHeldTransaction(heldId);
	});

	newSaleButton.addEventListener("click", () => {
		state.activeView = "sale";
		resetActiveSale();
		state.activeTransactionId = generateMockTxnId();
		closeAllModals();
		refreshUi();
	});

	historyButton.addEventListener("click", () => {
		state.activeView = "history";
		renderActiveView();
	});

	historyTableBody.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) {
			return;
		}
		const action = target.dataset.action;
		const transactionId = target.dataset.transactionId;
		if (!action || !transactionId) {
			return;
		}
		if (action === "view") {
			openHistoryTransactionModal(transactionId);
			return;
		}
		if (action === "void") {
			openVoidConfirmation(transactionId);
		}
	});

	historyViewCloseBtn.addEventListener("click", () => {
		closeAllModals();
	});

	voidCancelBtn.addEventListener("click", () => {
		state.pendingVoidTransactionId = null;
		closeAllModals();
	});

	voidConfirmBtn.addEventListener("click", () => {
		voidTransaction();
	});

	discountButton.addEventListener("click", () => {
		console.log("Discount button clicked");
	});

	clearAllButton.addEventListener("click", () => {
		resetActiveSale();
		refreshUi();
	});

	proceedButton.addEventListener("click", () => {
		if (proceedButton.disabled) {
			return;
		}
		openSummaryModal();
	});

	summaryBackBtn.addEventListener("click", () => {
		closeAllModals();
	});

	summaryProceedBtn.addEventListener("click", () => {
		openCashModal();
	});

	cashBackBtn.addEventListener("click", () => {
		openSummaryModal();
	});

	cashTenderedInput.addEventListener("input", updateCashChange);

	finalizeBtn.addEventListener("click", () => {
		if (finalizeBtn.disabled) {
			return;
		}
		completeSale();
	});

	printSlipBtn.addEventListener("click", () => {
		console.log("PRINT SLIP", state.lastCompletedSale);
	});

	nextSaleBtn.addEventListener("click", () => {
		resetActiveSale();
		state.activeTransactionId = generateMockTxnId();
		closeAllModals();
		state.activeView = "sale";
		refreshUi();
	});

	modalOverlay.addEventListener("click", () => {
		if (state.currentModal === "summaryModal" || state.currentModal === "heldModal" || state.currentModal === "historyViewModal" || state.currentModal === "voidConfirmModal") {
			closeAllModals();
		}
	});
}

function init() {
	state.transactionLog = state.transactionLog.map(normalizeTransaction);
	state.activeTransactionId = generateMockTxnId();
	txnIdElement.textContent = state.activeTransactionId;
	refreshUi();
	attachEvents();
}

init();
