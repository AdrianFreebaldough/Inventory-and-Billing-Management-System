import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      enum: ["OWNER", "STAFF"],
      default: null,
      index: true,
    },
    actorName: {
      type: String,
      trim: true,
      default: null,
    },
    actorEmail: {
      type: String,
      trim: true,
      default: null,
    },
    actionType: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    category: {
      type: String,
      enum: ["User Management", "Inventory", "Payment", "Request"],
      default: null,
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    entityType: {
      type: String,
      default: null,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ category: 1, createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);