import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  STAFF_createQuantityAdjustment,
  STAFF_getQuantityAdjustments,
} from "../controllers/STAFF_quantityAdjustmentController.js";

const router = express.Router();

router.use(protect, authorizeRoles("staff"));

router.post("/", STAFF_createQuantityAdjustment);
router.get("/", STAFF_getQuantityAdjustments);

export default router;
