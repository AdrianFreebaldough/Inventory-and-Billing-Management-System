import {
  getBillingReportData,
  getInventoryReportData,
  getSalesReportData,
} from "../services/ownerReportService.js";

export const OWNER_getSalesReport = async (req, res) => {
  try {
    const data = await getSalesReportData({ period: req.query.period });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch sales report" });
  }
};

export const OWNER_getInventoryReport = async (req, res) => {
  try {
    const data = await getInventoryReportData({ period: req.query.period });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch inventory report" });
  }
};

export const OWNER_getBillingReport = async (req, res) => {
  try {
    const data = await getBillingReportData({ period: req.query.period });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch billing report" });
  }
};
