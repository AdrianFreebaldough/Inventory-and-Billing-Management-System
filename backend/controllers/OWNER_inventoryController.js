import mongoose from "mongoose";
import Product from "../models/product.js";
import InventoryRequest from "../models/InventoryRequest.js";
import ActivityLog from "../models/activityLog.js";
import OWNER_ArchivedProduct from "../models/OWNER_archivedProduct.js";
import InventoryBatch from "../models/InventoryBatch.js";
import { createStockLog } from "../services/Owner_StockLog.service.js";
import { getExpirationStatus, getDaysUntilExpiry } from "../services/expirationService.js";
import { classifyExpiryRisk, toUiExpiryRiskKey } from "../services/fefoService.js";
import { getBatchLifecycleFlags, getBatchEffectiveStatus } from "../services/batchLifecycleService.js";
import {
  applyBatchDeltaToProduct,
  setProductQuantityViaBatches,
  syncProductFromBatchTotals,
} from "../services/inventoryIntegrityService.js";

const OWNER_parseNonNegativeNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

const OWNER_generateBatchNumber = (prefix = "BATCH") => {
  const datePart = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
};

const OWNER_pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const asString = String(value).trim();
    if (asString) return value;
  }
  return null;
};

const OWNER_normalizeCategory = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return "";

  const canonicalMap = {
    antibiotic: "Antibiotic",
    antibiotics: "Antibiotic",
    medicine: "Medicine",
    medicines: "Medicine",
    analgesic: "Analgesic",
    analgesics: "Analgesic",
    antipyretic: "Antipyretic",
    antipyretics: "Antipyretic",
    antihistamine: "Antihistamine",
    antihistamines: "Antihistamine",
    antacid: "Antacid",
    antacids: "Antacid",
    vitamin: "Vitamin",
    vitamins: "Vitamin",
    vaccine: "Vaccine",
    vaccines: "Vaccine",
    "first aid": "First Aid",
    "first aid medical supplies": "First Aid",
    "personal care": "Personal Care",
  };

  const canonical = canonicalMap[normalized] || normalized;
  return canonical
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const OWNER_buildCategoryFilterRegex = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return null;
  if (normalized === "all categories") return null;

  const aliases = {
    antibiotic: "antibiotic",
    antibiotics: "antibiotic",
    medicine: "medicine",
    medicines: "medicine",
    analgesic: "analgesic",
    analgesics: "analgesic",
    antipyretic: "antipyretic",
    antipyretics: "antipyretic",
    antihistamine: "antihistamine",
    antihistamines: "antihistamine",
    antacid: "antacid",
    antacids: "antacid",
    vitamin: "vitamin",
    vitamins: "vitamin",
    vaccine: "vaccine",
    vaccines: "vaccine",
    "first aid": "first aid",
    "first aid medical supplies": "first aid",
    "personal care": "personal care",
  };

  const canonical = aliases[normalized] || normalized;
  const escapedCanonical = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `^${escapedCanonical.replace(/\s+/g, "[-_\\s]*")}s?$`;
  return new RegExp(pattern, "i");
};

const OWNER_isInventoryServiceCategory = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes("service") ||
    normalized.includes("consult") ||
    normalized.includes("follow") ||
    normalized.includes("checkup") ||
    normalized.includes("visit") ||
    normalized === "lab test" ||
    normalized.includes("laboratory") ||
    normalized === "vaccination" ||
    normalized === "immunization"
  );
};

const OWNER_buildLegacyBatch = (product) => {
  if (!product || Number(product.quantity ?? 0) <= 0) {
    return null;
  }

  const fallbackBatchNumber = product.batchNumber || `BATCH-INITIAL-${String(product._id).slice(-6).toUpperCase()}`;

  return {
    _id: `legacy-${product._id}`,
    product: product._id,
    batchNumber: fallbackBatchNumber,
    quantity: Number(product.quantity ?? 0),
    currentQuantity: Number(product.quantity ?? 0),
    initialQuantity: Number(product.quantity ?? 0),
    expiryDate: product.expiryDate || null,
    supplier: product.supplier || null,
    createdAt: product.createdAt || null,
    isLegacy: true,
  };
};

const OWNER_REQUEST_STATUS_PRIORITY = {
  pending: 1,
  approved: 2,
  rejected: 3,
};

