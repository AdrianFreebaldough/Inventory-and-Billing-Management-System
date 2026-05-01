import Product from "../models/product.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryRequest from "../models/InventoryRequest.js";
import PriceChangeRequest from "../models/priceChangeRequest.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import OWNER_ArchivedProduct from "../models/OWNER_archivedProduct.js";
import ActivityLog from "../models/activityLog.js";
import mongoose from "mongoose";
import { getExpirationStatus, getDaysUntilExpiry } from "../services/expirationService.js";
import { classifyExpiryRisk, toUiExpiryRiskKey } from "../services/fefoService.js";
import {
  BATCH_EFFECTIVE_STATUS,
  getBatchLifecycleFlags,
  getBatchEffectiveStatus,
  isBatchEligibleForBilling,
} from "../services/batchLifecycleService.js";
import { syncProductFromBatchTotals } from "../services/inventoryIntegrityService.js";

// Reuse existing InventoryRequest schema so staff can request restocks without direct stock edits.

/* ================= HELPERS ================= */

const STAFF_parsePositiveNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const STAFF_toBoolean = (value) => {
  return value === true || value === "true" || value === 1 || value === "1";
};

const STAFF_buildCategoryFilterRegex = (value) => {
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
    vaccine: "vaccine",
    vaccines: "vaccine",
    "first aid": "first aid",
    vitamins: "vitamin",
    vitamin: "vitamin",
    "personal care": "personal care",
  };

  const canonical = aliases[normalized] || normalized;
  const escapedCanonical = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `^${escapedCanonical.replace(/\s+/g, "[-_\\s]*")}s?$`;
  return new RegExp(pattern, "i");
};

const STAFF_normalizeCategory = (value) => {
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

const STAFF_isInventoryServiceCategory = (value) => {
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

const STAFF_pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const asString = String(value).trim();
    if (asString) return value;
  }
  return null;
};

