import crypto from "crypto";
import PARMS_BillingIntent from "../models/PARMS_billingIntent.js";

const SUPPORTED_INVOICE_STATUS = new Set([
  "draft",
  "queued",
  "submitted",
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);

const SUPPORTED_PAYMENT_STATUS = new Set([
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);

const STATUS_NORMALIZATION = {
  pending: "pending",
  queued: "pending",
  processing: "processing",
  in_progress: "processing",
  paid: "paid",
  completed: "paid",
  failed: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
  refunded: "refunded",
};

const toNonEmptyString = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIntegerMinor = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};

const amountMajorToMinor = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed * 100));
};

const resolveMinorValue = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") continue;

    if (String(candidate).includes(".")) {
      const fromMajor = amountMajorToMinor(candidate);
      if (fromMajor !== null) return fromMajor;
    }

    const asInteger = Number(candidate);
    if (Number.isFinite(asInteger)) {
      return Math.max(0, Math.round(asInteger));
    }
  }

  return 0;
};

const buildHash = (payload) => {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex");
};

const parseRevisionFromIdempotencyKey = (idempotencyKey) => {
  const normalized = toNonEmptyString(idempotencyKey);
  if (!normalized) return 1;

  const match = normalized.match(/-v(\d+)$/i);
  if (!match) return 1;

  return Math.max(1, Number(match[1] || 1));
};

const slugFromIntentId = (intentId) => {
  const hash = crypto
    .createHash("sha1")
    .update(String(intentId))
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();

  return hash;
};

const deriveInvoiceIdentity = (intentId) => {
  const slug = slugFromIntentId(intentId);
  return {
    ibmsReference: `IBMS-REF-${slug}`,
    ibmsInvoiceNumber: `IBMS-INV-${slug}`,
  };
};

const normalizePaymentStatus = (statusValue) => {
  const normalized = String(statusValue || "").trim().toLowerCase();
  const mapped = STATUS_NORMALIZATION[normalized] || "pending";

  if (!SUPPORTED_PAYMENT_STATUS.has(mapped)) {
    return "pending";
  }

  return mapped;
};

const normalizeInvoiceStatus = (invoiceStatusValue, fallbackPaymentStatus) => {
  const normalized = String(invoiceStatusValue || "").trim().toLowerCase();
  if (SUPPORTED_INVOICE_STATUS.has(normalized)) {
    return normalized;
  }

  if (SUPPORTED_INVOICE_STATUS.has(fallbackPaymentStatus)) {
    return fallbackPaymentStatus;
  }

  return "pending";
};

const lineTotalMinor = (line = {}) => {
  const quantity = Number(line.quantity ?? 1);
  const parsedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

  const explicitMinor = resolveMinorValue(
    line.total_minor,
    line.totalAmountMinor,
    line.line_total_minor,
    line.amount_minor
  );
  if (explicitMinor > 0) return explicitMinor;

  const unitMinor = resolveMinorValue(
    line.unit_price_minor,
    line.unitPriceMinor,
    line.price_minor,
    line.priceMinor
  );
  if (unitMinor > 0) return toIntegerMinor(unitMinor * parsedQuantity);

  return 0;
};

const normalizeServiceLines = (serviceLines = []) => {
  if (!Array.isArray(serviceLines)) return [];

  return serviceLines.map((line, index) => ({
    lineId: toNonEmptyString(line?.line_id || line?.lineId || `svc-${index + 1}`) || `svc-${index + 1}`,
    parmsServiceCode: toNonEmptyString(line?.parms_service_code || line?.parmsServiceCode),
    serviceType: toNonEmptyString(line?.service_type || line?.serviceType),
    quantity: Math.max(0, Number(line?.quantity || 1) || 1),
    totalMinor: lineTotalMinor(line),
    metadata: typeof line?.metadata === "object" && line.metadata !== null ? line.metadata : {},
  }));
};

const normalizePrescriptionLines = (prescriptionLines = []) => {
  if (!Array.isArray(prescriptionLines)) return [];

  return prescriptionLines.map((line, index) => {
    const genericName = toNonEmptyString(line?.generic_name || line?.genericName);
    const medicationName = toNonEmptyString(line?.medication_name || line?.medicationName) || genericName;

    return {
      rxId: toNonEmptyString(line?.rx_id || line?.rxId || line?.line_id || `rx-${index + 1}`) || `rx-${index + 1}`,
      genericName,
      medicationName,
      dosage: toNonEmptyString(line?.dosage),
      frequency: toNonEmptyString(line?.frequency),
      quantity: Math.max(0, Number(line?.quantity || 1) || 1),
      totalMinor: lineTotalMinor(line),
      selectedBrand: toNonEmptyString(line?.selected_brand || line?.selectedBrand),
      selectedBrandSku: toNonEmptyString(line?.selected_brand_sku || line?.selectedBrandSku),
    };
  });
};

