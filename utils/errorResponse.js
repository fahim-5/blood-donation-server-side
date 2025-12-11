/**
 * ErrorResponse Class
 * ===========================================
 * Custom error class for handling API errors with HTTP status codes.
 * Extends the native Error class to include additional properties.
 * 
 * Features:
 * - HTTP status codes
 * - Custom error messages
 * - Operational flag for distinguishing operational errors from programming errors
 * - Stack trace preservation
 * - JSON serialization
 * - Static factory methods for common HTTP errors
 * 
 * @version 1.0.0
 * @description Custom error response handler for Express applications
 */

/**
 * Base ErrorResponse class
 * @extends Error
 */
class ErrorResponse extends Error {
  /**
   * Create a new ErrorResponse
   * 
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {Object} [data] - Additional error data
   * @param {boolean} [isOperational] - Whether the error is operational
   * 
   * @example
   * // Create a custom error
   * throw new ErrorResponse('User not found', 404);
   * 
   * @example
   * // Create error with additional data
   * throw new ErrorResponse('Validation failed', 400, {
   *   fields: ['email', 'password'],
   *   validationErrors: errors.array()
   * });
   */
  constructor(message, statusCode = 500, data = {}, isOperational = true) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;
    this.data = data;
    this.timestamp = new Date().toISOString();
    this.success = false;
    
    // Capture stack trace (excluding constructor call)
    Error.captureStackTrace(this, this.constructor);
    
    // Set the name of the error (useful for logging)
    this.name = this.constructor.name;
    
    // Determine if error should be logged
    this.shouldLog = statusCode >= 500 || process.env.NODE_ENV === 'development';
    
