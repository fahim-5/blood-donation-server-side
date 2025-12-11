import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  userName: String,
  userEmail: String,
  userRole: String,
  action: {
    type: String,
    required: true
  },
  actionType: {
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'login', 'logout', 'register', 'security', 'system'],
    required: true
  },
  category: {
    type: String,
    enum: ['user', 'donation', 'funding', 'contact', 'admin', 'system', 'authentication', 'security', 'profile'],
    required: true
  },
  description: String,
  details: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success'
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info'
  },
  entityType: String,
  entityId: mongoose.Schema.Types.ObjectId,
  entityName: String,
  userIp: String,
  userAgent: String,
  performance: {
    duration: Number,
    memoryUsage: Number
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ actionType: 1, createdAt: -1 });
activityLogSchema.index({ category: 1, createdAt: -1 });
activityLogSchema.index({ status: 1 });
activityLogSchema.index({ severity: 1 });

// Static method for logging activity
activityLogSchema.statics.logActivity = async function(data) {
  try {
    const log = new this({
      user: data.user,
      userName: data.userName,
      userEmail: data.userEmail,
      userRole: data.userRole,
      action: data.action,
      actionType: data.actionType,
      category: data.category,
      description: data.description,
      details: data.details,
      status: data.status || 'success',
      severity: data.severity || 'info',
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      userIp: data.userIp,
      userAgent: data.userAgent,
      performance: data.performance,
      metadata: data.metadata
    });
    
    await log.save();
    return log;
  } catch (error) {
    console.error('Error logging activity:', error);
    throw error;
  }
};

// Static method for cleanup
activityLogSchema.statics.cleanupOldLogs = async function(days = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    severity: { $in: ['info', 'warning'] } // Keep errors and critical logs longer
  });
};

// Create and export the model
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

// Export as default
export default ActivityLog;