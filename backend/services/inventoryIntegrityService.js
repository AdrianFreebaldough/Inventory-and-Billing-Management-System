import mongoose from "mongoose";
import Product from "../models/product.js";
import InventoryBatch from "../models/InventoryBatch.js";
import { BATCH_MANUAL_STATUS } from "./batchLifecycleService.js";

const INVENTORY_EPSILON = 0.000001;

const INVENTORY_buildSessionOptions = (session = null) => (session ? { session } : undefined);

const INVENTORY_withSession = (query, session = null) => {
  if (session) {
    query.session(session);
  }
  return query;
};

const INVENTORY_isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const INVENTORY_toNonNegativeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number(fallback ?? 0);
  }
  return parsed;
};

const INVENTORY_buildBatchNumber = (prefix = "AUTO") => {
  const datePart = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
};

const INVENTORY_sortBatchesForAdjustment = (batches) => {
  return [...(Array.isArray(batches) ? batches : [])].sort((a, b) => {
    const aHasExpiry = !!a?.expiryDate;
    const bHasExpiry = !!b?.expiryDate;

    if (aHasExpiry && bHasExpiry) {
      const expiryDiff = new Date(a.expiryDate) - new Date(b.expiryDate);
      if (expiryDiff !== 0) return expiryDiff;
    } else if (aHasExpiry !== bHasExpiry) {
      return aHasExpiry ? -1 : 1;
    }

    const createdAtA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdAtB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (createdAtA !== createdAtB) return createdAtA - createdAtB;

    return String(a?._id || "").localeCompare(String(b?._id || ""));
  });
};

const INVENTORY_shouldSkipAutoStatus = (batchStatus) => {
  const normalizedStatus = String(batchStatus || "").trim().toLowerCase();
  return normalizedStatus === "disposed" || normalizedStatus === "pending disposal";
};

const INVENTORY_getDesiredStatus = (currentQuantity) => {
  return currentQuantity <= 0
    ? BATCH_MANUAL_STATUS.OUT_OF_STOCK
    : BATCH_MANUAL_STATUS.ACTIVE;
};

const INVENTORY_normalizeBatchRecord = async ({ batch, session = null }) => {
  const normalizedQuantity = INVENTORY_toNonNegativeNumber(batch.quantity, 0);
  const normalizedCurrentQuantity = INVENTORY_toNonNegativeNumber(batch.currentQuantity, normalizedQuantity);
  const normalizedInitialQuantity = INVENTORY_toNonNegativeNumber(batch.initialQuantity, normalizedQuantity);

  const updates = {};

  if (Number(batch.quantity) !== normalizedQuantity) {
    updates.quantity = normalizedQuantity;
  }

  if (Number(batch.currentQuantity) !== normalizedCurrentQuantity) {
    updates.currentQuantity = normalizedCurrentQuantity;
  }

  if (Number(batch.initialQuantity) !== normalizedInitialQuantity) {
    updates.initialQuantity = normalizedInitialQuantity;
  }

  if (!INVENTORY_shouldSkipAutoStatus(batch.status)) {
    const desiredStatus = INVENTORY_getDesiredStatus(normalizedCurrentQuantity);
    if (batch.status !== desiredStatus) {
      updates.status = desiredStatus;
    }
  }

  if (Object.keys(updates).length) {
    await InventoryBatch.updateOne(
      { _id: batch._id },
      { $set: updates },
      INVENTORY_buildSessionOptions(session)
    );

    if (updates.quantity !== undefined) batch.quantity = updates.quantity;
    if (updates.currentQuantity !== undefined) batch.currentQuantity = updates.currentQuantity;
    if (updates.initialQuantity !== undefined) batch.initialQuantity = updates.initialQuantity;
    if (updates.status !== undefined) batch.status = updates.status;
  }

  return {
    normalized: Object.keys(updates).length > 0,
    batch,
  };
};

const INVENTORY_loadBatchesForProduct = async ({ productId, session = null }) => {
  const query = InventoryBatch.find({ product: productId })
    .sort({ expiryDate: 1, createdAt: 1, _id: 1 });

  INVENTORY_withSession(query, session);
  return query;
};

