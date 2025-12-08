const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const validationMiddleware = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const blockUserMiddleware = require('../middleware/blockUserMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');
const { body, param } = require('express-validator');

// Apply blocked user check to all protected routes
router.use(authMiddleware.protect, blockUserMiddleware.checkBlockedUser);

// Profile routes
router.get(
    '/profile',
    userController.getProfile
);

router.put(
    '/profile',
    uploadMiddleware.uploadSingle('avatar'),
    uploadMiddleware.cleanupUploads,
    [
        body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
        body('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Valid blood group is required'),
        body('district').optional().trim().notEmpty().withMessage('District is required'),
        body('upazila').optional().trim().notEmpty().withMessage('Upazila is required'),
        body('phone').optional().trim().isMobilePhone().withMessage('Valid phone number is required'),
        body('dateOfBirth').optional().isISO8601().withMessage('Valid date is required'),
        body('lastDonationDate').optional().isISO8601().withMessage('Valid date is required')
    ],
    validationMiddleware.validateExpressValidator,
    userController.updateProfile
);

router.get(
    '/profile/:id',
    validationMiddleware.validateObjectId('id'),
    userController.getUserProfile
);

// User management routes (Admin only)
router.get(
    '/',
    roleMiddleware.isAdmin,
    validationMiddleware.validatePagination,
    userController.getAllUsers
);

router.get(
    '/:id',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isOwnerOrAdmin('User'),
    userController.getUserById
);

router.put(
    '/:id/status',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isAdmin,
    blockUserMiddleware.adminOnlyBlocking,
    [
        body('status').isIn(['active', 'blocked']).withMessage('Status must be either active or blocked'),
        body('reason').optional().trim()
    ],
    validationMiddleware.validateExpressValidator,
    userController.updateUserStatus
);

router.put(
    '/:id/role',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isAdmin,
    [
        body('role').isIn(['donor', 'volunteer', 'admin']).withMessage('Role must be donor, volunteer, or admin')
    ],
    validationMiddleware.validateExpressValidator,
    userController.updateUserRole
);

router.delete(
    '/:id',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isAdmin,
    userController.deleteUser
);

// User statistics
router.get(
    '/:id/stats',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isOwnerOrAdmin('User'),
    userController.getUserStats
);

// User activity
router.get(
    '/:id/activity',
    validationMiddleware.validateObjectId('id'),
    validationMiddleware.validatePagination,
    roleMiddleware.isOwnerOrAdmin('User'),
    userController.getUserActivity
);

module.exports = router;