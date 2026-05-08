import express from "express";
import { protect } from "../middleware/AuthMiddlewareUser.js";
import env from "../config/env.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";
import PARMS_BillingIntent from "../models/PARMS_billingIntent.js";
import {
  fetchPatientByIdFromPARMS,
  fetchPatientPendingBalancesFromPARMS,
  parmsIntegrationReady,
  searchPatientsByNameFromPARMS,
} from "../services/parmsIntegrationService.js";

const router = express.Router();
const strictLookupEnabled = () => Boolean(env.PARMS_STRICT_PATIENT_LOOKUP);
const OPEN_PAYMENT_STATUS = new Set(["pending", "processing"]);
const OPEN_INVOICE_STATUS = new Set(["draft", "queued", "submitted", "pending", "processing"]);

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toDisplayLabel = (value, fallback = "Other") => {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;

  return normalized
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
};

const toCurrencyAmount = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Number((numeric / 100).toFixed(2));
};

const normalizePendingLine = (line = {}, index = 0) => {
  const sourceType = String(line?.sourceType || "other").trim().toLowerCase();
  const normalizedSourceType = ["laboratory", "prescription"].includes(sourceType)
    ? sourceType
    : "other";

  const origin = String(line?.origin || "parms").trim().toLowerCase() === "intent"
    ? "intent"
    : "parms";

  const amount = Number(line?.amount || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  const hasPositiveAmount = amount > 0;
  const rawObligationKind = String(line?.obligationKind || "").trim().toLowerCase();
  const obligationKind = ["required_service", "optional_prescription", "reference"].includes(rawObligationKind)
    ? rawObligationKind
    : (origin === "parms"
      ? (normalizedSourceType === "prescription" ? "optional_prescription" : "required_service")
      : (normalizedSourceType === "prescription"
        ? (hasPositiveAmount ? "optional_prescription" : "reference")
        : (hasPositiveAmount ? "required_service" : "reference")));

  const defaultLabel = normalizedSourceType === "laboratory"
    ? "Laboratory"
    : normalizedSourceType === "prescription"
      ? "Prescription"
      : "Other";
  const sourceLabel = toDisplayLabel(line?.sourceLabel, defaultLabel);

  const referenceId = String(line?.referenceId || line?.lineId || `pending-${index + 1}`).trim();
  const description = String(line?.description || "Pending balance").trim() || "Pending balance";

  return {
    sourceType: normalizedSourceType,
    sourceLabel,
    referenceId,
    description,
    origin,
    obligationKind,
    serviceCode: String(line?.serviceCode || line?.parmsServiceCode || "").trim() || null,
    quantity: Math.max(1, Number(line?.quantity || line?.qty || 1) || 1),
    amount: Number(amount.toFixed(2)),
  };
};

const mergePendingLines = (baseLines = [], intentLines = []) => {
  const merged = [];
  const seen = new Set();
  const indexByKey = new Map();
  const obligationPriority = {
    reference: 0,
    optional_prescription: 1,
    required_service: 2,
  };

  for (const candidate of [...baseLines, ...intentLines]) {
    const normalized = normalizePendingLine(candidate, merged.length);
    if (!normalized) continue;

    const dedupeKey = [
      normalized.sourceType,
      String(normalized.referenceId || "").toLowerCase(),
      String(normalized.description || "").toLowerCase(),
    ].join("::");

    if (seen.has(dedupeKey)) {
      const existingIndex = indexByKey.get(dedupeKey);
      if (existingIndex === undefined) continue;

      const existing = merged[existingIndex];
      const existingPriority = obligationPriority[String(existing?.obligationKind || "reference")] ?? 0;
      const normalizedPriority = obligationPriority[String(normalized?.obligationKind || "reference")] ?? 0;
      const shouldPromoteIntent =
        existing?.origin !== "intent" &&
        normalized.origin === "intent" &&
        normalizedPriority >= existingPriority;
      if (!shouldPromoteIntent) continue;

      merged[existingIndex] = {
        ...existing,
        ...normalized,
        amount: Math.max(Number(existing?.amount || 0), Number(normalized?.amount || 0)),
      };
      continue;
    }

    seen.add(dedupeKey);
    indexByKey.set(dedupeKey, merged.length);
    merged.push(normalized);
  }

  return merged;
};

const buildPatientSelectors = (patientId) => {
  const escaped = escapeRegex(patientId);
  return [
    { "patient.parmsPatientId": { $regex: `^${escaped}$`, $options: "i" } },
    { "patient.externalPatientCode": { $regex: `^${escaped}$`, $options: "i" } },
  ];
};

const isIntentOpen = (intent) => {
  const paymentStatus = String(intent?.paymentStatus || "").toLowerCase();
  const invoiceStatus = String(intent?.invoiceStatus || "").toLowerCase();
  return OPEN_PAYMENT_STATUS.has(paymentStatus) && OPEN_INVOICE_STATUS.has(invoiceStatus);
};

const findIntentContextByPatientId = async (patientId) => {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) return null;

  const selector = { $or: buildPatientSelectors(normalizedPatientId) };

  const projection = [
    "intentId",
    "paymentStatus",
    "invoiceStatus",
    "serviceLines",
    "prescriptionLines",
    "updatedAt",
    "createdAt",
  ].join(" ");

  const openIntent = await PARMS_BillingIntent.findOne({
    ...selector,
    paymentStatus: { $in: [...OPEN_PAYMENT_STATUS] },
    invoiceStatus: { $in: [...OPEN_INVOICE_STATUS] },
  })
    .sort({ submittedAt: 1, createdAt: 1 })
    .select(projection)
    .lean();

  if (openIntent) {
    return {
      intent: openIntent,
      isOpen: true,
    };
  }

  const latestIntent = await PARMS_BillingIntent.findOne(selector)
    .sort({ updatedAt: -1, createdAt: -1 })
    .select(projection)
    .lean();

  if (!latestIntent) return null;

  return {
    intent: latestIntent,
    isOpen: isIntentOpen(latestIntent),
  };
};

