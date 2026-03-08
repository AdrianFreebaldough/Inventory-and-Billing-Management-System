import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  Owner_getStockLogSummary,
  Owner_getStockLogs,
  Owner_getMonthlyReport,
  Owner_submitVariance,
} from "../controllers/Owner_StockLog.controller.js";

const Owner_stockLogRouter = express.Router();

Owner_stockLogRouter.use(protect, authorizeRoles("owner"));

Owner_stockLogRouter.get("/", Owner_getStockLogs);
Owner_stockLogRouter.get("/summary", Owner_getStockLogSummary);
Owner_stockLogRouter.get("/monthly-report", Owner_getMonthlyReport);
Owner_stockLogRouter.post("/monthly-report/variance", Owner_submitVariance);

export default Owner_stockLogRouter;
