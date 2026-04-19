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
import { apiFetch } from "../utils/apiClient.js";
import {
	ALL_CATEGORIES_LABEL,
	isAllCategories,
	normalizeInventoryCategoryKey,
	toCanonicalInventoryCategory,
} from "../utils/inventoryCategories.js";

/* ===== Constants ===== */

const BILLING_MODE_RETURN_KEY = "lastStaffRoute";
const VAT_RATE = 0.12;
const CLINIC_NAME = "ZCMMF";
const PRODUCT_REFRESH_INTERVAL_MS = 60000;
const CART_ITEM_HIDE_PATIENT_INFO_THRESHOLD = 5;
const CART_ITEM_AUTO_SCROLL_THRESHOLD = 2;
const UNSALEABLE_INVENTORY_STATUSES = new Set([
	"expired",
	"pending disposal",
	"disposed",
]);

const SERVICE_CATEGORY_KEYS = new Set([
	"service",
	"services",
	"consultation",
	"consultations",
	"laboratory",
	"lab test",
]);
const PRESCRIPTION_DECISIONS = new Set(["bought_in_clinic", "not_bought_in_clinic"]);

function isLikelyIdValue(value) {
	const normalized = String(value || "").trim();
	if (!normalized) return true;
	if (!/[A-Za-z]/.test(normalized)) return true;
	if (/^[a-f0-9-]{16,}$/i.test(normalized)) return true;
	return false;
}

async function fetchPatientNameById(patientId) {
	const normalizedPatientId = String(patientId || "").trim();
	if (!normalizedPatientId) return "";

	try {
		const result = await apiFetch(`/api/patients/${encodeURIComponent(normalizedPatientId)}`, {
			method: "GET",
		});
		const payload = result?.data || result;
		return String(payload?.patientName || "").trim();
	} catch {
		return "";
	}
}

let patientLookupDebounceTimer = null;
let productRefreshTimer = null;

/* ===== State ===== */

const state = {
	products: [],
	activeProductType: "item",
	activeCategory: ALL_CATEGORIES_LABEL,
	searchTerm: "",
	quantities: {},
	discountRate: 0,
	patientId: "",
	patientName: "",
	parmsIntent: null,
	pendingBalances: [],
	pendingBalanceTotal: 0,
	activeView: "sale",
	transactionLog: [],
	activeTransactionId: null,
	checkoutMode: false,
	cashTendered: 0,
	heldTransactions: [],
	heldCounter: 1,
	currentModal: null,
	lastCompletedSale: null,
	pendingVoidTransactionId: null,
	lastAutoScrolledCartLineCount: 0,
	isLoading: false,
};

/* ===== DOM Elements ===== */

const categoryFilter = document.getElementById("categoryFilter");
const itemsTableBody = document.getElementById("itemsTableBody");
const itemsTableWrapper = document.getElementById("itemsTableWrapper");
const servicesPanel = document.getElementById("servicesPanel");
const servicesList = document.getElementById("servicesList");
const itemsCategoryFilterWrap = document.getElementById("itemsCategoryFilterWrap");
const itemsTabBtn = document.getElementById("itemsTabBtn");
const servicesTabBtn = document.getElementById("servicesTabBtn");
const searchInput = document.getElementById("searchInput");
const selectedItemsPanel = document.getElementById("selectedItems");
const cartTopSection = document.getElementById("cartTopSection");
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
const patientNameInput = document.getElementById("patientNameInput");
const patientIdHint = document.getElementById("patientIdHint");
const pendingBalancesList = document.getElementById("pendingBalancesList");
const pendingBalancesTotal = document.getElementById("pendingBalancesTotal");
const proceedButton = document.getElementById("proceedBtn");
const patientInfoSection = document.getElementById("patientInfoSection");

const menuPosButton = document.getElementById("menuPosBtn");
const holdTopButton = document.getElementById("holdTopBtn");
const holdSummaryButton = document.getElementById("holdSummaryBtn");
const removeAllItemsButton = document.getElementById("removeAllItemsBtn");
const newSaleButton = document.getElementById("newSaleBtn");
const historyButton = document.getElementById("historyBtn");
const discountButton = document.getElementById("discountBtn");
const clearAllButton = document.getElementById("clearAllBtn");
const cartActionSection = document.getElementById("cartActionSection");
const paymentSection = document.getElementById("paymentSection");
const quickCashButtons = document.getElementById("quickCashButtons");
const cashTenderedInlineInput = document.getElementById("cashTenderedInlineInput");
const paymentTotalDue = document.getElementById("paymentTotalDue");
const paymentCashValue = document.getElementById("paymentCashValue");
const paymentChangeValue = document.getElementById("paymentChangeValue");
const paymentStatus = document.getElementById("paymentStatus");
const backToCartBtn = document.getElementById("backToCartBtn");
const finalizeBtn = document.getElementById("finalizeBtn");

const modalOverlay = document.getElementById("modalOverlay");
const successModal = document.getElementById("successModal");
const heldModal = document.getElementById("heldModal");
const historyViewModal = document.getElementById("historyViewModal");
const voidConfirmModal = document.getElementById("voidConfirmModal");
const itemDetailsModal = document.getElementById("itemDetailsModal");

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
const itemDetailsCloseBtn = document.getElementById("itemDetailsCloseBtn");

const modalItemName = document.getElementById("modalItemName");
const modalGenericName = document.getElementById("modalGenericName");
const modalBrandName = document.getElementById("modalBrandName");
const modalCategory = document.getElementById("modalCategory");
const modalStrength = document.getElementById("modalStrength");
const modalDosageForm = document.getElementById("modalDosageForm");
const modalUnit = document.getElementById("modalUnit");
const modalDescription = document.getElementById("modalDescription");
const modalExpiry = document.getElementById("modalExpiry");
const modalWarning = document.getElementById("modalWarning");
const modalSupplier = document.getElementById("modalSupplier");

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

function formatTransactionCode(transactionId) {
	if (!transactionId) return "N/A";
	const year = new Date().getFullYear();
	const suffix = String(transactionId).slice(-5).toUpperCase();
	return `TX-${year}-${suffix}`;
}

