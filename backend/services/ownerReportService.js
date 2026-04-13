import Product from "../models/product.js";
import User from "../models/user.js";
import Owner_StockLog from "../models/Owner_StockLog.model.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";

const CATEGORY_BUCKETS = ["Medications", "Medical Supplies", "Diagnostic Kits", "Vaccines"];

const toStartOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const toEndOfDay = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const addDays = (baseDate, days) => {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
};

const addMonths = (baseDate, months) => {
  const date = new Date(baseDate);
  date.setMonth(date.getMonth() + months);
  return date;
};

const normalizePeriodLabel = (period) => String(period || "Last Week").trim();

const toPercentString = (currentValue, previousValue) => {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);

  if (previous === 0) {
    return current === 0 ? "0.0%" : "100.0%";
  }

  const percent = Math.abs(((current - previous) / previous) * 100);
  return `${percent.toFixed(1)}%`;
};

const toTrendDirection = (currentValue, previousValue) => {
  return Number(currentValue || 0) >= Number(previousValue || 0) ? "up" : "down";
};

const normalizeCategoryBucket = (rawCategory) => {
  const value = String(rawCategory || "").trim().toLowerCase();

  if (!value) return "Medications";
  if (
    value.includes("service") ||
    value.includes("consult") ||
    value.includes("follow") ||
    value.includes("checkup") ||
    value.includes("visit")
  ) {
    return "Services";
  }
  if (value.includes("vaccine") || value.includes("immun")) return "Vaccines";
  if (value.includes("diagnostic") || value.includes("kit") || value.includes("test")) {
    return "Diagnostic Kits";
  }
  if (
    value.includes("supply") ||
    value.includes("ppe") ||
    value.includes("equipment") ||
    value.includes("care")
  ) {
    return "Medical Supplies";
  }

  return "Medications";
};

const SALES_SERVICE_CATEGORY_ALIASES = new Set([
  "service",
  "services",
  "consultation",
  "follow-up",
  "follow up",
  "routine checkup",
  "general consultation",
  "lab test",
  "laboratory",
  "vaccination",
  "immunization",
]);

const SALES_SERVICE_NAME_PATTERN = /(consult|checkup|follow[\s-]?up|lab\s*test|urinalysis|blood\s*test|vaccination|immunization)/i;

const isSalesServiceEntry = ({ rawCategory, itemName }) => {
  const categoryValue = String(rawCategory || "").trim().toLowerCase();
  const itemLabel = String(itemName || "").trim();

  if (SALES_SERVICE_CATEGORY_ALIASES.has(categoryValue)) return true;
  if (
    categoryValue.includes("service") ||
    categoryValue.includes("consult") ||
    categoryValue.includes("checkup") ||
    categoryValue.includes("follow") ||
    categoryValue.includes("lab test")
  ) {
    return true;
  }

  return SALES_SERVICE_NAME_PATTERN.test(itemLabel);
};

