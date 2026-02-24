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

    unit: {
      type: String,
      default: "pcs",
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
productSchema.pre("save", function (next) {
  if (this.quantity <= 0) {
    this.status = "out";
  } else if (this.quantity <= 10) {
    this.status = "low";
  } else {
    this.status = "available";
  }
  next();
});

export default mongoose.model("Product", productSchema);