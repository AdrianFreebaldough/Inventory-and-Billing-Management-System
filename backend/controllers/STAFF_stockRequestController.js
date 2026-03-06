import STAFF_StockRequest from "../models/STAFF_stockRequest.js";
import Product from "../models/product.js";
import Notification from "../models/Notification.js";
import { createStockLog } from "../services/Owner_StockLog.service.js";

// Generate unique request ID
const generateRequestId = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `REQ-${yyyy}${mm}${dd}-${randomPart}`;
};

// Staff: Get low stock items for restock request
export const STAFF_getLowStockItems = async (req, res) => {
  try {
    const lowStockItems = await Product.find({
      isArchived: false,
      $expr: { $lte: ["$quantity", "$minStock"] },
    })
      .select("name category quantity minStock unitPrice")
      .sort({ quantity: 1 })
      .lean();

    return res.status(200).json({
      count: lowStockItems.length,
      data: lowStockItems,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Staff: Create multi-item restock request
export const STAFF_createStockRequest = async (req, res) => {
  try {
    const { items, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one item is required" });
    }

    // Validate and fetch product details
    const requestItems = [];
    for (const item of items) {
      if (!item.productId || !item.requestedQuantity || item.requestedQuantity <= 0) {
        return res.status(400).json({ message: "Invalid item data" });
      }

      const product = await Product.findById(item.productId);
      if (!product || product.isArchived) {
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      }

      requestItems.push({
        productId: product._id,
        productName: product.name,
        currentStock: product.quantity,
        requestedQuantity: item.requestedQuantity,
        status: "Pending",
      });
    }

    const stockRequest = await STAFF_StockRequest.create({
      requestId: generateRequestId(),
      staffId: req.user.id,
      staffName: req.user.name || "Staff",
      items: requestItems,
      status: "Pending",
      notes: notes || "",
    });

    // Create notification for owner
    await Notification.create({
      userId: null,
      role: "owner",
      message: `New stock request from ${req.user.name} (${requestItems.length} items)`,
      type: "stock_request_sent",
      redirectUrl: "/stock-requests",
      relatedId: stockRequest._id,
    });

    return res.status(201).json({
      message: "Stock request created successfully",
      data: stockRequest,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Staff: Get own stock requests
export const STAFF_getStockRequests = async (req, res) => {
  try {
    const requests = await STAFF_StockRequest.find({ staffId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Owner: Get all stock requests
export const OWNER_getStockRequests = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const requests = await STAFF_StockRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate("staffId", "name email")
      .populate("reviewedBy", "name email")
      .lean();

    return res.status(200).json({
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Owner: Approve stock request items
export const OWNER_approveStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvals } = req.body; // [{productId, approvedQuantity, expirationDate, batchNumber}]

    if (!approvals || !Array.isArray(approvals) || approvals.length === 0) {
      return res.status(400).json({ message: "Approvals array is required" });
    }

    const request = await STAFF_StockRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: "Stock request not found" });
    }

    let approvedCount = 0;
    let rejectedCount = 0;

    for (const approval of approvals) {
      const itemIndex = request.items.findIndex(
        (item) => item.productId.toString() === approval.productId
      );

      if (itemIndex === -1) continue;

      const item = request.items[itemIndex];

      if (approval.status === "Approved" && approval.approvedQuantity > 0) {
        // Update product quantity
        const product = await Product.findById(item.productId);
        if (product) {
          product.quantity += approval.approvedQuantity;
          if (approval.expirationDate) {
            product.expiryDate = new Date(approval.expirationDate);
          }
          if (approval.batchNumber) {
            product.batchNumber = approval.batchNumber;
          }
          await product.save();

          // Create stock log
          await createStockLog({
            productId: product._id,
            movementType: "RESTOCK",
            quantityChange: approval.approvedQuantity,
            performedBy: {
              userId: req.user.id,
              role: "owner",
            },
            source: "RESTOCK_REQUEST",
            notes: `Stock request ${request.requestId}`,
          });
        }

        item.status = "Approved";
        item.approvedQuantity = approval.approvedQuantity;
        item.expirationDate = approval.expirationDate || null;
        item.batchNumber = approval.batchNumber || null;
        approvedCount++;
      } else if (approval.status === "Rejected") {
        item.status = "Rejected";
        rejectedCount++;
      }
    }

    // Update overall request status
    const pendingCount = request.items.filter((item) => item.status === "Pending").length;
    if (pendingCount === 0) {
      if (approvedCount > 0 && rejectedCount > 0) {
        request.status = "Partially Approved";
      } else if (approvedCount > 0) {
        request.status = "Approved";
      } else {
        request.status = "Rejected";
      }
    }

    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await request.save();

    // Create notification for staff
    await Notification.create({
      userId: request.staffId,
      role: "staff",
      message: `Your stock request ${request.requestId} has been ${request.status.toLowerCase()}`,
      type: request.status === "Approved" ? "stock_request_approved" : "stock_request_rejected",
      redirectUrl: "/stock-requests",
      relatedId: request._id,
    });

    return res.status(200).json({
      message: "Stock request processed successfully",
      data: request,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};
