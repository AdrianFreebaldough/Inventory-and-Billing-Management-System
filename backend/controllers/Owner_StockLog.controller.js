import { getStockLogs, getStockLogSummary } from "../services/Owner_StockLog.service.js";

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
