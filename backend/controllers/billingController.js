import {
	getInvoiceByReference,
	upsertBillingIntentFromPARMS,
} from "../services/parmsBillingIntentService.js";

export const upsertPARMSBillingIntent = async (req, res) => {
	try {
		const idempotencyKey = String(req.headers["x-idempotency-key"] || "").trim();
		const correlationId = String(req.headers["x-correlation-id"] || "").trim();

		const result = await upsertBillingIntentFromPARMS({
			payload: req.body,
			idempotencyKey,
			correlationId,
		});

		return res.status(200).json({
			message: result.created ? "Billing intent created" : "Billing intent upserted",
			meta: {
				created: result.created,
				idempotentReplay: result.idempotentReplay,
				staleRevision: result.staleRevision,
			},
			data: result.projection,
		});
	} catch (error) {
		const statusCode = Number(error.statusCode || 500);
		return res.status(statusCode).json({ message: error.message || "Failed to upsert billing intent" });
	}
};

export const getPARMSInvoiceByReference = async (req, res) => {
	try {
		const projection = await getInvoiceByReference(req.params.ibmsReference);
		return res.status(200).json({ data: projection });
	} catch (error) {
		const statusCode = Number(error.statusCode || 500);
		return res.status(statusCode).json({ message: error.message || "Failed to fetch invoice" });
	}
};
