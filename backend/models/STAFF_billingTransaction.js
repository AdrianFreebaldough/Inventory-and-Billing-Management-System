import mongoose from "mongoose";

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
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
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
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [STAFF_billingItemSchema],
      required: true,
      validate: [(items) => items.length > 0, "Receipt must have at least one item"],
    },
    subtotal: {
      type: Number,
      required: true,
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
    items: {
      type: [STAFF_billingItemSchema],
      required: true,
      validate: [(items) => items.length > 0, "At least one item is required"],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
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
      enum: ["PENDING_PAYMENT", "COMPLETED"],
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
  },
  { timestamps: true }
);

STAFF_billingTransactionSchema.index({ staffId: 1, createdAt: -1 });
STAFF_billingTransactionSchema.index({ "receiptSnapshot.receiptNumber": 1 }, { unique: true, sparse: true });

export default mongoose.model("STAFF_BillingTransaction", STAFF_billingTransactionSchema);
