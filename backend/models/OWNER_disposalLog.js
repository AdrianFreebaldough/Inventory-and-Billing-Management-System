import mongoose from "mongoose";

const OWNER_disposalLogSchema = new mongoose.Schema(
  {
    referenceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryBatch",
      required: true,
      index: true,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    genericName: {
      type: String,
      trim: true,
      default: null,
    },
    batchNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    expirationDate: {
      type: Date,
      default: null,
    },
    quantityDisposed: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "Expired",
        "Damaged",
        "Contaminated",
        "Manufacturer Recall",
        "Incorrect Storage",
        "Other",
      ],
      index: true,
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    disposalMethod: {
      type: String,
      enum: [
        "Incineration",
        "Return to Supplier",
        "Chemical Neutralization",
        "Waste Contractor Pickup",
        "Other",
        null,
      ],
      default: null,
    },
    dateRequested: {
      type: Date,
      default: Date.now,
      alias: "date_requested",
      index: true,
    },
    dateApproved: {
      type: Date,
      default: null,
    },
    dateDisposed: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Disposed", "Rejected"],
      default: "Pending",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "disposal_logs",
  }
);

OWNER_disposalLogSchema.index({ dateRequested: -1, status: 1 });
OWNER_disposalLogSchema.index({ itemName: 1, batchNumber: 1 });

const OWNER_DisposalLog =
  mongoose.models.OWNER_DisposalLog ||
  mongoose.model("OWNER_DisposalLog", OWNER_disposalLogSchema);

export default OWNER_DisposalLog;