const STAFF_getBatchQuantity = (batch) => {
  const quantity = Number(batch?.currentQuantity ?? batch?.quantity ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
};

const STAFF_getStockSummaryFromBatches = ({ batches = [], fallbackQuantity = 0, minStock = 10 }) => {
  const safeMinStock = Number.isFinite(Number(minStock)) ? Number(minStock) : 10;
  const normalizedBatches = Array.isArray(batches) ? batches : [];

  if (!normalizedBatches.length) {
    const quantity = Math.max(0, Number(fallbackQuantity) || 0);
    return {
      stockStatus: quantity <= 0 ? "OUT_OF_STOCK" : (quantity <= safeMinStock ? "LOW_STOCK" : "IN_STOCK"),
      sellableQuantity: quantity,
      pendingDisposalQuantity: 0,
      totalPositiveQuantity: quantity,
      hasPendingDisposalOnlyStock: false,
    };
  }

  let sellableQuantity = 0;
  let pendingDisposalQuantity = 0;
  let totalPositiveQuantity = 0;

  normalizedBatches.forEach((batch) => {
    const quantity = STAFF_getBatchQuantity(batch);
    if (quantity <= 0) return;

    totalPositiveQuantity += quantity;

    if (isBatchEligibleForBilling(batch)) {
      sellableQuantity += quantity;
    }

    if (getBatchEffectiveStatus(batch) === BATCH_EFFECTIVE_STATUS.PENDING_DISPOSAL) {
      pendingDisposalQuantity += quantity;
    }
  });

  const hasPendingDisposalOnlyStock =
    sellableQuantity <= 0 &&
    pendingDisposalQuantity > 0 &&
    totalPositiveQuantity === pendingDisposalQuantity;

  const stockStatus = sellableQuantity <= 0
    ? "OUT_OF_STOCK"
    : (sellableQuantity <= safeMinStock ? "LOW_STOCK" : "IN_STOCK");

  return {
    stockStatus,
    sellableQuantity,
    pendingDisposalQuantity,
    totalPositiveQuantity,
    hasPendingDisposalOnlyStock,
  };
};

const STAFF_buildLegacyBatch = (product) => {
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

const STAFF_attachBatchDataToItems = async (items) => {
  if (!items.length) return items;

  const productIds = items.map((item) => item._id);
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

  return items.map((item) => {
    const key = String(item._id);
    const existingBatches = batchesByProduct.get(key) || [];
    const fallbackLegacyBatch = existingBatches.length === 0 ? STAFF_buildLegacyBatch(item) : null;
    const finalBatches = fallbackLegacyBatch ? [fallbackLegacyBatch] : existingBatches;
    const totalBatchQuantity = finalBatches.reduce((sum, batch) => sum + Number(batch.currentQuantity ?? batch.quantity ?? 0), 0);
    const productQuantity = Number(item.quantity ?? 0);

    const nearestBatch = finalBatches
      .filter((batch) => Number(batch.currentQuantity ?? batch.quantity ?? 0) > 0)
      .filter((batch) => batch.expiryDate)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0] || null;

    const batchesWithRisk = finalBatches.map((batch) => ({
      ...batch,
      expiryRisk: classifyExpiryRisk(batch.expiryDate),
    }));

    return {
      ...item,
      productQuantity,
      batches: batchesWithRisk,
      batchCount: batchesWithRisk.length,
      totalBatchQuantity,
      nearestExpiryDate: nearestBatch?.expiryDate || item.expiryDate || null,
      nearestBatchNumber: nearestBatch?.batchNumber || item.batchNumber || null,
      nearestBatchSupplier: nearestBatch?.supplier || item.supplier || null,
      expiryRisk: classifyExpiryRisk(nearestBatch?.expiryDate || item.expiryDate || null),
    };
  });
};

const STAFF_enrichMissingFieldsFromApprovedRequests = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return items;

  const itemsNeedingFallback = items.filter((item) =>
    !STAFF_pickFirstNonEmpty(item.genericName, item.generic) ||
    !STAFF_pickFirstNonEmpty(item.dosageForm, item.dosage) ||
    !STAFF_pickFirstNonEmpty(item.strength) ||
    !STAFF_pickFirstNonEmpty(item.medicineName, item.name) ||
    !STAFF_pickFirstNonEmpty(item.supplier, item.supplierName)
  );

  if (!itemsNeedingFallback.length) return items;

  const productIds = itemsNeedingFallback.map((item) => item._id);
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

  return items.map((item) => {
    const fallback = requestByProductId.get(String(item._id));
    if (!fallback) return item;

    return {
      ...item,
      genericName: STAFF_pickFirstNonEmpty(item.genericName, item.generic, fallback.genericName),
      brandName: STAFF_pickFirstNonEmpty(item.brandName, item.brand, fallback.brandName),
      dosageForm: STAFF_pickFirstNonEmpty(item.dosageForm, item.dosage, fallback.dosageForm),
      strength: STAFF_pickFirstNonEmpty(item.strength, item.Strength, item.dose, item.dosageStrength, fallback.strength),
      medicineName: STAFF_pickFirstNonEmpty(item.medicineName, fallback.medicineName, item.name),
      supplier: STAFF_pickFirstNonEmpty(item.supplier, item.supplierName, fallback.supplier),
    };
  });
};

/**
 * Build the normalized item response shape used by all inventory endpoints.
 */