const buildIntentPendingLines = (intentContext) => {
  const intent = intentContext?.intent;
  if (!intent) return [];

  // Closed intents should not surface actionable obligations in billing lookup.
  if (!intentContext?.isOpen) {
    return [];
  }

  const amountForLine = (minorUnits) => toCurrencyAmount(minorUnits);

  const serviceLines = (Array.isArray(intent.serviceLines) ? intent.serviceLines : []).map((line, index) => {
    const rawServiceType = String(line?.serviceType || "").trim();
    const normalizedServiceType = rawServiceType.toLowerCase();
    const sourceType = normalizedServiceType.includes("lab") ? "laboratory" : "other";
    const sourceLabel = toDisplayLabel(rawServiceType, sourceType === "laboratory" ? "Laboratory" : "Service");
    const metadataTestName = typeof line?.metadata?.test_name === "string" ? line.metadata.test_name.trim() : "";
    const metadataDescription = typeof line?.metadata?.description === "string" ? line.metadata.description.trim() : "";
    const serviceTypeDescription = toDisplayLabel(rawServiceType, "");
    const parmsServiceCode = String(line?.parmsServiceCode || "").trim();
    const serviceLabel = sourceType === "laboratory"
      ? (metadataTestName || metadataDescription || serviceTypeDescription || parmsServiceCode || "Laboratory service")
      : (serviceTypeDescription || metadataDescription || parmsServiceCode || "Service line");
    const amount = amountForLine(line?.totalMinor);

    return {
      sourceType,
      sourceLabel,
      referenceId: String(line?.lineId || `svc-${index + 1}`).trim(),
      description: serviceLabel,
      origin: "intent",
      obligationKind: "required_service",
      serviceCode: parmsServiceCode || null,
      quantity: Math.max(1, Number(line?.quantity || 1) || 1),
      amount,
    };
  });

  const prescriptionLines = (Array.isArray(intent.prescriptionLines) ? intent.prescriptionLines : []).map((line, index) => {
    const medicationName = String(line?.medicationName || line?.genericName || "Prescription").trim();
    const dosage = String(line?.dosage || "").trim();
    const frequency = String(line?.frequency || "").trim();
    const descriptor = [medicationName, dosage, frequency].filter(Boolean).join(" - ");
    const amount = amountForLine(line?.totalMinor);

    return {
      sourceType: "prescription",
      sourceLabel: "Prescription",
      referenceId: String(line?.rxId || `rx-${index + 1}`).trim(),
      description: descriptor || "Prescription",
      origin: "intent",
      obligationKind: "optional_prescription",
      serviceCode: null,
      quantity: Math.max(1, Number(line?.quantity || 1) || 1),
      amount,
    };
  });

  return mergePendingLines(serviceLines, prescriptionLines);
};

