// server/src/controllers/profileController.js
const User = require('../models/User');
const DonationRequest = require('../models/DonationRequest');
const Funding = require('../models/Funding');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const imageBB = require('../utils/imageBB');

// @desc    Get user profile
// @route   GET /api/profile
// @access  Private
exports.getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('-password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Get recent activity stats
  const [recentRequests, recentDonations, recentFundings] = await Promise.all([
    DonationRequest.find({ requester: user._id, isActive: true })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('recipientName bloodGroup donationDate status'),
    DonationRequest.find({ donor: user._id, isActive: true })
      .sort({ donationDate: -1 })
      .limit(3)
      .select('recipientName bloodGroup donationDate status'),
    Funding.find({ donor: user._id, status: 'succeeded' })
      .sort({ transactionDate: -1 })
      .limit(3)
      .select('amount currency transactionDate'),
  ]);

  const profileData = {
    ...user.toObject(),
    recentActivity: {
      requests: recentRequests,
      donations: recentDonations,
      fundings: recentFundings,
    },
  };

  // Log activity
  await ActivityLog.logActivity({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'Viewed Profile',
    actionType: 'read',
    category: 'profile',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Viewed own profile`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: profileData,
  });
});

// @desc    Update user profile
// @route   PUT /api/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res, next) => {
  const updates = { ...req.body };
  
  // Remove fields that cannot be updated via profile
  delete updates.email;
  delete updates.password;
  delete updates.role;
  delete updates.status;

  // Check if trying to update blood group (special handling needed)
  if (updates.bloodGroup && updates.bloodGroup !== req.user.bloodGroup) {
    // Blood group changes require special handling (notifications, etc.)
    updates.bloodGroup = updates.bloodGroup.toUpperCase();
    
    // Create notification about blood group change
    await Notification.createSystemNotification({
      recipient: req.user._id,
      recipientEmail: req.user.email,
      title: 'Blood Group Updated',
      message: `Your blood group has been changed from ${req.user.bloodGroup} to ${updates.bloodGroup}. This may affect donation compatibility.`,
      type: 'info',
      category: 'profile',
      priority: 'medium',
      actionUrl: '/dashboard/profile',
      data: {
        oldBloodGroup: req.user.bloodGroup,
        newBloodGroup: updates.bloodGroup,
      },
    });
  }

  // Handle avatar upload
  if (req.files && req.files.avatar) {
    try {
      const avatar = req.files.avatar;
      const uploadResult = await imageBB.uploadImage(avatar);
      updates.avatar = uploadResult.url;
      
      // Create notification about avatar change
      await Notification.createSystemNotification({
        recipient: req.user._id,
        recipientEmail: req.user.email,
        title: 'Profile Picture Updated',
        message: 'Your profile picture has been successfully updated.',
        type: 'success',
        category: 'profile',
        priority: 'low',
        actionUrl: '/dashboard/profile',
        data: { avatarUpdated: true },
      });
    } catch (uploadError) {
      console.error('Avatar upload error:', uploadError);
      // Don't fail the request if avatar upload fails
    }
  }

  // Store old user data for logging
  const oldUserData = {
    name: req.user.name,
    bloodGroup: req.user.bloodGroup,
    district: req.user.district,
    upazila: req.user.upazila,
    phone: req.user.phone,
    avatar: req.user.avatar,
  };

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  }).select('-password');

  // Determine what changed
  const changedFields = [];
  Object.keys(updates).forEach(key => {
    if (oldUserData[key] !== user[key]) {
      changedFields.push(key);
    }
  });

  // Log activity
  await ActivityLog.logActivity({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'Updated Profile',
    actionType: 'update',
    category: 'profile',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Updated profile information`,
    details: `Changed fields: ${changedFields.join(', ')}`,
    changes: {
      before: oldUserData,
      after: {
        name: user.name,
        bloodGroup: user.bloodGroup,
        district: user.district,
        upazila: user.upazila,
        phone: user.phone,
        avatar: user.avatar,
      },
    },
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: user,
    message: 'Profile updated successfully',
  });
});

