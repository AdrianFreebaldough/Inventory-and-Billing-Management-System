import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
	OWNER_createStaffUser,
  OWNER_getStaffUsers,
  OWNER_updateStaffUser,
  OWNER_archiveStaffUser,
  OWNER_getActivityLogs,
} from "../controllers/Owner_UserManagement.js";

const OWNER_userManagementRouter = express.Router();

OWNER_userManagementRouter.use(protect, authorizeRoles("owner"));

OWNER_userManagementRouter.post("/users", OWNER_createStaffUser);
OWNER_userManagementRouter.get("/users", OWNER_getStaffUsers);
OWNER_userManagementRouter.put("/users/:id", OWNER_updateStaffUser);
OWNER_userManagementRouter.put("/users/:id/archive", OWNER_archiveStaffUser);
OWNER_userManagementRouter.get("/activity-logs", OWNER_getActivityLogs);

export default OWNER_userManagementRouter;
