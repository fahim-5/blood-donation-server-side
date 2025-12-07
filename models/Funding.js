// server/src/models/Funding.js
const mongoose = require('mongoose');

const fundingSchema = new mongoose.Schema(
  {
    // User who made the donation
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Donor is required'],
    },
    
    donorName: {
      type: String,
      required: [true, 'Donor name is required'],
      trim: true,
    },
    
    donorEmail: {
      type: String,
      required: [true, 'Donor email is required'],
      lowercase: true,
      trim: true,
    },
    
    // Payment Information
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [10, 'Minimum donation amount is 10 BDT'],
      max: [100000, 'Maximum donation amount is 100,000 BDT'],
    },
    
    currency: {
      type: String,
      default: 'BDT',
      enum: ['BDT', 'USD'],
    },
    
    paymentMethod: {
      type: String,
      enum: ['stripe', 'card', 'bank_transfer', 'mobile_banking'],
      required: [true, 'Payment method is required'],
    },
    
    // Stripe Payment Information
    stripePaymentId: {
      type: String,
      unique: true,
      sparse: true, // Allows null values but enforces uniqueness for non-null values
    },
    
    stripeCustomerId: {
      type: String,
    },
    
    stripeSessionId: {
      type: String,
    },
    
    // Payment Status
    status: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded', 'canceled'],
      default: 'pending',
    },
    
    // Transaction Details
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    
    transactionDate: {
      type: Date,
      default: Date.now,
    },
    
    // Receipt Information
    receiptUrl: {
      type: String,
      default: '',
    },
    
    receiptNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    
    // Donation Details
    donationType: {
      type: String,
      enum: ['general', 'emergency', 'campaign', 'monthly'],
      default: 'general',
    },
    
    campaign: {
      type: String,
      trim: true,
      default: '',
    },
    
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters'],
      default: '',
    },
    
    // Anonymous Donation
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    
    // Display name for anonymous donations
    displayName: {
      type: String,
      trim: true,
      default: '',
    },
    
    // Tax Deduction
    taxReceipt: {
      requested: {
        type: Boolean,
        default: false,
      },
      issued: {
        type: Boolean,
        default: false,
      },
      receiptNumber: {
        type: String,
        default: '',
      },
      issuedDate: {
        type: Date,
      },
    },
    
    // Administrative Fields
    isVerified: {
      type: Boolean,
      default: false,
    },
    
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    
    verifiedAt: {
      type: Date,
    },
    
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
      default: '',
    },
    
    // Refund Information
    refund: {
      amount: {
        type: Number,
        default: 0,
      },
      reason: {
        type: String,
        trim: true,
      },
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      processedAt: {
        type: Date,
      },
      stripeRefundId: {
        type: String,
      },
    },
    
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
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

// Update updatedAt timestamp before update
fundingSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Generate receipt number before saving
fundingSchema.pre('save', function(next) {
  if (!this.receiptNumber && this.status === 'succeeded') {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    this.receiptNumber = `DON-${timestamp}-${random}`;
  }
  next();
});

