import xss from "xss";
import sanitizeHtml from "sanitize-html";
import validator from "validator";

// Sanitization options for HTML content
const sanitizeOptions = {
  allowedTags: [
    "b",
    "i",
    "em",
    "strong",
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ],
  allowedAttributes: {
    a: ["href", "title", "target"],
  },
  allowedIframeHostnames: [],
  parser: {
    decodeEntities: true,
  },
};

// XSS protection middleware
const xssProtect = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// Sanitize an object recursively
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeValue(item));
  }

  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      sanitized[key] = sanitizeValue(obj[key]);
    }
  }

  return sanitized;
};

// Sanitize a single value
const sanitizeValue = (value) => {
  if (typeof value === "string") {
    // Remove null bytes and control characters
    let sanitized = value.replace(/[\0-\x1F\x7F]/g, "");

    // Trim whitespace
    sanitized = sanitized.trim();

    // Escape HTML entities
    sanitized = xss(sanitized, {
      whiteList: {},
      stripIgnoreTag: true,
      stripIgnoreTagBody: ["script", "style", "iframe"],
    });

    // Additional sanitization for specific formats
    if (validator.isEmail(sanitized)) {
      sanitized = validator.normalizeEmail(sanitized);
    }

    return sanitized;
  }

  if (typeof value === "object" && value !== null) {
    return sanitizeObject(value);
  }

  return value;
};

// Sanitize HTML content (for rich text fields)
const sanitizeHTML = (html) => {
  return sanitizeHtml(html, sanitizeOptions);
};

// Validate and sanitize email
const sanitizeEmail = (email) => {
  if (!email || typeof email !== "string") {
    return null;
  }

  const sanitized = email.toLowerCase().trim();

  if (!validator.isEmail(sanitized)) {
    return null;
  }

  return validator.normalizeEmail(sanitized);
};

// Sanitize URL
const sanitizeURL = (url) => {
  if (!url || typeof url !== "string") {
    return null;
  }

  let sanitized = url.trim();

  // Add protocol if missing
  if (!sanitized.startsWith("http://") && !sanitized.startsWith("https://")) {
    sanitized = "https://" + sanitized;
  }

  if (
    !validator.isURL(sanitized, {
      require_protocol: true,
      require_valid_protocol: true,
      protocols: ["http", "https"],
    })
  ) {
    return null;
  }

  return sanitized;
};

// Sanitize phone number
const sanitizePhone = (phone) => {
  if (!phone || typeof phone !== "string") {
    return null;
  }

  const sanitized = phone.replace(/[^\d+]/g, "");

  if (!validator.isMobilePhone(sanitized, "any", { strictMode: false })) {
    return null;
  }

  return sanitized;
};

// Middleware for specific fields
const sanitizeFields = (fields) => {
  return (req, res, next) => {
    if (req.body) {
      fields.forEach((field) => {
        if (req.body[field] && typeof req.body[field] === "string") {
          req.body[field] = sanitizeValue(req.body[field]);
        }
      });
    }
    next();
  };
};

// Prevent NoSQL injection
const preventNoSQLInjection = (req, res, next) => {
  const checkValue = (value) => {
    if (typeof value === "string") {
      // Detect common NoSQL injection patterns
      const dangerousPatterns = [
        /\$where/i,
        /\$ne/i,
        /\$nin/i,
        /\$in/i,
        /\$regex/i,
        /\$or/i,
        /\$and/i,
        /\$exists/i,
        /\$type/i,
        /\$mod/i,
        /\$size/i,
        /\$all/i,
        /\$elemMatch/i,
        /\.\.\//, // Directory traversal
        /constructor/i,
        /toString/i,
        /valueOf/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(value)) {
          throw new Error(
            `Potential NoSQL injection detected in field: ${value}`
          );
        }
      }
    }
  };

  try {
    // Check body
    if (req.body) {
      Object.values(req.body).forEach(checkValue);
    }

    // Check query
    if (req.query) {
      Object.values(req.query).forEach(checkValue);
    }

    // Check params
    if (req.params) {
      Object.values(req.params).forEach(checkValue);
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid input detected",
    });
  }
};

export default {
  xssProtect,
  sanitizeObject,
  sanitizeValue,
  sanitizeHTML,
  sanitizeEmail,
  sanitizeURL,
  sanitizePhone,
  sanitizeFields,
  preventNoSQLInjection,
  sanitizeOptions,
};