const STAFF_buildItemPayload = (item) => {
  const stockSummary = STAFF_getStockSummaryFromBatches({
    batches: item.batches,
    fallbackQuantity: item.productQuantity ?? item.quantity ?? 0,
    minStock: item.minStock,
  });
  const referenceExpiryDate = item.nearestExpiryDate || item.expiryDate;
  const expirationStatus = getExpirationStatus(referenceExpiryDate);
  const daysUntilExpiry = getDaysUntilExpiry(referenceExpiryDate);

  return {
    itemId: item._id,
    itemName: item.name,
    category: item.category,
    stockStatus: stockSummary.stockStatus,
    currentQuantity: Number(item.productQuantity ?? item.quantity ?? 0),
    totalQuantity: Number(item.productQuantity ?? item.quantity ?? 0),
    batchQuantity: Number(item.totalBatchQuantity ?? 0),
    sellableQuantity: Number(stockSummary.sellableQuantity ?? 0),
    pendingDisposalQuantity: Number(stockSummary.pendingDisposalQuantity ?? 0),
    hasPendingDisposalOnlyStock: stockSummary.hasPendingDisposalOnlyStock === true,
    unit: item.unit || "pcs",
    unitPrice: item.unitPrice ?? 0,
    minStock: item.minStock ?? 10,
    supplier: STAFF_pickFirstNonEmpty(item.nearestBatchSupplier, item.supplier, item.supplierName),
    description: item.description || "",
    expiryDate: referenceExpiryDate || null,
    nearestExpiryDate: referenceExpiryDate || null,
    expiryRisk: item.expiryRisk || classifyExpiryRisk(referenceExpiryDate),
    expiryRiskKey: toUiExpiryRiskKey(item.expiryRisk || classifyExpiryRisk(referenceExpiryDate)),
    batchNumber: item.nearestBatchNumber || item.batchNumber || null,
    batchCount: Number(item.batchCount ?? (item.batches || []).length ?? 0),
    batches: Array.isArray(item.batches) ? item.batches.map((batch) => ({
      batchId: batch._id,
      batchNumber: batch.batchNumber || null,
      quantity: Number(
        Number.isFinite(Number(batch.initialQuantity)) ? Number(batch.initialQuantity) : Number(batch.quantity ?? 0)
      ),
      currentQuantity: Number(batch.currentQuantity ?? batch.quantity ?? 0),
      originalQuantity: Number.isFinite(Number(batch.initialQuantity))
        ? Number(batch.initialQuantity)
        : Number(batch.quantity ?? 0),
      expiryDate: batch.expiryDate || null,
      expiryRisk: batch.expiryRisk || classifyExpiryRisk(batch.expiryDate),
      status: getBatchEffectiveStatus(batch),
      statusKey: String(getBatchEffectiveStatus(batch)).toLowerCase().replace(/\s+/g, "-"),
      supplier: batch.supplier || null,
      createdAt: batch.createdAt || null,
      isLegacy: !!batch.isLegacy,
      ...getBatchLifecycleFlags(batch),
    })) : [],
    isArchived: !!item.isArchived,
    genericName: STAFF_pickFirstNonEmpty(item.genericName, item.generic),
    brandName: STAFF_pickFirstNonEmpty(item.brandName, item.brand),
    dosageForm: STAFF_pickFirstNonEmpty(item.dosageForm, item.dosage),
    strength: STAFF_pickFirstNonEmpty(item.strength, item.Strength, item.dose, item.dosageStrength),
    medicineName: STAFF_pickFirstNonEmpty(item.medicineName, item.name),
    expirationStatus,
    daysUntilExpiry,
  };
};

const STAFF_logActivity = async ({
  staffId,
  actionType,
  targetItemId = null,
  description,
  status = "completed",
}) => {
  await STAFF_ActivityLog.create({
    staffId,
    actionType,
    targetItemId,
    description,
    status,
  });
};

/* ================= GET INVENTORY LIST ================= */

