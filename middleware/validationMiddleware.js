import { validationResult } from "express-validator";
import Joi from "joi";
import mongoose from "mongoose";

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message.replace(/"/g, ""),
      }));

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    next();
  };
};

const validateExpressValidator = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((error) => ({
      field: error.param,
      message: error.msg,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formattedErrors,
    });
  }
  next();
};

const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} ID format`,
      });
    }

    next();
  };
};

const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  if (page < 1 || limit < 1 || limit > 100) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100",
    });
  }

  req.pagination = { page, limit };
  next();
};

const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      message: "Invalid file type. Only JPEG, JPG, PNG, GIF are allowed",
    });
  }

  if (req.file.size > maxSize) {
    return res.status(400).json({
      success: false,
      message: "File too large. Maximum size is 5MB",
    });
  }

  next();
};

export default {
  validateRequest,
  validateExpressValidator,
  validateObjectId,
  validatePagination,
  validateFileUpload,
};