// Virtual for formatted amount
fundingSchema.virtual('formattedAmount').get(function() {
  if (this.currency === 'BDT') {
    return `৳${this.amount.toLocaleString('en-BD')}`;
  }
  return `$${this.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
});

// Virtual for formatted date
fundingSchema.virtual('formattedDate').get(function() {
  return this.transactionDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

// Virtual for short formatted date
fundingSchema.virtual('shortDate').get(function() {
  return this.transactionDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
});

// Virtual to check if payment is successful
fundingSchema.virtual('isSuccessful').get(function() {
  return this.status === 'succeeded';
});

// Virtual to check if payment is pending
fundingSchema.virtual('isPending').get(function() {
  return this.status === 'pending' || this.status === 'processing';
});

// Virtual to check if payment is refunded
fundingSchema.virtual('isRefunded').get(function() {
  return this.status === 'refunded';
});

// Virtual for donor display name
fundingSchema.virtual('donorDisplayName').get(function() {
  if (this.isAnonymous && this.displayName) {
    return this.displayName;
  }
  if (this.isAnonymous) {
    return 'Anonymous Donor';
  }
  return this.donorName;
});

// Static method to get total funds
fundingSchema.statics.getTotalFunds = async function() {
  const result = await this.aggregate([
    {
      $match: {
        status: 'succeeded',
        refund: { $ne: { amount: { $gt: 0 } } }, // Exclude refunded amounts
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  
  return {
    totalAmount: result.length > 0 ? result[0].totalAmount : 0,
    totalDonations: result.length > 0 ? result[0].count : 0,
  };
};

// Static method to get recent donations
fundingSchema.statics.getRecentDonations = async function(limit = 10) {
  return this.find({ status: 'succeeded' })
    .sort({ transactionDate: -1, createdAt: -1 })
    .limit(limit)
    .populate('donor', 'name avatar bloodGroup')
    .select('donorName amount currency transactionDate message isAnonymous');
};

// Static method to get donations by user
fundingSchema.statics.getDonationsByUser = async function(userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  const [donations, total] = await Promise.all([
    this.find({ donor: userId })
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    this.countDocuments({ donor: userId }),
  ]);
  
  return {
    donations,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
};

// Static method to get top donors
fundingSchema.statics.getTopDonors = async function(limit = 10) {
  return this.aggregate([
    {
      $match: {
        status: 'succeeded',
        isAnonymous: false,
      },
    },
    {
      $group: {
        _id: '$donor',
        donorName: { $first: '$donorName' },
        donorEmail: { $first: '$donorEmail' },
        totalAmount: { $sum: '$amount' },
        donationCount: { $sum: 1 },
      },
    },
    {
      $sort: { totalAmount: -1 },
    },
    {
      $limit: limit,
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    {
      $unwind: {
        path: '$userDetails',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        donorId: '$_id',
        donorName: 1,
        donorEmail: 1,
        totalAmount: 1,
        donationCount: 1,
        avatar: '$userDetails.avatar',
        bloodGroup: '$userDetails.bloodGroup',
        lastDonationDate: '$userDetails.lastDonationDate',
      },
    },
  ]);
};

// Method to mark payment as succeeded
fundingSchema.methods.markAsSucceeded = function(paymentData = {}) {
  this.status = 'succeeded';
  this.transactionDate = new Date();
  this.isVerified = true;
  
  // Update with payment data
  if (paymentData.stripePaymentId) {
    this.stripePaymentId = paymentData.stripePaymentId;
  }
  if (paymentData.receiptUrl) {
    this.receiptUrl = paymentData.receiptUrl;
  }
  if (paymentData.stripeCustomerId) {
    this.stripeCustomerId = paymentData.stripeCustomerId;
  }
  
  // Generate receipt number if not exists
  if (!this.receiptNumber) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    this.receiptNumber = `DON-${timestamp}-${random}`;
  }
  
  return this.save();
};

// Method to process refund
fundingSchema.methods.processRefund = function(refundData) {
  if (this.status !== 'succeeded') {
    throw new Error('Only successful payments can be refunded');
  }
  
  if (this.refund.amount > 0) {
    throw new Error('Payment has already been refunded');
  }
  
  this.status = 'refunded';
  this.refund = {
    amount: refundData.amount || this.amount,
    reason: refundData.reason || '',
    processedBy: refundData.processedBy,
    processedAt: new Date(),
    stripeRefundId: refundData.stripeRefundId || '',
  };
  
  return this.save();
};

// Indexes for better query performance
fundingSchema.index({ donor: 1, status: 1 });
fundingSchema.index({ status: 1, transactionDate: -1 });
fundingSchema.index({ stripePaymentId: 1 }, { unique: true, sparse: true });
fundingSchema.index({ receiptNumber: 1 }, { unique: true, sparse: true });
fundingSchema.index({ transactionDate: -1 });
fundingSchema.index({ amount: 1 });
fundingSchema.index({ isAnonymous: 1, status: 1 });
fundingSchema.index({ 'refund.processedAt': -1 });
fundingSchema.index({ donorEmail: 1, status: 1 });

const Funding = mongoose.model('Funding', fundingSchema);

module.exports = Funding;