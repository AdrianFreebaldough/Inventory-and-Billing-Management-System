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
    currentQuantity: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    initialQuantity: {
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
    status: {
      type: String,
      enum: ["Active", "Low Stock", "Out of Stock", "Pending Disposal", "Disposed", "Empty"],
      default: "Active",
      index: true,
    },
    lastDisposalReferenceId: {
      type: String,
      trim: true,
      default: null,
    },
    disposedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

inventoryBatchSchema.index({ product: 1, expiryDate: 1 });
inventoryBatchSchema.index({ product: 1, createdAt: -1 });

inventoryBatchSchema.pre("validate", function ensureInitialQuantity() {
  const parsedQuantity = Number(this.quantity ?? 0);
  const parsedCurrentQuantity = Number(this.currentQuantity);

  if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
    this.quantity = 0;
  }

  if (!Number.isFinite(parsedCurrentQuantity) || parsedCurrentQuantity < 0) {
    this.currentQuantity = Number(this.quantity ?? 0);
  }

  if (this.isNew && (!Number.isFinite(Number(this.initialQuantity)) || Number(this.initialQuantity) < 0)) {
    this.initialQuantity = Number(this.quantity ?? 0);
  }

  if (!Number.isFinite(Number(this.initialQuantity)) || Number(this.initialQuantity) < 0) {
    this.initialQuantity = Number(this.quantity ?? 0);
  }
});

export default mongoose.model("InventoryBatch", inventoryBatchSchema);
