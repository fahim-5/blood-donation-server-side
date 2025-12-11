import express from "express";
import dashboardController from "../controllers/dashboardController.js";
import validationMiddleware from "../middleware/validationMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import { query, body } from "express-validator";

const router = express.Router();

// All dashboard routes require authentication
router.use(authMiddleware.protect);

// Common dashboard routes (accessible by all roles)
router.get("/overview", dashboardController.getDashboardOverview);
router.get("/quick-stats", dashboardController.getQuickStats);
router.get("/recent-activity", dashboardController.getRecentActivity);
router.get("/notifications/count", dashboardController.getNotificationCount);
router.get("/upcoming-events", dashboardController.getUpcomingEvents);

// Role-based dashboard routes
router.get(
  "/donor",
  roleMiddleware.isDonor,
  dashboardController.getDonorDashboard
);
router.get(
  "/volunteer",
  roleMiddleware.isVolunteer,
  dashboardController.getVolunteerDashboard
);
router.get(
  "/admin",
  roleMiddleware.isAdmin,
  dashboardController.getAdminDashboard
);

// Dashboard widgets
router.get("/widgets", dashboardController.getDashboardWidgets);

// Update widget settings
router.put(
  "/widgets",
  [
    body("widgets").isArray().withMessage("Widgets must be an array"),
    body("layout")
      .optional()
      .isObject()
      .withMessage("Layout must be an object"),
  ],
  validationMiddleware.validateExpressValidator,
  dashboardController.updateWidgetSettings
);

// Dashboard charts data
router.get(
  "/charts/donation-trends",
  [
    query("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year", "custom"])
      .withMessage("Valid period is required"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Valid start date is required"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
  ],
  validationMiddleware.validateExpressValidator,
  dashboardController.getDonationTrendsChart
);

router.get(
  "/charts/user-growth",
  [
    query("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year", "custom"])
      .withMessage("Valid period is required"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Valid start date is required"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
  ],
  validationMiddleware.validateExpressValidator,
  dashboardController.getUserGrowthChart
);

router.get(
  "/charts/blood-group-distribution",
  dashboardController.getBloodGroupDistributionChart
);

router.get(
  "/charts/geographic-distribution",
  dashboardController.getGeographicDistributionChart
);

// Dashboard summary by role
router.get(
  "/summary/donor",
  roleMiddleware.isDonor,
  dashboardController.getDonorSummary
);
router.get(
  "/summary/volunteer",
  roleMiddleware.isVolunteer,
  dashboardController.getVolunteerSummary
);
router.get(
  "/summary/admin",
  roleMiddleware.isAdmin,
  dashboardController.getAdminSummary
);

// Dashboard alerts and notifications
router.get("/alerts", dashboardController.getDashboardAlerts);
router.put("/alerts/:id/mark-read", dashboardController.markAlertAsRead);
router.delete("/alerts/:id", dashboardController.deleteAlert);

// Dashboard tasks (for volunteers and admins)
router.get(
  "/tasks",
  roleMiddleware.isVolunteer,
  dashboardController.getDashboardTasks
);
router.post(
  "/tasks",
  roleMiddleware.isVolunteer,
  dashboardController.createDashboardTask
);
router.put(
  "/tasks/:id",
  roleMiddleware.isVolunteer,
  dashboardController.updateDashboardTask
);
router.delete(
  "/tasks/:id",
  roleMiddleware.isVolunteer,
  dashboardController.deleteDashboardTask
);

// Dashboard calendar events
router.get("/calendar/events", dashboardController.getCalendarEvents);
router.post("/calendar/events", dashboardController.createCalendarEvent);
router.put("/calendar/events/:id", dashboardController.updateCalendarEvent);
router.delete("/calendar/events/:id", dashboardController.deleteCalendarEvent);

// Dashboard settings
router.get("/settings", dashboardController.getDashboardSettings);
router.put("/settings", dashboardController.updateDashboardSettings);

// Dashboard shortcuts
router.get("/shortcuts", dashboardController.getDashboardShortcuts);

// Dashboard search (within dashboard)
router.get(
  "/search",
  [
    query("q").trim().notEmpty().withMessage("Search query is required"),
    query("type")
      .optional()
      .isIn(["users", "donations", "funding", "all"])
      .withMessage("Valid search type is required"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage("Limit must be between 1 and 20"),
  ],
  validationMiddleware.validateExpressValidator,
  dashboardController.dashboardSearch
);

// Export dashboard data
router.post(
  "/export",
  [
    body("type")
      .isIn(["summary", "activity", "stats"])
      .withMessage("Valid export type is required"),
    body("format")
      .isIn(["pdf", "csv", "excel"])
      .withMessage("Valid export format is required"),
    body("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year", "custom"])
      .withMessage("Valid period is required"),
    body("startDate")
      .optional()
      .isISO8601()
      .withMessage("Valid start date is required"),
    body("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
  ],
  validationMiddleware.validateExpressValidator,
  dashboardController.exportDashboardData
);

// Dashboard announcements
router.get("/announcements", dashboardController.getAnnouncements);
router.post(
  "/announcements",
  roleMiddleware.isAdmin,
  dashboardController.createAnnouncement
);
router.put(
  "/announcements/:id",
  roleMiddleware.isAdmin,
  dashboardController.updateAnnouncement
);
router.delete(
  "/announcements/:id",
  roleMiddleware.isAdmin,
  dashboardController.deleteAnnouncement
);

// Dashboard help and support
router.get("/help/articles", dashboardController.getHelpArticles);
router.get("/help/articles/:id", dashboardController.getHelpArticle);
router.post("/help/feedback", dashboardController.submitHelpFeedback);

// Dashboard version and updates
router.get("/version", dashboardController.getDashboardVersion);
router.get("/updates", dashboardController.getRecentUpdates);

// Dashboard backup (Admin only)
router.get("/backup", roleMiddleware.isAdmin, dashboardController.createBackup);
router.get(
  "/backup/list",
  roleMiddleware.isAdmin,
  dashboardController.getBackupList
);
router.post(
  "/backup/restore",
  roleMiddleware.isAdmin,
  dashboardController.restoreBackup
);

// Dashboard system status
router.get(
  "/system-status",
  roleMiddleware.isAdmin,
  dashboardController.getSystemStatus
);

export default router;
