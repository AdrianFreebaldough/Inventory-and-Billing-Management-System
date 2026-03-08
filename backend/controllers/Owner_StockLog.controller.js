import { getStockLogs, getStockLogSummary } from "../services/Owner_StockLog.service.js";
import Owner_StockLog from "../models/Owner_StockLog.model.js";
import Product from "../models/product.js";
import InventoryBatch from "../models/InventoryBatch.js";
import PhysicalInventoryCheck from "../models/PhysicalInventoryCheck.js";
import ActivityLog from "../models/activityLog.js";

export const Owner_getStockLogs = async (req, res) => {
  try {
    const result = await getStockLogs({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      productId: req.query.productId,
      movementType: req.query.movementType,
      performedBy: req.query.performedBy,
      referenceId: req.query.referenceId,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({
      message: "Stock logs fetched successfully",
      ...result,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const Owner_getStockLogSummary = async (req, res) => {
  try {
    const summary = await getStockLogSummary({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      productId: req.query.productId,
      movementType: req.query.movementType,
      performedBy: req.query.performedBy,
      referenceId: req.query.referenceId,
    });

    return res.status(200).json({
      message: "Stock log summary fetched successfully",
      data: summary,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Generate Monthly Physical Inventory Report
export const Owner_getMonthlyReport = async (req, res) => {
  try {
    const { month } = req.query;
    console.log("[MonthlyReport] Requested month:", month);

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM format (e.g., 2026-03)",
      });
    }

    const [year, monthNum] = month.split("-").map(Number);

    // Calculate start and end dates for the month
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // Fetch all active products (handle missing isArchived field)
    const products = await Product.find({ isArchived: { $ne: true } }).lean();
    console.log("[MonthlyReport] Active products found:", products.length);

    // Fetch all batches for active products
    const productIds = products.map((p) => p._id);
    const allBatches = await InventoryBatch.find({ product: { $in: productIds } }).lean();

    // Fetch saved physical inventory checks for this month
    const savedChecks = await PhysicalInventoryCheck.find({ month })
      .populate("checkedBy", "name email")
      .lean();
    const checksMap = new Map();
    savedChecks.forEach((check) => {
      checksMap.set(check.product.toString(), check);
    });

    // Fetch all logs from month start to now so we can compute
    // accurate end-of-month qty for past months by reversing post-month changes
    const allLogs = await Owner_StockLog.find({
      createdAt: { $gte: startDate },
    }).lean();
    console.log("[MonthlyReport] Total logs since month start:", allLogs.length);

    // Build report per product
    const reportData = products.map((product) => {
      const productId = product._id.toString();
      const currentQty = product.quantity || 0;

      // Get batch info for this product
      const productBatches = allBatches
        .filter((b) => b.product.toString() === productId)
        .sort((a, b) => {
          if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
          if (a.expiryDate) return -1;
          return 1;
        });
      const nearestBatch = productBatches[0] || null;

      // Filter logs for this product (null-safe – skip orphaned logs)
      const productAllLogs = allLogs.filter(
        (log) => log.product && log.product.toString() === productId
      );

      // Split into logs DURING the month vs AFTER the month
      const monthLogs = productAllLogs.filter(
        (log) => new Date(log.createdAt) <= endDate
      );
      const postMonthLogs = productAllLogs.filter(
        (log) => new Date(log.createdAt) > endDate
      );

      // Reverse post-month changes to get end-of-month quantity
      const postMonthChanges = postMonthLogs.reduce(
        (sum, log) => sum + (log.quantityChange || 0),
        0
      );
      const endOfMonthQty = currentQty - postMonthChanges;

      // Reverse month changes to get beginning quantity
      const monthChanges = monthLogs.reduce(
        (sum, log) => sum + (log.quantityChange || 0),
        0
      );
      const beginningQty = Math.max(0, endOfMonthQty - monthChanges);

      // Items issued (SALE movements) during the month
      const totalIssued = monthLogs
        .filter((log) => log.movementType === "SALE")
        .reduce((sum, log) => sum + Math.abs(log.quantityChange || 0), 0);

      // Items restocked during the month
      const totalRestocked = monthLogs
        .filter((log) => log.movementType === "RESTOCK")
        .reduce((sum, log) => sum + Math.abs(log.quantityChange || 0), 0);

      // Net adjustments (ADJUST + VOID_REVERSAL) during the month
      const totalAdjusted = monthLogs
        .filter(
          (log) =>
            log.movementType === "ADJUST" ||
            log.movementType === "VOID_REVERSAL"
        )
        .reduce((sum, log) => sum + (log.quantityChange || 0), 0);

      // System quantity = end-of-month quantity (what the system recorded)
      const systemQty = Math.max(0, endOfMonthQty);

      // Check for saved physical inventory check
      const savedCheck = checksMap.get(productId);
      const variance = savedCheck ? savedCheck.variance : 0;
      const physicalCount = systemQty + variance;
      const actualBalance = physicalCount;

      return {
        itemId: productId,
        itemName: product.name,
        genericName: product.description || "",
        category: product.category || "",
        unit: product.unit || "pcs",
        batchNumber: nearestBatch?.batchNumber || product.batchNumber || "",
        expiryDate: nearestBatch?.expiryDate || product.expiryDate || null,
        beginningQty,
        itemsIssued: totalIssued,
        itemsRestocked: totalRestocked,
        adjustments: totalAdjusted,
        systemQty,
        actualBalance,
        physicalCount,
        variance,
        checkedBy: savedCheck?.checkedByEmail || null,
        dateChecked: savedCheck?.dateChecked || null,
      };
    });

    // Keep only items with meaningful data
    const activeItems = reportData.filter(
      (item) =>
        item.beginningQty > 0 || item.itemsIssued > 0 || item.systemQty > 0
    );

    // Summary statistics
    const summary = {
      totalItems: activeItems.length,
      totalIssued: activeItems.reduce((sum, item) => sum + item.itemsIssued, 0),
      totalRestocked: activeItems.reduce(
        (sum, item) => sum + item.itemsRestocked,
        0
      ),
      itemsWithVariance: activeItems.filter((item) => item.variance !== 0)
        .length,
      totalVariance: activeItems.reduce((sum, item) => sum + item.variance, 0),
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
    };

    console.log(
      "[MonthlyReport] Report generated — items:",
      activeItems.length,
      "issued:",
      summary.totalIssued
    );

    return res.status(200).json({
      message: "Monthly report generated successfully",
      data: activeItems,
      summary,
      month: {
        year,
        month: monthNum,
        label: startDate.toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
      },
    });
  } catch (error) {
    console.error("Error generating monthly report:", error);
    return res.status(500).json({
      message: error.message || "Failed to generate monthly report",
    });
  }
};

// Submit physical inventory variance
export const Owner_submitVariance = async (req, res) => {
  try {
    const { items, month } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM format (e.g., 2026-03)",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No variance items provided" });
    }

    const results = [];

    for (const entry of items) {
      const { itemId, variance, systemStock } = entry;
      const parsedVariance = Number(variance);

      if (!itemId || !Number.isFinite(parsedVariance)) {
        continue;
      }

      const product = await Product.findOne({
        _id: itemId,
        isArchived: { $ne: true },
      });

      if (!product) continue;

      const sysStock = Number.isFinite(Number(systemStock))
        ? Number(systemStock)
        : Number(product.quantity ?? 0);
      const physicalCount = sysStock + parsedVariance;

      // Upsert the physical inventory check record
      const check = await PhysicalInventoryCheck.findOneAndUpdate(
        { product: itemId, month },
        {
          systemStock: sysStock,
          variance: parsedVariance,
          physicalCount,
          checkedBy: req.user.id,
          checkedByEmail: req.user.email,
          dateChecked: new Date(),
        },
        { upsert: true, new: true }
      );

      // Update product discrepancy fields (reuse existing discrepancy logic)
      const previousVariance = product.variance || 0;
      product.expectedRemaining = Number(product.quantity ?? 0);
      product.physicalCount = physicalCount;
      product.variance = parsedVariance;
      product.discrepancyStatus = parsedVariance === 0 ? "Balanced" : "With Variance";
      await product.save();

      // Record in activity logs for audit trail
      await ActivityLog.create({
        action: "PHYSICAL_INVENTORY_CHECK",
        actionType: "OWNER_PHYSICAL_INVENTORY",
        category: "Inventory",
        actorId: req.user.id,
        actorRole: "OWNER",
        actorName: req.user.name || null,
        actorEmail: req.user.email || null,
        performedBy: req.user.id,
        entityType: "Product",
        entityId: product._id,
        description: `Physical inventory check for ${product.name} — variance: ${parsedVariance}`,
        details: {
          itemName: product.name,
          month,
          systemStock: sysStock,
          variance: parsedVariance,
          physicalCount,
          previousVariance,
          checkedBy: req.user.email,
        },
      });

      results.push({
        itemId: product._id,
        itemName: product.name,
        variance: parsedVariance,
        physicalCount,
        checkedBy: req.user.email,
        dateChecked: check.dateChecked,
      });
    }

    return res.status(200).json({
      message: `Physical inventory variance submitted for ${results.length} item(s)`,
      data: results,
    });
  } catch (error) {
    console.error("Error submitting physical inventory variance:", error);
    return res.status(500).json({
      message: error.message || "Failed to submit variance",
    });
  }
};
