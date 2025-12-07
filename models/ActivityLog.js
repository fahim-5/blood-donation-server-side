// server/src/models/ActivityLog.js
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    // User Information
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    
    userName: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    
    userEmail: {
      type: String,
      required: [true, 'User email is required'],
      lowercase: true,
      trim: true,
    },
    
    userRole: {
      type: String,
      enum: ['donor', 'volunteer', 'admin', 'system', 'anonymous'],
      required: [true, 'User role is required'],
    },
    
    userIp: {
      type: String,
      default: '',
    },
    
    // Activity Information
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
    },
    
    actionType: {
      type: String,
      enum: [
        'create',
        'read',
        'update',
        'delete',
        'login',
        'logout',
        'register',
        'search',
        'donate',
        'request',
        'fund',
        'verify',
        'block',
        'unblock',
        'assign',
        'complete',
        'cancel',
        'error',
        'system',
        'security',
        'other'
      ],
      required: [true, 'Action type is required'],
    },
    
    category: {
      type: String,
      enum: [
        'user',
        'donation',
        'funding',
        'authentication',
        'authorization',
        'profile',
        'search',
        'admin',
        'system',
        'security',
        'api',
        'dashboard',
        'notification',
        'contact',
        'analytics',
        'other'
      ],
      default: 'other',
    },
    
    // Entity Information (what was acted upon)
    entityType: {
      type: String,
      enum: [
        'user',
        'donation_request',
        'funding',
        'contact',
        'notification',
        'activity_log',
        'system',
        'none'
      ],
      default: 'none',
    },
    
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    
    entityName: {
      type: String,
      default: '',
    },
    
    // Changes Made
    changes: {
      before: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
      after: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    
    // Description
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    
    // Detailed Message
    details: {
      type: String,
      trim: true,
      maxlength: [5000, 'Details cannot exceed 5000 characters'],
      default: '',
    },
    
    // Status
    status: {
      type: String,
      enum: ['success', 'failed', 'partial', 'pending'],
      default: 'success',
    },
    
    // Error Information (if failed)
    error: {
      code: {
        type: String,
        default: '',
      },
      message: {
        type: String,
        default: '',
      },
      stackTrace: {
        type: String,
        default: '',
      },
    },
    
    // Severity Level
    severity: {
      type: String,
      enum: ['debug', 'info', 'warning', 'error', 'critical'],
      default: 'info',
    },
    
    // Location Information
    location: {
      country: {
        type: String,
        default: '',
      },
      city: {
        type: String,
        default: '',
      },
      region: {
        type: String,
        default: '',
      },
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
    },
    
    // Device and Browser Information
    userAgent: {
      type: String,
      default: '',
    },
    
    device: {
      type: {
        type: String,
        enum: ['desktop', 'mobile', 'tablet', 'bot', 'other'],
        default: 'other',
      },
      os: {
        type: String,
        default: '',
      },
      browser: {
        type: String,
        default: '',
      },
      browserVersion: {
        type: String,
        default: '',
      },
    },
    
    // Request Information
    request: {
      method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        default: 'GET',
      },
      url: {
        type: String,
        default: '',
      },
      endpoint: {
        type: String,
        default: '',
      },
      queryParams: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
      body: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
      headers: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    
    // Response Information
    response: {
      statusCode: {
        type: Number,
        default: 200,
      },
      message: {
        type: String,
        default: '',
      },
      data: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    
    // Performance Metrics
    performance: {
      duration: {
        type: Number, // milliseconds
        default: 0,
      },
      memoryUsage: {
        type: Number, // bytes
        default: 0,
      },
      cpuUsage: {
        type: Number, // percentage
        default: 0,
      },
    },
    
    // Session Information
    sessionId: {
      type: String,
      default: '',
    },
    
    // Correlation ID for tracing
    correlationId: {
      type: String,
      default: '',
    },
    
    // Tags for categorization
    tags: [{
      type: String,
      trim: true,
    }],
    
    // Metadata
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // Archive flag
    archived: {
      type: Boolean,
      default: false,
    },
    
    archivedAt: {
      type: Date,
    },
    
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    
    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Update updatedAt timestamp before update
activityLogSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Virtual for formatted date
activityLogSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
});

