import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
	STAFF_getInventory,
	STAFF_getInventoryItemDetails,
	STAFF_createAddItemRequest,
	STAFF_createRestockRequest,
	STAFF_archiveItem,
	STAFF_restoreItem,
	STAFF_getMyRequests,
	STAFF_createPriceChangeRequest,
	STAFF_getPendingPriceChangeForProduct,
} from "../controllers/STAFF_inventoryController.js";

const STAFF_router = express.Router();

/* ===== Inventory items ===== */
STAFF_router.get("/items", protect, authorizeRoles("staff"), STAFF_getInventory);
STAFF_router.get(
	"/items/:itemId",
	protect,
	authorizeRoles("staff"),
	STAFF_getInventoryItemDetails
);

/* ===== Inventory requests (add-item & restock) ===== */
STAFF_router.get("/requests/my", protect, authorizeRoles("staff"), STAFF_getMyRequests);

STAFF_router.post(
	"/requests/add-item",
	protect,
	authorizeRoles("staff"),
	STAFF_createAddItemRequest
);
STAFF_router.post(
	"/requests/restock",
	protect,
	authorizeRoles("staff"),
	STAFF_createRestockRequest
);
STAFF_router.post(
	"/requests/price-change",
	protect,
	authorizeRoles("staff"),
	STAFF_createPriceChangeRequest
);
STAFF_router.get(
	"/requests/price-change/product/:productId",
	protect,
	authorizeRoles("staff"),
	STAFF_getPendingPriceChangeForProduct
);

/* ===== Archive / Restore ===== */
STAFF_router.patch(
	"/items/:productId/archive",
	protect,
	authorizeRoles("staff"),
	STAFF_archiveItem
);

STAFF_router.patch(
	"/items/:productId/restore",
	protect,
	authorizeRoles("staff"),
	STAFF_restoreItem
);

export default STAFF_router;
