import Notification from "../models/Notification.js";

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const unreadCount = notifications.filter((notification) => !notification.readAt).length;
    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: "Failed to load notifications" });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { readAt: new Date() },
      { new: true },
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ message: "Failed to update notification" });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, readAt: null },
      { readAt: new Date() },
    );
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notifications" });
  }
};