function showSuccessToast({ transactionCode, totalAmount }) {
	const toast = document.createElement("div");
	toast.className = "rounded border border-emerald-600 bg-emerald-600 p-3 text-white shadow-lg";
	toast.innerHTML = `
		<div class="text-sm font-semibold">Transaction Successful</div>
		<div class="text-xs opacity-95">Transaction ID: ${transactionCode}</div>
		<div class="text-xs opacity-95">Total Amount: ${formatPeso(totalAmount)}</div>
	`;

	toastContainer.appendChild(toast);

	setTimeout(() => {
		toast.classList.add("opacity-0", "transition-opacity");
		setTimeout(() => toast.remove(), 300);
	}, 6000);
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

function normalizePendingBalanceLines(lines = []) {
	if (!Array.isArray(lines)) return [];

	return lines
		.map((line, index) => {
			const amount = Number(line?.amount || 0);
			if (!Number.isFinite(amount) || amount < 0) return null;
			const sourceType = String(line?.sourceType || "other").trim().toLowerCase();
			const normalizedSourceType = ["laboratory", "prescription"].includes(sourceType) ? sourceType : "other";
			const sourceLabel = String(line?.sourceLabel || "").trim();
			const origin = String(line?.origin || "parms").trim().toLowerCase() === "intent" ? "intent" : "parms";
			const rawObligationKind = String(line?.obligationKind || "").trim().toLowerCase();
			const hasPositiveAmount = amount > 0;
			const obligationKind = ["required_service", "optional_prescription", "reference"].includes(rawObligationKind)
				? rawObligationKind
				: (origin === "parms"
					? (normalizedSourceType === "prescription" ? "optional_prescription" : "required_service")
					: (normalizedSourceType === "prescription"
						? (hasPositiveAmount ? "optional_prescription" : "reference")
						: (hasPositiveAmount ? "required_service" : "reference")));
			const normalizedResolution = String(line?.resolution || "").trim().toLowerCase();
			return {
				sourceType: normalizedSourceType,
				sourceLabel: sourceLabel || null,
				referenceId: String(line?.referenceId || `pending-${index + 1}`),
				description: String(line?.description || "Pending balance").trim(),
				origin,
				obligationKind,
				serviceCode: String(line?.serviceCode || "").trim() || null,
				linkedProductId: String(line?.linkedProductId || "").trim() || null,
				resolution: PRESCRIPTION_DECISIONS.has(normalizedResolution) ? normalizedResolution : "unresolved",
				amount: Number(amount.toFixed(2)),
				isBillable: amount > 0,
				includeInTotal: amount > 0,
			};
		})
		.filter(Boolean);
}

function normalizeLookupText(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function findBestServiceMatchForPendingLine(line) {
	if (!line || line.obligationKind !== "required_service") return null;

	const serviceCandidates = getServiceProducts().filter((product) => !isItemUnsaleable(product));
	if (!serviceCandidates.length) return null;

	const normalizedDescription = normalizeLookupText(line.description);
	const normalizedLabel = normalizeLookupText(line.sourceLabel);
	const normalizedServiceCode = normalizeLookupText(line.serviceCode);
	const isLaboratoryLine = String(line.sourceType || "") === "laboratory";

	let best = null;
	for (const product of serviceCandidates) {
		const normalizedName = normalizeLookupText(product.name);
		const normalizedCategory = normalizeLookupText(product.category);
		const normalizedSubclassification = normalizeLookupText(product.subclassification);
		const normalizedDescriptionText = normalizeLookupText(product.description);
		if (!normalizedName) continue;

		let score = 0;
		if (normalizedDescription && normalizedName === normalizedDescription) score += 120;
		if (normalizedLabel && normalizedName === normalizedLabel) score += 90;
		if (normalizedDescription && normalizedCategory === normalizedDescription) score += 85;
		if (normalizedDescription && normalizedSubclassification === normalizedDescription) score += 75;
		if (normalizedDescription && normalizedName.includes(normalizedDescription)) score += 80;
		if (normalizedDescription && normalizedCategory.includes(normalizedDescription)) score += 70;
		if (normalizedDescription && normalizedSubclassification.includes(normalizedDescription)) score += 60;
		if (normalizedDescription && normalizedDescriptionText.includes(normalizedDescription)) score += 55;
		if (normalizedDescription && normalizedDescription.includes(normalizedName)) score += 70;
		if (normalizedLabel && normalizedName.includes(normalizedLabel)) score += 50;
		if (normalizedLabel && normalizedCategory.includes(normalizedLabel)) score += 45;
		if (normalizedServiceCode && normalizedName.includes(normalizedServiceCode)) score += 40;

		if (isLaboratoryLine && (normalizedName.includes("lab") || normalizedCategory.includes("lab"))) {
			score += 25;
		}

		if (!best || score > best.score) {
			best = { product, score };
		}
	}

	if (!best || best.score <= 0) {
		const fallbackNeedle = `${normalizedDescription} ${normalizedLabel}`;
		if (fallbackNeedle.includes("consult")) {
			return serviceCandidates.find((product) => {
				const normalizedName = normalizeLookupText(product.name);
				const normalizedCategory = normalizeLookupText(product.category);
				return normalizedName.includes("consult") || normalizedCategory.includes("consult");
			}) || null;
		}

		if (fallbackNeedle.includes("lab") || String(line.sourceType || "") === "laboratory") {
			return serviceCandidates.find((product) => {
				const normalizedName = normalizeLookupText(product.name);
				const normalizedCategory = normalizeLookupText(product.category);
				return normalizedName.includes("lab") || normalizedCategory.includes("lab");
			}) || null;
		}

		return null;
	}
	return best.product;
}

function findBestPrescriptionItemMatchForPendingLine(line) {
	if (!line || line.obligationKind !== "optional_prescription") return null;

	const itemCandidates = getItemProducts().filter((product) => !isItemUnsaleable(product));
	if (!itemCandidates.length) return null;

	const normalizedDescription = normalizeLookupText(line.description);
	const normalizedLabel = normalizeLookupText(line.sourceLabel);
	const normalizedServiceCode = normalizeLookupText(line.serviceCode);
	const descriptionTokens = normalizedDescription.split(" ").filter((token) => token.length >= 4);

	let best = null;
	for (const product of itemCandidates) {
		const normalizedName = normalizeLookupText(product.name);
		const normalizedGeneric = normalizeLookupText(product.genericName || product.generic || "");
		const normalizedBrand = normalizeLookupText(product.brandName || product.brand || "");
		const normalizedMedicineName = normalizeLookupText(product.medicineName || "");
		const normalizedDescriptionText = normalizeLookupText(product.description);
		const combinedLookup = [
			normalizedName,
			normalizedGeneric,
			normalizedBrand,
			normalizedMedicineName,
			normalizedDescriptionText,
		]
			.filter(Boolean)
			.join(" ");

		if (!combinedLookup) continue;

		let score = 0;
		if (normalizedDescription && normalizedName === normalizedDescription) score += 140;
		if (normalizedDescription && normalizedGeneric === normalizedDescription) score += 130;
		if (normalizedDescription && normalizedBrand === normalizedDescription) score += 110;
		if (normalizedDescription && normalizedMedicineName === normalizedDescription) score += 120;
		if (normalizedDescription && normalizedName.includes(normalizedDescription)) score += 90;
		if (normalizedDescription && normalizedGeneric.includes(normalizedDescription)) score += 85;
		if (normalizedDescription && normalizedBrand.includes(normalizedDescription)) score += 75;
		if (normalizedDescription && normalizedDescription.includes(normalizedName)) score += 80;
		if (normalizedDescription && normalizedDescription.includes(normalizedGeneric)) score += 70;
		if (normalizedLabel && normalizedName.includes(normalizedLabel)) score += 50;
		if (normalizedLabel && normalizedGeneric.includes(normalizedLabel)) score += 45;
		if (normalizedServiceCode && combinedLookup.includes(normalizedServiceCode)) score += 35;

		if (descriptionTokens.length) {
			const tokenMatches = descriptionTokens.filter((token) => combinedLookup.includes(token)).length;
			score += tokenMatches * 12;
		}

		if (!best || score > best.score) {
			best = { product, score };
		}
	}

	if (!best || best.score <= 0) {
		return null;
	}

	return best.product;
}

function recalculatePendingBalanceTotal() {
	state.pendingBalanceTotal = Number(
		state.pendingBalances
			.reduce((sum, line) => {
				if (!line?.includeInTotal) return sum;
				return sum + Number(line?.amount || 0);
			}, 0)
			.toFixed(2)
	);
}

function getSelectedServiceProductIds() {
	return getSelectedItems()
		.filter((item) => isServiceProduct(item))
		.map((item) => String(item.id || "").trim())
		.filter(Boolean);
}

function reconcilePendingObligationsWithCart() {
	const selectedServiceProductIds = getSelectedServiceProductIds();
	const claimedServiceProductIds = new Set();

	state.pendingBalances = state.pendingBalances.map((line) => {
		if (line.obligationKind === "required_service") {
			let matchedProductId = String(line.linkedProductId || "").trim();
			if (!matchedProductId) {
				const matchedProduct = findBestServiceMatchForPendingLine(line);
				if (matchedProduct) {
					matchedProductId = String(matchedProduct.id || "").trim();
					if (matchedProductId && Number(state.quantities[matchedProductId] || 0) <= 0) {
						state.quantities[matchedProductId] = 1;
					}
				}
			}

			if (!matchedProductId) {
				const manualFallbackId = selectedServiceProductIds.find((id) => !claimedServiceProductIds.has(id));
				if (manualFallbackId) {
					matchedProductId = manualFallbackId;
				}
			}

			const isInCart = Boolean(matchedProductId) && Number(state.quantities[matchedProductId] || 0) > 0;
			if (isInCart && matchedProductId) {
				claimedServiceProductIds.add(matchedProductId);
			}
			return {
				...line,
				linkedProductId: matchedProductId || null,
				resolution: isInCart ? "resolved_in_cart" : "unresolved",
				includeInTotal: false,
			};
		}

		if (line.obligationKind === "optional_prescription") {
			const normalizedResolution = String(line.resolution || "").trim().toLowerCase();
			let matchedProductId = String(line.linkedProductId || "").trim();
			if (!matchedProductId && normalizedResolution === "bought_in_clinic") {
				const matchedProduct = findBestPrescriptionItemMatchForPendingLine(line);
				if (matchedProduct) {
					matchedProductId = String(matchedProduct.id || "").trim();
				}
			}

			if (normalizedResolution === "bought_in_clinic" && matchedProductId && Number(state.quantities[matchedProductId] || 0) <= 0) {
				state.quantities[matchedProductId] = 1;
			}

			const isPrescriptionInCart = Boolean(matchedProductId) && Number(state.quantities[matchedProductId] || 0) > 0;
			const hasDecision = PRESCRIPTION_DECISIONS.has(normalizedResolution);
			return {
				...line,
				linkedProductId: matchedProductId || null,
				resolution: !hasDecision
					? "unresolved"
					: (normalizedResolution === "bought_in_clinic"
						? (isPrescriptionInCart ? "bought_in_clinic" : "unresolved")
						: "not_bought_in_clinic"),
				includeInTotal: false,
			};
		}

		return {
			...line,
			includeInTotal: Number(line.amount || 0) > 0,
		};
	});

	recalculatePendingBalanceTotal();
}

function setPendingBalances(lines = []) {
	const normalizedLines = normalizePendingBalanceLines(lines).map((line) => {
		if (line.obligationKind !== "required_service") {
			return {
				...line,
				includeInTotal: line.obligationKind === "reference" && Number(line.amount || 0) > 0,
			};
		}

		const matchedProduct = findBestServiceMatchForPendingLine(line);
		if (!matchedProduct) {
			return {
				...line,
				linkedProductId: null,
				resolution: "unresolved",
				includeInTotal: false,
			};
		}

		state.quantities[matchedProduct.id] = 1;
		return {
			...line,
			linkedProductId: matchedProduct.id,
			resolution: "resolved_in_cart",
			includeInTotal: false,
		};
	});

	state.pendingBalances = normalizedLines;
	reconcilePendingObligationsWithCart();
}

function getPendingObligationStatus() {
	const unresolvedRequired = state.pendingBalances.filter((line) => (
		line.obligationKind === "required_service" && line.resolution !== "resolved_in_cart"
	)).length;

	return {
		unresolvedRequired,
	};
}

function getPendingLineTypeLabel(line) {
	const sourceType = String(line?.sourceType || "other").trim().toLowerCase();
	if (sourceType === "prescription") return "Prescription";
	if (sourceType === "laboratory") return "Laboratory";
	return "Service Type";
}

function getPendingLineDetails(line) {
	const sourceType = String(line?.sourceType || "other").trim().toLowerCase();
	const sourceLabel = String(line?.sourceLabel || "").trim();
	const description = String(line?.description || "").trim();

	if (sourceType === "other") {
		if (sourceLabel && description && sourceLabel.toLowerCase() !== description.toLowerCase()) {
			return `${sourceLabel} - ${description}`;
		}
		return sourceLabel || description || "N/A";
	}

	return description || sourceLabel || "N/A";
}

async function resolvePatientByName(patientName) {
	if (!patientName || !patientName.trim()) {
		return null;
	}

	try {
		const result = await apiFetch(`/api/patients/search?name=${encodeURIComponent(patientName.trim())}`, {
			method: "GET",
		});
		const payload = result?.data || result;
		if (!payload?.patientId || !payload?.patientName) {
			return null;
		}

		const normalizedPatientId = String(payload.patientId).trim();
		let normalizedPatientName = String(payload.patientName).trim();
		if (
			!normalizedPatientName
			|| normalizedPatientName.toLowerCase() === normalizedPatientId.toLowerCase()
			|| isLikelyIdValue(normalizedPatientName)
		) {
			const fetchedPatientName = await fetchPatientNameById(normalizedPatientId);
			if (fetchedPatientName) {
				normalizedPatientName = fetchedPatientName;
			}
		}

		return {
			patientId: normalizedPatientId,
			patientName: normalizedPatientName || String(patientName || "").trim(),
			pendingBalances: normalizePendingBalanceLines(payload.pendingBalances || []),
			parmsIntent: payload.parmsIntent || null,
		};
	} catch {
		return null;
	}
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
	[successModal, heldModal, historyViewModal, voidConfirmModal, itemDetailsModal].forEach((modal) => {
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

function formatDisplayDate(value) {
	if (!value) return "N/A";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "N/A";
	return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function mapExpiryRiskToUi(value) {
	const normalized = String(value || "").trim().toLowerCase();
	if (normalized === "green" || normalized === "safe") return "safe";
	if (normalized === "yellow" || normalized === "near-expiry" || normalized === "near expiry") return "near-expiry";
	if (normalized === "red" || normalized === "at-risk" || normalized === "at risk") return "at-risk";
	if (normalized === "expired") return "expired";
	return "no-expiry";
}

function getExpiryRiskPill(expiryRisk) {
	const normalized = mapExpiryRiskToUi(expiryRisk);
	if (normalized === "safe") {
		return { label: "Safe", textClass: "text-emerald-700", dotColor: "#16a34a" };
	}
	if (normalized === "near-expiry") {
		return { label: "Near-Expiry", textClass: "text-amber-700", dotColor: "#f59e0b" };
	}
	if (normalized === "at-risk") {
		return { label: "At-Risk", textClass: "text-red-700", dotColor: "#ef4444" };
	}
	if (normalized === "expired") {
		return { label: "Expired", textClass: "text-red-800", dotColor: "#991b1b" };
	}
	return { label: "No Expiry", textClass: "text-gray-600", dotColor: "#9ca3af" };
}

function isItemImmediateReview(item) {
	if (item?.isImmediateReview === true) return true;
	return String(item?.inventoryStatus || "").trim().toLowerCase() === "immediate review";
}

function isItemExpired(item) {
	if (!item) return false;
	if (String(item?.inventoryStatus || "").trim().toLowerCase() === "expired") return true;
	return mapExpiryRiskToUi(item?.expiryRisk || item?.expiryRiskKey || null) === "expired";
}

function isItemUnsaleableByStatus(item) {
	const status = String(item?.inventoryStatus || "").trim().toLowerCase();
	return UNSALEABLE_INVENTORY_STATUSES.has(status);
}

function isItemUnsaleable(item) {
	if (!item) return true;
	if (Number(item.sellableStock ?? item.stock ?? 0) <= 0) return true;
	if (item?.billingDisabled === true && !isItemImmediateReview(item)) return true;
	if (isItemUnsaleableByStatus(item)) return true;
	if (isItemExpired(item)) return true;
	return false;
}

function getUnsaleableMessage(item) {
	if (!item) return "This item cannot be sold.";
	if (isItemExpired(item)) return "Cannot add expired item to the cart.";
	if (String(item?.inventoryStatus || "").trim().toLowerCase() === "pending disposal") {
		return "Cannot sell items pending disposal.";
	}
	if (String(item?.inventoryStatus || "").trim().toLowerCase() === "disposed") {
		return "Cannot sell disposed items.";
	}
	if (Number(item.sellableStock ?? item.stock ?? 0) <= 0) return "Out of stock.";
	return "This item cannot be sold.";
}

function getExpiryWarningLabel(value) {
	if (!value) return "None";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "None";

	const now = new Date();
	const dayMs = 24 * 60 * 60 * 1000;
	const daysLeft = Math.ceil((parsed.getTime() - now.getTime()) / dayMs);

	if (daysLeft < 0) return "Expired";
	if (daysLeft <= 30) return "Expiring Soon";
	return "None";
}

function normalizeBillingProduct(product) {
	const normalizedCategory = toCanonicalInventoryCategory(product.category || "");
	const productType = String(product.type || "").trim().toLowerCase();
	const resolvedType = productType === "service" || productType === "item"
		? productType
		: (SERVICE_CATEGORY_KEYS.has(normalizeInventoryCategoryKey(normalizedCategory)) ? "service" : "item");
	const normalizedDisplayStock = Number(product.stock ?? 0);
	const normalizedSellableStock = Number(product.sellableStock ?? product.stock ?? 0);
	return {
		...product,
		type: resolvedType,
		stock: normalizedDisplayStock,
		sellableStock: normalizedSellableStock,
		category: normalizedCategory,
		expiryRisk: mapExpiryRiskToUi(product.expiryRisk || product.expiryRiskKey || null),
		inventoryStatus: product.inventoryStatus || "",
		isImmediateReview: product.isImmediateReview === true,
		billingDisabled: product.billingDisabled === true,
	};
}

function isServiceProduct(product) {
	if (!product) return false;
	if (String(product.type || "").trim().toLowerCase() === "service") return true;
	const normalizedCategoryKey = normalizeInventoryCategoryKey(product.category || "");
	return SERVICE_CATEGORY_KEYS.has(normalizedCategoryKey);
}

function getItemProducts() {
	return state.products.filter((entry) => !isServiceProduct(entry));
}

function getServiceProducts() {
	return state.products.filter((entry) => isServiceProduct(entry));
}

function hasServiceClassification(service) {
	if (!service || !isServiceProduct(service)) return false;
	const category = String(service.category || "").trim();
	if (!category) return false;
	if (category !== "Lab Test") return true;
	return Boolean(String(service.subclassification || "").trim());
}

function getItemCategoryOptions() {
	const categories = new Set();
	getItemProducts().forEach((item) => {
		const category = String(item.category || "").trim();
		if (category) categories.add(category);
	});
	return [...categories].sort((a, b) => a.localeCompare(b));
}

function renderCategoryFilterOptions() {
	if (!categoryFilter) return;
	const selectedValue = String(state.activeCategory || ALL_CATEGORIES_LABEL).trim();
	const categoryOptions = getItemCategoryOptions();
	const optionsMarkup = categoryOptions
		.map((category) => `<option value="${category}">${category}</option>`)
		.join("");

	categoryFilter.innerHTML = `
		<option value="" disabled>Filter by category</option>
		<option value="${ALL_CATEGORIES_LABEL}">${ALL_CATEGORIES_LABEL}</option>
		${optionsMarkup}
	`;

	const hasSelectedOption = categoryFilter.querySelector(`option[value="${selectedValue}"]`) !== null;
	const appliedValue = hasSelectedOption ? selectedValue : ALL_CATEGORIES_LABEL;
	state.activeCategory = appliedValue;
	categoryFilter.value = appliedValue;

	categoryFilter.classList.toggle("border-cyan-600", !isAllCategories(appliedValue));
	categoryFilter.classList.toggle("bg-cyan-50", !isAllCategories(appliedValue));
}

function openItemDetailsModal(itemId) {
	const item = state.products.find((entry) => String(entry.id) === String(itemId));
	if (!item) return;

	if (modalItemName) modalItemName.textContent = item.name || "N/A";
	if (modalGenericName) modalGenericName.textContent = String(item.genericName || item.generic_name || item.generic || "").trim() || "N/A";
	if (modalBrandName) modalBrandName.textContent = String(item.brandName || item.brand_name || item.brand || item.medicineName || item.name || "").trim() || "N/A";
	if (modalCategory) modalCategory.textContent = item.category || "N/A";
	if (modalStrength) modalStrength.textContent = String(item.strength || item.Strength || item.dose || item.dosageStrength || "").trim() || "N/A";
	if (modalDosageForm) modalDosageForm.textContent = String(item.dosageForm || item.dosage_form || item.dosage || "").trim() || "N/A";
	if (modalUnit) modalUnit.textContent = String(item.unit || "").trim() || "N/A";
	if (modalDescription) modalDescription.textContent = String(item.description || "").trim() || "N/A";
	if (modalExpiry) modalExpiry.textContent = formatDisplayDate(item.expiryDate || item.nearestExpiry || item.nearest_expiry);
	if (modalWarning) {
		modalWarning.textContent = getExpiryWarningLabel(item.expiryDate || item.nearestExpiry || item.nearest_expiry);
		modalWarning.className = "font-semibold text-slate-900";
	}
	if (modalSupplier) modalSupplier.textContent = String(item.supplier || "").trim() || "N/A";

	openModal(itemDetailsModal);
}

/* ===== Data Computation ===== */

function getSelectedItems() {
	return state.products
		.filter((item) => (state.quantities[item.id] || 0) > 0 && !isItemUnsaleable(item))
		.map((item) => {
			const quantity = state.quantities[item.id];
			const subtotal = item.price * quantity;
			return {
				...item,
				qty: quantity,
				subtotal,
			};
		});
}

function hasResolvedPatientForCart() {
	return Boolean(String(state.patientName || "").trim()) && Boolean(state.patientId);
}

function getFilteredItems() {
	const term = state.searchTerm.trim().toLowerCase();
	return getItemProducts().filter((item) => {
		const itemCategoryKey = normalizeInventoryCategoryKey(item.category);
		const activeCategoryKey = normalizeInventoryCategoryKey(state.activeCategory);
		const categoryMatch = isAllCategories(state.activeCategory) || itemCategoryKey === activeCategoryKey;
		const searchMatch = item.name.toLowerCase().includes(term);
		return categoryMatch && searchMatch;
	});
}

function getFilteredServices() {
	const term = state.searchTerm.trim().toLowerCase();
	return getServiceProducts().filter((service) => {
		if (!hasServiceClassification(service)) return false;
		if (!term) return true;
		const combinedText = [service.name, service.description, service.category, service.subclassification]
			.map((value) => String(value || "").toLowerCase())
			.join(" ");
		return combinedText.includes(term);
	});
}

function groupServicesByClassification(services = []) {
	const categoryMap = new Map();

	services.forEach((service) => {
		const category = String(service.category || "Services").trim() || "Services";
		const subclassification = String(service.subclassification || "").trim() || "General";

		if (!categoryMap.has(category)) {
			categoryMap.set(category, new Map());
		}

		const subMap = categoryMap.get(category);
		if (!subMap.has(subclassification)) {
			subMap.set(subclassification, []);
		}

		subMap.get(subclassification).push(service);
	});

	return [...categoryMap.entries()]
		.map(([category, subclasses]) => ({
			category,
			subclasses: [...subclasses.entries()].map(([subclassification, rows]) => ({
				subclassification,
				rows,
			})),
		}))
		.sort((a, b) => a.category.localeCompare(b.category));
}

function computeSaleTotals() {
	const selected = getSelectedItems();
	const itemCount = selected.reduce((total, item) => total + item.qty, 0);
	const subtotal = selected.reduce((total, item) => total + item.subtotal, 0);
	const discount = subtotal * state.discountRate;
	const discountedSubtotal = Math.max(subtotal - discount, 0);
	const vat = discountedSubtotal * VAT_RATE;
	const pendingTotal = Number(state.pendingBalanceTotal || 0);
	// Prices are VAT-inclusive; keep VAT as display-only and do not add it again.
	const totalDue = discountedSubtotal + pendingTotal;
	return { selected, itemCount, subtotal, discount, vat, pendingTotal, totalDue };
}

/* ===== Rendering ===== */

function setProceedButtonEnabled(enabled) {
	proceedButton.disabled = !enabled;
	proceedButton.className = enabled
		? "w-full bg-emerald-500 py-2.5 text-xs font-semibold text-white hover:bg-emerald-400"
		: "w-full cursor-not-allowed bg-slate-200 py-2.5 text-xs font-semibold text-slate-400";
}

function updatePaymentLockStatus() {
	reconcilePendingObligationsWithCart();
	const { itemCount, pendingTotal } = computeSaleTotals();
	const { unresolvedRequired } = getPendingObligationStatus();
	const hasBillableLines = itemCount > 0 || pendingTotal > 0;
	const hasReferenceOnlyLines = !hasBillableLines && state.pendingBalances.length > 0;
	const hasBlockingObligations = unresolvedRequired > 0;
	if (!state.patientId) {
		txnStatusElement.textContent = "WAITING FOR PATIENT NAME";
		txnStatusElement.className = "font-semibold text-amber-300";
		patientIdHint.textContent = "Type patient name to resolve patient ID and PARMS balances.";
		patientIdHint.className = "mt-1 text-[10px] text-slate-400";
		setProceedButtonEnabled(false);
		return;
	}

	if (unresolvedRequired > 0) {
		txnStatusElement.textContent = "WAITING FOR REQUIRED SERVICES";
		txnStatusElement.className = "font-semibold text-amber-300";
		patientIdHint.textContent = `Add all required PARMS service lines to cart (${unresolvedRequired} remaining).`;
		patientIdHint.className = "mt-1 text-[10px] text-amber-300";
		setProceedButtonEnabled(false);
		return;
	}

	txnStatusElement.textContent = hasBillableLines ? "READY FOR PAYMENT" : "WAITING FOR BILLABLE LINES";
	txnStatusElement.className = hasBillableLines && !hasBlockingObligations ? "font-semibold text-emerald-400" : "font-semibold text-amber-300";
	patientIdHint.textContent = hasBillableLines && !hasBlockingObligations
		? "Patient resolved. You can proceed to payment."
		: hasReferenceOnlyLines
			? "Patient resolved. PARMS lines loaded for reference, but no billable amount is available yet."
			: "Patient resolved. Add items or include pending balances to continue.";
	patientIdHint.className = hasBillableLines && !hasBlockingObligations ? "mt-1 text-[10px] text-emerald-300" : "mt-1 text-[10px] text-slate-400";
	setProceedButtonEnabled(hasBillableLines && !hasBlockingObligations && Boolean(state.patientId));
}

function renderPendingBalancesPanel() {
	if (!pendingBalancesList || !pendingBalancesTotal) return;

	if (!state.pendingBalances.length) {
		pendingBalancesList.innerHTML = '<p class="text-[10px] text-slate-400">No pending balances.</p>';
		pendingBalancesTotal.textContent = formatPeso(0);
		return;
	}

	const isLockedForCheckout = state.checkoutMode;
	const pendingBalanceCardsMarkup = state.pendingBalances
		.map((line) => {
			const lineAmount = Number(line?.amount || 0);
			const amountClass = lineAmount > 0 ? "text-amber-300" : "text-slate-400";
			const typeLabel = getPendingLineTypeLabel(line);
			const details = getPendingLineDetails(line);
			const obligationKind = String(line?.obligationKind || "reference").trim().toLowerCase();
			const isRequiredService = obligationKind === "required_service";
			const isOptionalPrescription = obligationKind === "optional_prescription";
			const isResolvedService = isRequiredService && String(line?.resolution || "") === "resolved_in_cart";
			const hasPrescriptionDecision = isOptionalPrescription && PRESCRIPTION_DECISIONS.has(String(line?.resolution || "").trim().toLowerCase());
			const isPrescriptionBoughtInClinic = isOptionalPrescription && String(line?.resolution || "").trim().toLowerCase() === "bought_in_clinic";
			const prescriptionLinkedProductId = String(line?.linkedProductId || "").trim();
			const isPrescriptionInCart = Boolean(prescriptionLinkedProductId) && Number(state.quantities[prescriptionLinkedProductId] || 0) > 0;
			const prescriptionDecisionLabel = String(line?.resolution || "") === "not_bought_in_clinic"
				? "Not bought in clinic"
				: "Bought in clinic";

			let lineAmountLabel = line.includeInTotal ? formatPeso(lineAmount) : "Info";
			let lineAmountTone = amountClass;
			if (isRequiredService) {
				lineAmountLabel = isResolvedService ? "Added" : "Required";
				lineAmountTone = isResolvedService ? "text-emerald-300" : "text-amber-300";
			} else if (isOptionalPrescription) {
				lineAmountLabel = isPrescriptionBoughtInClinic && isPrescriptionInCart ? "Added" : "Optional";
				lineAmountTone = isPrescriptionBoughtInClinic && isPrescriptionInCart ? "text-emerald-300" : "text-cyan-300";
			}

			const statusMarkup = isRequiredService
				? `<p class="text-[10px] ${isResolvedService ? "text-emerald-300" : "text-rose-300"}">${isResolvedService ? "Required service in cart" : "Required service is not in cart"}</p>`
				: isOptionalPrescription
					? `<p class="text-[10px] ${isPrescriptionBoughtInClinic && isPrescriptionInCart ? "text-emerald-300" : "text-cyan-300"}">${hasPrescriptionDecision ? (isPrescriptionBoughtInClinic && isPrescriptionInCart ? "Bought in clinic and added to cart" : prescriptionDecisionLabel) : "Optional: buy in clinic if patient prefers"}</p>`
					: "";

			const prescriptionActions = isOptionalPrescription
				? `
					<div class="mt-1 flex flex-wrap gap-1">
						<button
							type="button"
							data-action="mark-prescription-bought"
							data-reference-id="${line.referenceId}"
							${isLockedForCheckout ? "disabled" : ""}
							class="rounded border px-1.5 py-0.5 text-[10px] ${String(line?.resolution || "") === "bought_in_clinic" ? "border-emerald-500 bg-emerald-500/20 text-emerald-200" : "border-slate-500 text-slate-300"} ${isLockedForCheckout ? "cursor-not-allowed opacity-60" : "hover:border-emerald-400"}"
						>
							Bought in clinic
						</button>
						<button
							type="button"
							data-action="mark-prescription-not-bought"
							data-reference-id="${line.referenceId}"
							${isLockedForCheckout ? "disabled" : ""}
							class="rounded border px-1.5 py-0.5 text-[10px] ${String(line?.resolution || "") === "not_bought_in_clinic" ? "border-cyan-500 bg-cyan-500/20 text-cyan-200" : "border-slate-500 text-slate-300"} ${isLockedForCheckout ? "cursor-not-allowed opacity-60" : "hover:border-cyan-400"}"
						>
							Not bought in clinic
						</button>
					</div>
				`
				: "";

			return `
				<div class="min-w-0 rounded border border-slate-700/70 bg-slate-900/40 p-1.5">
					<div class="flex items-center justify-between gap-2">
						<span class="truncate text-slate-200" title="${details}">${typeLabel}: ${details}</span>
						<span class="shrink-0 ${lineAmountTone}">${lineAmountLabel}</span>
					</div>
					${statusMarkup}
					${prescriptionActions}
				</div>
			`;
		})
		.join("");

	pendingBalancesList.innerHTML = `
		<div class="grid grid-cols-2 gap-1.5">
			${pendingBalanceCardsMarkup}
		</div>
	`;

	pendingBalancesTotal.textContent = formatPeso(state.pendingBalanceTotal);
}

function renderItemRows() {
	const filtered = getFilteredItems();
	const patientReadyForCart = hasResolvedPatientForCart();
	if (!filtered.length) {
		itemsTableBody.innerHTML = `
			<tr>
				<td colspan="5" class="px-3 py-6 text-center text-sm text-slate-500">No items found.</td>
			</tr>
		`;
		return;
	}

	itemsTableBody.innerHTML = filtered
		.map((item) => {
			const currentQty = state.quantities[item.id] || 0;
			const displayQty = currentQty > 0 ? currentQty : 0;
			const maxSellableStock = Number(item.sellableStock ?? item.stock ?? 0);
			const checkoutLocked = state.checkoutMode;
			const isNotSellable = isItemUnsaleable(item);
			const disabledTooltip = isItemExpired(item) ? "Cannot sell expired items." : getUnsaleableMessage(item);
			const isMinusDisabled = isNotSellable || checkoutLocked || currentQty <= 0;
			const isPlusDisabled = isNotSellable || checkoutLocked || !patientReadyForCart || currentQty >= maxSellableStock;
			const isQtyInputDisabled = isNotSellable || checkoutLocked || !patientReadyForCart;
			const controlTooltip = checkoutLocked
				? "Back to cart to edit quantities."
				: (!patientReadyForCart
					? "Type and resolve patient name before adding items to cart."
					: disabledTooltip);
			return `
				<tr class="text-sm ${isNotSellable ? "bg-slate-100/80 text-slate-400 opacity-70" : "text-slate-800"}">
					<td class="px-3 py-3 font-medium">
						${isNotSellable
							? `<span class="text-left font-medium text-slate-400">${item.name}</span>`
							: `<button type="button" class="billing-item-link bg-transparent border-0 p-0 text-left font-medium hover:underline" data-action="view-item" data-id="${item.id}">${item.name}</button>`}
					</td>
					<td class="px-3 py-3 ${isNotSellable ? "text-slate-400" : "text-slate-600"}">${String(item.strength || item.Strength || item.dose || item.dosageStrength || "").trim() || "N/A"}</td>
					<td class="px-3 py-3 ${isNotSellable ? "text-slate-400" : ""}">${formatPeso(item.price)}</td>
					<td class="px-3 py-3 ${isNotSellable ? "text-slate-400" : "text-slate-600"}">${item.stock} units</td>
					<td class="px-3 py-3">
						<div class="mx-auto flex w-fit items-center gap-2" ${(isNotSellable || checkoutLocked || !patientReadyForCart) ? `title="${controlTooltip}"` : ""}>
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
							<input
								type="number"
								data-role="qty-input"
								data-id="${item.id}"
								min="0"
								max="${maxSellableStock}"
								step="1"
								inputmode="numeric"
								value="${isNotSellable ? 0 : displayQty}"
								${isQtyInputDisabled ? "disabled" : ""}
								class="pos-qty-input h-6 w-[55px] border border-slate-300 bg-white px-1 text-center text-xs font-semibold text-slate-800 outline-none focus:border-cyan-600${
									isQtyInputDisabled ? " cursor-not-allowed bg-slate-100 text-slate-400" : ""
								}"
							/>
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

function renderServiceRows() {
	if (!servicesList) return;
	const filteredServices = getFilteredServices();
	const patientReadyForCart = hasResolvedPatientForCart();
	if (!filteredServices.length) {
		servicesList.innerHTML = `
			<div class="rounded border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-500">
				No services found.
			</div>
		`;
		return;
	}

	const groupedServices = groupServicesByClassification(filteredServices);

	servicesList.innerHTML = groupedServices
		.map((group) => {
			const subclassesMarkup = group.subclasses
				.sort((a, b) => a.subclassification.localeCompare(b.subclassification))
				.map((subgroup) => {
					const showSubclassHeading = subgroup.subclassification !== "General" || group.category === "Lab Test";
					const serviceRows = subgroup.rows
						.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
						.map((service) => {
							const isSelected = (state.quantities[service.id] || 0) > 0;
							const isLockedForCheckout = state.checkoutMode;
							const selectionBlockedByPatient = !patientReadyForCart && !isSelected;
							const isDisabled = isLockedForCheckout || isItemUnsaleable(service) || selectionBlockedByPatient;
							const helperMessage = isLockedForCheckout
								? "Back to cart to edit selected services."
								: (isItemUnsaleable(service)
									? getUnsaleableMessage(service)
									: (selectionBlockedByPatient
										? "Type and resolve patient name before adding services to cart."
										: "Select to include this service in the cart."));

							return `
								<label class="flex w-full max-w-full min-w-0 items-start gap-3 rounded border border-slate-200 bg-white px-3 py-2 transition ${isSelected ? "border-cyan-400 bg-cyan-50/60" : "hover:border-slate-300"}">
									<input
										type="checkbox"
										data-role="service-checkbox"
										data-id="${service.id}"
										${isSelected ? "checked" : ""}
										${isDisabled ? "disabled" : ""}
										class="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}"
									/>
									<div class="min-w-0 flex-1">
										<div class="flex items-start justify-between gap-2">
											<div class="min-w-0">
												<p class="break-words text-sm font-semibold text-slate-800">${service.name}</p>
												<p class="break-words text-[11px] text-slate-500">${service.description || "Service"}</p>
											</div>
											<p class="shrink-0 text-sm font-semibold text-slate-900">${formatPeso(service.price)}</p>
										</div>
										<p class="mt-1 text-[11px] ${isDisabled ? "text-rose-500" : "text-slate-500"}">${helperMessage}</p>
									</div>
								</label>
							`;
						})
						.join("");

					return `
						<div class="space-y-2">
							${showSubclassHeading ? `<p class="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">${subgroup.subclassification}</p>` : ""}
							<div class="space-y-2">${serviceRows}</div>
						</div>
					`;
				})
				.join("");

			return `
				<section class="w-full max-w-full min-w-0 rounded border border-slate-200 bg-slate-100/60 p-2">
					<p class="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-700">${group.category}</p>
					<div class="space-y-3">${subclassesMarkup}</div>
				</section>
			`;
		})
		.join("");
}

function renderProductTypeTabs() {
	if (!itemsTabBtn || !servicesTabBtn) return;
	const showingItems = state.activeProductType === "item";

	itemsTabBtn.setAttribute("aria-selected", showingItems ? "true" : "false");
	servicesTabBtn.setAttribute("aria-selected", showingItems ? "false" : "true");

	itemsTabBtn.className = showingItems
		? "flex-1 rounded bg-cyan-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm"
		: "flex-1 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900";

	servicesTabBtn.className = !showingItems
		? "flex-1 rounded bg-cyan-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm"
		: "flex-1 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900";
}

function renderProductPanel() {
	const showingItems = state.activeProductType === "item";
	if (itemsTableWrapper) itemsTableWrapper.classList.toggle("hidden", !showingItems);
	if (servicesPanel) servicesPanel.classList.toggle("hidden", showingItems);
	if (itemsCategoryFilterWrap) itemsCategoryFilterWrap.classList.toggle("hidden", !showingItems);
	if (searchInput) {
		searchInput.placeholder = showingItems
			? "Search by medicine name..."
			: "Search by service name...";
	}

	renderCategoryFilterOptions();
	renderProductTypeTabs();

	if (showingItems) {
		renderItemRows();
		return;
	}

	renderServiceRows();
}

function validateCommittedQuantity(item, rawValue, previousQty) {
	const cleaned = String(rawValue ?? "").replace(/[^\d-]/g, "").trim();

	if (!cleaned) {
		return previousQty > 0 ? previousQty : 0;
	}

	const parsed = Number.parseInt(cleaned, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return 0;
	}

	return Math.min(parsed, Number(item.sellableStock ?? item.stock ?? 0));
}

function commitQuantityInput(inputEl) {
	if (!(inputEl instanceof HTMLInputElement) || inputEl.dataset.role !== "qty-input") return;

	const idValue = inputEl.dataset.id;
	if (!idValue) return;

	const item = state.products.find((entry) => entry.id === idValue);
	if (!item || isItemUnsaleable(item)) {
		if (item) {
			showToast(getUnsaleableMessage(item), "error");
		}
		inputEl.value = "0";
		state.quantities[idValue] = 0;
		refreshUi();
		return;
	}

	const previousQty = state.quantities[idValue] || 0;
	const committedQty = validateCommittedQuantity(item, inputEl.value, previousQty);
	inputEl.value = String(committedQty);
	setQuantity(idValue, committedQty);
}

function updatePatientInfoVisibility(selectedLineCount = getSelectedItems().length) {
	if (!patientInfoSection) return;
	const hideForDenseCart = selectedLineCount >= CART_ITEM_HIDE_PATIENT_INFO_THRESHOLD;
	patientInfoSection.classList.toggle("hidden", state.checkoutMode || hideForDenseCart);
}

function updateCartTopAutoScroll(selectedLineCount = 0) {
	if (!cartTopSection) return;
	const hasReachedThreshold = selectedLineCount >= CART_ITEM_AUTO_SCROLL_THRESHOLD;
	const lineCountChanged = selectedLineCount !== state.lastAutoScrolledCartLineCount;
	if (hasReachedThreshold && lineCountChanged) {
		cartTopSection.scrollTop = cartTopSection.scrollHeight;
	}
	state.lastAutoScrolledCartLineCount = selectedLineCount;
}

function renderSummaryPanel() {
	const { selected, itemCount, subtotal, discount, vat, pendingTotal, totalDue } = computeSaleTotals();
	updatePatientInfoVisibility(selected.length);
	updateCartTopAutoScroll(selected.length);
	if (!selected.length) {
		selectedItemsPanel.innerHTML = state.pendingBalances.length
			? `<div class="text-xs text-slate-500">No inventory items selected.</div>`
			: "No items selected.";
		itemsCountElement.textContent = "0";
		subtotalElement.textContent = formatPeso(0);
		discountElement.textContent = formatPeso(0);
		vatElement.textContent = formatPeso(0);
		totalDueElement.textContent = formatPeso(pendingTotal);
		renderPendingBalancesPanel();
		renderInlinePayment();
		return;
	}

	selectedItemsPanel.innerHTML = selected
		.map((item) => {
			const lineTotal = item.subtotal;
			const isLockedForCheckout = state.checkoutMode;
			return `
				<div class="mb-2 border-b border-slate-200 pb-2 text-sm last:mb-0 last:border-b-0 last:pb-0" data-cart-item-id="${item.id}">
					<div class="flex items-start justify-between gap-2">
						<p class="min-w-0 flex-1 break-words pr-1 font-medium text-slate-800">${item.name}</p>
						<button type="button" data-action="remove-cart-item" data-id="${item.id}" ${isLockedForCheckout ? "disabled" : ""} class="shrink-0 rounded border border-rose-300 px-2 py-0.5 text-[10px] font-semibold ${
							isLockedForCheckout ? "cursor-not-allowed text-rose-300" : "text-rose-700 hover:bg-rose-50"
						}">Remove</button>
					</div>
					<p class="text-xs text-slate-500">Price: ${formatPeso(item.price)}</p>
					<p class="mt-1 text-xs font-semibold text-slate-700">Subtotal: ${formatPeso(lineTotal)}</p>
				</div>
			`;
		})
		.join("");

	itemsCountElement.textContent = String(itemCount);
	subtotalElement.textContent = formatPeso(subtotal);
	discountElement.textContent = formatPeso(discount);
	vatElement.textContent = formatPeso(vat);
	totalDueElement.textContent = formatPeso(totalDue);
	renderPendingBalancesPanel();
	renderInlinePayment();
}

function setCheckoutMode(enabled) {
	state.checkoutMode = Boolean(enabled);
	if (!state.checkoutMode) {
		state.cashTendered = 0;
		// Clear quick button active states when exiting checkout
		quickCashButtons?.querySelectorAll("button").forEach((btn) => {
			btn.classList.remove("border-cyan-600", "bg-cyan-50", "text-cyan-700");
			btn.classList.add("border-slate-300", "bg-white", "text-slate-700");
		});
	}
	updatePatientInfoVisibility();
	renderInlinePayment();
}

function renderInlinePayment() {
	if (!paymentSection || !cartActionSection) return;
	const totals = computeSaleTotals();
	const showPayment = state.checkoutMode;
	cartActionSection.classList.toggle("hidden", showPayment);
	paymentSection.classList.toggle("hidden", !showPayment);
	paymentTotalDue.textContent = formatPeso(totals.totalDue);
	paymentCashValue.textContent = formatPeso(state.cashTendered || 0);
	const change = Math.max((state.cashTendered || 0) - totals.totalDue, 0);
	paymentChangeValue.textContent = formatPeso(change);

	if (!showPayment) {
		return;
	}

	const hasSufficientCash = totals.totalDue > 0 && (state.cashTendered || 0) >= totals.totalDue;
	let statusMsg = "Enter cash amount.";
	let statusColor = "text-amber-600";
	if (totals.totalDue <= 0) {
		statusMsg = "No payable amount.";
		statusColor = "text-slate-500";
	} else if (state.cashTendered > 0) {
		if (hasSufficientCash) {
			statusMsg = "✔ Payment sufficient. Ready to finalize.";
			statusColor = "text-emerald-600";
		} else {
			const shortage = totals.totalDue - state.cashTendered;
			statusMsg = `Insufficient: Need ₱${shortage.toFixed(2)} more.`;
			statusColor = "text-rose-600";
		}
	}
	paymentStatus.textContent = statusMsg;
	paymentStatus.className = `text-[11px] font-semibold ${statusColor}`;

	setFinalizeEnabled(hasSufficientCash);
	if (cashTenderedInlineInput) {
		cashTenderedInlineInput.value = state.cashTendered ? String(state.cashTendered) : "";
	}
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
				<td colspan="7" class="px-2 py-6 text-center text-xs text-black">No transactions available.</td>
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
					<td class="px-2 py-2 ${cellClass}">${txn.patientName || "N/A"}</td>
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
							<p class="font-semibold text-slate-900">${entry.patientName || "Unknown Patient"}</p>
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
	if (patientNameInput) patientNameInput.value = state.patientName;
	reconcilePendingObligationsWithCart();
	renderProductPanel();
	renderSummaryPanel();
	updatePaymentLockStatus();
	renderActiveView();
	renderHeldModalList();
}

/* ===== Cart Actions ===== */

function setQuantity(itemId, nextQty) {
	const item = state.products.find((entry) => entry.id === itemId);
	if (!item) return;
	const currentQty = Number(state.quantities[itemId] || 0);
	if (nextQty > currentQty && !hasResolvedPatientForCart()) {
		showToast("Type and resolve patient name before adding to cart.", "warning");
		refreshUi();
		return;
	}
	if (isItemUnsaleable(item)) {
		if (nextQty > 0) {
			showToast(getUnsaleableMessage(item), "error");
		}
		state.quantities[itemId] = 0;
		refreshUi();
		return;
	}

	const maxSellableStock = Number(item.sellableStock ?? item.stock ?? 0);
	let boundedQty = Math.max(0, Math.min(nextQty, maxSellableStock));
	if (isServiceProduct(item)) {
		boundedQty = boundedQty > 0 ? 1 : 0;
	}
	state.quantities[itemId] = boundedQty;

	const { itemCount } = computeSaleTotals();
	if (itemCount === 0 && state.pendingBalanceTotal <= 0 && state.pendingBalances.length === 0) {
		state.patientId = "";
		state.patientName = "";
		state.parmsIntent = null;
		setPendingBalances([]);
	}
	refreshUi();
}

function removeCartItem(itemId) {
	if (!itemId) return;
	setQuantity(itemId, 0);
}

function removeAllCartItemsOnly() {
	Object.keys(state.quantities).forEach((key) => {
		state.quantities[key] = 0;
	});
	if (state.checkoutMode) {
		setCheckoutMode(false);
	}
	refreshUi();
	showToast("All cart items removed.", "info");
}

function resetActiveSale() {
	Object.keys(state.quantities).forEach((key) => {
		state.quantities[key] = 0;
	});
	state.checkoutMode = false;
	state.cashTendered = 0;
	state.discountRate = 0;
	state.patientId = "";
	state.patientName = "";
	state.parmsIntent = null;
	setPendingBalances([]);
	state.activeTransactionId = null;
	state.activeProductType = "item";
	searchInput.value = "";
	state.searchTerm = "";
	state.activeCategory = ALL_CATEGORIES_LABEL;
	if (cashTenderedInlineInput) {
		cashTenderedInlineInput.value = "";
	}
	state.lastAutoScrolledCartLineCount = 0;
	// Ensure patient info is visible after transaction completes
	if (patientInfoSection) {
		patientInfoSection.classList.remove("hidden");
	}
	if (cartTopSection) {
		cartTopSection.scrollTop = 0;
	}
}

/* ===== Transaction Flow ===== */

async function handleProceedToPayment() {
	reconcilePendingObligationsWithCart();
	const totals = computeSaleTotals();
	if (!state.patientId || (totals.itemCount === 0 && totals.pendingTotal <= 0)) return;

	const { unresolvedRequired } = getPendingObligationStatus();
	if (unresolvedRequired > 0) {
		showToast("Add all required PARMS service lines to cart before payment.", "warning");
		return;
	}

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
			patientName: state.patientName,
			items,
			discountRate: state.discountRate,
			pendingBalances: state.pendingBalances,
			parmsIntentId: state.parmsIntent?.intentId || null,
		});

		state.activeTransactionId = result.transactionId;

		// Proceed to payment
		await proceedToPayment(result.transactionId);

		hideLoading();
		setCheckoutMode(true);
	} catch (error) {
		hideLoading();
		showToast(error.message || "Failed to create transaction", "error");
	}
}

function setFinalizeEnabled(enabled) {
	finalizeBtn.disabled = !enabled;
	finalizeBtn.className = enabled
		? "border border-emerald-600 bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
		: "cursor-not-allowed border border-slate-300 bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-400";
}

function updateCashChange() {
	const rawValue = cashTenderedInlineInput?.value || "";
	const nextAmount = parseFloat(rawValue);
	if (rawValue === "") {
		state.cashTendered = 0;
	} else if (Number.isNaN(nextAmount) || nextAmount < 0) {
		state.cashTendered = 0;
		if (cashTenderedInlineInput) cashTenderedInlineInput.value = "";
	} else {
		state.cashTendered = nextAmount;
	}
	renderInlinePayment();
}

function applyQuickCash(amount) {
	state.cashTendered = Number(amount || 0);
	renderInlinePayment();
}

async function handleCompleteSale() {
	if (!state.activeTransactionId) {
		showToast("No active transaction", "error");
		return;
	}

	const tendered = Number(state.cashTendered || 0);
	const { totalDue } = computeSaleTotals();

	if (tendered < totalDue) {
		showToast("Insufficient cash tendered", "error");
		return;
	}

	setFinalizeEnabled(false);
	showLoading("Processing payment...");

	try {
		const totalsBeforeReset = computeSaleTotals();
		const result = await completeTransaction(state.activeTransactionId, tendered);

		// Refresh products to get updated stock
		await loadProducts();

		// Build success display data
		state.lastCompletedSale = {
			clinicName: CLINIC_NAME,
			transactionId: result.transactionId,
			transactionCode: formatTransactionCode(result.transactionId),
			patientId: state.patientId,
			patientName: state.patientName,
			selected: totalsBeforeReset.selected,
			pendingBalances: [...state.pendingBalances],
			pendingBalanceTotal: totalsBeforeReset.pendingTotal,
			subtotal: totalsBeforeReset.subtotal,
			discount: totalsBeforeReset.discount,
			vat: totalsBeforeReset.vat,
			totalDue: totalsBeforeReset.totalDue,
			confirmedTotalAmount: Number(result.totalAmount || totalsBeforeReset.totalDue),
		};

		hideLoading();
		showSuccessModal();
		showSuccessToast({
			transactionCode: state.lastCompletedSale.transactionCode,
			totalAmount: state.lastCompletedSale.confirmedTotalAmount,
		});
		refreshUi();
	} catch (error) {
		hideLoading();
		setFinalizeEnabled(true);
		showToast(error.message || "Failed to complete sale", "error");
	}
}

function showSuccessModal() {
	if (!state.lastCompletedSale) return;

	successClinic.textContent = state.lastCompletedSale.clinicName;
	successTxnId.textContent = state.lastCompletedSale.transactionCode;
	successPatientId.textContent = state.lastCompletedSale.patientName || "N/A";
	const selectedItemsMarkup = state.lastCompletedSale.selected
		.map((item) => `<p>${item.name} - ${formatPeso(item.qty * item.price)}</p>`)
		.join("");

	const boughtPrescriptionLines = (state.lastCompletedSale.pendingBalances || []).filter((line) => {
		return String(line?.obligationKind || "").trim().toLowerCase() === "optional_prescription"
			&& String(line?.resolution || "").trim().toLowerCase() === "bought_in_clinic";
	});

	const prescriptionNotesMarkup = boughtPrescriptionLines
		.map((line) => `<p>Prescription (${getPendingLineDetails(line)}) - Bought in clinic</p>`)
		.join("");

	successItems.innerHTML = `${selectedItemsMarkup}${prescriptionNotesMarkup ? `<div class="mt-1 border-t border-slate-300 pt-1 text-xs text-slate-700">${prescriptionNotesMarkup}</div>` : ""}`;
	successSubtotal.textContent = formatPeso(state.lastCompletedSale.subtotal);
	successDiscount.textContent = formatPeso(state.lastCompletedSale.discount);
	successVat.textContent = formatPeso(state.lastCompletedSale.vat);
	successTotal.textContent = formatPeso(state.lastCompletedSale.confirmedTotalAmount ?? state.lastCompletedSale.totalDue);

	openModal(successModal);
}

/* ===== Hold Transactions (UI-Only) ===== */

function holdCurrentTransaction() {
	const totals = computeSaleTotals();
	if (!totals.itemCount) return;

	state.heldTransactions.push({
		heldId: generateHeldId(),
		patientId: state.patientId,
		patientName: state.patientName,
		parmsIntent: state.parmsIntent,
		pendingBalances: [...state.pendingBalances],
		pendingBalanceTotal: state.pendingBalanceTotal,
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
		const product = state.products.find((entry) => entry.id === item.id);
		const nextQty = isServiceProduct(product) ? (item.qty > 0 ? 1 : 0) : item.qty;
		state.quantities[item.id] = nextQty;
	});
	state.patientId = held.patientId;
	state.patientName = held.patientName || "";
	state.parmsIntent = held.parmsIntent || null;
	setPendingBalances(held.pendingBalances || []);
	state.heldTransactions.splice(index, 1);
	closeAllModals();
	refreshUi();
	showToast("Transaction resumed", "info");
}

/* ===== History & Void ===== */

function findTransaction(transactionId) {
	return state.transactionLog.find((entry) => String(entry.transactionId) === String(transactionId));
}

function isHistoryServiceLikeItem(item) {
	const productId = String(item?.productId || "").trim();
	if (productId) {
		const product = state.products.find((entry) => String(entry.id || "") === productId);
		if (product) {
			return isServiceProduct(product);
		}
	}

	const normalizedName = String(item?.name || "").trim().toLowerCase();
	if (!normalizedName) return false;

	return /(consult|follow[\s-]?up|checkup|vaccin|x\s*-?ray|ecg|troponin|urinalysis|blood\s+count|platelet|blood\s+sugar|hba1c|lipid|sgpt|sgot|electrolyte|creatinine|\bbun\b|dengue|malaria|covid)/i.test(normalizedName);
}

function openHistoryTransactionModal(transactionId) {
	const transaction = findTransaction(transactionId);
	if (!transaction) return;

	const { date, time } = formatDateTime(transaction.dateTime);

	historyViewTxnId.textContent = String(transaction.transactionId).slice(-8).toUpperCase();
	historyViewDateTime.textContent = `${date} ${time}`;
	historyViewPatientId.textContent = transaction.patientId || "N/A";
	const historyViewPatientNameEl = document.getElementById("historyViewPatientName");
	if (historyViewPatientNameEl) historyViewPatientNameEl.textContent = transaction.patientName || "N/A";
	historyViewStatus.textContent = transaction.status;
	historyViewStatus.className =
		transaction.status === "VOIDED"
			? "rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700"
			: "rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700";

	historyViewItemsBody.innerHTML = (transaction.items || [])
		.map(
			(item) => {
				const qtyValue = isHistoryServiceLikeItem(item) ? "-" : String(item.quantity ?? "-");
				return `
				<tr class="text-xs text-slate-700">
					<td class="px-3 py-2">${item.name}</td>
					<td class="px-3 py-2 text-center">${qtyValue}</td>
					<td class="px-3 py-2 text-right">${formatPeso(item.unitPrice)}</td>
					<td class="px-3 py-2 text-right">${formatPeso(item.lineTotal)}</td>
				</tr>
			`;
			}
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

	const voidReasonInputEl = document.getElementById("voidReasonInput");
	const voidReason = voidReasonInputEl ? voidReasonInputEl.value.trim() : "";
	showLoading("Voiding transaction...");

	try {
		await apiVoidTransaction(state.pendingVoidTransactionId, voidReason);

		// Refresh history and products
		await Promise.all([loadHistory(), loadProducts()]);

		state.pendingVoidTransactionId = null;
		hideLoading();
		if (voidReasonInputEl) voidReasonInputEl.value = "";
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
		state.products = products.map(normalizeBillingProduct);
		state.products.forEach((item) => {
			if (isItemUnsaleable(item)) {
				state.quantities[item.id] = 0;
			} else if (isServiceProduct(item) && (state.quantities[item.id] || 0) > 1) {
				state.quantities[item.id] = 1;
			} else if ((state.quantities[item.id] || 0) > Number(item.sellableStock ?? item.stock ?? 0)) {
				state.quantities[item.id] = Number(item.sellableStock ?? item.stock ?? 0);
			}
		});
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
	categoryFilter?.addEventListener("change", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLSelectElement)) return;
		state.activeCategory = target.value || ALL_CATEGORIES_LABEL;
		renderProductPanel();
	});

	itemsTabBtn?.addEventListener("click", () => {
		if (state.activeProductType === "item") return;
		state.activeProductType = "item";
		renderProductPanel();
	});

	servicesTabBtn?.addEventListener("click", () => {
		if (state.activeProductType === "service") return;
		state.activeProductType = "service";
		renderProductPanel();
	});

	searchInput.addEventListener("input", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		state.searchTerm = target.value;
		renderProductPanel();
	});

	servicesList?.addEventListener("change", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		if (target.dataset.role !== "service-checkbox") return;

		const idValue = target.dataset.id;
		if (!idValue) return;

		const service = state.products.find((entry) => entry.id === idValue);
		if (!service || !isServiceProduct(service)) return;

		if (target.checked) {
			if (isItemUnsaleable(service)) {
				showToast(getUnsaleableMessage(service), "error");
				setQuantity(idValue, 0);
				return;
			}
			setQuantity(idValue, 1);
			return;
		}

		setQuantity(idValue, 0);
	});

	pendingBalancesList?.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) return;

		const action = String(target.dataset.action || "").trim();
		const referenceId = String(target.dataset.referenceId || "").trim();
		if (!action || !referenceId) return;

		if (!state.pendingBalances.length) return;

		if (action !== "mark-prescription-bought" && action !== "mark-prescription-not-bought") return;

		let addedInCart = false;
		let unresolvedMatches = 0;

		state.pendingBalances = state.pendingBalances.map((line) => {
			if (String(line.referenceId || "").trim() !== referenceId) return line;
			if (line.obligationKind !== "optional_prescription") return line;

			if (action === "mark-prescription-bought") {
				let linkedProductId = String(line.linkedProductId || "").trim();
				if (!linkedProductId) {
					const matchedProduct = findBestPrescriptionItemMatchForPendingLine(line);
					if (matchedProduct) {
						linkedProductId = String(matchedProduct.id || "").trim();
					}
				}

				if (linkedProductId && Number(state.quantities[linkedProductId] || 0) <= 0) {
					state.quantities[linkedProductId] = 1;
					addedInCart = true;
				}

				if (!linkedProductId) {
					unresolvedMatches += 1;
				}

				return {
					...line,
					linkedProductId: linkedProductId || null,
					resolution: linkedProductId ? "bought_in_clinic" : "unresolved",
					includeInTotal: false,
				};
			}

			const linkedProductId = String(line.linkedProductId || "").trim();
			if (linkedProductId && Number(state.quantities[linkedProductId] || 0) > 0) {
				state.quantities[linkedProductId] = 0;
			}

			return {
				...line,
				linkedProductId: linkedProductId || null,
				resolution: "not_bought_in_clinic",
				includeInTotal: false,
			};
		});

		reconcilePendingObligationsWithCart();
		if (addedInCart) {
			showToast("Prescription medicine added to cart.", "success");
		}
		if (unresolvedMatches > 0) {
			showToast("No matching clinic medicine found for this prescription.", "warning");
		}
		refreshUi();
	});

	patientNameInput?.addEventListener("input", (event) => {
		const patientNameValue = String(event.target.value || "").trim();
		state.patientName = patientNameValue;
		state.patientId = "";
		state.parmsIntent = null;
		setPendingBalances([]);
		updatePaymentLockStatus();

		if (patientLookupDebounceTimer) {
			clearTimeout(patientLookupDebounceTimer);
		}

		if (!patientNameValue) {
			refreshUi();
			return;
		}

		patientLookupDebounceTimer = setTimeout(async () => {
			const patientRecord = await resolvePatientByName(patientNameValue);
			if (state.patientName !== patientNameValue) return;

			if (!patientRecord) {
				state.patientId = "";
				state.parmsIntent = null;
				setPendingBalances([]);
				refreshUi();
				return;
			}

			state.patientId = patientRecord.patientId;
			state.patientName = patientRecord.patientName;
			state.parmsIntent = patientRecord.parmsIntent || null;
			setPendingBalances(patientRecord.pendingBalances || []);
			refreshUi();
		}, 350);
	});

	itemsTableBody.addEventListener("click", (event) => {
		const target = event.target;

		if (target instanceof HTMLInputElement && target.dataset.role === "qty-input") {
			target.select();
			return;
		}

		if (!(target instanceof HTMLButtonElement)) return;
		const action = target.dataset.action;
		const idValue = target.dataset.id;
		if (!action || !idValue) return;
		if (action === "view-item") {
			openItemDetailsModal(idValue);
			return;
		}
		const item = state.products.find((entry) => entry.id === idValue);
		if (!item) return;
		if (isItemUnsaleable(item)) {
			showToast(getUnsaleableMessage(item), "error");
			return;
		}
		const currentQty = state.quantities[idValue] || 0;

		if (action === "increment") {
			setQuantity(idValue, Math.min(currentQty + 1, Number(item.sellableStock ?? item.stock ?? 0)));
			return;
		}

		if (action === "decrement") {
			if (currentQty <= 0) return;
			setQuantity(idValue, currentQty - 1);
		}
	});

	selectedItemsPanel.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) return;
		const action = target.dataset.action;
		const idValue = target.dataset.id;
		if (!action || !idValue) return;

		if (action === "remove-cart-item") {
			removeCartItem(idValue);
		}
	});

	itemsTableBody.addEventListener("keydown", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) || target.dataset.role !== "qty-input") return;

		if (["e", "E", "+", ".", ","].includes(event.key)) {
			event.preventDefault();
			return;
		}

		if (event.key === "Enter") {
			event.preventDefault();
			commitQuantityInput(target);
			target.blur();
		}
	});

	itemsTableBody.addEventListener(
		"blur",
		(event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement) || target.dataset.role !== "qty-input") return;
			commitQuantityInput(target);
		},
		true
	);

	itemsTableBody.addEventListener(
		"wheel",
		(event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement) || target.dataset.role !== "qty-input") return;
			target.blur();
		},
		{ passive: true }
	);

	menuPosButton.addEventListener("click", exitBillingMode);

	holdTopButton.addEventListener("click", () => {
		renderHeldModalList();
		openModal(heldModal);
	});

	holdSummaryButton.addEventListener("click", holdCurrentTransaction);
	removeAllItemsButton?.addEventListener("click", removeAllCartItemsOnly);
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
	itemDetailsCloseBtn.addEventListener("click", closeAllModals);

	voidCancelBtn.addEventListener("click", () => {
		state.pendingVoidTransactionId = null;
		const voidReasonInputEl = document.getElementById("voidReasonInput");
		if (voidReasonInputEl) voidReasonInputEl.value = "";
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
		handleProceedToPayment();
	});

	backToCartBtn?.addEventListener("click", () => {
		setCheckoutMode(false);
	});

	quickCashButtons?.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLButtonElement)) return;
		const amount = Number(target.dataset.cashQuick || 0);
		if (!Number.isFinite(amount) || amount <= 0) return;
		
		// Visual feedback: highlight selected button
		Array.from(quickCashButtons.querySelectorAll("button")).forEach((btn) => {
			btn.classList.remove("border-cyan-600", "bg-cyan-50", "text-cyan-700");
			btn.classList.add("border-slate-300", "bg-white", "text-slate-700");
		});
		target.classList.add("border-cyan-600", "bg-cyan-50", "text-cyan-700");
		target.classList.remove("border-slate-300", "bg-white", "text-slate-700");
		
		applyQuickCash(amount);
	});

	cashTenderedInlineInput?.addEventListener("input", updateCashChange);

	finalizeBtn.addEventListener("click", () => {
		if (finalizeBtn.disabled) return;
		handleCompleteSale();
	});

	printSlipBtn?.addEventListener("click", () => {
		if (state.lastCompletedSale) {
			window.print();
		}
	});

	nextSaleBtn?.addEventListener("click", async () => {
		resetActiveSale();
		await loadProducts();
		closeAllModals();
		state.activeView = "sale";
		refreshUi();
	});

	modalOverlay.addEventListener("click", () => {
		const closableModals = ["heldModal", "historyViewModal", "voidConfirmModal", "itemDetailsModal"];
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
		if (!productRefreshTimer) {
			productRefreshTimer = setInterval(async () => {
				try {
					await loadProducts();
					refreshUi();
				} catch {
					// Silent refresh keeps billing aligned with live inventory status changes.
				}
			}, PRODUCT_REFRESH_INTERVAL_MS);
		}
	} catch (error) {
		hideLoading();
		showToast("Failed to initialize billing system", "error");
	}
}

init();
