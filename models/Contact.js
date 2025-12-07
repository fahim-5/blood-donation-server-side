// server/src/models/Contact.js
const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    // Contact Person Information
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    
    // User reference if logged in
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    // Inquiry Details
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      minlength: [5, 'Subject must be at least 5 characters'],
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      minlength: [10, 'Message must be at least 10 characters'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    
    // Inquiry Type/Category
    category: {
      type: String,
      enum: [
        'general',
        'donation',
        'volunteer',
        'partnership',
        'technical',
        'feedback',
        'complaint',
        'suggestion',
        'emergency',
        'other'
      ],
      default: 'general',
    },
    
    // Priority Level
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    
    // Status Management
    status: {
      type: String,
      enum: ['new', 'read', 'in-progress', 'resolved', 'closed', 'spam'],
      default: 'new',
    },
    
    // Response Tracking
    responses: [
      {
        responder: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        responderName: {
          type: String,
          trim: true,
        },
        responderRole: {
          type: String,
          enum: ['admin', 'volunteer', 'system'],
        },
        message: {
          type: String,
          required: true,
          trim: true,
          maxlength: [2000, 'Response cannot exceed 2000 characters'],
        },
        sentVia: {
          type: String,
          enum: ['email', 'dashboard', 'phone', 'sms'],
          default: 'email',
        },
        sentAt: {
          type: Date,
          default: Date.now,
        },
        isRead: {
          type: Boolean,
          default: false,
        },
        readAt: {
          type: Date,
        },
      },
    ],
    
    // Additional Information
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown', 'not_applicable'],
      default: 'not_applicable',
      uppercase: true,
    },
    
    location: {
      district: {
        type: String,
        trim: true,
        default: '',
      },
      upazila: {
        type: String,
        trim: true,
        default: '',
      },
    },
    
    // User Agent and Technical Info
    userAgent: {
      type: String,
      default: '',
    },
    
    ipAddress: {
      type: String,
      default: '',
    },
    
    // Attachments (for future enhancement)
    attachments: [
      {
        filename: String,
        url: String,
        size: Number,
        mimetype: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    
    // Follow-up Information
    followUpDate: {
      type: Date,
    },
    
    followUpNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
      default: '',
    },
    
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    
    // Metadata
    source: {
      type: String,
      enum: ['contact_form', 'dashboard', 'email', 'phone', 'api', 'other'],
      default: 'contact_form',
    },
    
    tags: [{
      type: String,
      trim: true,
    }],
    
    // Privacy and GDPR
    consentGiven: {
      type: Boolean,
      default: false,
    },
    
    allowMarketing: {
      type: Boolean,
      default: false,
    },
    
    isSubscribed: {
      type: Boolean,
      default: true,
    },
    
    // Timestamps
    lastRespondedAt: {
      type: Date,
    },
    
    resolvedAt: {
      type: Date,
    },
    
    closedAt: {
      type: Date,
    },
    
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

// Update timestamps and status history
contactSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    // Update resolvedAt if status is resolved
    if (this.status === 'resolved' && !this.resolvedAt) {
      this.resolvedAt = new Date();
    }
    
    // Update closedAt if status is closed
    if (this.status === 'closed' && !this.closedAt) {
      this.closedAt = new Date();
    }
  }
  
  // Update lastRespondedAt if response is added
  if (this.isModified('responses') && this.responses.length > 0) {
    const lastResponse = this.responses[this.responses.length - 1];
    this.lastRespondedAt = lastResponse.sentAt;
  }
  
  next();
});

// Update updatedAt timestamp before update
contactSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Virtual for full location
contactSchema.virtual('fullLocation').get(function() {
  if (this.location.district && this.location.upazila) {
    return `${this.location.upazila}, ${this.location.district}`;
  } else if (this.location.district) {
    return this.location.district;
  }
  return 'Not specified';
});

// Virtual for formatted creation date
contactSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Virtual for time since creation
contactSchema.virtual('timeSinceCreation').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  return 'Just now';
});

// Virtual for unread responses count
contactSchema.virtual('unreadResponsesCount').get(function() {
  if (!this.responses || this.responses.length === 0) return 0;
  return this.responses.filter(response => !response.isRead).length;
});

// Virtual for response count
contactSchema.virtual('responseCount').get(function() {
  return this.responses ? this.responses.length : 0;
});

// Virtual to check if urgent
contactSchema.virtual('isUrgent').get(function() {
  return this.priority === 'urgent' || this.category === 'emergency';
});

// Virtual to check if needs follow-up
contactSchema.virtual('needsFollowUp').get(function() {
  if (this.status === 'resolved' || this.status === 'closed') return false;
  if (this.followUpDate && new Date(this.followUpDate) <= new Date()) return true;
  return false;
});

// Static method to get inquiries by status
contactSchema.statics.getByStatus = function(status, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  return this.find({ status })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('user', 'name email avatar')
    .populate('assignedTo', 'name email');
};

// Static method to get unread inquiries
contactSchema.statics.getUnreadCount = async function() {
  return this.countDocuments({ status: 'new' });
};

// Static method to get urgent inquiries
contactSchema.statics.getUrgentInquiries = async function() {
  return this.find({
    $or: [
      { priority: 'urgent' },
      { category: 'emergency' },
    ],
    status: { $in: ['new', 'in-progress'] },
  })
    .sort({ createdAt: -1 })
    .limit(50);
};

// Static method to get inquiries needing follow-up
contactSchema.statics.getNeedFollowUp = async function() {
  return this.find({
    followUpDate: { $lte: new Date() },
    status: { $in: ['new', 'in-progress', 'read'] },
  })
    .sort({ followUpDate: 1 })
    .limit(50);
};

// Method to add a response
contactSchema.methods.addResponse = function(responseData) {
  if (!this.responses) {
    this.responses = [];
  }
  
  this.responses.push({
    ...responseData,
    sentAt: new Date(),
  });
  
  // Update status if it was new
  if (this.status === 'new') {
    this.status = 'read';
  }
  
  this.lastRespondedAt = new Date();
  
  return this.save();
};

// Method to mark response as read
contactSchema.methods.markResponseAsRead = function(responseIndex) {
  if (!this.responses || !this.responses[responseIndex]) {
    throw new Error('Response not found');
  }
  
  this.responses[responseIndex].isRead = true;
  this.responses[responseIndex].readAt = new Date();
  
  return this.save();
};

// Method to assign to a user
contactSchema.methods.assignTo = function(userId) {
  this.assignedTo = userId;
  if (this.status === 'new') {
    this.status = 'in-progress';
  }
  
  return this.save();
};

// Method to resolve inquiry
contactSchema.methods.resolve = function(notes = '') {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  if (notes) {
    this.followUpNotes = notes;
  }
  
  return this.save();
};

// Method to close inquiry
contactSchema.methods.close = function() {
  if (this.status !== 'resolved') {
    throw new Error('Only resolved inquiries can be closed');
  }
  
  this.status = 'closed';
  this.closedAt = new Date();
  
  return this.save();
};

// Indexes for better query performance
contactSchema.index({ status: 1, createdAt: -1 });
contactSchema.index({ email: 1, createdAt: -1 });
contactSchema.index({ user: 1, createdAt: -1 });
contactSchema.index({ category: 1, status: 1 });
contactSchema.index({ priority: 1, createdAt: -1 });
contactSchema.index({ assignedTo: 1, status: 1 });
contactSchema.index({ followUpDate: 1, status: 1 });
contactSchema.index({ 'responses.sentAt': -1 });
contactSchema.index({ createdAt: -1 });
contactSchema.index({ status: 1, priority: 1, createdAt: -1 });

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;