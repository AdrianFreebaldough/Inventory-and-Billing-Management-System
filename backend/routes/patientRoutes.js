import express from "express";
import { protect } from "../middleware/AuthMiddlewareUser.js";
import STAFF_BillingTransaction from "../models/STAFF_billingTransaction.js";

const router = express.Router();

router.get("/:patientId", protect, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ message: "Patient ID is required" });
    }

    const transaction = await STAFF_BillingTransaction.findOne({
      patientId: { $regex: `^${patientId}$`, $options: "i" },
      patientName: { $exists: true, $ne: "" },
    })
      .sort({ createdAt: -1 })
      .select("patientId patientName")
      .lean();

    if (!transaction) {
      return res.status(404).json({ message: "Patient not found" });
    }

    return res.status(200).json({
      data: {
        patientId: transaction.patientId,
        patientName: transaction.patientName,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch patient" });
  }
});

export default router;
