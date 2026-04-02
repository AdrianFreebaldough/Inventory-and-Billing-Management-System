import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  STAFF_getLowStockItems,
  STAFF_createStockRequest,
  STAFF_getStockRequests,
} from "../controllers/STAFF_stockRequestController.js";

const router = express.Router();

router.use(protect, authorizeRoles("staff"));

router.get("/low-stock-items", STAFF_getLowStockItems);
router.post("/", STAFF_createStockRequest);
router.get("/", STAFF_getStockRequests);

export default router;
