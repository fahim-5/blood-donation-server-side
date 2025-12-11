import express from "express";
import analyticsController from "../controllers/analyticsController.js";
import validationMiddleware from "../middleware/validationMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import { query, body } from "express-validator";

const router = express.Router();

// All analytics routes require authentication
router.use(authMiddleware.protect);

// General analytics (accessible by all roles with appropriate permissions)
router.get(
  "/overview",
  roleMiddleware.isVolunteer,
  [
    query("period")
      .optional()
      .isIn([
        "today",
        "yesterday",
        "7days",
        "30days",
        "90days",
        "1year",
        "custom",
      ])
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
  analyticsController.getAnalyticsOverview
);

// Donation analytics
router.get(
  "/donations",
  roleMiddleware.isVolunteer,
  [
    query("period")
      .optional()
      .isIn([
        "today",
        "yesterday",
        "7days",
        "30days",
        "90days",
        "1year",
        "custom",
      ])
      .withMessage("Valid period is required"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Valid start date is required"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
    query("groupBy")
      .optional()
      .isIn(["day", "week", "month", "quarter", "year"])
      .withMessage("Valid group by value is required"),
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("district").optional().trim(),
    query("upazila").optional().trim(),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getDonationAnalytics
);

// User analytics
router.get(
  "/users",
  roleMiddleware.isAdmin,
  [
    query("period")
      .optional()
      .isIn([
        "today",
        "yesterday",
        "7days",
        "30days",
        "90days",
        "1year",
        "custom",
      ])
      .withMessage("Valid period is required"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Valid start date is required"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
    query("groupBy")
      .optional()
      .isIn(["day", "week", "month", "quarter", "year"])
      .withMessage("Valid group by value is required"),
    query("role")
      .optional()
      .isIn(["donor", "volunteer", "admin"])
      .withMessage("Valid role is required"),
    query("status")
      .optional()
      .isIn(["active", "blocked"])
      .withMessage("Valid status is required"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getUserAnalytics
);

// Funding analytics
router.get(
  "/funding",
  roleMiddleware.isAdmin,
  [
    query("period")
      .optional()
      .isIn([
        "today",
        "yesterday",
        "7days",
        "30days",
        "90days",
        "1year",
        "custom",
      ])
      .withMessage("Valid period is required"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Valid start date is required"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
    query("groupBy")
      .optional()
      .isIn(["day", "week", "month", "quarter", "year"])
      .withMessage("Valid group by value is required"),
    query("paymentMethod")
      .optional()
      .isIn(["stripe", "bank_transfer", "mobile_banking"])
      .withMessage("Valid payment method is required"),
    query("minAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Minimum amount must be positive"),
    query("maxAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Maximum amount must be positive"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getFundingAnalytics
);

// Geographic analytics
router.get(
  "/geographic",
  roleMiddleware.isVolunteer,
  [
    query("metric")
      .optional()
      .isIn(["donors", "donations", "requests", "funding"])
      .withMessage("Valid metric is required"),
    query("level")
      .optional()
      .isIn(["district", "upazila"])
      .withMessage("Valid geographic level is required"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getGeographicAnalytics
);

// Blood group analytics
router.get(
  "/blood-groups",
  roleMiddleware.isVolunteer,
  [
    query("metric")
      .optional()
      .isIn(["donors", "donations", "requests"])
      .withMessage("Valid metric is required"),
    query("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year", "all"])
      .withMessage("Valid period is required"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getBloodGroupAnalytics
);

// Time-based analytics
router.get(
  "/time-based",
  roleMiddleware.isVolunteer,
  [
    query("metric")
      .isIn(["donations", "requests", "registrations"])
      .withMessage("Valid metric is required"),
    query("period")
      .optional()
      .isIn(["hourly", "daily", "weekly", "monthly"])
      .withMessage("Valid period is required"),
    query("days")
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage("Days must be between 1 and 365"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getTimeBasedAnalytics
);

// Performance metrics
router.get(
  "/performance",
  roleMiddleware.isAdmin,
  [
    query("metric")
      .optional()
      .isIn([
        "responseTime",
        "completionRate",
        "fulfillmentRate",
        "userRetention",
      ])
      .withMessage("Valid metric is required"),
    query("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year"])
      .withMessage("Valid period is required"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getPerformanceMetrics
);

// Volunteer performance analytics
router.get(
  "/volunteer-performance",
  roleMiddleware.isAdmin,
  [
    query("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year"])
      .withMessage("Valid period is required"),
    query("volunteerId")
      .optional()
      .isMongoId()
      .withMessage("Valid volunteer ID is required"),
    query("sortBy")
      .optional()
      .isIn(["tasksCompleted", "responseTime", "rating"])
      .withMessage("Valid sort field is required"),
    query("sortOrder")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Sort order must be asc or desc"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getVolunteerPerformance
);

// Donor engagement analytics
router.get(
  "/donor-engagement",
  roleMiddleware.isVolunteer,
  [
    query("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year"])
      .withMessage("Valid period is required"),
    query("engagementLevel")
      .optional()
      .isIn(["high", "medium", "low", "inactive"])
      .withMessage("Valid engagement level is required"),
    query("minDonations")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Minimum donations must be positive"),
    query("maxDonations")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maximum donations must be positive"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getDonorEngagement
);

// Request fulfillment analytics
router.get(
  "/request-fulfillment",
  roleMiddleware.isVolunteer,
  [
    query("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year"])
      .withMessage("Valid period is required"),
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("urgencyLevel")
      .optional()
      .isIn(["low", "medium", "high", "critical"])
      .withMessage("Valid urgency level is required"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getRequestFulfillment
);

// Conversion analytics (for marketing/outreach)
router.get(
  "/conversion",
  roleMiddleware.isAdmin,
  [
    query("funnel")
      .optional()
      .isIn([
        "registration",
        "firstDonation",
        "recurringDonation",
        "volunteerSignup",
      ])
      .withMessage("Valid funnel is required"),
    query("period")
      .optional()
      .isIn(["7days", "30days", "90days", "1year"])
      .withMessage("Valid period is required"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getConversionAnalytics
);

// Real-time analytics
router.get(
  "/real-time",
  roleMiddleware.isAdmin,
  analyticsController.getRealTimeAnalytics
);

// Comparative analytics (compare periods)
router.post(
  "/compare",
  roleMiddleware.isAdmin,
  [
    body("metric")
      .isIn(["donations", "registrations", "funding", "requests"])
      .withMessage("Valid metric is required"),
    body("periods")
      .isArray({ min: 2, max: 4 })
      .withMessage("2-4 periods required"),
    body("periods.*.label")
      .trim()
      .notEmpty()
      .withMessage("Period label is required"),
    body("periods.*.startDate")
      .isISO8601()
      .withMessage("Valid start date is required"),
    body("periods.*.endDate")
      .isISO8601()
      .withMessage("Valid end date is required"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getComparativeAnalytics
);

// Predictive analytics (Admin only)
router.get(
  "/predictive",
  roleMiddleware.isAdmin,
  [
    query("forecast")
      .optional()
      .isIn(["donations", "requests", "funding", "registrations"])
      .withMessage("Valid forecast type is required"),
    query("days")
      .optional()
      .isInt({ min: 7, max: 90 })
      .withMessage("Days must be between 7 and 90"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.getPredictiveAnalytics
);

// Export analytics data
router.post(
  "/export",
  roleMiddleware.isVolunteer,
  [
    body("type")
      .isIn([
        "donations",
        "users",
        "funding",
        "geographic",
        "bloodGroups",
        "performance",
      ])
      .withMessage("Valid export type is required"),
    body("format")
      .isIn(["csv", "excel", "pdf", "json"])
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
    body("filters")
      .optional()
      .isObject()
      .withMessage("Filters must be an object"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.exportAnalyticsData
);

// Analytics dashboard configuration
router.get(
  "/config",
  roleMiddleware.isAdmin,
  analyticsController.getAnalyticsConfig
);
router.put(
  "/config",
  roleMiddleware.isAdmin,
  analyticsController.updateAnalyticsConfig
);

// Analytics alerts and insights
router.get(
  "/insights",
  roleMiddleware.isVolunteer,
  analyticsController.getAnalyticsInsights
);
router.get(
  "/alerts",
  roleMiddleware.isAdmin,
  analyticsController.getAnalyticsAlerts
);
router.put(
  "/alerts/:id/acknowledge",
  roleMiddleware.isAdmin,
  analyticsController.acknowledgeAlert
);

// Custom report builder (Admin only)
router.post(
  "/custom-report",
  roleMiddleware.isAdmin,
  [
    body("name").trim().notEmpty().withMessage("Report name is required"),
    body("description").optional().trim(),
    body("metrics")
      .isArray({ min: 1 })
      .withMessage("At least one metric is required"),
    body("filters")
      .optional()
      .isObject()
      .withMessage("Filters must be an object"),
    body("groupBy")
      .optional()
      .isArray()
      .withMessage("Group by must be an array"),
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
    body("isScheduled")
      .optional()
      .isBoolean()
      .withMessage("isScheduled must be a boolean"),
    body("schedule")
      .optional()
      .isObject()
      .withMessage("Schedule must be an object"),
  ],
  validationMiddleware.validateExpressValidator,
  analyticsController.createCustomReport
);

router.get(
  "/custom-reports",
  roleMiddleware.isAdmin,
  analyticsController.getCustomReports
);
router.get(
  "/custom-reports/:id",
  roleMiddleware.isAdmin,
  analyticsController.getCustomReport
);
router.put(
  "/custom-reports/:id",
  roleMiddleware.isAdmin,
  analyticsController.updateCustomReport
);
router.delete(
  "/custom-reports/:id",
  roleMiddleware.isAdmin,
  analyticsController.deleteCustomReport
);
router.post(
  "/custom-reports/:id/run",
  roleMiddleware.isAdmin,
  analyticsController.runCustomReport
);

export default router;
