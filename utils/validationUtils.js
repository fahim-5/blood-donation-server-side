const validator = require('validator');
const Joi = require('joi');
const logger = require('./../middleware/loggerMiddleware').logger;

// Common validation schemas using Joi
const validationSchemas = {
    // User validation
    userRegistration: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required().lowercase(),
        password: Joi.string().min(6).required(),
        confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
        bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').required(),
        district: Joi.string().required(),
        upazila: Joi.string().required(),
        avatar: Joi.string().uri().optional(),
        phone: Joi.string().pattern(/^[0-9]{11}$/).optional(),
        dateOfBirth: Joi.date().max('now').optional(),
        gender: Joi.string().valid('male', 'female', 'other').optional()
    }),

    userLogin: Joi.object({
        email: Joi.string().email().required().lowercase(),
        password: Joi.string().required()
    }),

    userUpdate: Joi.object({
        name: Joi.string().min(2).max(100).optional(),
        bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').optional(),
        district: Joi.string().optional(),
        upazila: Joi.string().optional(),
        avatar: Joi.string().uri().optional(),
        phone: Joi.string().pattern(/^[0-9]{11}$/).optional(),
        dateOfBirth: Joi.date().max('now').optional(),
        lastDonationDate: Joi.date().max('now').optional(),
        gender: Joi.string().valid('male', 'female', 'other').optional(),
        weight: Joi.number().min(30).max(200).optional(),
        height: Joi.number().min(100).max(250).optional(),
        hasDiseases: Joi.boolean().optional(),
        diseases: Joi.array().items(Joi.string()).optional(),
        isAvailable: Joi.boolean().optional()
    }),

    // Donation request validation
    donationRequest: Joi.object({
        recipientName: Joi.string().min(2).max(100).required(),
        recipientDistrict: Joi.string().required(),
        recipientUpazila: Joi.string().required(),
        hospitalName: Joi.string().required(),
        hospitalAddress: Joi.string().required(),
        bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').required(),
        donationDate: Joi.date().min('now').required(),
        donationTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
        requestMessage: Joi.string().min(10).max(1000).required(),
        urgencyLevel: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
        requiredUnits: Joi.number().min(1).max(10).default(1),
        recipientPhone: Joi.string().pattern(/^[0-9]{11}$/).optional(),
        recipientAge: Joi.number().min(0).max(120).optional(),
        recipientGender: Joi.string().valid('male', 'female', 'other').optional()
    }),

    // Funding validation
    funding: Joi.object({
        amount: Joi.number().min(10).required(),
        paymentMethod: Joi.string().valid('stripe', 'bank_transfer', 'mobile_banking').required(),
        donorName: Joi.string().min(2).max(100).optional(),
        donorEmail: Joi.string().email().optional().lowercase(),
        isAnonymous: Joi.boolean().default(false),
        message: Joi.string().max(500).optional(),
        receiptEmail: Joi.string().email().optional().lowercase()
    }),

    // Contact form validation
    contactForm: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required().lowercase(),
        phone: Joi.string().pattern(/^[0-9]{11}$/).optional(),
        subject: Joi.string().min(5).max(200).required(),
        message: Joi.string().min(10).max(2000).required(),
        category: Joi.string().valid('general', 'donation', 'volunteer', 'partnership', 'technical', 'other').default('general'),
        priority: Joi.string().valid('low', 'medium', 'high').default('medium')
    }),

    // Password validation
    passwordChange: Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(6).required(),
        confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
    }),

    // Search validation
    donorSearch: Joi.object({
        bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').optional(),
        district: Joi.string().optional(),
        upazila: Joi.string().optional(),
        availability: Joi.string().valid('available', 'recently_donated', 'unavailable').optional(),
        minAge: Joi.number().min(18).max(65).optional(),
        maxAge: Joi.number().min(18).max(65).optional(),
        page: Joi.number().min(1).default(1),
        limit: Joi.number().min(1).max(100).default(10),
        sortBy: Joi.string().valid('lastDonationDate', 'age', 'name', 'distance').default('lastDonationDate'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
    }),

    // Email validation
    email: Joi.string().email().required().lowercase(),

    // Phone validation
    phone: Joi.string().pattern(/^[0-9]{11}$/).required(),

    // URL validation
    url: Joi.string().uri().required(),

    // Date range validation
    dateRange: Joi.object({
        startDate: Joi.date().required(),
        endDate: Joi.date().min(Joi.ref('startDate')).required()
    })
};