    // Generate unique error ID for tracking
    this.errorId = this.generateErrorId();
  }
  
  /**
   * Generate a unique error ID
   * @returns {string} Unique error identifier
   * @private
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Convert error to JSON format for API responses
   * @returns {Object} JSON representation of the error
   */
  toJSON() {
    const json = {
      success: this.success,
      message: this.message,
      statusCode: this.statusCode,
      status: this.status,
      timestamp: this.timestamp,
      errorId: this.errorId,
      ...(Object.keys(this.data).length > 0 && { data: this.data })
    };
    
    // Include stack trace in development mode
    if (process.env.NODE_ENV === 'development') {
      json.stack = this.stack;
      json.name = this.name;
    }
    
    return json;
  }
  
  /**
   * Log the error with contextual information
   * @param {Object} req - Express request object (optional)
   * @returns {void}
   */
  log(req = null) {
    if (!this.shouldLog) return;
    
    const logEntry = {
      errorId: this.errorId,
      timestamp: this.timestamp,
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      stack: this.stack,
    };
    
    if (req) {
      logEntry.request = {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        userId: req.user?._id || 'unauthenticated',
        userEmail: req.user?.email || 'N/A',
        userRole: req.user?.role || 'N/A',
      };
      
      if (process.env.NODE_ENV === 'development') {
        logEntry.request.body = req.body;
        logEntry.request.params = req.params;
        logEntry.request.query = req.query;
      }
    }
    
    if (Object.keys(this.data).length > 0) {
      logEntry.errorData = this.data;
    }
    
    console.error(JSON.stringify(logEntry, null, 2));
  }
  
  /**
   * Create a 400 Bad Request error
   * @static
   * @param {string} [message='Bad Request'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static badRequest(message = 'Bad Request', data = {}) {
    return new ErrorResponse(message, 400, data);
  }
  
  /**
   * Create a 401 Unauthorized error
   * @static
   * @param {string} [message='Unauthorized'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static unauthorized(message = 'Unauthorized', data = {}) {
    return new ErrorResponse(message, 401, data);
  }
  
  /**
   * Create a 403 Forbidden error
   * @static
   * @param {string} [message='Forbidden'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static forbidden(message = 'Forbidden', data = {}) {
    return new ErrorResponse(message, 403, data);
  }
  
  /**
   * Create a 404 Not Found error
   * @static
   * @param {string} [message='Resource Not Found'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static notFound(message = 'Resource Not Found', data = {}) {
    return new ErrorResponse(message, 404, data);
  }
  
  /**
   * Create a 409 Conflict error
   * @static
   * @param {string} [message='Conflict'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static conflict(message = 'Conflict', data = {}) {
    return new ErrorResponse(message, 409, data);
  }
  
  /**
   * Create a 422 Unprocessable Entity error
   * @static
   * @param {string} [message='Unprocessable Entity'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static unprocessableEntity(message = 'Unprocessable Entity', data = {}) {
    return new ErrorResponse(message, 422, data);
  }
  
  /**
   * Create a 429 Too Many Requests error
   * @static
   * @param {string} [message='Too Many Requests'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static tooManyRequests(message = 'Too Many Requests', data = {}) {
    return new ErrorResponse(message, 429, data);
  }
  
  /**
   * Create a 500 Internal Server Error
   * @static
   * @param {string} [message='Internal Server Error'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static internalServerError(message = 'Internal Server Error', data = {}) {
    return new ErrorResponse(message, 500, data);
  }
  
  /**
   * Create a 503 Service Unavailable error
   * @static
   * @param {string} [message='Service Unavailable'] - Error message
   * @param {Object} [data] - Additional error data
   * @returns {ErrorResponse}
   */
  static serviceUnavailable(message = 'Service Unavailable', data = {}) {
    return new ErrorResponse(message, 503, data);
  }
  
  /**
   * Create error from Mongoose validation error
   * @static
   * @param {Object} mongooseError - Mongoose validation error
   * @returns {ErrorResponse}
   */
  static fromMongooseValidation(mongooseError) {
    const errors = {};
    
    // Extract validation errors
    if (mongooseError.errors) {
      Object.keys(mongooseError.errors).forEach(key => {
        errors[key] = mongooseError.errors[key].message;
      });
    }
    
    // Handle duplicate key errors (code 11000)
    if (mongooseError.code === 11000) {
      const field = Object.keys(mongooseError.keyValue)[0];
      const value = mongooseError.keyValue[field];
      return new ErrorResponse(
        `Duplicate value '${value}' for field '${field}'`,
        400,
        { field, value, code: 'DUPLICATE_KEY' }
      );
    }
    
    return new ErrorResponse(
      'Validation Error',
      400,
      { errors, originalError: mongooseError.message }
    );
  }
  
  /**
   * Create error from JWT error
   * @static
   * @param {string} jwtError - JWT error message
   * @returns {ErrorResponse}
   */
  static fromJWT(jwtError) {
    switch (jwtError) {
      case 'invalid token':
      case 'jwt malformed':
        return new ErrorResponse('Invalid token', 401, { code: 'INVALID_TOKEN' });
      case 'jwt expired':
        return new ErrorResponse('Token has expired', 401, { code: 'TOKEN_EXPIRED' });
      case 'jwt not active':
        return new ErrorResponse('Token not yet active', 401, { code: 'TOKEN_NOT_ACTIVE' });
      default:
        return new ErrorResponse('Authentication error', 401, { code: 'AUTH_ERROR' });
    }
  }
  
  /**
   * Create error from file upload error
   * @static
   * @param {Object} fileError - File upload error
   * @returns {ErrorResponse}
   */
  static fromFileUpload(fileError) {
    if (fileError.code === 'LIMIT_FILE_SIZE') {
      return new ErrorResponse(
        'File too large',
        400,
        { 
          code: 'FILE_TOO_LARGE',
          maxSize: fileError.limit,
          actualSize: fileError.size 
        }
      );
    }
    
    if (fileError.code === 'LIMIT_UNEXPECTED_FILE') {
      return new ErrorResponse(
        'Unexpected file field',
        400,
        { code: 'UNEXPECTED_FILE_FIELD', field: fileError.field }
      );
    }
    
    if (fileError.code === 'INVALID_FILE_TYPE') {
      return new ErrorResponse(
        'Invalid file type',
        400,
        { code: 'INVALID_FILE_TYPE', allowedTypes: fileError.allowedTypes }
      );
    }
    
    return new ErrorResponse('File upload failed', 400, { originalError: fileError.message });
  }
  
  /**
   * Create error for rate limiting
   * @static
   * @param {Object} rateLimitInfo - Rate limit information
   * @returns {ErrorResponse}
   */
  static fromRateLimit(rateLimitInfo = {}) {
    const message = rateLimitInfo.message || 'Too many requests, please try again later';
    const data = {
      code: 'RATE_LIMIT_EXCEEDED',
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.remaining,
      resetTime: rateLimitInfo.resetTime,
      retryAfter: rateLimitInfo.retryAfter,
    };
    
    return new ErrorResponse(message, 429, data);
  }
  
  /**
   * Check if error is an instance of ErrorResponse
   * @static
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is an ErrorResponse
   */
  static isErrorResponse(error) {
    return error instanceof ErrorResponse;
  }
  
  /**
   * Create error from any caught error
   * @static
   * @param {Error} error - Caught error
   * @param {string} [defaultMessage] - Default error message
   * @param {number} [defaultStatusCode] - Default status code
   * @returns {ErrorResponse}
   */
  static fromError(error, defaultMessage = 'An error occurred', defaultStatusCode = 500) {
    // If already an ErrorResponse, return as is
    if (this.isErrorResponse(error)) {
      return error;
    }
    
    // Handle common error types
    if (error.name === 'ValidationError') {
      return this.fromMongooseValidation(error);
    }
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return this.fromJWT(error.message);
    }
    
    if (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return this.fromFileUpload(error);
    }
    
    // Return generic error response
    return new ErrorResponse(
      error.message || defaultMessage,
      error.statusCode || defaultStatusCode,
      { originalError: error.name }
    );
  }
}