const normalizePatient = (patientPayload = {}) => {
  const firstName = toNonEmptyString(patientPayload?.first_name || patientPayload?.firstName);
  const lastName = toNonEmptyString(patientPayload?.last_name || patientPayload?.lastName);
  const fullName =
    toNonEmptyString(patientPayload?.full_name || patientPayload?.fullName) ||
    toNonEmptyString([firstName, lastName].filter(Boolean).join(" "));

  if (!fullName) {
    throw new Error("patient.full_name is required");
  }

  return {
    parmsPatientId: toNonEmptyString(patientPayload?.parms_patient_id || patientPayload?.parmsPatientId || patientPayload?.id),
    externalPatientCode: toNonEmptyString(patientPayload?.external_patient_code || patientPayload?.externalPatientCode),
    firstName,
    lastName,
    fullName,
  };
};

const buildTotals = ({ payload, serviceLines, prescriptionLines, paymentStatus }) => {
  const serviceTotalMinor = serviceLines.reduce((sum, line) => sum + toIntegerMinor(line.totalMinor), 0);
  const rxTotalMinor = prescriptionLines.reduce((sum, line) => sum + toIntegerMinor(line.totalMinor), 0);

  const subtotalMinor = resolveMinorValue(
    payload?.totals?.subtotal_minor,
    payload?.totals?.subtotalMinor,
    payload?.subtotal_minor,
    payload?.subtotalMinor,
    payload?.subtotal,
    amountMajorToMinor(payload?.subtotal),
    serviceTotalMinor + rxTotalMinor
  );

  const discountMinor = resolveMinorValue(
    payload?.totals?.discount_minor,
    payload?.totals?.discountMinor,
    payload?.discount_minor,
    payload?.discountMinor,
    amountMajorToMinor(payload?.discount)
  );

  const taxMinor = resolveMinorValue(
    payload?.totals?.tax_minor,
    payload?.totals?.taxMinor,
    payload?.tax_minor,
    payload?.taxMinor,
    amountMajorToMinor(payload?.tax)
  );

  const computedTotalMinor = Math.max(0, subtotalMinor - discountMinor + taxMinor);

  const totalMinor = resolveMinorValue(
    payload?.totals?.total_minor,
    payload?.totals?.totalMinor,
    payload?.total_minor,
    payload?.totalAmountMinor,
    payload?.totalAmount,
    computedTotalMinor
  );

  let amountPaidMinor = resolveMinorValue(
    payload?.totals?.amount_paid_minor,
    payload?.totals?.amountPaidMinor,
    payload?.amount_paid_minor,
    payload?.amountPaidMinor,
    payload?.amountPaid,
    paymentStatus === "paid" ? totalMinor : 0
  );

  if (paymentStatus === "paid") {
    amountPaidMinor = Math.max(amountPaidMinor, totalMinor);
  }

  const balanceDueMinor = resolveMinorValue(
    payload?.totals?.balance_due_minor,
    payload?.totals?.balanceDueMinor,
    payload?.balance_due_minor,
    payload?.balanceDueMinor,
    payload?.balanceDue,
    Math.max(0, totalMinor - amountPaidMinor)
  );

  return {
    subtotalMinor: toIntegerMinor(subtotalMinor),
    discountMinor: toIntegerMinor(discountMinor),
    taxMinor: toIntegerMinor(taxMinor),
    totalMinor: toIntegerMinor(totalMinor),
    amountPaidMinor: toIntegerMinor(amountPaidMinor),
    balanceDueMinor: toIntegerMinor(balanceDueMinor),
  };
};

const buildPricedLines = (intent) => {
  const serviceLines = (intent.serviceLines || []).map((line) => ({
    line_id: line.lineId,
    service_type: line.serviceType,
    parms_service_code: line.parmsServiceCode,
    quantity: line.quantity,
    total_minor: line.totalMinor,
  }));

  const prescriptionLines = (intent.prescriptionLines || []).map((line) => ({
    rx_id: line.rxId,
    generic_name: line.genericName,
    medication_name: line.medicationName,
    selected_brand: line.selectedBrand,
    selected_brand_sku: line.selectedBrandSku,
    quantity: line.quantity,
    total_minor: line.totalMinor,
  }));

  return [...serviceLines, ...prescriptionLines];
};

