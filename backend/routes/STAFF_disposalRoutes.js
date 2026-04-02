import express from "express";
import { protect, authorizeRoles } from "../middleware/AuthMiddlewareUser.js";
import { STAFF_createDisposalRequest } from "../controllers/STAFF_disposalController.js";

const STAFF_disposalRouter = express.Router();

STAFF_disposalRouter.post("/", protect, authorizeRoles("staff"), STAFF_createDisposalRequest);

export default STAFF_disposalRouter;
