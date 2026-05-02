import mongoose from "mongoose";
import crypto from "crypto";
import Product from "../models/product.js";
import User from "../models/user.js";
import Owner_StockLog from "../models/Owner_StockLog.model.js";

const Owner_ALLOWED_MOVEMENT_TYPES = new Set(["SALE", "RESTOCK", "ADJUST", "VOID_REVERSAL", "ADJUSTMENT", "ITEM_CREATED", "DISPOSAL"]);
const Owner_ALLOWED_SOURCES = new Set(["POS", "MANUAL", "SYSTEM"]);

const Owner_escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const Owner_generateReferenceId = async (session = null) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `SL-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const existsQuery = Owner_StockLog.exists({ referenceId: candidate });
    if (session) {
      existsQuery.session(session);
    }

    const exists = await existsQuery;
    if (!exists) {
      return candidate;
    }
  }

  return `SL-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
};

const Owner_resolvePerformer = async ({ performedBy, session = null }) => {
  const userId = performedBy?.userId;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid performedBy.userId");
  }

  const userQuery = User.findById(userId).select("name email role");
  if (session) {
    userQuery.session(session);
  }

  const user = await userQuery;
  if (user?._id) {
    return user._id;
  }

  // HRMS-authenticated users may not exist in IBMS users collection;
  // keep log writes in IBMS by storing the authenticated ObjectId.
  return new mongoose.Types.ObjectId(userId);
};

export const createStockLog = async ({
  productId,
  movementType,
  quantityChange,
  performedBy,
  source,
  notes = null,
  batchNumber = null,
  referenceId: providedReferenceId = null,
  session = null,
}) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error("Invalid productId");
  }

  if (!Owner_ALLOWED_MOVEMENT_TYPES.has(movementType)) {
    throw new Error("Invalid movementType");
  }

  if (!Owner_ALLOWED_SOURCES.has(source)) {
    throw new Error("Invalid source");
  }

  const parsedChange = Number(quantityChange);
  if (!Number.isFinite(parsedChange) || parsedChange === 0) {
    throw new Error("quantityChange must be a non-zero number");
  }

  if (movementType === "SALE" && parsedChange >= 0) {
    throw new Error("SALE movement requires a negative quantityChange");
  }

  if (movementType === "RESTOCK" && parsedChange <= 0) {
    throw new Error("RESTOCK movement requires a positive quantityChange");
  }

  if (movementType === "VOID_REVERSAL" && parsedChange <= 0) {
    throw new Error("VOID_REVERSAL movement requires a positive quantityChange");
  }

  if (movementType === "ITEM_CREATED" && parsedChange <= 0) {
    throw new Error("ITEM_CREATED movement requires a positive quantityChange");
  }

  if (movementType === "DISPOSAL" && parsedChange >= 0) {
    throw new Error("DISPOSAL movement requires a negative quantityChange");
  }

  const productQuery = Product.findById(productId).select("_id name quantity");
  if (session) {
    productQuery.session(session);
  }

  const product = await productQuery;
  if (!product) {
    throw new Error("Product not found");
  }

  const afterQuantity = Number(product.quantity);
  const beforeQuantity = afterQuantity - parsedChange;

  if (!Number.isFinite(beforeQuantity) || beforeQuantity < 0) {
    throw new Error("Invalid quantity transition while creating stock log");
  }

  const performer = await Owner_resolvePerformer({ performedBy, session });

  const [stockLog] = await Owner_StockLog.create(
    [
      {
        product: product._id,
        movementType,
        quantityChange: parsedChange,
        beforeQuantity,
        afterQuantity,
        performedBy: performer,
        referenceId: providedReferenceId || null,
        batchNumber: batchNumber ? String(batchNumber).trim() : null,
        source,
        notes: notes || null,
      },
    ],
    session ? { session } : undefined
  );

  return stockLog;
};

const Owner_getDateUpperBound = (dateValue) => {
  const asString = String(dateValue);
  const parsedDate = new Date(asString);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid endDate");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
    parsedDate.setHours(23, 59, 59, 999);
  }

  return parsedDate;
};

const Owner_buildStockLogFilters = async ({
  startDate,
  endDate,
  productId,
  movementType,
  performedBy,
  search,
}) => {
  const filters = {};

  if (startDate || endDate) {
    filters.createdAt = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate);
      if (Number.isNaN(parsedStartDate.getTime())) {
        throw new Error("Invalid startDate");
      }
      filters.createdAt.$gte = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = Owner_getDateUpperBound(endDate);
      filters.createdAt.$lte = parsedEndDate;
    }
  }

  if (productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new Error("Invalid productId filter");
    }
    filters.product = productId;
  }

  if (movementType) {
    if (!Owner_ALLOWED_MOVEMENT_TYPES.has(movementType)) {
      throw new Error("Invalid movementType filter");
    }
    filters.movementType = movementType;
  }

  if (performedBy) {
    // Support both ObjectId and legacy email string filters
    if (mongoose.Types.ObjectId.isValid(performedBy)) {
      filters.performedBy = performedBy;
    } else if (typeof performedBy === "string" && performedBy.includes("@")) {
      // Legacy: filter by email string directly
      filters.performedBy = performedBy;
    } else {
      throw new Error("Invalid performedBy filter");
    }
  }

  if (search) {
    const searchRegex = new RegExp(Owner_escapeRegex(String(search).trim()), "i");

    // We can't easily search across populated fields in a single .find() without aggregation
    // So we'll fetch matching product and user IDs first
    const matchingProducts = await Product.find({ name: searchRegex }).select("_id").lean();
    const productIds = matchingProducts.map((p) => p._id);

    const matchingUsers = await User.find({
      $or: [{ name: searchRegex }, { email: searchRegex }],
    })
      .select("_id")
      .lean();
    const userIds = matchingUsers.map((u) => u._id);

    filters.$or = [
      { product: { $in: productIds } },
      { performedBy: { $in: userIds } },
    ];
  }

  return filters;
};

