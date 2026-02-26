import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
	STAFF_getInventory,
	STAFF_getInventoryItemDetails,
	STAFF_createAddItemRequest,
	STAFF_createRestockRequest,
	STAFF_archiveItem,
} from "../controllers/STAFF_inventoryController.js";

const STAFF_router = express.Router();

STAFF_router.get("/items", protect, authorizeRoles("staff"), STAFF_getInventory);
STAFF_router.get(
	"/items/:itemId",
	protect,
	authorizeRoles("staff"),
	STAFF_getInventoryItemDetails
);

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

STAFF_router.patch(
	"/items/:productId/archive",
	protect,
	authorizeRoles("staff"),
	STAFF_archiveItem
);

export default STAFF_router;
