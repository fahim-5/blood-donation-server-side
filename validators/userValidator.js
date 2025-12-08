import Joi from 'joi';

export const updateUserStatusValidator = Joi.object({
  status: Joi.string()
    .valid('active', 'blocked')
    .required()
    .messages({
      'any.only': 'Status must be either "active" or "blocked"',
      'any.required': 'Status is required'
    })
});

export const updateUserRoleValidator = Joi.object({
  role: Joi.string()
    .valid('donor', 'volunteer', 'admin')
    .required()
    .messages({
      'any.only': 'Role must be either "donor", "volunteer", or "admin"',
      'any.required': 'Role is required'
    })
});

export const getUserValidator = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required'
    })
});

export const getUsersQueryValidator = Joi.object({
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
    .valid('active', 'blocked', '')
    .optional()
    .allow('')
    .messages({
      'any.only': 'Status must be either "active", "blocked", or empty'
    }),

  role: Joi.string()
    .valid('donor', 'volunteer', 'admin', '')
    .optional()
    .allow('')
    .messages({
      'any.only': 'Role must be either "donor", "volunteer", "admin", or empty'
    }),

  search: Joi.string()
    .optional()
    .allow('')
    .max(100)
    .messages({
      'string.max': 'Search query cannot exceed 100 characters'
    }),

  sortBy: Joi.string()
    .valid('name', 'email', 'createdAt', 'lastActive')
    .default('createdAt')
    .messages({
      'any.only': 'Invalid sort field'
    }),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .messages({
      'any.only': 'Sort order must be either "asc" or "desc"'
    })
});

export const searchDonorsValidator = Joi.object({
  bloodGroup: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .required()
    .messages({
      'any.only': 'Please select a valid blood group',
      'any.required': 'Blood group is required'
    }),

  district: Joi.string()
    .required()
    .messages({
      'string.empty': 'District is required'
    }),

  upazila: Joi.string()
    .required()
    .messages({
      'string.empty': 'Upazila is required'
    }),

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
    .max(50)
    .default(10)
    .messages({
      'number.base': 'Limit must be a number',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 50'
    })
});

export const updateUserProfileValidator = Joi.object({
  name: Joi.string()
    .min(2)
    .max(50)
    .optional()
    .messages({
      'string.min': 'Name must be at least 2 characters',
      'string.max': 'Name cannot exceed 50 characters'
    }),

  avatar: Joi.string()
    .uri()
    .optional()
    .messages({
      'string.uri': 'Avatar must be a valid URL'
    }),

  bloodGroup: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .optional()
    .messages({
      'any.only': 'Please select a valid blood group'
    }),

  district: Joi.string()
    .optional()
    .messages({
      'string.empty': 'District cannot be empty'
    }),

  upazila: Joi.string()
    .optional()
    .messages({
      'string.empty': 'Upazila cannot be empty'
    }),

  status: Joi.string()
    .valid('active', 'blocked')
    .optional()
    .messages({
      'any.only': 'Status must be either "active" or "blocked"'
    }),

  role: Joi.string()
    .valid('donor', 'volunteer', 'admin')
    .optional()
    .messages({
      'any.only': 'Role must be either "donor", "volunteer", or "admin"'
    })
});

export const userActivityQueryValidator = Joi.object({
  days: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .default(30)
    .messages({
      'number.base': 'Days must be a number',
      'number.min': 'Days must be at least 1',
      'number.max': 'Days cannot exceed 365'
    }),

  type: Joi.string()
    .valid('donations', 'requests', 'logins', 'all')
    .default('all')
    .messages({
      'any.only': 'Type must be either "donations", "requests", "logins", or "all"'
    })
});

export const exportUsersValidator = Joi.object({
  format: Joi.string()
    .valid('csv', 'excel', 'pdf')
    .default('csv')
    .messages({
      'any.only': 'Format must be either "csv", "excel", or "pdf"'
    }),

  status: Joi.string()
    .valid('active', 'blocked', 'all')
    .default('all')
    .messages({
      'any.only': 'Status must be either "active", "blocked", or "all"'
    }),

  role: Joi.string()
    .valid('donor', 'volunteer', 'admin', 'all')
    .default('all')
    .messages({
      'any.only': 'Role must be either "donor", "volunteer", "admin", or "all"'
    })
});