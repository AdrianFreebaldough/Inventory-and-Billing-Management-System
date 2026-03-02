import mongoose from "mongoose";
import Product from "../models/product.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";
import { createStockLog } from "./Owner_StockLog.service.js";

class STAFF_BillingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "STAFF_BillingError";
    this.statusCode = statusCode;
  }
}

// Centralized currency rounding keeps stored totals stable and predictable.
const STAFF_roundCurrency = (value) => Number(Number(value).toFixed(2));

const STAFF_makeReceiptNumber = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const timePart = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}${now.getMilliseconds()}`;
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `RCPT-${yyyy}${mm}${dd}-${timePart}-${randomPart}`;
};

const STAFF_logBillingActivity = async ({
  staffId,
  actionType,
  description,
  status = "completed",
  session = null,
}) => {
  await STAFF_ActivityLog.create(
    [
      {
        staffId,
        actionType,
        targetItemId: null,
        description,
        status,
      },
    ],
    session ? { session } : undefined
  );
};

const STAFF_executeWithOptionalTransaction = async (workFn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await workFn(session);
    });
    return result;
  } catch (error) {
    const unsupportedTransaction =
      error?.message?.includes("Transaction numbers are only allowed") ||
      error?.message?.includes("replica set") ||
      error?.codeName === "IllegalOperation";

    if (!unsupportedTransaction) {
      throw error;
    }

    return workFn(null);
  } finally {
    await session.endSession();
  }
};

// Cart values are always recomputed from canonical Product data to prevent price tampering.
const STAFF_buildItemsSnapshot = async (itemsPayload, session = null) => {
  if (!Array.isArray(itemsPayload) || itemsPayload.length === 0) {
    throw new STAFF_BillingError("At least one cart item is required", 400);
  }

  const normalizedItems = itemsPayload.map((item) => ({
    productId: item?.productId,
    quantity: Number(item?.quantity),
  }));

  normalizedItems.forEach((item, index) => {
    if (!mongoose.Types.ObjectId.isValid(item.productId)) {
      throw new STAFF_BillingError(`Invalid productId at item index ${index}`, 400);
    }

    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      throw new STAFF_BillingError(`Invalid quantity at item index ${index}`, 400);
    }
  });

  const groupedItems = normalizedItems.reduce((acc, currentItem) => {
    const key = String(currentItem.productId);
    const existingQuantity = acc.get(key) || 0;
    acc.set(key, existingQuantity + currentItem.quantity);
    return acc;
  }, new Map());

  const productIds = [...groupedItems.keys()];
  const productsQuery = Product.find({
    _id: { $in: productIds },
    isArchived: { $ne: true },
  })
    .select("_id name quantity unitPrice")
    .lean();

  if (session) {
    productsQuery.session(session);
  }

  const products = await productsQuery;

  if (products.length !== productIds.length) {
    throw new STAFF_BillingError("One or more products were not found", 404);
  }

  const productsById = new Map(products.map((product) => [String(product._id), product]));

  const items = [];
  let totalAmount = 0;

  for (const [productId, quantity] of groupedItems.entries()) {
    const product = productsById.get(productId);

    if (!product) {
      throw new STAFF_BillingError("One or more products were not found", 404);
    }

    if (product.quantity < quantity) {
      throw new STAFF_BillingError(`Insufficient stock for ${product.name}`, 400);
    }

    const unitPrice = Number(product.unitPrice ?? 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new STAFF_BillingError(`Invalid unit price configuration for ${product.name}`, 400);
    }

    const lineTotal = STAFF_roundCurrency(unitPrice * quantity);

    items.push({
      productId: product._id,
      name: product.name,
      unitPrice,
      quantity,
      lineTotal,
    });

    totalAmount += lineTotal;
  }

  return {
    items,
    totalAmount: STAFF_roundCurrency(totalAmount),
  };
};

const STAFF_getTransactionForStaff = async (transactionId, staffId, session = null) => {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) {
    throw new STAFF_BillingError("Invalid transaction id", 400);
  }

  const query = STAFF_BillingTransaction.findById(transactionId).where({ staffId });
  if (session) {
    query.session(session);
  }

  const transaction = await query;

  if (!transaction) {
    throw new STAFF_BillingError("Billing transaction not found", 404);
  }

  return transaction;
};

export const STAFF_createBillingTransaction = async ({ staffId, items, patientId, discountRate = 0 }) => {
  if (!patientId || typeof patientId !== "string" || !patientId.trim()) {
    throw new STAFF_BillingError("Patient ID is required", 400);
  }

  const parsedDiscountRate = Number(discountRate);
  if (!Number.isFinite(parsedDiscountRate) || parsedDiscountRate < 0 || parsedDiscountRate > 1) {
    throw new STAFF_BillingError("Discount rate must be a number between 0 and 1", 400);
  }

  const snapshot = await STAFF_buildItemsSnapshot(items);
  
  const subtotal = snapshot.totalAmount;
  const discountAmount = STAFF_roundCurrency(subtotal * parsedDiscountRate);
  const taxableAmount = STAFF_roundCurrency(subtotal - discountAmount);
  const vatRate = 0.12;
  const vatAmount = STAFF_roundCurrency(taxableAmount * vatRate);
  const totalAmount = STAFF_roundCurrency(taxableAmount + vatAmount);

  const transaction = await STAFF_BillingTransaction.create({
    staffId,
    patientId: patientId.trim(),
    items: snapshot.items,
    subtotal,
    discountRate: parsedDiscountRate,
    discountAmount,
    vatRate,
    vatAmount,
    totalAmount,
    status: "PENDING_PAYMENT",
  });

  await STAFF_logBillingActivity({
    staffId,
    actionType: "billing-create",
    description: `Created pending billing transaction ${transaction._id} for patient ${patientId}`,
    status: "pending",
  });

  return transaction;
};

export const STAFF_proceedPayment = async ({ transactionId, staffId }) => {
  const transaction = await STAFF_getTransactionForStaff(transactionId, staffId);

  if (transaction.status !== "PENDING_PAYMENT") {
    throw new STAFF_BillingError("Only pending transactions can proceed to payment", 409);
  }

  return {
    transactionId: transaction._id,
    totalAmount: transaction.totalAmount,
    status: transaction.status,
  };
};

export const STAFF_completeBillingTransaction = async ({ transactionId, staffId, cashReceived }) => {
  const parsedCashReceived = Number(cashReceived);
  if (!Number.isFinite(parsedCashReceived) || parsedCashReceived < 0) {
    throw new STAFF_BillingError("cashReceived must be a valid non-negative number", 400);
  }

  return STAFF_executeWithOptionalTransaction(async (session) => {
    // Recheck status and stock in checkout step to block double-submit and race conditions.
    const transaction = await STAFF_getTransactionForStaff(transactionId, staffId, session);

    if (transaction.status !== "PENDING_PAYMENT") {
      throw new STAFF_BillingError("Transaction has already been completed", 409);
    }

    if (parsedCashReceived < transaction.totalAmount) {
      throw new STAFF_BillingError("Insufficient cash received", 400);
    }

    for (const item of transaction.items) {
      const productQuery = Product.findById(item.productId);
      if (session) {
        productQuery.session(session);
      }

      const product = await productQuery;

      if (!product || product.isArchived === true) {
        throw new STAFF_BillingError(`Product not found for item ${item.name}`, 404);
      }

      if (product.quantity < item.quantity) {
        throw new STAFF_BillingError(`Insufficient stock for ${product.name}`, 400);
      }

      product.quantity = product.quantity - item.quantity;
      await product.save({ session });

      await createStockLog({
        productId: product._id,
        movementType: "SALE",
        quantityChange: -item.quantity,
        performedBy: {
          userId: staffId,
          role: "staff",
        },
        source: "POS",
        session,
      });
    }

    const change = STAFF_roundCurrency(parsedCashReceived - transaction.totalAmount);
    const completedAt = new Date();

    const receiptSnapshot = {
      receiptNumber: STAFF_makeReceiptNumber(),
      clinic: {
        name: process.env.CLINIC_NAME || "IBMS Clinic",
      },
      transactionDateTime: completedAt,
      patientId: transaction.patientId,
      staffId: transaction.staffId,
      items: transaction.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      subtotal: transaction.subtotal,
      discountRate: transaction.discountRate,
      discountAmount: transaction.discountAmount,
      vatRate: transaction.vatRate,
      vatAmount: transaction.vatAmount,
      totalAmount: transaction.totalAmount,
      cashReceived: STAFF_roundCurrency(parsedCashReceived),
      change,
    };

    transaction.cashReceived = STAFF_roundCurrency(parsedCashReceived);
    transaction.change = change;
    transaction.paymentMethod = "cash";
    transaction.status = "COMPLETED";
    transaction.completedAt = completedAt;
    transaction.receiptSnapshot = receiptSnapshot;

    await transaction.save({ session });

    await STAFF_logBillingActivity({
      staffId,
      actionType: "billing-complete",
      description: `Completed billing transaction ${transaction._id}`,
      status: "completed",
      session,
    });

    return transaction;
  });
};

export const STAFF_getBillingHistory = async ({ staffId }) => {
  return STAFF_BillingTransaction.find({
    staffId,
    status: { $in: ["COMPLETED", "VOIDED"] },
  })
    .sort({ createdAt: -1 })
    .lean();
};

export const STAFF_getBillingReceipt = async ({ transactionId, staffId }) => {
  const transaction = await STAFF_getTransactionForStaff(transactionId, staffId);

  if (!["COMPLETED", "VOIDED"].includes(transaction.status) || !transaction.receiptSnapshot) {
    throw new STAFF_BillingError("Receipt is only available for completed or voided transactions", 404);
  }

  return {
    transactionId: transaction._id,
    status: transaction.status,
    receipt: transaction.receiptSnapshot,
  };
};

export const STAFF_voidBillingTransaction = async ({ transactionId, staffId, reason = "" }) => {
  return STAFF_executeWithOptionalTransaction(async (session) => {
    const transaction = await STAFF_getTransactionForStaff(transactionId, staffId, session);

    if (transaction.status === "VOIDED") {
      throw new STAFF_BillingError("Transaction has already been voided", 409);
    }

    if (transaction.status !== "COMPLETED") {
      throw new STAFF_BillingError("Only completed transactions can be voided", 400);
    }

    // Restore inventory quantities
    for (const item of transaction.items) {
      const productQuery = Product.findById(item.productId);
      if (session) {
        productQuery.session(session);
      }

      const product = await productQuery;

      if (!product) {
        throw new STAFF_BillingError(`Product not found for item ${item.name}`, 404);
      }

      product.quantity = product.quantity + item.quantity;
      await product.save({ session });

      await createStockLog({
        productId: product._id,
        movementType: "VOID_REVERSAL",
        quantityChange: item.quantity,
        performedBy: {
          userId: staffId,
          role: "staff",
        },
        source: "POS",
        notes: `Voided transaction ${transactionId}`,
        session,
      });
    }

    transaction.status = "VOIDED";
    transaction.voidedAt = new Date();
    transaction.voidedBy = staffId;
    transaction.voidReason = reason || null;

    await transaction.save({ session });

    await STAFF_logBillingActivity({
      staffId,
      actionType: "billing-void",
      description: `Voided billing transaction ${transaction._id}${reason ? `: ${reason}` : ""}`,
      status: "completed",
      session,
    });

    return transaction;
  });
};

export { STAFF_BillingError };
