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
import InventoryRequest from "../models/InventoryRequest.js";
import InventoryBatch from "../models/InventoryBatch.js";
import { classifyExpiryRisk, toUiExpiryRiskKey } from "../services/fefoService.js";
import { BATCH_EFFECTIVE_STATUS, getBatchEffectiveStatus, isBatchEligibleForBilling } from "../services/batchLifecycleService.js";

const STAFF_pickNearestBatch = (batches = []) => {
  return (Array.isArray(batches) ? batches : [])
    .filter((batch) => batch?.expiryDate)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0] || null;
};

const STAFF_sumEligibleBatchQuantity = (batches = [], referenceDate = new Date()) => {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  return (Array.isArray(batches) ? batches : []).reduce((sum, batch) => {
    const quantity = Number(batch?.currentQuantity ?? batch?.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return sum;
    if (!isBatchEligibleForBilling(batch, referenceDate)) return sum;
    if (!batch?.expiryDate) return sum + quantity;

    const expiry = new Date(batch.expiryDate);
    if (Number.isNaN(expiry.getTime())) return sum + quantity;
    expiry.setHours(0, 0, 0, 0);

    return expiry >= today ? sum + quantity : sum;
  }, 0);
};

const STAFF_handleBillingError = (res, error) => {
  if (error instanceof STAFF_BillingError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({ message: error.message || "Internal server error" });
};

const STAFF_normalizeCategoryValue = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return "";

  const canonicalMap = {
    antibiotic: "Antibiotic",
    antibiotics: "Antibiotic",
    medicine: "Medicine",
    medicines: "Medicine",
    analgesic: "Analgesic",
    analgesics: "Analgesic",
    antipyretic: "Antipyretic",
    antipyretics: "Antipyretic",
    antihistamine: "Antihistamine",
    antihistamines: "Antihistamine",
    antacid: "Antacid",
    antacids: "Antacid",
    vitamin: "Vitamin",
    vitamins: "Vitamin",
    vaccine: "Vaccine",
    vaccines: "Vaccine",
    "first aid": "First Aid",
    "first aid medical supplies": "First Aid",
    "first aid and medical supplies": "First Aid",
    "personal care": "Personal Care",
  };

  return canonicalMap[normalized] || normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const STAFF_buildCategoryFilterRegex = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return null;

  const aliases = {
    antibiotic: "antibiotic",
    antibiotics: "antibiotic",
    medicine: "medicine",
    medicines: "medicine",
    analgesic: "analgesic",
    analgesics: "analgesic",
    antipyretic: "antipyretic",
    antipyretics: "antipyretic",
    antihistamine: "antihistamine",
    antihistamines: "antihistamine",
    antacid: "antacid",
    antacids: "antacid",
    vitamin: "vitamin",
    vitamins: "vitamin",
    vaccine: "vaccine",
    vaccines: "vaccine",
    "first aid": "first aid",
    "first aid medical supplies": "first aid",
    "first aid and medical supplies": "first aid",
    "personal care": "personal care",
  };

  const canonical = aliases[normalized] || normalized;
  const escapedCanonical = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `^${escapedCanonical.replace(/\s+/g, "[-_\\s]*")}s?$`;
  return new RegExp(pattern, "i");
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
        batchUsage: (transaction.items || []).map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          allocations: (item.batchAllocations || []).map((allocation) => ({
            batchId: allocation.batchId,
            batchNumber: allocation.batchNumber,
            quantity: allocation.quantity,
            expiryDate: allocation.expiryDate,
            expiryRisk: allocation.expiryRisk,
          })),
        })),
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

    if (category && category !== "All Categories" && category !== "All Items") {
      const categoryRegex = STAFF_buildCategoryFilterRegex(category);
      if (categoryRegex) {
        filter.category = categoryRegex;
      }
    }

    const products = await Product.find(filter)
      .sort({ name: 1 })
      .select("_id name category quantity unitPrice strength expiryDate supplier genericName brandName dosageForm unit description medicineName status")
      .lean();

    const productIds = products.map((product) => product._id);
    const batches = await InventoryBatch.find({
      product: { $in: productIds },
      $or: [
        { currentQuantity: { $gt: 0 } },
        { currentQuantity: { $exists: false }, quantity: { $gt: 0 } },
      ],
    })
      .select("product quantity currentQuantity initialQuantity expiryDate batchNumber createdAt status")
      .sort({ expiryDate: 1, createdAt: 1, _id: 1 })
      .lean();

    const batchesByProduct = new Map();
    for (const batch of batches) {
      const key = String(batch.product);
      if (!batchesByProduct.has(key)) {
        batchesByProduct.set(key, []);
      }
      batchesByProduct.get(key).push(batch);
    }

    // Enrich products missing medicine-detail fields from their approved ADD_ITEM requests
    const productsNeedingFallback = products.filter(
      (p) => !p.brandName || !p.genericName || !p.dosageForm || !p.strength
    );

    const fallbackMap = new Map();
    if (productsNeedingFallback.length > 0) {
      const productIds = productsNeedingFallback.map((p) => p._id);
      const requests = await InventoryRequest.find({
        requestType: "ADD_ITEM",
        status: "approved",
        product: { $in: productIds },
      })
        .sort({ reviewedAt: -1, createdAt: -1 })
        .select("product genericName brandName dosageForm strength medicineName")
        .lean();

      for (const inventoryReq of requests) {
        const key = String(inventoryReq.product);
        if (!fallbackMap.has(key)) {
          fallbackMap.set(key, inventoryReq);
        }
      }
    }

    const data = products.map((product) => {
      const fallback = fallbackMap.get(String(product._id));
      const productBatches = batchesByProduct.get(String(product._id)) || [];
      const effectiveStatuses = productBatches.map((batch) => getBatchEffectiveStatus(batch));
      const eligibleBatches = productBatches.filter((batch) => {
        const quantity = Number(batch?.currentQuantity ?? batch?.quantity ?? 0);
        return Number.isFinite(quantity) && quantity > 0 && isBatchEligibleForBilling(batch);
      });
      const eligibleStock = productBatches.length
        ? STAFF_sumEligibleBatchQuantity(productBatches)
        : Number(product.quantity ?? 0);
      const hasSellableStock = eligibleStock > 0;
      const nearestSellableBatch = STAFF_pickNearestBatch(eligibleBatches);
      const nearestOverallBatch = STAFF_pickNearestBatch(productBatches);
      const nearestExpiryDate = hasSellableStock
        ? (nearestSellableBatch?.expiryDate || null)
        : (nearestOverallBatch?.expiryDate || product.expiryDate || null);
      const expiryRisk = classifyExpiryRisk(nearestExpiryDate);
      const expiryRiskKey = toUiExpiryRiskKey(expiryRisk);
      const totalBatchStock = productBatches.length
        ? productBatches.reduce((sum, batch) => sum + Number(batch?.currentQuantity ?? batch?.quantity ?? 0), 0)
        : Number(product.quantity ?? 0);

      let inventoryStatus = product.status;
      if (hasSellableStock) {
        const sellableEffectiveStatuses = eligibleBatches.map((batch) => getBatchEffectiveStatus(batch));
        inventoryStatus = sellableEffectiveStatuses.includes(BATCH_EFFECTIVE_STATUS.IMMEDIATE_REVIEW)
          ? "Immediate Review"
          : "In Stock";
      } else if (effectiveStatuses.includes(BATCH_EFFECTIVE_STATUS.DISPOSED)) {
        inventoryStatus = "Disposed";
      } else if (effectiveStatuses.includes(BATCH_EFFECTIVE_STATUS.PENDING_DISPOSAL)) {
        inventoryStatus = "Pending Disposal";
      } else if (effectiveStatuses.includes(BATCH_EFFECTIVE_STATUS.EXPIRED) || expiryRiskKey === "expired") {
        inventoryStatus = "Expired";
      } else if (effectiveStatuses.includes(BATCH_EFFECTIVE_STATUS.IMMEDIATE_REVIEW) || expiryRiskKey === "at-risk") {
        inventoryStatus = "Immediate Review";
      }

      const billingDisabled =
        inventoryStatus === "Disposed" ||
        inventoryStatus === "Expired" ||
        inventoryStatus === "Pending Disposal" ||
        eligibleStock <= 0;

      const stockForBillingDisplay = inventoryStatus === "Expired"
        ? totalBatchStock
        : eligibleStock;

      return {
        id: product._id,
        name: product.name,
        category: STAFF_normalizeCategoryValue(product.category),
        genericName: product.genericName || fallback?.genericName || null,
        brandName: product.brandName || fallback?.brandName || null,
        medicineName: product.medicineName || fallback?.medicineName || null,
        strength: product.strength || fallback?.strength || null,
        dosageForm: product.dosageForm || fallback?.dosageForm || null,
        unit: product.unit || null,
        branchName: null,
        description: product.description || null,
        expiryDate: nearestExpiryDate,
        nearestExpiryDate,
        expiryRisk,
        expiryRiskKey,
        inventoryStatus,
        isImmediateReview: inventoryStatus === "Immediate Review",
        billingDisabled,
        supplier: product.supplier || null,
        stock: stockForBillingDisplay,
        sellableStock: eligibleStock,
        totalStock: totalBatchStock,
        price: product.unitPrice ?? 0,
      };
    });

    return res.status(200).json({
      count: data.length,
      data,
    });
  } catch (error) {
    return STAFF_handleBillingError(res, error);
  }
};
