import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    // Recipient Information
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient is required'],
    },
    
    recipientEmail: {
      type: String,
      required: [true, 'Recipient email is required'],
      lowercase: true,
      trim: true,
    },
    
    // Sender Information (if applicable)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    senderName: {
      type: String,
      trim: true,
      default: '',
    },
    
    senderRole: {
      type: String,
      enum: ['system', 'admin', 'volunteer', 'donor', 'user'],
      default: 'system',
    },
    
    // Notification Content
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      minlength: [5, 'Message must be at least 5 characters'],
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    
    // Notification Type
    type: {
      type: String,
      enum: [
        'info',           // General information
        'success',        // Success messages
        'warning',        // Warning alerts
        'error',          // Error notifications
        'donation',       // Donation related
        'request',        // Donation request updates
        'funding',        // Funding updates
        'admin',          // Admin announcements
        'system',         // System notifications
        'reminder',       // Reminders
        'alert',          // Urgent alerts
        'message',        // Direct messages
      ],
      default: 'info',
    },
    
    // Category for grouping
    category: {
      type: String,
      enum: [
        'user',
        'donation',
        'funding',
        'admin',
        'system',
        'security',
        'news',
        'update',
        'reminder',
        'other'
      ],
      default: 'other',
    },
    
    // Priority Level
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    
    // Status Management
    status: {
      type: String,
      enum: ['unread', 'read', 'archived', 'deleted'],
      default: 'unread',
    },
    
    // Read Status
    readAt: {
      type: Date,
    },
    
    // Action/Click-through
    actionUrl: {
      type: String,
      trim: true,
      default: '',
    },
    
    actionLabel: {
      type: String,
      trim: true,
      default: 'View Details',
    },
    
    actionType: {
      type: String,
      enum: ['link', 'button', 'modal', 'route', 'api', 'none'],
      default: 'link',
    },
    
    // Data payload for actions
    data: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // Icon for notification
    icon: {
      type: String,
      default: '',
    },
    
    iconColor: {
      type: String,
      default: '#3B82F6', // Default blue
    },
    
    // Expiration (auto-delete after expiry)
    expiresAt: {
      type: Date,
      default: () => {
        const date = new Date();
        date.setDate(date.getDate() + 30); // Default: 30 days
        return date;
      },
    },
    
    // Delivery Methods
    deliveryMethods: {
      inApp: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: false,
      },
      push: {
        type: Boolean,
        default: false,
      },
      sms: {
        type: Boolean,
        default: false,
      },
    },
    
    // Delivery Status
    deliveryStatus: {
      inApp: {
        sent: {
          type: Boolean,
          default: false,
        },
        deliveredAt: {
          type: Date,
        },
        error: {
          type: String,
          default: '',
        },
      },
      email: {
        sent: {
          type: Boolean,
          default: false,
        },
        deliveredAt: {
          type: Date,
        },
        error: {
          type: String,
          default: '',
        },
      },
      push: {
        sent: {
          type: Boolean,
          default: false,
        },
        deliveredAt: {
          type: Date,
        },
        error: {
          type: String,
          default: '',
        },
      },
      sms: {
        sent: {
          type: Boolean,
          default: false,
        },
        deliveredAt: {
          type: Date,
        },
        error: {
          type: String,
          default: '',
        },
      },
    },
    
    // Acknowledgment
    acknowledged: {
      type: Boolean,
      default: false,
    },
    
    acknowledgedAt: {
      type: Date,
    },
    
    // Metadata
    tags: [{
      type: String,
      trim: true,
    }],
    
    source: {
      type: String,
      enum: ['system', 'user', 'admin_panel', 'api', 'automated', 'manual'],
      default: 'system',
    },
    
    // Related Entity (for linking to donations, requests, etc.)
    relatedEntity: {
      type: {
        type: String,
        enum: ['donation_request', 'funding', 'user', 'contact', 'none'],
        default: 'none',
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },
    
    // Batch notification (for mass notifications)
    batchId: {
      type: String,
      default: '',
    },
    
    // Analytics
    clickCount: {
      type: Number,
      default: 0,
    },
    
    lastClickedAt: {
      type: Date,
    },
    
    // Timestamps
    scheduledFor: {
      type: Date,
      default: Date.now,
    },
    
    sentAt: {
      type: Date,
    },
    
    createdAt: {
      type: Date,
      default: Date.now,
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

// Update delivery timestamps
notificationSchema.pre('save', function(next) {
  // Set sentAt when notification is first saved
  if (this.isNew) {
    this.sentAt = new Date();
    
    // Update delivery status for in-app notifications
    if (this.deliveryMethods.inApp) {
      this.deliveryStatus.inApp.sent = true;
      this.deliveryStatus.inApp.deliveredAt = new Date();
    }
  }
  
  // Update readAt when status changes to read
  if (this.isModified('status') && this.status === 'read' && !this.readAt) {
    this.readAt = new Date();
  }
  
  // Update acknowledgedAt when acknowledged
  if (this.isModified('acknowledged') && this.acknowledged && !this.acknowledgedAt) {
    this.acknowledgedAt = new Date();
  }
  
  next();
});

// Update updatedAt timestamp before update
notificationSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Virtual for formatted date
notificationSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Virtual for relative time
notificationSchema.virtual('relativeTime').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'Just now';
});

