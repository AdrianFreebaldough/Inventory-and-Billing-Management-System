import mongoose from "mongoose";

const OWNER_archivedProductSchema = new mongoose.Schema(
  {
    originalProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      default: "pcs",
      trim: true,
    },
    statusAtArchive: {
      type: String,
      enum: ["available", "low", "out"],
      required: true,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    archivedAt: {
      type: Date,
      default: Date.now,
    },
    archiveReason: {
      type: String,
      trim: true,
      default: "Owner archived product",
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true, collection: "archived_products" }
);

OWNER_archivedProductSchema.index({ archivedAt: -1 });

const OWNER_ArchivedProduct =
  mongoose.models.ArchivedProduct ||
  mongoose.model("ArchivedProduct", OWNER_archivedProductSchema);

export default OWNER_ArchivedProduct;
