import mongoose from "mongoose";
import Product from "../models/product.js";
import Service from "../models/Service.js";
import InventoryBatch from "../models/InventoryBatch.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";
import { createStockLog } from "./Owner_StockLog.service.js";
import { buildFefoAllocationPlan, classifyExpiryRisk, sortBatchesForFefo, toUiExpiryRiskKey } from "./fefoService.js";
import { BATCH_MANUAL_STATUS } from "./batchLifecycleService.js";
import { syncProductFromBatchTotals } from "./inventoryIntegrityService.js";
import { syncCompletedTransactionReceiptToPARMS } from "./parmsIntegrationService.js";
import { markIntentPaidFromTransaction, resolveOpenIntentForPatient } from "./parmsBillingIntentService.js";

class STAFF_BillingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "STAFF_BillingError";
    this.statusCode = statusCode;
  }
}

// Centralized currency rounding keeps stored totals stable and predictable.
const STAFF_roundCurrency = (value) => Number(Number(value).toFixed(2));

const STAFF_getNextGuestPatientId = async ({ session = null } = {}) => {
  const counters = mongoose.connection.collection("counters");
  const options = {
    upsert: true,
    returnDocument: "after",
  };

  if (session) {
    options.session = session;
  }

  const counterDoc = await counters.findOneAndUpdate(
    { _id: "billingGuestPatientSequence" },
    { $inc: { seq: 1 } },
    options
  );

  const sequence = Number(counterDoc?.value?.seq || counterDoc?.seq || 1);
  return `PAT-${sequence}`;
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

const STAFF_normalizeLookup = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const STAFF_requiredServiceResolvedInCart = ({ line, itemSnapshot = [] }) => {
  const normalizedLinkedProductId = String(line?.linkedProductId || "").trim();
  if (normalizedLinkedProductId) {
    return itemSnapshot.some((item) => String(item?.productId || "") === normalizedLinkedProductId && Number(item?.quantity || 0) > 0);
  }

  const normalizedDescription = STAFF_normalizeLookup(line?.description);
  const normalizedSourceLabel = STAFF_normalizeLookup(line?.sourceLabel);
  const normalizedServiceCode = STAFF_normalizeLookup(line?.serviceCode);

  return itemSnapshot.some((item) => {
    if (!item) return false;
    const normalizedItemName = STAFF_normalizeLookup(item.name);
    if (!normalizedItemName) return false;

    if (normalizedDescription && (normalizedItemName === normalizedDescription || normalizedItemName.includes(normalizedDescription) || normalizedDescription.includes(normalizedItemName))) {
      return true;
    }

    if (normalizedSourceLabel && (normalizedItemName === normalizedSourceLabel || normalizedItemName.includes(normalizedSourceLabel) || normalizedSourceLabel.includes(normalizedItemName))) {
      return true;
    }

    if (normalizedServiceCode && (normalizedItemName === normalizedServiceCode || normalizedItemName.includes(normalizedServiceCode))) {
      return true;
    }

    return false;
  });
};

const STAFF_normalizePendingBalanceLines = ({ pendingBalancesPayload = [], itemSnapshot = [] }) => {
  if (!Array.isArray(pendingBalancesPayload)) {
    return {
      lines: [],
      total: 0,
    };
  }

  const normalizedReferenceLines = [];
  const unresolvedRequiredServices = [];

  pendingBalancesPayload.forEach((line, index) => {
    const amount = Number(line?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return;
    }

    const sourceType = String(line?.sourceType || "other").trim().toLowerCase();
    const normalizedSourceType = ["laboratory", "prescription"].includes(sourceType)
      ? sourceType
      : "other";
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

    const description = String(line?.description || "Pending balance").trim() || "Pending balance";
    const resolution = String(line?.resolution || "").trim().toLowerCase();

    if (obligationKind === "required_service") {
      const isResolvedInCart = STAFF_requiredServiceResolvedInCart({
        line,
        itemSnapshot,
      });

      if (!isResolvedInCart) {
        unresolvedRequiredServices.push(description);
      }
      return;
    }

    if (obligationKind === "optional_prescription") {
      // Prescription lines are optional for clinic purchase.
      return;
    }

    if (amount <= 0) {
      return;
    }

    normalizedReferenceLines.push({
      sourceType: normalizedSourceType,
      referenceId: String(line?.referenceId || line?.lineId || `pending-${index + 1}`).trim(),
      description,
      amount: STAFF_roundCurrency(amount),
    });
  });

  if (unresolvedRequiredServices.length) {
    const unresolvedLabels = unresolvedRequiredServices.slice(0, 3).join(", ");
    throw new STAFF_BillingError(
      `Required PARMS service lines must be added to cart before payment${unresolvedLabels ? `: ${unresolvedLabels}` : ""}`,
      400
    );
  }

  const total = STAFF_roundCurrency(
    normalizedReferenceLines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
  );

  return {
    lines: normalizedReferenceLines,
    total,
  };
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
  
  // Try finding in Products first
  const productsQuery = Product.find({
    _id: { $in: productIds },
    isArchived: { $ne: true },
  })
    .select("_id name quantity unitPrice expiryDate genericName brandName")
    .lean();

  if (session) {
    productsQuery.session(session);
  }

  const products = await productsQuery;
  const productsById = new Map(products.map((product) => [String(product._id), product]));

  // Find remaining in Services
  const foundProductIds = new Set(products.map(p => String(p._id)));
  const remainingIds = productIds.filter(id => !foundProductIds.has(id));
  
  let services = [];
  if (remainingIds.length > 0) {
    const servicesQuery = Service.find({
      _id: { $in: remainingIds },
      status: { $ne: "archived" },
    }).lean();
    
    if (session) {
      servicesQuery.session(session);
    }
    services = await servicesQuery;
  }
  const servicesById = new Map(services.map((service) => [String(service._id), service]));

  if (products.length + services.length !== productIds.length) {
    throw new STAFF_BillingError("One or more items (products or services) were not found", 404);
  }

  const batchesByProductId = await STAFF_getLiveBatchStateByProductIds(Array.from(foundProductIds), session);

  const items = [];
  let totalAmount = 0;

  for (const [productId, quantity] of groupedItems.entries()) {
    const product = productsById.get(productId);
    const service = servicesById.get(productId);

    if (product) {
      const productBatches = batchesByProductId.get(productId) || [];
      const sellableQuantity = STAFF_getEligibleSellableQuantity({ product, batches: productBatches });

      if (sellableQuantity < quantity) {
        throw new STAFF_BillingError(`Insufficient stock for ${product.name}`, 400);
      }

      const unitPrice = Number(product.unitPrice ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new STAFF_BillingError(`Invalid unit price configuration for ${product.name}. Price must be greater than zero.`, 400);
      }

      const lineTotal = STAFF_roundCurrency(unitPrice * quantity);

      items.push({
        productId: product._id,
        name: product.name,
        genericName: product.genericName || "",
        brandName: product.brandName || "",
        unitPrice,
        quantity,
        lineTotal,
        type: "item",
      });

      totalAmount += lineTotal;
    } else if (service) {
      const unitPrice = Number(service.price ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new STAFF_BillingError(`Invalid unit price configuration for ${service.name}. Price must be greater than zero.`, 400);
      }
      const lineTotal = STAFF_roundCurrency(unitPrice * quantity);

      items.push({
        productId: service._id,
        name: service.name,
        genericName: "", // Services don't have generics
        brandName: "",
        unitPrice,
        quantity,
        lineTotal,
        type: "service",
      });

      totalAmount += lineTotal;
    } else {
      throw new STAFF_BillingError("One or more items were not found", 404);
    }
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
  try {
    await syncProductFromBatchTotals({
      productId,
      session,
      createDefaultBatchIfMissing: true,
      warningContext: "staff-billing-sync",
    });
  } catch (error) {
    if (String(error.message || "").includes("Product not found")) {
      throw new STAFF_BillingError("Product not found while syncing stock", 404);
    }
    throw error;
  }
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

export const STAFF_createBillingTransaction = async ({
  staffId,
  items,
  patientId,
  patientName,
  isGuest = false,
  discountRate = 0,
  pendingBalances = [],
  parmsIntentId = null,
}) => {
  const guestMode = Boolean(isGuest);
  const finalPatientId = guestMode
    ? await STAFF_getNextGuestPatientId()
    : String(patientId || "").trim();
  if (!finalPatientId) {
    throw new STAFF_BillingError("Patient ID is required", 400);
  }

  const finalPatientName = guestMode
    ? "N/A"
    : String(patientName || "").trim();
  if (!finalPatientName) {
    throw new STAFF_BillingError("Patient name is required", 400);
  }

  const parsedDiscountRate = Number(discountRate);
  if (!Number.isFinite(parsedDiscountRate) || parsedDiscountRate < 0 || parsedDiscountRate > 1) {
    throw new STAFF_BillingError("Discount rate must be a number between 0 and 1", 400);
  }

  const hasInventoryItems = Array.isArray(items) && items.length > 0;
  const snapshot = hasInventoryItems
    ? await STAFF_buildItemsSnapshot(items)
    : { items: [], totalAmount: 0 };

  const normalizedPending = STAFF_normalizePendingBalanceLines({
    pendingBalancesPayload: guestMode ? [] : pendingBalances,
    itemSnapshot: snapshot.items,
  });
  const normalizedPendingBalances = normalizedPending.lines;
  const pendingBalanceTotal = normalizedPending.total;

  if (!hasInventoryItems && pendingBalanceTotal <= 0) {
    throw new STAFF_BillingError("At least one billable line is required", 400);
  }

  // IMPORTANT: Prices in DB already include 12% VAT
  // We use REVERSE VAT calculation to show breakdown
  const subtotal = snapshot.totalAmount;
  const discountAmount = STAFF_roundCurrency(subtotal * parsedDiscountRate);
  const discountedInventoryTotal = STAFF_roundCurrency(subtotal - discountAmount);
  const totalAmount = STAFF_roundCurrency(discountedInventoryTotal + pendingBalanceTotal);

  // Reverse VAT calculation: Total = Net + VAT
  // Total = Net * 1.12
  // Net = Total / 1.12
  // VAT = Total - Net
  const inventoryNetAmount = STAFF_roundCurrency(discountedInventoryTotal / 1.12);
  const vatIncluded = STAFF_roundCurrency(discountedInventoryTotal - inventoryNetAmount);
  const netAmount = STAFF_roundCurrency(inventoryNetAmount + pendingBalanceTotal);

  let linkedIntent = null;
  const requestedIntentId = String(parmsIntentId || "").trim() || null;
  if (!guestMode) {
    try {
      linkedIntent = await resolveOpenIntentForPatient({
        patientId: finalPatientId,
      });
    } catch {
      linkedIntent = null;
    }
  }

  const resolvedIntentId = guestMode ? null : (linkedIntent?.intentId || requestedIntentId);

  const transaction = await STAFF_BillingTransaction.create({
    staffId,
    patientId: finalPatientId,
    patientName: finalPatientName,
    isGuest: guestMode,
    parmsIntentId: resolvedIntentId || null,
    parmsEncounterId: linkedIntent?.encounterId || null,
    parmsInvoiceReference: linkedIntent?.ibmsReference || null,
    parmsInvoiceNumber: linkedIntent?.ibmsInvoiceNumber || null,
    items: snapshot.items,
    parmsPendingBalances: normalizedPendingBalances,
    parmsPendingTotal: pendingBalanceTotal,
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

  const completedTransaction = await STAFF_executeWithOptionalTransaction(async (session) => {
    // Recheck status and stock in checkout step to block double-submit and race conditions.
    const transaction = await STAFF_getTransactionForStaff(transactionId, staffId, session);
    const now = new Date();

    if (transaction.status !== "PENDING_PAYMENT") {
      throw new STAFF_BillingError("Transaction has already been completed", 409);
    }

    if (parsedCashReceived < transaction.totalAmount) {
      throw new STAFF_BillingError("Insufficient cash received", 400);
    }

    const receiptNumber = STAFF_makeReceiptNumber();

    for (const item of transaction.items) {
      if (item.type === "service") {
        continue;
      }

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
        referenceId: `${receiptNumber}-${item.productId}`,
        session,
      });
    }

    const change = STAFF_roundCurrency(parsedCashReceived - transaction.totalAmount);
    const completedAt = new Date();

    const receiptSnapshot = {
      receiptNumber,
      clinic: {
        name: process.env.CLINIC_NAME || "IBMS Clinic",
      },
      transactionDateTime: completedAt,
      patientId: transaction.patientId,
      patientName: transaction.patientName,
      isGuest: Boolean(transaction.isGuest),
      staffId: transaction.staffId,
      items: transaction.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        type: item.type,
        batchAllocations: (item.batchAllocations || []).map((allocation) => ({
          batchId: allocation.batchId,
          batchNumber: allocation.batchNumber,
          quantity: allocation.quantity,
          expiryDate: allocation.expiryDate,
          expiryRisk: allocation.expiryRisk,
        })),
      })),
      pendingBalances: (transaction.parmsPendingBalances || []).map((line) => ({
        sourceType: line.sourceType,
        referenceId: line.referenceId,
        description: line.description,
        amount: line.amount,
      })),
      pendingBalanceTotal: STAFF_roundCurrency(transaction.parmsPendingTotal || 0),
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

    if (!transaction.parmsIntentId || !transaction.parmsInvoiceReference || !transaction.parmsInvoiceNumber) {
      try {
        const linkedIntent = await resolveOpenIntentForPatient({
          patientId: transaction.patientId,
          session,
        });

        if (linkedIntent) {
          transaction.parmsIntentId = transaction.parmsIntentId || linkedIntent.intentId;
          transaction.parmsEncounterId = transaction.parmsEncounterId || linkedIntent.encounterId;
          transaction.parmsInvoiceReference = transaction.parmsInvoiceReference || linkedIntent.ibmsReference;
          transaction.parmsInvoiceNumber = transaction.parmsInvoiceNumber || linkedIntent.ibmsInvoiceNumber;
        }
      } catch {
        // Intent lookup failures should not block cashier completion.
      }
    }

    if (!transaction.parmsInvoiceNumber) {
      transaction.parmsInvoiceNumber = receiptSnapshot.receiptNumber;
    }

    if (!transaction.parmsInvoiceReference) {
      transaction.parmsInvoiceReference = receiptSnapshot.receiptNumber;
    }

    await transaction.save({ session });

    try {
      await markIntentPaidFromTransaction({ transaction, session });
    } catch {
      // Intent update failures should not block cashier completion.
    }

    await STAFF_logBillingActivity({
      staffId,
      actionType: "billing-complete",
      description: `Completed billing transaction ${transaction._id}`,
      status: "completed",
      session,
    });

    return transaction;
  });

  syncCompletedTransactionReceiptToPARMS(completedTransaction._id).catch(() => {
    // Keep cashier flow non-blocking; failed attempts are retried by the worker.
  });

  return completedTransaction;
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
      if (item.type === "service") {
        continue;
      }
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
