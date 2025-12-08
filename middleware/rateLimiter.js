const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const { RateLimiterMemory, RateLimiterRedis } = require('rate-limiter-flexible');

// Redis client for distributed rate limiting
let redisClient;
if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL);
}

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for health checks and certain paths
        return req.path === '/api/health' || req.path.startsWith('/api/payments/webhook');
    }
});

// Auth rate limiter (stricter for auth routes)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per windowMs
    message: {
        success: false,
        message: 'Too many login attempts from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Donation request limiter
const donationRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each user to 10 donation requests per hour
    keyGenerator: (req) => {
        return req.user ? req.user._id.toString() : req.ip;
    },
    message: {
        success: false,
        message: 'Too many donation requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Search limiter
const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Limit each IP to 30 search requests per minute
    message: {
        success: false,
        message: 'Too many search requests, please slow down'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Contact form limiter
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 contact form submissions per hour
    message: {
        success: false,
        message: 'Too many contact form submissions, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Password reset limiter
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 password reset requests per hour
    message: {
        success: false,
        message: 'Too many password reset requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Dynamic rate limiter based on user role
const dynamicLimiter = (options = {}) => {
    return rateLimit({
        windowMs: options.windowMs || 15 * 60 * 1000,
        max: (req) => {
            if (req.user) {
                switch (req.user.role) {
                    case 'admin':
                        return options.adminLimit || 500;
                    case 'volunteer':
                        return options.volunteerLimit || 200;
                    case 'donor':
                        return options.donorLimit || 100;
                    default:
                        return options.defaultLimit || 50;
                }
            }
            return options.anonymousLimit || 50;
        },
        keyGenerator: (req) => {
            return req.user ? req.user._id.toString() : req.ip;
        },
        message: {
            success: false,
            message: options.message || 'Too many requests, please try again later'
        },
        standardHeaders: true,
        legacyHeaders: false
    });
};

// Rate limiter for specific endpoints using rate-limiter-flexible
const createEndpointLimiter = (points, duration) => {
    const rateLimiter = process.env.REDIS_URL 
        ? new RateLimiterRedis({
            storeClient: redisClient,
            points: points,
            duration: duration
        })
        : new RateLimiterMemory({
            points: points,
            duration: duration
        });

    return async (req, res, next) => {
        try {
            const key = req.user ? `user:${req.user._id}` : `ip:${req.ip}`;
            await rateLimiter.consume(key);
            next();
        } catch (error) {
            return res.status(429).json({
                success: false,
                message: 'Too many requests, please try again later'
            });
        }
    };
};

// Middleware to add rate limit headers
const addRateLimitHeaders = (req, res, next) => {
    res.setHeader('X-RateLimit-Limit', req.rateLimit?.limit || 100);
    res.setHeader('X-RateLimit-Remaining', req.rateLimit?.remaining || 99);
    res.setHeader('X-RateLimit-Reset', req.rateLimit?.resetTime || Date.now() + 900000);
    next();
};

module.exports = {
    apiLimiter,
    authLimiter,
    donationRequestLimiter,
    searchLimiter,
    contactLimiter,
    passwordResetLimiter,
    dynamicLimiter,
    createEndpointLimiter,
    addRateLimitHeaders
};