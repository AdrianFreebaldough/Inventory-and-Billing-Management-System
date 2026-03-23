import mongoose from "mongoose";
import Product from "../models/product.js";
import InventoryBatch from "../models/InventoryBatch.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";
import { createStockLog } from "./Owner_StockLog.service.js";
import { buildFefoAllocationPlan, classifyExpiryRisk, sortBatchesForFefo, toUiExpiryRiskKey } from "./fefoService.js";
import { BATCH_MANUAL_STATUS } from "./batchLifecycleService.js";

class STAFF_BillingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "STAFF_BillingError";
    this.statusCode = statusCode;
  }
}

// Centralized currency rounding keeps stored totals stable and predictable.
const STAFF_roundCurrency = (value) => Number(Number(value).toFixed(2));

// Generate patient name (temporary generator until patient module is integrated)
const STAFF_generatePatientName = () => {
  const firstNames = [
    "Juan", "Maria", "Pedro", "Ana", "Jose", "Rosa", "Carlos", "Luz",
    "Miguel", "Elena", "Roberto", "Sofia", "Fernando", "Carmen", "Antonio",
    "Isabel", "Manuel", "Teresa", "Ricardo", "Patricia", "Rafael", "Gloria"
  ];
  const lastNames = [
    "Dela Cruz", "Santos", "Reyes", "Garcia", "Ramos", "Mendoza", "Torres",
    "Gonzales", "Lopez", "Flores", "Villanueva", "Castro", "Rivera", "Cruz",
    "Bautista", "Fernandez", "Aquino", "Santiago", "Morales", "Pascual"
  ];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  
  return `${firstName} ${lastName}`;
};

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

