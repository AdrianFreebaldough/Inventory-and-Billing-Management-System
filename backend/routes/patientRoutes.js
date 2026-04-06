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

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

    const pendingBalanceTotal = sumPendingBalances(pendingBalances);

    return res.status(200).json({
      data: {
        patientId: selected.patientId,
        patientName: selected.patientName,
        matches,
        pendingBalances,
        pendingBalanceTotal,
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

    return res.status(200).json({
      data: {
        patientId,
        pendingBalances,
        pendingBalanceTotal: sumPendingBalances(pendingBalances),
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

    return res.status(200).json({
      data: {
        patientId: patient.patientId,
        patientName: patient.patientName,
        pendingBalances,
        pendingBalanceTotal: sumPendingBalances(pendingBalances),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch patient" });
  }
});

export default router;
