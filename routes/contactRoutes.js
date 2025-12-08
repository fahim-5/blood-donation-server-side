const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const validationMiddleware = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const { body, query, param } = require('express-validator');

// Public contact form submission
router.post(
    '/submit',
    rateLimiter.contactLimiter,
    [
        body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
        body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
        body('phone').optional().trim().isMobilePhone().withMessage('Valid phone number is required'),
        body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ min: 5 }).withMessage('Subject must be at least 5 characters'),
        body('message').trim().notEmpty().withMessage('Message is required').isLength({ min: 10 }).withMessage('Message must be at least 10 characters'),
        body('category').optional().isIn(['general', 'donation', 'volunteer', 'partnership', 'technical', 'other']).withMessage('Valid category is required'),
        body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Valid priority is required')
    ],
    validationMiddleware.validateExpressValidator,
    contactController.submitContactForm
);

// Get contact information (public)
router.get('/info', contactController.getContactInfo);

// Protected routes (Admin/Volunteer)
router.use(authMiddleware.protect, roleMiddleware.isVolunteer);

// Get all contact submissions
router.get(
    '/submissions',
    validationMiddleware.validatePagination,
    [
        query('status').optional().isIn(['pending', 'read', 'replied', 'archived']).withMessage('Valid status is required'),
        query('category').optional().isIn(['general', 'donation', 'volunteer', 'partnership', 'technical', 'other']).withMessage('Valid category is required'),
        query('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Valid priority is required'),
        query('dateFrom').optional().isISO8601().withMessage('Valid date is required'),
        query('dateTo').optional().isISO8601().withMessage('Valid date is required'),
        query('search').optional().trim()
    ],
    validationMiddleware.validateExpressValidator,
    contactController.getAllSubmissions
);

// Get single submission
router.get(
    '/submissions/:id',
    validationMiddleware.validateObjectId('id'),
    contactController.getSubmissionById
);

// Update submission status
router.put(
    '/submissions/:id/status',
    validationMiddleware.validateObjectId('id'),
    [
        body('status').isIn(['pending', 'read', 'replied', 'archived']).withMessage('Valid status is required'),
        body('notes').optional().trim()
    ],
    validationMiddleware.validateExpressValidator,
    contactController.updateSubmissionStatus
);

// Reply to submission
router.post(
    '/submissions/:id/reply',
    validationMiddleware.validateObjectId('id'),
    [
        body('message').trim().notEmpty().withMessage('Reply message is required').isLength({ min: 5 }).withMessage('Reply message must be at least 5 characters'),
        body('sendEmail').optional().isBoolean().withMessage('sendEmail must be a boolean')
    ],
    validationMiddleware.validateExpressValidator,
    contactController.replyToSubmission
);

// Delete submission (Admin only)
router.delete(
    '/submissions/:id',
    validationMiddleware.validateObjectId('id'),
    roleMiddleware.isAdmin,
    contactController.deleteSubmission
);

// Bulk actions (Admin only)
router.post(
    '/submissions/bulk-action',
    roleMiddleware.isAdmin,
    [
        body('action').isIn(['mark-read', 'mark-replied', 'archive', 'delete']).withMessage('Valid action is required'),
        body('submissionIds').isArray().withMessage('submissionIds must be an array'),
        body('submissionIds.*').isMongoId().withMessage('Invalid submission ID')
    ],
    validationMiddleware.validateExpressValidator,
    contactController.bulkAction
);

// Contact statistics
router.get('/stats', contactController.getContactStats);

// Get unread count
router.get('/unread-count', contactController.getUnreadCount);

// Mark all as read
router.put('/mark-all-read', contactController.markAllAsRead);

// Contact categories management (Admin only)
router.get(
    '/categories',
    roleMiddleware.isAdmin,
    contactController.getCategories
);

router.post(
    '/categories',
    roleMiddleware.isAdmin,
    [
        body('name').trim().notEmpty().withMessage('Category name is required'),
        body('description').optional().trim(),
        body('color').optional().trim().isHexColor().withMessage('Valid hex color is required'),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
    ],
    validationMiddleware.validateExpressValidator,
    contactController.createCategory
);

router.put(
    '/categories/:id',
    roleMiddleware.isAdmin,
    validationMiddleware.validateObjectId('id'),
    [
        body('name').optional().trim().notEmpty().withMessage('Category name is required'),
        body('description').optional().trim(),
        body('color').optional().trim().isHexColor().withMessage('Valid hex color is required'),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
    ],
    validationMiddleware.validateExpressValidator,
    contactController.updateCategory
);

router.delete(
    '/categories/:id',
    roleMiddleware.isAdmin,
    validationMiddleware.validateObjectId('id'),
    contactController.deleteCategory
);

// FAQ management (Admin only)
router.get('/faqs', contactController.getFAQs);

router.post(
    '/faqs',
    roleMiddleware.isAdmin,
    [
        body('question').trim().notEmpty().withMessage('Question is required'),
        body('answer').trim().notEmpty().withMessage('Answer is required'),
        body('category').optional().trim(),
        body('order').optional().isInt({ min: 0 }).withMessage('Order must be a positive integer'),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
    ],
    validationMiddleware.validateExpressValidator,
    contactController.createFAQ
);

router.put(
    '/faqs/:id',
    roleMiddleware.isAdmin,
    validationMiddleware.validateObjectId('id'),
    [
        body('question').optional().trim().notEmpty().withMessage('Question is required'),
        body('answer').optional().trim().notEmpty().withMessage('Answer is required'),
        body('category').optional().trim(),
        body('order').optional().isInt({ min: 0 }).withMessage('Order must be a positive integer'),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
    ],
    validationMiddleware.validateExpressValidator,
    contactController.updateFAQ
);

router.delete(
    '/faqs/:id',
    roleMiddleware.isAdmin,
    validationMiddleware.validateObjectId('id'),
    contactController.deleteFAQ
);

// Feedback system
router.post(
    '/feedback',
    authMiddleware.protect,
    [
        body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
        body('comment').optional().trim().isLength({ max: 1000 }).withMessage('Comment cannot exceed 1000 characters'),
        body('type').optional().isIn(['general', 'bug', 'feature', 'improvement']).withMessage('Valid feedback type is required')
    ],
    validationMiddleware.validateExpressValidator,
    contactController.submitFeedback
);

router.get(
    '/feedback',
    roleMiddleware.isAdmin,
    validationMiddleware.validatePagination,
    contactController.getAllFeedback
);

module.exports = router;