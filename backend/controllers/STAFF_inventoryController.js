import Product from "../models/product.js";
import InventoryRequest from "../models/InventoryRequest.js";

// Reuse existing InventoryRequest schema so staff can request restocks without direct stock edits.

const STAFF_parsePositiveNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

export const STAFF_createRestockRequest = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    const parsedQuantity = STAFF_parsePositiveNumber(quantity);
    if (!productId || parsedQuantity === null) {
      return res.status(400).json({
        message: "productId and a positive quantity are required",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      isArchived: { $ne: true },
    }).select("_id name status quantity");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const request = await InventoryRequest.create({
      product: product._id,
      quantity: parsedQuantity,
      // Always bind to authenticated staff; payload cannot impersonate another user.
      requestedBy: req.user.id,
      status: "pending",
    });

    return res.status(201).json({
      message: "Restock request submitted",
      data: {
        requestId: request._id,
        productId: request.product,
        quantity: request.quantity,
        status: request.status,
        createdAt: request.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
