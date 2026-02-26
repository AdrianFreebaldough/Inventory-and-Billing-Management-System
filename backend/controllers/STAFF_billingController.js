import {
  STAFF_BillingError,
  STAFF_completeBillingTransaction,
  STAFF_createBillingTransaction,
  STAFF_getBillingHistory,
  STAFF_getBillingReceipt,
  STAFF_proceedPayment,
} from "../services/STAFF_billingService.js";

const STAFF_handleBillingError = (res, error) => {
  if (error instanceof STAFF_BillingError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({ message: error.message || "Internal server error" });
};

export const STAFF_createTransaction = async (req, res) => {
  try {
    const transaction = await STAFF_createBillingTransaction({
      staffId: req.user.id,
      items: req.body.items,
    });

    return res.status(201).json({
      message: "Billing transaction created",
      data: {
        transactionId: transaction._id,
        staffId: transaction.staffId,
        items: transaction.items,
        totalAmount: transaction.totalAmount,
        status: transaction.status,
        createdAt: transaction.createdAt,
      },
    });
  } catch (error) {
    return STAFF_handleBillingError(res, error);
  }
};

export const STAFF_proceedToPayment = async (req, res) => {
  try {
    const data = await STAFF_proceedPayment({
      transactionId: req.params.id,
      staffId: req.user.id,
    });

    return res.status(200).json({
      message: "Transaction is ready for payment",
      data,
    });
  } catch (error) {
    return STAFF_handleBillingError(res, error);
  }
};

export const STAFF_completeTransaction = async (req, res) => {
  try {
    const transaction = await STAFF_completeBillingTransaction({
      transactionId: req.params.id,
      staffId: req.user.id,
      cashReceived: req.body.cashReceived,
    });

    return res.status(200).json({
      message: "Payment completed and transaction finalized",
      data: {
        transactionId: transaction._id,
        status: transaction.status,
        totalAmount: transaction.totalAmount,
        cashReceived: transaction.cashReceived,
        change: transaction.change,
        completedAt: transaction.completedAt,
        receiptNumber: transaction.receiptSnapshot?.receiptNumber,
      },
    });
  } catch (error) {
    return STAFF_handleBillingError(res, error);
  }
};

export const STAFF_getHistory = async (req, res) => {
  try {
    const history = await STAFF_getBillingHistory({ staffId: req.user.id });

    return res.status(200).json({
      count: history.length,
      data: history.map((transaction) => ({
        transactionId: transaction._id,
        staffId: transaction.staffId,
        dateTime: transaction.completedAt || transaction.createdAt,
        items: transaction.items,
        totalAmount: transaction.totalAmount,
        cashReceived: transaction.cashReceived,
        change: transaction.change,
        status: transaction.status,
        receiptSnapshot: transaction.receiptSnapshot,
      })),
    });
  } catch (error) {
    return STAFF_handleBillingError(res, error);
  }
};

export const STAFF_getReceipt = async (req, res) => {
  try {
    const receipt = await STAFF_getBillingReceipt({
      transactionId: req.params.id,
      staffId: req.user.id,
    });

    return res.status(200).json({ data: receipt });
  } catch (error) {
    return STAFF_handleBillingError(res, error);
  }
};
