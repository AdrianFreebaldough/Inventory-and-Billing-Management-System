import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  STAFF_completeTransaction,
  STAFF_createTransaction,
  STAFF_getHistory,
  STAFF_getReceipt,
  STAFF_proceedToPayment,
} from "../controllers/STAFF_billingController.js";

const STAFF_router = express.Router();

STAFF_router.use(protect, authorizeRoles("staff"));

STAFF_router.post("/create", STAFF_createTransaction);
STAFF_router.post("/:id/proceed-payment", STAFF_proceedToPayment);
STAFF_router.post("/:id/complete", STAFF_completeTransaction);
STAFF_router.get("/history", STAFF_getHistory);
STAFF_router.get("/:id/receipt", STAFF_getReceipt);

export default STAFF_router;
