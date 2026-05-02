import { getStockLogs, getStockLogSummary } from "../services/Owner_StockLog.service.js";
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
      search: req.query.search,
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
      search: req.query.search,
    });

    return res.status(200).json({
      message: "Stock log summary fetched successfully",
      data: summary,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Generate Monthly Physical Inventory Report (batch-level)
export const Owner_getMonthlyReport = async (req, res) => {
  try {
    const getCurrentMonth = () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    };

    const requestedMonth = typeof req.query.month === "string" ? req.query.month.trim() : "";
    const month = requestedMonth || getCurrentMonth();

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM format (e.g., 2026-03)",
      });
    }

    const startDate = typeof req.query.startDate === "string" ? req.query.startDate.trim() : "";
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate.trim() : "";
    const hasDateRange = Boolean(startDate && endDate);

    if ((startDate && !endDate) || (!startDate && endDate)) {
      return res.status(400).json({
        message: "Please provide both startDate and endDate.",
      });
    }

    let startDateBoundary = null;
    let endDateBoundary = null;
    if (hasDateRange) {
      startDateBoundary = new Date(`${startDate}T00:00:00`);
      endDateBoundary = new Date(`${endDate}T23:59:59.999`);

      if (
        Number.isNaN(startDateBoundary.getTime()) ||
        Number.isNaN(endDateBoundary.getTime()) ||
        startDateBoundary > endDateBoundary
      ) {
        return res.status(400).json({
          message: "Invalid date range. Ensure endDate is on or after startDate.",
        });
      }
    }

    console.log("[MonthlyReport] Request:", { month, startDate, endDate, hasDateRange });

    // Fetch all active products
    const products = await Product.find({ isArchived: { $ne: true } }).lean();
    console.log("[MonthlyReport] Active products found:", products.length);

    const productIds = products.map((p) => p._id);
    const productsMap = new Map(products.map((p) => [p._id.toString(), p]));

    // Fetch all batches for active products
    const allBatches = await InventoryBatch.find({ product: { $in: productIds } }).lean();

    // Fetch saved physical inventory checks for this month
    const savedChecks = await PhysicalInventoryCheck.find({ month }).lean();
    const checksMap = new Map();
    savedChecks.forEach((check) => {
      const key = check.batch
        ? `${check.product.toString()}_${check.batch.toString()}`
        : check.product.toString();
      checksMap.set(key, check);
    });

    // Group batches by product
    const batchesByProduct = new Map();
    allBatches.forEach((batch) => {
      const pid = batch.product.toString();
      if (!batchesByProduct.has(pid)) batchesByProduct.set(pid, []);
      batchesByProduct.get(pid).push(batch);
    });

    // Build report: one row per batch
    const reportData = [];

    for (const product of products) {
      const pid = product._id.toString();
      const productBatches = batchesByProduct.get(pid) || [];

      if (productBatches.length === 0) {
        // Product without batches — single row
        const savedCheck = checksMap.get(pid);
        const systemStock = product.quantity || 0;
        const physicalCount = savedCheck ? savedCheck.physicalCount : null;
        const variance =
          physicalCount !== null ? physicalCount - systemStock : 0;

        reportData.push({
          itemId: pid,
          batchId: null,
          itemName: product.name,
          genericName: product.genericName || "",
          batchNumber: "",
          systemStock,
          expiryDate: product.expiryDate || null,
          dateAdded: product.createdAt || null,
          physicalCount,
          variance,
        });
      } else {
        // One row per batch
        for (const batch of productBatches) {
          const bid = batch._id.toString();
          const checkKey = `${pid}_${bid}`;
          const savedCheck = checksMap.get(checkKey);
          const systemStock = Number(batch.currentQuantity ?? batch.quantity ?? 0);
          const physicalCount = savedCheck ? savedCheck.physicalCount : null;
          const variance =
            physicalCount !== null ? physicalCount - systemStock : 0;

          reportData.push({
            itemId: pid,
            batchId: bid,
            itemName: product.name,
            genericName: product.genericName || "",
            batchNumber: batch.batchNumber || "",
            systemStock,
            expiryDate: batch.expiryDate || null,
            dateAdded: batch.createdAt || null,
            physicalCount,
            variance,
          });
        }
      }
    }

    // Sort by item name, then batch number
    reportData.sort((a, b) => {
      const nameCompare = a.itemName.localeCompare(b.itemName);
      if (nameCompare !== 0) return nameCompare;
      return (a.batchNumber || "").localeCompare(b.batchNumber || "");
    });

    // Keep only rows with stock
    const activeItems = reportData.filter((item) => item.systemStock > 0);

    // Apply filter priority:
    // 1) startDate + endDate on Date Added
    // 2) selected month (Date Added)
    // 3) default current month if month not provided
    const [selectedYear, selectedMonth] = month.split("-").map(Number);
    const filteredItems = activeItems.filter((item) => {
      if (hasDateRange) {
        if (!item?.dateAdded) return false;
        const dateAdded = new Date(item.dateAdded);
        if (Number.isNaN(dateAdded.getTime())) return false;
        return dateAdded >= startDateBoundary && dateAdded <= endDateBoundary;
      }

      if (!item?.dateAdded) return false;
      const dateAdded = new Date(item.dateAdded);
      if (Number.isNaN(dateAdded.getTime())) return false;
      return (
        dateAdded.getFullYear() === selectedYear &&
        dateAdded.getMonth() + 1 === selectedMonth
      );
    });

    const summary = {
      totalItems: filteredItems.length,
      totalSystemStock: filteredItems.reduce(
        (sum, item) => sum + item.systemStock,
        0
      ),
      itemsWithVariance: filteredItems.filter((item) => item.variance !== 0)
        .length,
      totalVariance: filteredItems.reduce((sum, item) => sum + item.variance, 0),
    };

    console.log(
      "[MonthlyReport] Report generated — rows:",
      filteredItems.length,
      "system stock:",
      summary.totalSystemStock
    );

    return res.status(200).json({
      message: "Monthly report generated successfully",
      data: filteredItems,
      summary,
      month: {
        year: Number(month.split("-")[0]),
        month: Number(month.split("-")[1]),
      },
      appliedFilter: hasDateRange
        ? {
          type: "dateRange",
          dateField: "dateAdded",
          startDate,
          endDate,
        }
        : {
          type: "month",
          dateField: "dateAdded",
          month,
        },
    });
  } catch (error) {
    console.error("Error generating monthly report:", error);
    return res.status(500).json({
      message: error.message || "Failed to generate monthly report",
    });
  }
};

