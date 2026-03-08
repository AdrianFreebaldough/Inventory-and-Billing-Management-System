import mongoose from "mongoose";

const inventoryBatchSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    batchNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    expiryDate: {
      type: Date,
      default: null,
      index: true,
    },
    supplier: {
      type: String,
      trim: true,
      default: null,
    },
    sourceRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryRequest",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

inventoryBatchSchema.index({ product: 1, expiryDate: 1 });
inventoryBatchSchema.index({ product: 1, createdAt: -1 });

export default mongoose.model("InventoryBatch", inventoryBatchSchema);
