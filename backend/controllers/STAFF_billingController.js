import {
  STAFF_BillingError,
  STAFF_completeBillingTransaction,
  STAFF_createBillingTransaction,
  STAFF_getBillingHistory,
  STAFF_getBillingReceipt,
  STAFF_proceedPayment,
  STAFF_voidBillingTransaction,
} from "../services/STAFF_billingService.js";
import Product from "../models/product.js";

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
      patientId: req.body.patientId,
      patientName: req.body.patientName,
      discountRate: req.body.discountRate,
    });

    return res.status(201).json({
      message: "Billing transaction created",
      data: {
        transactionId: transaction._id,
        staffId: transaction.staffId,
        patientId: transaction.patientId,
        patientName: transaction.patientName,
        items: transaction.items,
        subtotal: transaction.subtotal,
        discountRate: transaction.discountRate,
        discountAmount: transaction.discountAmount,
        vatRate: transaction.vatRate,
        vatAmount: transaction.vatAmount,
        vatIncluded: transaction.vatIncluded,
        netAmount: transaction.netAmount,
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
        patientId: transaction.patientId,
        dateTime: transaction.completedAt || transaction.createdAt,
        items: transaction.items,
        subtotal: transaction.subtotal,
        discountRate: transaction.discountRate,
        discountAmount: transaction.discountAmount,
        vatRate: transaction.vatRate,
        vatAmount: transaction.vatAmount,
        totalAmount: transaction.totalAmount,
        cashReceived: transaction.cashReceived,
        change: transaction.change,
        status: transaction.status,
        voidedAt: transaction.voidedAt,
        voidReason: transaction.voidReason,
        receiptSnapshot: transaction.receiptSnapshot,
      })),
    });
  } catch (error) {
    return STAFF_handleBillingError(res, error);
  }
};

export const STAFF_voidTransaction = async (req, res) => {
  try {
    const transaction = await STAFF_voidBillingTransaction({
      transactionId: req.params.id,
      staffId: req.user.id,
      reason: req.body.reason,
      editedData: req.body.editedData,
    });

    return res.status(200).json({
      message: "Transaction voided successfully",
      data: {
        transactionId: transaction._id,
        status: transaction.status,
        voidedAt: transaction.voidedAt,
        voidReason: transaction.voidReason,
        editedPatientId: transaction.editedPatientId,
        editedPatientName: transaction.editedPatientName,
        editedItems: transaction.editedItems,
        voidNotes: transaction.voidNotes,
      },
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

export const STAFF_getBillingProducts = async (req, res) => {
  try {
    const { category } = req.query;

    const filter = {
      isArchived: { $ne: true },
    };

    if (category && category !== "All Items") {
      filter.category = String(category).trim();
    }

    const products = await Product.find(filter)
      .sort({ name: 1 })
      .select("_id name category quantity unitPrice")
      .lean();

    const data = products.map((product) => ({
      id: product._id,
      name: product.name,
      category: product.category,
      stock: product.quantity,
      price: product.unitPrice ?? 0,
    }));

    return res.status(200).json({
      count: data.length,
      data,
    });
  } catch (error) {
    return STAFF_handleBillingError(res, error);
  }
};
