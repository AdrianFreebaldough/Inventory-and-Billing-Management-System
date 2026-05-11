import User from "../models/user.js";
import Product from "../models/product.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";
import STAFF_Expense from "../models/STAFF_expense.js";
import InventoryRequest from "../models/InventoryRequest.js";
import ActivityLog from "../models/activityLog.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import Owner_StockLog from "../models/Owner_StockLog.model.js";
import Settings from "../models/Settings.js";
import { createCachedActorDisplayResolver } from "../utils/requesterDisplayName.js";

/* ================================================================
   Helper – start-of-day Date for "today" queries
   ================================================================ */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getRequestTimestamp = (request) => {
  const raw = request?.date_requested || request?.createdAt || null;
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const isInventoryServiceCategory = (value) => {
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

/* ================================================================
   1.  GET /api/owner/dashboard/summary
       Dashboard summary metrics (single request)
   ================================================================ */
export const getDashboardSummary = async (_req, res) => {
  try {
    const todayStart = startOfToday();

    const [
      totalRevenueAgg,
      todaysRevenueAgg,
      totalExpensesAgg,
      todaysExpensesAgg,
      activeStaffCount,
      pendingInventoryRequests,
      lowStockCandidates,
      settings,
    ] = await Promise.all([
      /* Total revenue – all completed transactions */
      STAFF_BillingTransaction.aggregate([
        { $match: { status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),

      /* Today's revenue – completed today */
      STAFF_BillingTransaction.aggregate([
        { $match: { status: "COMPLETED", completedAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),

      /* Total approved expenses */
      STAFF_Expense.aggregate([
        { $match: { status: "Approved" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),

      /* Today's approved expenses */
      STAFF_Expense.aggregate([
        { $match: { status: "Approved", reviewedAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),

      /* Active staff count */
      User.countDocuments({ role: "staff", isActive: true }),

      /* Pending inventory requests */
      InventoryRequest.countDocuments({ status: "pending" }),

      /* Low / out-of-stock items */
      Product.find({
        status: { $in: ["low", "out"] },
        isArchived: { $ne: true },
      })
        .select("category")
        .lean(),
      
      /* Global Settings */
      Settings.getInstance(),
    ]);

    const totalRevenueRaw = totalRevenueAgg[0]?.total || 0;
    const todaysRevenueRaw = todaysRevenueAgg[0]?.total || 0;
    const totalExpenses = totalExpensesAgg[0]?.total || 0;
    const todaysExpenses = todaysExpensesAgg[0]?.total || 0;

    // Deduct expenses from revenue
    const totalRevenue = Math.max(0, totalRevenueRaw - totalExpenses);
    const todaysRevenue = Math.max(0, todaysRevenueRaw - todaysExpenses);

    const globalThreshold = settings.inventory?.invLowStockThreshold ?? 10;

    const lowStockItems = lowStockCandidates.filter((item) => {
      if (isInventoryServiceCategory(item.category)) return false;
      const threshold = item.minStock ?? globalThreshold;
      return item.quantity <= threshold;
    }).length;

    res.json({
      totalRevenue,
      todaysRevenue,
      activeStaffCount,
      pendingInventoryRequests,
      lowStockItems,
    });
  } catch (error) {
    console.error("getDashboardSummary error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================================================
   2.  GET /api/owner/dashboard/revenue-trend
       Daily revenue for the last 7 days (proper time window)
   ================================================================ */
export const getRevenueTrend = async (_req, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 6);       // 7-day window (today incl.)
    start.setHours(0, 0, 0, 0);

    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const [revenue, expenses] = await Promise.all([
      STAFF_BillingTransaction.aggregate([
        {
          $match: {
            status: "COMPLETED",
            completedAt: { $gte: start },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { 
                format: "%Y-%m-%d", 
                date: "$completedAt",
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone 
              },
            },
            total: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      STAFF_Expense.aggregate([
        {
          $match: {
            status: "Approved",
            reviewedAt: { $gte: start },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { 
                format: "%Y-%m-%d", 
                date: "$reviewedAt",
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone 
              },
            },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ])
    ]);

    /* Build a full 7-day series using local date keys to match local labels */
    const revenueMap = new Map(revenue.map((r) => [r._id, r.total]));
    const expenseMap = new Map(expenses.map((e) => [e._id, e.total]));
    const labels = [];
    const data = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      
      // Use YYYY-MM-DD format based on local date
      const key = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
      ].join("-");

      const label = dayLabels[d.getDay()];
      labels.push(label);
      
      const dailyRevenue = revenueMap.get(key) || 0;
      const dailyExpense = expenseMap.get(key) || 0;
      data.push(Math.max(0, dailyRevenue - dailyExpense));
    }

    res.json({ labels, data });
  } catch (error) {
    console.error("getRevenueTrend error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================================================
   3.  GET /api/owner/dashboard/pending-requests
       Latest pending inventory requests (limit 5)
   ================================================================ */
export const getPendingInventoryRequests = async (_req, res) => {
  try {
    const requests = await InventoryRequest.find({ status: "pending" })
      .populate("product", "name category quantity")
      .lean();

    requests.sort((a, b) => getRequestTimestamp(b) - getRequestTimestamp(a));
    const topFive = requests.slice(0, 5);
    const resolveActorIdentity = createCachedActorDisplayResolver();

    /* Normalise shape for the UI */
    const mapped = await Promise.all(topFive.map(async (r) => {
      const requestedById = r?.requestedBy?._id || r?.requestedBy || null;
      const resolvedIdentity = await resolveActorIdentity({
        userId: requestedById ? String(requestedById) : null,
        name: r?.requestedBy?.name || r?.requestedByName || null,
        email: r?.requestedBy?.email || null,
        role: r?.requestedBy?.role || "staff",
      });

      return {
        _id: r._id,
        requestType: r.requestType,
        itemName: r.requestType === "ADD_ITEM"
          ? r.itemName
          : r.product?.name ?? "Unknown",
        requestedBy: resolvedIdentity.name,
        requestedQuantity: r.requestType === "ADD_ITEM"
          ? r.initialQuantity
          : r.requestedQuantity,
        status: r.status,
        date_requested: r.date_requested || r.createdAt,
        createdAt: r.createdAt,
      };
    }));

    res.json(mapped);
  } catch (error) {
    console.error("getPendingInventoryRequests error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================================================
   4.  GET /api/owner/dashboard/low-stock
       Products whose model-driven status is "low" or "out"
   ================================================================ */
export const getLowStockItems = async (_req, res) => {
  try {
    const [settings, products] = await Promise.all([
      Settings.getInstance(),
      Product.find({ isArchived: { $ne: true } })
        .sort({ quantity: 1 })
        .select("name category quantity minStock status unit")
        .lean(),
    ]);

    const globalThreshold = settings.inventory?.invLowStockThreshold ?? 10;

    const filtered = products.filter((product) => {
      if (isInventoryServiceCategory(product.category)) return false;
      const threshold = product.minStock ?? globalThreshold;
      return product.quantity <= threshold;
    });

    res.json(filtered);
  } catch (error) {
    console.error("getLowStockItems error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================================================
   5.  GET /api/owner/dashboard/activity
       Unified recent activity – merges ActivityLog + STAFF_ActivityLog
   ================================================================ */
export const getRecentActivity = async (_req, res) => {
  try {
    const [ownerLogs, staffLogs] = await Promise.all([
      ActivityLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("actorId", "name email")
        .lean(),

      STAFF_ActivityLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("staffId", "name email")
        .lean(),
    ]);

    /* Normalise both into a common shape */
    const normalised = [];

    for (const log of ownerLogs) {
      normalised.push({
        _id: log._id,
        actor: log.actorName || log.actorId?.name || log.actorEmail || "System",
        action: log.description || log.action || "",
        category: log.category || mapActionTypeToCategory(log.actionType),
        type: categoryToType(log.category || mapActionTypeToCategory(log.actionType)),
        createdAt: log.createdAt,
      });
    }

    for (const log of staffLogs) {
      normalised.push({
        _id: log._id,
        actor: log.staffId?.name || log.staffId?.email || "Staff",
        action: log.description || "",
        category: mapActionTypeToCategory(log.actionType),
        type: categoryToType(mapActionTypeToCategory(log.actionType)),
        createdAt: log.createdAt,
      });
    }

    /* Sort merged list descending, take top 10 */
    normalised.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(normalised.slice(0, 10));
  } catch (error) {
    console.error("getRecentActivity error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================================================
   6.  GET /api/owner/dashboard/stock-movements
       Inventory movement analytics from Owner_StockLog
   ================================================================ */
export const getStockMovements = async (_req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [summaryAgg, recentMovements] = await Promise.all([
      /* Aggregation: total additions vs deductions in the last 7 days */
      Owner_StockLog.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: null,
            totalAdditions: {
              $sum: {
                $cond: [{ $gt: ["$quantityChange", 0] }, "$quantityChange", 0],
              },
            },
            totalDeductions: {
              $sum: {
                $cond: [{ $lt: ["$quantityChange", 0] }, { $abs: "$quantityChange" }, 0],
              },
            },
            movementCount: { $sum: 1 },
          },
        },
      ]),

      /* Recent individual movements */
      Owner_StockLog.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate("product", "name")
        .populate("performedBy", "name email")
        .lean(),
    ]);

    const summary = summaryAgg[0] || {
      totalAdditions: 0,
      totalDeductions: 0,
      movementCount: 0,
    };

    const movements = recentMovements.map((m) => ({
      _id: m._id,
      productName: m.product?.name || "Unknown",
      movementType: m.movementType,
      quantityChange: m.quantityChange,
      performedBy: m.performedBy?.name || m.performedBy?.email || "System",
      source: m.source,
      createdAt: m.createdAt,
    }));

    res.json({
      totalAdditions: summary.totalAdditions,
      totalDeductions: summary.totalDeductions,
      movementCount: summary.movementCount,
      recentMovements: movements,
    });
  } catch (error) {
    console.error("getStockMovements error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================================================
   Internal helpers
   ================================================================ */
function mapActionTypeToCategory(actionType) {
  if (!actionType) return "General";
  const lower = actionType.toLowerCase();
  if (lower.includes("bill") || lower.includes("payment") || lower.includes("transaction")) return "Payment";
  if (lower.includes("request") || lower.includes("approv") || lower.includes("reject")) return "Request";
  if (lower.includes("inventory") || lower.includes("stock") || lower.includes("restock") || lower.includes("archive") || lower.includes("disposal")) return "Inventory";
  if (lower.includes("user") || lower.includes("staff") || lower.includes("role")) return "User Management";
  return "General";
}

function categoryToType(category) {
  const map = {
    Payment: "billing",
    Inventory: "inventory",
    Request: "approval",
    "User Management": "user",
  };
  return map[category] || "general";
}