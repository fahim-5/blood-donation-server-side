const express = require('express');
const router = express.Router();
const donationController = require('../controllers/donationController');
const validationMiddleware = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const blockUserMiddleware = require('../middleware/blockUserMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const { body, param, query } = require('express-validator');

// Apply blocked user check to all protected routes
router.use(authMiddleware.protect, blockUserMiddleware.checkBlockedUser);

// Donation request validation
const donationRequestValidation = [
    body('recipientName').trim().notEmpty().withMessage('Recipient name is required').isLength({ min: 2 }).withMessage('Recipient name must be at least 2 characters'),
    body('recipientDistrict').trim().notEmpty().withMessage('Recipient district is required'),
    body('recipientUpazila').trim().notEmpty().withMessage('Recipient upazila is required'),
    body('hospitalName').trim().notEmpty().withMessage('Hospital name is required'),
    body('hospitalAddress').trim().notEmpty().withMessage('Hospital address is required'),
    body('bloodGroup').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Valid blood group is required'),
    body('donationDate').isISO8601().withMessage('Valid donation date is required'),
    body('donationTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid donation time is required (HH:MM format)'),
    body('requestMessage').trim().notEmpty().withMessage('Request message is required').isLength({ min: 10 }).withMessage('Request message must be at least 10 characters'),
    body('urgencyLevel').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Valid urgency level is required'),
    body('requiredUnits').optional().isInt({ min: 1, max: 10 }).withMessage('Required units must be between 1 and 10')
];

// Create donation request (Donors only)
router.post(
    '/',
    rateLimiter.donationRequestLimiter,
    blockUserMiddleware.preventBlockedUserAction(['POST /api/donations']),
    donationRequestValidation,
    validationMiddleware.validateExpressValidator,
    donationController.createDonationRequest
);

// Get user's donation requests
router.get(
    '/my-requests',
    validationMiddleware.validatePagination,
    [
        query('status').optional().isIn(['pending', 'inprogress', 'done', 'canceled']).withMessage('Valid status is required'),
        query('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Valid blood group is required'),
        query('sortBy').optional().isIn(['createdAt', 'donationDate', 'urgency']).withMessage('Valid sort field is required'),
        query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
    ],
    validationMiddleware.validateExpressValidator,
    donationController.getMyDonationRequests
);

// Get single donation request
router.get(
    '/:id',
    validationMiddleware.validateObjectId('id'),
    donationController.getDonationRequest
);

// Update donation request
router.put(
    '/:id',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isOwnerOrAdmin('DonationRequest'),
    donationRequestValidation,
    validationMiddleware.validateExpressValidator,
    donationController.updateDonationRequest
);

// Delete donation request
router.delete(
    '/:id',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isOwnerOrAdmin('DonationRequest'),
    donationController.deleteDonationRequest
);

// Donate to a request (Accept donation)
router.post(
    '/:id/donate',
    validationMiddleware.validateObjectId('id'),
    donationController.acceptDonation
);

// Update donation status
router.put(
    '/:id/status',
    validationMiddleware.validateObjectId('id'),
    [
        body('status').isIn(['pending', 'inprogress', 'done', 'canceled']).withMessage('Valid status is required'),
        body('donorId').optional().isMongoId().withMessage('Valid donor ID is required')
    ],
    validationMiddleware.validateExpressValidator,
    donationController.updateDonationStatus
);

// Get donors for a request
router.get(
    '/:id/donors',
    validationMiddleware.validateObjectId('id'),
    validationMiddleware.validatePagination,
    donationController.getDonationDonors
);

// Get recent requests (for dashboard)
router.get(
    '/dashboard/recent',
    donationController.getRecentDonationRequests
);

// Get statistics
router.get(
    '/stats/overview',
    donationController.getDonationStats
);

// Public routes for pending requests
router.get(
    '/public/pending',
    authMiddleware.optionalAuth,
    validationMiddleware.validatePagination,
    [
        query('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Valid blood group is required'),
        query('district').optional().trim(),
        query('upazila').optional().trim()
    ],
    validationMiddleware.validateExpressValidator,
    donationController.getPendingDonationRequests
);

module.exports = router;