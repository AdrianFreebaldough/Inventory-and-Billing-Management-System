import mongoose from "mongoose";
import Product from "../models/product.js";
import InventoryRequest from "../models/InventoryRequest.js";
import ActivityLog from "../models/activityLog.js";
import OWNER_ArchivedProduct from "../models/OWNER_archivedProduct.js";
import { createStockLog } from "../services/Owner_StockLog.service.js";

const OWNER_parseNonNegativeNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

export const OWNER_getActiveInventory = async (req, res) => {
  try {
    const products = await Product.find({ isArchived: { $ne: true } })
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      message: "Active inventory fetched successfully",
      count: products.length,
      data: products,
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
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
    });

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
  const { approvedQuantity } = req.body;

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
              unit: request.unit || "pcs",
              expiryDate: request.expiryDate || null,
              batchNumber: request.batchNumber || null,
              isArchived: false,
              archivedAt: null,
              archivedBy: null,
            },
          ],
          { session }
        );

        const product = createdProduct[0];

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

        const quantityBefore = product.quantity;
        product.quantity += finalQuantity;
        await product.save({ session });

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