// Virtual to check if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Virtual to check if notification is unread
notificationSchema.virtual('isUnread').get(function() {
  return this.status === 'unread';
});

// Virtual to check if notification is urgent
notificationSchema.virtual('isUrgent').get(function() {
  return this.priority === 'high' || this.priority === 'critical';
});

// Virtual to get appropriate icon based on type
notificationSchema.virtual('typeIcon').get(function() {
  const icons = {
    'info': 'ℹ️',
    'success': '✅',
    'warning': '⚠️',
    'error': '❌',
    'donation': '🩸',
    'request': '📋',
    'funding': '💰',
    'admin': '👑',
    'system': '⚙️',
    'reminder': '⏰',
    'alert': '🚨',
    'message': '💬',
  };
  return icons[this.type] || '📢';
});

// Static method to get user notifications
notificationSchema.statics.getUserNotifications = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    status,
    type,
    category,
    unreadOnly = false,
    includeExpired = false,
  } = options;
  
  const skip = (page - 1) * limit;
  
  // Build query
  const query = { recipient: userId };
  
  // Filter by status
  if (status) {
    query.status = status;
  } else if (unreadOnly) {
    query.status = 'unread';
  }
  
  // Filter by type
  if (type) {
    query.type = type;
  }
  
  // Filter by category
  if (category) {
    query.category = category;
  }
  
  // Filter expired notifications
  if (!includeExpired) {
    query.expiresAt = { $gt: new Date() };
  }
  
  const [notifications, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1, priority: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name avatar')
      .populate('recipient', 'name email'),
    this.countDocuments(query),
  ]);
  
  return {
    notifications,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
};

// Static method to get unread count for user
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({
    recipient: userId,
    status: 'unread',
    expiresAt: { $gt: new Date() },
  });
};

// Static method to create system notification
notificationSchema.statics.createSystemNotification = async function(data) {
  const {
    recipient,
    recipientEmail,
    title,
    message,
    type = 'info',
    category = 'system',
    priority = 'medium',
    actionUrl = '',
    data: extraData = {},
    expiresInDays = 30,
  } = data;
  
  const notification = new this({
    recipient,
    recipientEmail,
    sender: null,
    senderName: 'System',
    senderRole: 'system',
    title,
    message,
    type,
    category,
    priority,
    actionUrl,
    data: extraData,
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    source: 'system',
  });
  
  return notification.save();
};

// Static method to create batch notifications
notificationSchema.statics.createBatchNotifications = async function(recipients, notificationData) {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const notifications = recipients.map(recipient => ({
    ...notificationData,
    recipient: recipient._id || recipient,
    recipientEmail: recipient.email || '',
    batchId,
  }));
  
  return this.insertMany(notifications);
};

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.status = 'read';
  this.readAt = new Date();
  return this.save();
};

// Method to mark as archived
notificationSchema.methods.markAsArchived = function() {
  this.status = 'archived';
  return this.save();
};

// Method to acknowledge notification
notificationSchema.methods.acknowledge = function() {
  this.acknowledged = true;
  this.acknowledgedAt = new Date();
  return this.save();
};

// Method to increment click count
notificationSchema.methods.incrementClick = function() {
  this.clickCount += 1;
  this.lastClickedAt = new Date();
  return this.save();
};

// Method to mark email as sent
notificationSchema.methods.markEmailSent = function(error = null) {
  this.deliveryStatus.email.sent = true;
  this.deliveryStatus.email.deliveredAt = new Date();
  if (error) {
    this.deliveryStatus.email.error = error;
  }
  return this.save();
};

// Method to mark push as sent
notificationSchema.methods.markPushSent = function(error = null) {
  this.deliveryStatus.push.sent = true;
  this.deliveryStatus.push.deliveredAt = new Date();
  if (error) {
    this.deliveryStatus.push.error = error;
  }
  return this.save();
};

// Static method to cleanup expired notifications
notificationSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
    status: { $in: ['read', 'archived'] },
  });
  
  return {
    deletedCount: result.deletedCount,
    message: `Cleaned up ${result.deletedCount} expired notifications`,
  };
};

// Indexes for better query performance
notificationSchema.index({ recipient: 1, status: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, expiresAt: -1 });
notificationSchema.index({ status: 1, priority: 1, createdAt: -1 });
notificationSchema.index({ type: 1, category: 1, createdAt: -1 });
notificationSchema.index({ batchId: 1 });
notificationSchema.index({ 'relatedEntity.type': 1, 'relatedEntity.id': 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ sender: 1, recipient: 1 });
notificationSchema.index({ 'deliveryStatus.email.sent': 1 });
notificationSchema.index({ 'deliveryStatus.push.sent': 1 });

const Notification = mongoose.model('Notification', notificationSchema);

// Export as default ES6 module
export default Notification;  // Changed from: module.exports = Notification