const OWNER_getRequestTimestamp = (request) => {
  const raw = request?.date_requested || request?.createdAt || null;
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const OWNER_sortRequestsLatestFirst = (requests = []) => {
  requests.sort((a, b) => OWNER_getRequestTimestamp(b) - OWNER_getRequestTimestamp(a));
  return requests;
};

const OWNER_sortRequestsByStatusThenLatest = (requests = []) => {
  requests.sort((a, b) => {
    const aPriority = OWNER_REQUEST_STATUS_PRIORITY[a?.status] || Number.MAX_SAFE_INTEGER;
    const bPriority = OWNER_REQUEST_STATUS_PRIORITY[b?.status] || Number.MAX_SAFE_INTEGER;

    if (aPriority !== bPriority) return aPriority - bPriority;
    return OWNER_getRequestTimestamp(b) - OWNER_getRequestTimestamp(a);
  });

  return requests;
};

const OWNER_attachBatchDataToProducts = async (products) => {
  if (!products.length) return products;

  const productIds = products.map((product) => product._id);

  const batches = await InventoryBatch.find({
    product: { $in: productIds },
  })
    .sort({ expiryDate: 1, createdAt: 1 })
    .lean();

  const batchesByProduct = new Map();

  for (const batch of batches) {
    const key = String(batch.product);
    if (!batchesByProduct.has(key)) {
      batchesByProduct.set(key, []);
    }
    batchesByProduct.get(key).push(batch);
  }

  return products.map((product) => {
    const key = String(product._id);
    const existingBatches = batchesByProduct.get(key) || [];
    const fallbackLegacyBatch = existingBatches.length === 0 ? OWNER_buildLegacyBatch(product) : null;
    const finalBatches = fallbackLegacyBatch ? [fallbackLegacyBatch] : existingBatches;
    const totalBatchQuantity = finalBatches.reduce((sum, batch) => sum + Number(batch.currentQuantity ?? batch.quantity ?? 0), 0);
    const productQuantity = Number(product.quantity ?? 0);

    const nearestBatch = finalBatches
      .filter((batch) => Number(batch.currentQuantity ?? batch.quantity ?? 0) > 0)
      .filter((batch) => batch.expiryDate)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0] || null;

    const batchesWithRisk = finalBatches.map((batch) => ({
      ...batch,
      expiryRisk: classifyExpiryRisk(batch.expiryDate),
    }));

    return {
      ...product,
      productQuantity,
      batches: batchesWithRisk,
      batchCount: batchesWithRisk.length,
      totalBatchQuantity,
      nearestExpiryDate: nearestBatch?.expiryDate || product.expiryDate || null,
      nearestBatchNumber: nearestBatch?.batchNumber || product.batchNumber || null,
      nearestBatchSupplier: nearestBatch?.supplier || product.supplier || null,
      expiryRisk: classifyExpiryRisk(nearestBatch?.expiryDate || product.expiryDate || null),
    };
  });
};

const OWNER_enrichMissingFieldsFromApprovedRequests = async (products) => {
  if (!Array.isArray(products) || products.length === 0) return products;

  const productsNeedingFallback = products.filter((product) =>
    !OWNER_pickFirstNonEmpty(product.genericName, product.generic) ||
    !OWNER_pickFirstNonEmpty(product.dosageForm, product.dosage) ||
    !OWNER_pickFirstNonEmpty(product.strength) ||
    !OWNER_pickFirstNonEmpty(product.medicineName, product.name) ||
    !OWNER_pickFirstNonEmpty(product.supplier, product.supplierName)
  );

  if (!productsNeedingFallback.length) return products;

  const productIds = productsNeedingFallback.map((product) => product._id);
  const approvedAddItemRequests = await InventoryRequest.find({
    requestType: "ADD_ITEM",
    status: "approved",
    product: { $in: productIds },
  })
    .sort({ reviewedAt: -1, createdAt: -1 })
    .select("product genericName brandName dosageForm strength medicineName supplier")
    .lean();

  const requestByProductId = new Map();
  for (const request of approvedAddItemRequests) {
    const key = String(request.product);
    if (!requestByProductId.has(key)) {
      requestByProductId.set(key, request);
    }
  }

  return products.map((product) => {
    const fallback = requestByProductId.get(String(product._id));
    if (!fallback) return product;

    return {
      ...product,
      genericName: OWNER_pickFirstNonEmpty(product.genericName, product.generic, fallback.genericName),
      brandName: OWNER_pickFirstNonEmpty(product.brandName, product.brand, fallback.brandName),
      dosageForm: OWNER_pickFirstNonEmpty(product.dosageForm, product.dosage, fallback.dosageForm),
      strength: OWNER_pickFirstNonEmpty(product.strength, product.Strength, product.dose, product.dosageStrength, fallback.strength),
      medicineName: OWNER_pickFirstNonEmpty(product.medicineName, fallback.medicineName, product.name),
      supplier: OWNER_pickFirstNonEmpty(product.supplier, product.supplierName, fallback.supplier),
    };
  });
};

