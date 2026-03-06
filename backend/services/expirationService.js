import Product from "../models/product.js";
import Notification from "../models/Notification.js";

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
    const products = await Product.find({
      isArchived: false,
      expiryDate: { $ne: null },
    }).lean();

    for (const product of products) {
      const status = getExpirationStatus(product.expiryDate);
      const daysUntilExpiry = getDaysUntilExpiry(product.expiryDate);

      // Check if notification already exists for this product recently
      const recentNotification = await Notification.findOne({
        type: "item_expiration",
        relatedId: product._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Within last 24 hours
      });

      if (recentNotification) continue;

      if (status === "expiring_week") {
        await Notification.create({
          userId: null,
          role: "owner",
          message: `${product.name} expires in ${daysUntilExpiry} day(s)`,
          type: "item_expiration",
          redirectUrl: "/inventory",
          relatedId: product._id,
        });

        await Notification.create({
          userId: null,
          role: "staff",
          message: `${product.name} expires in ${daysUntilExpiry} day(s)`,
          type: "item_expiration",
          redirectUrl: "/inventory",
          relatedId: product._id,
        });
      } else if (status === "expiring_month" && daysUntilExpiry % 7 === 0) {
        // Only notify weekly for month expiration
        await Notification.create({
          userId: null,
          role: "owner",
          message: `${product.name} expires in ${daysUntilExpiry} day(s)`,
          type: "item_expiration",
          redirectUrl: "/inventory",
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
        await Notification.create({
          userId: null,
          role: "owner",
          message: `${product.name} is out of stock`,
          type: "out_of_stock",
          redirectUrl: "/inventory",
          relatedId: product._id,
        });

        await Notification.create({
          userId: null,
          role: "staff",
          message: `${product.name} is out of stock`,
          type: "out_of_stock",
          redirectUrl: "/inventory",
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
        await Notification.create({
          userId: null,
          role: "owner",
          message: `${product.name} is low in stock (${product.quantity} remaining)`,
          type: "low_stock",
          redirectUrl: "/inventory",
          relatedId: product._id,
        });
      }
    }
  } catch (error) {
    console.error("Error checking stock notifications:", error);
  }
};
