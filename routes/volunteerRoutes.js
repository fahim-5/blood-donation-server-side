import express from "express";
import volunteerController from "../controllers/volunteerController.js";
import validationMiddleware from "../middleware/validationMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import { query, param, body } from "express-validator";

const router = express.Router();

// All volunteer routes require volunteer or admin role
router.use(authMiddleware.protect, roleMiddleware.isVolunteer);

// Volunteer dashboard
router.get("/dashboard/stats", volunteerController.getVolunteerDashboardStats);

// Donation request management (view all)
router.get(
  "/donation-requests",
  validationMiddleware.validatePagination,
  [
    query("status")
      .optional()
      .isIn(["pending", "inprogress", "done", "canceled"])
      .withMessage("Valid status is required"),
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("urgencyLevel")
      .optional()
      .isIn(["low", "medium", "high", "critical"])
      .withMessage("Valid urgency level is required"),
    query("district").optional().trim(),
    query("upazila").optional().trim(),
  ],
  validationMiddleware.validateExpressValidator,
  volunteerController.getAllDonationRequests
);

// Update donation status (volunteers can only update status)
router.put(
  "/donation-requests/:id/status",
  validationMiddleware.validateObjectId("id"),
  [
    body("status")
      .isIn(["pending", "inprogress", "done", "canceled"])
      .withMessage("Valid status is required"),
    body("notes").optional().trim(),
  ],
  validationMiddleware.validateExpressValidator,
  volunteerController.updateDonationStatus
);

// Assign donor to donation request
router.post(
  "/donation-requests/:id/assign-donor",
  validationMiddleware.validateObjectId("id"),
  [
    body("donorId").isMongoId().withMessage("Valid donor ID is required"),
    body("assignmentNotes").optional().trim(),
  ],
  validationMiddleware.validateExpressValidator,
  volunteerController.assignDonorToRequest
);

// Get donors list for assignment
router.get(
  "/donors",
  validationMiddleware.validatePagination,
  [
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("district").optional().trim(),
    query("upazila").optional().trim(),
    query("availability")
      .optional()
      .isIn(["available", "unavailable", "recently_donated"])
      .withMessage("Valid availability status is required"),
  ],
  validationMiddleware.validateExpressValidator,
  volunteerController.getAvailableDonors
);

// Create donation request on behalf of someone
router.post(
  "/donation-requests",
  [
    body("recipientName")
      .trim()
      .notEmpty()
      .withMessage("Recipient name is required"),
    body("recipientPhone")
      .optional()
      .trim()
      .isMobilePhone()
      .withMessage("Valid phone number is required"),
    body("recipientDistrict")
      .trim()
      .notEmpty()
      .withMessage("Recipient district is required"),
    body("recipientUpazila")
      .trim()
      .notEmpty()
      .withMessage("Recipient upazila is required"),
    body("hospitalName")
      .trim()
      .notEmpty()
      .withMessage("Hospital name is required"),
    body("hospitalAddress")
      .trim()
      .notEmpty()
      .withMessage("Hospital address is required"),
    body("bloodGroup")
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    body("donationDate")
      .isISO8601()
      .withMessage("Valid donation date is required"),
    body("donationTime")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Valid donation time is required"),
    body("requestMessage")
      .trim()
      .notEmpty()
      .withMessage("Request message is required"),
    body("urgencyLevel")
      .isIn(["low", "medium", "high", "critical"])
      .withMessage("Valid urgency level is required"),
    body("requiredUnits")
      .isInt({ min: 1, max: 10 })
      .withMessage("Required units must be between 1 and 10"),
    body("isAnonymous")
      .optional()
      .isBoolean()
      .withMessage("isAnonymous must be a boolean"),
  ],
  validationMiddleware.validateExpressValidator,
  volunteerController.createDonationRequest
);

// Volunteer tasks and assignments
router.get(
  "/my-assignments",
  validationMiddleware.validatePagination,
  [
    query("status")
      .optional()
      .isIn(["pending", "inprogress", "completed", "cancelled"])
      .withMessage("Valid status is required"),
    query("priority")
      .optional()
      .isIn(["low", "medium", "high"])
      .withMessage("Valid priority is required"),
  ],
  validationMiddleware.validateExpressValidator,
  volunteerController.getMyAssignments
);

router.get(
  "/my-assignments/:id",
  validationMiddleware.validateObjectId("id"),
  volunteerController.getAssignmentDetails
);

router.put(
  "/my-assignments/:id/status",
  validationMiddleware.validateObjectId("id"),
  [
    body("status")
      .isIn(["pending", "inprogress", "completed", "cancelled"])
      .withMessage("Valid status is required"),
    body("completionNotes").optional().trim(),
  ],
  validationMiddleware.validateExpressValidator,
  volunteerController.updateAssignmentStatus
);

// Volunteer profile specific to volunteering
router.get("/profile", volunteerController.getVolunteerProfile);
router.put("/profile/volunteer-info", volunteerController.updateVolunteerInfo);

// Volunteer availability
router.get("/availability", volunteerController.getAvailability);
router.put("/availability", volunteerController.updateAvailability);

// Volunteer statistics
router.get("/stats", volunteerController.getVolunteerStats);

// Emergency requests (high priority)
router.get(
  "/emergency-requests",
  validationMiddleware.validatePagination,
  volunteerController.getEmergencyRequests
);

export default router;
