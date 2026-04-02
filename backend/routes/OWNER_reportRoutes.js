import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  OWNER_getBillingReport,
  OWNER_getInventoryReport,
  OWNER_getSalesReport,
} from "../controllers/ownerReportController.js";

const OWNER_reportRouter = express.Router();

OWNER_reportRouter.use(protect, authorizeRoles("owner"));

OWNER_reportRouter.get("/sales", OWNER_getSalesReport);
OWNER_reportRouter.get("/inventory", OWNER_getInventoryReport);
OWNER_reportRouter.get("/billing", OWNER_getBillingReport);

export default OWNER_reportRouter;