const OWNER_enrichProductWithExpiration = (product) => {
  const referenceExpiryDate = product.nearestExpiryDate || product.expiryDate;
  const expectedRemaining = Number.isFinite(Number(product.expectedRemaining))
    ? Number(product.expectedRemaining)
    : Number(product.productQuantity ?? product.quantity ?? 0);

  const physicalCount = Number.isFinite(Number(product.physicalCount))
    ? Number(product.physicalCount)
    : expectedRemaining;

  const variance = Number.isFinite(Number(product.variance))
    ? Number(product.variance)
    : physicalCount - expectedRemaining;

  const discrepancyStatus = variance === 0 ? "Balanced" : "With Variance";

  return {
    ...product,
    quantity: Number(product.productQuantity ?? product.quantity ?? 0),
    totalQuantity: Number(product.productQuantity ?? product.quantity ?? 0),
    batchQuantity: Number(product.totalBatchQuantity ?? 0),
    expiryDate: referenceExpiryDate || null,
    nearestExpiryDate: referenceExpiryDate || null,
    expiryRisk: product.expiryRisk || classifyExpiryRisk(referenceExpiryDate || null),
    expiryRiskKey: toUiExpiryRiskKey(product.expiryRisk || classifyExpiryRisk(referenceExpiryDate || null)),
    batchNumber: product.nearestBatchNumber || product.batchNumber || null,
    supplier: OWNER_pickFirstNonEmpty(product.nearestBatchSupplier, product.supplier, product.supplierName),
    genericName: OWNER_pickFirstNonEmpty(product.genericName, product.generic),
    brandName: OWNER_pickFirstNonEmpty(product.brandName, product.brand),
    dosageForm: OWNER_pickFirstNonEmpty(product.dosageForm, product.dosage),
    strength: OWNER_pickFirstNonEmpty(product.strength, product.Strength, product.dose, product.dosageStrength),
    medicineName: OWNER_pickFirstNonEmpty(product.medicineName, product.name),
    expirationStatus: getExpirationStatus(referenceExpiryDate),
    daysUntilExpiry: getDaysUntilExpiry(referenceExpiryDate),
    expectedRemaining,
    physicalCount,
    variance,
    discrepancyStatus,
  };
};

const OWNER_syncDiscrepancyFromQuantity = (productLike) => {
  const expectedRemaining = Number(productLike.quantity ?? 0);
  const physicalCount = Number.isFinite(Number(productLike.physicalCount))
    ? Number(productLike.physicalCount)
    : expectedRemaining;
  const variance = physicalCount - expectedRemaining;
  const discrepancyStatus = variance === 0 ? "Balanced" : "With Variance";

  productLike.expectedRemaining = expectedRemaining;
  productLike.physicalCount = physicalCount;
  productLike.variance = variance;
  productLike.discrepancyStatus = discrepancyStatus;
};

const OWNER_mapBatchForResponse = (batch, unit = "pcs") => {
  const lifecycle = getBatchLifecycleFlags(batch);
  const currentQuantity = Number(batch.currentQuantity ?? batch.quantity ?? 0);
  const originalQuantity = Number.isFinite(Number(batch.initialQuantity))
    ? Number(batch.initialQuantity)
    : Number(batch.quantity ?? 0);

  return {
    _id: batch._id,
    batchNumber: batch.batchNumber || null,
    quantity: originalQuantity,
    currentQuantity,
    originalQuantity,
    expiryDate: batch.expiryDate || null,
    expiryRisk: classifyExpiryRisk(batch.expiryDate || null),
    supplier: batch.supplier || null,
    createdAt: batch.createdAt || null,
    isLegacy: !!batch.isLegacy,
    status: getBatchEffectiveStatus(batch),
    statusKey: String(getBatchEffectiveStatus(batch)).toLowerCase().replace(/\s+/g, "-"),
    unit,
    ...lifecycle,
  };
};

