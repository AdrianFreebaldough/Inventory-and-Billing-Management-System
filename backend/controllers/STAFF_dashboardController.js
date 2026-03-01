import mongoose from "mongoose";
import Product from "../models/product.js";
import Transaction from "../models/transaction.js";
import InventoryRequest from "../models/InventoryRequest.js";

// Reuse existing transaction ownership field (`processedBy`) as the staff reference.
// Reuse existing inventory request ownership field (`requestedBy`) for pending counts.

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

export const STAFF_getDashboardSummary = async (req, res) => {
  try {
    const { start, end } = STAFF_getTodayRange();
    const staffId = new mongoose.Types.ObjectId(req.user.id);

    const [summaryAggregation, pendingRestockRequests] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            processedBy: staffId,
            createdAt: { $gte: start, $lt: end },
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

    const transactions = await Transaction.find({ processedBy: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("transactionNo totalAmount items createdAt")
      .lean();

    const data = transactions.map((transaction) => ({
      transactionId: transaction.transactionNo,
      // Keep customer id nullable because current Transaction schema does not require one.
      customerId: transaction.patientId || transaction.customerId || null,
      totalAmount: transaction.totalAmount,
      itemCount: (transaction.items || []).reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      ),
      dateTime: transaction.createdAt,
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
      .select("name status quantity")
      .lean();

    const data = products.map((product) => ({
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

    const topItems = await Transaction.aggregate([
      {
        $match: {
          processedBy: staffId,
          createdAt: { $gte: start, $lt: end },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          quantityDispensed: { $sum: "$items.quantity" },
          totalSalesValue: {
            $sum: {
              $multiply: ["$items.quantity", "$items.price"],
            },
          },
        },
      },
      { $sort: { quantityDispensed: -1, totalSalesValue: -1 } },
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
          itemName: { $ifNull: ["$product.name", "Unknown Item"] },
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

    const usage = await Transaction.aggregate([
      {
        $match: {
          processedBy: staffId,
          createdAt: { $gte: start, $lt: end },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
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
          itemName: { $ifNull: ["$product.name", "Unknown Item"] },
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
