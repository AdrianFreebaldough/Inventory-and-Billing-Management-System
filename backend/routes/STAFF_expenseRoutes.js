import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  STAFF_createExpense,
  STAFF_getExpenses,
} from "../controllers/STAFF_expenseController.js";

const router = express.Router();

router.use(protect, authorizeRoles("staff"));

router.post("/", STAFF_createExpense);
router.get("/", STAFF_getExpenses);

export default router;
