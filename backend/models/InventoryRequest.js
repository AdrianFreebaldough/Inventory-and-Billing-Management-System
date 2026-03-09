import mongoose from "mongoose";

const inventoryRequestSchema = new mongoose.Schema(
  {
    requestType: {
      type: String,
      enum: ["ADD_ITEM", "RESTOCK"],
      required: true,
    },

    /* 🔹 ADD ITEM fields */
    itemName: {
      type: String,
      trim: true,
      default: null,
    },
    category: {
      type: String,
      trim: true,
      default: null,
    },
    initialQuantity: {
      type: Number,
      default: null,
      min: 1,
    },
    unitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    unit: {
      type: String,
      trim: true,
      default: "pcs",
    },
    minStock: {
      type: Number,
      default: 10,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    supplier: {
      type: String,
      trim: true,
      default: null,
    },
    genericName: {
      type: String,
      trim: true,
      default: null,
    },
    brandName: {
      type: String,
      trim: true,
      default: null,
    },
    dosageForm: {
      type: String,
      trim: true,
      default: null,
    },
    strength: {
      type: String,
      trim: true,
      default: null,
    },
    medicineName: {
      type: String,
      trim: true,
      default: null,
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

    /* 🔹 RESTOCK fields */
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null, // ✅ NOT required
    },
    requestedQuantity: {
      type: Number,
      default: null,
    },

    /* 🔹 COMMON */
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
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

/* 🔹 Indexes */
inventoryRequestSchema.index({ requestedBy: 1, createdAt: -1 });
inventoryRequestSchema.index({ status: 1, createdAt: -1 });
inventoryRequestSchema.index({ requestType: 1, status: 1, createdAt: -1 });

inventoryRequestSchema.pre("validate", function (next) {
  if (this.requestType === "ADD_ITEM") {
    if (!this.itemName || !this.category || !this.initialQuantity) {
      throw new Error("ADD_ITEM requests require itemName, category, and initialQuantity");
    }

    this.product = null;
    this.requestedQuantity = null;
  }

  if (this.requestType === "RESTOCK") {
    if (!this.product || !this.requestedQuantity) {
      throw new Error("RESTOCK requests require product and requestedQuantity");
    }

    this.itemName = null;
    this.category = null;
    this.initialQuantity = null;
    this.unitPrice = 0;
    this.minStock = 10;
    this.description = "";
    this.supplier = null;
  }

  return undefined;
});

export default mongoose.model("InventoryRequest", inventoryRequestSchema);