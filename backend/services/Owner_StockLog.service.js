import mongoose from "mongoose";
import crypto from "crypto";
import Product from "../models/product.js";
import User from "../models/user.js";
import Owner_StockLog from "../models/Owner_StockLog.model.js";

const Owner_ALLOWED_MOVEMENT_TYPES = new Set(["SALE", "RESTOCK", "ADJUST"]);
const Owner_ALLOWED_SOURCES = new Set(["POS", "MANUAL", "SYSTEM"]);

const Owner_escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const Owner_normalizePagination = ({ page, limit }) => {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);

  const safePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 20;

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

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

  const userQuery = User.findById(userId).select("email role");
  if (session) {
    userQuery.session(session);
  }

  const user = await userQuery;
  if (!user) {
    throw new Error("Performer not found");
  }

  return {
    userId: user._id,
    name: String(performedBy?.name || user.email || "Unknown User").trim(),
    role: String(performedBy?.role || user.role || "staff").trim(),
  };
};

export const createStockLog = async ({
  productId,
  movementType,
  quantityChange,
  performedBy,
  source,
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
  const referenceId = await Owner_generateReferenceId(session);

  const [stockLog] = await Owner_StockLog.create(
    [
      {
        productId: product._id,
        productName: product.name,
        movementType,
        quantityChange: parsedChange,
        beforeQuantity,
        afterQuantity,
        performedBy: performer,
        referenceId,
        source,
      },
    ],
    session ? { session } : undefined
  );

  return stockLog;
};

const Owner_buildStockLogFilters = ({
  startDate,
  endDate,
  productId,
  movementType,
  performedBy,
  referenceId,
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
      const parsedEndDate = new Date(endDate);
      if (Number.isNaN(parsedEndDate.getTime())) {
        throw new Error("Invalid endDate");
      }
      filters.createdAt.$lte = parsedEndDate;
    }
  }

  if (productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new Error("Invalid productId filter");
    }
    filters.productId = productId;
  }

  if (movementType) {
    if (!Owner_ALLOWED_MOVEMENT_TYPES.has(movementType)) {
      throw new Error("Invalid movementType filter");
    }
    filters.movementType = movementType;
  }

  if (performedBy) {
    if (mongoose.Types.ObjectId.isValid(performedBy)) {
      filters["performedBy.userId"] = performedBy;
    } else {
      filters["performedBy.name"] = { $regex: new RegExp(Owner_escapeRegex(String(performedBy).trim()), "i") };
    }
  }

  if (referenceId) {
    filters.referenceId = { $regex: new RegExp(`^${Owner_escapeRegex(String(referenceId).trim())}$`, "i") };
  }

  return filters;
};

export const getStockLogs = async ({
  startDate,
  endDate,
  productId,
  movementType,
  performedBy,
  referenceId,
  page,
  limit,
}) => {
  const filters = Owner_buildStockLogFilters({
    startDate,
    endDate,
    productId,
    movementType,
    performedBy,
    referenceId,
  });

  const pagination = Owner_normalizePagination({ page, limit });

  const [total, data] = await Promise.all([
    Owner_StockLog.countDocuments(filters),
    Owner_StockLog.find(filters)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
  ]);

  return {
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    data,
  };
};

export const getStockLogSummary = async ({
  startDate,
  endDate,
  productId,
  movementType,
  performedBy,
  referenceId,
}) => {
  const filters = Owner_buildStockLogFilters({
    startDate,
    endDate,
    productId,
    movementType,
    performedBy,
    referenceId,
  });

  const [totals, byMovementType] = await Promise.all([
    Owner_StockLog.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          netQuantityChange: { $sum: "$quantityChange" },
          totalStockIn: {
            $sum: {
              $cond: [{ $gt: ["$quantityChange", 0] }, "$quantityChange", 0],
            },
          },
          totalStockOut: {
            $sum: {
              $cond: [{ $lt: ["$quantityChange", 0] }, { $abs: "$quantityChange" }, 0],
            },
          },
        },
      },
    ]),
    Owner_StockLog.aggregate([
      { $match: filters },
      {
        $group: {
          _id: "$movementType",
          count: { $sum: 1 },
          netQuantityChange: { $sum: "$quantityChange" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    totalLogs: totals[0]?.totalLogs || 0,
    netQuantityChange: totals[0]?.netQuantityChange || 0,
    totalStockIn: totals[0]?.totalStockIn || 0,
    totalStockOut: totals[0]?.totalStockOut || 0,
    byMovementType,
  };
};
