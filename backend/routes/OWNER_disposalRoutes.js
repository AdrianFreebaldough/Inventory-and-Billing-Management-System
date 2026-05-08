import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import {
  OWNER_getDisposalLogs,
  OWNER_getDisposalLogDetails,
  OWNER_createDisposalRequest,
  OWNER_approveDisposalRequest,
  OWNER_directDisposal,
  OWNER_rejectDisposalRequest,
} from "../controllers/OWNER_disposalController.js";

const OWNER_disposalRouter = express.Router();

OWNER_disposalRouter.use(protect, authorizeRoles("owner", "admin"));

OWNER_disposalRouter.get("/", OWNER_getDisposalLogs);
OWNER_disposalRouter.get("/:id", OWNER_getDisposalLogDetails);
OWNER_disposalRouter.post("/", OWNER_createDisposalRequest);
OWNER_disposalRouter.post("/direct", OWNER_directDisposal);
OWNER_disposalRouter.patch("/:id/approve", OWNER_approveDisposalRequest);
OWNER_disposalRouter.patch("/:id/reject", OWNER_rejectDisposalRequest);

export default OWNER_disposalRouter;