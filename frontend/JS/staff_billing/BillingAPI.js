/**
 * Billing API Service
 * Handles all billing-related API calls for the Staff Billing UI.
 * This module completely replaces the mock BillingData.js.
 */

import { apiFetch, buildQueryString } from "../utils/apiClient.js";

const BILLING_BASE = "/api/staff/billing";

/* ===== Products (for POS item selection) ===== */

export const fetchBillingProducts = async (category = null) => {
  const query = category && category !== "All Items" ? { category } : {};
  const path = `${BILLING_BASE}/products${buildQueryString(query)}`;
  const response = await apiFetch(path, { method: "GET" });
  return response.data || [];
};

/* ===== Transaction Lifecycle ===== */

/**
 * Create a new billing transaction.
 * @param {Object} params
 * @param {string} params.patientId - Patient identifier
 * @param {Array} params.items - Cart items [{ productId, quantity }]
 * @param {number} [params.discountRate=0] - Discount rate (0-1)
 * @returns {Promise<Object>} Created transaction data
 */
export const createTransaction = async ({ patientId, items, discountRate = 0 }) => {
  const response = await apiFetch(`${BILLING_BASE}/create`, {
    method: "POST",
    body: JSON.stringify({ patientId, items, discountRate }),
  });
  return response.data;
};

/**
 * Proceed to payment for a pending transaction.
 * @param {string} transactionId - Transaction ObjectId
 * @returns {Promise<Object>} Transaction payment data
 */
export const proceedToPayment = async (transactionId) => {
  const response = await apiFetch(`${BILLING_BASE}/${transactionId}/proceed-payment`, {
    method: "POST",
  });
  return response.data;
};

/**
 * Complete a transaction with cash payment.
 * @param {string} transactionId - Transaction ObjectId
 * @param {number} cashReceived - Cash amount received
 * @returns {Promise<Object>} Completed transaction data
 */
export const completeTransaction = async (transactionId, cashReceived) => {
  const response = await apiFetch(`${BILLING_BASE}/${transactionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ cashReceived }),
  });
  return response.data;
};

/**
 * Void a completed transaction (restores inventory).
 * @param {string} transactionId - Transaction ObjectId
 * @param {string} [reason=""] - Reason for voiding
 * @returns {Promise<Object>} Voided transaction data
 */
export const voidTransaction = async (transactionId, reason = "") => {
  const response = await apiFetch(`${BILLING_BASE}/${transactionId}/void`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
  return response.data;
};

/* ===== History & Receipts ===== */

/**
 * Fetch billing transaction history (completed + voided).
 * @returns {Promise<Array>} Array of transaction records
 */
export const fetchHistory = async () => {
  const response = await apiFetch(`${BILLING_BASE}/history`, { method: "GET" });
  return response.data || [];
};

/**
 * Fetch receipt for a specific transaction.
 * @param {string} transactionId - Transaction ObjectId
 * @returns {Promise<Object>} Receipt data
 */
export const fetchReceipt = async (transactionId) => {
  const response = await apiFetch(`${BILLING_BASE}/${transactionId}/receipt`, {
    method: "GET",
  });
  return response.data;
};

/* ===== Utility Types ===== */

/**
 * @typedef {Object} BillingProduct
 * @property {string} id - MongoDB ObjectId
 * @property {string} name - Product name
 * @property {string} category - Product category
 * @property {number} stock - Available quantity
 * @property {number} price - Unit price
 */

/**
 * @typedef {Object} BillingTransaction
 * @property {string} transactionId - MongoDB ObjectId
 * @property {string} patientId - Patient identifier
 * @property {string} dateTime - ISO date string
 * @property {Array} items - Line items
 * @property {number} subtotal - Subtotal amount
 * @property {number} discountRate - Discount rate applied
 * @property {number} discountAmount - Discount amount
 * @property {number} vatRate - VAT rate applied
 * @property {number} vatAmount - VAT amount
 * @property {number} totalAmount - Total due
 * @property {string} status - PENDING_PAYMENT | COMPLETED | VOIDED
 */
