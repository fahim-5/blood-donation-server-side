/**
 * Async Handler Middleware
 * ===========================================
 * This middleware wraps async route handlers to automatically catch errors
 * and pass them to Express error handling middleware.
 * 
 * Benefits:
 * - Eliminates repetitive try-catch blocks in controllers
 * - Centralizes error handling
 * - Provides cleaner, more readable controller code
 * - Ensures consistent error response format
 * 
 * Usage in controllers:
 * ===========================================
 * Instead of:
 *   const getUsers = async (req, res, next) => {
 *     try {
 *       const users = await User.find();
 *       res.json(users);
 *     } catch (error) {
 *       next(error);
 *     }
 *   }
 * 
 * Use:
 *   const getUsers = asyncHandler(async (req, res, next) => {
 *     const users = await User.find();
 *     res.json(users);
 *   })
 * 
 * @version 1.0.0
 * @author Your Name
 * @description Express async error handling middleware
 */

/**
 * Async handler wrapper function
 * 
 * @param {Function} fn - Async function to be wrapped
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Basic usage
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.find();
 *   res.status(200).json({ success: true, data: users });
 * }));
 * 
 * @example
 * // With parameters and queries
 * router.get('/users/:id', asyncHandler(async (req, res) => {
 *   const user = await User.findById(req.params.id);
 *   if (!user) {
 *     throw new ErrorResponse('User not found', 404);
 *   }
 *   res.status(200).json({ success: true, data: user });
 * }));
 */
const asyncHandler = (fn) => {
  /**
   * Wrapped middleware function
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   * @returns {Promise<void>}
   */
  return async (req, res, next) => {
    try {
      // Store request start time for performance monitoring
      const startTime = Date.now();
      
      // Execute the wrapped async function
      await fn(req, res, next);
      
      // Log successful request completion (optional)
      const duration = Date.now() - startTime;
      if (process.env.NODE_ENV === 'development') {
        console.log(`✓ ${req.method} ${req.originalUrl} - ${duration}ms`);
      }
      
    } catch (error) {
      // Enhanced error logging for better debugging
      const errorLog = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        request: {
          method: req.method,
          url: req.originalUrl,
          route: req.route?.path || 'N/A',
          params: req.params,
          query: req.query,
          body: process.env.NODE_ENV === 'development' ? req.body : undefined,
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
        },
        user: {
          id: req.user?._id || 'Unauthenticated',
          email: req.user?.email || 'N/A',
          role: req.user?.role || 'N/A',
        },
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          validationErrors: error.errors || undefined,
        },
      };
      
      // Log error details
      console.error('❌ Async Handler Error:', JSON.stringify(errorLog, null, 2));
      
      // Additional database error handling
      if (error.name === 'CastError') {
        // Handle MongoDB CastError (invalid ObjectId)
        error.message = `Resource not found with id: ${error.value}`;
        error.statusCode = 404;
      }
      
      if (error.name === 'ValidationError') {
        // Handle Mongoose validation errors
        error.message = Object.values(error.errors).map(val => val.message).join(', ');
        error.statusCode = 400;
      }
      
      if (error.code === 11000) {
        // Handle duplicate key errors
        const field = Object.keys(error.keyValue)[0];
        error.message = `Duplicate value entered for ${field}. Please use another value.`;
        error.statusCode = 400;
      }
      
      if (error.name === 'JsonWebTokenError') {
        error.message = 'Invalid token. Please log in again.';
        error.statusCode = 401;
      }
      
      if (error.name === 'TokenExpiredError') {
        error.message = 'Your token has expired. Please log in again.';
        error.statusCode = 401;
      }
      
      // Ensure error has a statusCode
      if (!error.statusCode) {
        error.statusCode = error.statusCode || 500;
      }
      
      // Set default error message for 500 errors
      if (error.statusCode === 500 && process.env.NODE_ENV === 'production') {
        error.message = 'Server Error';
      }
      
      // Add request ID to error for tracking
      error.requestId = req.id || req.headers['x-request-id'] || 'N/A';
      
      // Pass error to Express error handling middleware
      next(error);
    }
  };
};

/**
 * Enhanced async handler with custom error handling
 * 
 * @param {Function} fn - Async function to be wrapped
 * @param {Object} options - Configuration options
 * @param {Function} options.customErrorHandler - Custom error handler function
 * @param {boolean} options.logPerformance - Whether to log request performance
 * @param {boolean} options.suppressLogs - Whether to suppress error logs
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Custom error handling
 * const customHandler = asyncHandler.withOptions({
 *   customErrorHandler: (error, req, res) => {
 *     // Custom error handling logic
 *     console.log('Custom error handler triggered:', error.message);
 *   },
 *   logPerformance: true
 * });
 */
