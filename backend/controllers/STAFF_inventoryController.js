import Product from "../models/product.js";
import InventoryRequest from "../models/InventoryRequest.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import OWNER_ArchivedProduct from "../models/OWNER_archivedProduct.js";
import ActivityLog from "../models/activityLog.js";
import mongoose from "mongoose";

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

/**
 * Map internal DB status to canonical API status vocabulary.
 * DB: "available" | "low" | "out"
 * API: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK"
 */
const STAFF_mapStockStatus = (dbStatus) => {
  const map = { available: "IN_STOCK", low: "LOW_STOCK", out: "OUT_OF_STOCK" };
  return map[dbStatus] || "IN_STOCK";
};

/**
 * Build the normalized item response shape used by all inventory endpoints.
 */
const STAFF_buildItemPayload = (item) => ({
  itemId: item._id,
  itemName: item.name,
  category: item.category,
  stockStatus: STAFF_mapStockStatus(item.status),
  currentQuantity: item.quantity,
  unit: item.unit || "pcs",
  unitPrice: item.unitPrice ?? 0,
  minStock: item.minStock ?? 10,
  supplier: item.supplier || null,
  description: item.description || "",
  expiryDate: item.expiryDate || null,
  batchNumber: item.batchNumber || null,
  isArchived: !!item.isArchived,
});

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
    const { category } = req.query;
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

    if (category) {
      filter.category = String(category).trim();
    }

    if (lowStockOnly) {
      filter.$or = [{ status: "low" }, { status: "out" }, { quantity: { $lte: 10 } }];
    }

    const items = await Product.find(filter)
      .sort({ name: 1 })
      .select("name category status quantity unit unitPrice minStock supplier description expiryDate batchNumber isArchived")
      .lean();

    const data = items.map(STAFF_buildItemPayload);

    /* ---- Optionally include pending ADD_ITEM requests as virtual items ---- */
    if (includePending && !includeArchived) {
      const pendingFilter = {
        requestType: "ADD_ITEM",
        status: "pending",
        requestedBy: req.user.id,
      };

      if (category) {
        pendingFilter.category = String(category).trim();
      }

      const pendingRequests = await InventoryRequest.find(pendingFilter)
        .sort({ createdAt: -1 })
        .lean();

      pendingRequests.forEach((pr) => {
        data.push({
          itemId: pr._id,
          itemName: pr.itemName,
          category: pr.category,
          stockStatus: "PENDING",
          currentQuantity: pr.initialQuantity || 0,
          unit: pr.unit || "pcs",
          unitPrice: 0,
          minStock: 0,
          supplier: null,
          description: "",
          expiryDate: pr.expiryDate || null,
          batchNumber: pr.batchNumber || null,
          isArchived: false,
          isPendingRequest: true,
        });
      });
    }

    return res.status(200).json({
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= GET ITEM DETAILS ================= */

export const STAFF_getInventoryItemDetails = async (req, res) => {
  try {
    const { itemId } = req.params;

    const item = await Product.findById(itemId)
      .select("name category status quantity unit unitPrice minStock supplier description expiryDate batchNumber isArchived")
      .lean();

    if (!item) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    await STAFF_logActivity({
      staffId: req.user.id,
      actionType: "view-item-details",
      targetItemId: item._id,
      description: `Viewed details for ${item.name}`,
      status: "viewed",
    });

    return res.status(200).json({
      data: STAFF_buildItemPayload(item),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= CREATE ADD-ITEM REQUEST ================= */

export const STAFF_createAddItemRequest = async (req, res) => {
  try {
    const { itemName, category, initialQuantity, unit, expiryDate, batchNumber } = req.body;

    const parsedQuantity = STAFF_parsePositiveNumber(initialQuantity);
    if (!itemName || !category || parsedQuantity === null) {
      return res.status(400).json({
        message: "itemName, category, and positive initialQuantity are required",
      });
    }

    const request = await InventoryRequest.create({
      requestType: "ADD_ITEM",
      requestedBy: req.user.id,
      itemName: String(itemName).trim(),
      category: String(category).trim(),
      initialQuantity: parsedQuantity,
      unit: unit ? String(unit).trim() : "pcs",
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      batchNumber: batchNumber ? String(batchNumber).trim() : null,
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
        unit: request.unit,
        expiryDate: request.expiryDate,
        batchNumber: request.batchNumber,
        requestType: request.requestType,
        status: request.status,
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
            archiveReason: reason ? String(reason).trim() : "Staff archived product",
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
              notes: reason ? String(reason).trim() : "Staff archived product",
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
