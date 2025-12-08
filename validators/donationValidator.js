import Joi from 'joi';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createDonationRequestValidator = Joi.object({
  recipientName: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Recipient name is required',
      'string.min': 'Recipient name must be at least 2 characters',
      'string.max': 'Recipient name cannot exceed 100 characters'
    }),

  recipientDistrict: Joi.string()
    .required()
    .messages({
      'string.empty': 'Recipient district is required'
    }),

  recipientUpazila: Joi.string()
    .required()
    .messages({
      'string.empty': 'Recipient upazila is required'
    }),

  hospitalName: Joi.string()
    .min(2)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Hospital name is required',
      'string.min': 'Hospital name must be at least 2 characters',
      'string.max': 'Hospital name cannot exceed 200 characters'
    }),

  fullAddress: Joi.string()
    .min(5)
    .max(500)
    .required()
    .messages({
      'string.empty': 'Full address is required',
      'string.min': 'Full address must be at least 5 characters',
      'string.max': 'Full address cannot exceed 500 characters'
    }),

  bloodGroup: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .required()
    .messages({
      'any.only': 'Please select a valid blood group',
      'any.required': 'Blood group is required'
    }),

  donationDate: Joi.string()
    .pattern(datePattern)
    .required()
    .messages({
      'string.pattern.base': 'Donation date must be in YYYY-MM-DD format',
      'string.empty': 'Donation date is required'
    }),

  donationTime: Joi.string()
    .pattern(timePattern)
    .required()
    .messages({
      'string.pattern.base': 'Donation time must be in HH:MM format (24-hour)',
      'string.empty': 'Donation time is required'
    }),

  requestMessage: Joi.string()
    .min(10)
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Request message is required',
      'string.min': 'Request message must be at least 10 characters',
      'string.max': 'Request message cannot exceed 1000 characters'
    })
});

export const updateDonationRequestValidator = Joi.object({
  recipientName: Joi.string()
    .min(2)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Recipient name must be at least 2 characters',
      'string.max': 'Recipient name cannot exceed 100 characters'
    }),

  recipientDistrict: Joi.string()
    .optional()
    .messages({
      'string.empty': 'Recipient district cannot be empty'
    }),

  recipientUpazila: Joi.string()
    .optional()
    .messages({
      'string.empty': 'Recipient upazila cannot be empty'
    }),

  hospitalName: Joi.string()
    .min(2)
    .max(200)
    .optional()
    .messages({
      'string.min': 'Hospital name must be at least 2 characters',
      'string.max': 'Hospital name cannot exceed 200 characters'
    }),

  fullAddress: Joi.string()
    .min(5)
    .max(500)
    .optional()
    .messages({
      'string.min': 'Full address must be at least 5 characters',
      'string.max': 'Full address cannot exceed 500 characters'
    }),

  bloodGroup: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .optional()
    .messages({
      'any.only': 'Please select a valid blood group'
    }),

  donationDate: Joi.string()
    .pattern(datePattern)
    .optional()
    .messages({
      'string.pattern.base': 'Donation date must be in YYYY-MM-DD format'
    }),

  donationTime: Joi.string()
    .pattern(timePattern)
    .optional()
    .messages({
      'string.pattern.base': 'Donation time must be in HH:MM format (24-hour)'
    }),

  requestMessage: Joi.string()
    .min(10)
    .max(1000)
    .optional()
    .messages({
      'string.min': 'Request message must be at least 10 characters',
      'string.max': 'Request message cannot exceed 1000 characters'
    })
});

export const updateDonationStatusValidator = Joi.object({
  status: Joi.string()
    .valid('pending', 'inprogress', 'done', 'canceled')
    .required()
    .messages({
      'any.only': 'Status must be either "pending", "inprogress", "done", or "canceled"',
      'any.required': 'Status is required'
    }),

  donorId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .allow(null)
    .messages({
      'string.pattern.base': 'Invalid donor ID format'
    })
});

export const donateToRequestValidator = Joi.object({
  donorId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid donor ID format',
      'any.required': 'Donor ID is required'
    }),

  donorName: Joi.string()
    .required()
    .messages({
      'string.empty': 'Donor name is required'
    }),

  donorEmail: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Donor email is required'
    })
});

export const getDonationRequestsQueryValidator = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.base': 'Page must be a number',
      'number.min': 'Page must be at least 1'
    }),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .messages({
      'number.base': 'Limit must be a number',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100'
    }),

  status: Joi.string()
    .valid('pending', 'inprogress', 'done', 'canceled', '')
    .optional()
    .allow('')
    .messages({
      'any.only': 'Status must be either "pending", "inprogress", "done", "canceled", or empty'
    }),

  bloodGroup: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '')
    .optional()
    .allow('')
    .messages({
      'any.only': 'Please select a valid blood group or leave empty'
    }),

  district: Joi.string()
    .optional()
    .allow('')
    .messages({
      'string.empty': 'District cannot be empty'
    }),

  search: Joi.string()
    .optional()
    .allow('')
    .max(100)
    .messages({
      'string.max': 'Search query cannot exceed 100 characters'
    }),

  sortBy: Joi.string()
    .valid('donationDate', 'createdAt', 'recipientName', 'bloodGroup')
    .default('donationDate')
    .messages({
      'any.only': 'Invalid sort field'
    }),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('asc')
    .messages({
      'any.only': 'Sort order must be either "asc" or "desc"'
    }),

  startDate: Joi.string()
    .pattern(datePattern)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Start date must be in YYYY-MM-DD format'
    }),

  endDate: Joi.string()
    .pattern(datePattern)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'End date must be in YYYY-MM-DD format'
    })
});

export const getDonationRequestValidator = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid donation request ID format',
      'any.required': 'Donation request ID is required'
    })
});

export const donationStatisticsQueryValidator = Joi.object({
  period: Joi.string()
    .valid('daily', 'weekly', 'monthly', 'yearly')
    .default('monthly')
    .messages({
      'any.only': 'Period must be either "daily", "weekly", "monthly", or "yearly"'
    }),

  startDate: Joi.string()
    .pattern(datePattern)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Start date must be in YYYY-MM-DD format'
    }),

  endDate: Joi.string()
    .pattern(datePattern)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'End date must be in YYYY-MM-DD format'
    })
});

export const exportDonationsValidator = Joi.object({
  format: Joi.string()
    .valid('csv', 'excel', 'pdf')
    .default('csv')
    .messages({
      'any.only': 'Format must be either "csv", "excel", or "pdf"'
    }),

  status: Joi.string()
    .valid('pending', 'inprogress', 'done', 'canceled', 'all')
    .default('all')
    .messages({
      'any.only': 'Status must be either "pending", "inprogress", "done", "canceled", or "all"'
    }),

  bloodGroup: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'all')
    .default('all')
    .messages({
      'any.only': 'Blood group must be a valid type or "all"'
    })
});