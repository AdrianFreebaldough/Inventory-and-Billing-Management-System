import { createDisposalRequest } from "../services/OWNER_disposalService.js";

export const STAFF_createDisposalRequest = async (req, res) => {
  try {
    const data = await createDisposalRequest({
      userId: req.user.id,
      userRole: "STAFF",
      productId: req.body.productId,
      batchId: req.body.batchId,
      quantityDisposed: req.body.quantityDisposed,
      reason: req.body.reason,
      remarks: req.body.remarks,
      disposalMethod: req.body.disposalMethod,
    });

    return res.status(201).json({
      success: true,
      message: "Disposal request submitted for owner approval",
      reference_id: data.referenceId,
      status: data.status,
      data,
    });
  } catch (error) {
    const message = error.message === "Disposal record not found" ? "Failed to create disposal record." : error.message;
    return res.status(400).json({ success: false, message: message || "Failed to submit disposal request" });
  }
};
