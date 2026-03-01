import express from "express";
import {
  login,
  createUser,
} from "../controllers/authControllersUser.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/AuthMiddlewareUser.js";

const router = express.Router();

/* ================= AUTH ================= */
router.post("/login", login);

/* ================= USER MANAGEMENT ================= */
/* Owner-only: create users (saved to IBMS) */
router.post(
  "/users",
  protect,
  authorizeRoles("owner"),
  createUser
);

export default router;