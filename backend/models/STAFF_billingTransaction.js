import mongoose from "mongoose";

const STAFF_batchAllocationSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryBatch",
      required: true,
    },
    batchNumber: {
      type: String,
      default: null,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    expiryRisk: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false }
);

const STAFF_billingItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    genericName: {
      type: String,
      trim: true,
      default: "",
    },
    brandName: {
      type: String,
      trim: true,
      default: "",
    },
    unitPrice: {
      type: Number,
      required: true,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Price must be greater than zero.",
      },
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    lineTotal: {
      type: Number,
      required: true,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Line total must be greater than zero.",
      },
    },
    batchAllocations: {
      type: [STAFF_batchAllocationSchema],
      default: [],
    },
    type: {
      type: String,
      enum: ["item", "service"],
      default: "item",
    },
  },
  { _id: false }
);

const STAFF_parmsPendingBalanceSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: ["laboratory", "prescription", "other"],
      default: "other",
    },
    referenceId: {
      type: String,
      default: null,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Amount must be greater than zero.",
      },
    },
  },
  { _id: false }
);

const STAFF_receiptSnapshotSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
    },
    clinic: {
      name: {
        type: String,
        required: true,
      },
    },
    transactionDateTime: {
      type: Date,
      required: true,
    },
    patientId: {
      type: String,
      required: true,
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    isGuest: {
      type: Boolean,
      default: false,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [STAFF_billingItemSchema],
      default: [],
    },
    pendingBalances: {
      type: [STAFF_parmsPendingBalanceSchema],
      default: [],
    },
    pendingBalanceTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountRate: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    vatRate: {
      type: Number,
      default: 0.12,
    },
    vatAmount: {
      type: Number,
      default: 0,
    },
    vatIncluded: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    cashReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    change: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const STAFF_billingTransactionSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    isGuest: {
      type: Boolean,
      default: false,
      index: true,
    },
    parmsIntentId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    parmsEncounterId: {
      type: String,
      default: null,
      trim: true,
    },
    parmsInvoiceReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    parmsInvoiceNumber: {
      type: String,
      default: null,
      trim: true,
    },
    items: {
      type: [STAFF_billingItemSchema],
      default: [],
    },
    parmsPendingBalances: {
      type: [STAFF_parmsPendingBalanceSchema],
      default: [],
    },
    parmsPendingTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    parmsSyncStatus: {
      type: String,
      enum: ["NOT_QUEUED", "PENDING", "SYNCING", "SYNCED", "FAILED"],
      default: "NOT_QUEUED",
      index: true,
    },
    parmsSyncAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    parmsLastSyncAt: {
      type: Date,
      default: null,
    },
    parmsLastSyncError: {
      type: String,
      default: null,
      trim: true,
    },
    parmsLastSyncCorrelationId: {
      type: String,
      default: null,
      trim: true,
    },
    parmsLastSyncEventId: {
      type: String,
      default: null,
      trim: true,
    },
    parmsNextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
    subtotal: {
      type: Number,
      required: true,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Subtotal must be greater than zero.",
      },
    },
    discountRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    vatRate: {
      type: Number,
      default: 0.12,
    },
    vatAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    vatIncluded: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Total amount must be greater than zero.",
      },
    },
    editedPatientId: {
      type: String,
      trim: true,
      default: null,
    },
    editedPatientName: {
      type: String,
      trim: true,
      default: null,
    },
    editedItems: {
      type: [STAFF_billingItemSchema],
      default: null,
    },
    voidNotes: {
      type: String,
      trim: true,
      default: null,
    },
    cashReceived: {
      type: Number,
      default: null,
      min: 0,
    },
    change: {
      type: Number,
      default: null,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cash"],
      default: "cash",
    },
    status: {
      type: String,
      enum: ["PENDING_PAYMENT", "COMPLETED", "VOIDED"],
      default: "PENDING_PAYMENT",
      index: true,
    },
    receiptSnapshot: {
      type: STAFF_receiptSnapshotSchema,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    voidedAt: {
      type: Date,
      default: null,
    },
    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    voidReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

STAFF_billingTransactionSchema.index({ staffId: 1, createdAt: -1 });
STAFF_billingTransactionSchema.index({ staffId: 1, status: 1, completedAt: -1 });
STAFF_billingTransactionSchema.index({ parmsSyncStatus: 1, completedAt: -1 });
STAFF_billingTransactionSchema.index({ parmsSyncStatus: 1, parmsNextRetryAt: 1 });
STAFF_billingTransactionSchema.index({ "receiptSnapshot.receiptNumber": 1 }, { unique: true, sparse: true });

export default mongoose.model("STAFF_BillingTransaction", STAFF_billingTransactionSchema);
