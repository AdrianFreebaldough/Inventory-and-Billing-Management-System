import express from "express";
import {
  getDashboardStats,
  getRevenueOverview,
  getPendingInventoryRequests,
  getLowStockItems,
  getRecentActivity,
} from "../controllers/dashboardController.js";

import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";

const router = express.Router();

/* ================= OWNER DASHBOARD ================= */
router.get(
  "/stats",
  protect,
  authorizeRoles("owner"),
  getDashboardStats
);

router.get(
  "/revenue",
  protect,
  authorizeRoles("owner"),
  getRevenueOverview
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

export default router;