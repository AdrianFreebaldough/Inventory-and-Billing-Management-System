import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import { STAFF_getMyActivityLogs } from "../controllers/STAFF_activityLogController.js";

const STAFF_router = express.Router();

STAFF_router.use(protect, authorizeRoles("staff"));

STAFF_router.get("/", STAFF_getMyActivityLogs);

export default STAFF_router;