const toIntentMeta = (intentContext) => {
  if (!intentContext?.intent) return null;

  return {
    intentId: intentContext.intent.intentId || null,
    paymentStatus: intentContext.intent.paymentStatus || null,
    invoiceStatus: intentContext.intent.invoiceStatus || null,
    isOpen: Boolean(intentContext.isOpen),
    updatedAt: intentContext.intent.updatedAt || intentContext.intent.createdAt || null,
  };
};

const sumPendingBalances = (pendingBalances = []) => {
  return Number(
    (Array.isArray(pendingBalances) ? pendingBalances : [])
      .reduce((sum, line) => sum + Number(line?.amount || 0), 0)
      .toFixed(2)
  );
};

const findLocalPatientById = async (patientId) => {
  const transaction = await STAFF_BillingTransaction.findOne({
    patientId: { $regex: `^${escapeRegex(patientId)}$`, $options: "i" },
    patientName: { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .select("patientId patientName")
    .lean();

  if (!transaction) return null;

  return {
    patientId: transaction.patientId,
    patientName: transaction.patientName,
  };
};

const findIntentPatientById = async (patientId) => {
  const intent = await PARMS_BillingIntent.findOne({
    $or: [
      { "patient.parmsPatientId": { $regex: `^${escapeRegex(patientId)}$`, $options: "i" } },
      { "patient.externalPatientCode": { $regex: `^${escapeRegex(patientId)}$`, $options: "i" } },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("patient")
    .lean();

  if (!intent) return null;

  const resolvedPatientId = String(intent?.patient?.parmsPatientId || intent?.patient?.externalPatientCode || "").trim();
  const resolvedPatientName = String(intent?.patient?.fullName || "").trim();
  if (!resolvedPatientId || !resolvedPatientName) {
    return null;
  }

  return {
    patientId: resolvedPatientId,
    patientName: resolvedPatientName,
  };
};

const findLocalPatientsByName = async (patientName) => {
  const rows = await STAFF_BillingTransaction.find({
    patientName: { $regex: escapeRegex(patientName), $options: "i" },
    patientId: { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .select("patientId patientName")
    .lean();

  const intentRows = await PARMS_BillingIntent.find({
    "patient.fullName": { $regex: escapeRegex(patientName), $options: "i" },
    $or: [
      { "patient.parmsPatientId": { $exists: true, $ne: "" } },
      { "patient.externalPatientCode": { $exists: true, $ne: "" } },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("patient")
    .lean();

  const deduped = [];
  const seen = new Set();

  for (const row of rows) {
    const key = `${String(row.patientId || "").toLowerCase()}::${String(row.patientName || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      patientId: row.patientId,
      patientName: row.patientName,
    });
  }

  for (const row of intentRows) {
    const resolvedPatientId = String(row?.patient?.parmsPatientId || row?.patient?.externalPatientCode || "").trim();
    const resolvedPatientName = String(row?.patient?.fullName || "").trim();
    if (!resolvedPatientId || !resolvedPatientName) continue;

    const key = `${resolvedPatientId.toLowerCase()}::${resolvedPatientName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      patientId: resolvedPatientId,
      patientName: resolvedPatientName,
    });
  }

  return deduped;
};

router.get("/search", protect, async (req, res) => {
  try {
    const patientName = String(req.query.name || "").trim();
    if (!patientName) {
      return res.status(400).json({ message: "Patient name is required" });
    }

    if (strictLookupEnabled() && !parmsIntegrationReady()) {
      return res.status(503).json({ message: "PARMS integration is required for patient lookup" });
    }

    let matches = [];

    if (parmsIntegrationReady()) {
      try {
        matches = await searchPatientsByNameFromPARMS(patientName);
      } catch (error) {
        if (strictLookupEnabled()) {
          return res.status(502).json({ message: error.message || "PARMS lookup failed" });
        }
        matches = [];
      }
    }

    if (!Array.isArray(matches) || matches.length === 0) {
      if (strictLookupEnabled()) {
        return res.status(404).json({ message: "Patient not found" });
      }
      matches = await findLocalPatientsByName(patientName);
    }

    if (!matches.length) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const exactMatch = matches.find((row) => String(row.patientName || "").toLowerCase() === patientName.toLowerCase());
    const selected = exactMatch || matches[0];

    let pendingBalances = [];
    if (parmsIntegrationReady()) {
      try {
        pendingBalances = await fetchPatientPendingBalancesFromPARMS(selected.patientId);
      } catch (error) {
        if (strictLookupEnabled()) {
          return res.status(502).json({ message: error.message || "PARMS pending balances lookup failed" });
        }
        pendingBalances = [];
      }
    }

    const intentContext = await findIntentContextByPatientId(selected.patientId);
    const intentLines = buildIntentPendingLines(intentContext);
    const mergedPendingBalances = mergePendingLines(pendingBalances, intentLines);
    const pendingBalanceTotal = sumPendingBalances(mergedPendingBalances);

    return res.status(200).json({
      data: {
        patientId: selected.patientId,
        patientName: selected.patientName,
        matches,
        pendingBalances: mergedPendingBalances,
        pendingBalanceTotal,
        parmsIntent: toIntentMeta(intentContext),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to search patient" });
  }
});

router.get("/:patientId/balances", protect, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ message: "Patient ID is required" });
    }

    if (strictLookupEnabled() && !parmsIntegrationReady()) {
      return res.status(503).json({ message: "PARMS integration is required for pending balances lookup" });
    }

    let pendingBalances = [];
    if (parmsIntegrationReady()) {
      try {
        pendingBalances = await fetchPatientPendingBalancesFromPARMS(patientId);
      } catch (error) {
        if (strictLookupEnabled()) {
          return res.status(502).json({ message: error.message || "PARMS pending balances lookup failed" });
        }
        pendingBalances = [];
      }
    }

    const intentContext = await findIntentContextByPatientId(patientId);
    const intentLines = buildIntentPendingLines(intentContext);
    const mergedPendingBalances = mergePendingLines(pendingBalances, intentLines);

    return res.status(200).json({
      data: {
        patientId,
        pendingBalances: mergedPendingBalances,
        pendingBalanceTotal: sumPendingBalances(mergedPendingBalances),
        parmsIntent: toIntentMeta(intentContext),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch pending balances" });
  }
});

router.get("/:patientId", protect, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ message: "Patient ID is required" });
    }

    if (strictLookupEnabled() && !parmsIntegrationReady()) {
      return res.status(503).json({ message: "PARMS integration is required for patient lookup" });
    }

    let patient = null;
    if (parmsIntegrationReady()) {
      try {
        patient = await fetchPatientByIdFromPARMS(patientId);
      } catch (error) {
        if (strictLookupEnabled()) {
          return res.status(502).json({ message: error.message || "PARMS patient lookup failed" });
        }
        patient = null;
      }
    }

    if (!patient) {
      if (strictLookupEnabled()) {
        return res.status(404).json({ message: "Patient not found" });
      }
      patient = await findLocalPatientById(patientId);
      if (!patient) {
        patient = await findIntentPatientById(patientId);
      }
    }

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    let pendingBalances = [];
    if (parmsIntegrationReady()) {
      try {
        pendingBalances = await fetchPatientPendingBalancesFromPARMS(patient.patientId);
      } catch (error) {
        if (strictLookupEnabled()) {
          return res.status(502).json({ message: error.message || "PARMS pending balances lookup failed" });
        }
        pendingBalances = [];
      }
    }

    const intentContext = await findIntentContextByPatientId(patient.patientId);
    const intentLines = buildIntentPendingLines(intentContext);
    const mergedPendingBalances = mergePendingLines(pendingBalances, intentLines);

    return res.status(200).json({
      data: {
        patientId: patient.patientId,
        patientName: patient.patientName,
        pendingBalances: mergedPendingBalances,
        pendingBalanceTotal: sumPendingBalances(mergedPendingBalances),
        parmsIntent: toIntentMeta(intentContext),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch patient" });
  }
});

export default router;