// Virtual for relative time
activityLogSchema.virtual('relativeTime').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffSecs > 0) return `${diffSecs} second${diffSecs > 1 ? 's' : ''} ago`;
  return 'Just now';
});

// Virtual for duration in readable format
activityLogSchema.virtual('formattedDuration').get(function() {
  if (!this.performance.duration) return 'N/A';
  
  const duration = this.performance.duration;
  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(2)}s`;
  return `${(duration / 60000).toFixed(2)}min`;
});

// Virtual for memory in readable format
activityLogSchema.virtual('formattedMemory').get(function() {
  if (!this.performance.memoryUsage) return 'N/A';
  
  const memory = this.performance.memoryUsage;
  if (memory < 1024) return `${memory}B`;
  if (memory < 1048576) return `${(memory / 1024).toFixed(2)}KB`;
  if (memory < 1073741824) return `${(memory / 1048576).toFixed(2)}MB`;
  return `${(memory / 1073741824).toFixed(2)}GB`;
});

// Virtual for icon based on action type
activityLogSchema.virtual('actionIcon').get(function() {
  const icons = {
    'create': '➕',
    'read': '👁️',
    'update': '✏️',
    'delete': '🗑️',
    'login': '🔑',
    'logout': '🚪',
    'register': '📝',
    'search': '🔍',
    'donate': '🩸',
    'request': '📋',
    'fund': '💰',
    'verify': '✅',
    'block': '🚫',
    'unblock': '🔄',
    'assign': '👥',
    'complete': '🎯',
    'cancel': '❌',
    'error': '⚠️',
    'system': '⚙️',
    'security': '🛡️',
    'other': '📄',
  };
  return icons[this.actionType] || '📄';
});

// Virtual for color based on severity
activityLogSchema.virtual('severityColor').get(function() {
  const colors = {
    'debug': 'gray',
    'info': 'blue',
    'warning': 'orange',
    'error': 'red',
    'critical': 'purple',
  };
  return colors[this.severity] || 'gray';
});

// Virtual to check if it's a security event
activityLogSchema.virtual('isSecurityEvent').get(function() {
  return this.category === 'security' || 
         this.actionType === 'login' || 
         this.actionType === 'logout' ||
         this.actionType === 'block' ||
         this.actionType === 'unblock' ||
         this.severity === 'error' ||
         this.severity === 'critical';
});

// Virtual to check if it's a user activity
activityLogSchema.virtual('isUserActivity').get(function() {
  return this.category === 'user' || 
         this.category === 'profile' ||
         this.category === 'donation' ||
         this.category === 'funding';
});

// Static method to log activity
activityLogSchema.statics.logActivity = async function(activityData) {
  const {
    user,
    userName,
    userEmail,
    userRole,
    action,
    actionType,
    category,
    entityType,
    entityId,
    entityName,
    changes,
    description,
    details,
    status,
    error,
    severity,
    userIp,
    userAgent,
    request,
    response,
    performance,
    sessionId,
    correlationId,
    tags,
    metadata,
  } = activityData;
  
  const activity = new this({
    user: user || null,
    userName: userName || 'System',
    userEmail: userEmail || 'system@blooddonation.app',
    userRole: userRole || 'system',
    action,
    actionType,
    category,
    entityType: entityType || 'none',
    entityId: entityId || null,
    entityName: entityName || '',
    changes: changes || { before: {}, after: {} },
    description,
    details: details || '',
    status: status || 'success',
    error: error || {},
    severity: severity || 'info',
    userIp: userIp || '',
    userAgent: userAgent || '',
    request: request || {},
    response: response || {},
    performance: performance || {},
    sessionId: sessionId || '',
    correlationId: correlationId || '',
    tags: tags || [],
    metadata: metadata || {},
  });
  
  return activity.save();
};

// Static method to get activities with filters
activityLogSchema.statics.getActivities = async function(filters = {}) {
  const {
    page = 1,
    limit = 50,
    user,
    userRole,
    actionType,
    category,
    entityType,
    entityId,
    status,
    severity,
    startDate,
    endDate,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = filters;
  
  const skip = (page - 1) * limit;
  
  // Build query
  const query = {};
  
  if (user) query.user = user;
  if (userRole) query.userRole = userRole;
  if (actionType) query.actionType = actionType;
  if (category) query.category = category;
  if (entityType && entityType !== 'none') query.entityType = entityType;
  if (entityId) query.entityId = entityId;
  if (status) query.status = status;
  if (severity) query.severity = severity;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  // Search in description and details
  if (search) {
    query.$or = [
      { description: { $regex: search, $options: 'i' } },
      { details: { $regex: search, $options: 'i' } },
      { userName: { $regex: search, $options: 'i' } },
      { userEmail: { $regex: search, $options: 'i' } },
      { action: { $regex: search, $options: 'i' } },
    ];
  }
  
  // Sort options
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const [activities, total] = await Promise.all([
    this.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email avatar role')
      .populate('entityId')
      .populate('archivedBy', 'name email'),
    this.countDocuments(query),
  ]);
  
  return {
    activities,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
};

// Static method to get user activity summary
activityLogSchema.statics.getUserActivitySummary = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const activities = await this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          actionType: '$actionType',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        activities: {
          $push: {
            actionType: '$_id.actionType',
            count: '$count',
          },
        },
        total: { $sum: '$count' },
      },
    },
    {
      $sort: { _id: -1 },
    },
  ]);
  
  return activities;
};

// Static method to get system metrics
activityLogSchema.statics.getSystemMetrics = async function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const metrics = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
      },
    },
    {
      $facet: {
        // Activity by type
        byActionType: [
          {
            $group: {
              _id: '$actionType',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        
        // Activity by category
        byCategory: [
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        
        // Activity by user role
        byUserRole: [
          {
            $group: {
              _id: '$userRole',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        
        // Activity by status
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        
        // Daily activity
        dailyActivity: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        
        // Error statistics
        errorStats: [
          {
            $match: {
              $or: [
                { status: 'failed' },
                { severity: 'error' },
                { severity: 'critical' },
              ],
            },
          },
          {
            $group: {
              _id: {
                date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                actionType: '$actionType',
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.date': 1 } },
        ],
        
        // Performance metrics
        performance: [
          {
            $match: {
              'performance.duration': { $gt: 0 },
            },
          },
          {
            $group: {
              _id: null,
              avgDuration: { $avg: '$performance.duration' },
              maxDuration: { $max: '$performance.duration' },
              minDuration: { $min: '$performance.duration' },
            },
          },
        ],
      },
    },
  ]);
  
  return metrics[0];
};

// Static method to cleanup old logs
activityLogSchema.statics.cleanupOldLogs = async function(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    archived: true,
    severity: { $in: ['debug', 'info'] },
  });
  
  return {
    deletedCount: result.deletedCount,
    message: `Cleaned up ${result.deletedCount} logs older than ${daysToKeep} days`,
    cutoffDate,
  };
};

// Method to archive log
activityLogSchema.methods.archive = function(archivedBy) {
  this.archived = true;
  this.archivedAt = new Date();
  this.archivedBy = archivedBy;
  return this.save();
};

// Method to restore archived log
activityLogSchema.methods.restore = function() {
  this.archived = false;
  this.archivedAt = null;
  this.archivedBy = null;
  return this.save();
};

// Indexes for better query performance
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ userRole: 1, createdAt: -1 });
activityLogSchema.index({ actionType: 1, createdAt: -1 });
activityLogSchema.index({ category: 1, createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1 });
activityLogSchema.index({ status: 1, severity: 1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ 'tags': 1 });
activityLogSchema.index({ correlationId: 1 });
activityLogSchema.index({ sessionId: 1 });
activityLogSchema.index({ userIp: 1, createdAt: -1 });
activityLogSchema.index({ archived: 1, createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;