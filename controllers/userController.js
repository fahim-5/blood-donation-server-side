import User from '../models/User.js';
import DonationRequest from '../models/DonationRequest.js';
import ActivityLog from '../models/ActivityLog.js';
import Notification from '../models/Notification.js';
import Funding from '../models/Funding.js';
import asyncHandler from '../middleware/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private/Admin
export const getAllUsers = asyncHandler(async (req, res, next) => {
  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Filtering
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
  if (req.query.district) filter.district = req.query.district;
  if (req.query.upazila) filter.upazila = req.query.upazila;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Sorting
  const sort = {};
  if (req.query.sort) {
    const sortField = req.query.sort.startsWith('-') ? req.query.sort.substring(1) : req.query.sort;
    sort[sortField] = req.query.sort.startsWith('-') ? -1 : 1;
  } else {
    sort.createdAt = -1;
  }

  // Execute query
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort(sort),
    User.countDocuments(filter),
  ]);

  // Log admin action
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Viewed All Users',
    actionType: 'read',
    category: 'admin',
    description: `Admin viewed all users (${users.length} users)`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
    request: {
      method: req.method,
      url: req.originalUrl,
      queryParams: req.query,
    },
  });

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    data: users,
  });
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  // Check authorization (user can view own profile, admin can view any)
  if (req.user.role !== 'admin' && req.user.id !== user.id) {
    return next(new ErrorResponse('Not authorized to access this user', 403));
  }

  // Get user statistics
  const stats = await Promise.all([
    DonationRequest.countDocuments({ requester: user._id }),
    DonationRequest.countDocuments({ donor: user._id, status: 'done' }),
    Funding.countDocuments({ donor: user._id, status: 'succeeded' }),
  ]);

  const userWithStats = {
    ...user.toObject(),
    statistics: {
      donationRequests: stats[0],
      donationsMade: stats[1],
      fundsDonated: stats[2],
    },
  };

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Viewed User Profile',
    actionType: 'read',
    category: 'user',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Viewed profile of ${user.name}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: userWithStats,
  });
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private
export const updateUser = asyncHandler(async (req, res, next) => {
  const updates = { ...req.body };
  
  // Remove fields that cannot be updated via this endpoint
  delete updates.email;
  delete updates.password;
  delete updates.role;
  delete updates.status;

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).select('-password');

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  // Check authorization
  if (req.user.role !== 'admin' && req.user.id !== user.id) {
    return next(new ErrorResponse('Not authorized to update this user', 403));
  }

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Updated User',
    actionType: 'update',
    category: 'user',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Updated user ${user.name}`,
    details: `Updated fields: ${Object.keys(req.body).join(', ')}`,
    changes: {
      before: { ...req.originalUser }, // You need to store original user in middleware
      after: user.toObject(),
    },
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Delete user (Admin only)
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  // Prevent deleting own account
  if (req.user.id === user.id) {
    return next(new ErrorResponse('You cannot delete your own account', 400));
  }

  // Check if user has related data
  const [hasDonations, hasFundings, hasRequests] = await Promise.all([
    DonationRequest.countDocuments({ donor: user._id }),
    Funding.countDocuments({ donor: user._id }),
    DonationRequest.countDocuments({ requester: user._id }),
  ]);

  if (hasDonations > 0 || hasFundings > 0 || hasRequests > 0) {
    return next(new ErrorResponse(
      'Cannot delete user with existing donations, funds, or requests. Archive instead.',
      400
    ));
  }

  await user.deleteOne();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Deleted User',
    actionType: 'delete',
    category: 'admin',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Deleted user ${user.name} (${user.email})`,
    status: 'success',
    severity: 'warning',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: {},
    message: 'User deleted successfully',
  });
});

// @desc    Block/Unblock user (Admin only)
// @route   PATCH /api/users/:id/block
// @access  Private/Admin
export const blockUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  // Prevent blocking yourself
  if (req.user.id === user.id) {
    return next(new ErrorResponse('You cannot block your own account', 400));
  }

  // Toggle block status
  const newStatus = user.status === 'active' ? 'blocked' : 'active';
  user.status = newStatus;
  await user.save();

  // Create notification for user
  const action = newStatus === 'blocked' ? 'blocked' : 'unblocked';
  await Notification.createSystemNotification({
    recipient: user._id,
    recipientEmail: user.email,
    title: `Account ${action.charAt(0).toUpperCase() + action.slice(1)}`,
    message: `Your account has been ${action} by an administrator. ${
      newStatus === 'blocked' 
        ? 'You will not be able to login or perform any actions until your account is unblocked.' 
        : 'Your account access has been restored.'
    }`,
    type: newStatus === 'blocked' ? 'error' : 'success',
    category: 'security',
    priority: 'high',
    actionUrl: '/contact',
    data: { action, admin: req.user.name },
  });

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
    actionType: newStatus === 'blocked' ? 'block' : 'unblock',
    category: 'security',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `${action.charAt(0).toUpperCase() + action.slice(1)} user ${user.name}`,
    details: `Reason: ${req.body.reason || 'Not specified'}`,
    status: 'success',
    severity: 'warning',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: user,
    message: `User ${action} successfully`,
  });
});

