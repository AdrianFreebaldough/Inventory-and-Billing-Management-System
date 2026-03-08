import mongoose from "mongoose";

const STAFF_stockRequestItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    currentStock: {
      type: Number,
      required: true,
      min: 0,
    },
    requestedQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    approvedQuantity: {
      type: Number,
      default: null,
    },
    expirationDate: {
      type: Date,
      default: null,
    },
    batchNumber: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

const STAFF_stockRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    staffName: {
      type: String,
      required: true,
      trim: true,
    },
    items: {
      type: [STAFF_stockRequestItemSchema],
      required: true,
      validate: [(items) => items.length > 0, "Request must have at least one item"],
    },
    status: {
      type: String,
      enum: ["Pending", "Partially Approved", "Approved", "Rejected"],
      default: "Pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

STAFF_stockRequestSchema.index({ staffId: 1, createdAt: -1 });
STAFF_stockRequestSchema.index({ status: 1, createdAt: -1 });

const STAFF_StockRequest = mongoose.model("STAFF_StockRequest", STAFF_stockRequestSchema);

export default STAFF_StockRequest;
