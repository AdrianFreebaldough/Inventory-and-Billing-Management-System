import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["staff", "owner"],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "out_of_stock",
        "stock_request_sent",
        "stock_request_approved",
        "stock_request_rejected",
        "item_expiration",
        "inventory_adjustment_request",
        "expense_submitted",
        "expense_reviewed",
        "expense_approved",
        "expense_rejected",
        "low_stock",
        "expiry_risk_red",
        "promotion_candidate",
      ],
      required: true,
    },
    redirectUrl: {
      type: String,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ role: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
