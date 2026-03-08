import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  OWNER_getQuantityAdjustments,
  OWNER_reviewQuantityAdjustment,
} from "../controllers/STAFF_quantityAdjustmentController.js";

const router = express.Router();

router.use(protect, authorizeRoles("owner"));

router.get("/", OWNER_getQuantityAdjustments);
router.patch("/:id/review", OWNER_reviewQuantityAdjustment);

export default router;
