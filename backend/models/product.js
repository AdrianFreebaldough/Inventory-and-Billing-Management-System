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
  },
  { timestamps: true }
);

/* 🔄 Auto-update status based on quantity */
productSchema.pre("save", function () {
  if (this.quantity <= 0) {
    this.status = "out";
  } else if (this.quantity <= 10) {
    this.status = "low";
  } else {
    this.status = "available";
  }
});

export default mongoose.model("Product", productSchema);