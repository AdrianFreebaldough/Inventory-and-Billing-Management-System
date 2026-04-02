import express from "express";
import {
  getDashboardSummary,
  getRevenueTrend,
  getPendingInventoryRequests,
  getLowStockItems,
  getRecentActivity,
  getStockMovements,
} from "../controllers/dashboardController.js";

import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";

const router = express.Router();

/* ================= OWNER DASHBOARD ================= */
router.get(
  "/summary",
  protect,
  authorizeRoles("owner"),
  getDashboardSummary
);

router.get(
  "/revenue-trend",
  protect,
  authorizeRoles("owner"),
  getRevenueTrend
);

router.get(
  "/pending-requests",
  protect,
  authorizeRoles("owner"),
  getPendingInventoryRequests
);

router.get(
  "/low-stock",
  protect,
  authorizeRoles("owner"),
  getLowStockItems
);

router.get(
  "/activity",
  protect,
  authorizeRoles("owner"),
  getRecentActivity
);

router.get(
  "/stock-movements",
  protect,
  authorizeRoles("owner"),
  getStockMovements
);

export default router;