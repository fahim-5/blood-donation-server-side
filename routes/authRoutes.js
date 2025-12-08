const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validationMiddleware = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const { body } = require('express-validator');

// Validation schemas
const registerValidation = [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
    body('bloodGroup').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Valid blood group is required'),
    body('district').trim().notEmpty().withMessage('District is required'),
    body('upazila').trim().notEmpty().withMessage('Upazila is required'),
    body('avatar').optional().isURL().withMessage('Avatar must be a valid URL')
];

const loginValidation = [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
];

// Public routes
router.post(
    '/register',
    rateLimiter.authLimiter,
    registerValidation,
    validationMiddleware.validateExpressValidator,
    authController.register
);

router.post(
    '/login',
    rateLimiter.authLimiter,
    loginValidation,
    validationMiddleware.validateExpressValidator,
    authController.login
);

router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', rateLimiter.passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password/:token', rateLimiter.passwordResetLimiter, authController.resetPassword);

// Protected routes
router.get(
    '/me',
    authMiddleware.protect,
    authController.getCurrentUser
);

router.put(
    '/change-password',
    authMiddleware.protect,
    [
        body('currentPassword').notEmpty().withMessage('Current password is required'),
        body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
        body('confirmPassword').custom((value, { req }) => value === req.body.newPassword).withMessage('Passwords do not match')
    ],
    validationMiddleware.validateExpressValidator,
    authController.changePassword
);

router.post(
    '/logout',
    authMiddleware.protect,
    authController.logout
);

// Admin only routes
router.get(
    '/users',
    authMiddleware.protect,
    require('../middleware/roleMiddleware').isAdmin,
    authController.getAllUsers
);

module.exports = router;