// @desc    Change user role (Admin only)
// @route   PATCH /api/users/:id/role
// @access  Private/Admin
export const changeUserRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;
  const allowedRoles = ['donor', 'volunteer', 'admin'];

  if (!allowedRoles.includes(role)) {
    return next(new ErrorResponse(`Invalid role. Allowed roles: ${allowedRoles.join(', ')}`, 400));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  // Prevent changing your own role
  if (req.user.id === user.id) {
    return next(new ErrorResponse('You cannot change your own role', 400));
  }

  const oldRole = user.role;
  user.role = role;
  await user.save();

  // Create notification for user
  await Notification.createSystemNotification({
    recipient: user._id,
    recipientEmail: user.email,
    title: 'Role Updated',
    message: `Your role has been changed from ${oldRole} to ${role}.`,
    type: 'info',
    category: 'user',
    priority: 'medium',
    actionUrl: '/dashboard',
    data: { oldRole, newRole: role },
  });

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Changed User Role',
    actionType: 'update',
    category: 'admin',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Changed role for ${user.name} from ${oldRole} to ${role}`,
    changes: {
      before: { role: oldRole },
      after: { role },
    },
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: user,
    message: `User role changed to ${role}`,
  });
});

// @desc    Get user statistics
// @route   GET /api/users/:id/stats
// @access  Private
export const getUserStats = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  // Check authorization
  if (req.user.role !== 'admin' && req.user.id !== user.id) {
    return next(new ErrorResponse('Not authorized to view these statistics', 403));
  }

  // Get detailed statistics
  const [
    totalRequests,
    pendingRequests,
    inProgressRequests,
    completedDonations,
    canceledDonations,
    totalFundings,
    fundingAmount,
  ] = await Promise.all([
    // Donation requests made by user
    DonationRequest.countDocuments({ requester: user._id }),
    DonationRequest.countDocuments({ requester: user._id, status: 'pending' }),
    DonationRequest.countDocuments({ requester: user._id, status: 'inprogress' }),
    
    // Donations made by user
    DonationRequest.countDocuments({ donor: user._id, status: 'done' }),
    DonationRequest.countDocuments({ donor: user._id, status: 'canceled' }),
    
    // Funding statistics
    Funding.countDocuments({ donor: user._id, status: 'succeeded' }),
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
          total: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  const fundingTotal = fundingAmount.length > 0 ? fundingAmount[0].total : 0;

  // Get last donation date
  const lastDonation = await DonationRequest.findOne({
    donor: user._id,
    status: 'done',
  })
    .sort({ donationDate: -1 })
    .select('donationDate');

  // Get blood group compatibility
  const bloodCompatibility = {
    'A+': ['A+', 'A-', 'O+', 'O-'],
    'A-': ['A-', 'O-'],
    'B+': ['B+', 'B-', 'O+', 'O-'],
    'B-': ['B-', 'O-'],
    'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    'AB-': ['A-', 'B-', 'AB-', 'O-'],
    'O+': ['O+', 'O-'],
    'O-': ['O-'],
  };

  const compatibleGroups = bloodCompatibility[user.bloodGroup] || [];

  const stats = {
    donationRequests: {
      total: totalRequests,
      pending: pendingRequests,
      inProgress: inProgressRequests,
    },
    donations: {
      completed: completedDonations,
      canceled: canceledDonations,
      lastDonation: lastDonation ? lastDonation.donationDate : null,
    },
    funding: {
      donations: totalFundings,
      totalAmount: fundingTotal,
      formattedAmount: `৳${fundingTotal.toLocaleString('en-BD')}`,
    },
    compatibility: {
      canDonateTo: compatibleGroups,
      canReceiveFrom: Object.entries(bloodCompatibility)
        .filter(([group, compatible]) => compatible.includes(user.bloodGroup))
        .map(([group]) => group),
    },
    availability: {
      isAvailable: user.isAvailable,
      lastDonation: user.lastDonationDate,
      canDonate: !user.lastDonationDate || 
        (new Date() - new Date(user.lastDonationDate)) > 90 * 24 * 60 * 60 * 1000, // 90 days
    },
  };

  res.status(200).json({
    success: true,
    data: stats,
  });
});

// @desc    Search donors by filters
// @route   GET /api/users/search/donors
// @access  Public
export const searchDonors = asyncHandler(async (req, res, next) => {
  const {
    bloodGroup,
    district,
    upazila,
    page = 1,
    limit = 20,
    availableOnly = true,
  } = req.query;

  // Build filter
  const filter = {
    role: 'donor',
    status: 'active',
  };

  if (bloodGroup) filter.bloodGroup = bloodGroup.toUpperCase();
  if (district) filter.district = district;
  if (upazila) filter.upazila = upazila;
  if (availableOnly === 'true') filter.isAvailable = true;

  const skip = (page - 1) * limit;

  // Get donors with pagination
  const [donors, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ totalDonations: -1, createdAt: -1 }),
    User.countDocuments(filter),
  ]);

  // Enrich donors with availability status
  const enrichedDonors = donors.map(donor => {
    const donorObj = donor.toObject();
    
    // Calculate days since last donation
    const daysSinceLastDonation = donor.lastDonationDate
      ? Math.floor((new Date() - new Date(donor.lastDonationDate)) / (1000 * 60 * 60 * 24))
      : null;
    
    const canDonate = !donor.lastDonationDate || daysSinceLastDonation > 90;
    
    return {
      ...donorObj,
      availability: {
        isAvailable: donor.isAvailable && canDonate,
        lastDonationDate: donor.lastDonationDate,
        daysSinceLastDonation,
        canDonate,
        nextEligibleDate: donor.lastDonationDate
          ? new Date(new Date(donor.lastDonationDate).getTime() + 90 * 24 * 60 * 60 * 1000)
          : null,
      },
    };
  });

  // Log search activity
  await ActivityLog.logActivity({
    user: req.user?._id || null,
    userName: req.user?.name || 'Guest',
    userEmail: req.user?.email || 'guest',
    userRole: req.user?.role || 'anonymous',
    action: 'Donor Search',
    actionType: 'search',
    category: 'search',
    description: `Searched for donors with filters: ${JSON.stringify(req.query)}`,
    details: `Found ${total} donors matching criteria`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
    request: {
      method: req.method,
      url: req.originalUrl,
      queryParams: req.query,
    },
  });

  res.status(200).json({
    success: true,
    count: enrichedDonors.length,
    total,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    filters: {
      bloodGroup: bloodGroup || 'Any',
      district: district || 'Any',
      upazila: upazila || 'Any',
      availableOnly: availableOnly === 'true',
    },
    data: enrichedDonors,
  });
});

// @desc    Toggle donor availability
// @route   PATCH /api/users/:id/availability
// @access  Private
export const toggleAvailability = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  // Check authorization
  if (req.user.role !== 'admin' && req.user.id !== user.id) {
    return next(new ErrorResponse('Not authorized to update this user', 403));
  }

  user.isAvailable = !user.isAvailable;
  await user.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Updated Availability',
    actionType: 'update',
    category: 'user',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Set availability to ${user.isAvailable ? 'available' : 'unavailable'}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: user,
    message: `You are now ${user.isAvailable ? 'available' : 'unavailable'} for donations`,
  });
});

// @desc    Get top donors
// @route   GET /api/users/top-donors
// @access  Public
export const getTopDonors = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;

  const topDonors = await User.aggregate([
    {
      $match: {
        role: 'donor',
        status: 'active',
        totalDonations: { $gt: 0 },
      },
    },
    {
      $sort: { totalDonations: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        avatar: 1,
        bloodGroup: 1,
        district: 1,
        upazila: 1,
        totalDonations: 1,
        lastDonationDate: 1,
        isAvailable: 1,
        createdAt: 1,
      },
    },
  ]);

  res.status(200).json({
    success: true,
    count: topDonors.length,
    data: topDonors,
  });
});

// @desc    Update last donation date
// @route   PATCH /api/users/:id/last-donation
// @access  Private/Admin
export const updateLastDonation = asyncHandler(async (req, res, next) => {
  const { donationDate } = req.body;

  if (!donationDate) {
    return next(new ErrorResponse('Donation date is required', 400));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  user.lastDonationDate = new Date(donationDate);
  user.totalDonations = (user.totalDonations || 0) + 1;
  await user.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Updated Last Donation',
    actionType: 'update',
    category: 'donation',
    entityType: 'user',
    entityId: user._id,
    entityName: user.name,
    description: `Updated last donation date for ${user.name}`,
    details: `New donation date: ${donationDate}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: user,
    message: 'Last donation date updated successfully',
  });
});

// Export all functions as named exports
export default {
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
  blockUser,
  changeUserRole,
  getUserStats,
  searchDonors,
  toggleAvailability,
  getTopDonors,
  updateLastDonation
};