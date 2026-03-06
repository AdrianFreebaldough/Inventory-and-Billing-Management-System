import Notification from "../models/Notification.js";

// Get user notifications
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role.toLowerCase();

    // Get notifications for this user or for all users of this role
    const notifications = await Notification.find({
      role,
      $or: [
        { userId: userId },
        { userId: null }, // Broadcast notifications
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return res.status(200).json({
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const role = req.user.role.toLowerCase();

    await Notification.updateMany(
      {
        role,
        $or: [{ userId: req.user.id }, { userId: null }],
        isRead: false,
      },
      { isRead: true }
    );

    return res.status(200).json({
      message: "All notifications marked as read",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Get unread count
export const getUnreadCount = async (req, res) => {
  try {
    const role = req.user.role.toLowerCase();

    const count = await Notification.countDocuments({
      role,
      $or: [{ userId: req.user.id }, { userId: null }],
      isRead: false,
    });

    return res.status(200).json({
      count,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};
