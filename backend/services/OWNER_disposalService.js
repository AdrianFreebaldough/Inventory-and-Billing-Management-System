import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import Product from "../models/product.js";
import InventoryBatch from "../models/InventoryBatch.js";
import ActivityLog from "../models/activityLog.js";
import OWNER_DisposalLog from "../models/OWNER_disposalLog.js";
import { createStockLog } from "./Owner_StockLog.service.js";
import { createCachedActorDisplayResolver } from "../utils/requesterDisplayName.js";
import {
  BATCH_EFFECTIVE_STATUS,
  BATCH_MANUAL_STATUS,
  getBatchEffectiveStatus,
} from "./batchLifecycleService.js";
import { syncProductFromBatchTotals } from "./inventoryIntegrityService.js";

const DISPOSAL_STATUSES = new Set(["Pending", "Approved", "Disposed", "Rejected"]);

const validateRequiredFields = (payload, fields) => {
  for (const field of fields) {
    const value = payload[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new Error(`${field} is required`);
    }
  }
};

const parsePositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const resolveRequesterDisplayName = ({ requesterName, requesterEmail, requesterAccountId, userRole = "STAFF" }) => {
  const byName = String(requesterName || "").trim();
  if (byName) return byName;

  return String(userRole || "").toUpperCase() === "OWNER" ? "Admin" : "Staff";
};

const executeWithOptionalTransaction = async (workFn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await workFn(session);
    });
    return result;
  } catch (error) {
    const unsupportedTransaction =
      error?.message?.includes("Transaction numbers are only allowed") ||
      error?.message?.includes("replica set") ||
      error?.codeName === "IllegalOperation";

    if (!unsupportedTransaction) {
      throw error;
    }

    return workFn(null);
  } finally {
    await session.endSession();
  }
};

const getQueryWithSession = (query, session) => {
  if (session) {
    query.session(session);
  }
  return query;
};

const generateReferenceId = async (session = null) => {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `DSP-${year}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    const existsQuery = OWNER_DisposalLog.exists({ referenceId: candidate });
    if (session) {
      existsQuery.session(session);
    }

    const exists = await existsQuery;
    if (!exists) {
      return candidate;
    }
  }

  return `DSP-${year}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
};

export const recalculateProductStock = async (productId, session = null) => {
  const result = await syncProductFromBatchTotals({
    productId,
    session,
    createDefaultBatchIfMissing: true,
    warningContext: "disposal-recalculate",
  });

  return result.product;
};

const mapDisposalLog = (log) => {
  const requestedById = log.requestedBy?._id || log.requestedBy || null;
  const requestedByName = String(
    log.requestedBy?.name || log.requestedByName || ""
  ).trim();

  return {
  id: log._id,
  referenceId: log.referenceId,
  itemId: log.itemId?._id || log.itemId || null,
  itemName: log.itemName,
  genericName: log.genericName || null,
  batchId: log.batchId?._id || log.batchId || null,
  batchNumber: log.batchNumber,
  expirationDate: log.expirationDate || null,
  quantityDisposed: Number(log.quantityDisposed || 0),
  reason: log.reason,
  remarks: log.remarks || "",
  requestedBy: requestedById || requestedByName
    ? {
        id: requestedById,
        name: requestedByName || "Unknown",
        email: log.requestedBy?.email || null,
      }
    : null,
  approvedBy: log.approvedBy
    ? {
        id: log.approvedBy._id,
        name: log.approvedBy.name || log.approvedBy.email || "Unknown",
        email: log.approvedBy.email || null,
      }
    : null,
  disposalMethod: log.disposalMethod || null,
  dateRequested: log.dateRequested || log.createdAt,
  date_requested: log.dateRequested || log.createdAt,
  dateApproved: log.dateApproved || null,
  date_approved: log.dateApproved || null,
  dateDisposed: log.dateDisposed || null,
  date_disposed: log.dateDisposed || null,
  status: log.status,
  quantity_requested: Number(log.quantityDisposed || 0),
  requested_role: log.requestedBy?.role || null,
  };
};

