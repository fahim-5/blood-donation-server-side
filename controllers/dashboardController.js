// server/src/controllers/dashboardController.js
const User = require('../models/User');
const DonationRequest = require('../models/DonationRequest');
const Funding = require('../models/Funding');
const Contact = require('../models/Contact');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get role-based dashboard data
// @route   GET /api/dashboard
// @access  Private
exports.getDashboard = asyncHandler(async (req, res, next) => {
  const user = req.user;
  let dashboardData = {};

  switch (user.role) {
    case 'admin':
      dashboardData = await getAdminDashboard(user);
      break;
    case 'volunteer':
      dashboardData = await getVolunteerDashboard(user);
      break;
    case 'donor':
      dashboardData = await getDonorDashboard(user);
      break;
    default:
      return next(new ErrorResponse('Invalid user role', 400));
  }

  // Log dashboard access
  await ActivityLog.logActivity({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'Accessed Dashboard',
    actionType: 'read',
    category: 'dashboard',
    description: `Accessed ${user.role} dashboard`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: dashboardData,
  });
});

// Helper: Get admin dashboard data
async function getAdminDashboard(user) {
  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Execute all queries in parallel
  const [
    userStats,
    donationStats,
    fundingStats,
    contactStats,
    recentActivities,
    urgentTasks,
    systemHealth,
    topPerformers,
  ] = await Promise.all([
    // User statistics
    User.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                donors: { $sum: { $cond: [{ $eq: ['$role', 'donor'] }, 1, 0] } },
                volunteers: { $sum: { $cond: [{ $eq: ['$role', 'volunteer'] }, 1, 0] } },
                admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
                active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
              },
            },
          ],
          today: [
            {
              $match: {
                createdAt: { $gte: startOfToday },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
          ],
          growth: [
            {
              $group: {
                _id: {
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 6 },
          ],
        },
      },
    ]),

    // Donation statistics
    DonationRequest.aggregate([
      {
        $match: { isActive: true },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                inProgress: { $sum: { $cond: [{ $eq: ['$status', 'inprogress'] }, 1, 0] } },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
                canceled: { $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] } },
                urgent: { $sum: { $cond: [{ $in: ['$urgency', ['high', 'critical']] }, 1, 0] } },
              },
            },
          ],
          today: [
            {
              $match: {
                createdAt: { $gte: startOfToday },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
          ],
          byBloodGroup: [
            {
              $group: {
                _id: '$bloodGroup',
                count: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 8 },
          ],
          byLocation: [
            {
              $group: {
                _id: '$recipientDistrict',
                count: { $sum: 1 },
                upazilas: { $addToSet: '$recipientUpazila' },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ]),

    // Funding statistics
    Funding.aggregate([
      {
        $match: {
          status: 'succeeded',
          $or: [
            { refund: { $exists: false } },
            { 'refund.amount': 0 },
          ],
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 },
                avgAmount: { $avg: '$amount' },
              },
            },
          ],
          today: [
            {
              $match: {
                transactionDate: { $gte: startOfToday },
              },
            },
            {
              $group: {
                _id: null,
                amount: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
          ],
          thisWeek: [
            {
              $match: {
                transactionDate: { $gte: startOfWeek },
              },
            },
            {
              $group: {
                _id: null,
                amount: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
          ],
          byType: [
            {
              $group: {
                _id: '$donationType',
                amount: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
            { $sort: { amount: -1 } },
          ],
          topDonors: [
            {
              $match: {
                isAnonymous: false,
              },
            },
            {
              $group: {
                _id: '$donor',
                donorName: { $first: '$donorName' },
                amount: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
            { $sort: { amount: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ]),

    // Contact statistics
    Contact.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
                inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
                resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
                closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
                urgent: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } },
              },
            },
          ],
          today: [
            {
              $match: {
                createdAt: { $gte: startOfToday },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
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
          responseTime: [
            {
              $match: {
                status: { $in: ['resolved', 'closed'] },
                'responses.0': { $exists: true },
              },
            },
            {
              $project: {
                responseHours: {
                  $divide: [
                    { $subtract: [{ $arrayElemAt: ['$responses.sentAt', 0] }, '$createdAt'] },
                    1000 * 60 * 60,
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgHours: { $avg: '$responseHours' },
                minHours: { $min: '$responseHours' },
                maxHours: { $max: '$responseHours' },
              },
            },
          ],
        },
      },
    ]),

    // Recent activities
    ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name email avatar')
      .populate('entityId'),

    // Urgent tasks
    Promise.all([
      // Urgent donation requests
      DonationRequest.find({
        isActive: true,
        status: 'pending',
        urgency: { $in: ['high', 'critical'] },
        donationDate: { $gte: new Date() },
      })
        .populate('requester', 'name email')
        .sort({ urgency: -1, donationDate: 1 })
        .limit(5),
      
      // Unassigned contacts
      Contact.find({
        assignedTo: null,
        status: { $in: ['new', 'in-progress'] },
        priority: { $in: ['high', 'urgent'] },
      })
        .sort({ priority: -1, createdAt: -1 })
        .limit(5),
      
      // Pending fundings (needing verification)
      Funding.find({
        status: 'pending',
        isVerified: false,
      })
        .populate('donor', 'name email')
        .sort({ createdAt: -1 })
        .limit(5),
    ]),

    // System health
    Promise.all([
      // Error logs in last 24 hours
      ActivityLog.countDocuments({
        severity: { $in: ['error', 'critical'] },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      
      // Unread notifications count
      Notification.countDocuments({
        recipient: user._id,
        status: 'unread',
      }),
      
      // System performance metrics
      ActivityLog.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfToday },
            'performance.duration': { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            avgResponseTime: { $avg: '$performance.duration' },
            maxResponseTime: { $max: '$performance.duration' },
            totalRequests: { $sum: 1 },
          },
        },
      ]),
    ]),

    // Top performers
    Promise.all([
      // Top donors (by donations)
      User.find({
        role: 'donor',
        totalDonations: { $gt: 0 },
      })
        .sort({ totalDonations: -1 })
        .limit(5)
        .select('name email avatar bloodGroup totalDonations lastDonationDate'),
      
      // Top volunteers (by resolved contacts)
      User.aggregate([
        {
          $match: {
            role: 'volunteer',
          },
        },
        {
          $lookup: {
            from: 'contacts',
            let: { volunteerId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$assignedTo', '$$volunteerId'] },
                      { $in: ['$status', ['resolved', 'closed']] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  resolvedCount: { $sum: 1 },
                },
              },
            ],
            as: 'contactStats',
          },
        },
        {
          $lookup: {
            from: 'donationrequests',
            let: { volunteerId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ['$$volunteerId', '$statusHistory.changedBy'] },
                      { $eq: ['$status', 'done'] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  donationCount: { $sum: 1 },
                },
              },
            ],
            as: 'donationStats',
          },
        },
        {
          $project: {
            name: 1,
            email: 1,
            avatar: 1,
            resolvedContacts: {
              $ifNull: [{ $arrayElemAt: ['$contactStats.resolvedCount', 0] }, 0],
            },
            completedDonations: {
              $ifNull: [{ $arrayElemAt: ['$donationStats.donationCount', 0] }, 0],
            },
            totalScore: {
              $add: [
                { $ifNull: [{ $arrayElemAt: ['$contactStats.resolvedCount', 0] }, 0] },
                { $multiply: [{ $ifNull: [{ $arrayElemAt: ['$donationStats.donationCount', 0] }, 0] }, 2] },
              ],
            },
          },
        },
        { $sort: { totalScore: -1 } },
        { $limit: 5 },
      ]),
    ]),
  ]);

  // Format the data
  const dashboard = {
    summary: {
      users: userStats[0].totals.length > 0 ? userStats[0].totals[0] : null,
      donations: donationStats[0].totals.length > 0 ? donationStats[0].totals[0] : null,
      funding: fundingStats[0].totals.length > 0 ? fundingStats[0].totals[0] : null,
      contacts: contactStats[0].totals.length > 0 ? contactStats[0].totals[0] : null,
    },
    today: {
      users: userStats[0].today.length > 0 ? userStats[0].today[0].count : 0,
      donations: donationStats[0].today.length > 0 ? donationStats[0].today[0].count : 0,
      funding: fundingStats[0].today.length > 0 ? fundingStats[0].today[0] : null,
      contacts: contactStats[0].today.length > 0 ? contactStats[0].today[0].count : 0,
    },
    analytics: {
      userGrowth: userStats[0].growth,
      bloodGroupDistribution: donationStats[0].byBloodGroup,
      locationDistribution: donationStats[0].byLocation,
      fundingByType: fundingStats[0].byType,
      contactByCategory: contactStats[0].byCategory,
      responseTime: contactStats[0].responseTime.length > 0 ? contactStats[0].responseTime[0] : null,
    },
    recentActivities,
    urgentTasks: {
      donations: urgentTasks[0],
      contacts: urgentTasks[1],
      fundings: urgentTasks[2],
      total: urgentTasks[0].length + urgentTasks[1].length + urgentTasks[2].length,
    },
    systemHealth: {
      errorsLast24h: systemHealth[0],
      unreadNotifications: systemHealth[1],
      performance: systemHealth[2].length > 0 ? systemHealth[2][0] : null,
    },
    topPerformers: {
      donors: topPerformers[0],
      volunteers: topPerformers[1],
    },
    weeklyStats: fundingStats[0].thisWeek.length > 0 ? fundingStats[0].thisWeek[0] : null,
    topFundingDonors: fundingStats[0].topDonors,
    quickActions: [
      { label: 'View All Users', url: '/dashboard/all-users', icon: '👥' },
      { label: 'Manage Donations', url: '/dashboard/all-blood-donation-request', icon: '🩸' },
      { label: 'View Contacts', url: '/dashboard/contacts', icon: '📧' },
      { label: 'Funding Stats', url: '/dashboard/funding', icon: '💰' },
      { label: 'System Logs', url: '/dashboard/logs', icon: '📊' },
      { label: 'Send Announcement', url: '/dashboard/announcements', icon: '📢' },
    ],
  };

  return dashboard;
}

// Helper: Get volunteer dashboard data
async function getVolunteerDashboard(user) {
  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

  const [
    assignedContacts,
    pendingRequests,
    urgentRequests,
    recentActivities,
    donorAvailability,
    volunteerStats,
    upcomingFollowUps,
  ] = await Promise.all([
    // Contacts assigned to volunteer
    Contact.find({
      assignedTo: user._id,
      status: { $in: ['new', 'in-progress', 'read'] },
    })
      .sort({ priority: -1, createdAt: -1 })
      .limit(5),

    // Pending donation requests in volunteer's area
    DonationRequest.find({
      isActive: true,
      status: 'pending',
      recipientDistrict: user.district,
      donationDate: { $gte: new Date() },
    })
      .populate('requester', 'name email')
      .sort({ urgency: -1, donationDate: 1 })
      .limit(5),

    // Urgent requests (all areas)
    DonationRequest.find({
      isActive: true,
      status: 'pending',
      urgency: { $in: ['high', 'critical'] },
      donationDate: { $gte: new Date() },
    })
      .sort({ urgency: -1, donationDate: 1 })
      .limit(3),

    // Volunteer's recent activities
    ActivityLog.find({
      user: user._id,
      category: { $in: ['donation', 'contact'] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('entityId'),

    // Donor availability in volunteer's area
    User.find({
      role: 'donor',
      status: 'active',
      district: user.district,
      isAvailable: true,
      $or: [
        { lastDonationDate: null },
        {
          lastDonationDate: {
            $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          },
        },
      ],
    })
      .select('name bloodGroup upazila lastDonationDate')
      .limit(5),

    // Volunteer statistics
    Promise.all([
      // Contacts resolved this week
      Contact.countDocuments({
        assignedTo: user._id,
        status: { $in: ['resolved', 'closed'] },
        updatedAt: { $gte: startOfWeek },
      }),
      
      // Donations helped complete this week
      DonationRequest.countDocuments({
        'statusHistory.changedBy': user._id,
        status: 'done',
        'statusHistory.changedAt': { $gte: startOfWeek },
      }),
      
      // Active assignments
      Contact.countDocuments({
        assignedTo: user._id,
        status: { $in: ['new', 'in-progress', 'read'] },
      }),
    ]),

    // Upcoming follow-ups
    Contact.find({
      assignedTo: user._id,
      followUpDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      status: { $in: ['in-progress', 'read'] },
    })
      .sort({ followUpDate: 1 })
      .limit(5),
  ]);

  const dashboard = {
    summary: {
      assignedContacts: volunteerStats[2],
      resolvedThisWeek: volunteerStats[0],
      donationsHelped: volunteerStats[1],
      completionRate: volunteerStats[0] + volunteerStats[1] > 0 
        ? Math.round(((volunteerStats[0] + volunteerStats[1]) / (volunteerStats[2] || 1)) * 100) 
        : 0,
    },
    tasks: {
      assignedContacts,
      pendingRequests,
      urgentRequests,
      upcomingFollowUps,
    },
    resources: {
      availableDonors: donorAvailability,
      totalAvailable: donorAvailability.length,
    },
    recentActivities,
    quickActions: [
      { label: 'View All Requests', url: '/dashboard/all-blood-donation-request', icon: '🔍' },
      { label: 'My Assignments', url: '/dashboard/assigned-contacts', icon: '📋' },
      { label: 'Find Donors', url: '/dashboard/search-donors', icon: '👥' },
      { label: 'Urgent Tasks', url: '/dashboard/urgent-tasks', icon: '🚨' },
      { label: 'Activity Log', url: '/dashboard/activity-log', icon: '📝' },
    ],
  };

  return dashboard;
}

// Helper: Get donor dashboard data
async function getDonorDashboard(user) {
  const today = new Date();
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

  const [
    recentRequests,
    myDonations,
    myFunding,
    eligibility,
    nearbyRequests,
    notifications,
    quickStats,
  ] = await Promise.all([
    // Donor's recent donation requests (max 3)
    DonationRequest.find({
      requester: user._id,
      isActive: true,
    })
      .sort({ donationDate: -1 })
      .limit(3)
      .select('recipientName recipientLocation donationDate donationTime bloodGroup status'),

    // Donor's donation history
    DonationRequest.find({
      donor: user._id,
      isActive: true,
      status: 'done',
    })
      .populate('requester', 'name')
      .sort({ donationDate: -1 })
      .limit(3)
      .select('recipientName donationDate bloodGroup hospitalName'),

    // Donor's funding history
    Funding.find({
      donor: user._id,
      status: 'succeeded',
    })
      .sort({ transactionDate: -1 })
      .limit(3)
      .select('amount currency transactionDate message'),

    // Donor eligibility
    (async () => {
      let isEligible = true;
      let message = 'You are eligible to donate';
      let nextEligibleDate = null;
      
      if (user.lastDonationDate) {
        const daysSinceLastDonation = Math.floor(
          (new Date() - new Date(user.lastDonationDate)) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceLastDonation < 90) {
          isEligible = false;
          nextEligibleDate = new Date(user.lastDonationDate);
          nextEligibleDate.setDate(nextEligibleDate.getDate() + 90);
          message = `You can donate again after ${nextEligibleDate.toLocaleDateString()}`;
        }
      }
      
      return {
        isEligible,
        message,
        lastDonationDate: user.lastDonationDate,
        nextEligibleDate,
        isAvailable: user.isAvailable,
      };
    })(),

    // Nearby donation requests matching donor's blood group
    DonationRequest.find({
      isActive: true,
      status: 'pending',
      bloodGroup: user.bloodGroup,
      recipientDistrict: user.district,
      donationDate: { $gte: new Date() },
    })
      .sort({ urgency: -1, donationDate: 1 })
      .limit(3)
      .select('recipientName hospitalName donationDate donationTime urgency'),

    // Recent notifications
    Notification.find({
      recipient: user._id,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title message type createdAt readAt'),

    // Quick statistics
    Promise.all([
      DonationRequest.countDocuments({ requester: user._id, isActive: true }),
      DonationRequest.countDocuments({ donor: user._id, status: 'done' }),
      Funding.countDocuments({ donor: user._id, status: 'succeeded' }),
      Notification.countDocuments({ recipient: user._id, status: 'unread' }),
    ]),
  ]);

  const dashboard = {
    welcome: {
      name: user.name,
      bloodGroup: user.bloodGroup,
      location: `${user.upazila}, ${user.district}`,
      memberSince: user.createdAt.toLocaleDateString(),
    },
    quickStats: {
      requestsMade: quickStats[0],
      donationsGiven: quickStats[1],
      fundsDonated: quickStats[2],
      unreadNotifications: quickStats[3],
    },
    eligibility,
    recentActivity: {
      myRequests: recentRequests,
      myDonations,
      myFunding,
    },
    opportunities: {
      nearbyRequests,
      hasOpportunities: nearbyRequests.length > 0,
    },
    notifications,
    quickActions: [
      { 
        label: 'Create Donation Request', 
        url: '/dashboard/create-donation-request', 
        icon: '🆕',
        disabled: user.status === 'blocked' 
      },
      { 
        label: 'View My Requests', 
        url: '/dashboard/my-donation-requests', 
        icon: '📋' 
      },
      { 
        label: 'Donation History', 
        url: '/dashboard/donation-history', 
        icon: '📊' 
      },
      { 
        label: 'Make a Donation', 
        url: '/dashboard/funding', 
        icon: '💰' 
      },
      { 
        label: 'Update Profile', 
        url: '/dashboard/profile', 
        icon: '👤' 
      },
      { 
        label: eligibility.isEligible ? 'Mark as Available' : 'Mark as Unavailable', 
        url: '/dashboard/toggle-availability', 
        icon: '🔄',
        action: 'toggleAvailability' 
      },
    ],
  };

  return dashboard;
}

// @desc    Get dashboard statistics for charts
// @route   GET /api/dashboard/stats/:type
// @access  Private
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const { type } = req.params;
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
      startDate = new Date(currentDate.setDate(currentDate.getDate() - 30));
      endDate = new Date();
  }

  let stats = {};

  switch (type) {
    case 'donations':
      stats = await getDonationStats(startDate, endDate, period);
      break;
    case 'users':
      stats = await getUserStats(startDate, endDate, period);
      break;
    case 'funding':
      stats = await getFundingStats(startDate, endDate, period);
      break;
    case 'contacts':
      stats = await getContactStats(startDate, endDate, period);
      break;
    default:
      return next(new ErrorResponse('Invalid stats type', 400));
  }

  res.status(200).json({
    success: true,
    period: {
      type: period,
      start: startDate,
      end: endDate,
    },
    data: stats,
  });
});

// Helper: Get donation statistics for charts
async function getDonationStats(startDate, endDate, period) {
  const groupFormat = period === 'day' ? '%Y-%m-%d' : 
                     period === 'week' ? '%Y-%U' : 
                     period === 'year' ? '%Y' : '%Y-%m';

  const stats = await DonationRequest.aggregate([
    {
      $match: {
        isActive: true,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          status: '$status',
          bloodGroup: '$bloodGroup',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        total: { $sum: '$count' },
        byStatus: {
          $push: {
            status: '$_id.status',
            count: '$count',
          },
        },
        byBloodGroup: {
          $push: {
            bloodGroup: '$_id.bloodGroup',
            count: '$count',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Format for charts
  const chartData = {
    timeline: stats.map(item => ({
      date: item._id,
      total: item.total,
      pending: item.byStatus.find(s => s.status === 'pending')?.count || 0,
      inprogress: item.byStatus.find(s => s.status === 'inprogress')?.count || 0,
      done: item.byStatus.find(s => s.status === 'done')?.count || 0,
      canceled: item.byStatus.find(s => s.status === 'canceled')?.count || 0,
    })),
    bloodGroups: stats.reduce((acc, item) => {
      item.byBloodGroup.forEach(bg => {
        if (!acc[bg.bloodGroup]) {
          acc[bg.bloodGroup] = 0;
        }
        acc[bg.bloodGroup] += bg.count;
      });
      return acc;
    }, {}),
  };

  return chartData;
}

// Helper: Get user statistics for charts
async function getUserStats(startDate, endDate, period) {
  const groupFormat = period === 'day' ? '%Y-%m-%d' : 
                     period === 'week' ? '%Y-%U' : 
                     period === 'year' ? '%Y' : '%Y-%m';

  const stats = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          role: '$role',
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        total: { $sum: '$count' },
        byRole: {
          $push: {
            role: '$_id.role',
            count: '$count',
          },
        },
        byStatus: {
          $push: {
            status: '$_id.status',
            count: '$count',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const chartData = {
    timeline: stats.map(item => ({
      date: item._id,
      total: item.total,
      donors: item.byRole.find(r => r.role === 'donor')?.count || 0,
      volunteers: item.byRole.find(r => r.role === 'volunteer')?.count || 0,
      admins: item.byRole.find(r => r.role === 'admin')?.count || 0,
      active: item.byStatus.find(s => s.status === 'active')?.count || 0,
      blocked: item.byStatus.find(s => s.status === 'blocked')?.count || 0,
    })),
    roleDistribution: stats.reduce((acc, item) => {
      item.byRole.forEach(role => {
        if (!acc[role.role]) {
          acc[role.role] = 0;
        }
        acc[role.role] += role.count;
      });
      return acc;
    }, {}),
    statusDistribution: stats.reduce((acc, item) => {
      item.byStatus.forEach(status => {
        if (!acc[status.status]) {
          acc[status.status] = 0;
        }
        acc[status.status] += status.count;
      });
      return acc;
    }, {}),
  };

  return chartData;
}

// Helper: Get funding statistics for charts
async function getFundingStats(startDate, endDate, period) {
  const groupFormat = period === 'day' ? '%Y-%m-%d' : 
                     period === 'week' ? '%Y-%U' : 
                     period === 'year' ? '%Y' : '%Y-%m';

  const stats = await Funding.aggregate([
    {
      $match: {
        status: 'succeeded',
        transactionDate: { $gte: startDate, $lte: endDate },
        $or: [
          { refund: { $exists: false } },
          { 'refund.amount': 0 },
        ],
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: groupFormat, date: '$transactionDate' } },
          donationType: '$donationType',
          isAnonymous: '$isAnonymous',
        },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        totalAmount: { $sum: '$amount' },
        totalCount: { $sum: '$count' },
        byType: {
          $push: {
            type: '$_id.donationType',
            amount: '$amount',
            count: '$count',
          },
        },
        anonymity: {
          $push: {
            isAnonymous: '$_id.isAnonymous',
            amount: '$amount',
            count: '$count',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const chartData = {
    timeline: stats.map(item => ({
      date: item._id,
      amount: item.totalAmount,
      count: item.totalCount,
      avgAmount: item.totalCount > 0 ? item.totalAmount / item.totalCount : 0,
    })),
    byType: stats.reduce((acc, item) => {
      item.byType.forEach(type => {
        if (!acc[type.type]) {
          acc[type.type] = { amount: 0, count: 0 };
        }
        acc[type.type].amount += type.amount;
        acc[type.type].count += type.count;
      });
      return acc;
    }, {}),
    anonymity: stats.reduce((acc, item) => {
      item.anonymity.forEach(anon => {
        const key = anon.isAnonymous ? 'anonymous' : 'named';
        if (!acc[key]) {
          acc[key] = { amount: 0, count: 0 };
        }
        acc[key].amount += anon.amount;
        acc[key].count += anon.count;
      });
      return acc;
    }, {}),
  };

  return chartData;
}

// Helper: Get contact statistics for charts
async function getContactStats(startDate, endDate, period) {
  const groupFormat = period === 'day' ? '%Y-%m-%d' : 
                     period === 'week' ? '%Y-%U' : 
                     period === 'year' ? '%Y' : '%Y-%m';

  const stats = await Contact.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          status: '$status',
          category: '$category',
          priority: '$priority',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        total: { $sum: '$count' },
        byStatus: {
          $push: {
            status: '$_id.status',
            count: '$count',
          },
        },
        byCategory: {
          $push: {
            category: '$_id.category',
            count: '$count',
          },
        },
        byPriority: {
          $push: {
            priority: '$_id.priority',
            count: '$count',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const chartData = {
    timeline: stats.map(item => ({
      date: item._id,
      total: item.total,
      new: item.byStatus.find(s => s.status === 'new')?.count || 0,
      inProgress: item.byStatus.find(s => s.status === 'in-progress')?.count || 0,
      resolved: item.byStatus.find(s => s.status === 'resolved')?.count || 0,
      closed: item.byStatus.find(s => s.status === 'closed')?.count || 0,
    })),
    byCategory: stats.reduce((acc, item) => {
      item.byCategory.forEach(cat => {
        if (!acc[cat.category]) {
          acc[cat.category] = 0;
        }
        acc[cat.category] += cat.count;
      });
      return acc;
    }, {}),
    byPriority: stats.reduce((acc, item) => {
      item.byPriority.forEach(pri => {
        if (!acc[pri.priority]) {
          acc[pri.priority] = 0;
        }
        acc[pri.priority] += pri.count;
      });
      return acc;
    }, {}),
  };

  return chartData;
}

// @desc    Get quick stats for dashboard cards
// @route   GET /api/dashboard/quick-stats
// @access  Private
exports.getQuickStats = asyncHandler(async (req, res, next) => {
  const user = req.user;
  let quickStats = {};

  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));

  if (user.role === 'admin') {
    const [
      totalUsers,
      pendingRequests,
      totalFunding,
      unreadContacts,
      todayUsers,
      todayRequests,
      todayFunding,
      todayContacts,
    ] = await Promise.all([
      User.countDocuments(),
      DonationRequest.countDocuments({ isActive: true, status: 'pending' }),
      Funding.aggregate([
        { $match: { status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Contact.countDocuments({ status: 'new' }),
      User.countDocuments({ createdAt: { $gte: startOfToday } }),
      DonationRequest.countDocuments({ isActive: true, status: 'pending', createdAt: { $gte: startOfToday } }),
      Funding.aggregate([
        { $match: { status: 'succeeded', transactionDate: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Contact.countDocuments({ status: 'new', createdAt: { $gte: startOfToday } }),
    ]);

    quickStats = {
      users: {
        total: totalUsers,
        today: todayUsers,
        icon: '👥',
        color: 'blue',
      },
      requests: {
        total: pendingRequests,
        today: todayRequests,
        icon: '🩸',
        color: 'red',
      },
      funding: {
        total: totalFunding.length > 0 ? totalFunding[0].total : 0,
        today: todayFunding.length > 0 ? todayFunding[0].total : 0,
        icon: '💰',
        color: 'green',
      },
      contacts: {
        total: unreadContacts,
        today: todayContacts,
        icon: '📧',
        color: 'purple',
      },
    };
  } else if (user.role === 'volunteer') {
    const [
      assignedContacts,
      pendingRequests,
      resolvedThisWeek,
      activeDonors,
    ] = await Promise.all([
      Contact.countDocuments({ assignedTo: user._id, status: { $in: ['new', 'in-progress', 'read'] } }),
      DonationRequest.countDocuments({ 
        isActive: true, 
        status: 'pending',
        recipientDistrict: user.district,
      }),
      Contact.countDocuments({ 
        assignedTo: user._id, 
        status: { $in: ['resolved', 'closed'] },
        updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      User.countDocuments({ 
        role: 'donor', 
        status: 'active',
        district: user.district,
        isAvailable: true,
      }),
    ]);

    quickStats = {
      assignments: {
        total: assignedContacts,
        icon: '📋',
        color: 'blue',
      },
      localRequests: {
        total: pendingRequests,
        icon: '🔍',
        color: 'red',
      },
      resolved: {
        total: resolvedThisWeek,
        icon: '✅',
        color: 'green',
      },
      availableDonors: {
        total: activeDonors,
        icon: '👥',
        color: 'purple',
      },
    };
  } else if (user.role === 'donor') {
    const [
      myRequests,
      myDonations,
      myFunding,
      nearbyRequests,
    ] = await Promise.all([
      DonationRequest.countDocuments({ requester: user._id, isActive: true }),
      DonationRequest.countDocuments({ donor: user._id, status: 'done' }),
      Funding.countDocuments({ donor: user._id, status: 'succeeded' }),
      DonationRequest.countDocuments({ 
        isActive: true, 
        status: 'pending',
        bloodGroup: user.bloodGroup,
        recipientDistrict: user.district,
        donationDate: { $gte: new Date() },
      }),
    ]);

    quickStats = {
      requests: {
        total: myRequests,
        icon: '📋',
        color: 'blue',
      },
      donations: {
        total: myDonations,
        icon: '🩸',
        color: 'red',
      },
      funding: {
        total: myFunding,
        icon: '💰',
        color: 'green',
      },
      opportunities: {
        total: nearbyRequests,
        icon: '🎯',
        color: 'purple',
      },
    };
  }

  res.status(200).json({
    success: true,
    data: quickStats,
  });
});

// @desc    Get recent activities for dashboard
// @route   GET /api/dashboard/recent-activities
// @access  Private
exports.getRecentActivities = asyncHandler(async (req, res, next) => {
  const user = req.user;
  const limit = parseInt(req.query.limit, 10) || 10;

  let filter = {};

  // Different activities based on role
  if (user.role === 'admin') {
    // Admin sees all activities
    filter = {};
  } else if (user.role === 'volunteer') {
    // Volunteer sees their activities and donation/contact activities
    filter = {
      $or: [
        { user: user._id },
        { category: { $in: ['donation', 'contact'] } },
      ],
    };
  } else {
    // Donor sees only their activities
    filter = { user: user._id };
  }

  const activities = await ActivityLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'name email avatar')
    .populate('entityId');

  res.status(200).json({
    success: true,
    count: activities.length,
    data: activities,
  });
});

// @desc    Get dashboard notifications
// @route   GET /api/dashboard/notifications
// @access  Private
exports.getDashboardNotifications = asyncHandler(async (req, res, next) => {
  const user = req.user;
  const limit = parseInt(req.query.limit, 10) || 10;

  const notifications = await Notification.find({
    recipient: user._id,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'name email avatar');

  // Mark as read if requested
  if (req.query.markAsRead === 'true') {
    await Notification.updateMany(
      { recipient: user._id, status: 'unread' },
      { status: 'read', readAt: new Date() }
    );
  }

  const unreadCount = await Notification.countDocuments({
    recipient: user._id,
    status: 'unread',
  });

  res.status(200).json({
    success: true,
    count: notifications.length,
    unreadCount,
    data: notifications,
  });
});