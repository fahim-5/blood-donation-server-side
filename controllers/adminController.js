import User from '../models/User.js';
import DonationRequest from '../models/DonationRequest.js';
import Funding from '../models/Funding.js';
import Contact from '../models/Contact.js';
import ActivityLog from '../models/ActivityLog.js';
import Notification from '../models/Notification.js';
import asyncHandler from '../middleware/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard/stats
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res, next) => {
  // Get date ranges
  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  // Execute all queries in parallel
  const [
    totalUsers,
    totalDonors,
    totalVolunteers,
    totalAdmins,
    newUsersToday,
    newUsersThisWeek,
    newUsersThisMonth,
    
    totalRequests,
    pendingRequests,
    inProgressRequests,
    completedRequests,
    newRequestsToday,
    urgentRequests,
    
    totalFundings,
    fundingAmount,
    fundingToday,
    fundingThisWeek,
    
    totalContacts,
    newContactsToday,
    unreadContacts,
    
    systemMetrics,
    topDonors,
    recentActivities,
  ] = await Promise.all([
    // User Statistics
    User.countDocuments(),
    User.countDocuments({ role: 'donor' }),
    User.countDocuments({ role: 'volunteer' }),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ createdAt: { $gte: startOfToday } }),
    User.countDocuments({ createdAt: { $gte: startOfWeek } }),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),

    // Donation Request Statistics
    DonationRequest.countDocuments({ isActive: true }),
    DonationRequest.countDocuments({ isActive: true, status: 'pending' }),
    DonationRequest.countDocuments({ isActive: true, status: 'inprogress' }),
    DonationRequest.countDocuments({ isActive: true, status: 'done' }),
    DonationRequest.countDocuments({ isActive: true, createdAt: { $gte: startOfToday } }),
    DonationRequest.countDocuments({ isActive: true, status: 'pending', urgency: { $in: ['high', 'critical'] } }),

    // Funding Statistics
    Funding.countDocuments({ status: 'succeeded' }),
    Funding.aggregate([
      { $match: { status: 'succeeded' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Funding.aggregate([
      { $match: { status: 'succeeded', transactionDate: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Funding.aggregate([
      { $match: { status: 'succeeded', transactionDate: { $gte: startOfWeek } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Contact Statistics
    Contact.countDocuments(),
    Contact.countDocuments({ createdAt: { $gte: startOfToday } }),
    Contact.countDocuments({ status: 'new' }),

    // System Metrics
    ActivityLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfToday },
        },
      },
      {
        $group: {
          _id: null,
          totalActivities: { $sum: 1 },
          errors: { $sum: { $cond: [{ $in: ['$severity', ['error', 'critical']] }, 1, 0] } },
          avgResponseTime: { $avg: '$performance.duration' },
        },
      },
    ]),

    // Top Donors
    User.find({ role: 'donor', totalDonations: { $gt: 0 } })
      .sort({ totalDonations: -1 })
      .limit(5)
      .select('name email avatar bloodGroup totalDonations lastDonationDate'),

    // Recent Activities
    ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name email avatar')
      .populate('entityId'),
  ]);

  // Format funding data
  const totalFunding = fundingAmount.length > 0 ? fundingAmount[0].total : 0;
  const todayFunding = fundingToday.length > 0 ? fundingToday[0] : { total: 0, count: 0 };
  const weekFunding = fundingThisWeek.length > 0 ? fundingThisWeek[0] : { total: 0, count: 0 };
  const metrics = systemMetrics.length > 0 ? systemMetrics[0] : { totalActivities: 0, errors: 0, avgResponseTime: 0 };

  const stats = {
    summary: {
      users: totalUsers,
      donations: totalRequests,
      funds: totalFundings,
      contacts: totalContacts,
    },
    users: {
      total: totalUsers,
      donors: totalDonors,
      volunteers: totalVolunteers,
      admins: totalAdmins,
      newToday: newUsersToday,
      newThisWeek: newUsersThisWeek,
      newThisMonth: newUsersThisMonth,
      growthRate: totalUsers > 0 ? ((newUsersThisWeek / totalUsers) * 100).toFixed(2) : 0,
    },
    donations: {
      total: totalRequests,
      pending: pendingRequests,
      inProgress: inProgressRequests,
      completed: completedRequests,
      newToday: newRequestsToday,
      urgent: urgentRequests,
      completionRate: totalRequests > 0 ? ((completedRequests / totalRequests) * 100).toFixed(2) : 0,
    },
    funding: {
      totalDonations: totalFundings,
      totalAmount: totalFunding,
      formattedAmount: `৳${totalFunding.toLocaleString('en-BD')}`,
      today: {
        amount: todayFunding.total,
        donations: todayFunding.count,
      },
      thisWeek: {
        amount: weekFunding.total,
        donations: weekFunding.count,
      },
    },
    contacts: {
      total: totalContacts,
      newToday: newContactsToday,
      unread: unreadContacts,
      resolutionRate: totalContacts > 0 ? (((totalContacts - unreadContacts) / totalContacts) * 100).toFixed(2) : 0,
    },
    system: {
      activitiesToday: metrics.totalActivities,
      errorsToday: metrics.errors,
      avgResponseTime: metrics.avgResponseTime.toFixed(2),
      errorRate: metrics.totalActivities > 0 ? ((metrics.errors / metrics.totalActivities) * 100).toFixed(2) : 0,
    },
    leaderboard: {
      topDonors,
    },
    recentActivities,
  };

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Viewed Admin Dashboard',
    actionType: 'read',
    category: 'admin',
    description: 'Viewed admin dashboard statistics',
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: stats,
  });
});

// @desc    Get detailed analytics
// @route   GET /api/admin/analytics
// @access  Private/Admin
const getAnalytics = asyncHandler(async (req, res, next) => {
  const { period = 'month', year = new Date().getFullYear() } = req.query;
  
  let startDate, endDate;
  const currentDate = new Date();

  switch (period) {
    case 'day':
      startDate = new Date(currentDate.setHours(0, 0, 0, 0));
      endDate = new Date(currentDate.setHours(23, 59, 59, 999));
      break;
    case 'week':
      startDate = new Date(currentDate.setDate(currentDate.getDate() - 7));
      endDate = new Date();
      break;
    case 'month':
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case 'year':
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
      break;
    default:
      startDate = new Date(currentDate.setDate(currentDate.getDate() - 30)); // Last 30 days
      endDate = new Date();
  }

  // Execute analytics queries
  const [
    userGrowth,
    donationTrends,
    fundingTrends,
    bloodGroupDistribution,
    locationDistribution,
    userActivity,
    peakHours,
    conversionRates,
  ] = await Promise.all([
    // User growth over time
    User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            role: '$role',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          total: { $sum: '$count' },
          donors: { $sum: { $cond: [{ $eq: ['$_id.role', 'donor'] }, '$count', 0] } },
          volunteers: { $sum: { $cond: [{ $eq: ['$_id.role', 'volunteer'] }, '$count', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Donation trends
    DonationRequest.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          isActive: true,
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          total: { $sum: '$count' },
          pending: { $sum: { $cond: [{ $eq: ['$_id.status', 'pending'] }, '$count', 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$_id.status', 'done'] }, '$count', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Funding trends
    Funding.aggregate([
      {
        $match: {
          transactionDate: { $gte: startDate, $lte: endDate },
          status: 'succeeded',
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$transactionDate' } },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]),

    // Blood group distribution
    DonationRequest.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$bloodGroup',
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]),

    // Location distribution
    DonationRequest.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            district: '$recipientDistrict',
            upazila: '$recipientUpazila',
          },
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),

    // User activity patterns
    ActivityLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          user: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            user: '$user',
            actionType: '$actionType',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.user',
          totalActivities: { $sum: '$count' },
          activityTypes: {
            $push: {
              actionType: '$_id.actionType',
              count: '$count',
            },
          },
        },
      },
      { $sort: { totalActivities: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      {
        $unwind: '$userDetails',
      },
      {
        $project: {
          userId: '$_id',
          userName: '$userDetails.name',
          userEmail: '$userDetails.email',
          userRole: '$userDetails.role',
          totalActivities: 1,
          activityTypes: 1,
        },
      },
    ]),

    // Peak hours analysis
    ActivityLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            dayOfWeek: { $dayOfWeek: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.hour',
          count: { $sum: '$count' },
          avgPerDay: { $avg: '$count' },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Conversion rates
    (async () => {
      const totalDonors = await User.countDocuments({ role: 'donor' });
      const activeDonors = await User.countDocuments({ 
        role: 'donor', 
        totalDonations: { $gt: 0 } 
      });
      const totalRequests = await DonationRequest.countDocuments({ isActive: true });
      const completedRequests = await DonationRequest.countDocuments({ 
        isActive: true, 
        status: 'done' 
      });
      
      return {
        donorConversion: totalDonors > 0 ? (activeDonors / totalDonors * 100).toFixed(2) : 0,
        requestCompletion: totalRequests > 0 ? (completedRequests / totalRequests * 100).toFixed(2) : 0,
      };
    })(),
  ]);

  const analytics = {
    period: {
      start: startDate,
      end: endDate,
      type: period,
    },
    userGrowth,
    donationTrends,
    fundingTrends,
    bloodGroupDistribution,
    locationDistribution,
    userActivity,
    peakHours,
    conversionRates,
    summary: {
      totalUsers: userGrowth.reduce((sum, day) => sum + day.total, 0),
      totalDonations: donationTrends.reduce((sum, day) => sum + day.total, 0),
      totalFunding: fundingTrends.reduce((sum, day) => sum + day.amount, 0),
      avgDonationsPerDay: donationTrends.length > 0 
        ? (donationTrends.reduce((sum, day) => sum + day.total, 0) / donationTrends.length).toFixed(2) 
        : 0,
      avgFundingPerDay: fundingTrends.length > 0 
        ? (fundingTrends.reduce((sum, day) => sum + day.amount, 0) / fundingTrends.length).toFixed(2) 
        : 0,
    },
  };

  res.status(200).json({
    success: true,
    data: analytics,
  });
});

// @desc    Get system logs
// @route   GET /api/admin/logs
// @access  Private/Admin
const getSystemLogs = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = {};
  
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.actionType) filter.actionType = req.query.actionType;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.user) filter.user = req.query.user;
  if (req.query.search) {
    filter.$or = [
      { description: { $regex: req.query.search, $options: 'i' } },
      { userName: { $regex: req.query.search, $options: 'i' } },
      { userEmail: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Date filtering
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
  }

  // Sorting
  const sort = { createdAt: -1 }; // Default: newest first

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('user', 'name email avatar role')
      .populate('entityId')
      .skip(skip)
      .limit(limit)
      .sort(sort),
    ActivityLog.countDocuments(filter),
  ]);

  // Get log statistics
  const logStats = await ActivityLog.aggregate([
    {
      $match: filter,
    },
    {
      $facet: {
        bySeverity: [
          {
            $group: {
              _id: '$severity',
              count: { $sum: 1 },
            },
          },
        ],
        byActionType: [
          {
            $group: {
              _id: '$actionType',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        byCategory: [
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        hourlyDistribution: [
          {
            $group: {
              _id: { $hour: '$createdAt' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  res.status(200).json({
    success: true,
    count: logs.length,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    filters: req.query,
    statistics: logStats.length > 0 ? logStats[0] : {},
    data: logs,
  });
});

// @desc    Get user management data
// @route   GET /api/admin/users
// @access  Private/Admin
const getUserManagement = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = {};
  
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
  if (req.query.district) filter.district = req.query.district;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Get users with statistics
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    User.countDocuments(filter),
  ]);

  // Enrich users with statistics
  const enrichedUsers = await Promise.all(
    users.map(async (user) => {
      const [donationStats, fundingStats, recentActivity] = await Promise.all([
        DonationRequest.aggregate([
          {
            $match: {
              $or: [
                { requester: user._id },
                { donor: user._id },
              ],
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
        ActivityLog.findOne({ user: user._id })
          .sort({ createdAt: -1 })
          .select('action createdAt'),
      ]);

      const stats = {
        donations: {
          total: 0,
          pending: 0,
          inprogress: 0,
          done: 0,
          canceled: 0,
        },
        funding: {
          totalAmount: fundingStats.length > 0 ? fundingStats[0].totalAmount : 0,
          totalDonations: fundingStats.length > 0 ? fundingStats[0].count : 0,
        },
      };

      donationStats.forEach(stat => {
        stats.donations[stat._id] = stat.count;
        stats.donations.total += stat.count;
      });

      return {
        ...user.toObject(),
        statistics: stats,
        lastActivity: recentActivity ? {
          action: recentActivity.action,
          timestamp: recentActivity.createdAt,
        } : null,
      };
    })
  );

  // Get user statistics
  const userStats = await User.aggregate([
    {
      $facet: {
        roleDistribution: [
          {
            $group: {
              _id: '$role',
              count: { $sum: 1 },
            },
          },
        ],
        statusDistribution: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ],
        bloodGroupDistribution: [
          {
            $match: { bloodGroup: { $ne: null } },
          },
          {
            $group: {
              _id: '$bloodGroup',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        locationDistribution: [
          {
            $group: {
              _id: {
                district: '$district',
                upazila: '$upazila',
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        growthOverTime: [
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
          { $limit: 12 },
        ],
      },
    },
  ]);

  res.status(200).json({
    success: true,
    count: enrichedUsers.length,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    statistics: userStats.length > 0 ? userStats[0] : {},
    data: enrichedUsers,
  });
});

// @desc    Get all users with statistics (alias for getUserManagement)
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsersWithStats = getUserManagement;

// @desc    Block a user
// @route   PUT /api/admin/users/:id/block
// @access  Private/Admin
const blockUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  const user = await User.findById(id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (user.role === 'admin') {
    return next(new ErrorResponse('Cannot block admin users', 403));
  }

  user.status = 'blocked';
  user.blockedAt = new Date();
  user.blockedBy = req.user._id;
  user.blockReason = reason || 'Administrative action';
  await user.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Blocked User',
    actionType: 'update',
    category: 'admin',
    description: `Blocked user: ${user.name} (${user.email})`,
    details: `Reason: ${reason || 'Administrative action'}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    message: 'User blocked successfully',
    data: user,
  });
});

// @desc    Unblock a user
// @route   PUT /api/admin/users/:id/unblock
// @access  Private/Admin
const unblockUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  user.status = 'active';
  user.blockedAt = null;
  user.blockedBy = null;
  user.blockReason = null;
  await user.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Unblocked User',
    actionType: 'update',
    category: 'admin',
    description: `Unblocked user: ${user.name} (${user.email})`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    message: 'User unblocked successfully',
    data: user,
  });
});

// @desc    Change user role
// @route   PUT /api/admin/users/:id/role
// @access  Private/Admin
const changeUserRole = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.body;

  const user = await User.findById(id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const oldRole = user.role;
  user.role = role;
  await user.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Changed User Role',
    actionType: 'update',
    category: 'admin',
    description: `Changed user role for ${user.name} (${user.email})`,
    details: `From: ${oldRole} → To: ${role}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    message: 'User role updated successfully',
    data: user,
  });
});

// @desc    Get donation request management data
// @route   GET /api/admin/donations
// @access  Private/Admin
const getDonationManagement = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = { isActive: true };
  
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
  if (req.query.urgency) filter.urgency = req.query.urgency;
  if (req.query.district) filter.recipientDistrict = req.query.district;
  if (req.query.upazila) filter.recipientUpazila = req.query.upazila;
  if (req.query.search) {
    filter.$or = [
      { recipientName: { $regex: req.query.search, $options: 'i' } },
      { hospitalName: { $regex: req.query.search, $options: 'i' } },
      { requesterName: { $regex: req.query.search, $options: 'i' } },
      { donorName: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Date filtering
  if (req.query.startDate || req.query.endDate) {
    filter.donationDate = {};
    if (req.query.startDate) filter.donationDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.donationDate.$lte = new Date(req.query.endDate);
  }

  const [donations, total] = await Promise.all([
    DonationRequest.find(filter)
      .populate('requester', 'name email avatar')
      .populate('donor', 'name email avatar')
      .skip(skip)
      .limit(limit)
      .sort({ donationDate: 1, createdAt: -1 }),
    DonationRequest.countDocuments(filter),
  ]);

  // Get donation statistics
  const donationStats = await DonationRequest.aggregate([
    {
      $match: { isActive: true },
    },
    {
      $facet: {
        statusDistribution: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ],
        bloodGroupDistribution: [
          {
            $group: {
              _id: '$bloodGroup',
              count: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            },
          },
          { $sort: { count: -1 } },
        ],
        urgencyDistribution: [
          {
            $group: {
              _id: '$urgency',
              count: { $sum: 1 },
            },
          },
        ],
        locationDistribution: [
          {
            $group: {
              _id: {
                district: '$recipientDistrict',
                upazila: '$recipientUpazila',
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        hospitalDistribution: [
          {
            $group: {
              _id: '$hospitalName',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        timeToCompletion: [
          {
            $match: {
              status: 'done',
              'statusHistory.1': { $exists: true }, // Has at least 2 status changes
            },
          },
          {
            $project: {
              createdAt: 1,
              completedAt: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: '$statusHistory',
                      as: 'history',
                      cond: { $eq: ['$$history.status', 'done'] },
                    },
                  },
                  0,
                ],
              },
            },
          },
          {
            $project: {
              duration: {
                $divide: [
                  { $subtract: ['$completedAt.changedAt', '$createdAt'] },
                  1000 * 60 * 60, // Convert to hours
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              avgHours: { $avg: '$duration' },
              minHours: { $min: '$duration' },
              maxHours: { $max: '$duration' },
            },
          },
        ],
      },
    },
  ]);

  res.status(200).json({
    success: true,
    count: donations.length,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    statistics: donationStats.length > 0 ? donationStats[0] : {},
    data: donations,
  });
});

// @desc    Get all donation requests (alias for getDonationManagement)
// @route   GET /api/admin/donation-requests
// @access  Private/Admin
const getAllDonationRequests = getDonationManagement;

// @desc    Send system-wide notification
// @route   POST /api/admin/notify-all
// @access  Private/Admin
const sendSystemNotification = asyncHandler(async (req, res, next) => {
  const { title, message, type = 'info', priority = 'medium', targetUsers = 'all' } = req.body;

  if (!title || !message) {
    return next(new ErrorResponse('Title and message are required', 400));
  }

  // Determine target users
  let targetFilter = {};
  if (targetUsers === 'donors') {
    targetFilter = { role: 'donor', status: 'active' };
  } else if (targetUsers === 'volunteers') {
    targetFilter = { role: 'volunteer', status: 'active' };
  } else if (targetUsers === 'admins') {
    targetFilter = { role: 'admin', status: 'active' };
  } else {
    targetFilter = { status: 'active' }; // All active users
  }

  // Get target users
  const targetUsersList = await User.find(targetFilter).select('_id email');

  if (targetUsersList.length === 0) {
    return next(new ErrorResponse('No users found to notify', 404));
  }

  // Create batch notifications
  const batchId = `admin_broadcast_${Date.now()}`;
  const notifications = targetUsersList.map(user => ({
    recipient: user._id,
    recipientEmail: user.email,
    title,
    message,
    type,
    category: 'admin',
    priority,
    actionUrl: req.body.actionUrl || '/dashboard',
    data: {
      broadcast: true,
      sentBy: req.user.name,
      sentAt: new Date(),
    },
    batchId,
    sender: req.user._id,
    senderName: req.user.name,
    senderRole: req.user.role,
  }));

  // Insert notifications in batches to avoid memory issues
  const batchSize = 100;
  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    await Notification.insertMany(batch);
  }

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Sent System Notification',
    actionType: 'create',
    category: 'admin',
    description: `Sent notification to ${targetUsersList.length} users`,
    details: `Title: ${title}, Target: ${targetUsers}, Priority: ${priority}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    message: `Notification sent to ${targetUsersList.length} users`,
    data: {
      sentTo: targetUsersList.length,
      batchId,
      target: targetUsers,
    },
  });
});

// @desc    Cleanup old data
// @route   POST /api/admin/cleanup
// @access  Private/Admin
const cleanupOldData = asyncHandler(async (req, res, next) => {
  const { cleanupType = 'logs', days = 90 } = req.body;

  let result;
  let message;

  switch (cleanupType) {
    case 'logs':
      result = await ActivityLog.cleanupOldLogs(days);
      message = `Cleaned up activity logs older than ${days} days`;
      break;

    case 'notifications':
      result = await Notification.cleanupExpired();
      message = 'Cleaned up expired notifications';
      break;

    case 'contacts':
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      result = await Contact.deleteMany({
        status: { $in: ['resolved', 'closed'] },
        createdAt: { $lt: cutoffDate },
      });
      message = `Cleaned up resolved/closed contacts older than ${days} days`;
      break;

    default:
      return next(new ErrorResponse('Invalid cleanup type', 400));
  }

  // Log cleanup activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Data Cleanup',
    actionType: 'delete',
    category: 'system',
    description: `Performed ${cleanupType} cleanup`,
    details: message,
    status: 'success',
    severity: 'info',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    message,
    data: result,
  });
});

// @desc    Export data
// @route   GET /api/admin/export
// @access  Private/Admin
const exportData = asyncHandler(async (req, res, next) => {
  const { dataType, format = 'json', startDate, endDate } = req.query;

  if (!dataType) {
    return next(new ErrorResponse('Data type is required', 400));
  }

  const validDataTypes = ['users', 'donations', 'fundings', 'contacts', 'logs'];
  if (!validDataTypes.includes(dataType)) {
    return next(new ErrorResponse(`Invalid data type. Valid types: ${validDataTypes.join(', ')}`, 400));
  }

  // Build date filter
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  let data;
  let model;
  let fileName;

  switch (dataType) {
    case 'users':
      model = User;
      fileName = `users_export_${new Date().toISOString().split('T')[0]}`;
      data = await User.find(dateFilter ? { createdAt: dateFilter } : {})
        .select('-password')
        .lean();
      break;

    case 'donations':
      model = DonationRequest;
      fileName = `donations_export_${new Date().toISOString().split('T')[0]}`;
      data = await DonationRequest.find(
        dateFilter ? { createdAt: dateFilter, isActive: true } : { isActive: true }
      )
        .populate('requester', 'name email')
        .populate('donor', 'name email')
        .lean();
      break;

    case 'fundings':
      model = Funding;
      fileName = `fundings_export_${new Date().toISOString().split('T')[0]}`;
      data = await Funding.find(dateFilter ? { transactionDate: dateFilter } : {})
        .populate('donor', 'name email')
        .lean();
      break;

    case 'contacts':
      model = Contact;
      fileName = `contacts_export_${new Date().toISOString().split('T')[0]}`;
      data = await Contact.find(dateFilter ? { createdAt: dateFilter } : {})
        .populate('user', 'name email')
        .populate('assignedTo', 'name email')
        .lean();
      break;

    case 'logs':
      model = ActivityLog;
      fileName = `logs_export_${new Date().toISOString().split('T')[0]}`;
      data = await ActivityLog.find(dateFilter ? { createdAt: dateFilter } : {})
        .populate('user', 'name email')
        .lean();
      break;
  }

  // Log export activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Data Export',
    actionType: 'read',
    category: 'admin',
    description: `Exported ${dataType} data`,
    details: `Format: ${format}, Records: ${data.length}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (format === 'csv') {
    // Convert to CSV
    const { Parser } = await import('json2csv');
    const fields = Object.keys(data[0] || {});
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(data);

    res.header('Content-Type', 'text/csv');
    res.attachment(`${fileName}.csv`);
    return res.send(csv);
  }

  // Default: JSON
  res.status(200).json({
    success: true,
    count: data.length,
    exportedAt: new Date(),
    dataType,
    format,
    data,
  });
});

// Export all controller methods
export default {
  getDashboardStats,
  getAnalytics,
  getSystemLogs,
  getUserManagement,
  getAllUsersWithStats,
  blockUser,
  unblockUser,
  changeUserRole,
  getDonationManagement,
  getAllDonationRequests,
  sendSystemNotification,
  cleanupOldData,
  exportData,
};