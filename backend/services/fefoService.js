import { getBatchCurrentQuantity, isBatchEligibleForBilling } from "./batchLifecycleService.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const FEFO_RISK = {
  GREEN: "Green",
  YELLOW: "Yellow",
  RED: "Red",
  EXPIRED: "Expired",
  NO_EXPIRY: "NoExpiry",
};

const toStartOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addMonths = (baseDate, months) => {
  const d = new Date(baseDate);
  d.setMonth(d.getMonth() + months);
  return d;
};

const isDateValue = (value) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

export const classifyExpiryRisk = (expiryDate, referenceDate = new Date()) => {
  if (!isDateValue(expiryDate)) {
    return FEFO_RISK.NO_EXPIRY;
  }

  const today = toStartOfDay(referenceDate);
  const expiry = toStartOfDay(expiryDate);

  if (expiry < today) {
    return FEFO_RISK.EXPIRED;
  }

  const threeMonths = addMonths(today, 3);
  const sixMonths = addMonths(today, 6);

  if (expiry < threeMonths) {
    return FEFO_RISK.RED;
  }

  if (expiry <= sixMonths) {
    return FEFO_RISK.YELLOW;
  }

  return FEFO_RISK.GREEN;
};

export const toUiExpiryRiskKey = (riskValue) => {
  switch (riskValue) {
    case FEFO_RISK.GREEN:
      return "safe";
    case FEFO_RISK.YELLOW:
      return "near-expiry";
    case FEFO_RISK.RED:
      return "at-risk";
    case FEFO_RISK.EXPIRED:
      return "expired";
    default:
      return "no-expiry";
  }
};

export const sortBatchesForFefo = (batches, referenceDate = new Date()) => {
  const today = toStartOfDay(referenceDate);

  const eligibleBatches = (Array.isArray(batches) ? batches : []).filter((batch) => {
    const quantity = getBatchCurrentQuantity(batch);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return false;
    }

    if (!isBatchEligibleForBilling(batch, referenceDate)) {
      return false;
    }

    if (!isDateValue(batch?.expiryDate)) {
      return true;
    }

    return toStartOfDay(batch.expiryDate) >= today;
  });

  const withExpiry = eligibleBatches
    .filter((batch) => isDateValue(batch?.expiryDate))
    .sort((a, b) => {
      const expiryDiff = new Date(a.expiryDate) - new Date(b.expiryDate);
      if (expiryDiff !== 0) return expiryDiff;

      const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (createdAtA !== createdAtB) return createdAtA - createdAtB;

      return String(a._id || "").localeCompare(String(b._id || ""));
    });

  const withoutExpiry = eligibleBatches
    .filter((batch) => !isDateValue(batch?.expiryDate))
    .sort((a, b) => {
      const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (createdAtA !== createdAtB) return createdAtA - createdAtB;

      return String(a._id || "").localeCompare(String(b._id || ""));
    });

  return [...withExpiry, ...withoutExpiry];
};

export const buildFefoAllocationPlan = ({ batches, requestedQuantity, referenceDate = new Date() }) => {
  const needed = Number(requestedQuantity);
  if (!Number.isFinite(needed) || needed <= 0 || !Number.isInteger(needed)) {
    throw new Error("requestedQuantity must be a positive integer");
  }

  const orderedBatches = sortBatchesForFefo(batches, referenceDate);

  let remaining = needed;
  const allocations = [];

  for (const batch of orderedBatches) {
    if (remaining <= 0) break;

    const available = getBatchCurrentQuantity(batch);
    if (!Number.isFinite(available) || available <= 0) continue;

    const take = Math.min(available, remaining);
    if (take <= 0) continue;

    allocations.push({
      batchId: batch._id,
      batchNumber: batch.batchNumber || null,
      quantity: take,
      expiryDate: batch.expiryDate || null,
      expiryRisk: classifyExpiryRisk(batch.expiryDate, referenceDate),
    });

    remaining -= take;
  }

  return {
    allocations,
    remaining,
    fulfilled: remaining === 0,
    totalAllocated: needed - remaining,
  };
};

export const getDaysUntilExpiry = (expiryDate, referenceDate = new Date()) => {
  if (!isDateValue(expiryDate)) return null;
  const diff = toStartOfDay(expiryDate) - toStartOfDay(referenceDate);
  return Math.ceil(diff / DAY_MS);
};

export { FEFO_RISK };
