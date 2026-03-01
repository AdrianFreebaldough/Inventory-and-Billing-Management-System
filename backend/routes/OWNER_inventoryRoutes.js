import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  OWNER_getActiveInventory,
  OWNER_addProduct,
  OWNER_getPendingInventoryRequests,
  OWNER_approveInventoryRequest,
  OWNER_rejectInventoryRequest,
  OWNER_archiveProduct,
  OWNER_adjustProductStock,
} from "../controllers/OWNER_inventoryController.js";

const OWNER_router = express.Router();

/* 🔐 OWNER ONLY */
OWNER_router.use(protect, authorizeRoles("owner"));

/* 📦 INVENTORY */
OWNER_router.get("/", OWNER_getActiveInventory);
OWNER_router.post("/", OWNER_addProduct);

/* 📨 STAFF REQUESTS */
OWNER_router.get(
  "/requests/pending",
  OWNER_getPendingInventoryRequests
);

OWNER_router.patch(
  "/requests/:requestId/approve",
  OWNER_approveInventoryRequest
);

OWNER_router.patch(
  "/requests/:requestId/reject",
  OWNER_rejectInventoryRequest
);

/* 🗄️ ARCHIVE */
OWNER_router.patch(
  "/:productId/archive",
  OWNER_archiveProduct
);

OWNER_router.patch("/:productId/adjust-stock", OWNER_adjustProductStock);

export default OWNER_router;