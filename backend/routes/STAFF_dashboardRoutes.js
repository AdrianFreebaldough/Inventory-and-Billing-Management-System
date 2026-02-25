import express from "express";
import {
  STAFF_getDashboardSummary,
  STAFF_getRecentTransactions,
  STAFF_getInventoryAlerts,
  STAFF_getTopItemsToday,
  STAFF_getRecentItemUsage,
} from "../controllers/STAFF_dashboardController.js";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";

const STAFF_router = express.Router();

STAFF_router.use(protect, authorizeRoles("staff"));

STAFF_router.get("/summary", STAFF_getDashboardSummary);
STAFF_router.get("/recent-transactions", STAFF_getRecentTransactions);
STAFF_router.get("/inventory-alerts", STAFF_getInventoryAlerts);
STAFF_router.get("/top-items-today", STAFF_getTopItemsToday);
STAFF_router.get("/recent-item-usage", STAFF_getRecentItemUsage);

export default STAFF_router;
