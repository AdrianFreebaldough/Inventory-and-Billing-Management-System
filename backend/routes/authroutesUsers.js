import express from "express";
import {
  login,
  completeFirstLoginPasswordChange,
  createUser,
  getMyProfile,
} from "../controllers/authControllersUser.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/AuthMiddlewareUser.js";

const router = express.Router();

/* ================= AUTH ================= */
router.post("/login", login);
router.post("/first-login/change-password", completeFirstLoginPasswordChange);
router.get("/profile/me", protect, getMyProfile);

/* ================= USER MANAGEMENT ================= */
/* Owner-only: create users (saved to IBMS) */
router.post(
  "/users",
  protect,
  authorizeRoles("owner"),
  createUser
);

export default router;