import mongoose from "mongoose";

const STAFF_expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["Meals", "Supplies", "Transportation", "Others"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Amount must be greater than zero.",
      },
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    staffName: {
      type: String,
      required: true,
      trim: true,
    },
    receiptImage: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["Pending", "Reviewed", "Approved", "Rejected"],
      default: "Pending",
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
  },
  { timestamps: true }
);

STAFF_expenseSchema.index({ staffId: 1, createdAt: -1 });
STAFF_expenseSchema.index({ status: 1, date: -1 });
STAFF_expenseSchema.index({ category: 1, date: -1 });

const STAFF_Expense = mongoose.model("STAFF_Expense", STAFF_expenseSchema);

export default STAFF_Expense;
