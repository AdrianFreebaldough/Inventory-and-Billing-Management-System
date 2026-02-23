import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";

const router = express.Router();

/* OWNER ONLY */
router.post(
  "/add",
  protect,
  authorizeRoles("owner"),
  (req, res) => {
    res.json({ message: "Inventory item added" });
  }
);

/* OWNER + STAFF */
router.get(
  "/",
  protect,
  authorizeRoles("owner", "staff"),
  (req, res) => {
    res.json({ message: "Inventory list" });
  }
);

export default router;