const toProjection = (intent) => {
  return {
    ibms_reference: intent.ibmsReference,
    ibms_invoice_id: String(intent._id),
    ibms_invoice_number: intent.ibmsInvoiceNumber,
    invoice_status: intent.invoiceStatus,
    payment_status: intent.paymentStatus,
    totals: {
      subtotal_minor: intent.subtotalMinor,
      discount_minor: intent.discountMinor,
      tax_minor: intent.taxMinor,
      total_minor: intent.totalMinor,
      amount_paid_minor: intent.amountPaidMinor,
      balance_due_minor: intent.balanceDueMinor,
    },
    currency: intent.currency || "PHP",
    paid_at: intent.paidAt ? intent.paidAt.toISOString() : null,
    priced_lines: buildPricedLines(intent),
  };
};

const pickPendingStatuses = () => ["draft", "queued", "submitted", "pending", "processing"];

export const resolveOpenIntentForPatient = async ({ patientId, session = null }) => {
  const normalizedPatientId = toNonEmptyString(patientId);
  if (!normalizedPatientId) return null;

  const query = PARMS_BillingIntent.findOne({
    $or: [
      { "patient.parmsPatientId": normalizedPatientId },
      { "patient.externalPatientCode": normalizedPatientId },
    ],
    paymentStatus: { $in: ["pending", "processing"] },
    invoiceStatus: { $in: pickPendingStatuses() },
  })
    .sort({ submittedAt: 1, createdAt: 1 })
    .select("intentId encounterId ibmsReference ibmsInvoiceNumber")
    .lean();

  if (session) query.session(session);

  const intent = await query;
  if (!intent) return null;

  return {
    intentId: intent.intentId,
    encounterId: intent.encounterId,
    ibmsReference: intent.ibmsReference,
    ibmsInvoiceNumber: intent.ibmsInvoiceNumber,
  };
};

export const markIntentPaidFromTransaction = async ({ transaction, session = null }) => {
  if (!transaction) return null;

  const selectors = [];

  if (toNonEmptyString(transaction.parmsIntentId)) {
    selectors.push({ intentId: toNonEmptyString(transaction.parmsIntentId) });
  }

  if (toNonEmptyString(transaction.parmsInvoiceReference)) {
    selectors.push({ ibmsReference: toNonEmptyString(transaction.parmsInvoiceReference) });
  }

  if (selectors.length === 0 && toNonEmptyString(transaction.patientId)) {
    selectors.push(
      { "patient.parmsPatientId": toNonEmptyString(transaction.patientId) },
      { "patient.externalPatientCode": toNonEmptyString(transaction.patientId) }
    );
  }

  if (selectors.length === 0) return null;

  const query = PARMS_BillingIntent.findOne({
    $or: selectors,
  }).sort({ submittedAt: 1, createdAt: 1 });

  if (session) query.session(session);

  const intent = await query;
  if (!intent) return null;

  const totalMinor = amountMajorToMinor(transaction.totalAmount || 0) || 0;
  const subtotalMinor = amountMajorToMinor(transaction.subtotal || 0) || totalMinor;
  const discountMinor = amountMajorToMinor(transaction.discountAmount || 0) || 0;
  const taxMinor = amountMajorToMinor(transaction.vatIncluded || 0) || 0;
  const paidAt = toDateOrNull(transaction.completedAt) || new Date();

  intent.invoiceStatus = "paid";
  intent.paymentStatus = "paid";
  intent.subtotalMinor = subtotalMinor;
  intent.discountMinor = discountMinor;
  intent.taxMinor = taxMinor;
  intent.totalMinor = totalMinor;
  intent.amountPaidMinor = totalMinor;
  intent.balanceDueMinor = 0;
  intent.paidAt = paidAt;
  intent.processedAt = paidAt;
  intent.lastTransactionId = transaction._id;

  await intent.save(session ? { session } : undefined);

  return {
    intentId: intent.intentId,
    ibmsReference: intent.ibmsReference,
    ibmsInvoiceNumber: intent.ibmsInvoiceNumber,
  };
};

