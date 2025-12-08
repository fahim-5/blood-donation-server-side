const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const donationRoutes = require('./donationRoutes');
const adminRoutes = require('./adminRoutes');
const volunteerRoutes = require('./volunteerRoutes');
const fundingRoutes = require('./fundingRoutes');
const searchRoutes = require('./searchRoutes');
const contactRoutes = require('./contactRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const notificationRoutes = require('./notificationRoutes');

// Use routes with appropriate prefixes
router.use('/api/auth', authRoutes);
router.use('/api/users', userRoutes);
router.use('/api/donations', donationRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api/volunteer', volunteerRoutes);
router.use('/api/funding', fundingRoutes);
router.use('/api/search', searchRoutes);
router.use('/api/contact', contactRoutes);
router.use('/api/dashboard', dashboardRoutes);
router.use('/api/analytics', analyticsRoutes);
router.use('/api/notifications', notificationRoutes);

// Health check endpoint
router.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Blood Donation API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API documentation endpoint
router.get('/api', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Blood Donation Application API',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            donations: '/api/donations',
            admin: '/api/admin',
            volunteer: '/api/volunteer',
            funding: '/api/funding',
            search: '/api/search',
            contact: '/api/contact',
            dashboard: '/api/dashboard',
            analytics: '/api/analytics',
            notifications: '/api/notifications'
        },
        version: '1.0.0'
    });
});

module.exports = router;