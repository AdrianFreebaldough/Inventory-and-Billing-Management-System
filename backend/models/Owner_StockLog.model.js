import mongoose from "mongoose";

const Owner_StockLogSchema = new mongoose.Schema(
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
    movementType: {
      type: String,
      enum: ["SALE", "RESTOCK", "ADJUST"],
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
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      role: {
        type: String,
        required: true,
        enum: ["owner", "staff"],
      },
    },
    referenceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    source: {
      type: String,
      enum: ["POS", "MANUAL", "SYSTEM"],
      required: true,
      index: true,
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
