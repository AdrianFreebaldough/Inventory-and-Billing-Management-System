import User from "../models/user.js";
import Product from "../models/product.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";
import InventoryRequest from "../models/InventoryRequest.js";
import ActivityLog from "../models/activityLog.js";

/* ================= DASHBOARD STATS ================= */
export const getDashboardStats = async (req, res) => {
  try {
    // Total Revenue from completed billing transactions
    const revenueResult = await STAFF_BillingTransaction.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const revenue = revenueResult[0]?.total || 0;

    // Active Staff
    const activeStaff = await User.countDocuments({
      role: "staff",
      isActive: true,
    });

    // Low Stock Items
    const lowStock = await Product.countDocuments({
      quantity: { $lte: 10 },
      isArchived: { $ne: true },
    });

    // Pending Inventory Requests
    const pendingRequests = await InventoryRequest.countDocuments({
      status: "pending",
    });

    res.json({
      revenue,
      activeStaff,
      lowStock,
      pendingRequests,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ================= REVENUE OVERVIEW (CHART) ================= */
export const getRevenueOverview = async (req, res) => {
  try {
    const revenue = await STAFF_BillingTransaction.aggregate([
      { $match: { status: "COMPLETED" } },
      {
        $group: {
          _id: {
            $dayOfWeek: "$completedAt",
          },
          total: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id": 1 } },
    ]);

    res.json(revenue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ================= PENDING INVENTORY REQUESTS ================= */
export const getPendingInventoryRequests = async (req, res) => {
  try {
    const requests = await InventoryRequest.find({ status: "pending" })
      .populate("product", "name category quantity")
      .populate("requestedBy", "email role")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ================= LOW STOCK ALERTS ================= */
export const getLowStockItems = async (req, res) => {
  try {
    const products = await Product.find({
      quantity: { $lte: 10 },
    }).sort({ quantity: 1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ================= RECENT ACTIVITY ================= */
export const getRecentActivity = async (req, res) => {
  try {
    const activity = await ActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(6);

    res.json(activity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};