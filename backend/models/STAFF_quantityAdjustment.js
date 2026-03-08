import mongoose from "mongoose";

const STAFF_quantityAdjustmentSchema = new mongoose.Schema(
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
    systemQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    actualQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    difference: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
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
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
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
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

STAFF_quantityAdjustmentSchema.index({ staffId: 1, createdAt: -1 });
STAFF_quantityAdjustmentSchema.index({ status: 1, createdAt: -1 });
STAFF_quantityAdjustmentSchema.index({ productId: 1, status: 1 });

const STAFF_QuantityAdjustment = mongoose.model(
  "STAFF_QuantityAdjustment",
  STAFF_quantityAdjustmentSchema
);

export default STAFF_QuantityAdjustment;