// Export the ErrorResponse class
export default ErrorResponse;

/**
 * Convenience functions for common errors
 * These can be imported directly for cleaner code
 */

/**
 * 400 Bad Request error
 * @param {string} [message] - Error message
 * @param {Object} [data] - Additional data
 * @returns {ErrorResponse}
 */
export const BadRequestError = (message, data) => ErrorResponse.badRequest(message, data);

/**
 * 401 Unauthorized error
 * @param {string} [message] - Error message
 * @param {Object} [data] - Additional data
 * @returns {ErrorResponse}
 */
export const UnauthorizedError = (message, data) => ErrorResponse.unauthorized(message, data);

/**
 * 403 Forbidden error
 * @param {string} [message] - Error message
 * @param {Object} [data] - Additional data
 * @returns {ErrorResponse}
 */
export const ForbiddenError = (message, data) => ErrorResponse.forbidden(message, data);

/**
 * 404 Not Found error
 * @param {string} [message] - Error message
 * @param {Object} [data] - Additional data
 * @returns {ErrorResponse}
 */
export const NotFoundError = (message, data) => ErrorResponse.notFound(message, data);

/**
 * 409 Conflict error
 * @param {string} [message] - Error message
 * @param {Object} [data] - Additional data
 * @returns {ErrorResponse}
 */
export const ConflictError = (message, data) => ErrorResponse.conflict(message, data);

/**
 * 422 Unprocessable Entity error
 * @param {string} [message] - Error message
 * @param {Object} [data] - Additional data
 * @returns {ErrorResponse}
 */
export const UnprocessableEntityError = (message, data) => ErrorResponse.unprocessableEntity(message, data);

/**
 * 429 Too Many Requests error
 * @param {string} [message] - Error message
 * @param {Object} [data] - Additional data
 * @returns {ErrorResponse}
 */
export const TooManyRequestsError = (message, data) => ErrorResponse.tooManyRequests(message, data);

/**
 * 500 Internal Server Error
 * @param {string} [message] - Error message
 * @param {Object} [data] - Additional data
 * @returns {ErrorResponse}
 */
export const InternalServerError = (message, data) => ErrorResponse.internalServerError(message, data);