export const syncProductFromBatchTotals = async ({
  productId,
  session = null,
  createDefaultBatchIfMissing = true,
  autoCorrect = true,
  warningContext = "inventory-integrity",
} = {}) => {
  if (!INVENTORY_isObjectId(productId)) {
    throw new Error("Invalid product id");
  }

  const productQuery = Product.findById(productId);
  INVENTORY_withSession(productQuery, session);
  const product = await productQuery;

  if (!product) {
    throw new Error("Product not found");
  }

  let createdDefaultBatch = false;
  let normalizedBatchCount = 0;
  let batches = await INVENTORY_loadBatchesForProduct({ productId, session });

  if (createDefaultBatchIfMissing && batches.length === 0) {
    const currentProductQuantity = INVENTORY_toNonNegativeNumber(product.quantity, 0);
    if (currentProductQuantity > 0) {
      await InventoryBatch.create(
        [
          {
            product: product._id,
            batchNumber: product.batchNumber || INVENTORY_buildBatchNumber("AUTO"),
            quantity: currentProductQuantity,
            currentQuantity: currentProductQuantity,
            initialQuantity: currentProductQuantity,
            expiryDate: product.expiryDate || null,
            supplier: product.supplier || null,
            notes: "Auto-generated legacy batch during integrity sync",
            status: INVENTORY_getDesiredStatus(currentProductQuantity),
          },
        ],
        INVENTORY_buildSessionOptions(session)
      );

      createdDefaultBatch = true;
      batches = await INVENTORY_loadBatchesForProduct({ productId, session });
    }
  }

  for (const batch of batches) {
    const { normalized } = await INVENTORY_normalizeBatchRecord({ batch, session });
    if (normalized) {
      normalizedBatchCount += 1;
    }
  }

  const totalBatchQuantity = batches.reduce((sum, batch) => {
    return sum + INVENTORY_toNonNegativeNumber(batch.currentQuantity, batch.quantity);
  }, 0);

  const previousProductQuantity = INVENTORY_toNonNegativeNumber(product.quantity, 0);
  const quantityMismatch = Math.abs(previousProductQuantity - totalBatchQuantity) > INVENTORY_EPSILON;

  if (quantityMismatch) {
    console.warn(
      `[integrity] ${warningContext}: corrected product ${product._id} quantity ${previousProductQuantity} -> ${totalBatchQuantity}`
    );
  }

  if (autoCorrect && (quantityMismatch || createdDefaultBatch || normalizedBatchCount > 0)) {
    product.quantity = totalBatchQuantity;
    product.expectedRemaining = totalBatchQuantity;

    if (!Number.isFinite(Number(product.physicalCount))) {
      product.physicalCount = totalBatchQuantity;
    }

    const normalizedPhysicalCount = INVENTORY_toNonNegativeNumber(product.physicalCount, totalBatchQuantity);
    product.physicalCount = normalizedPhysicalCount;
    product.variance = normalizedPhysicalCount - totalBatchQuantity;
    product.discrepancyStatus = product.variance === 0 ? "Balanced" : "With Variance";

    await product.save(INVENTORY_buildSessionOptions(session));
  }

  return {
    product,
    totalBatchQuantity,
    previousProductQuantity,
    quantityMismatch,
    createdDefaultBatch,
    normalizedBatchCount,
  };
};

