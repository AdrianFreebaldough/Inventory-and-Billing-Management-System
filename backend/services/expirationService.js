import Product from "../models/product.js";
import Notification from "../models/Notification.js";
import User from "../models/user.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const getRecipientIdsByRole = async (role) => {
  const users = await User.find({
    role,
    isActive: true,
    status: { $ne: "Archived" },
  })
    .select("_id")
    .lean();

  return users.map((user) => user._id);
};

const createNotificationsForRecipients = async ({
  recipientIds,
  role,
  message,
  type,
  redirectUrl,
  relatedId,
}) => {
  if (!recipientIds.length) return;

  const existingNotifications = await Notification.find({
    role,
    type,
    relatedId,
    userId: { $in: recipientIds },
    createdAt: { $gte: new Date(Date.now() - ONE_DAY_MS) },
  })
    .select("userId")
    .lean();

  const existingUserIds = new Set(
    existingNotifications.map((notification) => notification.userId.toString())
  );

  const documents = recipientIds
    .filter((userId) => !existingUserIds.has(userId.toString()))
    .map((userId) => ({
      userId,
      role,
      message,
      type,
      redirectUrl,
      relatedId,
    }));

  if (!documents.length) return;

  await Notification.insertMany(documents, { ordered: false });
};

// Calculate days until expiration
export const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// Get expiration status
export const getExpirationStatus = (expiryDate) => {
  if (!expiryDate) return null;
  
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
  
  if (daysUntilExpiry === null) return null;
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 7) return "expiring_week";
  if (daysUntilExpiry <= 30) return "expiring_month";
  return "good";
};

// Check and create expiration notifications
export const checkExpirationNotifications = async () => {
  try {
    const [ownerRecipientIds, staffRecipientIds] = await Promise.all([
      getRecipientIdsByRole("owner"),
      getRecipientIdsByRole("staff"),
    ]);

    const products = await Product.find({
      isArchived: false,
      expiryDate: { $ne: null },
    }).lean();

    for (const product of products) {
      const status = getExpirationStatus(product.expiryDate);
      const daysUntilExpiry = getDaysUntilExpiry(product.expiryDate);

      if (status === "expiring_week") {
        await createNotificationsForRecipients({
          recipientIds: ownerRecipientIds,
          role: "owner",
          message: `${product.name} expires in ${daysUntilExpiry} day(s)`,
          type: "item_expiration",
          redirectUrl: "inventory",
          relatedId: product._id,
        });

        await createNotificationsForRecipients({
          recipientIds: staffRecipientIds,
          role: "staff",
          message: `${product.name} expires in ${daysUntilExpiry} day(s)`,
          type: "item_expiration",
          redirectUrl: "inventory",
          relatedId: product._id,
        });
      } else if (status === "expiring_month" && daysUntilExpiry % 7 === 0) {
        // Only notify weekly for month expiration
        await createNotificationsForRecipients({
          recipientIds: ownerRecipientIds,
          role: "owner",
          message: `${product.name} expires in ${daysUntilExpiry} day(s)`,
          type: "item_expiration",
          redirectUrl: "inventory",
          relatedId: product._id,
        });
      }
    }
  } catch (error) {
    console.error("Error checking expiration notifications:", error);
  }
};

// Check and create low/out of stock notifications
export const checkStockNotifications = async () => {
  try {
    const [ownerRecipientIds, staffRecipientIds] = await Promise.all([
      getRecipientIdsByRole("owner"),
      getRecipientIdsByRole("staff"),
    ]);

    const outOfStockProducts = await Product.find({
      isArchived: false,
      status: "out",
    }).lean();

    const lowStockProducts = await Product.find({
      isArchived: false,
      status: "low",
    }).lean();

    for (const product of outOfStockProducts) {
      const recentNotification = await Notification.findOne({
        type: "out_of_stock",
        relatedId: product._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (!recentNotification) {
        await createNotificationsForRecipients({
          recipientIds: ownerRecipientIds,
          role: "owner",
          message: `${product.name} is out of stock`,
          type: "out_of_stock",
          redirectUrl: "inventory",
          relatedId: product._id,
        });

        await createNotificationsForRecipients({
          recipientIds: staffRecipientIds,
          role: "staff",
          message: `${product.name} is out of stock`,
          type: "out_of_stock",
          redirectUrl: "inventory",
          relatedId: product._id,
        });
      }
    }

    for (const product of lowStockProducts) {
      const recentNotification = await Notification.findOne({
        type: "low_stock",
        relatedId: product._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (!recentNotification) {
        await createNotificationsForRecipients({
          recipientIds: ownerRecipientIds,
          role: "owner",
          message: `${product.name} is low in stock (${product.quantity} remaining)`,
          type: "low_stock",
          redirectUrl: "inventory",
          relatedId: product._id,
        });
      }
    }
  } catch (error) {
    console.error("Error checking stock notifications:", error);
  }
};
