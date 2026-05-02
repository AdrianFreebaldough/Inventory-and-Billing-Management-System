import mongoose from "mongoose";

const Owner_StockLogSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    movementType: {
      type: String,
      enum: ["SALE", "RESTOCK", "ADJUST", "VOID_REVERSAL", "ADJUSTMENT", "ITEM_CREATED", "DISPOSAL"],
      required: true,
      index: true,
    },
    quantityChange: {
      type: Number,
      required: true,
    },
    beforeQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    afterQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referenceId: {
      type: String,
      required: false,
      index: true,
      trim: true,
    },
    batchNumber: {
      type: String,
      trim: true,
      default: null,
    },
    source: {
      type: String,
      enum: ["POS", "MANUAL", "SYSTEM"],
      required: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

Owner_StockLogSchema.pre("findOneAndUpdate", function () {
  throw new Error("Stock logs are append-only and cannot be updated");
});

Owner_StockLogSchema.pre("updateOne", function () {
  throw new Error("Stock logs are append-only and cannot be updated");
});

Owner_StockLogSchema.pre("updateMany", function () {
  throw new Error("Stock logs are append-only and cannot be updated");
});

Owner_StockLogSchema.pre("deleteOne", { document: true, query: false }, function () {
  throw new Error("Stock logs are append-only and cannot be deleted");
});

Owner_StockLogSchema.pre("deleteOne", { document: false, query: true }, function () {
  throw new Error("Stock logs are append-only and cannot be deleted");
});

Owner_StockLogSchema.pre("deleteMany", function () {
  throw new Error("Stock logs are append-only and cannot be deleted");
});

Owner_StockLogSchema.pre("findOneAndDelete", function () {
  throw new Error("Stock logs are append-only and cannot be deleted");
});

export default mongoose.model("Owner_StockLog", Owner_StockLogSchema);
