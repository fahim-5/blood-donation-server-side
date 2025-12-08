const cors = require('cors');
const logger = require('../middleware/loggerMiddleware').logger;

// CORS configuration
const corsConfig = {
    // Origin configuration
    origins: {
        // Allowed origins
        allowed: process.env.CORS_ALLOWED_ORIGINS 
            ? process.env.CORS_ALLOWED_ORIGINS.split(',') 
            : [
                'http://localhost:3000',
                'http://localhost:3001',
                'http://localhost:5173',
                'https://blood-donation-app.vercel.app',
                'https://blood-donation-app.netlify.app',
                'https://*.vercel.app',
                'https://*.netlify.app'
            ],
        
        // Regex patterns for dynamic origins
        patterns: [
            /^https?:\/\/localhost(:\d+)?$/,
            /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
            /^https:\/\/(.+\.)?blood-donation\.com$/,
            /^https:\/\/(.+\.)?blooddonationapp\.com$/,
            /^https:\/\/.+\.vercel\.app$/,
            /^https:\/\/.+\.netlify\.app$/,
            /^https:\/\/.+\.github\.io$/
        ],
        
        // Default origin for development
        default: 'http://localhost:3000'
    },
    
    // CORS options
    options: {
        // Origin configuration
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) {
                return callback(null, true);
            }
            
            // Check against allowed origins
            if (corsConfig.origins.allowed.includes(origin)) {
                return callback(null, true);
            }
            
            // Check against regex patterns
            for (const pattern of corsConfig.origins.patterns) {
                if (pattern.test(origin)) {
                    return callback(null, true);
                }
            }
            
            // Origin not allowed
            logger.warn(`CORS blocked request from origin: ${origin}`);
            return callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
        },
        
        // Credentials
        credentials: process.env.CORS_CREDENTIALS === 'true',
        
        // Allowed methods
        methods: process.env.CORS_METHODS 
            ? process.env.CORS_METHODS.split(',')
            : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        
        // Allowed headers
        allowedHeaders: process.env.CORS_ALLOWED_HEADERS
            ? process.env.CORS_ALLOWED_HEADERS.split(',')
            : [
                'Origin',
                'X-Requested-With',
                'Content-Type',
                'Accept',
                'Authorization',
                'X-Access-Token',
                'X-Refresh-Token',
                'X-API-Key',
                'X-Client-ID',
                'X-Client-Version',
                'X-Device-ID',
                'X-Platform',
                'X-Timezone',
                'Cache-Control',
                'Pragma',
                'If-Modified-Since'
            ],
        
        // Exposed headers
        exposedHeaders: process.env.CORS_EXPOSED_HEADERS
            ? process.env.CORS_EXPOSED_HEADERS.split(',')
            : [
                'Content-Length',
                'Content-Type',
                'Authorization',
                'X-Access-Token',
                'X-Refresh-Token',
                'X-Total-Count',
                'X-Total-Pages',
                'X-Current-Page',
                'X-Per-Page',
                'X-RateLimit-Limit',
                'X-RateLimit-Remaining',
                'X-RateLimit-Reset'
            ],
        
        // Max age (in seconds)
        maxAge: parseInt(process.env.CORS_MAX_AGE || '86400'), // 24 hours
        
        // Preflight continue
        preflightContinue: false,
        
        // Options success status
        optionsSuccessStatus: 204
    },
    
    // CORS middleware instances
    middleware: {
        default: null,
        preflight: null,
        perRoute: {}
    },
    
    // CORS statistics
    stats: {
        totalRequests: 0,
        blockedRequests: 0,
        preflightRequests: 0,
        byOrigin: {},
        lastReset: new Date()
    }
};

// Initialize CORS middleware
const initializeCors = () => {
    try {
        // Create default CORS middleware
        corsConfig.middleware.default = cors(corsConfig.options);
        
        // Create preflight middleware
        corsConfig.middleware.preflight = cors({
            ...corsConfig.options,
            methods: ['OPTIONS']
        });
        
        logger.info('CORS middleware initialized');
        logger.debug(`Allowed origins: ${corsConfig.origins.allowed.join(', ')}`);
        logger.debug(`Allowed methods: ${corsConfig.options.methods.join(', ')}`);
        
        return corsConfig.middleware.default;
    } catch (error) {
        logger.error(`Failed to initialize CORS: ${error.message}`);
        throw error;
    }
};

// Get CORS middleware
const getCorsMiddleware = (type = 'default') => {
    if (!corsConfig.middleware[type]) {
        initializeCors();
    }
    
    return corsConfig.middleware[type];
};

// Create custom CORS middleware for specific route
const createCustomCors = (options = {}) => {
    const customOptions = {
        ...corsConfig.options,
        ...options
    };
    
    return cors(customOptions);
};

// CORS preflight handler
const handlePreflight = (req, res, next) => {
    // Track preflight requests
    corsConfig.stats.preflightRequests++;
    corsConfig.stats.totalRequests++;
    
    // Handle OPTIONS method
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    next();
};

