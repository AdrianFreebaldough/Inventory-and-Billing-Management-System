import Product from "../models/product.js";
import InventoryRequest from "../models/InventoryRequest.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import { OWNER_archiveProduct } from "./OWNER_inventoryController.js";

// Reuse existing InventoryRequest schema so staff can request restocks without direct stock edits.

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

export const STAFF_getInventory = async (req, res) => {
  try {
    const { category } = req.query;
    const lowStockOnly = STAFF_toBoolean(req.query.lowStockOnly);

    // Reuse owner inventory visibility rule: only active (not archived) products are returned.
    const filter = {
      isArchived: { $ne: true },
    };

    if (category) {
      filter.category = String(category).trim();
    }

    if (lowStockOnly) {
      filter.$or = [{ status: "low" }, { status: "out" }, { quantity: { $lte: 10 } }];
    }

    const items = await Product.find(filter)
      .sort({ name: 1 })
      .select("name category status quantity unit expiryDate batchNumber")
      .lean();

    const data = items.map((item) => ({
      itemId: item._id,
      itemName: item.name,
      category: item.category,
      stockStatus: item.status,
      currentQuantity: item.quantity,
      unit: item.unit,
      expiryDate: item.expiryDate || null,
      batchNumber: item.batchNumber || null,
    }));

    return res.status(200).json({
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const STAFF_getInventoryItemDetails = async (req, res) => {
  try {
    const { itemId } = req.params;

    const item = await Product.findOne({
      _id: itemId,
      isArchived: { $ne: true },
    })
      .select("name category status quantity unit expiryDate batchNumber")
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
      data: {
        itemId: item._id,
        itemName: item.name,
        category: item.category,
        stockStatus: item.status,
        currentQuantity: item.quantity,
        unit: item.unit,
        expiryDate: item.expiryDate || null,
        batchNumber: item.batchNumber || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

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
      // Always bind to authenticated staff; payload cannot impersonate another user.
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
        requestedQuantity: request.requestedQuantity,
        status: request.status,
        createdAt: request.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const STAFF_archiveItem = async (req, res) => {
  const originalStatus = res.status.bind(res);
  const originalJson = res.json.bind(res);
  const capturedResponse = {
    statusCode: 200,
    payload: null,
  };

  try {
    res.status = (statusCode) => {
      capturedResponse.statusCode = statusCode;
      return res;
    };

    res.json = (payload) => {
      capturedResponse.payload = payload;
      return payload;
    };

    // Reuse owner archive logic directly to preserve the same archive behavior and data handling.
    await OWNER_archiveProduct(req, res);

    res.status = originalStatus;
    res.json = originalJson;

    if (capturedResponse.statusCode >= 200 && capturedResponse.statusCode < 300) {
      await STAFF_logActivity({
        staffId: req.user.id,
        actionType: "archive-item",
        targetItemId: req.params.productId,
        description: `Archived item ${req.params.productId}`,
        status: "completed",
      });
    }

    return originalStatus(capturedResponse.statusCode).json(capturedResponse.payload);
  } catch (error) {
    res.status = originalStatus;
    res.json = originalJson;
    return res.status(500).json({ message: error.message });
  }
};
