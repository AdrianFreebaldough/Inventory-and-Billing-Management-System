import Product from "../models/product.js";
import InventoryBatch from "../models/InventoryBatch.js";
import Notification from "../models/Notification.js";
import User from "../models/user.js";
import { FEFO_RISK, classifyExpiryRisk } from "./fefoService.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const getOwnerRecipientIds = async () => {
  const users = await User.find({
    role: "owner",
    isActive: true,
    status: { $ne: "Archived" },
  })
    .select("_id")
    .lean();

  return users.map((user) => user._id);
};

const createOwnerNotifications = async ({ ownerIds, type, relatedId, message }) => {
  if (!ownerIds.length) return;

  const existing = await Notification.find({
    role: "owner",
    type,
    relatedId,
    userId: { $in: ownerIds },
    createdAt: { $gte: new Date(Date.now() - ONE_DAY_MS) },
  })
    .select("userId")
    .lean();

  const existingUserIds = new Set(existing.map((entry) => String(entry.userId)));

  const docs = ownerIds
    .filter((id) => !existingUserIds.has(String(id)))
    .map((id) => ({
      userId: id,
      role: "owner",
      type,
      relatedId,
      message,
      redirectUrl: "inventory",
    }));

  if (!docs.length) return;

  await Notification.insertMany(docs, { ordered: false });
};

const getProductNearestExpiry = async (productId) => {
  const today = startOfToday();

  const withExpiry = await InventoryBatch.findOne({
    product: productId,
    quantity: { $gt: 0 },
    expiryDate: { $ne: null, $gte: today },
  })
    .sort({ expiryDate: 1, createdAt: 1, _id: 1 })
    .select("expiryDate")
    .lean();

  if (withExpiry?.expiryDate) {
    return withExpiry.expiryDate;
  }

  return null;
};

export const runDailyExpiryRiskJob = async () => {
  const [ownerIds, products] = await Promise.all([
    getOwnerRecipientIds(),
    Product.find({ isArchived: { $ne: true } })
      .select("_id name expiryDate")
      .lean(),
  ]);

  let redCount = 0;
  let yellowCount = 0;

  for (const product of products) {
    const nearestExpiryDate = (await getProductNearestExpiry(product._id)) || product.expiryDate || null;
    const risk = classifyExpiryRisk(nearestExpiryDate);

    if (risk === FEFO_RISK.RED) {
      redCount += 1;
      await createOwnerNotifications({
        ownerIds,
        type: "expiry_risk_red",
        relatedId: product._id,
        message: `${product.name} is at-risk and should be reviewed immediately`,
      });
    }

    if (risk === FEFO_RISK.YELLOW) {
      yellowCount += 1;
      await createOwnerNotifications({
        ownerIds,
        type: "promotion_candidate",
        relatedId: product._id,
        message: `${product.name} is near-expiry and can be added to promotion candidates`,
      });
    }
  }

  return {
    processedProducts: products.length,
    redCount,
    yellowCount,
  };
};
