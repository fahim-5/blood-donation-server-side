const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const validationMiddleware = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { body, param, query } = require('express-validator');

// All admin routes require admin role
router.use(authMiddleware.protect, roleMiddleware.isAdmin);

// Dashboard statistics
router.get('/dashboard/stats', adminController.getDashboardStats);

// User management
router.get(
    '/users',
    validationMiddleware.validatePagination,
    [
        query('status').optional().isIn(['active', 'blocked']).withMessage('Valid status is required'),
        query('role').optional().isIn(['donor', 'volunteer', 'admin']).withMessage('Valid role is required'),
        query('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Valid blood group is required'),
        query('district').optional().trim(),
        query('upazila').optional().trim(),
        query('search').optional().trim()
    ],
    validationMiddleware.validateExpressValidator,
    adminController.getAllUsersWithStats
);

// User actions
router.put(
    '/users/:id/block',
    validationMiddleware.validateObjectId('id'),
    [
        body('reason').optional().trim()
    ],
    validationMiddleware.validateExpressValidator,
    adminController.blockUser
);

router.put(
    '/users/:id/unblock',
    validationMiddleware.validateObjectId('id'),
    adminController.unblockUser
);

router.put(
    '/users/:id/role',
    validationMiddleware.validateObjectId('id'),
    [
        body('role').isIn(['donor', 'volunteer', 'admin']).withMessage('Role must be donor, volunteer, or admin')
    ],
    validationMiddleware.validateExpressValidator,
    adminController.changeUserRole
);

// Donation request management
router.get(
    '/donation-requests',
    validationMiddleware.validatePagination,
    [
        query('status').optional().isIn(['pending', 'inprogress', 'done', 'canceled']).withMessage('Valid status is required'),
        query('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Valid blood group is required'),
        query('urgencyLevel').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Valid urgency level is required'),
        query('dateFrom').optional().isISO8601().withMessage('Valid date is required'),
        query('dateTo').optional().isISO8601().withMessage('Valid date is required')
    ],
    validationMiddleware.validateExpressValidator,
    adminController.getAllDonationRequests
);

// Update any donation request
router.put(
    '/donation-requests/:id',
    validationMiddleware.validateObjectId('id'),
    [
        body('status').optional().isIn(['pending', 'inprogress', 'done', 'canceled']).withMessage('Valid status is required'),
        body('urgencyLevel').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Valid urgency level is required'),
        body('donorId').optional().isMongoId().withMessage('Valid donor ID is required')
    ],
    validationMiddleware.validateExpressValidator,
    adminController.updateDonationRequest
);

// Delete any donation request
router.delete(
    '/donation-requests/:id',
    validationMiddleware.validateObjectId('id'),
    adminController.deleteDonationRequest
);

// Funding management
router.get(
    '/funding',
    validationMiddleware.validatePagination,
    [
        query('dateFrom').optional().isISO8601().withMessage('Valid date is required'),
        query('dateTo').optional().isISO8601().withMessage('Valid date is required'),
        query('minAmount').optional().isFloat({ min: 0 }).withMessage('Minimum amount must be a positive number'),
        query('maxAmount').optional().isFloat({ min: 0 }).withMessage('Maximum amount must be a positive number')
    ],
    validationMiddleware.validateExpressValidator,
    adminController.getAllFunding
);

router.get(
    '/funding/stats',
    adminController.getFundingStats
);

// System settings
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// Content management (for homepage content)
router.get('/content', adminController.getContent);
router.put('/content', adminController.updateContent);

// Backup and export
router.get('/export/users', adminController.exportUsers);
router.get('/export/donations', adminController.exportDonations);
router.get('/export/funding', adminController.exportFunding);

// System logs
router.get(
    '/logs',
    validationMiddleware.validatePagination,
    [
        query('level').optional().isIn(['error', 'warn', 'info', 'debug']).withMessage('Valid log level is required'),
        query('dateFrom').optional().isISO8601().withMessage('Valid date is required'),
        query('dateTo').optional().isISO8601().withMessage('Valid date is required')
    ],
    validationMiddleware.validateExpressValidator,
    adminController.getSystemLogs
);

// Bulk operations
router.post('/users/bulk-action', adminController.bulkUserAction);
router.post('/donations/bulk-action', adminController.bulkDonationAction);

module.exports = router;