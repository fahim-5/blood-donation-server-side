import express from "express";
import {
  getAllFundings,
  getFunding,
  createPaymentIntent,
  handleWebhook,
  createManualFunding,
  verifyFunding,
  processRefund,
  getFundingStats,
  getRecentDonations,
} from "../controllers/fundingController.js";
import validationMiddleware from "../middleware/validationMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import { body, param, query } from "express-validator";

const router = express.Router();

// Stripe payment webhook (public route - no auth)
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

// Public routes
router.get("/recent", getRecentDonations);

// Apply authentication to all remaining routes
router.use(authMiddleware.protect);

// Get all funding (Admin/Volunteer can see all, donors see only theirs)
router.get(
  "/",
  validationMiddleware.validatePagination,
  [
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Valid start date is required"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
    query("status")
      .optional()
      .isIn(["pending", "succeeded", "failed", "refunded"])
      .withMessage("Valid status is required"),
    query("donationType")
      .optional()
      .isIn(["general", "emergency", "equipment", "campaign", "other"])
      .withMessage("Valid donation type is required"),
    query("isAnonymous")
      .optional()
      .isBoolean()
      .withMessage("isAnonymous must be a boolean"),
  ],
  validationMiddleware.validateExpressValidator,
  getAllFundings
);

// Get funding statistics (Admin only)
router.get("/stats", roleMiddleware.isAdmin, getFundingStats);

// Get single funding by ID
router.get(
  "/:id",
  validationMiddleware.validateObjectId("id"),
  roleMiddleware.isOwnerOrAdmin("Funding"),
  getFunding
);

// Create payment intent for Stripe
router.post(
  "/create-payment-intent",
  [
    body("amount")
      .isFloat({ min: 10, max: 100000 })
      .withMessage("Amount must be between 10 and 100,000 BDT"),
    body("currency")
      .optional()
      .isIn(["BDT", "USD"])
      .withMessage("Valid currency is required"),
    body("donationType")
      .optional()
      .isIn(["general", "emergency", "equipment", "campaign", "other"])
      .withMessage("Valid donation type is required"),
    body("message")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Message cannot exceed 500 characters"),
    body("isAnonymous")
      .optional()
      .isBoolean()
      .withMessage("isAnonymous must be a boolean"),
    body("displayName")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Display name cannot exceed 50 characters")
      .custom((value, { req }) => {
        if (req.body.isAnonymous && !value) {
          throw new Error("Display name is required for anonymous donations");
        }
        return true;
      }),
  ],
  validationMiddleware.validateExpressValidator,
  createPaymentIntent
);

// Create manual funding (Admin only)
router.post(
  "/manual",
  roleMiddleware.isAdmin,
  [
    body("donorId")
      .notEmpty()
      .withMessage("Donor ID is required")
      .isMongoId()
      .withMessage("Valid donor ID is required"),
    body("amount")
      .isFloat({ min: 10 })
      .withMessage("Amount must be at least 10 BDT"),
    body("currency")
      .optional()
      .isIn(["BDT", "USD"])
      .withMessage("Valid currency is required"),
    body("paymentMethod")
      .isIn(["cash", "check", "bank_transfer", "mobile_banking"])
      .withMessage("Valid payment method is required"),
    body("donationType")
      .optional()
      .isIn(["general", "emergency", "equipment", "campaign", "other"])
      .withMessage("Valid donation type is required"),
    body("message")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Message cannot exceed 500 characters"),
    body("isAnonymous")
      .optional()
      .isBoolean()
      .withMessage("isAnonymous must be a boolean"),
    body("displayName")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Display name cannot exceed 50 characters"),
    body("transactionDate")
      .optional()
      .isISO8601()
      .withMessage("Valid transaction date is required"),
  ],
  validationMiddleware.validateExpressValidator,
  createManualFunding
);

// Verify funding (Admin only)
router.patch(
  "/:id/verify",
  validationMiddleware.validateObjectId("id"),
  roleMiddleware.isAdmin,
  verifyFunding
);

// Process refund (Admin only)
router.post(
  "/:id/refund",
  validationMiddleware.validateObjectId("id"),
  roleMiddleware.isAdmin,
  [
    body("amount")
      .isFloat({ min: 1 })
      .withMessage("Refund amount must be at least 1"),
    body("reason")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Reason cannot exceed 200 characters"),
  ],
  validationMiddleware.validateExpressValidator,
  processRefund
);

export default router;