const hydrateMissingRequesterIdentity = async (logs = [], session = null) => {
  const rows = Array.isArray(logs) ? logs : [];
  const missingRows = rows.filter((row) => {
    const hasRequestedBy = Boolean(row?.requestedBy);
    const hasRequestedByName = String(row?.requestedByName || "").trim().length > 0;
    return !hasRequestedBy && !hasRequestedByName;
  });

  if (!missingRows.length) {
    return rows;
  }

  const missingEntityIds = missingRows
    .map((row) => row?._id)
    .filter(Boolean);

  const missingReferenceIds = missingRows
    .map((row) => String(row?.referenceId || "").trim())
    .filter(Boolean);

  const activityQuery = ActivityLog.find({
    $or: [
      {
        entityType: "DisposalLog",
        entityId: { $in: missingEntityIds },
      },
      {
        actionType: "DISPOSAL_REQUEST",
        "details.referenceId": { $in: missingReferenceIds },
      },
      {
        action: "DISPOSAL_REQUEST_CREATED",
        "details.referenceId": { $in: missingReferenceIds },
      },
    ],
  })
    .select("entityId actorId actorName actorEmail actorRole details createdAt")
    .sort({ createdAt: -1 })
    .lean();
  getQueryWithSession(activityQuery, session);
  const activities = await activityQuery;

  if (!activities.length) {
    return rows;
  }
  const resolveActorIdentity = createCachedActorDisplayResolver();

  const missingByEntityId = new Map();
  const missingByReferenceId = new Map();

  missingRows.forEach((row) => {
    if (row?._id) {
      missingByEntityId.set(String(row._id), row);
    }

    const referenceId = String(row?.referenceId || "").trim();
    if (referenceId) {
      missingByReferenceId.set(referenceId, row);
    }
  });

  for (const activity of activities) {
    const actorId = String(activity?.actorId || "").trim();
    const resolvedIdentity = await resolveActorIdentity({
      userId: actorId || null,
      name: activity?.actorName || null,
      email: activity?.actorEmail || null,
      role: activity?.actorRole || "staff",
    });

    const entityId = String(activity?.entityId || "").trim();
    const referenceId = String(activity?.details?.referenceId || "").trim();

    const targetRow = missingByEntityId.get(entityId) || missingByReferenceId.get(referenceId);
    if (!targetRow) {
      return;
    }

    targetRow.requestedBy = {
      _id: resolvedIdentity.id || actorId || null,
      name: resolvedIdentity.name,
      email: resolvedIdentity.email || null,
      role: resolvedIdentity.role || null,
    };

    if (!String(targetRow.requestedByName || "").trim()) {
      targetRow.requestedByName = resolvedIdentity.name;
    }
  }

  return rows;
};

const createDisposalLogEntry = async (payload, session = null) => {
  try {
    const [createdLog] = await OWNER_DisposalLog.create([payload], session ? { session } : undefined);
    return createdLog;
  } catch (error) {
    throw new Error("Failed to create disposal record.");
  }
};

