import { getDisposalLogById, getDisposalLogs, createDisposalRequest, approveDisposalRequest, directOwnerDisposal, rejectDisposalRequest } from "../services/OWNER_disposalService.js";

export const OWNER_getDisposalLogs = async (req, res) => {
  try {
    const data = await getDisposalLogs({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      itemName: req.query.itemName,
      reason: req.query.reason,
      status: req.query.status,
    });

    return res.status(200).json({
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Failed to fetch disposal logs" });
  }
};

export const OWNER_getDisposalLogDetails = async (req, res) => {
  try {
    const data = await getDisposalLogById(req.params.id);
    return res.status(200).json({ data });
  } catch (error) {
    return res.status(404).json({ message: error.message || "Disposal record not found" });
  }
};

export const OWNER_createDisposalRequest = async (req, res) => {
  try {
    const data = await createDisposalRequest({
      userId: req.user.id,
      userRole: "OWNER",
      requesterName: req.user.name,
      requesterEmail: req.user.email,
      requesterAccountId: req.user.accountId,
      productId: req.body.productId,
      batchId: req.body.batchId,
      quantityDisposed: req.body.quantityDisposed,
      reason: req.body.reason,
      remarks: req.body.remarks,
      disposalMethod: req.body.disposalMethod,
    });

    return res.status(201).json({
      success: true,
      message: "Disposal request created and batch marked as pending disposal",
      reference_id: data.referenceId,
      status: data.status,
      data,
    });
  } catch (error) {
    const message = error.message === "Disposal record not found" ? "Failed to create disposal record." : error.message;
    return res.status(400).json({ success: false, message: message || "Failed to create disposal request" });
  }
};

export const OWNER_directDisposal = async (req, res) => {
  try {
    const data = await directOwnerDisposal({
      ownerId: req.user.id,
      productId: req.body.productId,
      batchId: req.body.batchId,
      quantityDisposed: req.body.quantityDisposed,
      reason: req.body.reason,
      remarks: req.body.remarks,
      disposalMethod: req.body.disposalMethod,
      ownerPassword: req.body.ownerPassword,
    });

    return res.status(201).json({
      success: true,
      message: "Disposal completed successfully",
      reference_id: data.referenceId,
      status: data.status,
      data,
    });
  } catch (error) {
    const message = error.message === "Disposal record not found" ? "Failed to create disposal record." : error.message;
    return res.status(400).json({ success: false, message: message || "Failed to process disposal" });
  }
};

export const OWNER_rejectDisposalRequest = async (req, res) => {
  try {
    const data = await rejectDisposalRequest({
      disposalId: req.params.id,
      ownerId: req.user.id,
    });

    return res.status(200).json({
      message: "Disposal request rejected",
      data,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Failed to reject disposal request" });
  }
};

export const OWNER_approveDisposalRequest = async (req, res) => {
  try {
    const data = await approveDisposalRequest({
      disposalId: req.params.id,
      ownerId: req.user.id,
      adminPassword: req.body.adminPassword,
    });

    return res.status(200).json({
      message: "Disposal approved and completed",
      data,
    });
  } catch (error) {
    const statusCode = error.message === "Incorrect password. Approval denied." ? 400 : 409;
    return res.status(statusCode).json({ message: error.message || "Failed to approve disposal request" });
  }
};

