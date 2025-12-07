// server/src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
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
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't return password in queries by default
    },
    
    avatar: {
      type: String,
      default: '',
    },
    
    bloodGroup: {
      type: String,
      required: [true, 'Blood group is required'],
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      uppercase: true,
    },
    
    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true,
    },
    
    upazila: {
      type: String,
      required: [true, 'Upazila is required'],
      trim: true,
    },
    
    role: {
      type: String,
      enum: ['donor', 'volunteer', 'admin'],
      default: 'donor',
    },
    
    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
    },
    
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    
    lastDonationDate: {
      type: Date,
      default: null,
    },
    
    totalDonations: {
      type: Number,
      default: 0,
    },
    
    isAvailable: {
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
    timestamps: true, // Automatically manages createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it's modified (or new)
  if (!this.isModified('password')) return next();
  
  try {
    // Generate salt
    const salt = await bcrypt.genSalt(10);
    // Hash password
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update updatedAt timestamp before update
userSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Virtual for full address
userSchema.virtual('fullAddress').get(function() {
  return `${this.upazila}, ${this.district}`;
});

// Virtual for isBlocked (for easier checking)
userSchema.virtual('isBlocked').get(function() {
  return this.status === 'blocked';
});

// Static method to check if email exists
userSchema.statics.emailExists = async function(email) {
  const user = await this.findOne({ email });
  return !!user;
};

// Method to get user profile (without sensitive data)
userSchema.methods.getProfile = function() {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    avatar: this.avatar,
    bloodGroup: this.bloodGroup,
    district: this.district,
    upazila: this.upazila,
    role: this.role,
    status: this.status,
    phone: this.phone,
    lastDonationDate: this.lastDonationDate,
    totalDonations: this.totalDonations,
    isAvailable: this.isAvailable,
    fullAddress: this.fullAddress,
    createdAt: this.createdAt,
  };
};

// Indexes for better query performance
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ bloodGroup: 1, district: 1, upazila: 1 });
userSchema.index({ district: 1, upazila: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;