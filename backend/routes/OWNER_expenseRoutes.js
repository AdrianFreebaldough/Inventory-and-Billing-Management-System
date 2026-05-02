import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  OWNER_getExpenses,
  OWNER_updateExpenseStatus,
  OWNER_getExpenseSummary,
  OWNER_createExpense,
} from "../controllers/STAFF_expenseController.js";

const router = express.Router();

router.use(protect, authorizeRoles("owner"));

router.get("/", OWNER_getExpenses);
router.post("/", OWNER_createExpense);
router.get("/summary", OWNER_getExpenseSummary);
router.patch("/:id/status", OWNER_updateExpenseStatus);

export default router;