// Custom validation functions
const validationUtils = {
    // Validate Bangladesh mobile number
    isValidBangladeshiPhone: (phone) => {
        if (!phone) return false;
        const cleaned = phone.replace(/[^0-9]/g, '');
        return /^(?:\+88|88)?(01[3-9]\d{8})$/.test(cleaned);
    },

    // Validate blood group
    isValidBloodGroup: (bloodGroup) => {
        const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
        return validGroups.includes(bloodGroup);
    },

    // Validate district (should be from Bangladesh districts list)
    isValidDistrict: (district, districtsList) => {
        if (!districtsList || !Array.isArray(districtsList)) {
            logger.warn('Districts list not provided for validation');
            return true; // Skip validation if list not provided
        }
        return districtsList.some(d => d.name === district || d.bn_name === district);
    },

    // Validate upazila for a district
    isValidUpazila: (district, upazila, locationData) => {
        if (!locationData || !district || !upazila) return false;
        
        const districtData = locationData.find(d => d.name === district || d.bn_name === district);
        if (!districtData || !districtData.upazilas) return false;
        
        return districtData.upazilas.some(u => u.name === upazila || u.bn_name === upazila);
    },

    // Validate age for blood donation (18-65 years)
    isValidDonorAge: (dateOfBirth) => {
        if (!dateOfBirth) return true; // Skip if not provided
        
        const birthDate = new Date(dateOfBirth);
        const today = new Date();
        
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        return age >= 18 && age <= 65;
    },

    // Validate weight for blood donation (minimum 45kg)
    isValidDonorWeight: (weight) => {
        if (!weight) return true; // Skip if not provided
        return weight >= 45;
    },

    // Validate donation frequency (minimum 90 days between donations)
    isValidDonationFrequency: (lastDonationDate) => {
        if (!lastDonationDate) return true; // First donation
        
        const lastDate = new Date(lastDonationDate);
        const today = new Date();
        const daysSinceLastDonation = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        
        return daysSinceLastDonation >= 90;
    },

    // Validate password strength
    isStrongPassword: (password) => {
        if (!password) return false;
        
        const minLength = 6;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        
        return {
            isValid: password.length >= minLength,
            length: password.length >= minLength,
            hasUpperCase,
            hasLowerCase,
            hasNumbers,
            hasSpecialChar,
            score: [
                password.length >= minLength,
                hasUpperCase,
                hasLowerCase,
                hasNumbers,
                hasSpecialChar
            ].filter(Boolean).length
        };
    },

    // Validate NID (Bangladesh National ID)
    isValidNID: (nid) => {
        if (!nid) return false;
        const cleaned = nid.replace(/[^0-9]/g, '');
        return /^\d{10}$|^\d{13}$|^\d{17}$/.test(cleaned);
    },

    // Validate date is in the future
    isFutureDate: (date) => {
        if (!date) return false;
        const inputDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return inputDate > today;
    },

    // Validate date is in the past
    isPastDate: (date) => {
        if (!date) return false;
        const inputDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return inputDate < today;
    },

    // Validate time format (HH:MM)
    isValidTime: (time) => {
        if (!time) return false;
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
    },

    // Validate amount (positive number)
    isValidAmount: (amount) => {
        if (!amount) return false;
        const num = Number(amount);
        return !isNaN(num) && num > 0;
    },

    // Validate latitude
    isValidLatitude: (lat) => {
        if (!lat) return false;
        const num = Number(lat);
        return !isNaN(num) && num >= -90 && num <= 90;
    },

    // Validate longitude
    isValidLongitude: (lng) => {
        if (!lng) return false;
        const num = Number(lng);
        return !isNaN(num) && num >= -180 && num <= 180;
    },

    // Validate coordinates
    isValidCoordinates: (lat, lng) => {
        return validationUtils.isValidLatitude(lat) && validationUtils.isValidLongitude(lng);
    },

    // Validate image URL
    isValidImageUrl: (url) => {
        if (!url) return false;
        
        // Check if it's a URL
        if (!validator.isURL(url)) return false;
        
        // Check common image extensions
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        const urlLower = url.toLowerCase();
        
        return imageExtensions.some(ext => urlLower.endsWith(ext)) || 
               urlLower.includes('image.ibb.co') || // ImageBB
               urlLower.includes('imgbb.com') ||
               urlLower.includes('cloudinary.com') ||
               urlLower.includes('images.unsplash.com');
    },

    // Validate file size (in bytes)
    isValidFileSize: (size, maxSizeMB = 5) => {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        return size <= maxSizeBytes;
    },

    // Validate file type
    isValidFileType: (mimeType, allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']) => {
        return allowedTypes.includes(mimeType);
    },

    // Sanitize input
    sanitizeInput: (input) => {
        if (typeof input !== 'string') return input;
        
        // Remove script tags and dangerous characters
        let sanitized = input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/on\w+='[^']*'/gi, '')
            .replace(/on\w+=\w+/gi, '');
        
        // Trim and limit length
        sanitized = sanitized.trim().substring(0, 10000);
        
        return sanitized;
    },

    // Validate object ID format
    isValidObjectId: (id) => {
        if (!id) return false;
        return /^[0-9a-fA-F]{24}$/.test(id);
    },

    // Validate enum value
    isValidEnum: (value, enumArray) => {
        if (!enumArray || !Array.isArray(enumArray)) return false;
        return enumArray.includes(value);
    },

    // Validate array of values
    isValidArray: (array, minLength = 0, maxLength = 100) => {
        if (!Array.isArray(array)) return false;
        return array.length >= minLength && array.length <= maxLength;
    },

    // Validate JSON string
    isValidJSON: (str) => {
        try {
            JSON.parse(str);
            return true;
        } catch {
            return false;
        }
    }
};

// Helper to validate using Joi schema
const validateWithSchema = (data, schemaName) => {
    const schema = validationSchemas[schemaName];
    if (!schema) {
        throw new Error(`Schema ${schemaName} not found`);
    }

    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message.replace(/"/g, ''),
            type: detail.type
        }));
        
        return {
            isValid: false,
            errors,
            value: null
        };
    }

    return {
        isValid: true,
        errors: null,
        value
    };
};

module.exports = {
    validationSchemas,
    validateWithSchema,
    ...validationUtils
};