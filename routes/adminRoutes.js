import express from 'express';
import { body, param, query } from 'express-validator';
import adminController from '../controllers/adminController.js';
import validationMiddleware from '../middleware/validationMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';
import { isAdmin } from '../middleware/roleMiddleware.js';

const router = express.Router();

// All admin routes require admin role
router.use(protect, isAdmin);  // Fixed: Use isAdmin directly (not roleMiddleware.isAdmin)

// Dashboard statistics
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/analytics', adminController.getAnalytics);

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
    adminController.getUserManagement
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
    '/donations',
    validationMiddleware.validatePagination,
    [
        query('status').optional().isIn(['pending', 'inprogress', 'done', 'canceled']).withMessage('Valid status is required'),
        query('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Valid blood group is required'),
        query('urgency').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Valid urgency level is required'),
        query('startDate').optional().isISO8601().withMessage('Valid date is required'),
        query('endDate').optional().isISO8601().withMessage('Valid date is required')
    ],
    validationMiddleware.validateExpressValidator,
    adminController.getDonationManagement
);

// System logs
router.get(
    '/logs',
    validationMiddleware.validatePagination,
    [
        query('severity').optional().isIn(['error', 'warn', 'info', 'debug']).withMessage('Valid log level is required'),
        query('startDate').optional().isISO8601().withMessage('Valid date is required'),
        query('endDate').optional().isISO8601().withMessage('Valid date is required')
    ],
    validationMiddleware.validateExpressValidator,
    adminController.getSystemLogs
);

// System notifications
router.post('/notify-all', adminController.sendSystemNotification);

// Data cleanup
router.post('/cleanup', adminController.cleanupOldData);

// Data export
router.get('/export', adminController.exportData);

export default router;