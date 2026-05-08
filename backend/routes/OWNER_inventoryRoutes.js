import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  OWNER_getActiveInventory,
  OWNER_getInventoryItemDetails,
  OWNER_getArchivedInventory,
  OWNER_addProduct,
  OWNER_getPendingInventoryRequests,
  OWNER_getAllInventoryRequests,
  OWNER_approveInventoryRequest,
  OWNER_rejectInventoryRequest,
  OWNER_archiveProduct,
  OWNER_restoreProduct,
  OWNER_adjustProductStock,
  OWNER_updateDiscrepancy,
  OWNER_updateProductPrice,
  OWNER_getPriceChangeRequests,
  OWNER_getPriceChangeRequestForProduct,
  OWNER_approvePriceChangeRequest,
  OWNER_rejectPriceChangeRequest,
} from "../controllers/OWNER_inventoryController.js";

const OWNER_router = express.Router();

/* 🔐 OWNER ONLY */
OWNER_router.use(protect, authorizeRoles("owner", "admin"));

/* 📦 INVENTORY */
OWNER_router.get("/", OWNER_getActiveInventory);
OWNER_router.get("/archived", OWNER_getArchivedInventory);
OWNER_router.get("/items/:itemId", OWNER_getInventoryItemDetails);
OWNER_router.post("/", OWNER_addProduct);

/* 📨 STAFF REQUESTS */
OWNER_router.get(
  "/requests/pending",
  OWNER_getPendingInventoryRequests
);

OWNER_router.get(
  "/requests/all",
  OWNER_getAllInventoryRequests
);

OWNER_router.patch(
  "/requests/:requestId/approve",
  OWNER_approveInventoryRequest
);

OWNER_router.patch(
  "/requests/:requestId/reject",
  OWNER_rejectInventoryRequest
);

/* 🗄️ ARCHIVE & RESTORE */
OWNER_router.patch(
  "/:productId/archive",
  OWNER_archiveProduct
);

OWNER_router.patch(
  "/:productId/restore",
  OWNER_restoreProduct
);

OWNER_router.patch("/:productId/adjust-stock", OWNER_adjustProductStock);
OWNER_router.patch("/:productId/discrepancy", OWNER_updateDiscrepancy);
OWNER_router.patch("/:productId/price", OWNER_updateProductPrice);
OWNER_router.get("/price-change-requests", OWNER_getPriceChangeRequests);
OWNER_router.get("/price-change-requests/product/:productId", OWNER_getPriceChangeRequestForProduct);
OWNER_router.patch("/price-change-requests/:requestId/approve", OWNER_approvePriceChangeRequest);
OWNER_router.patch("/price-change-requests/:requestId/reject", OWNER_rejectPriceChangeRequest);

export default OWNER_router;