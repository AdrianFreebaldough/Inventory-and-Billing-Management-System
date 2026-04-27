import mongoose from "mongoose";

const priceChangeRequestSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    oldPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    requestedPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requestedByName: {
      type: String,
      trim: true,
      default: null,
    },
    requestedByRole: {
      type: String,
      enum: ["owner", "staff"],
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
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
  },
  { timestamps: true }
);

priceChangeRequestSchema.index({ status: 1, createdAt: -1 });
priceChangeRequestSchema.index({ productId: 1, status: 1, createdAt: -1 });
priceChangeRequestSchema.index({ requestedBy: 1, createdAt: -1 });

export default mongoose.model("PriceChangeRequest", priceChangeRequestSchema);