export const OWNER_getActiveInventory = async (req, res) => {
  try {
    const { category, expirationFilter, expiryRisk } = req.query;
    
    const filter = { isArchived: { $ne: true } };

    const categoryRegex = OWNER_buildCategoryFilterRegex(category);
    if (categoryRegex) {
      filter.category = categoryRegex;
    }

    // Expiration filters
    if (expirationFilter) {
      const now = new Date();
      if (expirationFilter === "expiring_week") {
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        filter.expiryDate = { $ne: null, $lte: weekFromNow, $gte: now };
      } else if (expirationFilter === "expiring_month") {
        const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        filter.expiryDate = { $ne: null, $lte: monthFromNow, $gte: now };
      } else if (expirationFilter === "out_of_stock") {
        filter.status = "out";
      }
    }

    const products = await Product.find(filter)
      .sort({ name: 1 })
      .lean();

    const nonServiceProducts = products.filter(
      (product) => !OWNER_isInventoryServiceCategory(product.category)
    );

    const productsWithBatches = await OWNER_attachBatchDataToProducts(nonServiceProducts);
    const enrichedWithRequestFields = await OWNER_enrichMissingFieldsFromApprovedRequests(productsWithBatches);
    const enrichedProducts = enrichedWithRequestFields.map(OWNER_enrichProductWithExpiration);

    const normalizedRiskFilter = String(expiryRisk || "").trim().toLowerCase();
    const filteredProducts = normalizedRiskFilter
      ? enrichedProducts.filter((product) => product.expiryRiskKey === normalizedRiskFilter)
      : enrichedProducts;

    return res.status(200).json({
      message: "Active inventory fetched successfully",
      count: filteredProducts.length,
      data: filteredProducts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const OWNER_getInventoryItemDetails = async (req, res) => {
  try {
    const { itemId } = req.params;

    await syncProductFromBatchTotals({
      productId: itemId,
      createDefaultBatchIfMissing: true,
      warningContext: "owner-item-details",
    });

    const product = await Product.findById(itemId).lean();
    if (!product) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    const allBatches = await InventoryBatch.find({ product: product._id })
      .sort({ expiryDate: 1, createdAt: 1 })
      .lean();

    const positiveBatches = allBatches.filter((batch) => Number(batch.currentQuantity ?? batch.quantity ?? 0) > 0);
    const fallbackLegacyBatch = allBatches.length === 0 ? OWNER_buildLegacyBatch(product) : null;
    const responseBatches = fallbackLegacyBatch ? [fallbackLegacyBatch] : allBatches;

    const nearestBatch = positiveBatches
      .filter((batch) => batch.expiryDate)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0] || null;

    const productWithBatches = {
      ...product,
      productQuantity: Number(product.quantity ?? 0),
      batches: responseBatches.map((batch) => OWNER_mapBatchForResponse(batch, product.unit || "pcs")),
      batchCount: responseBatches.length,
      availableBatchCount: positiveBatches.length,
      totalBatchQuantity: positiveBatches.reduce((sum, batch) => sum + Number(batch.currentQuantity ?? batch.quantity ?? 0), 0),
      nearestExpiryDate: nearestBatch?.expiryDate || product.expiryDate || null,
      nearestBatchNumber: nearestBatch?.batchNumber || product.batchNumber || null,
      nearestBatchSupplier: nearestBatch?.supplier || product.supplier || null,
      expiryRisk: classifyExpiryRisk(nearestBatch?.expiryDate || product.expiryDate || null),
    };

    const [enrichedProduct] = await OWNER_enrichMissingFieldsFromApprovedRequests([productWithBatches]);

    return res.status(200).json({
      data: OWNER_enrichProductWithExpiration(enrichedProduct),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const OWNER_getArchivedInventory = async (req, res) => {
  try {
    const products = await Product.find({ isArchived: true })
      .sort({ archivedAt: -1 })
      .lean();

    return res.status(200).json({
      message: "Archived inventory fetched successfully",
      count: products.length,
      data: products,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const OWNER_addProduct = async (req, res) => {
  try {
    const { name, category, quantity, unit, unitPrice, minStock, expiryDate, batchNumber, description, supplier, genericName, brandName, dosageForm, strength, medicineName } = req.body;

    const parsedQuantity = OWNER_parseNonNegativeNumber(quantity ?? 0);
    const parsedUnitPrice = Number(unitPrice ?? 0);
    if (!name || !category || parsedQuantity === null) {
      return res.status(400).json({
        message: "name and category are required; quantity must be non-negative",
      });
    }

    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
      return res.status(400).json({
        message: "unitPrice must be a valid non-negative number",
      });
    }

    const product = await Product.create({
      name: String(name).trim(),
      category: OWNER_normalizeCategory(category),
      quantity: parsedQuantity,
      unitPrice: parsedUnitPrice,
      unit: unit ? String(unit).trim() : "pcs",
      minStock: minStock != null ? Number(minStock) : 10,
      expiryDate: expiryDate || null,
      batchNumber: batchNumber ? String(batchNumber).trim() : null,
      description: description ? String(description).trim() : "",
      supplier: supplier ? String(supplier).trim() : null,
      genericName: genericName ? String(genericName).trim() : null,
      brandName: brandName ? String(brandName).trim() : null,
      dosageForm: dosageForm ? String(dosageForm).trim() : null,
      strength: strength ? String(strength).trim() : null,
      medicineName: medicineName ? String(medicineName).trim() : null,
      physicalCount: parsedQuantity,
      expectedRemaining: parsedQuantity,
      variance: 0,
      discrepancyStatus: "Balanced",
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
    });

    if (parsedQuantity > 0) {
      await InventoryBatch.create({
        product: product._id,
        batchNumber: batchNumber ? String(batchNumber).trim() : OWNER_generateBatchNumber("ADD"),
        quantity: parsedQuantity,
        expiryDate: expiryDate || null,
        supplier: supplier ? String(supplier).trim() : null,
        createdBy: req.user.id,
        notes: "Initial owner add-item stock",
      });
    }

    await ActivityLog.create({
      action: "ADD_PRODUCT",
      performedBy: req.user.id,
      entityType: "Product",
      entityId: product._id,
      details: {
        movement: {
          quantityBefore: 0,
          quantityChange: parsedQuantity,
          quantityAfter: product.quantity,
        },
        notes: "Owner added product directly to active inventory",
        metadata: {
          name: product.name,
          category: product.category,
          unit: product.unit,
        },
      },
    });

    if (parsedQuantity > 0) {
      await createStockLog({
        productId: product._id,
        movementType: "ITEM_CREATED",
        quantityChange: parsedQuantity,
        performedBy: {
          userId: req.user.id,
          role: req.user.role,
        },
        source: "MANUAL",
        notes: `New item created: ${product.name}`,
      });
    }

    return res.status(201).json({
      message: "Product added to active inventory",
      data: product,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const OWNER_getPendingInventoryRequests = async (req, res) => {
  try {
    const requests = await InventoryRequest.find({ status: "pending" })
      .populate("product", "name category quantity isArchived")
      .populate("requestedBy", "email role")
      .lean();

    const filtered = requests.filter((request) => {
      if (request.requestType === "ADD_ITEM") {
        return true;
      }

      if (request.requestType === "RESTOCK") {
        return request.product && request.product.isArchived !== true;
      }

      return false;
    });

    OWNER_sortRequestsLatestFirst(filtered);

    return res.status(200).json({
      message: "Pending requests fetched successfully",
      count: filtered.length,
      data: filtered,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const OWNER_approveInventoryRequest = async (req, res) => {
  const { requestId } = req.params;
  const ownerId = req.user?.id;
  const { approvedQuantity, expirationDate, batchNumber, supplier } = req.body;

  if (!mongoose.Types.ObjectId.isValid(ownerId)) {
    return res.status(401).json({
      message: "Invalid authenticated user id. Please log in again.",
    });
  }

  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const request = await InventoryRequest.findOne({
        _id: requestId,
        status: "pending",
      }).session(session);

      if (!request) {
        throw new Error("PENDING_REQUEST_NOT_FOUND");
      }

      if (request.requestType === "ADD_ITEM") {
        /* Owner may override the requested initial quantity */
        const finalQuantity =
          approvedQuantity != null && Number.isFinite(Number(approvedQuantity)) && Number(approvedQuantity) >= 0
            ? Number(approvedQuantity)
            : request.initialQuantity;

        const createdProduct = await Product.create(
          [
            {
              name: request.itemName,
              category: OWNER_normalizeCategory(request.category),
              quantity: finalQuantity,
              unitPrice: Number(request.unitPrice ?? 0),
              unit: request.unit || "pcs",
              minStock: Number(request.minStock ?? 10),
              description: request.description || "",
              supplier: request.supplier || null,
              expiryDate: request.expiryDate || null,
              batchNumber: request.batchNumber || null,
              genericName: request.genericName || null,
              brandName: request.brandName || null,
              dosageForm: request.dosageForm || null,
              strength: request.strength || null,
              medicineName: request.medicineName || null,
              physicalCount: finalQuantity,
              expectedRemaining: finalQuantity,
              variance: 0,
              discrepancyStatus: "Balanced",
              isArchived: false,
              archivedAt: null,
              archivedBy: null,
            },
          ],
          { session }
        );

        const product = createdProduct[0];

        if (finalQuantity > 0) {
          await InventoryBatch.create(
            [
              {
                product: product._id,
                batchNumber: request.batchNumber || OWNER_generateBatchNumber("ADD"),
                quantity: finalQuantity,
                expiryDate: request.expiryDate || null,
                supplier: request.supplier || null,
                sourceRequest: request._id,
                createdBy: ownerId,
                notes: "Batch created from approved add-item request",
              },
            ],
            { session }
          );
        }

        request.product = product._id;
        request.status = "approved";
        request.reviewedBy = ownerId;
        request.reviewedAt = new Date();
        request.rejectionReason = null;
        await request.save({ session });

        await ActivityLog.create(
          [
            {
              action: "APPROVE_REQUEST",
              performedBy: ownerId,
              entityType: "Product",
              entityId: product._id,
              details: {
                requestId: request._id,
                requestType: request.requestType,
                movement: {
                  quantityBefore: 0,
                  quantityChange: finalQuantity,
                  quantityAfter: product.quantity,
                },
                originalRequestedQuantity: request.initialQuantity,
                approvedQuantity: finalQuantity,
                notes: "Owner approved add-item inventory request",
              },
            },
          ],
          { session }
        );

        if (finalQuantity > 0) {
          await createStockLog({
            productId: product._id,
            movementType: "RESTOCK",
            quantityChange: finalQuantity,
            performedBy: {
              userId: ownerId,
              role: req.user.role,
            },
            source: "SYSTEM",
            session,
          });
        }

        responsePayload = {
          requestId: request._id,
          requestType: request.requestType,
          productId: product._id,
          quantityBefore: 0,
          quantityAdded: finalQuantity,
          quantityAfter: product.quantity,
        };
      } else if (request.requestType === "RESTOCK") {
        const product = await Product.findOne({
          _id: request.product,
          isArchived: { $ne: true },
        }).session(session);

        if (!product) {
          throw new Error("ACTIVE_PRODUCT_NOT_FOUND");
        }

        /* Owner may override the requested restock quantity */
        const finalQuantity =
          approvedQuantity != null && Number.isFinite(Number(approvedQuantity)) && Number(approvedQuantity) >= 0
            ? Number(approvedQuantity)
            : request.requestedQuantity;

        const normalizedExpiryDate = expirationDate ? new Date(expirationDate) : null;
        if (!(normalizedExpiryDate instanceof Date) || Number.isNaN(normalizedExpiryDate?.getTime?.())) {
          throw new Error("INVALID_BATCH_EXPIRATION");
        }

        const normalizedBatchNumber = String(batchNumber || "").trim() || OWNER_generateBatchNumber("RST");
        const normalizedSupplier = supplier ? String(supplier).trim() : null;

        const quantityBefore = product.quantity;

        if (finalQuantity > 0) {
          await InventoryBatch.create(
            [
              {
                product: product._id,
                batchNumber: normalizedBatchNumber,
                quantity: finalQuantity,
                expiryDate: normalizedExpiryDate,
                supplier: normalizedSupplier,
                sourceRequest: request._id,
                createdBy: ownerId,
                notes: "Batch created from approved restock request",
              },
            ],
            { session }
          );
        }

        const syncResult = await syncProductFromBatchTotals({
          productId: product._id,
          session,
          createDefaultBatchIfMissing: true,
          warningContext: "owner-approve-restock",
        });

        request.status = "approved";
        request.reviewedBy = ownerId;
        request.reviewedAt = new Date();
        request.rejectionReason = null;
        await request.save({ session });

        await ActivityLog.create(
          [
            {
              action: "APPROVE_REQUEST",
              performedBy: ownerId,
              entityType: "Product",
              entityId: product._id,
              details: {
                requestId: request._id,
                requestType: request.requestType,
                movement: {
                  quantityBefore,
                  quantityChange: finalQuantity,
                  quantityAfter: syncResult.totalBatchQuantity,
                },
                originalRequestedQuantity: request.requestedQuantity,
                approvedQuantity: finalQuantity,
                notes: "Owner approved restock inventory request",
              },
            },
          ],
          { session }
        );

        await createStockLog({
          productId: product._id,
          movementType: "RESTOCK",
          quantityChange: finalQuantity,
          performedBy: {
            userId: ownerId,
            role: req.user.role,
          },
          source: "SYSTEM",
          session,
        });

        responsePayload = {
          requestId: request._id,
          requestType: request.requestType,
          productId: product._id,
          quantityBefore,
          quantityAdded: finalQuantity,
          quantityAfter: syncResult.totalBatchQuantity,
          batchNumber: normalizedBatchNumber,
          expirationDate: normalizedExpiryDate,
          supplier: normalizedSupplier,
        };
      } else {
        throw new Error("INVALID_REQUEST_TYPE");
      }
    });

    return res.status(200).json({
      message: "Request approved and inventory updated",
      data: responsePayload,
    });
  } catch (error) {
    if (error.message === "PENDING_REQUEST_NOT_FOUND") {
      return res.status(404).json({ message: "Pending inventory request not found" });
    }

    if (error.message === "ACTIVE_PRODUCT_NOT_FOUND") {
      return res.status(404).json({ message: "Active product for this request not found" });
    }

    if (error.message === "INVALID_REQUEST_TYPE") {
      return res.status(400).json({ message: "Invalid request type" });
    }

    if (error.message === "INVALID_BATCH_EXPIRATION") {
      return res.status(400).json({ message: "Valid expirationDate is required for restock batch approval" });
    }

    return res.status(500).json({ message: error.message });
  } finally {
    await session.endSession();
  }
};

export const OWNER_rejectInventoryRequest = async (req, res) => {
  const { requestId } = req.params;
  const { reason } = req.body;

  try {
    const request = await InventoryRequest.findOne({
      _id: requestId,
      status: "pending",
    });

    if (!request) {
      return res.status(404).json({ message: "Pending inventory request not found" });
    }

    request.status = "rejected";
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.rejectionReason = reason ? String(reason).trim() : null;
    await request.save();

    await ActivityLog.create({
      action: "REJECT_REQUEST",
      performedBy: req.user.id,
      entityType: "InventoryRequest",
      entityId: request._id,
      details: {
        requestType: request.requestType,
        productId: request.product,
        notes: request.rejectionReason || "Owner rejected pending inventory request",
        movement: {
          quantityBefore: null,
          quantityChange:
            request.requestType === "RESTOCK"
              ? request.requestedQuantity || 0
              : request.initialQuantity || 0,
          quantityAfter: null,
        },
      },
    });

    return res.status(200).json({
      message: "Request rejected; inventory unchanged",
      data: {
        requestId: request._id,
        status: request.status,
        rejectionReason: request.rejectionReason,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const OWNER_archiveProduct = async (req, res) => {
  const { productId } = req.params;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const product = await Product.findOne({
        _id: productId,
        isArchived: { $ne: true },
      }).session(session);

      if (!product) {
        throw new Error("ACTIVE_PRODUCT_NOT_FOUND");
      }

      const snapshot = product.toObject();

      await OWNER_ArchivedProduct.create(
        [
          {
            originalProductId: product._id,
            name: product.name,
            category: product.category,
            quantity: product.quantity,
            unit: product.unit,
            statusAtArchive: product.status,
            archivedBy: req.user.id,
            archivedAt: new Date(),
            archiveReason: reason || "Owner archived product",
            snapshot,
          },
        ],
        { session }
      );

      product.isArchived = true;
      product.archivedAt = new Date();
      product.archivedBy = req.user.id;
      await product.save({ session });

      await ActivityLog.create(
        [
          {
            action: "ARCHIVE_PRODUCT",
            performedBy: req.user.id,
            entityType: "Product",
            entityId: product._id,
            details: {
              movement: {
                quantityBefore: product.quantity,
                quantityChange: 0,
                quantityAfter: product.quantity,
              },
              notes: reason || "Owner archived product",
              metadata: {
                archivedCollection: "archived_products",
              },
            },
          },
        ],
        { session }
      );

      responsePayload = {
        productId: product._id,
        archivedAt: product.archivedAt,
      };
    });

    return res.status(200).json({
      message: "Product archived successfully",
      data: responsePayload,
    });
  } catch (error) {
    if (error.message === "ACTIVE_PRODUCT_NOT_FOUND") {
      return res.status(404).json({ message: "Active product not found" });
    }

    return res.status(500).json({ message: error.message });
  } finally {
    await session.endSession();
  }
};

export const OWNER_adjustProductStock = async (req, res) => {
  const { productId } = req.params;
  const parsedQuantityChange = Number(req.body?.quantityChange);
  const batchNumber = (req.body?.batchNumber || "").trim();
  const expirationDate = req.body?.expirationDate ? new Date(req.body.expirationDate) : null;
  const supplier = (req.body?.supplier || "").trim() || null;
  const notes = (req.body?.notes || "").trim() || "Owner manual stock adjustment";

  if (!Number.isFinite(parsedQuantityChange) || parsedQuantityChange === 0) {
    return res.status(400).json({ message: "quantityChange must be a non-zero number" });
  }

  try {
    const product = await Product.findOne({
      _id: productId,
      isArchived: { $ne: true },
    });

    if (!product) {
      return res.status(404).json({ message: "Active product not found" });
    }

    const quantityBefore = Number(product.quantity);

    let syncResult;
    
    if (parsedQuantityChange > 0) {
      // Create new batch with provided details
      const newBatchNumber = batchNumber || OWNER_generateBatchNumber("RST");
      
      await InventoryBatch.create({
        product: product._id,
        batchNumber: newBatchNumber,
        quantity: parsedQuantityChange,
        currentQuantity: parsedQuantityChange,
        initialQuantity: parsedQuantityChange,
        expiryDate: expirationDate,
        supplier,
        notes,
        status: "Active",
        createdBy: req.user?.id,
      });

      // Sync product from batches
      syncResult = await syncProductFromBatchTotals({
        productId: product._id,
        createDefaultBatchIfMissing: false,
        warningContext: "owner-adjust-stock-add",
      });
    } else {
      // For negative quantities, use the standard function
      syncResult = await applyBatchDeltaToProduct({
        productId: product._id,
        quantityDelta: parsedQuantityChange,
        actorId: req.user.id,
        batchPrefix: "ADJ",
        notes,
      });
    }

    const quantityAfter = Number(syncResult.totalBatchQuantity ?? quantityBefore);

    await ActivityLog.create({
      action: "ADJUST_STOCK",
      performedBy: req.user.id,
      entityType: "Product",
      entityId: product._id,
      details: {
        movement: {
          quantityBefore,
          quantityChange: parsedQuantityChange,
          quantityAfter,
        },
        batchNumber,
        expirationDate,
        supplier,
        notes,
      },
    });

    await createStockLog({
      productId: product._id,
      movementType: "RESTOCK",
      quantityChange: parsedQuantityChange,
      performedBy: {
        userId: req.user.id,
        role: req.user.role,
      },
      source: "MANUAL",
    });

    return res.status(200).json({
      message: "Stock adjusted successfully",
      data: {
        productId: product._id,
        quantityBefore,
        quantityChange: parsedQuantityChange,
        quantityAfter,
        batchNumber,
        expirationDate,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const OWNER_restoreProduct = async (req, res) => {
  const { productId } = req.params;
  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const product = await Product.findOne({
        _id: productId,
        isArchived: true,
      }).session(session);

      if (!product) {
        throw new Error("ARCHIVED_PRODUCT_NOT_FOUND");
      }

      product.isArchived = false;
      product.archivedAt = null;
      product.archivedBy = null;
      await product.save({ session });

      /* Remove the snapshot from the archived collection */
      await OWNER_ArchivedProduct.deleteOne({
        originalProductId: product._id,
      }).session(session);

      await ActivityLog.create(
        [
          {
            action: "RESTORE_PRODUCT",
            performedBy: req.user.id,
            entityType: "Product",
            entityId: product._id,
            details: {
              movement: {
                quantityBefore: product.quantity,
                quantityChange: 0,
                quantityAfter: product.quantity,
              },
              notes: "Owner restored product from archive",
            },
          },
        ],
        { session }
      );

      responsePayload = {
        productId: product._id,
        restoredAt: new Date(),
      };
    });

    return res.status(200).json({
      message: "Product restored successfully",
      data: responsePayload,
    });
  } catch (error) {
    if (error.message === "ARCHIVED_PRODUCT_NOT_FOUND") {
      return res.status(404).json({ message: "Archived product not found" });
    }

    return res.status(500).json({ message: error.message });
  } finally {
    await session.endSession();
  }
};

export const OWNER_getAllInventoryRequests = async (req, res) => {
  try {
    const requests = await InventoryRequest.find()
      .populate("product", "name category quantity isArchived")
      .populate("requestedBy", "email role")
      .lean();

    OWNER_sortRequestsByStatusThenLatest(requests);

    return res.status(200).json({
      message: "All inventory requests fetched successfully",
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const OWNER_updateDiscrepancy = async (req, res) => {
  const { productId } = req.params;
  const { physicalCount, category, genericName, dosageForm, strength } = req.body || {};

  try {
    const product = await Product.findOne({
      _id: productId,
      isArchived: { $ne: true },
    });

    if (!product) {
      return res.status(404).json({ message: "Active product not found" });
    }

    const fallbackPhysicalCount = Number.isFinite(Number(product.physicalCount))
      ? Number(product.physicalCount)
      : Number(product.quantity ?? 0);

    const parsedPhysicalCount =
      physicalCount === undefined || physicalCount === null || String(physicalCount).trim() === ""
        ? fallbackPhysicalCount
        : Number(physicalCount);

    if (!Number.isFinite(parsedPhysicalCount) || parsedPhysicalCount < 0) {
      return res.status(400).json({ message: "physicalCount must be a valid non-negative number" });
    }

    const previous = {
      quantity: Number(product.quantity ?? 0),
      expectedRemaining: Number.isFinite(Number(product.expectedRemaining))
        ? Number(product.expectedRemaining)
        : Number(product.quantity ?? 0),
      physicalCount: Number.isFinite(Number(product.physicalCount))
        ? Number(product.physicalCount)
        : Number(product.quantity ?? 0),
      variance: Number.isFinite(Number(product.variance))
        ? Number(product.variance)
        : 0,
      status: product.discrepancyStatus || "Balanced",
    };

    const quantityDelta = parsedPhysicalCount - previous.quantity;

    // Discrepancy reconciliation must adjust batch-level quantities first.
    await setProductQuantityViaBatches({
      productId: product._id,
      targetQuantity: parsedPhysicalCount,
      actorId: req.user.id,
      batchPrefix: "DISC",
      notes: "Owner discrepancy adjustment",
    });

    const updatedProduct = await Product.findById(product._id);
    if (!updatedProduct) {
      return res.status(404).json({ message: "Active product not found" });
    }

    updatedProduct.physicalCount = parsedPhysicalCount;
    updatedProduct.expectedRemaining = Number(updatedProduct.quantity ?? 0);
    updatedProduct.variance = parsedPhysicalCount - Number(updatedProduct.quantity ?? 0);
    updatedProduct.discrepancyStatus = updatedProduct.variance === 0 ? "Balanced" : "With Variance";

    // Allow owners to complete legacy medicine fields for old records while reviewing discrepancy data.
    if (typeof category === "string") {
      const normalizedCategory = OWNER_normalizeCategory(category);
      if (normalizedCategory) {
        updatedProduct.category = normalizedCategory;
      }
    }

    if (typeof genericName === "string") {
      const normalizedGeneric = genericName.trim();
      updatedProduct.genericName = normalizedGeneric || null;
    }

    if (typeof dosageForm === "string") {
      const normalizedDosageForm = dosageForm.trim();
      updatedProduct.dosageForm = normalizedDosageForm || null;
    }

    if (typeof strength === "string") {
      const normalizedStrength = strength.trim();
      updatedProduct.strength = normalizedStrength || null;
    }

    await updatedProduct.save();

    await ActivityLog.create({
      action: "EDIT_DISCREPANCY",
      actionType: "OWNER_EDIT_DISCREPANCY",
      category: "Inventory",
      actorId: req.user.id,
      actorRole: "OWNER",
      actorName: req.user.name || null,
      actorEmail: req.user.email || null,
      performedBy: req.user.id,
      entityType: "Product",
      entityId: updatedProduct._id,
      description: `Owner updated discrepancy for ${updatedProduct.name}`,
      details: {
        itemName: updatedProduct.name,
        previousValue: previous,
        updatedValue: {
          quantity: updatedProduct.quantity,
          category: updatedProduct.category,
          genericName: updatedProduct.genericName,
          dosageForm: updatedProduct.dosageForm,
          strength: updatedProduct.strength,
          expectedRemaining: updatedProduct.expectedRemaining,
          physicalCount: updatedProduct.physicalCount,
          variance: updatedProduct.variance,
          status: updatedProduct.discrepancyStatus,
        },
        notes: "Owner directly edited discrepancy values",
      },
    });

    // Log discrepancy adjustment in Stock Logs if quantity changed
    if (quantityDelta !== 0) {
      await createStockLog({
        productId: updatedProduct._id,
        movementType: "ADJUSTMENT",
        quantityChange: quantityDelta,
        performedBy: {
          userId: req.user.id,
          role: req.user.role,
        },
        source: "MANUAL",
        notes: `Discrepancy adjustment: previous qty ${previous.quantity}, new qty ${updatedProduct.quantity}, difference ${quantityDelta}`,
      });
    }

    return res.status(200).json({
      message: "Discrepancy updated successfully",
      data: {
        productId: updatedProduct._id,
        itemName: updatedProduct.name,
        previousValue: previous,
        updatedValue: {
          quantity: updatedProduct.quantity,
          category: updatedProduct.category,
          genericName: updatedProduct.genericName,
          dosageForm: updatedProduct.dosageForm,
          strength: updatedProduct.strength,
          expectedRemaining: updatedProduct.expectedRemaining,
          physicalCount: updatedProduct.physicalCount,
          variance: updatedProduct.variance,
          status: updatedProduct.discrepancyStatus,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