const Owner_buildSummaryFromAggregation = (groupedRows) => {
  const summary = {
    totalSale: 0,
    totalRestock: 0,
    totalAdjust: 0,
    totalDisposal: 0,
  };

  groupedRows.forEach((row) => {
    if (row._id === "SALE") {
      summary.totalSale = row.totalQuantity;
    }

    if (row._id === "RESTOCK") {
      summary.totalRestock = row.totalQuantity;
    }

    if (row._id === "ADJUST") {
      summary.totalAdjust = row.totalQuantity;
    }

    if (row._id === "DISPOSAL") {
      summary.totalDisposal = row.totalQuantity;
    }
  });

  return summary;
};

const Owner_getStockLogSummaryTotals = async (filters) => {
  const groupedRows = await Owner_StockLog.aggregate([
    { $match: filters },
    {
      $group: {
        _id: "$movementType",
        totalQuantity: {
          $sum: {
            $abs: "$quantityChange",
          },
        },
      },
    },
  ]);

  return Owner_buildSummaryFromAggregation(groupedRows);
};

const Owner_normalizeStockLog = (stockLog) => {
  const performerName = stockLog?.performedBy?.name || stockLog?.performedBy?.email || "Unknown User";

  return {
    _id: stockLog._id,
    product: {
      _id: stockLog?.product?._id || null,
      name: stockLog?.product?.name || "Unknown Product",
    },
    movementType: stockLog.movementType,
    quantityChange: stockLog.quantityChange,
    beforeQuantity: stockLog.beforeQuantity,
    afterQuantity: stockLog.afterQuantity,
    batchNumber: stockLog.batchNumber || null,
    performedBy: {
      _id: stockLog?.performedBy?._id || null,
      name: performerName,
    },
    createdAt: stockLog.createdAt,
  };
};

export const getStockLogs = async ({
  startDate,
  endDate,
  productId,
  movementType,
  performedBy,
  search,
}) => {
  const filters = await Owner_buildStockLogFilters({
    startDate,
    endDate,
    productId,
    movementType,
    performedBy,
    search,
  });

  const rawData = await Owner_StockLog.find(filters)
    .sort({ createdAt: -1 })
    .populate("product", "name")
    .lean();

  // Calculate summary from fetched data (avoids aggregation type-casting issues with legacy data)
  const summary = {
    totalSale: 0,
    totalRestock: 0,
    totalAdjust: 0,
    totalDisposal: 0,
  };
  rawData.forEach((log) => {
    const qty = Math.abs(Number(log.quantityChange) || 0);
    if (log.movementType === "SALE") summary.totalSale += qty;
    else if (log.movementType === "RESTOCK") summary.totalRestock += qty;
    else if (log.movementType === "ADJUST") summary.totalAdjust += qty;
    else if (log.movementType === "DISPOSAL") summary.totalDisposal += qty;
  });

  // Collect valid ObjectIds for batch user lookup
  const validUserIds = rawData
    .map((log) => log.performedBy)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  const usersById = new Map();
  if (validUserIds.length > 0) {
    const users = await User.find({ _id: { $in: validUserIds } })
      .select("name email")
      .lean();
    users.forEach((user) => usersById.set(String(user._id), user));
  }

  // Attach performer info (handles both ObjectId refs and legacy email strings)
  const data = rawData.map((log) => {
    const performerId = log.performedBy;
    let performer = null;

    if (mongoose.Types.ObjectId.isValid(performerId)) {
      performer = usersById.get(String(performerId)) || null;
    }

    return {
      ...log,
      performedBy: performer || {
        _id: null,
        name: typeof performerId === "string" ? performerId : "Unknown User",
        email: typeof performerId === "string" && performerId.includes("@") ? performerId : null,
      },
    };
  });

  const normalizedData = data.map(Owner_normalizeStockLog);

  return {
    total: normalizedData.length,
    summary,
    data: normalizedData,
  };
};

export const getStockLogSummary = async ({
  startDate,
  endDate,
  productId,
  movementType,
  performedBy,
  search,
}) => {
  const filters = await Owner_buildStockLogFilters({
    startDate,
    endDate,
    productId,
    movementType,
    performedBy,
    search,
  });

  return Owner_getStockLogSummaryTotals(filters);
};
