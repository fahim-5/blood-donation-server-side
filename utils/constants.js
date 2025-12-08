// Application constants
module.exports = {
    // Application info
    APP_NAME: 'Blood Donation Application',
    APP_VERSION: '1.0.0',
    APP_DESCRIPTION: 'A platform to connect blood donors with recipients in need',
    
    // User roles
    ROLES: {
        ADMIN: 'admin',
        VOLUNTEER: 'volunteer',
        DONOR: 'donor'
    },
    
    // User status
    USER_STATUS: {
        ACTIVE: 'active',
        BLOCKED: 'blocked',
        INACTIVE: 'inactive',
        PENDING: 'pending'
    },
    
    // Donation request status
    DONATION_STATUS: {
        PENDING: 'pending',
        INPROGRESS: 'inprogress',
        DONE: 'done',
        CANCELED: 'canceled',
        EXPIRED: 'expired'
    },
    
    // Blood groups
    BLOOD_GROUPS: [
        'A+', 'A-', 
        'B+', 'B-', 
        'AB+', 'AB-', 
        'O+', 'O-'
    ],
    
    // Blood compatibility
    BLOOD_COMPATIBILITY: {
        'A+': ['A+', 'A-', 'O+', 'O-'],
        'A-': ['A-', 'O-'],
        'B+': ['B+', 'B-', 'O+', 'O-'],
        'B-': ['B-', 'O-'],
        'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], // Universal recipient
        'AB-': ['A-', 'B-', 'AB-', 'O-'],
        'O+': ['O+', 'O-'],
        'O-': ['O-'] // Universal donor
    },
    
    // Urgency levels
    URGENCY_LEVELS: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical'
    },
    
    // Funding status
    FUNDING_STATUS: {
        PENDING: 'pending',
        COMPLETED: 'completed',
        FAILED: 'failed',
        REFUNDED: 'refunded',
        CANCELLED: 'cancelled'
    },
    
    // Payment methods
    PAYMENT_METHODS: {
        STRIPE: 'stripe',
        BKASH: 'bkash',
        NAGAD: 'nagad',
        ROCKET: 'rocket',
        BANK_TRANSFER: 'bank_transfer',
        MOBILE_BANKING: 'mobile_banking'
    },
    
    // Contact categories
    CONTACT_CATEGORIES: {
        GENERAL: 'general',
        DONATION: 'donation',
        VOLUNTEER: 'volunteer',
        PARTNERSHIP: 'partnership',
        TECHNICAL: 'technical',
        OTHER: 'other'
    },
    
    // Notification types
    NOTIFICATION_TYPES: {
        DONATION_REQUEST: 'donation_request',
        DONATION_STATUS: 'donation_status',
        ACCOUNT_STATUS: 'account_status',
        ROLE_CHANGE: 'role_change',
        FUNDING_RECEIVED: 'funding_received',
        SYSTEM: 'system',
        VOLUNTEER_ASSIGNMENT: 'volunteer_assignment'
    },
    
    // Notification priority
    NOTIFICATION_PRIORITY: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        URGENT: 'urgent'
    },
    
    // Gender options
    GENDER: {
        MALE: 'male',
        FEMALE: 'female',
        OTHER: 'other',
        PREFER_NOT_TO_SAY: 'prefer_not_to_say'
    },
    
    // Donation eligibility
    DONATION_ELIGIBILITY: {
        MIN_AGE: 18,
        MAX_AGE: 65,
        MIN_WEIGHT: 45, // kg
        MIN_HEMOGLOBIN: 12.5, // g/dL for women, 13.5 for men
        MIN_INTERVAL_DAYS: 90, // days between donations
        MAX_DONATIONS_PER_YEAR: 4
    },
    
    // Time intervals
    TIME_INTERVALS: {
        SECOND: 1000,
        MINUTE: 60 * 1000,
        HOUR: 60 * 60 * 1000,
        DAY: 24 * 60 * 60 * 1000,
        WEEK: 7 * 24 * 60 * 60 * 1000,
        MONTH: 30 * 24 * 60 * 60 * 1000,
        YEAR: 365 * 24 * 60 * 60 * 1000
    },
    
    // Pagination defaults
    PAGINATION: {
        DEFAULT_PAGE: 1,
        DEFAULT_LIMIT: 10,
        MAX_LIMIT: 100
    },
    
    // File upload limits
    FILE_UPLOAD: {
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
        MAX_FILES: 5,
        ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
        ALLOWED_DOC_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    },
    
    // Cache TTLs (in seconds)
    CACHE_TTL: {
        SHORT: 300, // 5 minutes
        MEDIUM: 1800, // 30 minutes
        LONG: 3600, // 1 hour
        VERY_LONG: 86400 // 24 hours
    },
    
    // Rate limiting
    RATE_LIMITING: {
        WINDOW_MS: 15 * 60 * 1000, // 15 minutes
        MAX_REQUESTS: 100,
        AUTH_MAX_REQUESTS: 5,
        DONATION_MAX_REQUESTS: 10
    },
    
    // Validation limits
    VALIDATION: {
        NAME_MIN_LENGTH: 2,
        NAME_MAX_LENGTH: 100,
        PASSWORD_MIN_LENGTH: 6,
        PASSWORD_MAX_LENGTH: 100,
        EMAIL_MAX_LENGTH: 255,
        PHONE_LENGTH: 11,
        MESSAGE_MIN_LENGTH: 10,
        MESSAGE_MAX_LENGTH: 5000,
        ADDRESS_MAX_LENGTH: 500
    },
    
    // API response codes
    API_CODES: {
        SUCCESS: 200,
        CREATED: 201,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        VALIDATION_ERROR: 422,
        TOO_MANY_REQUESTS: 429,
        INTERNAL_ERROR: 500,
        SERVICE_UNAVAILABLE: 503
    },
    
    // Environment
    ENVIRONMENT: {
        DEVELOPMENT: 'development',
        PRODUCTION: 'production',
        TEST: 'test',
        STAGING: 'staging'
    },
    
    // Date formats
    DATE_FORMATS: {
        ISO: 'YYYY-MM-DD',
        DISPLAY: 'DD MMM YYYY',
        FULL: 'DD MMMM YYYY',
        WITH_TIME: 'DD MMM YYYY, hh:mm A',
        DATABASE: 'YYYY-MM-DD HH:mm:ss'
    },
    
    // Default values
    DEFAULTS: {
        USER_AVATAR: 'https://i.ibb.co/4f9QcKj/default-avatar.png',
        ORGANIZATION_LOGO: 'https://i.ibb.co/0jqWYpL/blood-donation-logo.png',
        PAGE_TITLE: 'Blood Donation App',
        META_DESCRIPTION: 'Connect blood donors with recipients in need. Save lives by donating blood or requesting donations.',
        META_KEYWORDS: 'blood donation, donate blood, blood request, save lives, healthcare, emergency'
    },
    
    // Social media links
    SOCIAL_MEDIA: {
        FACEBOOK: 'https://facebook.com/blooddonationapp',
        TWITTER: 'https://twitter.com/blooddonationapp',
        INSTAGRAM: 'https://instagram.com/blooddonationapp',
        LINKEDIN: 'https://linkedin.com/company/blooddonationapp',
        YOUTUBE: 'https://youtube.com/c/blooddonationapp'
    },
    
    // Contact information
    CONTACT_INFO: {
        EMAIL: 'support@blooddonationapp.com',
        PHONE: '+8801712345678',
        ADDRESS: '123 Blood Donation Street, Dhaka 1212, Bangladesh',
        OFFICE_HOURS: '9:00 AM - 6:00 PM (Saturday - Thursday)'
    },
    
    // Feature flags
    FEATURES: {
        EMAIL_VERIFICATION: process.env.ENABLE_EMAIL_VERIFICATION === 'true',
        TWO_FACTOR_AUTH: process.env.ENABLE_2FA === 'true',
        SOCIAL_LOGIN: process.env.ENABLE_SOCIAL_LOGIN === 'true',
        PUSH_NOTIFICATIONS: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
        REAL_TIME_UPDATES: process.env.ENABLE_REAL_TIME_UPDATES === 'true',
        ADVANCED_ANALYTICS: process.env.ENABLE_ADVANCED_ANALYTICS === 'true'
    },
    
    // Security
    SECURITY: {
        PASSWORD_SALT_ROUNDS: 10,
        JWT_EXPIRY: '7d',
        REFRESH_TOKEN_EXPIRY: '30d',
        RESET_TOKEN_EXPIRY: '10m',
        SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_TIME: 15 * 60 * 1000 // 15 minutes
    },
    
    // Analytics
    ANALYTICS: {
        RETENTION_DAYS: 30,
        SESSION_TIMEOUT_MINUTES: 30,
        PAGEVIEW_SAMPLE_RATE: 0.1,
        EVENT_SAMPLE_RATE: 0.1
    },
    
    // Export formats
    EXPORT_FORMATS: {
        PDF: 'pdf',
        CSV: 'csv',
        EXCEL: 'excel',
        JSON: 'json'
    },
    
    // Chart colors
    CHART_COLORS: {
        PRIMARY: '#e74c3c',
        SECONDARY: '#3498db',
        SUCCESS: '#2ecc71',
        WARNING: '#f39c12',
        DANGER: '#e74c3c',
        INFO: '#3498db',
        LIGHT: '#ecf0f1',
        DARK: '#2c3e50',
        
        // Blood group specific colors
        'A+': '#FF6B6B',
        'A-': '#FF8E8E',
        'B+': '#4ECDC4',
        'B-': '#88D3CE',
        'AB+': '#FFD166',
        'AB-': '#FFE0A3',
        'O+': '#06D6A0',
        'O-': '#5CE1B5'
    },
    
    // Map configuration
    MAP: {
        DEFAULT_CENTER: [23.8103, 90.4125], // Dhaka, Bangladesh
        DEFAULT_ZOOM: 7,
        MAX_ZOOM: 18,
        MIN_ZOOM: 3
    },
    
    // Search radius (in kilometers)
    SEARCH_RADIUS: {
        NEARBY: 5,
        LOCAL: 10,
        REGIONAL: 50,
        NATIONAL: 500
    },
    
    // Hospital types
    HOSPITAL_TYPES: {
        GOVERNMENT: 'government',
        PRIVATE: 'private',
        SPECIALIZED: 'specialized',
        CLINIC: 'clinic',
        BLOOD_BANK: 'blood_bank'
    },
    
    // Volunteer assignment status
    VOLUNTEER_ASSIGNMENT_STATUS: {
        PENDING: 'pending',
        ASSIGNED: 'assigned',
        IN_PROGRESS: 'in_progress',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    },
    
    // Feedback types
    FEEDBACK_TYPES: {
        GENERAL: 'general',
        BUG: 'bug',
        FEATURE: 'feature',
        IMPROVEMENT: 'improvement',
        COMPLAINT: 'complaint'
    },
    
    // Log levels
    LOG_LEVELS: {
        ERROR: 'error',
        WARN: 'warn',
        INFO: 'info',
        DEBUG: 'debug'
    }
};