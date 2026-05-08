import mongoose from "mongoose";

const PARMS_serviceLineSchema = new mongoose.Schema(
  {
    lineId: {
      type: String,
      required: true,
      trim: true,
    },
    parmsServiceCode: {
      type: String,
      default: null,
      trim: true,
    },
    serviceType: {
      type: String,
      default: null,
      trim: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 0,
    },
    unitPriceMinor: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalMinor: {
      type: Number,
      default: 0,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Total must be greater than zero.",
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const PARMS_prescriptionLineSchema = new mongoose.Schema(
  {
    rxId: {
      type: String,
      required: true,
      trim: true,
    },
    genericName: {
      type: String,
      default: null,
      trim: true,
    },
    medicationName: {
      type: String,
      default: null,
      trim: true,
    },
    dosage: {
      type: String,
      default: null,
      trim: true,
    },
    frequency: {
      type: String,
      default: null,
      trim: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 0,
    },
    unitPriceMinor: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalMinor: {
      type: Number,
      default: 0,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Total must be greater than zero.",
      },
    },
    selectedBrand: {
      type: String,
      default: null,
      trim: true,
    },
    selectedBrandSku: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false }
);

const PARMS_patientSchema = new mongoose.Schema(
  {
    parmsPatientId: {
      type: String,
      default: null,
      trim: true,
    },
    externalPatientCode: {
      type: String,
      default: null,
      trim: true,
    },
    firstName: {
      type: String,
      default: null,
      trim: true,
    },
    lastName: {
      type: String,
      default: null,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const PARMS_billingIntentSchema = new mongoose.Schema(
  {
    intentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    encounterId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    revision: {
      type: Number,
      default: 1,
      min: 1,
    },
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    payloadHash: {
      type: String,
      default: null,
      trim: true,
    },
    correlationId: {
      type: String,
      default: null,
      trim: true,
    },
    patient: {
      type: PARMS_patientSchema,
      required: true,
    },
    serviceLines: {
      type: [PARMS_serviceLineSchema],
      default: [],
    },
    prescriptionLines: {
      type: [PARMS_prescriptionLineSchema],
      default: [],
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    encounterCompletedAt: {
      type: Date,
      default: null,
    },
    ibmsReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    ibmsInvoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    invoiceStatus: {
      type: String,
      enum: ["draft", "queued", "submitted", "pending", "processing", "paid", "failed", "cancelled", "refunded"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "processing", "paid", "failed", "cancelled", "refunded"],
      default: "pending",
      index: true,
    },
    currency: {
      type: String,
      default: "PHP",
      trim: true,
    },
    subtotalMinor: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountMinor: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxMinor: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalMinor: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountPaidMinor: {
      type: Number,
      default: 0,
      min: 0,
    },
    balanceDueMinor: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    lastTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "STAFF_BillingTransaction",
      default: null,
    },
  },
  { timestamps: true }
);

PARMS_billingIntentSchema.index({ "patient.fullName": 1 });
PARMS_billingIntentSchema.index({ "patient.parmsPatientId": 1 });
PARMS_billingIntentSchema.index({ "patient.externalPatientCode": 1 });
PARMS_billingIntentSchema.index({ submittedAt: -1, createdAt: -1 });

export default mongoose.model("PARMS_BillingIntent", PARMS_billingIntentSchema);
