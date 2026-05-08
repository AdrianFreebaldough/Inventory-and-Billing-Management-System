import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  OWNER_getStockRequests,
  OWNER_approveStockRequest,
} from "../controllers/STAFF_stockRequestController.js";

const router = express.Router();

router.use(protect, authorizeRoles("owner", "admin"));

router.get("/", OWNER_getStockRequests);
router.patch("/:id/approve", OWNER_approveStockRequest);

export default router;
