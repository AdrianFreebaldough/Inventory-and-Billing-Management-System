import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    transactionNo: {
      type: String,
      required: true,
      unique: true,
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
          validate: {
            validator: function (v) {
              return v > 0;
            },
            message: "Price must be greater than zero.",
          },
        },
      },
    ],

    totalAmount: {
      type: Number,
      required: true,
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Total amount must be greater than zero.",
      },
    },

    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "gcash", "card"],
      default: "cash",
    },
  },
  { timestamps: true }
);

transactionSchema.index({ processedBy: 1, createdAt: -1 });

export default mongoose.model("Transaction", transactionSchema);