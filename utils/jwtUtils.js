const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('./../middleware/loggerMiddleware').logger;

// Generate JWT token
const generateToken = (userId, role = 'donor', additionalData = {}) => {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined in environment variables');
        }

        const payload = {
            id: userId,
            role,
            iat: Math.floor(Date.now() / 1000),
            ...additionalData
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d',
            algorithm: 'HS256'
        });

        return token;
    } catch (error) {
        logger.error(`Token generation error: ${error.message}`);
        throw error;
    }
};

// Generate refresh token
const generateRefreshToken = (userId) => {
    try {
        const refreshToken = crypto.randomBytes(40).toString('hex');
        
        // In production, you might want to hash this before storing
        const refreshTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        
        return {
            token: refreshToken,
            expires: refreshTokenExpires
        };
    } catch (error) {
        logger.error(`Refresh token generation error: ${error.message}`);
        throw error;
    }
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined in environment variables');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256']
        });

        return {
            valid: true,
            decoded,
            error: null
        };
    } catch (error) {
        logger.warn(`Token verification failed: ${error.message}`);
        return {
            valid: false,
            decoded: null,
            error: error.message
        };
    }
};

// Decode token without verification (for inspection)
const decodeToken = (token) => {
    try {
        const decoded = jwt.decode(token);
        return decoded;
    } catch (error) {
        logger.error(`Token decoding error: ${error.message}`);
        return null;
    }
};

// Generate password reset token
const generatePasswordResetToken = () => {
    try {
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
        
        const resetTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        return {
            resetToken,
            hashedToken,
            expires: resetTokenExpires
        };
    } catch (error) {
        logger.error(`Password reset token generation error: ${error.message}`);
        throw error;
    }
};

// Generate email verification token
const generateEmailVerificationToken = () => {
    try {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto
            .createHash('sha256')
            .update(verificationToken)
            .digest('hex');
        
        const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        return {
            verificationToken,
            hashedToken,
            expires: verificationTokenExpires
        };
    } catch (error) {
        logger.error(`Email verification token generation error: ${error.message}`);
        throw error;
    }
};

// Generate API key
const generateApiKey = (prefix = 'bd_') => {
    try {
        const key = crypto.randomBytes(32).toString('hex');
        const apiKey = `${prefix}${key}`;
        const hashedKey = crypto
            .createHash('sha256')
            .update(apiKey)
            .digest('hex');
        
        return {
            apiKey,
            hashedKey
        };
    } catch (error) {
        logger.error(`API key generation error: ${error.message}`);
        throw error;
    }
};

// Check token expiration
const isTokenExpired = (token) => {
    try {
        const decoded = jwt.decode(token);
        if (!decoded || !decoded.exp) return true;
        
        const currentTime = Math.floor(Date.now() / 1000);
        return decoded.exp < currentTime;
    } catch (error) {
        logger.error(`Token expiration check error: ${error.message}`);
        return true;
    }
};

// Get token expiration time
const getTokenExpiration = (token) => {
    try {
        const decoded = jwt.decode(token);
        if (!decoded || !decoded.exp) return null;
        
        return new Date(decoded.exp * 1000);
    } catch (error) {
        logger.error(`Get token expiration error: ${error.message}`);
        return null;
    }
};

// Generate short-lived token (for OTP, etc.)
const generateShortLivedToken = (data, expiresIn = '5m') => {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined in environment variables');
        }

        const token = jwt.sign(data, process.env.JWT_SECRET, {
            expiresIn,
            algorithm: 'HS256'
        });

        return token;
    } catch (error) {
        logger.error(`Short-lived token generation error: ${error.message}`);
        throw error;
    }
};

// Token blacklist utility (for logout)
const tokenBlacklist = new Set();

const blacklistToken = (token) => {
    try {
        const decoded = decodeToken(token);
        if (decoded && decoded.exp) {
            const ttl = decoded.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
                // Store token in blacklist until it expires
                tokenBlacklist.add(token);
                setTimeout(() => {
                    tokenBlacklist.delete(token);
                }, ttl * 1000);
            }
        }
    } catch (error) {
        logger.error(`Token blacklisting error: ${error.message}`);
    }
};

const isTokenBlacklisted = (token) => {
    return tokenBlacklist.has(token);
};

module.exports = {
    generateToken,
    generateRefreshToken,
    verifyToken,
    decodeToken,
    generatePasswordResetToken,
    generateEmailVerificationToken,
    generateApiKey,
    isTokenExpired,
    getTokenExpiration,
    generateShortLivedToken,
    blacklistToken,
    isTokenBlacklisted
};