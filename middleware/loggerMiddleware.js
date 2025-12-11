import winston from "winston";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: logFormat,
  defaultMeta: { service: "blood-donation-api" },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// HTTP request logger middleware
const httpLogger = (req, res, next) => {
  const start = Date.now();

  // Capture response finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      userId: req.user?._id || "anonymous",
      userRole: req.user?.role || "anonymous",
    };

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error("Server Error", logData);
    } else if (res.statusCode >= 400) {
      logger.warn("Client Error", logData);
    } else {
      logger.info("HTTP Request", logData);
    }
  });

  next();
};

// API call logger
const apiLogger = (controllerName, action) => {
  return (req, res, next) => {
    const start = Date.now();

    // Capture response finish
    const originalSend = res.send;
    res.send = function (data) {
      const duration = Date.now() - start;

      logger.info("API Call", {
        controller: controllerName,
        action: action,
        method: req.method,
        endpoint: req.originalUrl,
        duration: `${duration}ms`,
        status: res.statusCode,
        userId: req.user?._id,
        userRole: req.user?.role,
      });

      return originalSend.call(this, data);
    };

    next();
  };
};

// Error logger
const errorLogger = (error, req = null) => {
  const logEntry = {
    error: error.message,
    stack: error.stack,
    name: error.name,
  };

  if (req) {
    logEntry.request = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userId: req.user?._id,
    };
  }

  logger.error("Application Error", logEntry);
};

// Database query logger
const dbLogger = (operation, model, query, duration, success = true) => {
  logger.debug("Database Operation", {
    operation,
    model,
    query: JSON.stringify(query),
    duration: `${duration}ms`,
    success,
  });
};

// Authentication logger
const authLogger = (event, userId, ip, success, details = {}) => {
  const level = success ? "info" : "warn";
  logger.log(level, "Authentication Event", {
    event,
    userId,
    ip,
    success,
    ...details,
  });
};

// Security event logger
const securityLogger = (event, severity, details) => {
  const level =
    severity === "high" ? "error" : severity === "medium" ? "warn" : "info";
  logger.log(level, "Security Event", {
    event,
    severity,
    ...details,
  });
};

// Business logic logger
const businessLogger = (event, entity, entityId, userId, details = {}) => {
  logger.info("Business Event", {
    event,
    entity,
    entityId,
    userId,
    ...details,
  });
};

// Performance logger
const performanceLogger = (operation, duration, threshold = 1000) => {
  if (duration > threshold) {
    logger.warn("Performance Warning", {
      operation,
      duration: `${duration}ms`,
      threshold: `${threshold}ms`,
    });
  }
};

// Custom log levels for different environments
const setupLogger = () => {
  // Clear console transport in production
  if (process.env.NODE_ENV === "production") {
    logger.transports.forEach((transport) => {
      if (transport instanceof winston.transports.Console) {
        logger.remove(transport);
      }
    });

    // Add log rotation for production
    logger.add(
      new winston.transports.File({
        filename: path.join(logDir, "access.log"),
        level: "info",
        maxsize: 10485760, // 10MB
        maxFiles: 10,
      })
    );
  }

  return logger;
};

// Log rotation cleanup (to be called periodically)
const cleanupOldLogs = (daysToKeep = 30) => {
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

  fs.readdir(logDir, (err, files) => {
    if (err) return;

    files.forEach((file) => {
      const filePath = path.join(logDir, file);
      fs.stat(filePath, (err, stat) => {
        if (err) return;

        if (stat.isFile() && stat.mtimeMs < cutoff) {
          fs.unlink(filePath, (err) => {
            if (err) {
              logger.error("Failed to delete old log file", {
                file: filePath,
                error: err.message,
              });
            } else {
              logger.info("Deleted old log file", { file: filePath });
            }
          });
        }
      });
    });
  });
};

export default {
  logger,
  httpLogger,
  apiLogger,
  errorLogger,
  dbLogger,
  authLogger,
  securityLogger,
  businessLogger,
  performanceLogger,
  setupLogger,
  cleanupOldLogs,
};
