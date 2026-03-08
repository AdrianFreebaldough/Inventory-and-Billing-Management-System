import mongoose from "mongoose";

const physicalInventoryCheckSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    month: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
      index: true,
    },
    systemStock: {
      type: Number,
      required: true,
    },
    variance: {
      type: Number,
      required: true,
    },
    physicalCount: {
      type: Number,
      required: true,
    },
    checkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    checkedByEmail: {
      type: String,
      trim: true,
      required: true,
    },
    dateChecked: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

physicalInventoryCheckSchema.index({ product: 1, month: 1 }, { unique: true });

export default mongoose.model("PhysicalInventoryCheck", physicalInventoryCheckSchema);