// CORS error handler
const corsErrorHandler = (err, req, res, next) => {
    if (err) {
        // Track blocked requests
        corsConfig.stats.blockedRequests++;
        
        // Log CORS error
        logger.warn(`CORS error: ${err.message}`, {
            origin: req.headers.origin,
            method: req.method,
            url: req.originalUrl
        });
        
        return res.status(403).json({
            success: false,
            message: 'CORS policy: Access denied',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
    
    next();
};

// CORS statistics middleware
const corsStatsMiddleware = (req, res, next) => {
    // Track request
    corsConfig.stats.totalRequests++;
    
    const origin = req.headers.origin || 'no-origin';
    
    // Track by origin
    if (!corsConfig.stats.byOrigin[origin]) {
        corsConfig.stats.byOrigin[origin] = {
            requests: 0,
            blocked: 0,
            lastAccess: null
        };
    }
    
    corsConfig.stats.byOrigin[origin].requests++;
    corsConfig.stats.byOrigin[origin].lastAccess = new Date();
    
    // Add CORS headers to response
    res.setHeader('X-CORS-Policy', 'enabled');
    res.setHeader('X-CORS-Allowed-Origins', corsConfig.origins.allowed.join(','));
    
    next();
};

// Get CORS statistics
const getCorsStats = () => {
    return {
        ...corsConfig.stats,
        uptime: process.uptime(),
        origins: Object.keys(corsConfig.stats.byOrigin).length,
        configuration: {
            allowedOrigins: corsConfig.origins.allowed.length,
            allowedMethods: corsConfig.options.methods,
            maxAge: corsConfig.options.maxAge,
            credentials: corsConfig.options.credentials
        }
    };
};

// Reset CORS statistics
const resetCorsStats = () => {
    corsConfig.stats = {
        totalRequests: 0,
        blockedRequests: 0,
        preflightRequests: 0,
        byOrigin: {},
        lastReset: new Date()
    };
    
    return corsConfig.stats;
};

// Update CORS configuration dynamically
const updateCorsConfig = (newConfig) => {
    try {
        // Update allowed origins
        if (newConfig.allowedOrigins) {
            corsConfig.origins.allowed = Array.isArray(newConfig.allowedOrigins)
                ? newConfig.allowedOrigins
                : newConfig.allowedOrigins.split(',');
        }
        
        // Update regex patterns
        if (newConfig.patterns) {
            corsConfig.origins.patterns = newConfig.patterns.map(pattern => 
                new RegExp(pattern)
            );
        }
        
        // Update CORS options
        if (newConfig.options) {
            Object.assign(corsConfig.options, newConfig.options);
        }
        
        // Reinitialize CORS middleware
        initializeCors();
        
        logger.info('CORS configuration updated successfully');
        
        return {
            success: true,
            message: 'CORS configuration updated',
            config: getCorsConfig()
        };
    } catch (error) {
        logger.error(`Update CORS config error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Get current CORS configuration
const getCorsConfig = () => {
    return {
        origins: {
            allowed: corsConfig.origins.allowed,
            patterns: corsConfig.origins.patterns.map(p => p.toString()),
            default: corsConfig.origins.default
        },
        options: {
            credentials: corsConfig.options.credentials,
            methods: corsConfig.options.methods,
            allowedHeaders: corsConfig.options.allowedHeaders,
            exposedHeaders: corsConfig.options.exposedHeaders,
            maxAge: corsConfig.options.maxAge,
            preflightContinue: corsConfig.options.preflightContinue,
            optionsSuccessStatus: corsConfig.options.optionsSuccessStatus
        },
        initialized: !!corsConfig.middleware.default,
        environment: process.env.NODE_ENV
    };
};

// Check if origin is allowed
const isOriginAllowed = (origin) => {
    if (!origin) return true;
    
    // Check against allowed origins
    if (corsConfig.origins.allowed.includes(origin)) {
        return true;
    }
    
    // Check against regex patterns
    for (const pattern of corsConfig.origins.patterns) {
        if (pattern.test(origin)) {
            return true;
        }
    }
    
    return false;
};

// Add origin dynamically
const addAllowedOrigin = (origin) => {
    try {
        if (!origin) {
            return {
                success: false,
                error: 'Origin is required'
            };
        }
        
        // Check if origin already exists
        if (corsConfig.origins.allowed.includes(origin)) {
            return {
                success: true,
                message: 'Origin already allowed',
                origin
            };
        }
        
        // Add origin
        corsConfig.origins.allowed.push(origin);
        
        // Reinitialize CORS middleware
        initializeCors();
        
        logger.info(`Added allowed origin: ${origin}`);
        
        return {
            success: true,
            message: 'Origin added successfully',
            origin,
            totalOrigins: corsConfig.origins.allowed.length
        };
    } catch (error) {
        logger.error(`Add allowed origin error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Remove origin dynamically
const removeAllowedOrigin = (origin) => {
    try {
        const index = corsConfig.origins.allowed.indexOf(origin);
        
        if (index === -1) {
            return {
                success: false,
                error: 'Origin not found in allowed list'
            };
        }
        
        // Remove origin
        corsConfig.origins.allowed.splice(index, 1);
        
        // Reinitialize CORS middleware
        initializeCors();
        
        logger.info(`Removed allowed origin: ${origin}`);
        
        return {
            success: true,
            message: 'Origin removed successfully',
            origin,
            totalOrigins: corsConfig.origins.allowed.length
        };
    } catch (error) {
        logger.error(`Remove allowed origin error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Export configuration and utilities
module.exports = {
    corsConfig,
    initializeCors,
    getCorsMiddleware,
    createCustomCors,
    handlePreflight,
    corsErrorHandler,
    corsStatsMiddleware,
    getCorsStats,
    resetCorsStats,
    updateCorsConfig,
    getCorsConfig,
    isOriginAllowed,
    addAllowedOrigin,
    removeAllowedOrigin
};