// Submit physical inventory variance (batch-level)
export const Owner_submitVariance = async (req, res) => {
  try {
    const { items, month } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM format (e.g., 2026-03)",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items provided" });
    }

    const results = [];

    for (const entry of items) {
      const { itemId, batchId, physicalCount, systemStock } = entry;
      const parsedPhysicalCount = Number(physicalCount);

      if (!itemId || !Number.isFinite(parsedPhysicalCount)) {
        continue;
      }

      const product = await Product.findOne({
        _id: itemId,
        isArchived: { $ne: true },
      });

      if (!product) continue;

      const sysStock = Number.isFinite(Number(systemStock))
        ? Number(systemStock)
        : 0;
      const variance = parsedPhysicalCount - sysStock;

      // Upsert physical inventory check record (batch-level)
      const filter = batchId
        ? { product: itemId, batch: batchId, month }
        : { product: itemId, batch: null, month };

      const check = await PhysicalInventoryCheck.findOneAndUpdate(
        filter,
        {
          systemStock: sysStock,
          variance,
          physicalCount: parsedPhysicalCount,
          checkedBy: req.user.id,
          checkedByEmail: req.user.email,
          dateChecked: new Date(),
        },
        { upsert: true, new: true }
      );

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
        description: `Physical inventory check for ${product.name}${batchId ? " (batch)" : ""} — variance: ${variance}`,
        details: {
          itemName: product.name,
          batchId: batchId || null,
          month,
          systemStock: sysStock,
          physicalCount: parsedPhysicalCount,
          variance,
          checkedBy: req.user.email,
        },
      });

      results.push({
        itemId: product._id,
        batchId: batchId || null,
        itemName: product.name,
        variance,
        physicalCount: parsedPhysicalCount,
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