const resolvePeriodConfig = (period) => {
  const requested = normalizePeriodLabel(period);
  const now = new Date();
  const monthLabel = (dateValue) =>
    dateValue.toLocaleString("en-US", { month: "short" });

  if (requested === "Last Month") {
    const start = toStartOfDay(addDays(now, -27));
    const end = toEndOfDay(now);
    const labels = ["Week 1", "Week 2", "Week 3", "Week 4"];

    return {
      period: requested,
      start,
      end,
      previousStart: addDays(start, -28),
      previousEnd: addDays(end, -28),
      labels,
      bucketIndexFromDate(dateValue) {
        const diffMs = new Date(dateValue).getTime() - start.getTime();
        const dayOffset = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
        return Math.min(3, Math.floor(dayOffset / 7));
      },
    };
  }

  if (requested === "Last 3 Months") {
    const start = toStartOfDay(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const end = toEndOfDay(now);
    const labels = [
      monthLabel(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
      monthLabel(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      monthLabel(new Date(now.getFullYear(), now.getMonth(), 1)),
    ];

    return {
      period: requested,
      start,
      end,
      previousStart: toStartOfDay(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
      previousEnd: toEndOfDay(new Date(now.getFullYear(), now.getMonth() - 3, 0)),
      labels,
      bucketIndexFromDate(dateValue) {
        const date = new Date(dateValue);
        return (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
      },
    };
  }

  if (requested === "Last 6 Months") {
    const start = toStartOfDay(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    const end = toEndOfDay(now);
    const labels = Array.from({ length: 6 }, (_, index) =>
      monthLabel(new Date(start.getFullYear(), start.getMonth() + index, 1))
    );

    return {
      period: requested,
      start,
      end,
      previousStart: toStartOfDay(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
      previousEnd: toEndOfDay(new Date(now.getFullYear(), now.getMonth() - 6, 0)),
      labels,
      bucketIndexFromDate(dateValue) {
        const date = new Date(dateValue);
        return (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
      },
    };
  }

  if (requested === "This Year") {
    const start = toStartOfDay(new Date(now.getFullYear(), 0, 1));
    const end = toEndOfDay(now);
    const labels = Array.from({ length: 12 }, (_, monthIndex) =>
      monthLabel(new Date(now.getFullYear(), monthIndex, 1))
    );

    return {
      period: requested,
      start,
      end,
      previousStart: toStartOfDay(new Date(now.getFullYear() - 1, 0, 1)),
      previousEnd: toEndOfDay(new Date(now.getFullYear() - 1, 11, 31)),
      labels,
      bucketIndexFromDate(dateValue) {
        return new Date(dateValue).getMonth();
      },
    };
  }

  const start = toStartOfDay(addDays(now, -6));
  const end = toEndOfDay(now);
  const labels = Array.from({ length: 7 }, (_, index) => {
    const current = addDays(start, index);
    return current.toLocaleString("en-US", { weekday: "short" });
  });

  return {
    period: "Last Week",
    start,
    end,
    previousStart: addDays(start, -7),
    previousEnd: addDays(end, -7),
    labels,
    bucketIndexFromDate(dateValue) {
      const diffMs = new Date(dateValue).getTime() - start.getTime();
      return Math.floor(diffMs / (24 * 60 * 60 * 1000));
    },
  };
};

const buildBillingRangeFilter = (fieldName, config) => ({
  [fieldName]: {
    $gte: config.start,
    $lte: config.end,
  },
});

const accumulateSeries = ({ config, records, datePicker, valuePicker }) => {
  const values = Array.from({ length: config.labels.length }, () => 0);

  for (const record of records) {
    const dateValue = datePicker(record);
    if (!dateValue) continue;

    const index = config.bucketIndexFromDate(dateValue);
    if (!Number.isInteger(index) || index < 0 || index >= values.length) {
      continue;
    }

    values[index] += Number(valuePicker(record) || 0);
  }

  return values.map((value) => Number(value.toFixed(2)));
};

const getCompletedTransactionsInRange = async (config) => {
  return STAFF_BillingTransaction.find({
    status: "COMPLETED",
    ...buildBillingRangeFilter("completedAt", config),
  })
    .select("staffId patientId patientName items subtotal discountAmount totalAmount completedAt createdAt receiptSnapshot")
    .lean();
};

const getPreviousCompletedSummary = async (config) => {
  return STAFF_BillingTransaction.aggregate([
    {
      $match: {
        status: "COMPLETED",
        completedAt: {
          $gte: config.previousStart,
          $lte: config.previousEnd,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" },
        transactionCount: { $sum: 1 },
      },
    },
  ]);
};

export const getSalesReportData = async ({ period }) => {
  const config = resolvePeriodConfig(period);
  const transactions = await getCompletedTransactionsInRange(config);
  const previousSummaryAgg = await getPreviousCompletedSummary(config);
  const previousSummary = previousSummaryAgg[0] || { totalRevenue: 0, transactionCount: 0 };

  const revenueSeries = accumulateSeries({
    config,
    records: transactions,
    datePicker: (row) => row.completedAt,
    valuePicker: (row) => row.totalAmount,
  });

  const transactionSeries = accumulateSeries({
    config,
    records: transactions,
    datePicker: (row) => row.completedAt,
    valuePicker: () => 1,
  });

  const allItems = transactions.flatMap((transaction) =>
    (Array.isArray(transaction.items) ? transaction.items : []).map((item) => ({
      ...item,
      transactionId: transaction._id,
    }))
  );

  const productIds = [...new Set(allItems.map((item) => String(item.productId || "")).filter(Boolean))];
  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id category")
    .lean();
  const productCategoryMap = new Map(products.map((product) => [String(product._id), product.category || "Uncategorized"]));

  const itemBreakdownMap = new Map();
  let servicesRevenue = 0;
  let productsRevenue = 0;

  for (const item of allItems) {
    const amount = Number(item.lineTotal || 0);
    const quantity = Number(item.quantity || 0);
    const rawCategory = String(productCategoryMap.get(String(item.productId || "")) || "").trim();
    const isService = isSalesServiceEntry({ rawCategory, itemName: item.name || "" });
    const category = isService ? "Services" : "Products";
    const subCategory = rawCategory || "Uncategorized";
    const key = `${String(item.productId || "")}|${String(item.name || "Unknown")}|${category}`;

    if (!itemBreakdownMap.has(key)) {
      itemBreakdownMap.set(key, {
        category,
        subCategory,
        item: item.name || "Unknown",
        timesAvailed: 0,
        totalRevenue: 0,
      });
    }

    const aggregate = itemBreakdownMap.get(key);
    aggregate.timesAvailed += quantity;
    aggregate.totalRevenue += amount;
    if (isService) {
      servicesRevenue += amount;
    } else {
      productsRevenue += amount;
    }
  }

  const table = [...itemBreakdownMap.values()]
    .map((row) => ({
      ...row,
      timesAvailed: Number(row.timesAvailed.toFixed(2)),
      totalRevenue: Number(row.totalRevenue.toFixed(2)),
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const topServicesRows = table.filter((row) => row.category === "Services").slice(0, 5);
  const totalRevenue = Number(transactions.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0).toFixed(2));
  const totalTransactions = transactions.length;
  const averageTransaction = totalTransactions ? Number((totalRevenue / totalTransactions).toFixed(2)) : 0;
  const previousAverageTransaction = previousSummary.transactionCount
    ? Number((Number(previousSummary.totalRevenue || 0) / Number(previousSummary.transactionCount || 1)).toFixed(2))
    : 0;

  return {
    period: config.period,
    chart: {
      labels: config.labels,
      revenue: revenueSeries,
      transactions: transactionSeries,
    },
    servicesChart: {
      labels: ["Services", "Products"],
      data: [Number(servicesRevenue.toFixed(2)), Number(productsRevenue.toFixed(2))],
    },
    topServicesChart: {
      labels: topServicesRows.map((row) => row.item),
      data: topServicesRows.map((row) => Number(row.totalRevenue.toFixed(2))),
    },
    stats: {
      totalRevenue,
      totalTransactions,
      averageTransaction,
      revenueTrend: toTrendDirection(totalRevenue, previousSummary.totalRevenue),
      revenueTrendPercent: toPercentString(totalRevenue, previousSummary.totalRevenue),
      transactionsTrend: toTrendDirection(totalTransactions, previousSummary.transactionCount),
      transactionsTrendPercent: toPercentString(totalTransactions, previousSummary.transactionCount),
      averageTrend: toTrendDirection(averageTransaction, previousAverageTransaction),
      averageTrendPercent: toPercentString(averageTransaction, previousAverageTransaction),
    },
    table,
  };
};

const makeCategoryTotals = () => ({
  medications: { inStock: 0, lowStock: 0, outOfStock: 0 },
  medicalSupplies: { inStock: 0, lowStock: 0, outOfStock: 0 },
  diagnosticKits: { inStock: 0, lowStock: 0, outOfStock: 0 },
  vaccines: { inStock: 0, lowStock: 0, outOfStock: 0 },
});

const toCategoryKey = (categoryBucket) => {
  if (categoryBucket === "Vaccines") return "vaccines";
  if (categoryBucket === "Diagnostic Kits") return "diagnosticKits";
  if (categoryBucket === "Medical Supplies") return "medicalSupplies";
  return "medications";
};

const getNetStockMovement = async (config) => {
  const aggregate = await Owner_StockLog.aggregate([
    {
      $match: {
        createdAt: {
          $gte: config.start,
          $lte: config.end,
        },
      },
    },
    {
      $group: {
        _id: null,
        net: { $sum: "$quantityChange" },
      },
    },
  ]);

  return Number(aggregate[0]?.net || 0);
};

export const getInventoryReportData = async ({ period }) => {
  const config = resolvePeriodConfig(period);
  const [products, transactions, netMovementCurrent] = await Promise.all([
    Product.find({ isArchived: { $ne: true } })
      .select("_id name category quantity status")
      .lean(),
    getCompletedTransactionsInRange(config),
    getNetStockMovement(config),
  ]);

  const categoryTotals = makeCategoryTotals();

  let totalItems = 0;
  let inStockItems = 0;
  let lowStockItems = 0;
  let outOfStockItems = 0;

  for (const product of products) {
    const categoryBucket = normalizeCategoryBucket(product.category);
    if (categoryBucket === "Services") continue;
    const categoryKey = toCategoryKey(categoryBucket);
    const productStatus = String(product.status || "").toLowerCase();
    totalItems += Number(product.quantity || 0);

    if (productStatus === "out") {
      outOfStockItems += 1;
      categoryTotals[categoryKey].outOfStock += 1;
    } else if (productStatus === "low") {
      lowStockItems += 1;
      categoryTotals[categoryKey].lowStock += 1;
    } else {
      inStockItems += 1;
      categoryTotals[categoryKey].inStock += 1;
    }
  }

  const productCategoryMap = new Map(products.map((product) => [String(product._id), normalizeCategoryBucket(product.category)]));

  const topProductUsageMap = new Map();
  const usageSeries = {
    medications: Array.from({ length: config.labels.length }, () => 0),
    vaccines: Array.from({ length: config.labels.length }, () => 0),
    medicalSupplies: Array.from({ length: config.labels.length }, () => 0),
    diagnosticKits: Array.from({ length: config.labels.length }, () => 0),
  };

  for (const transaction of transactions) {
    const index = config.bucketIndexFromDate(transaction.completedAt);
    const items = Array.isArray(transaction.items) ? transaction.items : [];

    for (const item of items) {
      const bucket = normalizeCategoryBucket(productCategoryMap.get(String(item.productId || "")));
      if (bucket === "Services") {
        continue;
      }

      const quantity = Number(item.quantity || 0);
      const amount = Number(item.lineTotal || 0);
      const key = `${String(item.productId || "")}|${String(item.name || "Unknown")}`;

      if (!topProductUsageMap.has(key)) {
        topProductUsageMap.set(key, {
          label: item.name || "Unknown",
          quantity: 0,
          revenue: 0,
        });
      }

      const usageAggregate = topProductUsageMap.get(key);
      usageAggregate.quantity += quantity;
      usageAggregate.revenue += amount;

      if (!Number.isInteger(index) || index < 0 || index >= config.labels.length) {
        continue;
      }

      const bucketKey = toCategoryKey(bucket);
      usageSeries[bucketKey][index] += quantity;
    }
  }

  const topProducts = [...topProductUsageMap.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const previousTotalItems = Number((totalItems - netMovementCurrent).toFixed(2));

  return {
    period: config.period,
    charts: {
      status: {
        labels: CATEGORY_BUCKETS,
        datasets: {
          inStock: [
            categoryTotals.medications.inStock,
            categoryTotals.medicalSupplies.inStock,
            categoryTotals.diagnosticKits.inStock,
            categoryTotals.vaccines.inStock,
          ],
          lowStock: [
            categoryTotals.medications.lowStock,
            categoryTotals.medicalSupplies.lowStock,
            categoryTotals.diagnosticKits.lowStock,
            categoryTotals.vaccines.lowStock,
          ],
          outOfStock: [
            categoryTotals.medications.outOfStock,
            categoryTotals.medicalSupplies.outOfStock,
            categoryTotals.diagnosticKits.outOfStock,
            categoryTotals.vaccines.outOfStock,
          ],
        },
      },
      topProducts: {
        labels: topProducts.map((row) => row.label),
        data: topProducts.map((row) => Number(row.quantity.toFixed(2))),
      },
      usageTrend: {
        labels: config.labels,
        datasets: {
          medications: usageSeries.medications.map((value) => Number(value.toFixed(2))),
          vaccines: usageSeries.vaccines.map((value) => Number(value.toFixed(2))),
          medicalSupplies: usageSeries.medicalSupplies.map((value) => Number(value.toFixed(2))),
          diagnosticKits: usageSeries.diagnosticKits.map((value) => Number(value.toFixed(2))),
        },
      },
    },
    stats: {
      totalItems: Number(totalItems.toFixed(2)),
      inStockItems,
      lowStockItems,
      outOfStockItems,
      totalItemsTrend: toTrendDirection(totalItems, previousTotalItems),
      totalItemsTrendPercent: toPercentString(totalItems, previousTotalItems),
      inStockTrend: "up",
      inStockTrendPercent: "0.0%",
      lowStockTrend: "up",
      lowStockTrendPercent: "0.0%",
      outOfStockTrend: "up",
      outOfStockTrendPercent: "0.0%",
    },
  };
};

const toDisplayTransactionStatus = (status) => {
  if (String(status || "").toUpperCase() === "VOIDED") {
    return "Voided";
  }
  return "Paid";
};

const formatLocalDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const getDiscountType = (discountAmount) => {
  return Number(discountAmount || 0) > 0 ? "Statutory" : "None";
};

export const getBillingReportData = async ({ period }) => {
  const config = resolvePeriodConfig(period);

  const [completedTransactions, previousSummaryAgg, cashiers, transactionRows] = await Promise.all([
    getCompletedTransactionsInRange(config),
    STAFF_BillingTransaction.aggregate([
      {
        $match: {
          status: "COMPLETED",
          completedAt: {
            $gte: config.previousStart,
            $lte: config.previousEnd,
          },
        },
      },
      {
        $group: {
          _id: null,
          grossBilled: { $sum: "$subtotal" },
          totalDiscounts: { $sum: "$discountAmount" },
          netCollection: { $sum: "$totalAmount" },
          totalTransactions: { $sum: 1 },
        },
      },
    ]),
    STAFF_BillingTransaction.aggregate([
      {
        $match: {
          status: "COMPLETED",
          ...buildBillingRangeFilter("completedAt", config),
        },
      },
      {
        $group: {
          _id: "$staffId",
          netCollected: { $sum: "$totalAmount" },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { netCollected: -1 } },
      { $limit: 10 },
    ]),
    STAFF_BillingTransaction.find({
      status: { $in: ["COMPLETED", "VOIDED"] },
      createdAt: {
        $gte: config.start,
        $lte: config.end,
      },
    })
      .select("staffId patientId subtotal discountAmount totalAmount status completedAt voidedAt createdAt receiptSnapshot")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const cashierIds = cashiers.map((row) => row._id).filter(Boolean);
  const transactionStaffIds = transactionRows.map((row) => row.staffId).filter(Boolean);
  const staffIds = [...new Set([...cashierIds, ...transactionStaffIds].map((id) => String(id)))];

  const staffUsers = await User.find({ _id: { $in: staffIds } })
    .select("_id name email")
    .lean();
  const staffMap = new Map(staffUsers.map((user) => [String(user._id), user.name || user.email || "Staff"]));

  const collectionGrossSeries = accumulateSeries({
    config,
    records: completedTransactions,
    datePicker: (row) => row.completedAt,
    valuePicker: (row) => row.subtotal,
  });

  const collectionNetSeries = accumulateSeries({
    config,
    records: completedTransactions,
    datePicker: (row) => row.completedAt,
    valuePicker: (row) => row.totalAmount,
  });

  const grossBilled = Number(
    completedTransactions.reduce((sum, row) => sum + Number(row.subtotal || 0), 0).toFixed(2)
  );
  const totalDiscounts = Number(
    completedTransactions.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0).toFixed(2)
  );
  const netCollection = Number(
    completedTransactions.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0).toFixed(2)
  );
  const averageTransaction = completedTransactions.length
    ? Number((netCollection / completedTransactions.length).toFixed(2))
    : 0;

  const previousSummary = previousSummaryAgg[0] || {
    grossBilled: 0,
    totalDiscounts: 0,
    netCollection: 0,
    totalTransactions: 0,
  };
  const previousAverage = previousSummary.totalTransactions
    ? Number((Number(previousSummary.netCollection || 0) / Number(previousSummary.totalTransactions || 1)).toFixed(2))
    : 0;

  const discountBreakdown = {
    statutory: totalDiscounts,
    senior: 0,
    pwd: 0,
  };

  const formattedCashiers = cashiers.map((row) => ({
    staff: staffMap.get(String(row._id)) || "Staff",
    netCollected: Number(Number(row.netCollected || 0).toFixed(2)),
    transactions: Number(row.transactions || 0),
  }));

  const transactions = transactionRows.map((row) => {
    const effectiveDate = row.completedAt || row.voidedAt || row.createdAt;
    const status = toDisplayTransactionStatus(row.status);
    const discountAmount = Number(row.discountAmount || 0);

    return {
      dateTime: formatLocalDateTime(effectiveDate),
      orNumber: row.receiptSnapshot?.receiptNumber || `TX-${String(row._id).slice(-6).toUpperCase()}`,
      patientId: row.patientId || "N/A",
      gross: Number(Number(row.subtotal || 0).toFixed(2)),
      discount: {
        amount: Number(discountAmount.toFixed(2)),
        type: getDiscountType(discountAmount),
      },
      netCollected: Number(Number(row.totalAmount || 0).toFixed(2)),
      status,
      staff: staffMap.get(String(row.staffId || "")) || "Staff",
    };
  });

  return {
    period: config.period,
    charts: {
      collectionTrend: {
        labels: config.labels,
        gross: collectionGrossSeries,
        net: collectionNetSeries,
      },
      discountBreakdown,
    },
    stats: {
      grossBilled,
      totalDiscounts,
      netCollection,
      avgTransaction: averageTransaction,
      grossBilledTrend: toTrendDirection(grossBilled, previousSummary.grossBilled),
      grossBilledTrendPercent: toPercentString(grossBilled, previousSummary.grossBilled),
      totalDiscountsTrend: toTrendDirection(totalDiscounts, previousSummary.totalDiscounts),
      totalDiscountsTrendPercent: toPercentString(totalDiscounts, previousSummary.totalDiscounts),
      netCollectionTrend: toTrendDirection(netCollection, previousSummary.netCollection),
      netCollectionTrendPercent: toPercentString(netCollection, previousSummary.netCollection),
      avgTransactionTrend: toTrendDirection(averageTransaction, previousAverage),
      avgTransactionTrendPercent: toPercentString(averageTransaction, previousAverage),
    },
    cashierRevenue: formattedCashiers,
    transactions,
  };
};
