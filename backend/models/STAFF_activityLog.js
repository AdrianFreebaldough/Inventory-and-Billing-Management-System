import mongoose from "mongoose";

const STAFF_activityLogSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    targetItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed", "viewed", "requested"],
      default: "completed",
      index: true,
    },
  },
  { timestamps: true }
);

STAFF_activityLogSchema.index({ staffId: 1, createdAt: -1 });
STAFF_activityLogSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("STAFF_ActivityLog", STAFF_activityLogSchema);
