const DAY_MS = 24 * 60 * 60 * 1000;

export const BATCH_MANUAL_STATUS = {
  ACTIVE: "Active",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
  PENDING_DISPOSAL: "Pending Disposal",
  DISPOSED: "Disposed",
  EMPTY: "Empty",
};

export const BATCH_EFFECTIVE_STATUS = {
  ACTIVE: "Active",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
  EXPIRED: "Expired",
  IMMEDIATE_REVIEW: "Immediate Review",
  PENDING_DISPOSAL: "Pending Disposal",
  DISPOSED: "Disposed",
  EMPTY: "Empty",
};

const toStartOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addMonths = (baseDate, months) => {
  const date = new Date(baseDate);
  date.setMonth(date.getMonth() + months);
  return date;
};

export const isDateValue = (value) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const normalizeManualStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "low stock") return BATCH_MANUAL_STATUS.LOW_STOCK;
  if (normalized === "out of stock") return BATCH_MANUAL_STATUS.OUT_OF_STOCK;
  if (normalized === "pending disposal") return BATCH_MANUAL_STATUS.PENDING_DISPOSAL;
  if (normalized === "disposed") return BATCH_MANUAL_STATUS.DISPOSED;
  if (normalized === "empty") return BATCH_MANUAL_STATUS.OUT_OF_STOCK;
  return BATCH_MANUAL_STATUS.ACTIVE;
};

export const getBatchCurrentQuantity = (batch) => {
  const liveQuantity = Number(batch?.currentQuantity);
  if (Number.isFinite(liveQuantity)) {
    return liveQuantity;
  }

  const legacyQuantity = Number(batch?.quantity ?? 0);
  return Number.isFinite(legacyQuantity) ? legacyQuantity : 0;
};

export const getBatchExpiryRisk = (expiryDate, referenceDate = new Date()) => {
  if (!isDateValue(expiryDate)) {
    return "NoExpiry";
  }

  const today = toStartOfDay(referenceDate);
  const expiry = toStartOfDay(expiryDate);

  if (expiry < today) {
    return "Expired";
  }

  const threeMonths = addMonths(today, 3);
  const sixMonths = addMonths(today, 6);

  if (expiry < threeMonths) {
    return "Red";
  }

  if (expiry <= sixMonths) {
    return "Yellow";
  }

  return "Green";
};

export const getBatchEffectiveStatus = (batch, referenceDate = new Date()) => {
  const manualStatus = normalizeManualStatus(batch?.status);
  const quantity = getBatchCurrentQuantity(batch);

  if (quantity <= 0) {
    return manualStatus === BATCH_MANUAL_STATUS.DISPOSED
      ? BATCH_EFFECTIVE_STATUS.DISPOSED
      : BATCH_EFFECTIVE_STATUS.OUT_OF_STOCK;
  }

  if (manualStatus === BATCH_MANUAL_STATUS.PENDING_DISPOSAL) {
    return BATCH_EFFECTIVE_STATUS.PENDING_DISPOSAL;
  }

  const risk = getBatchExpiryRisk(batch?.expiryDate, referenceDate);
  if (risk === "Expired") {
    return BATCH_EFFECTIVE_STATUS.EXPIRED;
  }

  if (risk === "Red") {
    return BATCH_EFFECTIVE_STATUS.IMMEDIATE_REVIEW;
  }

  return BATCH_EFFECTIVE_STATUS.ACTIVE;
};

export const isBatchEligibleForBilling = (batch, referenceDate = new Date()) => {
  const effectiveStatus = getBatchEffectiveStatus(batch, referenceDate);
  return [
    BATCH_EFFECTIVE_STATUS.ACTIVE,
    BATCH_EFFECTIVE_STATUS.IMMEDIATE_REVIEW,
  ].includes(effectiveStatus);
};

export const getBatchLifecycleFlags = (batch, referenceDate = new Date()) => {
  const effectiveStatus = getBatchEffectiveStatus(batch, referenceDate);
  const quantity = getBatchCurrentQuantity(batch);

  return {
    effectiveStatus,
    isSellable: [BATCH_EFFECTIVE_STATUS.ACTIVE, BATCH_EFFECTIVE_STATUS.IMMEDIATE_REVIEW].includes(effectiveStatus),
    canDispose:
      quantity > 0 &&
      ![
        BATCH_EFFECTIVE_STATUS.PENDING_DISPOSAL,
        BATCH_EFFECTIVE_STATUS.DISPOSED,
        BATCH_EFFECTIVE_STATUS.OUT_OF_STOCK,
      ].includes(effectiveStatus),
    isExpired: effectiveStatus === BATCH_EFFECTIVE_STATUS.EXPIRED,
    isImmediateReview: effectiveStatus === BATCH_EFFECTIVE_STATUS.IMMEDIATE_REVIEW,
    isPendingDisposal: effectiveStatus === BATCH_EFFECTIVE_STATUS.PENDING_DISPOSAL,
  };
};

export const getDaysUntilBatchExpiry = (expiryDate, referenceDate = new Date()) => {
  if (!isDateValue(expiryDate)) return null;
  const diff = toStartOfDay(expiryDate) - toStartOfDay(referenceDate);
  return Math.ceil(diff / DAY_MS);
};