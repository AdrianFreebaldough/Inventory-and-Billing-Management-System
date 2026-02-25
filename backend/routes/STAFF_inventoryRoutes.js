import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import { STAFF_createRestockRequest } from "../controllers/STAFF_inventoryController.js";

const STAFF_router = express.Router();

STAFF_router.use(protect, authorizeRoles("staff"));

STAFF_router.post("/restock-requests", STAFF_createRestockRequest);

export default STAFF_router;
