import mongoose from "mongoose";
import Product from "../models/product.js";
import InventoryRequest from "../models/InventoryRequest.js";
import ActivityLog from "../models/activityLog.js";
import OWNER_ArchivedProduct from "../models/OWNER_archivedProduct.js";
import InventoryBatch from "../models/InventoryBatch.js";
import { createStockLog } from "../services/Owner_StockLog.service.js";
import { getExpirationStatus, getDaysUntilExpiry } from "../services/expirationService.js";

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
    expiryDate: product.expiryDate || null,
    supplier: product.supplier || null,
    createdAt: product.createdAt || null,
    isLegacy: true,
  };
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
    const availableBatches = existingBatches.filter((batch) => Number(batch.quantity) > 0);
    const fallbackLegacyBatch = availableBatches.length === 0 ? OWNER_buildLegacyBatch(product) : null;
    const finalBatches = fallbackLegacyBatch ? [fallbackLegacyBatch] : availableBatches;
    const totalBatchQuantity = finalBatches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
    const resolvedQuantity = finalBatches.length > 0 ? totalBatchQuantity : Number(product.quantity ?? 0);

    const nearestBatch = finalBatches
      .filter((batch) => batch.expiryDate)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0] || null;

    return {
      ...product,
      quantity: resolvedQuantity,
      batches: finalBatches,
      batchCount: finalBatches.length,
      totalBatchQuantity: resolvedQuantity,
      nearestExpiryDate: nearestBatch?.expiryDate || product.expiryDate || null,
      nearestBatchNumber: nearestBatch?.batchNumber || product.batchNumber || null,
      nearestBatchSupplier: nearestBatch?.supplier || product.supplier || null,
    };
  });
};

const OWNER_enrichProductWithExpiration = (product) => {
  const referenceExpiryDate = product.nearestExpiryDate || product.expiryDate;
  const expectedRemaining = Number.isFinite(Number(product.expectedRemaining))
    ? Number(product.expectedRemaining)
    : Number(product.quantity ?? 0);

  const physicalCount = Number.isFinite(Number(product.physicalCount))
    ? Number(product.physicalCount)
    : expectedRemaining;

  const variance = Number.isFinite(Number(product.variance))
    ? Number(product.variance)
    : physicalCount - expectedRemaining;

  const discrepancyStatus = variance === 0 ? "Balanced" : "With Variance";

  return {
    ...product,
    expiryDate: referenceExpiryDate || null,
    batchNumber: product.nearestBatchNumber || product.batchNumber || null,
    supplier: product.nearestBatchSupplier || product.supplier || null,
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

export const OWNER_getActiveInventory = async (req, res) => {
  try {
    const { expirationFilter } = req.query;
    
    const filter = { isArchived: { $ne: true } };

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

    const productsWithBatches = await OWNER_attachBatchDataToProducts(products);
    const enrichedProducts = productsWithBatches.map(OWNER_enrichProductWithExpiration);

    return res.status(200).json({
      message: "Active inventory fetched successfully",
      count: enrichedProducts.length,
      data: enrichedProducts,
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
    const { name, category, quantity, unit, unitPrice, minStock, expiryDate, batchNumber, description, supplier } = req.body;

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
      category: String(category).trim(),
      quantity: parsedQuantity,
      unitPrice: parsedUnitPrice,
      unit: unit ? String(unit).trim() : "pcs",
      minStock: minStock != null ? Number(minStock) : 10,
      expiryDate: expiryDate || null,
      batchNumber: batchNumber ? String(batchNumber).trim() : null,
      description: description ? String(description).trim() : "",
      supplier: supplier ? String(supplier).trim() : null,
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
        movementType: "RESTOCK",
        quantityChange: parsedQuantity,
        performedBy: {
          userId: req.user.id,
          role: req.user.role,
        },
        source: "SYSTEM",
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
      .sort({ createdAt: -1 })
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
              category: request.category,
              quantity: finalQuantity,
              unitPrice: Number(request.unitPrice ?? 0),
              unit: request.unit || "pcs",
              minStock: Number(request.minStock ?? 10),
              description: request.description || "",
              expiryDate: request.expiryDate || null,
              batchNumber: request.batchNumber || null,
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
                supplier: null,
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
        product.quantity += finalQuantity;
        OWNER_syncDiscrepancyFromQuantity(product);
        await product.save({ session });

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
                  quantityAfter: product.quantity,
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
          quantityAfter: product.quantity,
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
  const { reason } = req.body;
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
            archiveReason: reason ? String(reason).trim() : "Owner archived product",
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
              notes: reason ? String(reason).trim() : "Owner archived product",
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
    const quantityAfter = quantityBefore + parsedQuantityChange;

    if (quantityAfter < 0) {
      return res.status(400).json({ message: "Adjustment would result in negative stock" });
    }

    product.quantity = quantityAfter;
    OWNER_syncDiscrepancyFromQuantity(product);
    await product.save();

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
        notes: "Owner manually adjusted stock",
      },
    });

    await createStockLog({
      productId: product._id,
      movementType: "ADJUST",
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
      .sort({ createdAt: -1 })
      .lean();

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
  const { physicalCount } = req.body || {};

  const parsedPhysicalCount = Number(physicalCount);
  if (!Number.isFinite(parsedPhysicalCount) || parsedPhysicalCount < 0) {
    return res.status(400).json({ message: "physicalCount must be a valid non-negative number" });
  }

  try {
    const product = await Product.findOne({
      _id: productId,
      isArchived: { $ne: true },
    });

    if (!product) {
      return res.status(404).json({ message: "Active product not found" });
    }

    const previous = {
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

    product.expectedRemaining = Number(product.quantity ?? 0);
    product.physicalCount = parsedPhysicalCount;
    product.variance = parsedPhysicalCount - product.expectedRemaining;
    product.discrepancyStatus = product.variance === 0 ? "Balanced" : "With Variance";

    await product.save();

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
      entityId: product._id,
      description: `Owner updated discrepancy for ${product.name}`,
      details: {
        itemName: product.name,
        previousValue: previous,
        updatedValue: {
          expectedRemaining: product.expectedRemaining,
          physicalCount: product.physicalCount,
          variance: product.variance,
          status: product.discrepancyStatus,
        },
        notes: "Owner directly edited discrepancy values",
      },
    });

    return res.status(200).json({
      message: "Discrepancy updated successfully",
      data: {
        productId: product._id,
        itemName: product.name,
        previousValue: previous,
        updatedValue: {
          expectedRemaining: product.expectedRemaining,
          physicalCount: product.physicalCount,
          variance: product.variance,
          status: product.discrepancyStatus,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
