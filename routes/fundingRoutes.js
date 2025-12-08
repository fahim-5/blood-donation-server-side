const express = require('express');
const router = express.Router();
const fundingController = require('../controllers/fundingController');
const validationMiddleware = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { body, param, query } = require('express-validator');

// Apply authentication to all routes
router.use(authMiddleware.protect);

// Get all funding (Admin/Volunteer can see all, donors see only theirs)
router.get(
    '/',
    validationMiddleware.validatePagination,
    [
        query('dateFrom').optional().isISO8601().withMessage('Valid date is required'),
        query('dateTo').optional().isISO8601().withMessage('Valid date is required'),
        query('minAmount').optional().isFloat({ min: 0 }).withMessage('Minimum amount must be a positive number'),
        query('maxAmount').optional().isFloat({ min: 0 }).withMessage('Maximum amount must be a positive number'),
        query('status').optional().isIn(['pending', 'completed', 'failed', 'refunded']).withMessage('Valid status is required')
    ],
    validationMiddleware.validateExpressValidator,
    fundingController.getFunding
);

// Get funding statistics
router.get(
    '/stats',
    fundingController.getFundingStatistics
);

// Get single funding by ID
router.get(
    '/:id',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isOwnerOrAdmin('Funding'),
    fundingController.getFundingById
);

// Create funding (make donation)
router.post(
    '/',
    [
        body('amount').isFloat({ min: 10 }).withMessage('Amount must be at least 10 BDT'),
        body('paymentMethod').isIn(['stripe', 'bank_transfer', 'mobile_banking']).withMessage('Valid payment method is required'),
        body('donorName').optional().trim(),
        body('donorEmail').optional().trim().isEmail().withMessage('Valid email is required'),
        body('isAnonymous').optional().isBoolean().withMessage('isAnonymous must be a boolean'),
        body('message').optional().trim().isLength({ max: 500 }).withMessage('Message cannot exceed 500 characters')
    ],
    validationMiddleware.validateExpressValidator,
    fundingController.createFunding
);

// Update funding (Admin only for status updates)
router.put(
    '/:id',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isAdmin,
    [
        body('status').isIn(['pending', 'completed', 'failed', 'refunded']).withMessage('Valid status is required'),
        body('notes').optional().trim()
    ],
    validationMiddleware.validateExpressValidator,
    fundingController.updateFunding
);

// Delete funding (Admin only)
router.delete(
    '/:id',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isAdmin,
    fundingController.deleteFunding
);

// Stripe payment webhook (public route)
router.post(
    '/webhook/stripe',
    express.raw({ type: 'application/json' }),
    fundingController.stripeWebhook
);

// Create Stripe payment intent
router.post(
    '/create-payment-intent',
    [
        body('amount').isFloat({ min: 10 }).withMessage('Amount must be at least 10 BDT'),
        body('currency').optional().isIn(['bdt', 'usd']).withMessage('Valid currency is required')
    ],
    validationMiddleware.validateExpressValidator,
    fundingController.createPaymentIntent
);

// Get payment methods
router.get(
    '/payment-methods',
    fundingController.getPaymentMethods
);

// Get funding summary for dashboard
router.get(
    '/dashboard/summary',
    fundingController.getFundingSummary
);

// Export funding data (Admin only)
router.get(
    '/export/data',
    roleMiddleware.isAdmin,
    [
        query('format').optional().isIn(['csv', 'excel', 'pdf']).withMessage('Valid export format is required'),
        query('dateFrom').optional().isISO8601().withMessage('Valid date is required'),
        query('dateTo').optional().isISO8601().withMessage('Valid date is required')
    ],
    validationMiddleware.validateExpressValidator,
    fundingController.exportFundingData
);

// Recurring donations
router.post(
    '/setup-recurring',
    [
        body('amount').isFloat({ min: 10 }).withMessage('Amount must be at least 10 BDT'),
        body('interval').isIn(['monthly', 'quarterly', 'yearly']).withMessage('Valid interval is required'),
        body('paymentMethodId').trim().notEmpty().withMessage('Payment method ID is required')
    ],
    validationMiddleware.validateExpressValidator,
    fundingController.setupRecurringDonation
);

router.get(
    '/recurring/my-subscriptions',
    fundingController.getMyRecurringDonations
);

router.delete(
    '/recurring/:id/cancel',
    validationMiddleware.validateObjectId('id'),
    fundingController.cancelRecurringDonation
);

// Funding goals
router.get(
    '/goals',
    fundingController.getFundingGoals
);

router.get(
    '/goals/:id',
    validationMiddleware.validateObjectId('id'),
    fundingController.getFundingGoalById
);

router.post(
    '/goals',
    roleMiddleware.isAdmin,
    [
        body('title').trim().notEmpty().withMessage('Title is required'),
        body('description').optional().trim(),
        body('targetAmount').isFloat({ min: 1000 }).withMessage('Target amount must be at least 1000 BDT'),
        body('deadline').isISO8601().withMessage('Valid deadline date is required'),
        body('imageUrl').optional().trim().isURL().withMessage('Valid image URL is required')
    ],
    validationMiddleware.validateExpressValidator,
    fundingController.createFundingGoal
);

module.exports = router;