export const upsertBillingIntentFromPARMS = async ({ payload, idempotencyKey, correlationId }) => {
  const intentId = toNonEmptyString(payload?.intent_id || payload?.intentId);
  if (!intentId) {
    const error = new Error("intent_id is required");
    error.statusCode = 400;
    throw error;
  }

  const patient = normalizePatient(payload?.patient || {});
  const serviceLines = normalizeServiceLines(payload?.service_lines || payload?.serviceLines || []);
  const prescriptionLines = normalizePrescriptionLines(payload?.prescription_lines || payload?.prescriptionLines || []);

  const normalizedStatus = normalizePaymentStatus(payload?.status);
  const normalizedInvoiceStatus = normalizeInvoiceStatus(payload?.ibmsStatus, normalizedStatus);

  const revision = parseRevisionFromIdempotencyKey(idempotencyKey || payload?.idempotency_key);
  const payloadHash = buildHash(payload || {});
  const { ibmsReference, ibmsInvoiceNumber } = deriveInvoiceIdentity(intentId);

  const totals = buildTotals({
    payload,
    serviceLines,
    prescriptionLines,
    paymentStatus: normalizedStatus,
  });

  const submittedAt = toDateOrNull(payload?.submitted_at || payload?.submittedAt);
  const encounterCompletedAt = toDateOrNull(payload?.encounter_completed_at || payload?.encounterCompletedAt);
  const paidAt = toDateOrNull(payload?.paidAt);
  const processedAt = toDateOrNull(payload?.processedAt);

  const existing = await PARMS_BillingIntent.findOne({ intentId });

  if (existing) {
    const normalizedIdempotencyKey = toNonEmptyString(idempotencyKey || payload?.idempotency_key);
    if (normalizedIdempotencyKey && existing.idempotencyKey === normalizedIdempotencyKey) {
      if (existing.payloadHash && existing.payloadHash !== payloadHash) {
        const conflictError = new Error("Same idempotency key received with a different payload");
        conflictError.statusCode = 409;
        throw conflictError;
      }

      return {
        created: false,
        idempotentReplay: true,
        staleRevision: false,
        projection: toProjection(existing),
      };
    }

    if (revision < Number(existing.revision || 1)) {
      return {
        created: false,
        idempotentReplay: false,
        staleRevision: true,
        projection: toProjection(existing),
      };
    }

    existing.encounterId = toNonEmptyString(payload?.encounter_id || payload?.encounterId);
    existing.revision = revision;
    existing.idempotencyKey = toNonEmptyString(idempotencyKey || payload?.idempotency_key);
    existing.payloadHash = payloadHash;
    existing.correlationId = toNonEmptyString(correlationId);
    existing.patient = patient;
    existing.serviceLines = serviceLines;
    existing.prescriptionLines = prescriptionLines;
    existing.submittedAt = submittedAt;
    existing.encounterCompletedAt = encounterCompletedAt;
    existing.invoiceStatus = normalizedInvoiceStatus;
    existing.paymentStatus = normalizedStatus;
    existing.currency = toNonEmptyString(payload?.currency) || existing.currency || "PHP";
    existing.subtotalMinor = totals.subtotalMinor;
    existing.discountMinor = totals.discountMinor;
    existing.taxMinor = totals.taxMinor;
    existing.totalMinor = totals.totalMinor;
    existing.amountPaidMinor = totals.amountPaidMinor;
    existing.balanceDueMinor = totals.balanceDueMinor;
    existing.paidAt = paidAt;
    existing.processedAt = processedAt;

    await existing.save();

    return {
      created: false,
      idempotentReplay: false,
      staleRevision: false,
      projection: toProjection(existing),
    };
  }

  const createdIntent = await PARMS_BillingIntent.create({
    intentId,
    encounterId: toNonEmptyString(payload?.encounter_id || payload?.encounterId),
    revision,
    idempotencyKey: toNonEmptyString(idempotencyKey || payload?.idempotency_key),
    payloadHash,
    correlationId: toNonEmptyString(correlationId),
    patient,
    serviceLines,
    prescriptionLines,
    submittedAt,
    encounterCompletedAt,
    ibmsReference,
    ibmsInvoiceNumber,
    invoiceStatus: normalizedInvoiceStatus,
    paymentStatus: normalizedStatus,
    currency: toNonEmptyString(payload?.currency) || "PHP",
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    amountPaidMinor: totals.amountPaidMinor,
    balanceDueMinor: totals.balanceDueMinor,
    paidAt,
    processedAt,
  });

  return {
    created: true,
    idempotentReplay: false,
    staleRevision: false,
    projection: toProjection(createdIntent),
  };
};

export const getInvoiceByReference = async (ibmsReference) => {
  const normalizedReference = toNonEmptyString(ibmsReference);
  if (!normalizedReference) {
    const error = new Error("ibmsReference is required");
    error.statusCode = 400;
    throw error;
  }

  const intent = await PARMS_BillingIntent.findOne({
    $or: [
      { ibmsReference: normalizedReference },
      { ibmsInvoiceNumber: normalizedReference },
    ],
  });

  if (!intent) {
    const error = new Error("Invoice not found");
    error.statusCode = 404;
    throw error;
  }

  return toProjection(intent);
};
