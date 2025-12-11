import express from "express";
import {
  searchDonors,
  searchDonationRequests,
  globalSearch,
  getSearchFilters,
  getUrgentNeeds,
  exportSearchResults,
  // Add other controller functions as needed
} from "../controllers/searchController.js";
import validationMiddleware from "../middleware/validationMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import rateLimiter from "../middleware/rateLimiter.js";
import { query } from "express-validator";

const router = express.Router();

// Public search routes
router.get(
  "/donors",
  rateLimiter.searchLimiter,
  [
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("district").optional().trim(),
    query("upazila").optional().trim(),
    query("availability")
      .optional()
      .isIn(["available", "recently_donated", "unavailable"])
      .withMessage("Valid availability status is required"),
    query("lastDonationBefore")
      .optional()
      .isISO8601()
      .withMessage("Valid date is required"),
    query("minAge")
      .optional()
      .isInt({ min: 18, max: 65 })
      .withMessage("Minimum age must be between 18 and 65"),
    query("maxAge")
      .optional()
      .isInt({ min: 18, max: 65 })
      .withMessage("Maximum age must be between 18 and 65"),
    query("sortBy")
      .optional()
      .isIn(["lastDonationDate", "age", "name", "distance"])
      .withMessage("Valid sort field is required"),
    query("sortOrder")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Sort order must be asc or desc"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
  ],
  validationMiddleware.validateExpressValidator,
  searchDonors
);

router.get(
  "/donation-requests",
  rateLimiter.searchLimiter,
  [
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("district").optional().trim(),
    query("upazila").optional().trim(),
    query("status")
      .optional()
      .isIn(["pending", "inprogress"])
      .withMessage("Valid status is required"),
    query("urgencyLevel")
      .optional()
      .isIn(["low", "medium", "high", "critical"])
      .withMessage("Valid urgency level is required"),
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
      .isIn(["donationDate", "createdAt", "urgencyLevel"])
      .withMessage("Valid sort field is required"),
    query("sortOrder")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Sort order must be asc or desc"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  validationMiddleware.validateExpressValidator,
  searchDonationRequests
);

// Global search route
router.get(
  "/global",
  authMiddleware.protect,
  rateLimiter.searchLimiter,
  [
    query("q").trim().notEmpty().withMessage("Search query is required"),
    query("type")
      .optional()
      .isIn(["all", "users", "donations", "fundings", "contacts"])
      .withMessage("Valid type is required"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
  ],
  validationMiddleware.validateExpressValidator,
  globalSearch
);

// Advanced search (requires authentication)
router.get(
  "/advanced/donors",
  authMiddleware.protect,
  rateLimiter.searchLimiter,
  [
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("district").optional().trim(),
    query("upazila").optional().trim(),
    query("gender")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Valid gender is required"),
    query("minAge")
      .optional()
      .isInt({ min: 18, max: 65 })
      .withMessage("Minimum age must be between 18 and 65"),
    query("maxAge")
      .optional()
      .isInt({ min: 18, max: 65 })
      .withMessage("Maximum age must be between 18 and 65"),
    query("weight")
      .optional()
      .isFloat({ min: 45 })
      .withMessage("Weight must be at least 45 kg"),
    query("hasDiseases")
      .optional()
      .isBoolean()
      .withMessage("hasDiseases must be a boolean"),
    query("lastDonationBefore")
      .optional()
      .isISO8601()
      .withMessage("Valid date is required"),
    query("lastDonationAfter")
      .optional()
      .isISO8601()
      .withMessage("Valid date is required"),
    query("donationCountMin")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Minimum donation count must be positive"),
    query("donationCountMax")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maximum donation count must be positive"),
    query("isAvailable")
      .optional()
      .isBoolean()
      .withMessage("isAvailable must be a boolean"),
    query("sortBy")
      .optional()
      .isIn(["lastDonationDate", "age", "donationCount", "distance"])
      .withMessage("Valid sort field is required"),
    query("sortOrder")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Sort order must be asc or desc"),
  ],
  validationMiddleware.validateExpressValidator,
  searchDonors // Using the same searchDonors function for now
);

// Get search filters
router.get("/filters", getSearchFilters);

// Get urgent needs
router.get("/urgent", getUrgentNeeds);

// Export search results
router.post(
  "/export",
  authMiddleware.protect,
  [
    query("format")
      .isIn(["pdf", "csv", "excel"])
      .withMessage("Valid export format is required"),
    query("type")
      .isIn(["donors", "requests"])
      .withMessage("Valid export type is required"),
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("district").optional().trim(),
    query("upazila").optional().trim(),
  ],
  validationMiddleware.validateExpressValidator,
  exportSearchResults
);

// TODO: Implement these routes if needed
// Remove or comment out routes that don't have corresponding controller functions

/*
// Search by location
router.get(
  "/location",
  rateLimiter.searchLimiter,
  [
    query("lat").optional().isFloat().withMessage("Valid latitude is required"),
    query("lng")
      .optional()
      .isFloat()
      .withMessage("Valid longitude is required"),
    query("radius")
      .optional()
      .isFloat({ min: 1, max: 100 })
      .withMessage("Radius must be between 1 and 100 km"),
    query("type")
      .isIn(["donors", "requests", "hospitals"])
      .withMessage("Valid search type is required"),
  ],
  validationMiddleware.validateExpressValidator,
  searchByLocation // This function doesn't exist yet
);

// Search hospitals
router.get(
  "/hospitals",
  rateLimiter.searchLimiter,
  [
    query("district").optional().trim(),
    query("upazila").optional().trim(),
    query("name").optional().trim(),
    query("hasBloodBank")
      .optional()
      .isBoolean()
      .withMessage("hasBloodBank must be a boolean"),
    query("emergencyServices")
      .optional()
      .isBoolean()
      .withMessage("emergencyServices must be a boolean"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  validationMiddleware.validateExpressValidator,
  searchHospitals // This function doesn't exist yet
);

// Search statistics
router.get("/stats", authMiddleware.protect, getSearchStatistics); // Doesn't exist

// Recent searches
router.get(
  "/recent",
  authMiddleware.protect,
  validationMiddleware.validatePagination,
  getRecentSearches // Doesn't exist
);

// Clear recent searches
router.delete("/recent", authMiddleware.protect, clearRecentSearches); // Doesn't exist

// Save search (for frequent searches)
router.post(
  "/save",
  authMiddleware.protect,
  [
    query("name").trim().notEmpty().withMessage("Search name is required"),
    query("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .withMessage("Valid blood group is required"),
    query("district").optional().trim(),
    query("upazila").optional().trim(),
  ],
  validationMiddleware.validateExpressValidator,
  saveSearch // Doesn't exist
);

router.get(
  "/saved",
  authMiddleware.protect,
  validationMiddleware.validatePagination,
  getSavedSearches // Doesn't exist
);

router.delete(
  "/saved/:id",
  authMiddleware.protect,
  validationMiddleware.validateObjectId("id"),
  deleteSavedSearch // Doesn't exist
);

// Search suggestions (autocomplete)
router.get(
  "/suggestions",
  rateLimiter.searchLimiter,
  [
    query("q").trim().notEmpty().withMessage("Search query is required"),
    query("type")
      .optional()
      .isIn(["donors", "requests", "hospitals", "locations"])
      .withMessage("Valid suggestion type is required"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage("Limit must be between 1 and 10"),
  ],
  validationMiddleware.validateExpressValidator,
  getSearchSuggestions // Doesn't exist
);
*/

export default router;