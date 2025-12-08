import Joi from 'joi';

export const createPaymentIntentValidator = Joi.object({
  amount: Joi.number()
    .positive()
    .min(100)
    .max(1000000)
    .required()
    .messages({
      'number.base': 'Amount must be a number',
      'number.positive': 'Amount must be positive',
      'number.min': 'Minimum amount is 100 BDT',
      'number.max': 'Maximum amount is 1,000,000 BDT',
      'any.required': 'Amount is required'
    }),

  currency: Joi.string()
    .valid('BDT', 'USD')
    .default('BDT')
    .messages({
      'any.only': 'Currency must be either "BDT" or "USD"'
    })
});

export const processPaymentValidator = Joi.object({
  paymentMethodId: Joi.string()
    .required()
    .messages({
      'string.empty': 'Payment method ID is required'
    }),

  amount: Joi.number()
    .positive()
    .min(100)
    .max(1000000)
    .required()
    .messages({
      'number.base': 'Amount must be a number',
      'number.positive': 'Amount must be positive',
      'number.min': 'Minimum amount is 100 BDT',
      'number.max': 'Maximum amount is 1,000,000 BDT',
      'any.required': 'Amount is required'
    }),

  currency: Joi.string()
    .valid('BDT', 'USD')
    .default('BDT')
    .messages({
      'any.only': 'Currency must be either "BDT" or "USD"'
    }),

  receiptEmail: Joi.string()
    .email()
    .optional()
    .messages({
      'string.email': 'Please provide a valid email address for receipt'
    }),

  description: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Description cannot exceed 500 characters'
    }),

  metadata: Joi.object()
    .optional()
    .messages({
      'object.base': 'Metadata must be an object'
    })
});

export const createCheckoutSessionValidator = Joi.object({
  amount: Joi.number()
    .positive()
    .min(100)
    .max(1000000)
    .required()
    .messages({
      'number.base': 'Amount must be a number',
      'number.positive': 'Amount must be positive',
      'number.min': 'Minimum amount is 100 BDT',
      'number.max': 'Maximum amount is 1,000,000 BDT',
      'any.required': 'Amount is required'
    }),

  currency: Joi.string()
    .valid('BDT', 'USD')
    .default('BDT')
    .messages({
      'any.only': 'Currency must be either "BDT" or "USD"'
    }),

  metadata: Joi.object({
    purpose: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Purpose cannot exceed 100 characters'
      }),
    
    campaign: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Campaign cannot exceed 100 characters'
      }),
    
    note: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Note cannot exceed 500 characters'
      })
  })
  .optional()
  .messages({
    'object.base': 'Metadata must be an object'
  })
});

export const getFundingsQueryValidator = Joi.object({
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

  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Invalid user ID format'
    }),

  status: Joi.string()
    .valid('succeeded', 'pending', 'failed', '')
    .optional()
    .allow('')
    .messages({
      'any.only': 'Status must be either "succeeded", "pending", "failed", or empty'
    }),

  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Start date must be in YYYY-MM-DD format'
    }),

  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'End date must be in YYYY-MM-DD format'
    }),

  minAmount: Joi.number()
    .min(0)
    .optional()
    .messages({
      'number.base': 'Minimum amount must be a number',
      'number.min': 'Minimum amount cannot be negative'
    }),

  maxAmount: Joi.number()
    .min(0)
    .optional()
    .messages({
      'number.base': 'Maximum amount must be a number',
      'number.min': 'Maximum amount cannot be negative'
    }),

  sortBy: Joi.string()
    .valid('amount', 'createdAt', 'updatedAt')
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

export const verifyPaymentValidator = Joi.object({
  sessionId: Joi.string()
    .required()
    .messages({
      'string.empty': 'Session ID is required'
    }),

  paymentIntentId: Joi.string()
    .optional()
    .messages({
      'string.empty': 'Payment intent ID cannot be empty'
    })
});

export const getFundingByIdValidator = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid funding ID format',
      'any.required': 'Funding ID is required'
    })
});

export const fundingStatisticsQueryValidator = Joi.object({
  period: Joi.string()
    .valid('daily', 'weekly', 'monthly', 'yearly')
    .default('monthly')
    .messages({
      'any.only': 'Period must be either "daily", "weekly", "monthly", or "yearly"'
    }),

  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Start date must be in YYYY-MM-DD format'
    }),

  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'End date must be in YYYY-MM-DD format'
    }),

  groupBy: Joi.string()
    .valid('day', 'week', 'month', 'year', 'user')
    .default('month')
    .messages({
      'any.only': 'Group by must be either "day", "week", "month", "year", or "user"'
    })
});

export const exportFundingsValidator = Joi.object({
  format: Joi.string()
    .valid('csv', 'excel', 'pdf')
    .default('csv')
    .messages({
      'any.only': 'Format must be either "csv", "excel", or "pdf"'
    }),

  status: Joi.string()
    .valid('succeeded', 'pending', 'failed', 'all')
    .default('all')
    .messages({
      'any.only': 'Status must be either "succeeded", "pending", "failed", or "all"'
    }),

  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Start date must be in YYYY-MM-DD format'
    }),

  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'End date must be in YYYY-MM-DD format'
    })
});

export const refundPaymentValidator = Joi.object({
  paymentId: Joi.string()
    .required()
    .messages({
      'string.empty': 'Payment ID is required'
    }),

  reason: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Reason cannot exceed 500 characters'
    }),

  amount: Joi.number()
    .positive()
    .min(1)
    .optional()
    .messages({
      'number.base': 'Amount must be a number',
      'number.positive': 'Amount must be positive',
      'number.min': 'Minimum refund amount is 1'
    })
});