export const applyBatchDeltaToProduct = async ({
  productId,
  quantityDelta,
  session = null,
  actorId = null,
  batchPrefix = "ADJ",
  notes = "Manual batch adjustment",
} = {}) => {
  if (!INVENTORY_isObjectId(productId)) {
    throw new Error("Invalid product id");
  }

  const parsedDelta = Number(quantityDelta);
  if (!Number.isFinite(parsedDelta) || parsedDelta === 0) {
    throw new Error("quantityDelta must be a non-zero number");
  }

  const productQuery = Product.findById(productId).select("_id expiryDate supplier");
  INVENTORY_withSession(productQuery, session);
  const product = await productQuery;
  if (!product) {
    throw new Error("Product not found");
  }

  if (parsedDelta > 0) {
    const batchPayload = {
      product: product._id,
      batchNumber: INVENTORY_buildBatchNumber(batchPrefix),
      quantity: parsedDelta,
      currentQuantity: parsedDelta,
      initialQuantity: parsedDelta,
      expiryDate: product.expiryDate || null,
      supplier: product.supplier || null,
      notes,
      status: INVENTORY_getDesiredStatus(parsedDelta),
    };

    if (INVENTORY_isObjectId(actorId)) {
      batchPayload.createdBy = actorId;
    }

    await InventoryBatch.create([batchPayload], INVENTORY_buildSessionOptions(session));
  } else {
    let remainingToDeduct = Math.abs(parsedDelta);

    const candidateBatchQuery = InventoryBatch.find({
      product: productId,
      $or: [
        { currentQuantity: { $gt: 0 } },
        { currentQuantity: { $exists: false }, quantity: { $gt: 0 } },
      ],
      status: { $nin: [BATCH_MANUAL_STATUS.PENDING_DISPOSAL, BATCH_MANUAL_STATUS.DISPOSED] },
    })
      .select("_id quantity currentQuantity expiryDate createdAt status");

    INVENTORY_withSession(candidateBatchQuery, session);
    const candidateBatches = await candidateBatchQuery;
    const orderedBatches = INVENTORY_sortBatchesForAdjustment(candidateBatches);

    for (const batch of orderedBatches) {
      if (remainingToDeduct <= 0) break;

      const currentQty = INVENTORY_toNonNegativeNumber(batch.currentQuantity, batch.quantity);
      if (currentQty <= 0) continue;

      const deduction = Math.min(currentQty, remainingToDeduct);
      batch.currentQuantity = currentQty - deduction;

      if (!INVENTORY_shouldSkipAutoStatus(batch.status)) {
        batch.status = INVENTORY_getDesiredStatus(batch.currentQuantity);
      }

      await batch.save(INVENTORY_buildSessionOptions(session));
      remainingToDeduct -= deduction;
    }

    if (remainingToDeduct > 0) {
      throw new Error("Adjustment would result in negative batch stock");
    }
  }

  return syncProductFromBatchTotals({
    productId,
    session,
    createDefaultBatchIfMissing: true,
    autoCorrect: true,
    warningContext: "batch-delta",
  });
};

export const setProductQuantityViaBatches = async ({
  productId,
  targetQuantity,
  session = null,
  actorId = null,
  batchPrefix = "DISC",
  notes = "Batch discrepancy reconciliation",
} = {}) => {
  const normalizedTarget = Number(targetQuantity);
  if (!Number.isFinite(normalizedTarget) || normalizedTarget < 0) {
    throw new Error("targetQuantity must be a valid non-negative number");
  }

  const baseline = await syncProductFromBatchTotals({
    productId,
    session,
    createDefaultBatchIfMissing: true,
    autoCorrect: true,
    warningContext: "set-product-quantity-baseline",
  });

  const delta = normalizedTarget - baseline.totalBatchQuantity;
  if (Math.abs(delta) <= INVENTORY_EPSILON) {
    return baseline;
  }

  return applyBatchDeltaToProduct({
    productId,
    quantityDelta: delta,
    session,
    actorId,
    batchPrefix,
    notes,
  });
};

export const repairAllInventoryBatchIntegrity = async ({
  session = null,
  createDefaultBatchIfMissing = true,
  warningContext = "startup-integrity-check",
} = {}) => {
  const productQuery = Product.find({ isArchived: { $ne: true } }).select("_id").lean();
  INVENTORY_withSession(productQuery, session);
  const products = await productQuery;

  let correctedProducts = 0;
  let createdDefaultBatches = 0;
  let normalizedBatches = 0;

  for (const product of products) {
    const result = await syncProductFromBatchTotals({
      productId: product._id,
      session,
      createDefaultBatchIfMissing,
      autoCorrect: true,
      warningContext,
    });

    if (result.quantityMismatch || result.createdDefaultBatch || result.normalizedBatchCount > 0) {
      correctedProducts += 1;
    }

    if (result.createdDefaultBatch) {
      createdDefaultBatches += 1;
    }

    normalizedBatches += result.normalizedBatchCount;
  }

  return {
    scannedProducts: products.length,
    correctedProducts,
    createdDefaultBatches,
    normalizedBatches,
  };
};