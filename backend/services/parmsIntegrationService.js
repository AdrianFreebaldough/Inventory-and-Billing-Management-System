import crypto from "crypto";
import env from "../config/env.js";
import logger from "../utils/logger.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_SYNC_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [3000, 10000, 30000, 60000, 180000];

let syncWorkerTimer = null;
let syncWorkerRunning = false;

const hasParmsConfig = () => Boolean(env.PARMS_API_BASE_URL);

const normalizeBaseUrl = (value) => String(value || "").replace(/\/+$/, "");

const buildUrl = (pathValue, query = {}) => {
  const baseUrl = normalizeBaseUrl(env.PARMS_API_BASE_URL);
  const normalizedPath = String(pathValue || "").startsWith("/") ? String(pathValue || "") : `/${String(pathValue || "")}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const asString = String(value).trim();
    if (!asString) return;
    url.searchParams.set(key, asString);
  });

  return url;
};

const withPathParams = (template, params = {}) => {
  let nextPath = String(template || "");
  Object.entries(params).forEach(([key, value]) => {
    nextPath = nextPath.replace(`{${key}}`, encodeURIComponent(String(value ?? "")));
  });
  return nextPath;
};

const parseJsonSafe = async (response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const buildHeaders = (extraHeaders = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (env.PARMS_API_TOKEN) {
    headers.Authorization = `Bearer ${env.PARMS_API_TOKEN}`;
  }

  return headers;
};

const parmsRequest = async ({
  path,
  method = "GET",
  query,
  body,
  rawBody,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers,
}) => {
  if (!hasParmsConfig()) {
    throw new Error("PARMS API is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestBody = rawBody !== undefined
    ? rawBody
    : (body === undefined ? undefined : JSON.stringify(body));

  try {
    const response = await fetch(buildUrl(path, query), {
      method,
      headers: buildHeaders(headers),
      body: requestBody,
      signal: controller.signal,
    });

    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      const message = payload?.message || `PARMS request failed (${response.status})`;
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeAmount = (raw) => {
  if (!raw || typeof raw !== "object") return 0;

  if (raw.amount !== undefined && raw.amount !== null) {
    const parsed = Number(raw.amount);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (raw.amountMinor !== undefined && raw.amountMinor !== null) {
    const parsedMinor = Number(raw.amountMinor);
    if (!Number.isFinite(parsedMinor)) return 0;
    return Number(parsedMinor / 100);
  }

  return 0;
};

const normalizePendingLine = (entry, fallbackIndex = 0) => {
  const sourceType = String(
    entry?.sourceType || entry?.type || entry?.category || entry?.serviceType || "other"
  )
    .trim()
    .toLowerCase();

  const normalizedSourceType = ["laboratory", "prescription"].includes(sourceType)
    ? sourceType
    : "other";

  const amount = normalizeAmount(entry);
  const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};

  const metadataTestName = String(metadata?.test_name || metadata?.testName || "").trim();
  const metadataDescription = String(metadata?.description || "").trim();
  const sourceLabel = String(entry?.sourceLabel || entry?.serviceType || entry?.type || "").trim();

  const descriptionCandidates = normalizedSourceType === "laboratory"
    ? [
      metadataTestName,
      String(entry?.description || "").trim(),
      String(entry?.name || "").trim(),
      String(entry?.label || "").trim(),
      metadataDescription,
    ]
    : [
      String(entry?.description || "").trim(),
      String(entry?.name || "").trim(),
      String(entry?.label || "").trim(),
      metadataDescription,
      metadataTestName,
    ];

  const description = descriptionCandidates.find((value) => Boolean(value)) || "Pending balance";

  return {
    sourceType: normalizedSourceType,
    referenceId: String(entry?.referenceId || entry?.lineId || entry?.id || `line-${fallbackIndex + 1}`),
    sourceLabel,
    serviceCode: String(entry?.serviceCode || entry?.parmsServiceCode || "").trim() || null,
    description,
    amount: Number(amount.toFixed(2)),
  };
};

const pickPendingLines = (payload) => {
  const candidates = [
    payload?.data?.pendingBalances,
    payload?.data?.pending_lines,
    payload?.pendingBalances,
    payload?.pending_lines,
    payload?.data?.balances,
    payload?.balances,
  ];

  const lines = candidates.find((value) => Array.isArray(value)) || [];
  return lines
    .map((entry, index) => normalizePendingLine(entry, index))
    .filter((line) => Number.isFinite(line.amount) && line.amount > 0);
};

const normalizePatient = (entry = {}) => {
  const patientId = String(
    entry.patientId ||
      entry.patient_id ||
      entry.parms_patient_id ||
      entry.external_patient_code ||
      entry.id ||
      ""
  ).trim();
  const patientName = String(
    entry.patientName ||
      entry.patient_name ||
      entry.name ||
      entry.fullName ||
      ""
  ).trim();

  if (!patientId || !patientName) {
    return null;
  }

  return {
    patientId,
    patientName,
  };
};

const extractPatients = (payload) => {
  const candidates = [
    payload?.data?.patients,
    payload?.patients,
    payload?.data?.results,
    payload?.results,
    payload?.data,
  ];

  const list = candidates.find((value) => Array.isArray(value)) || [];
  return list
    .map((entry) => normalizePatient(entry))
    .filter(Boolean);
};

const toMinorUnits = (amount) => {
  const parsed = Number(amount || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
};

const buildReceiptPayload = (transaction) => {
  const snapshot = transaction?.receiptSnapshot;
  if (!snapshot) return null;

  return {
    receiptNumber: snapshot.receiptNumber || null,
    clinicName: snapshot.clinic?.name || null,
    transactionDateTime: snapshot.transactionDateTime
      ? new Date(snapshot.transactionDateTime).toISOString()
      : null,
    patientId: snapshot.patientId || transaction.patientId || null,
    patientName: snapshot.patientName || transaction.patientName || null,
    staffId: snapshot.staffId ? String(snapshot.staffId) : String(transaction.staffId || ""),
    subtotalMinor: toMinorUnits(snapshot.subtotal),
    discountMinor: toMinorUnits(snapshot.discountAmount),
    vatMinor: toMinorUnits(snapshot.vatAmount),
    totalAmountMinor: toMinorUnits(snapshot.totalAmount),
    cashReceivedMinor: toMinorUnits(snapshot.cashReceived),
    changeMinor: toMinorUnits(snapshot.change),
    pendingBalanceTotalMinor: toMinorUnits(snapshot.pendingBalanceTotal),
    items: (snapshot.items || []).map((item) => ({
      productId: item.productId ? String(item.productId) : null,
      name: item.name || null,
      quantity: Number(item.quantity || 0),
      unitPriceMinor: toMinorUnits(item.unitPrice),
      lineTotalMinor: toMinorUnits(item.lineTotal),
      batchAllocations: (item.batchAllocations || []).map((allocation) => ({
        batchId: allocation.batchId ? String(allocation.batchId) : null,
        batchNumber: allocation.batchNumber || null,
        quantity: Number(allocation.quantity || 0),
        expiryDate: allocation.expiryDate ? new Date(allocation.expiryDate).toISOString() : null,
        expiryRisk: allocation.expiryRisk || null,
      })),
    })),
    pendingBalances: (snapshot.pendingBalances || []).map((line) => ({
      sourceType: line.sourceType || null,
      referenceId: line.referenceId || null,
      description: line.description || null,
      amountMinor: toMinorUnits(line.amount),
    })),
  };
};

const buildSyncPayload = (transaction) => {
  const paidAtIso = transaction.completedAt
    ? new Date(transaction.completedAt).toISOString()
    : new Date().toISOString();
  const processedAtIso = transaction.completedAt
    ? new Date(transaction.completedAt).toISOString()
    : paidAtIso;

  const totalAmountMinor = toMinorUnits(transaction.totalAmount || 0);
  const externalBillingId = String(transaction.parmsIntentId || transaction._id);
  const invoiceNumber = transaction.parmsInvoiceNumber || transaction.receiptSnapshot?.receiptNumber || null;
  const ibmsReference = transaction.parmsInvoiceReference || transaction.receiptSnapshot?.receiptNumber || String(transaction._id);
  const receiptNumber = transaction.receiptSnapshot?.receiptNumber || invoiceNumber || null;
  const receipt = buildReceiptPayload(transaction);

  return {
    billingId: externalBillingId,
    intentId: transaction.parmsIntentId || null,
    invoiceNumber,
    ibmsReference,
    receiptNumber,
    status: "paid",
    ibmsStatus: "synced",
    errorMessage: null,
    paidAt: paidAtIso,
    processedAt: processedAtIso,
    totalAmountMinor,
    amountPaidMinor: totalAmountMinor,
    balanceDueMinor: 0,
    currency: env.PARMS_SYNC_CURRENCY || "PHP",
    receipt,
    receiptSnapshot: transaction.receiptSnapshot || null,
  };
};

const buildSyncHeaders = ({ payloadString, correlationId, eventId, billingId }) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = {
    "X-IBMS-Timestamp": String(timestamp),
    "X-IBMS-Event-Id": eventId,
    "X-Correlation-Id": correlationId,
    "X-Idempotency-Key": `PARMS-BILLING-${billingId}-v1`,
  };

  if (env.PARMS_IBMS_TOKEN) {
    headers["X-IBMS-Token"] = env.PARMS_IBMS_TOKEN;
  }

  if (env.PARMS_SYNC_SIGNING_SECRET) {
    const signature = crypto
      .createHmac("sha256", env.PARMS_SYNC_SIGNING_SECRET)
      .update(payloadString)
      .digest("hex");
    headers["X-IBMS-Signature"] = signature;
  }

  return headers;
};

const getRetryDelay = (attempt) => {
  if (attempt <= 1) return RETRY_DELAYS_MS[0];
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
};

const isRetryableSyncError = (error) => {
  const statusCode = Number(error?.statusCode || 0);
  if (!statusCode) {
    return true;
  }

  if ([400, 401, 409].includes(statusCode)) {
    return false;
  }

  if ([408, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  if (statusCode === 404) {
    return Boolean(env.PARMS_SYNC_RETRY_404);
  }

  return false;
};

const markSyncAsFailed = async ({ transaction, attempt, error }) => {
  const canRetry =
    attempt < MAX_SYNC_ATTEMPTS &&
    !String(error.message || "").includes("not configured") &&
    isRetryableSyncError(error);
  const nextRetryAt = canRetry ? new Date(Date.now() + getRetryDelay(attempt + 1)) : null;

  await STAFF_BillingTransaction.updateOne(
    { _id: transaction._id },
    {
      $set: {
        parmsSyncStatus: "FAILED",
        parmsSyncAttempts: attempt,
        parmsLastSyncError: String(error.message || "PARMS sync failed").slice(0, 800),
        parmsNextRetryAt: nextRetryAt,
      },
    }
  );

  logger.warn("PARMS sync attempt failed", {
    transactionId: String(transaction._id),
    attempt,
    error: error.message,
    nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null,
  });
};

const executeTransactionSyncAttempt = async (transactionId, attempt = 1) => {
  const transaction = await STAFF_BillingTransaction.findById(transactionId);
  if (!transaction) {
    logger.warn("PARMS sync skipped because transaction was not found", { transactionId: String(transactionId) });
    return false;
  }

  if (transaction.status !== "COMPLETED") {
    logger.warn("PARMS sync skipped because transaction is not completed", {
      transactionId: String(transactionId),
      status: transaction.status,
    });
    return false;
  }

  if (attempt > MAX_SYNC_ATTEMPTS) {
    await STAFF_BillingTransaction.updateOne(
      { _id: transaction._id },
      {
        $set: {
          parmsSyncStatus: "FAILED",
          parmsLastSyncError: "Max PARMS sync attempts reached",
          parmsNextRetryAt: null,
        },
      }
    );
    return false;
  }

  const correlationId = `ibms-sync-${transaction._id}-${Date.now()}`;
  const eventId = `evt-${crypto.randomUUID()}`;

  await STAFF_BillingTransaction.updateOne(
    { _id: transaction._id },
    {
      $set: {
        parmsSyncStatus: "SYNCING",
        parmsSyncAttempts: Math.max(Number(transaction.parmsSyncAttempts || 0), attempt - 1),
        parmsLastSyncCorrelationId: correlationId,
        parmsLastSyncEventId: eventId,
      },
    }
  );

  try {
    if (!hasParmsConfig()) {
      throw new Error("PARMS API is not configured");
    }

    const payload = buildSyncPayload(transaction);
    const payloadString = JSON.stringify(payload);
    const headers = buildSyncHeaders({
      payloadString,
      correlationId,
      eventId,
      billingId: String(transaction._id),
    });

    await parmsRequest({
      path: env.PARMS_TRANSACTION_SYNC_PATH,
      method: "PATCH",
      headers,
      rawBody: payloadString,
    });

    await STAFF_BillingTransaction.updateOne(
      { _id: transaction._id },
      {
        $set: {
          parmsSyncStatus: "SYNCED",
          parmsSyncAttempts: attempt,
          parmsLastSyncAt: new Date(),
          parmsLastSyncError: null,
          parmsNextRetryAt: null,
        },
      }
    );

    return true;
  } catch (error) {
    await markSyncAsFailed({ transaction, attempt, error });
    return false;
  }
};

const shouldProcessRecord = (record, now, staleSyncCutoff) => {
  if (!record.parmsSyncStatus || record.parmsSyncStatus === "NOT_QUEUED") {
    return true;
  }

  if (record.parmsSyncStatus === "PENDING") {
    return !record.parmsNextRetryAt || record.parmsNextRetryAt <= now;
  }

  if (record.parmsSyncStatus === "FAILED") {
    return Boolean(record.parmsNextRetryAt) && record.parmsNextRetryAt <= now;
  }

  if (record.parmsSyncStatus === "SYNCING") {
    return record.updatedAt <= staleSyncCutoff;
  }

  return false;
};

export const runParmsSyncSweep = async ({ limit = 25 } = {}) => {
  if (!hasParmsConfig()) {
    return { processed: 0, synced: 0, failed: 0, skipped: 0, reason: "PARMS API is not configured" };
  }

  const now = new Date();
  const staleSyncCutoff = new Date(Date.now() - 2 * 60 * 1000);

  const candidates = await STAFF_BillingTransaction.find({
    status: "COMPLETED",
    $or: [
      { parmsSyncStatus: { $in: ["PENDING", "FAILED", "SYNCING", "NOT_QUEUED"] } },
      { parmsSyncStatus: { $exists: false } },
      { parmsSyncStatus: null },
    ],
  })
    .sort({ completedAt: 1, updatedAt: 1 })
    .limit(limit)
    .select("_id parmsSyncStatus parmsSyncAttempts parmsNextRetryAt updatedAt")
    .lean();

  let processed = 0;
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const shouldProcess = shouldProcessRecord(candidate, now, staleSyncCutoff);
    if (!shouldProcess) {
      skipped += 1;
      continue;
    }

    const nextAttempt = Number(candidate.parmsSyncAttempts || 0) + 1;
    processed += 1;
    const ok = await executeTransactionSyncAttempt(candidate._id, nextAttempt);
    if (ok) {
      synced += 1;
    } else {
      failed += 1;
    }
  }

  return { processed, synced, failed, skipped };
};

export const queueCompletedTransactionSync = async (transactionId) => {
  const transaction = await STAFF_BillingTransaction.findById(transactionId)
    .select("_id parmsSyncStatus");
  if (!transaction) return;

  if (transaction.parmsSyncStatus === "SYNCED") return;

  await STAFF_BillingTransaction.updateOne(
    { _id: transaction._id },
    {
      $set: {
        parmsSyncStatus: "PENDING",
        parmsLastSyncError: null,
        parmsNextRetryAt: new Date(),
      },
    }
  );
};

export const syncCompletedTransactionReceiptToPARMS = async (transactionId) => {
  const transaction = await STAFF_BillingTransaction.findById(transactionId)
    .select("_id status parmsSyncStatus parmsSyncAttempts");

  if (!transaction || transaction.status !== "COMPLETED") {
    return false;
  }

  if (transaction.parmsSyncStatus !== "SYNCED") {
    await STAFF_BillingTransaction.updateOne(
      { _id: transaction._id },
      {
        $set: {
          parmsSyncStatus: "PENDING",
          parmsLastSyncError: null,
          parmsNextRetryAt: new Date(),
        },
      }
    );
  }

  const nextAttempt = Math.max(1, Number(transaction.parmsSyncAttempts || 0) + 1);
  return executeTransactionSyncAttempt(transaction._id, nextAttempt);
};

export const startParmsSyncWorker = () => {
  if (!env.PARMS_SYNC_WORKER_ENABLED) {
    logger.info("PARMS sync worker disabled by configuration");
    return;
  }

  if (syncWorkerTimer) {
    return;
  }

  const intervalMs = Math.max(Number(env.PARMS_SYNC_WORKER_INTERVAL_MS || 15000), 5000);

  const run = async () => {
    if (syncWorkerRunning) return;
    syncWorkerRunning = true;
    try {
      const summary = await runParmsSyncSweep();
      if (summary.processed > 0 || summary.synced > 0 || summary.failed > 0) {
        logger.info("PARMS sync worker cycle complete", summary);
      }
    } catch (error) {
      logger.error("PARMS sync worker cycle failed", {
        errorMessage: error.message,
      });
    } finally {
      syncWorkerRunning = false;
    }
  };

  run().catch(() => {
    // startup run errors are logged in run()
  });

  syncWorkerTimer = setInterval(() => {
    run().catch(() => {
      // interval errors are logged in run()
    });
  }, intervalMs);

  logger.info("PARMS sync worker started", { intervalMs });
};

export const stopParmsSyncWorker = () => {
  if (!syncWorkerTimer) return;
  clearInterval(syncWorkerTimer);
  syncWorkerTimer = null;
  syncWorkerRunning = false;
};

export const searchPatientsByNameFromPARMS = async (name) => {
  const queryName = String(name || "").trim();
  if (!queryName) return [];

  const payload = await parmsRequest({
    path: env.PARMS_PATIENT_SEARCH_PATH,
    method: "GET",
    query: { name: queryName },
  });

  const patients = extractPatients(payload);
  return patients;
};

export const fetchPatientByIdFromPARMS = async (patientId) => {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) {
    throw new Error("Patient ID is required");
  }

  const path = withPathParams(env.PARMS_PATIENT_DETAILS_PATH, {
    patientId: normalizedPatientId,
  });

  const payload = await parmsRequest({
    path,
    method: "GET",
  });

  const patient = normalizePatient(payload?.data || payload);
  if (!patient) {
    throw new Error("PARMS patient response is missing required fields");
  }

  return patient;
};

export const fetchPatientPendingBalancesFromPARMS = async (patientId) => {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) return [];

  const path = withPathParams(env.PARMS_PATIENT_BALANCES_PATH, {
    patientId: normalizedPatientId,
  });

  const payload = await parmsRequest({
    path,
    method: "GET",
  });

  return pickPendingLines(payload);
};

export const parmsIntegrationReady = () => hasParmsConfig();
