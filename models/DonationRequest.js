// server/src/models/DonationRequest.js
const mongoose = require('mongoose');

const donationRequestSchema = new mongoose.Schema(
  {
    // Requester Information (logged in user who creates the request)
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requester is required'],
    },
    
    requesterName: {
      type: String,
      required: [true, 'Requester name is required'],
      trim: true,
    },
    
    requesterEmail: {
      type: String,
      required: [true, 'Requester email is required'],
      lowercase: true,
      trim: true,
    },
    
    // Recipient Information
    recipientName: {
      type: String,
      required: [true, 'Recipient name is required'],
      trim: true,
      minlength: [2, 'Recipient name must be at least 2 characters'],
      maxlength: [100, 'Recipient name cannot exceed 100 characters'],
    },
    
    recipientDistrict: {
      type: String,
      required: [true, 'Recipient district is required'],
      trim: true,
    },
    
    recipientUpazila: {
      type: String,
      required: [true, 'Recipient upazila is required'],
      trim: true,
    },
    
    hospitalName: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
      maxlength: [200, 'Hospital name cannot exceed 200 characters'],
    },
    
    hospitalAddress: {
      type: String,
      required: [true, 'Hospital address is required'],
      trim: true,
      maxlength: [500, 'Hospital address cannot exceed 500 characters'],
    },
    
    // Donation Details
    bloodGroup: {
      type: String,
      required: [true, 'Blood group is required'],
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      uppercase: true,
    },
    
    donationDate: {
      type: Date,
      required: [true, 'Donation date is required'],
      validate: {
        validator: function(value) {
          // Donation date should not be in the past
          return value >= new Date().setHours(0, 0, 0, 0);
        },
        message: 'Donation date cannot be in the past',
      },
    },
    
    donationTime: {
      type: String,
      required: [true, 'Donation time is required'],
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time (HH:MM)'],
    },
    
    requestMessage: {
      type: String,
      required: [true, 'Request message is required'],
      trim: true,
      minlength: [10, 'Request message must be at least 10 characters'],
      maxlength: [1000, 'Request message cannot exceed 1000 characters'],
    },
    
    // Donor Information (if someone accepts the request)
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    donorName: {
      type: String,
      default: '',
    },
    
    donorEmail: {
      type: String,
      default: '',
    },
    
    // Status Management
    status: {
      type: String,
      enum: ['pending', 'inprogress', 'done', 'canceled'],
      default: 'pending',
    },
    
    statusHistory: [
      {
        status: {
          type: String,
          enum: ['pending', 'inprogress', 'done', 'canceled'],
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        note: {
          type: String,
          trim: true,
        },
      },
    ],
    
    // Urgency Level
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    
    // Additional Information
    unitsRequired: {
      type: Number,
      min: [1, 'At least 1 unit is required'],
      max: [10, 'Cannot request more than 10 units at once'],
      default: 1,
    },
    
    contactPerson: {
      name: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
      relationship: {
        type: String,
        trim: true,
      },
    },
    
    isActive: {
      type: Boolean,
      default: true,
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

// Update statusHistory when status changes
donationRequestSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (!this.statusHistory) {
      this.statusHistory = [];
    }
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
    });
  }
  next();
});

// Update updatedAt timestamp before update
donationRequestSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Virtual for recipient location
donationRequestSchema.virtual('recipientLocation').get(function() {
  return `${this.recipientUpazila}, ${this.recipientDistrict}`;
});

// Virtual for formatted donation date
donationRequestSchema.virtual('formattedDonationDate').get(function() {
  return this.donationDate.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
});

// Virtual for donation datetime (combining date and time)
donationRequestSchema.virtual('donationDateTime').get(function() {
  const dateStr = this.donationDate.toISOString().split('T')[0];
  return new Date(`${dateStr}T${this.donationTime}:00`);
});

// Virtual to check if request is expired
donationRequestSchema.virtual('isExpired').get(function() {
  const donationDateTime = this.donationDateTime;
  const now = new Date();
  // Consider expired if donation date/time has passed
  return donationDateTime < now;
});

// Virtual to check if request can be accepted
donationRequestSchema.virtual('canBeAccepted').get(function() {
  return this.status === 'pending' && !this.isExpired && this.isActive;
});

// Static method to get requests by status
donationRequestSchema.statics.findByStatus = function(status, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  return this.find({ status, isActive: true })
    .sort({ donationDate: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('requester', 'name email avatar')
    .populate('donor', 'name email avatar');
};

// Static method to get donor's requests
donationRequestSchema.statics.findByDonor = function(donorId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  return this.find({ donor: donorId, isActive: true })
    .sort({ donationDate: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('requester', 'name email avatar');
};

// Static method to get requester's requests
donationRequestSchema.statics.findByRequester = function(requesterId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  return this.find({ requester: requesterId, isActive: true })
    .sort({ donationDate: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('donor', 'name email avatar');
};

// Method to accept donation request
donationRequestSchema.methods.acceptDonation = async function(donorId, donorName, donorEmail) {
  if (this.status !== 'pending') {
    throw new Error('Request is not available for donation');
  }
  
  if (this.isExpired) {
    throw new Error('Request has expired');
  }
  
  this.donor = donorId;
  this.donorName = donorName;
  this.donorEmail = donorEmail;
  this.status = 'inprogress';
  
  this.statusHistory.push({
    status: 'inprogress',
    changedAt: new Date(),
    note: `Accepted by donor: ${donorName}`,
  });
  
  return this.save();
};

// Method to complete donation
donationRequestSchema.methods.completeDonation = function() {
  if (this.status !== 'inprogress') {
    throw new Error('Only inprogress donations can be completed');
  }
  
  this.status = 'done';
  
  this.statusHistory.push({
    status: 'done',
    changedAt: new Date(),
    note: 'Donation completed successfully',
  });
  
  return this.save();
};

// Method to cancel donation
donationRequestSchema.methods.cancelDonation = function(reason = '') {
  if (!['pending', 'inprogress'].includes(this.status)) {
    throw new Error('Only pending or inprogress donations can be canceled');
  }
  
  this.status = 'canceled';
  
  this.statusHistory.push({
    status: 'canceled',
    changedAt: new Date(),
    note: reason || 'Donation canceled',
  });
  
  return this.save();
};

// Indexes for better query performance
donationRequestSchema.index({ status: 1, isActive: 1 });
donationRequestSchema.index({ requester: 1, status: 1 });
donationRequestSchema.index({ donor: 1, status: 1 });
donationRequestSchema.index({ bloodGroup: 1, status: 1 });
donationRequestSchema.index({ recipientDistrict: 1, recipientUpazila: 1 });
donationRequestSchema.index({ donationDate: 1, status: 1 });
donationRequestSchema.index({ createdAt: -1 });
donationRequestSchema.index({ isActive: 1, status: 1, donationDate: 1 });

const DonationRequest = mongoose.model('DonationRequest', donationRequestSchema);

module.exports = DonationRequest;