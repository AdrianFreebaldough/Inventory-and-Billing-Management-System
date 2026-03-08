import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
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

    unitPrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    unit: {
      type: String,
      default: "pcs",
    },

    minStock: {
      type: Number,
      min: 0,
      default: 10,
    },

    supplier: {
      type: String,
      trim: true,
      default: null,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    batchNumber: {
      type: String,
      trim: true,
      default: null,
    },

    status: {
      type: String,
      enum: ["available", "low", "out"],
      default: "available",
    },

    /* ===== Owner discrepancy reconciliation ===== */
    physicalCount: {
      type: Number,
      min: 0,
      default: null,
    },

    expectedRemaining: {
      type: Number,
      min: 0,
      default: null,
    },

    variance: {
      type: Number,
      default: 0,
    },

    discrepancyStatus: {
      type: String,
      enum: ["Balanced", "With Variance"],
      default: "Balanced",
    },

    /* ===== Archive support ===== */
    isArchived: {
      type: Boolean,
      default: false,
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

productSchema.index({ status: 1, isArchived: 1, quantity: 1 });

/* 🔄 Auto-update status based on quantity vs minStock threshold */
productSchema.pre("save", function () {
  const threshold = this.minStock ?? 10;
  if (this.quantity <= 0) {
    this.status = "out";
  } else if (this.quantity <= threshold) {
    this.status = "low";
  } else {
    this.status = "available";
  }
});

export default mongoose.model("Product", productSchema);