asyncHandler.withOptions = (fn, options = {}) => {
  const {
    customErrorHandler,
    logPerformance = false,
    suppressLogs = false,
  } = options;
  
  return async (req, res, next) => {
    try {
      const startTime = logPerformance ? Date.now() : null;
      
      await fn(req, res, next);
      
      if (logPerformance && startTime) {
        const duration = Date.now() - startTime;
        console.log(`⏱️  ${req.method} ${req.originalUrl} - ${duration}ms`);
      }
      
    } catch (error) {
      // Use custom error handler if provided
      if (customErrorHandler) {
        return customErrorHandler(error, req, res, next);
      }
      
      // Suppress logs if configured
      if (!suppressLogs) {
        console.error('❌ Error:', {
          message: error.message,
          path: req.originalUrl,
          method: req.method,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
      
      next(error);
    }
  };
};

/**
 * Batch async handler for processing multiple async operations
 * 
 * @param {Array<Function>} handlers - Array of async handler functions
 * @returns {Function} Combined middleware function
 * 
 * @example
 * // Process multiple async operations sequentially
 * router.post('/bulk', asyncHandler.batch([
 *   async (req, res, next) => {
 *     // First operation
 *     const user = await User.create(req.body.user);
 *     req.user = user;
 *     next();
 *   },
 *   async (req, res, next) => {
 *     // Second operation
 *     const profile = await Profile.create({ ...req.body.profile, user: req.user._id });
 *     req.profile = profile;
 *     next();
 *   },
 *   async (req, res) => {
 *     // Final response
 *     res.status(201).json({
 *       success: true,
 *       data: { user: req.user, profile: req.profile }
 *     });
 *   }
 * ]));
 */
asyncHandler.batch = (handlers) => {
  return async (req, res, next) => {
    try {
      for (const handler of handlers) {
        await handler(req, res, next);
      }
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Timeout wrapper for async handlers
 * 
 * @param {Function} fn - Async function to be wrapped
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Function} Express middleware function with timeout
 * 
 * @example
 * // Handler with 10 second timeout
 * router.get('/slow-operation', asyncHandler.withTimeout(
 *   async (req, res) => {
 *     // This will throw if it takes more than 10 seconds
 *     const result = await someSlowOperation();
 *     res.json(result);
 *   },
 *   10000 // 10 seconds
 * ));
 */
asyncHandler.withTimeout = (fn, timeoutMs = 10000) => {
  return async (req, res, next) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    const executionPromise = fn(req, res, next);
    
    try {
      await Promise.race([executionPromise, timeoutPromise]);
    } catch (error) {
      error.statusCode = 408; // Request Timeout
      next(error);
    }
  };
};

/**
 * Retry wrapper for async handlers (useful for database connections)
 * 
 * @param {Function} fn - Async function to be wrapped
 * @param {Object} options - Retry options
 * @param {number} options.retries - Number of retry attempts
 * @param {number} options.delay - Delay between retries in ms
 * @param {Function} options.shouldRetry - Function to determine if retry should be attempted
 * @returns {Function} Express middleware function with retry logic
 * 
 * @example
 * // Handler with retry logic for database operations
 * router.get('/data', asyncHandler.withRetry(
 *   async (req, res) => {
 *     const data = await Database.find(); // May fail due to temporary network issues
 *     res.json(data);
 *   },
 *   {
 *     retries: 3,
 *     delay: 1000,
 *     shouldRetry: (error) => error.code === 'ECONNREFUSED'
 *   }
 * ));
 */
asyncHandler.withRetry = (fn, options = {}) => {
  const {
    retries = 3,
    delay = 1000,
    shouldRetry = (error) => error.name === 'MongoNetworkError' || error.code === 'ECONNREFUSED'
  } = options;
  
  return async (req, res, next) => {
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn(req, res, next);
      } catch (error) {
        lastError = error;
        
        // Check if we should retry
        if (attempt === retries || !shouldRetry(error)) {
          break;
        }
        
        console.log(`Retry attempt ${attempt}/${retries} for ${req.method} ${req.originalUrl}`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    
    next(lastError);
  };
};

// Export the asyncHandler function
export default asyncHandler;