const STAFF_syncBatchManualStatus = async ({ batchId, session = null }) => {
  if (!batchId) return;

  const query = InventoryBatch.findById(batchId);
  if (session) {
    query.session(session);
  }

  const batch = await query;
  if (!batch) return;

  const normalizedStatus = String(batch.status || "").trim().toLowerCase();
  if (normalizedStatus === "disposed" || normalizedStatus === "pending disposal") {
    return;
  }

  const currentQuantity = Number(batch.currentQuantity ?? batch.quantity ?? 0);
  const desiredStatus = currentQuantity <= 0
    ? BATCH_MANUAL_STATUS.OUT_OF_STOCK
    : BATCH_MANUAL_STATUS.ACTIVE;

  if (batch.status !== desiredStatus) {
    batch.status = desiredStatus;
    await batch.save(session ? { session } : undefined);
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
    .select("_id name quantity unitPrice expiryDate")
    .lean();

  if (session) {
    productsQuery.session(session);
  }

  const products = await productsQuery;

  if (products.length !== productIds.length) {
    throw new STAFF_BillingError("One or more products were not found", 404);
  }

  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const batchesByProductId = await STAFF_getLiveBatchStateByProductIds(productIds, session);

  const items = [];
  let totalAmount = 0;

  for (const [productId, quantity] of groupedItems.entries()) {
    const product = productsById.get(productId);
    const productBatches = batchesByProductId.get(productId) || [];

    if (!product) {
      throw new STAFF_BillingError("One or more products were not found", 404);
    }

    const sellableQuantity = STAFF_getEligibleSellableQuantity({ product, batches: productBatches });

    if (sellableQuantity < quantity) {
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

const STAFF_syncProductQuantityFromBatches = async ({ productId, session = null }) => {
  const batchQuery = InventoryBatch.find({ product: productId })
    .select("currentQuantity quantity")
    .lean();

  if (session) {
    batchQuery.session(session);
  }

  const batches = await batchQuery;
  const liveTotal = batches.reduce((sum, batch) => sum + Number(batch.currentQuantity ?? batch.quantity ?? 0), 0);

  const productQuery = Product.findById(productId);
  if (session) {
    productQuery.session(session);
  }

  const product = await productQuery;
  if (!product) {
    throw new STAFF_BillingError("Product not found while syncing stock", 404);
  }

  product.quantity = liveTotal;
  if (Number.isFinite(Number(product.expectedRemaining))) {
    product.expectedRemaining = liveTotal;
  }

  await product.save(session ? { session } : undefined);
};

const STAFF_getLiveBatchStateByProductIds = async (productIds, session = null) => {
  const batchQuery = InventoryBatch.find({
    product: { $in: productIds },
    $or: [
      { currentQuantity: { $gt: 0 } },
      { currentQuantity: { $exists: false }, quantity: { $gt: 0 } },
    ],
  })
    .select("product quantity currentQuantity initialQuantity expiryDate batchNumber createdAt _id status")
    .sort({ expiryDate: 1, createdAt: 1, _id: 1 })
    .lean();

  if (session) {
    batchQuery.session(session);
  }

  const batches = await batchQuery;
  for (const batch of batches) {
    const hasCurrentQuantity = Number.isFinite(Number(batch.currentQuantity));
    if (hasCurrentQuantity) continue;

    const normalizedCurrentQuantity = Number(batch.quantity ?? 0);
    await InventoryBatch.updateOne(
      {
        _id: batch._id,
        currentQuantity: { $exists: false },
      },
      {
        $set: { currentQuantity: normalizedCurrentQuantity },
      },
      session ? { session } : undefined
    );
    batch.currentQuantity = normalizedCurrentQuantity;
    if (normalizedCurrentQuantity <= 0 && String(batch.status || "").trim().toLowerCase() !== "disposed") {
      await InventoryBatch.updateOne(
        {
          _id: batch._id,
          status: { $ne: BATCH_MANUAL_STATUS.DISPOSED },
        },
        {
          $set: { status: BATCH_MANUAL_STATUS.OUT_OF_STOCK },
        },
        session ? { session } : undefined
      );
      batch.status = BATCH_MANUAL_STATUS.OUT_OF_STOCK;
    }
  }
  const batchesByProductId = new Map();

  for (const batch of batches) {
    const key = String(batch.product);
    if (!batchesByProductId.has(key)) {
      batchesByProductId.set(key, []);
    }
    batchesByProductId.get(key).push(batch);
  }

  return batchesByProductId;
};

const STAFF_getEligibleSellableQuantity = ({ product, batches, referenceDate = new Date() }) => {
  const productBatches = Array.isArray(batches) ? batches : [];
  const orderedBatches = sortBatchesForFefo(productBatches, referenceDate);

  if (productBatches.length > 0) {
    return orderedBatches.reduce((sum, batch) => sum + Number(batch.currentQuantity ?? batch.quantity ?? 0), 0);
  }

  const riskKey = toUiExpiryRiskKey(classifyExpiryRisk(product?.expiryDate || null, referenceDate));
  if (riskKey === "expired") {
    return 0;
  }

  return Number(product?.quantity ?? 0);
};

const STAFF_allocateItemFromBatches = async ({ item, session, referenceDate }) => {
  const batchQuery = InventoryBatch.find({
    product: item.productId,
    $or: [
      { currentQuantity: { $gt: 0 } },
      { currentQuantity: { $exists: false }, quantity: { $gt: 0 } },
    ],
  })
    .sort({ expiryDate: 1, createdAt: 1, _id: 1 })
    .select("_id batchNumber quantity currentQuantity initialQuantity expiryDate createdAt status");

  if (session) {
    batchQuery.session(session);
  }

  const batches = await batchQuery;

  const plan = buildFefoAllocationPlan({
    batches,
    requestedQuantity: item.quantity,
    referenceDate,
  });

  if (!plan.fulfilled) {
    throw new STAFF_BillingError(`Insufficient non-expired stock for ${item.name}`, 400);
  }

  const appliedAllocations = [];

  try {
    for (const allocation of plan.allocations) {
      const options = session ? { session } : undefined;
      const result = await InventoryBatch.updateOne(
        {
          _id: allocation.batchId,
          currentQuantity: { $gte: allocation.quantity },
        },
        {
          $inc: { currentQuantity: -allocation.quantity },
        },
        options
      );

      if (!result.modifiedCount) {
        throw new STAFF_BillingError(
          `Concurrent stock update detected while allocating batch ${allocation.batchNumber || allocation.batchId}`,
          409
        );
      }

      appliedAllocations.push(allocation);
      await STAFF_syncBatchManualStatus({
        batchId: allocation.batchId,
        session,
      });
    }
  } catch (error) {
    if (!session && appliedAllocations.length) {
      for (const applied of appliedAllocations) {
        await InventoryBatch.updateOne(
          { _id: applied.batchId },
          { $inc: { currentQuantity: applied.quantity } }
        );
      }
    }

    throw error;
  }

  return plan.allocations;
};

export const STAFF_createBillingTransaction = async ({ staffId, items, patientId, patientName, discountRate = 0 }) => {
  if (!patientId || typeof patientId !== "string" || !patientId.trim()) {
    throw new STAFF_BillingError("Patient ID is required", 400);
  }

  // Generate patient name if not provided
  const finalPatientName = patientName && patientName.trim() 
    ? patientName.trim() 
    : STAFF_generatePatientName();

  const parsedDiscountRate = Number(discountRate);
  if (!Number.isFinite(parsedDiscountRate) || parsedDiscountRate < 0 || parsedDiscountRate > 1) {
    throw new STAFF_BillingError("Discount rate must be a number between 0 and 1", 400);
  }

  const snapshot = await STAFF_buildItemsSnapshot(items);
  
  // IMPORTANT: Prices in DB already include 12% VAT
  // We use REVERSE VAT calculation to show breakdown
  const subtotal = snapshot.totalAmount;
  const discountAmount = STAFF_roundCurrency(subtotal * parsedDiscountRate);
  const totalAmount = STAFF_roundCurrency(subtotal - discountAmount);
  
  // Reverse VAT calculation: Total = Net + VAT
  // Total = Net * 1.12
  // Net = Total / 1.12
  // VAT = Total - Net
  const netAmount = STAFF_roundCurrency(totalAmount / 1.12);
  const vatIncluded = STAFF_roundCurrency(totalAmount - netAmount);

  const transaction = await STAFF_BillingTransaction.create({
    staffId,
    patientId: patientId.trim(),
    patientName: finalPatientName,
    items: snapshot.items,
    subtotal,
    discountRate: parsedDiscountRate,
    discountAmount,
    vatRate: 0.12,
    vatAmount: 0, // Keep for backward compatibility
    vatIncluded,
    netAmount,
    totalAmount,
    status: "PENDING_PAYMENT",
  });

  await STAFF_logBillingActivity({
    staffId,
    actionType: "billing-create",
    description: `Created pending billing transaction ${transaction._id} for patient ${finalPatientName}`,
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
    const now = new Date();

    if (transaction.status !== "PENDING_PAYMENT") {
      throw new STAFF_BillingError("Transaction has already been completed", 409);
    }

    if (parsedCashReceived < transaction.totalAmount) {
      throw new STAFF_BillingError("Insufficient cash received", 400);
    }

    for (const item of transaction.items) {
      const productQuery = Product.findById(item.productId).select("_id name quantity isArchived expiryDate");
      if (session) {
        productQuery.session(session);
      }

      const product = await productQuery;

      if (!product || product.isArchived === true) {
        throw new STAFF_BillingError(`Product not found for item ${item.name}`, 404);
      }

      const liveBatchesByProductId = await STAFF_getLiveBatchStateByProductIds([item.productId], session);
      const productBatches = liveBatchesByProductId.get(String(item.productId)) || [];

      let batchAllocations;
      batchAllocations = await STAFF_allocateItemFromBatches({
        item,
        session,
        referenceDate: now,
      });

      item.batchAllocations = batchAllocations;

      await STAFF_syncProductQuantityFromBatches({
        productId: item.productId,
        session,
      });

      await createStockLog({
        productId: item.productId,
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
      patientName: transaction.patientName,
      staffId: transaction.staffId,
      items: transaction.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        batchAllocations: (item.batchAllocations || []).map((allocation) => ({
          batchId: allocation.batchId,
          batchNumber: allocation.batchNumber,
          quantity: allocation.quantity,
          expiryDate: allocation.expiryDate,
          expiryRisk: allocation.expiryRisk,
        })),
      })),
      subtotal: transaction.subtotal,
      discountRate: transaction.discountRate,
      discountAmount: transaction.discountAmount,
      vatRate: transaction.vatRate,
      vatAmount: transaction.vatAmount,
      vatIncluded: transaction.vatIncluded,
      netAmount: transaction.netAmount,
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

export const STAFF_voidBillingTransaction = async ({ transactionId, staffId, reason = "", editedData = null }) => {
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

      // Restore batch quantities — add back to the most recent batch for this product
      const batchQuery = InventoryBatch.find({
        product: item.productId,
      }).sort({ expiryDate: 1, createdAt: 1 });
      if (session) batchQuery.session(session);
      const batches = await batchQuery;

      if (batches.length > 0) {
        // Add the restored quantity to the first (nearest expiry) batch
        const restoredToCurrent = Number(batches[0].currentQuantity ?? batches[0].quantity ?? 0) + Number(item.quantity ?? 0);
        batches[0].currentQuantity = restoredToCurrent;
        if (String(batches[0].status || "").trim().toLowerCase() !== "disposed" && String(batches[0].status || "").trim().toLowerCase() !== "pending disposal") {
          batches[0].status = restoredToCurrent <= 0
            ? BATCH_MANUAL_STATUS.OUT_OF_STOCK
            : BATCH_MANUAL_STATUS.ACTIVE;
        }
        await batches[0].save({ session });
      }

      await STAFF_syncProductQuantityFromBatches({
        productId: item.productId,
        session,
      });

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

    // Save edited data if provided
    if (editedData) {
      if (editedData.patientId) {
        transaction.editedPatientId = editedData.patientId;
      }
      if (editedData.patientName) {
        transaction.editedPatientName = editedData.patientName;
      }
      if (editedData.items && Array.isArray(editedData.items)) {
        transaction.editedItems = editedData.items;
      }
      if (editedData.notes) {
        transaction.voidNotes = editedData.notes;
      }
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
