import express from "express";
import notificationController from "../controllers/notificationController.js";
import validationMiddleware from "../middleware/validationMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { query, param } from "express-validator";

const router = express.Router();

// All notification routes require authentication
router.use(authMiddleware.protect);

// Get notifications
router.get(
  "/",
  validationMiddleware.validatePagination,
  [
    query("type")
      .optional()
      .isIn([
        "donation_request",
        "donation_status",
        "account_status",
        "role_change",
        "funding_received",
        "system",
        "all",
      ])
      .withMessage("Valid notification type is required"),
    query("priority")
      .optional()
      .isIn(["low", "medium", "high", "urgent"])
      .withMessage("Valid priority is required"),
    query("isRead")
      .optional()
      .isBoolean()
      .withMessage("isRead must be a boolean"),
    query("dateFrom")
      .optional()
      .isISO8601()
      .withMessage("Valid date is required"),
    query("dateTo")
      .optional()
      .isISO8601()
      .withMessage("Valid date is required"),
    query("sortBy")
      .optional()
      .isIn(["createdAt", "priority", "isRead"])
      .withMessage("Valid sort field is required"),
    query("sortOrder")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Sort order must be asc or desc"),
  ],
  validationMiddleware.validateExpressValidator,
  notificationController.getNotifications
);

// Get unread notification count
router.get("/unread-count", notificationController.getNotificationCount);

// Mark notification as read
router.put(
  "/:id/read",
  validationMiddleware.validateObjectId("id"),
  notificationController.markAsRead
);

// Mark all notifications as read
router.put("/mark-all-read", notificationController.markAllAsRead);

// Delete notification
router.delete(
  "/:id",
  validationMiddleware.validateObjectId("id"),
  notificationController.deleteNotification
);

// Delete all notifications
router.delete("/", notificationController.deleteAllNotifications);

// Get notification preferences
router.get("/preferences", notificationController.getNotificationPreferences);

// Update notification preferences
router.put(
  "/preferences",
  [
    query("emailNotifications")
      .optional()
      .isBoolean()
      .withMessage("emailNotifications must be a boolean"),
    query("pushNotifications")
      .optional()
      .isBoolean()
      .withMessage("pushNotifications must be a boolean"),
    query("inAppNotifications")
      .optional()
      .isBoolean()
      .withMessage("inAppNotifications must be a boolean"),
    query("donationRequestAlerts")
      .optional()
      .isBoolean()
      .withMessage("donationRequestAlerts must be a boolean"),
    query("donationStatusUpdates")
      .optional()
      .isBoolean()
      .withMessage("donationStatusUpdates must be a boolean"),
    query("fundingUpdates")
      .optional()
      .isBoolean()
      .withMessage("fundingUpdates must be a boolean"),
    query("systemAnnouncements")
      .optional()
      .isBoolean()
      .withMessage("systemAnnouncements must be a boolean"),
  ],
  validationMiddleware.validateExpressValidator,
  notificationController.updateNotificationPreferences
);

// Notification statistics
router.get("/stats", notificationController.getNotificationStats);

// Test notification (for admin)
router.post(
  "/test",
  [
    query("type")
      .isIn(["email", "push", "inApp"])
      .withMessage("Valid notification type is required"),
    query("title").trim().notEmpty().withMessage("Title is required"),
    query("message").trim().notEmpty().withMessage("Message is required"),
  ],
  validationMiddleware.validateExpressValidator,
  notificationController.sendTestNotification
);

export default router;
