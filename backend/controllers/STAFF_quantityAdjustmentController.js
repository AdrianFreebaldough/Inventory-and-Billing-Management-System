import STAFF_QuantityAdjustment from "../models/STAFF_quantityAdjustment.js";
import Product from "../models/product.js";
import Notification from "../models/Notification.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import User from "../models/user.js";
import { createStockLog } from "../services/Owner_StockLog.service.js";

// Staff: Create quantity adjustment request
export const STAFF_createQuantityAdjustment = async (req, res) => {
  try {
    const { productId, actualQuantity, reason } = req.body;

    if (!productId || actualQuantity === undefined || !reason) {
      return res.status(400).json({ message: "Product ID, actual quantity, and reason are required" });
    }

    const product = await Product.findById(productId);
    if (!product || product.isArchived) {
      return res.status(404).json({ message: "Product not found" });
    }

    const adjustment = await STAFF_QuantityAdjustment.create({
      productId: product._id,
      productName: product.name,
      systemQuantity: product.quantity,
      actualQuantity,
      difference: actualQuantity - product.quantity,
      reason,
      staffId: req.user.id,
      staffName: req.user.name || "Staff",
      status: "Pending",
    });

    // Create a notification for each active owner.
    const owners = await User.find({
      role: "owner",
      isActive: true,
      status: { $ne: "Archived" },
    })
      .select("_id")
      .lean();

    if (owners.length) {
      await Notification.insertMany(
        owners.map((owner) => ({
          userId: owner._id,
          role: "owner",
          message: `Inventory adjustment request for ${product.name} by ${req.user.name}`,
          type: "inventory_adjustment_request",
          redirectUrl: "inventory",
          relatedId: adjustment._id,
        }))
      );
    }

    await STAFF_ActivityLog.create({
      staffId: req.user.id,
      actionType: "quantity-adjustment-request",
      targetItemId: product._id,
      description: `Submitted quantity adjustment request for ${product.name}`,
      status: "pending",
    });

    return res.status(201).json({
      message: "Quantity adjustment request created successfully",
      data: adjustment,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Staff: Get own adjustment requests
export const STAFF_getQuantityAdjustments = async (req, res) => {
  try {
    const adjustments = await STAFF_QuantityAdjustment.find({ staffId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      count: adjustments.length,
      data: adjustments,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Owner: Get all adjustment requests
export const OWNER_getQuantityAdjustments = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const adjustments = await STAFF_QuantityAdjustment.find(filter)
      .sort({ createdAt: -1 })
      .populate("productId", "category")
      .populate("staffId", "name email")
      .populate("reviewedBy", "name email")
      .lean();

    return res.status(200).json({
      count: adjustments.length,
      data: adjustments,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Owner: Review adjustment request
export const OWNER_reviewQuantityAdjustment = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const adjustment = await STAFF_QuantityAdjustment.findById(id);
    if (!adjustment) {
      return res.status(404).json({ message: "Adjustment request not found" });
    }

    if (adjustment.status !== "Pending") {
      return res.status(400).json({ message: "Only pending requests can be reviewed" });
    }

    adjustment.status = status;
    adjustment.reviewedBy = req.user.id;
    adjustment.reviewedAt = new Date();

    if (status === "Approved") {
      // Update product quantity
      const product = await Product.findById(adjustment.productId);
      if (product) {
        const oldQuantity = product.quantity;
        product.quantity = adjustment.actualQuantity;
        await product.save();

        // Create stock log
        await createStockLog({
          productId: product._id,
          movementType: "ADJUST",
          quantityChange: adjustment.difference,
          performedBy: {
            userId: req.user.id,
            role: "owner",
          },
          source: "QUANTITY_ADJUSTMENT",
          notes: `Adjustment approved: ${adjustment.reason}. Old qty: ${oldQuantity}, New qty: ${adjustment.actualQuantity}`,
        });
      }
    } else {
      adjustment.rejectionReason = rejectionReason || null;
    }

    await adjustment.save();

    // Create notification for staff
    await Notification.create({
      userId: adjustment.staffId,
      role: "staff",
      message: `Your quantity adjustment request for ${adjustment.productName} has been ${status.toLowerCase()}`,
      type: "inventory_adjustment_request",
      redirectUrl: "/inventory-adjustments",
      relatedId: adjustment._id,
    });

    return res.status(200).json({
      message: `Adjustment request ${status.toLowerCase()}`,
      data: adjustment,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};
