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
  authorizeRoles("owner", "admin"),
  getDashboardSummary
);

router.get(
  "/revenue-trend",
  protect,
  authorizeRoles("owner", "admin"),
  getRevenueTrend
);

router.get(
  "/pending-requests",
  protect,
  authorizeRoles("owner", "admin"),
  getPendingInventoryRequests
);

router.get(
  "/low-stock",
  protect,
  authorizeRoles("owner", "admin"),
  getLowStockItems
);

router.get(
  "/activity",
  protect,
  authorizeRoles("owner", "admin"),
  getRecentActivity
);

router.get(
  "/stock-movements",
  protect,
  authorizeRoles("owner", "admin"),
  getStockMovements
);

export default router;