export const getDisposalLogs = async ({
  startDate,
  endDate,
  itemName,
  reason,
  status,
} = {}) => {
  const filters = {};

  if (startDate || endDate) {
    filters.dateRequested = {};
    if (startDate) {
      const parsed = new Date(startDate);
      if (!Number.isNaN(parsed.getTime())) {
        filters.dateRequested.$gte = parsed;
      }
    }
    if (endDate) {
      const parsed = new Date(endDate);
      if (!Number.isNaN(parsed.getTime())) {
        parsed.setHours(23, 59, 59, 999);
        filters.dateRequested.$lte = parsed;
      }
    }
  }

  if (itemName) {
    filters.itemName = { $regex: new RegExp(String(itemName).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") };
  }

  if (reason) {
    filters.reason = reason;
  }

  if (status && DISPOSAL_STATUSES.has(status)) {
    filters.status = status;
  }

  const logs = await OWNER_DisposalLog.find(filters)
    .sort({ dateRequested: -1, createdAt: -1 })
    .populate("requestedBy", "name email role")
    .populate("approvedBy", "name email")
    .lean();

  await hydrateMissingRequesterIdentity(logs);

  return logs.map(mapDisposalLog);
};

export const getDisposalLogById = async (id, options = {}) => {
  const detailsQuery = OWNER_DisposalLog.findById(id)
    .populate("requestedBy", "name email role")
    .populate("approvedBy", "name email");
  getQueryWithSession(detailsQuery, options.session || null);
  const log = await detailsQuery.lean();

  if (!log) {
    throw new Error("Disposal record not found");
  }

  await hydrateMissingRequesterIdentity([log], options.session || null);

  return mapDisposalLog(log);
};

export const createDisposalRequest = async ({
  userId,
  userRole = "OWNER",
  requesterName = null,
  requesterEmail = null,
  requesterAccountId = null,
  productId,
  batchId,
  quantityDisposed,
  reason,
  remarks,
  disposalMethod,
}) => {
  return executeWithOptionalTransaction(async (session) => {
    validateRequiredFields(
      {
        userId,
        productId,
        batchId,
        quantityDisposed,
        reason,
      },
      ["userId", "productId", "batchId", "quantityDisposed", "reason"]
    );

    const parsedQuantity = parsePositiveInteger(quantityDisposed);
    if (!parsedQuantity) {
      throw new Error("Dispose quantity must be a positive integer");
    }

    const batchQuery = InventoryBatch.findById(batchId);
    getQueryWithSession(batchQuery, session);
    const batch = await batchQuery;
    if (!batch) {
      throw new Error("Batch not found");
    }

    if (String(batch.product) !== String(productId)) {
      throw new Error("Batch does not belong to the selected product");
    }

    const effectiveStatus = getBatchEffectiveStatus(batch);
    if ([BATCH_EFFECTIVE_STATUS.PENDING_DISPOSAL, BATCH_EFFECTIVE_STATUS.DISPOSED, BATCH_EFFECTIVE_STATUS.OUT_OF_STOCK].includes(effectiveStatus)) {
      throw new Error("This batch is not eligible for disposal");
    }

    if (parsedQuantity > Number(batch.currentQuantity ?? batch.quantity ?? 0)) {
      throw new Error("Dispose quantity must not exceed the available batch quantity");
    }

    const productQuery = Product.findById(productId).select("_id name genericName");
    getQueryWithSession(productQuery, session);
    const product = await productQuery;
    if (!product) {
      throw new Error("Product not found");
    }

    const existingPendingQuery = OWNER_DisposalLog.findOne({
      batchId: batch._id,
      status: "Pending",
    });
    getQueryWithSession(existingPendingQuery, session);
    const existingPending = await existingPendingQuery;
    if (existingPending) {
      throw new Error("This batch already has a pending disposal request");
    }

    const referenceId = await generateReferenceId(session);
    const requesterDisplayName = resolveRequesterDisplayName({
      requesterName,
      requesterEmail,
      requesterAccountId,
      userRole,
    });

    const createdLog = await createDisposalLogEntry(
      {
        referenceId,
        itemId: product._id,
        batchId: batch._id,
        itemName: product.name,
        genericName: product.genericName || null,
        batchNumber: batch.batchNumber,
        expirationDate: batch.expiryDate || null,
        quantityDisposed: parsedQuantity,
        reason,
        remarks: remarks ? String(remarks).trim() : "",
        requestedBy: userId,
        requestedByName: requesterDisplayName,
        disposalMethod: disposalMethod || null,
        dateRequested: new Date(),
        status: "Pending",
      },
      session
    );

    batch.status = BATCH_MANUAL_STATUS.PENDING_DISPOSAL;
    batch.lastDisposalReferenceId = referenceId;
    await batch.save(session ? { session } : undefined);

    await ActivityLog.create(
      [
        {
          action: "DISPOSAL_REQUEST_CREATED",
          actionType: "DISPOSAL_REQUEST",
          category: "Inventory",
          actorId: userId,
          actorRole: String(userRole).toUpperCase(),
          performedBy: userId,
          entityType: "DisposalLog",
          entityId: createdLog._id,
          description: `Created disposal request ${referenceId} for ${product.name} (${batch.batchNumber})`,
          details: {
            referenceId,
            itemName: product.name,
            batchNumber: batch.batchNumber,
            quantityDisposed: parsedQuantity,
            reason,
          },
        },
      ],
      session ? { session } : undefined
    );

    return getDisposalLogById(createdLog._id, { session });
  });
};

export const directOwnerDisposal = async ({
  ownerId,
  productId,
  batchId,
  quantityDisposed,
  reason,
  remarks,
  disposalMethod,
  ownerPassword,
}) => {
  return executeWithOptionalTransaction(async (session) => {
    validateRequiredFields(
      {
        ownerId,
        productId,
        batchId,
        quantityDisposed,
        reason,
        ownerPassword,
      },
      ["ownerId", "productId", "batchId", "quantityDisposed", "reason", "ownerPassword"]
    );

    const ownerQuery = User.findById(ownerId);
    getQueryWithSession(ownerQuery, session);
    const owner = await ownerQuery;
    if (!owner || owner.role !== "owner") {
      throw new Error("Owner account not found");
    }

    const passwordMatches = await bcrypt.compare(String(ownerPassword || ""), owner.password);
    if (!passwordMatches) {
      throw new Error("Incorrect password. Disposal cancelled.");
    }

    const parsedQuantity = parsePositiveInteger(quantityDisposed);
    if (!parsedQuantity) {
      throw new Error("Dispose quantity must be a positive integer");
    }

    const batchQuery = InventoryBatch.findById(batchId);
    getQueryWithSession(batchQuery, session);
    const batch = await batchQuery;
    if (!batch) {
      throw new Error("Batch not found");
    }

    if (String(batch.product) !== String(productId)) {
      throw new Error("Batch does not belong to the selected product");
    }

    const effectiveStatus = getBatchEffectiveStatus(batch);
    if ([BATCH_EFFECTIVE_STATUS.PENDING_DISPOSAL, BATCH_EFFECTIVE_STATUS.DISPOSED, BATCH_EFFECTIVE_STATUS.OUT_OF_STOCK].includes(effectiveStatus)) {
      throw new Error("This batch is not eligible for disposal");
    }

    if (parsedQuantity > Number(batch.currentQuantity ?? batch.quantity ?? 0)) {
      throw new Error("Dispose quantity must not exceed the available batch quantity");
    }

    const productQuery = Product.findById(productId).select("_id name genericName");
    getQueryWithSession(productQuery, session);
    const product = await productQuery;
    if (!product) {
      throw new Error("Product not found");
    }

    const existingPendingQuery = OWNER_DisposalLog.findOne({
      batchId: batch._id,
      status: "Pending",
    });
    getQueryWithSession(existingPendingQuery, session);
    const existingPending = await existingPendingQuery;
    if (existingPending) {
      throw new Error("This batch already has a pending disposal request. Approve or reject it first.");
    }

    const referenceId = await generateReferenceId(session);
    const disposedAt = new Date();
    const requesterDisplayName = resolveRequesterDisplayName({
      requesterName: owner?.name,
      requesterEmail: owner?.email,
      requesterAccountId: owner?._id,
      userRole: "OWNER",
    });

    const createdLog = await createDisposalLogEntry(
      {
        referenceId,
        itemId: product._id,
        batchId: batch._id,
        itemName: product.name,
        genericName: product.genericName || null,
        batchNumber: batch.batchNumber,
        expirationDate: batch.expiryDate || null,
        quantityDisposed: parsedQuantity,
        reason,
        remarks: remarks ? String(remarks).trim() : "",
        requestedBy: ownerId,
        requestedByName: requesterDisplayName,
        approvedBy: ownerId,
        disposalMethod: disposalMethod || null,
        dateRequested: disposedAt,
        dateApproved: disposedAt,
        dateDisposed: disposedAt,
        status: "Disposed",
      },
      session
    );

    const beforeQuantity = Number(batch.currentQuantity ?? batch.quantity ?? 0);
    const afterQuantity = beforeQuantity - parsedQuantity;

    batch.currentQuantity = afterQuantity;
    batch.status = afterQuantity <= 0 ? BATCH_MANUAL_STATUS.DISPOSED : BATCH_MANUAL_STATUS.ACTIVE;
    batch.disposedAt = afterQuantity <= 0 ? new Date() : null;
    batch.lastDisposalReferenceId = referenceId;
    await batch.save(session ? { session } : undefined);

    await recalculateProductStock(product._id, session);

    await createStockLog({
      productId: product._id,
      movementType: "DISPOSAL",
      quantityChange: -parsedQuantity,
      performedBy: { userId: ownerId, role: "owner" },
      source: "MANUAL",
      notes: `${reason}${remarks ? ` • ${remarks}` : ""}`,
      batchNumber: batch.batchNumber,
      referenceId,
      session,
    });

    await ActivityLog.create(
      [
        {
          action: "DISPOSAL_COMPLETED",
          actionType: "DISPOSAL_COMPLETED",
          category: "Inventory",
          actorId: ownerId,
          actorRole: "OWNER",
          performedBy: ownerId,
          entityType: "DisposalLog",
          entityId: createdLog._id,
          description: `Directly disposed ${parsedQuantity} unit(s) of ${product.name} from batch ${batch.batchNumber}`,
          details: {
            referenceId,
            itemName: product.name,
            batchNumber: batch.batchNumber,
            quantityDisposed: parsedQuantity,
            beforeQuantity,
            afterQuantity,
            reason,
          },
        },
      ],
      session ? { session } : undefined
    );

    return getDisposalLogById(createdLog._id, { session });
  });
};

export const rejectDisposalRequest = async ({ disposalId, ownerId }) => {
  return executeWithOptionalTransaction(async (session) => {
    const logQuery = OWNER_DisposalLog.findById(disposalId);
    getQueryWithSession(logQuery, session);
    const disposalLog = await logQuery;
    if (!disposalLog) {
      throw new Error("Disposal record not found");
    }

    if (disposalLog.status !== "Pending") {
      throw new Error("Only pending disposal requests can be rejected");
    }

    const batchQuery = InventoryBatch.findById(disposalLog.batchId);
    getQueryWithSession(batchQuery, session);
    const batch = await batchQuery;
    if (batch) {
      const remainingQuantity = Number(batch.currentQuantity ?? batch.quantity ?? 0);
      batch.status = remainingQuantity > 0 ? BATCH_MANUAL_STATUS.ACTIVE : BATCH_MANUAL_STATUS.OUT_OF_STOCK;
      await batch.save(session ? { session } : undefined);
    }

    disposalLog.status = "Rejected";
    disposalLog.dateApproved = null;
    disposalLog.dateDisposed = null;
    disposalLog.approvedBy = null;
    await disposalLog.save(session ? { session } : undefined);

    await ActivityLog.create(
      [
        {
          action: "DISPOSAL_REJECTED",
          actionType: "DISPOSAL_REJECTED",
          category: "Inventory",
          actorId: ownerId,
          actorRole: "OWNER",
          performedBy: ownerId,
          entityType: "DisposalLog",
          entityId: disposalLog._id,
          description: `Rejected disposal request ${disposalLog.referenceId} for ${disposalLog.itemName} (${disposalLog.batchNumber})`,
          details: { referenceId: disposalLog.referenceId },
        },
      ],
      session ? { session } : undefined
    );

    return getDisposalLogById(disposalLog._id, { session });
  });
};

export const approveDisposalRequest = async ({
  disposalId,
  ownerId,
  adminPassword,
}) => {
  return executeWithOptionalTransaction(async (session) => {
    const logQuery = OWNER_DisposalLog.findById(disposalId);
    getQueryWithSession(logQuery, session);
    const disposalLog = await logQuery;
    if (!disposalLog) {
      throw new Error("Disposal record not found");
    }

    if (disposalLog.status !== "Pending") {
      throw new Error("Only pending disposal requests can be approved");
    }

    const ownerQuery = User.findById(ownerId);
    getQueryWithSession(ownerQuery, session);
    const owner = await ownerQuery;
    if (!owner || owner.role !== "owner") {
      throw new Error("Owner account not found");
    }

    const passwordMatches = await bcrypt.compare(String(adminPassword || ""), owner.password);
    if (!passwordMatches) {
      throw new Error("Incorrect password. Approval denied.");
    }

    const batchQuery = InventoryBatch.findById(disposalLog.batchId);
    getQueryWithSession(batchQuery, session);
    const batch = await batchQuery;
    if (!batch) {
      throw new Error("Batch not found");
    }

    if (Number(batch.currentQuantity ?? batch.quantity ?? 0) < Number(disposalLog.quantityDisposed || 0)) {
      throw new Error("Batch quantity is no longer sufficient for this disposal request");
    }

    const beforeQuantity = Number(batch.currentQuantity ?? batch.quantity ?? 0);
    const disposedQuantity = Number(disposalLog.quantityDisposed || 0);
    const afterQuantity = beforeQuantity - disposedQuantity;

    batch.currentQuantity = afterQuantity;
    batch.status = afterQuantity <= 0 ? BATCH_MANUAL_STATUS.DISPOSED : BATCH_MANUAL_STATUS.ACTIVE;
    batch.disposedAt = afterQuantity <= 0 ? new Date() : null;
    batch.lastDisposalReferenceId = disposalLog.referenceId;
    await batch.save(session ? { session } : undefined);

    const product = await recalculateProductStock(disposalLog.itemId, session);

    const approvedAt = new Date();
    disposalLog.status = "Approved";
    disposalLog.approvedBy = ownerId;
    disposalLog.dateApproved = approvedAt;
    disposalLog.dateDisposed = approvedAt;
    await disposalLog.save(session ? { session } : undefined);

    await createStockLog({
      productId: disposalLog.itemId,
      movementType: "DISPOSAL",
      quantityChange: -disposedQuantity,
      performedBy: {
        userId: ownerId,
        role: "owner",
      },
      source: "MANUAL",
      notes: `${disposalLog.reason}${disposalLog.remarks ? ` • ${disposalLog.remarks}` : ""}`,
      batchNumber: disposalLog.batchNumber,
      referenceId: disposalLog.referenceId,
      session,
    });

    await ActivityLog.create(
      [
        {
          action: "DISPOSAL_COMPLETED",
          actionType: "DISPOSAL_COMPLETED",
          category: "Inventory",
          actorId: ownerId,
          actorRole: "OWNER",
          performedBy: ownerId,
          entityType: "DisposalLog",
          entityId: disposalLog._id,
          description: `Disposed ${disposedQuantity} unit(s) of ${product.name} from batch ${disposalLog.batchNumber}`,
          details: {
            referenceId: disposalLog.referenceId,
            itemName: product.name,
            batchNumber: disposalLog.batchNumber,
            quantityDisposed: disposedQuantity,
            beforeQuantity,
            afterQuantity,
            reason: disposalLog.reason,
          },
        },
      ],
      session ? { session } : undefined
    );

    return getDisposalLogById(disposalLog._id, { session });
  });
};