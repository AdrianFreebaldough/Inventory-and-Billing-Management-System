import express from "express";
import env from "../config/env.js";
import {
	getPARMSInvoiceByReference,
	upsertPARMSBillingIntent,
} from "../controllers/billingController.js";

const router = express.Router();

const requireIBMSIntegrationAuth = (req, res, next) => {
	const configuredToken = String(env.IBMS_INTEGRATION_TOKEN || "").trim();
	if (!configuredToken) {
		return res.status(503).json({ message: "IBMS integration auth is not configured" });
	}

	const authorizationHeader = String(req.headers.authorization || "").trim();
	const isBearer = authorizationHeader.toLowerCase().startsWith("bearer ");

	if (!isBearer) {
		return res.status(401).json({ message: "Missing Bearer token" });
	}

	const incomingToken = authorizationHeader.slice(7).trim();
	if (!incomingToken || incomingToken !== configuredToken) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	return next();
};

router.use(requireIBMSIntegrationAuth);

router.post("/billing-intents", upsertPARMSBillingIntent);
router.get("/invoices/:ibmsReference", getPARMSInvoiceByReference);

export default router;