// @desc    Change password
// @route   PUT /api/profile/password
// @access  Private
exports.changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  // Validate input
  if (!currentPassword || !newPassword || !confirmPassword) {
    return next(new ErrorResponse('All password fields are required', 400));
  }

  if (newPassword !== confirmPassword) {
    return next(new ErrorResponse('New passwords do not match', 400));
  }

  if (newPassword.length < 6) {
    return next(new ErrorResponse('Password must be at least 6 characters', 400));
  }

  // Get user with password
  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  const isMatch = await user.comparePassword(currentPassword);

  if (!isMatch) {
    // Log failed password change attempt
    await ActivityLog.logActivity({
      user: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'Failed Password Change Attempt',
      actionType: 'security',
      category: 'security',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      description: 'Failed password change attempt - incorrect current password',
      status: 'failed',
      severity: 'warning',
      userIp: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return next(new ErrorResponse('Current password is incorrect', 401));
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Log successful password change
  await ActivityLog.logActivity({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'Password Changed',
    actionType: 'update',
    category: 'security',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: 'Successfully changed password',
    status: 'success',
    severity: 'info',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Create notification
  await Notification.createSystemNotification({
    recipient: user._id,
    recipientEmail: user.email,
    title: 'Password Changed Successfully 🔒',
    message: `Your password was changed successfully on ${new Date().toLocaleDateString()}. If you didn't make this change, please contact support immediately.`,
    type: 'info',
    category: 'security',
    priority: 'medium',
    actionUrl: '/dashboard/profile',
    data: { passwordChanged: true, timestamp: new Date() },
  });

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
  });
});

// @desc    Update location
// @route   PUT /api/profile/location
// @access  Private
exports.updateLocation = asyncHandler(async (req, res, next) => {
  const { district, upazila } = req.body;

  if (!district || !upazila) {
    return next(new ErrorResponse('Both district and upazila are required', 400));
  }

  const oldLocation = {
    district: req.user.district,
    upazila: req.user.upazila,
  };

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { district, upazila },
    {
      new: true,
      runValidators: true,
    }
  ).select('-password');

  // Log activity
  await ActivityLog.logActivity({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'Updated Location',
    actionType: 'update',
    category: 'profile',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Updated location from ${oldLocation.upazila}, ${oldLocation.district} to ${upazila}, ${district}`,
    changes: {
      before: oldLocation,
      after: { district, upazila },
    },
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Create notification
  await Notification.createSystemNotification({
    recipient: user._id,
    recipientEmail: user.email,
    title: 'Location Updated 📍',
    message: `Your location has been updated to ${upazila}, ${district}. This helps us match you with nearby donation requests.`,
    type: 'info',
    category: 'profile',
    priority: 'low',
    actionUrl: '/dashboard/profile',
    data: { locationUpdated: true },
  });

  res.status(200).json({
    success: true,
    data: user,
    message: 'Location updated successfully',
  });
});

// @desc    Toggle availability status
// @route   PATCH /api/profile/availability
// @access  Private
exports.toggleAvailability = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  const newAvailability = !user.isAvailable;
  user.isAvailable = newAvailability;
  await user.save();

  // Log activity
  await ActivityLog.logActivity({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'Updated Availability Status',
    actionType: 'update',
    category: 'profile',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Set availability to ${newAvailability ? 'available' : 'unavailable'}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Create notification
  await Notification.createSystemNotification({
    recipient: user._id,
    recipientEmail: user.email,
    title: newAvailability ? 'You Are Now Available for Donations! 🩸' : 'You Are Now Unavailable',
    message: newAvailability 
      ? 'You have marked yourself as available for blood donations. You will now receive notifications for nearby donation requests.'
      : 'You have marked yourself as unavailable for blood donations. You will not receive donation request notifications.',
    type: newAvailability ? 'success' : 'warning',
    category: 'profile',
    priority: 'medium',
    actionUrl: '/dashboard/profile',
    data: { isAvailable: newAvailability },
  });

  res.status(200).json({
    success: true,
    data: { isAvailable: newAvailability },
    message: `You are now ${newAvailability ? 'available' : 'unavailable'} for donations`,
  });
});

// @desc    Get profile statistics
// @route   GET /api/profile/stats
// @access  Private
exports.getProfileStats = asyncHandler(async (req, res, next) => {
  const user = req.user;

  // Get comprehensive statistics
  const [
    donationRequests,
    donationsMade,
    fundingStats,
    bloodCompatibility,
    eligibility,
  ] = await Promise.all([
    // Donation requests created by user
    DonationRequest.aggregate([
      {
        $match: {
          requester: user._id,
          isActive: true,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),

    // Donations made by user
    DonationRequest.aggregate([
      {
        $match: {
          donor: user._id,
          isActive: true,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),

    // Funding statistics
    Funding.aggregate([
      {
        $match: {
          donor: user._id,
          status: 'succeeded',
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),

    // Blood compatibility (could be enhanced with actual medical data)
    (() => {
      const compatibilityChart = {
        'A+': ['A+', 'AB+'],
        'A-': ['A+', 'A-', 'AB+', 'AB-'],
        'B+': ['B+', 'AB+'],
        'B-': ['B+', 'B-', 'AB+', 'AB-'],
        'AB+': ['AB+'],
        'AB-': ['AB+', 'AB-'],
        'O+': ['A+', 'B+', 'AB+', 'O+'],
        'O-': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      };
      return compatibilityChart[user.bloodGroup] || [];
    })(),

    // Donation eligibility
    (async () => {
      if (!user.lastDonationDate) {
        return {
          canDonate: true,
          daysSinceLastDonation: null,
          nextEligibleDate: null,
          message: 'You have never donated before. You are eligible to donate.',
        };
      }

      const lastDonation = new Date(user.lastDonationDate);
      const now = new Date();
      const daysSinceLastDonation = Math.floor((now - lastDonation) / (1000 * 60 * 60 * 24));
      const daysRequired = 90; // Minimum days between donations
      const canDonate = daysSinceLastDonation >= daysRequired;
      
      const nextEligibleDate = new Date(lastDonation);
      nextEligibleDate.setDate(nextEligibleDate.getDate() + daysRequired);

      return {
        canDonate,
        daysSinceLastDonation,
        nextEligibleDate,
        message: canDonate 
          ? `You are eligible to donate. It has been ${daysSinceLastDonation} days since your last donation.`
          : `You can donate again after ${nextEligibleDate.toLocaleDateString()}. It has been ${daysSinceLastDonation} days since your last donation.`,
      };
    })(),
  ]);

  // Format donation request stats
  const requestStats = {
    total: 0,
    pending: 0,
    inprogress: 0,
    done: 0,
    canceled: 0,
  };

  donationRequests.forEach(stat => {
    requestStats[stat._id] = stat.count;
    requestStats.total += stat.count;
  });

  // Format donation stats
  const donationStats = {
    total: 0,
    done: 0,
    canceled: 0,
  };

  donationsMade.forEach(stat => {
    donationStats[stat._id] = stat.count;
    donationStats.total += stat.count;
  });

  // Format funding stats
  const fundingResult = fundingStats.length > 0 ? fundingStats[0] : { totalAmount: 0, count: 0 };

  const stats = {
    user: {
      name: user.name,
      email: user.email,
      bloodGroup: user.bloodGroup,
      location: `${user.upazila}, ${user.district}`,
      role: user.role,
      status: user.status,
      isAvailable: user.isAvailable,
      totalDonations: user.totalDonations || 0,
      lastDonationDate: user.lastDonationDate,
      joined: user.createdAt,
    },
    requests: requestStats,
    donations: donationStats,
    funding: {
      totalDonations: fundingResult.count,
      totalAmount: fundingResult.totalAmount,
      formattedAmount: `৳${fundingResult.totalAmount.toLocaleString('en-BD')}`,
    },
    compatibility: {
      canDonateTo: bloodCompatibility,
      canReceiveFrom: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].filter(group => 
        bloodCompatibility.includes(group)
      ),
    },
    eligibility: await eligibility,
    badges: {
      firstDonation: donationStats.done > 0,
      regularDonor: donationStats.done >= 3,
      lifesaver: donationStats.done >= 10,
      contributor: fundingResult.count > 0,
      activeRequester: requestStats.total >= 5,
      quickResponder: donationStats.done >= 2 && donationStats.total <= 7, // Within 7 days
    },
  };

  res.status(200).json({
    success: true,
    data: stats,
  });
});

// @desc    Get donation history
// @route   GET /api/profile/donation-history
// @access  Private
exports.getDonationHistory = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    donor: req.user.id,
    isActive: true,
  };

  if (req.query.status) filter.status = req.query.status;

  const [donations, total] = await Promise.all([
    DonationRequest.find(filter)
      .populate('requester', 'name email avatar phone')
      .select('recipientName bloodGroup hospitalName donationDate donationTime status')
      .skip(skip)
      .limit(limit)
      .sort({ donationDate: -1 }),
    DonationRequest.countDocuments(filter),
  ]);

  // Calculate life impact
  const lifeImpact = donations.filter(d => d.status === 'done').length;
  const estimatedLivesSaved = lifeImpact * 3; // Each donation can save up to 3 lives

  res.status(200).json({
    success: true,
    count: donations.length,
    total,
    lifeImpact: {
      donations: lifeImpact,
      estimatedLivesSaved,
      message: `Your donations have potentially saved up to ${estimatedLivesSaved} lives!`,
    },
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    data: donations,
  });
});

// @desc    Get request history
// @route   GET /api/profile/request-history
// @access  Private
exports.getRequestHistory = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    requester: req.user.id,
    isActive: true,
  };

  if (req.query.status) filter.status = req.query.status;

  const [requests, total] = await Promise.all([
    DonationRequest.find(filter)
      .populate('donor', 'name email avatar phone bloodGroup')
      .select('recipientName bloodGroup hospitalName donationDate donationTime status donor')
      .skip(skip)
      .limit(limit)
      .sort({ donationDate: -1 }),
    DonationRequest.countDocuments(filter),
  ]);

  // Calculate success rate
  const totalRequests = requests.length;
  const completedRequests = requests.filter(r => r.status === 'done').length;
  const successRate = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;

  res.status(200).json({
    success: true,
    count: requests.length,
    total,
    metrics: {
      totalRequests,
      completedRequests,
      successRate: `${successRate}%`,
      pendingRequests: requests.filter(r => r.status === 'pending').length,
    },
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    data: requests,
  });
});

// @desc    Get funding history
// @route   GET /api/profile/funding-history
// @access  Private
exports.getFundingHistory = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    donor: req.user.id,
  };

  if (req.query.status) filter.status = req.query.status;

  const [fundings, total] = await Promise.all([
    Funding.find(filter)
      .select('amount currency transactionDate status receiptUrl message')
      .skip(skip)
      .limit(limit)
      .sort({ transactionDate: -1 }),
    Funding.countDocuments(filter),
  ]);

  // Calculate totals
  const totals = fundings.reduce(
    (acc, funding) => {
      if (funding.status === 'succeeded') {
        acc.successful += funding.amount;
        acc.count += 1;
      }
      return acc;
    },
    { successful: 0, count: 0 }
  );

  res.status(200).json({
    success: true,
    count: fundings.length,
    total,
    totals: {
      amount: totals.successful,
      formattedAmount: `৳${totals.successful.toLocaleString('en-BD')}`,
      donations: totals.count,
    },
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    data: fundings,
  });
});

// @desc    Update notification preferences
// @route   PUT /api/profile/notifications
// @access  Private
exports.updateNotificationPreferences = asyncHandler(async (req, res, next) => {
  const { preferences } = req.body;

  if (!preferences || typeof preferences !== 'object') {
    return next(new ErrorResponse('Notification preferences are required', 400));
  }

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { notificationPreferences: preferences },
    { new: true }
  ).select('-password');

  // Log activity
  await ActivityLog.logActivity({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'Updated Notification Preferences',
    actionType: 'update',
    category: 'profile',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: 'Updated notification preferences',
    details: JSON.stringify(preferences),
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: { notificationPreferences: user.notificationPreferences },
    message: 'Notification preferences updated successfully',
  });
});

// @desc    Deactivate account (soft delete)
// @route   DELETE /api/profile/deactivate
// @access  Private
exports.deactivateAccount = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  // Check if user has active donations or requests
  const [activeDonations, activeRequests] = await Promise.all([
    DonationRequest.countDocuments({
      donor: user._id,
      status: { $in: ['pending', 'inprogress'] },
      isActive: true,
    }),
    DonationRequest.countDocuments({
      requester: user._id,
      status: { $in: ['pending', 'inprogress'] },
      isActive: true,
    }),
  ]);

  if (activeDonations > 0 || activeRequests > 0) {
    return next(new ErrorResponse(
      'Cannot deactivate account with active donations or requests. Please complete or cancel them first.',
      400
    ));
  }

  // Soft delete - mark as inactive
  user.status = 'inactive';
  user.isAvailable = false;
  user.deactivatedAt = new Date();
  await user.save();

  // Log all active donations and requests as canceled
  await Promise.all([
    DonationRequest.updateMany(
      { donor: user._id, status: 'pending' },
      { status: 'canceled', $push: { statusHistory: { status: 'canceled', note: 'Donor deactivated account' } } }
    ),
    DonationRequest.updateMany(
      { requester: user._id, status: 'pending' },
      { status: 'canceled', $push: { statusHistory: { status: 'canceled', note: 'Requester deactivated account' } } }
    ),
  ]);

  // Log activity
  await ActivityLog.logActivity({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'Deactivated Account',
    actionType: 'delete',
    category: 'profile',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: 'Deactivated user account',
    status: 'success',
    severity: 'warning',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Clear token cookie
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: 'Account deactivated successfully. You can reactivate by logging in within 30 days.',
  });
});