export const STAFF_getInventory = async (req, res) => {
  try {
    const { category, expirationFilter, expiryRisk } = req.query;
    const lowStockOnly = STAFF_toBoolean(req.query.lowStockOnly);
    const includeArchived = STAFF_toBoolean(req.query.includeArchived);
    const includePending = STAFF_toBoolean(req.query.includePending);

    /* ---- Build product filter ---- */
    const filter = {};

    if (includeArchived) {
      filter.isArchived = true;
    } else {
      filter.isArchived = { $ne: true };
    }

    const categoryRegex = STAFF_buildCategoryFilterRegex(category);
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

    const items = await Product.find(filter)
      .sort({ name: 1 })
      .select("name category status quantity unit unitPrice minStock supplier description expiryDate batchNumber isArchived createdAt genericName brandName dosageForm strength medicineName")
      .lean();

    const nonServiceItems = items.filter(
      (item) => !STAFF_isInventoryServiceCategory(item.category)
    );

    const itemsWithBatches = await STAFF_attachBatchDataToItems(nonServiceItems);
    const enrichedItems = await STAFF_enrichMissingFieldsFromApprovedRequests(itemsWithBatches);
    const data = enrichedItems.map(STAFF_buildItemPayload);

    const normalizedRiskFilter = String(expiryRisk || "").trim().toLowerCase();
    const riskFilteredData = normalizedRiskFilter
      ? data.filter((entry) => entry.expiryRiskKey === normalizedRiskFilter)
      : data;
    const filteredData = lowStockOnly
      ? riskFilteredData.filter((entry) => ["LOW_STOCK", "OUT_OF_STOCK"].includes(String(entry.stockStatus || "")))
      : riskFilteredData;

    /* ---- Optionally include pending ADD_ITEM requests as virtual items ---- */
    if (includePending && !includeArchived) {
      const pendingFilter = {
        requestType: "ADD_ITEM",
        status: "pending",
        requestedBy: req.user.id,
      };

      if (categoryRegex) {
        pendingFilter.category = categoryRegex;
      }

      const pendingRequests = await InventoryRequest.find(pendingFilter)
        .sort({ createdAt: -1 })
        .lean();

      pendingRequests.forEach((pr) => {
        if (STAFF_isInventoryServiceCategory(pr.category)) {
          return;
        }

        filteredData.push({
          itemId: pr._id,
          itemName: pr.itemName,
          category: pr.category,
          stockStatus: "PENDING",
          currentQuantity: pr.initialQuantity || 0,
          totalQuantity: pr.initialQuantity || 0,
          unit: pr.unit || "pcs",
          unitPrice: pr.unitPrice ?? 0,
          minStock: pr.minStock ?? 10,
          supplier: null,
          description: pr.description || "",
          expiryDate: pr.expiryDate || null,
          nearestExpiryDate: pr.expiryDate || null,
          expiryRisk: classifyExpiryRisk(pr.expiryDate || null),
          expiryRiskKey: toUiExpiryRiskKey(classifyExpiryRisk(pr.expiryDate || null)),
          batchNumber: pr.batchNumber || null,
          isArchived: false,
          isPendingRequest: true,
        });
      });
    }

    return res.status(200).json({
      count: filteredData.length,
      data: filteredData,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= GET ITEM DETAILS ================= */

export const STAFF_getInventoryItemDetails = async (req, res) => {
  try {
    const { itemId } = req.params;

    await syncProductFromBatchTotals({
      productId: itemId,
      createDefaultBatchIfMissing: true,
      warningContext: "staff-item-details",
    });

    const item = await Product.findById(itemId)
      .select("name category status quantity unit unitPrice minStock supplier description expiryDate batchNumber isArchived createdAt genericName brandName dosageForm strength medicineName")
      .lean();

    if (!item) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    const [itemWithBatches] = await STAFF_attachBatchDataToItems([item]);
    const [enrichedItem] = await STAFF_enrichMissingFieldsFromApprovedRequests([itemWithBatches]);

    return res.status(200).json({
      data: STAFF_buildItemPayload(enrichedItem),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= CREATE ADD-ITEM REQUEST ================= */

export const STAFF_createAddItemRequest = async (req, res) => {
  try {
    const { itemName, category, initialQuantity, unitPrice, unit, minStock, description, expiryDate, batchNumber, genericName, brandName, dosageForm, strength, medicineName, supplier } = req.body;

    const normalizedItemName = String(itemName || "").trim();
    const normalizedCategory = STAFF_normalizeCategory(category);
    const normalizedMedicineName = String(medicineName || "").trim();

    const parsedQuantity = STAFF_parsePositiveNumber(initialQuantity);
    const parsedUnitPrice = Number(unitPrice ?? 0);
    const parsedMinStock = Number(minStock ?? 10);
    if (!normalizedItemName || !normalizedCategory || parsedQuantity === null) {
      return res.status(400).json({
        message: "itemName, category, and positive initialQuantity are required",
      });
    }

    if (!normalizedMedicineName) {
      return res.status(400).json({
        message: "medicineName is required",
      });
    }

    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice <= 0) {
      return res.status(400).json({
        message: "Price must be greater than zero.",
      });
    }

    if (!Number.isFinite(parsedMinStock) || parsedMinStock < 0) {
      return res.status(400).json({
        message: "minStock must be a valid non-negative number",
      });
    }

    const request = await InventoryRequest.create({
      requestType: "ADD_ITEM",
      requestedBy: req.user.id,
      date_requested: new Date(),
      itemName: normalizedItemName,
      category: normalizedCategory,
      initialQuantity: parsedQuantity,
      unitPrice: parsedUnitPrice,
      unit: unit ? String(unit).trim() : "pcs",
      minStock: parsedMinStock,
      description: description ? String(description).trim() : "",
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      batchNumber: batchNumber ? String(batchNumber).trim() : null,
      genericName: genericName ? String(genericName).trim() : null,
      brandName: brandName ? String(brandName).trim() : null,
      dosageForm: dosageForm ? String(dosageForm).trim() : null,
      strength: strength ? String(strength).trim() : null,
      medicineName: normalizedMedicineName,
      supplier: supplier ? String(supplier).trim() : null,
      status: "pending",
    });

    await STAFF_logActivity({
      staffId: req.user.id,
      actionType: "add-item-request",
      targetItemId: null,
      description: `Requested to add item ${request.itemName}`,
      status: "pending",
    });

    return res.status(201).json({
      message: "Add item request submitted",
      data: {
        requestId: request._id,
        itemName: request.itemName,
        category: request.category,
        initialQuantity: request.initialQuantity,
        unitPrice: request.unitPrice,
        unit: request.unit,
        minStock: request.minStock,
        description: request.description,
        expiryDate: request.expiryDate,
        batchNumber: request.batchNumber,
        requestType: request.requestType,
        status: request.status,
        date_requested: request.date_requested || request.createdAt,
        createdAt: request.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= CREATE RESTOCK REQUEST ================= */

export const STAFF_createRestockRequest = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    const parsedQuantity = STAFF_parsePositiveNumber(quantity);
    if (!productId || parsedQuantity === null) {
      return res.status(400).json({
        message: "productId and a positive quantity are required",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      isArchived: { $ne: true },
    }).select("_id name status quantity");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!["low", "out"].includes(product.status)) {
      return res.status(400).json({
        message: "Restock requests are only allowed for low/out-of-stock items",
      });
    }

    const request = await InventoryRequest.create({
      requestType: "RESTOCK",
      product: product._id,
      requestedQuantity: parsedQuantity,
      requestedBy: req.user.id,
      date_requested: new Date(),
      status: "pending",
    });

    await STAFF_logActivity({
      staffId: req.user.id,
      actionType: "restock-request",
      targetItemId: product._id,
      description: `Requested restock of ${parsedQuantity} for ${product.name}`,
      status: "pending",
    });

    return res.status(201).json({
      message: "Restock request submitted",
      data: {
        requestId: request._id,
        requestType: request.requestType,
        productId: request.product,
        productName: product.name,
        requestedQuantity: request.requestedQuantity,
        status: request.status,
        date_requested: request.date_requested || request.createdAt,
        createdAt: request.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= ARCHIVE ITEM ================= */

export const STAFF_archiveItem = async (req, res) => {
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
            archiveReason: reason || "Staff archived product",
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
              notes: reason || "Staff archived product",
              metadata: { archivedCollection: "archived_products" },
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

    await STAFF_logActivity({
      staffId: req.user.id,
      actionType: "archive-item",
      targetItemId: productId,
      description: `Archived item ${productId}`,
      status: "completed",
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

/* ================= RESTORE ITEM ================= */

export const STAFF_restoreItem = async (req, res) => {
  const { productId } = req.params;

  try {
    const product = await Product.findOne({
      _id: productId,
      isArchived: true,
    });

    if (!product) {
      return res.status(404).json({ message: "Archived product not found" });
    }

    product.isArchived = false;
    product.archivedAt = null;
    product.archivedBy = null;
    await product.save();

    await STAFF_logActivity({
      staffId: req.user.id,
      actionType: "restore-item",
      targetItemId: product._id,
      description: `Restored item ${product.name}`,
      status: "completed",
    });

    await ActivityLog.create({
      action: "RESTORE_PRODUCT",
      performedBy: req.user.id,
      entityType: "Product",
      entityId: product._id,
      details: {
        notes: `Staff restored product ${product.name}`,
      },
    });

    return res.status(200).json({
      message: "Product restored successfully",
      data: STAFF_buildItemPayload(product),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= GET MY INVENTORY REQUESTS ================= */

export const STAFF_getMyRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { requestedBy: req.user.id };

    if (req.query.status) {
      filter.status = String(req.query.status).trim();
    }

    if (req.query.requestType) {
      filter.requestType = String(req.query.requestType).trim();
    }

    const [requests, total] = await Promise.all([
      InventoryRequest.find(filter)
        .populate("product", "name category quantity unit status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InventoryRequest.countDocuments(filter),
    ]);

    const data = requests.map((r) => ({
      requestId: r._id,
      requestType: r.requestType,
      status: r.status,
      /* ADD_ITEM fields */
      itemName: r.itemName || (r.product && r.product.name) || null,
      category: r.category || (r.product && r.product.category) || null,
      initialQuantity: r.initialQuantity || null,
      /* RESTOCK fields */
      productId: r.product ? r.product._id : null,
      productName: r.product ? r.product.name : null,
      requestedQuantity: r.requestedQuantity || null,
      currentQuantity: r.product ? r.product.quantity : null,
      unit: r.unit || (r.product && r.product.unit) || "pcs",
      /* Timing */
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt || null,
      rejectionReason: r.rejectionReason || null,
    }));

    /* Compute summary counts for the staff's requests */
    const allStatuses = await InventoryRequest.aggregate([
      { $match: { requestedBy: new mongoose.Types.ObjectId(req.user.id) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const summary = { pending: 0, approved: 0, rejected: 0 };
    allStatuses.forEach((s) => {
      if (summary[s._id] !== undefined) summary[s._id] = s.count;
    });

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      summary,
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const STAFF_createPriceChangeRequest = async (req, res) => {
  try {
    const { productId, newPrice, reason } = req.body || {};
    const parsedPrice = Number(newPrice);
    const normalizedReason = String(reason || "").trim();

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ message: "Price must be greater than zero." });
    }

    if (!normalizedReason) {
      return res.status(400).json({ message: "reason is required" });
    }

    const product = await Product.findOne({
      _id: productId,
      isArchived: { $ne: true },
    }).select("_id name unitPrice");

    if (!product) {
      return res.status(404).json({ message: "Active product not found" });
    }

    const currentPrice = Number(product.unitPrice ?? 0);
    if (currentPrice === parsedPrice) {
      return res.status(400).json({ message: "Requested price must be different from current price" });
    }

    const duplicatePending = await PriceChangeRequest.findOne({
      productId: product._id,
      requestedBy: req.user.id,
      requestedPrice: parsedPrice,
      status: "pending",
    }).lean();

    if (duplicatePending) {
      return res.status(400).json({ message: "An identical pending request already exists" });
    }

    const request = await PriceChangeRequest.create({
      productId: product._id,
      productName: product.name,
      oldPrice: currentPrice,
      requestedPrice: parsedPrice,
      requestedBy: req.user.id,
      requestedByName: req.user.name || null,
      requestedByRole: "staff",
      reason: normalizedReason,
      status: "pending",
    });

    await STAFF_logActivity({
      staffId: req.user.id,
      actionType: "price-change-request",
      targetItemId: product._id,
      description: `Staff ${req.user.name || "Staff"} requested price change of ${product.name} from P${currentPrice.toFixed(2)} to P${parsedPrice.toFixed(2)}`,
      status: "pending",
    });

    await ActivityLog.create({
      action: "REQUEST_PRICE_CHANGE",
      actionType: "STAFF_REQUEST_PRICE_CHANGE",
      category: "Request",
      actorId: req.user.id,
      actorRole: "STAFF",
      actorName: req.user.name || null,
      actorEmail: req.user.email || null,
      performedBy: req.user.id,
      entityType: "Product",
      entityId: product._id,
      description: `Staff ${req.user.name || "Staff"} requested price change of ${product.name} from P${currentPrice.toFixed(2)} to P${parsedPrice.toFixed(2)}`,
      details: {
        requestId: request._id,
        oldPrice: currentPrice,
        requestedPrice: parsedPrice,
        reason: normalizedReason,
      },
    });

    return res.status(201).json({
      message: "Price change request submitted",
      data: request,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const STAFF_getPendingPriceChangeForProduct = async (req, res) => {
  const { productId } = req.params;

  try {
    const request = await PriceChangeRequest.findOne({
      productId,
      requestedBy: req.user.id,
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ data: request || null });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
