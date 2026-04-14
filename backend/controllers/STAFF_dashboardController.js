import mongoose from "mongoose";
import Product from "../models/product.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";
import InventoryRequest from "../models/InventoryRequest.js";

// Uses STAFF_BillingTransaction for accurate billing data from POS system.

const STAFF_parseLimit = (value, fallback = 5, max = 10) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const STAFF_getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
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

export const STAFF_getDashboardSummary = async (req, res) => {
  try {
    const { start, end } = STAFF_getTodayRange();
    const staffId = new mongoose.Types.ObjectId(req.user.id);

    const [summaryAggregation, pendingRestockRequests] = await Promise.all([
      STAFF_BillingTransaction.aggregate([
        {
          $match: {
            staffId: staffId,
            status: "COMPLETED",
            completedAt: { $gte: start, $lt: end },
          },
        },
        {
          $project: {
            totalAmount: 1,
            itemCount: { $sum: "$items.quantity" },
          },
        },
        {
          $group: {
            _id: null,
            todaysRevenue: { $sum: "$totalAmount" },
            todaysTransactions: { $sum: 1 },
            itemsIssuedToday: { $sum: "$itemCount" },
          },
        },
      ]),
      InventoryRequest.countDocuments({
        requestedBy: staffId,
        status: "pending",
        requestType: "RESTOCK",
      }),
    ]);

    const summary = summaryAggregation[0] || {
      todaysRevenue: 0,
      todaysTransactions: 0,
      itemsIssuedToday: 0,
    };

    return res.status(200).json({
      todaysRevenue: summary.todaysRevenue,
      todaysTransactions: summary.todaysTransactions,
      itemsIssuedToday: summary.itemsIssuedToday,
      pendingRestockRequests,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const STAFF_getRecentTransactions = async (req, res) => {
  try {
    const limit = STAFF_parseLimit(req.query.limit, 5, 10);

    const transactions = await STAFF_BillingTransaction.find({ 
      staffId: req.user.id,
      status: { $in: ["COMPLETED", "VOIDED"] },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("patientId totalAmount items status completedAt createdAt")
      .lean();

    const data = transactions.map((transaction) => ({
      transactionId: transaction._id,
      patientId: transaction.patientId || null,
      totalAmount: transaction.totalAmount,
      itemCount: (transaction.items || []).reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      ),
      status: transaction.status,
      dateTime: transaction.completedAt || transaction.createdAt,
    }));

    return res.status(200).json({
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const STAFF_getInventoryAlerts = async (req, res) => {
  try {
    const limit = STAFF_parseLimit(req.query.limit, 10, 50);

    const products = await Product.find({
      status: { $in: ["low", "out"] },
      isArchived: { $ne: true },
    })
      .sort({ status: 1, quantity: 1, name: 1 })
      .limit(limit)
      .select("name status quantity category")
      .lean();

    const filteredProducts = products.filter(
      (product) => !STAFF_isInventoryServiceCategory(product.category)
    );

    const data = filteredProducts.map((product) => ({
      itemName: product.name,
      stockStatus: product.status,
      remainingQuantity: product.quantity,
    }));

    return res.status(200).json({
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const STAFF_getTopItemsToday = async (req, res) => {
  try {
    const limit = STAFF_parseLimit(req.query.limit, 5, 10);
    const { start, end } = STAFF_getTodayRange();
    const staffId = new mongoose.Types.ObjectId(req.user.id);

    const topItems = await STAFF_BillingTransaction.aggregate([
      {
        $match: {
          staffId: staffId,
          status: "COMPLETED",
          completedAt: { $gte: start, $lt: end },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          itemName: { $first: "$items.name" },
          quantityDispensed: { $sum: "$items.quantity" },
          totalSalesValue: { $sum: "$items.lineTotal" },
        },
      },
      { $sort: { quantityDispensed: -1, totalSalesValue: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          productId: "$_id",
          itemName: 1,
          quantityDispensed: 1,
          totalSalesValue: 1,
        },
      },
    ]);

    return res.status(200).json({
      count: topItems.length,
      data: topItems,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const STAFF_getRecentItemUsage = async (req, res) => {
  try {
    const limit = STAFF_parseLimit(req.query.limit, 10, 20);
    const { start, end } = STAFF_getTodayRange();
    const staffId = new mongoose.Types.ObjectId(req.user.id);

    const usage = await STAFF_BillingTransaction.aggregate([
      {
        $match: {
          staffId: staffId,
          status: "COMPLETED",
          completedAt: { $gte: start, $lt: end },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          itemName: { $first: "$items.name" },
          quantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      {
        $unwind: {
          path: "$product",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          productId: "$_id",
          itemName: 1,
          quantity: 1,
          unitType: { $ifNull: ["$product.unit", "pcs"] },
        },
      },
    ]);

    return res.status(200).json({
      count: usage.length,
      data: usage,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
