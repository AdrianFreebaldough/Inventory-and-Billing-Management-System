import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  OWNER_getActiveInventory,
  OWNER_addProduct,
  OWNER_getPendingInventoryRequests,
  OWNER_approveInventoryRequest,
  OWNER_rejectInventoryRequest,
  OWNER_archiveProduct,
} from "../controllers/OWNER_inventoryController.js";

const OWNER_router = express.Router();

OWNER_router.use(protect, authorizeRoles("owner"));

OWNER_router.get("/inventory", OWNER_getActiveInventory);
OWNER_router.post("/inventory", OWNER_addProduct);
OWNER_router.get("/inventory/requests/pending", OWNER_getPendingInventoryRequests);
OWNER_router.patch("/inventory/requests/:requestId/approve", OWNER_approveInventoryRequest);
OWNER_router.patch("/inventory/requests/:requestId/reject", OWNER_rejectInventoryRequest);
OWNER_router.patch("/inventory/:productId/archive", OWNER_archiveProduct);

export default OWNER_router;
