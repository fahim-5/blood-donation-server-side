// server/src/controllers/analyticsController.js
const User = require('../models/User');
const DonationRequest = require('../models/DonationRequest');
const Funding = require('../models/Funding');
const Contact = require('../models/Contact');
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get comprehensive analytics
// @route   GET /api/analytics/comprehensive
// @access  Private/Admin
exports.getComprehensiveAnalytics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, groupBy = 'month' } = req.query;
  
  // Set date range
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  // Determine date format for grouping
  let dateFormat;
  switch (groupBy) {
    case 'day':
      dateFormat = '%Y-%m-%d';
      break;
    case 'week':
      dateFormat = '%Y-%U';
      break;
    case 'year':
      dateFormat = '%Y';
      break;
    default: // month
      dateFormat = '%Y-%m';
  }

  // Execute all analytics queries in parallel
  const [
    userAnalytics,
    donationAnalytics,
    fundingAnalytics,
    contactAnalytics,
    systemAnalytics,
    conversionAnalytics,
    geographicAnalytics,
    performanceAnalytics,
  ] = await Promise.all([
    // User Analytics
    getUserAnalytics(dateFilter, dateFormat),
    
    // Donation Analytics
    getDonationAnalytics(dateFilter, dateFormat),
    
    // Funding Analytics
    getFundingAnalytics(dateFilter, dateFormat),
    
    // Contact Analytics
    getContactAnalytics(dateFilter, dateFormat),
    
    // System Analytics
    getSystemAnalytics(dateFilter),
    
    // Conversion Analytics
    getConversionAnalytics(dateFilter),
    
    // Geographic Analytics
    getGeographicAnalytics(dateFilter),
    
    // Performance Analytics
    getPerformanceAnalytics(dateFilter),
  ]);

  const analytics = {
    period: {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      groupBy,
    },
    summary: {
      totalUsers: userAnalytics.summary.total,
      totalDonations: donationAnalytics.summary.total,
      totalFunding: fundingAnalytics.summary.totalAmount,
      totalContacts: contactAnalytics.summary.total,
      systemHealth: systemAnalytics.healthScore,
      conversionRate: conversionAnalytics.overall.donorConversion,
    },
    userAnalytics,
    donationAnalytics,
    fundingAnalytics,
    contactAnalytics,
    systemAnalytics,
    conversionAnalytics,
    geographicAnalytics,
    performanceAnalytics,
    insights: generateInsights({
      userAnalytics,
      donationAnalytics,
      fundingAnalytics,
      contactAnalytics,
      conversionAnalytics,
      performanceAnalytics,
    }),
  };

  // Log analytics access
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Accessed Comprehensive Analytics',
    actionType: 'read',
    category: 'analytics',
    description: 'Accessed comprehensive analytics dashboard',
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: analytics,
  });
});

// Helper: Get user analytics
async function getUserAnalytics(dateFilter, dateFormat) {
  const matchStage = dateFilter.$gte || dateFilter.$lte ? { createdAt: dateFilter } : {};

  const analytics = await User.aggregate([
    { $match: matchStage },
    {
      $facet: {
        // Summary statistics
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              donors: { $sum: { $cond: [{ $eq: ['$role', 'donor'] }, 1, 0] } },
              volunteers: { $sum: { $cond: [{ $eq: ['$role', 'volunteer'] }, 1, 0] } },
              admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
              active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
              blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
              available: { $sum: { $cond: [{ $eq: ['$isAvailable', true] }, 1, 0] } },
              avgDonations: { $avg: '$totalDonations' },
            },
          },
        ],
        
        // Growth over time
        growth: [
          {
            $group: {
              _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
              count: { $sum: 1 },
              donors: { $sum: { $cond: [{ $eq: ['$role', 'donor'] }, 1, 0] } },
              volunteers: { $sum: { $cond: [{ $eq: ['$role', 'volunteer'] }, 1, 0] } },
              admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],
        
        // Blood group distribution
        bloodGroups: [
          {
            $match: { bloodGroup: { $ne: null } },
          },
          {
            $group: {
              _id: '$bloodGroup',
              count: { $sum: 1 },
              active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
              available: { $sum: { $cond: [{ $eq: ['$isAvailable', true] }, 1, 0] } },
              avgDonations: { $avg: '$totalDonations' },
            },
          },
          { $sort: { count: -1 } },
        ],
        
        // Location distribution
        locations: [
          {
            $group: {
              _id: {
                district: '$district',
                upazila: '$upazila',
              },
              count: { $sum: 1 },
              donors: { $sum: { $cond: [{ $eq: ['$role', 'donor'] }, 1, 0] } },
              volunteers: { $sum: { $cond: [{ $eq: ['$role', 'volunteer'] }, 1, 0] } },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ],
        
        // Donor activity levels
        donorActivity: [
          {
            $match: { role: 'donor' },
          },
          {
            $bucket: {
              groupBy: '$totalDonations',
              boundaries: [0, 1, 3, 5, 10, 20, 50, 100],
              default: '100+',
              output: {
                count: { $sum: 1 },
                avgLastDonationDays: {
                  $avg: {
                    $cond: [
                      { $eq: ['$lastDonationDate', null] },
                      null,
                      {
                        $divide: [
                          { $subtract: [new Date(), '$lastDonationDate'] },
                          1000 * 60 * 60 * 24,
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
        
        // Registration sources (if available)
        registrationTrends: [
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
        ],
      },
    },
  ]);

  return {
    summary: analytics[0].summary.length > 0 ? analytics[0].summary[0] : {},
    growth: analytics[0].growth,
    bloodGroups: analytics[0].bloodGroups,
    locations: analytics[0].locations,
    donorActivity: analytics[0].donorActivity,
    registrationTrends: analytics[0].registrationTrends,
  };
}

// Helper: Get donation analytics
async function getDonationAnalytics(dateFilter, dateFormat) {
  const matchStage = { isActive: true };
  if (dateFilter.$gte || dateFilter.$lte) {
    matchStage.createdAt = dateFilter;
  }

  const analytics = await DonationRequest.aggregate([
    { $match: matchStage },
    {
      $facet: {
        // Summary statistics
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
              inProgress: { $sum: { $cond: [{ $eq: ['$status', 'inprogress'] }, 1, 0] } },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
              canceled: { $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] } },
              urgent: { $sum: { $cond: [{ $in: ['$urgency', ['high', 'critical']] }, 1, 0] } },
              avgCompletionTime: {
                $avg: {
                  $cond: [
                    { $eq: ['$status', 'done'] },
                    {
                      $divide: [
                        { $subtract: [{ $arrayElemAt: ['$statusHistory.changedAt', -1] }, '$createdAt'] },
                        1000 * 60 * 60, // hours
                      ],
                    },
                    null,
                  ],
                },
              },
            },
          },
        ],
        
        // Timeline trends
        timeline: [
          {
            $group: {
              _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
              count: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
              urgent: { $sum: { $cond: [{ $in: ['$urgency', ['high', 'critical']] }, 1, 0] } },
              avgUnits: { $avg: '$unitsRequired' },
            },
          },
          { $sort: { _id: 1 } },
        ],
        
        // Blood group analysis
        bloodGroupAnalysis: [
          {
            $group: {
              _id: '$bloodGroup',
              count: { $sum: 1 },
              pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
              completionRate: {
                $avg: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] },
              },
              avgCompletionTime: {
                $avg: {
                  $cond: [
                    { $eq: ['$status', 'done'] },
                    {
                      $divide: [
                        { $subtract: [{ $arrayElemAt: ['$statusHistory.changedAt', -1] }, '$createdAt'] },
                        1000 * 60 * 60,
                      ],
                    },
                    null,
                  ],
                },
              },
            },
          },
          { $sort: { count: -1 } },
        ],
        
        // Location analysis
        locationAnalysis: [
          {
            $group: {
              _id: {
                district: '$recipientDistrict',
                upazila: '$recipientUpazila',
              },
              count: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
              completionRate: {
                $avg: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] },
              },
              bloodGroups: { $addToSet: '$bloodGroup' },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 15 },
        ],
        
        // Hospital analysis
        hospitalAnalysis: [
          {
            $group: {
              _id: '$hospitalName',
              count: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
              avgCompletionTime: {
                $avg: {
                  $cond: [
                    { $eq: ['$status', 'done'] },
                    {
                      $divide: [
                        { $subtract: [{ $arrayElemAt: ['$statusHistory.changedAt', -1] }, '$createdAt'] },
                        1000 * 60 * 60,
                      ],
                    },
                    null,
                  ],
                },
              },
              topBloodGroups: {
                $push: {
                  bloodGroup: '$bloodGroup',
                  count: 1,
                },
              },
            },
          },
          {
            $project: {
              _id: 1,
              count: 1,
              completed: 1,
              completionRate: { $divide: ['$completed', '$count'] },
              avgCompletionTime: 1,
              topBloodGroups: {
                $slice: [
                  {
                    $reduce: {
                      input: '$topBloodGroups',
                      initialValue: [],
                      in: {
                        $concatArrays: [
                          '$$value',
                          {
                            $cond: [
                              {
                                $in: ['$$this.bloodGroup', '$$value.bloodGroup'],
                              },
                              [],
                              ['$$this'],
                            ],
                          },
                        ],
                      },
                    },
                  },
                  5,
                ],
              },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        
        // Time-to-completion analysis
        completionAnalysis: [
          {
            $match: {
              status: 'done',
              'statusHistory.1': { $exists: true },
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
              bloodGroup: 1,
              urgency: 1,
            },
          },
          {
            $project: {
              completionHours: {
                $divide: [
                  { $subtract: ['$completedAt.changedAt', '$createdAt'] },
                  1000 * 60 * 60,
                ],
              },
              bloodGroup: 1,
              urgency: 1,
            },
          },
          {
            $bucket: {
              groupBy: '$completionHours',
              boundaries: [0, 1, 6, 12, 24, 48, 72, 168, 336, 720],
              default: '720+',
              output: {
                count: { $sum: 1 },
                avgUrgency: { $avg: { $indexOfArray: [['low', 'medium', 'high', 'critical'], '$urgency'] } },
                bloodGroups: { $addToSet: '$bloodGroup' },
              },
            },
          },
        ],
      },
    },
  ]);

  return {
    summary: analytics[0].summary.length > 0 ? analytics[0].summary[0] : {},
    timeline: analytics[0].timeline,
    bloodGroupAnalysis: analytics[0].bloodGroupAnalysis,
    locationAnalysis: analytics[0].locationAnalysis,
    hospitalAnalysis: analytics[0].hospitalAnalysis,
    completionAnalysis: analytics[0].completionAnalysis,
  };
}

// Helper: Get funding analytics
async function getFundingAnalytics(dateFilter, dateFormat) {
  const matchStage = {
    status: 'succeeded',
    $or: [
      { refund: { $exists: false } },
      { 'refund.amount': 0 },
    ],
  };
  
  if (dateFilter.$gte || dateFilter.$lte) {
    matchStage.transactionDate = dateFilter;
  }

  const analytics = await Funding.aggregate([
    { $match: matchStage },
    {
      $facet: {
        // Summary statistics
        summary: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amount' },
              totalDonations: { $sum: 1 },
              avgAmount: { $avg: '$amount' },
              maxAmount: { $max: '$amount' },
              minAmount: { $min: '$amount' },
              anonymousCount: { $sum: { $cond: [{ $eq: ['$isAnonymous', true] }, 1, 0] } },
              anonymousAmount: { $sum: { $cond: [{ $eq: ['$isAnonymous', true] }, '$amount', 0] } },
            },
          },
        ],
        
        // Timeline trends
        timeline: [
          {
            $group: {
              _id: { $dateToString: { format: dateFormat, date: '$transactionDate' } },
              amount: { $sum: '$amount' },
              count: { $sum: 1 },
              avgAmount: { $avg: '$amount' },
            },
          },
          { $sort: { _id: 1 } },
        ],
        
        // Donation type analysis
        typeAnalysis: [
          {
            $group: {
              _id: '$donationType',
              amount: { $sum: '$amount' },
              count: { $sum: 1 },
              avgAmount: { $avg: '$amount' },
              anonymousCount: { $sum: { $cond: [{ $eq: ['$isAnonymous', true] }, 1, 0] } },
            },
          },
          { $sort: { amount: -1 } },
        ],
        
        // Payment method analysis
        paymentAnalysis: [
          {
            $group: {
              _id: '$paymentMethod',
              amount: { $sum: '$amount' },
              count: { $sum: 1 },
              avgAmount: { $avg: '$amount' },
            },
          },
          { $sort: { amount: -1 } },
        ],
        
        // Donor segmentation
        donorSegmentation: [
          {
            $match: { isAnonymous: false },
          },
          {
            $bucket: {
              groupBy: '$amount',
              boundaries: [10, 100, 500, 1000, 5000, 10000, 50000, 100000],
              default: '100000+',
              output: {
                count: { $sum: 1 },
                totalAmount: { $sum: '$amount' },
                donors: { $addToSet: '$donor' },
              },
            },
          },
        ],
        
        // Top donors
        topDonors: [
          {
            $match: { isAnonymous: false },
          },
          {
            $group: {
              _id: '$donor',
              donorName: { $first: '$donorName' },
              amount: { $sum: '$amount' },
              count: { $sum: 1 },
              firstDonation: { $min: '$transactionDate' },
              lastDonation: { $max: '$transactionDate' },
              avgAmount: { $avg: '$amount' },
            },
          },
          { $sort: { amount: -1 } },
          { $limit: 20 },
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
              donorId: '$_id',
              donorName: 1,
              amount: 1,
              count: 1,
              avgAmount: 1,
              firstDonation: 1,
              lastDonation: 1,
              avatar: '$userDetails.avatar',
              bloodGroup: '$userDetails.bloodGroup',
              location: {
                $concat: ['$userDetails.upazila', ', ', '$userDetails.district'],
              },
              totalDonations: '$userDetails.totalDonations',
            },
          },
        ],
        
        // Monthly recurring patterns
        monthlyPatterns: [
          {
            $group: {
              _id: {
                month: { $month: '$transactionDate' },
                dayOfMonth: { $dayOfMonth: '$transactionDate' },
              },
              amount: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
          {
            $group: {
              _id: '$_id.month',
              dailyPatterns: {
                $push: {
                  day: '$_id.dayOfMonth',
                  amount: '$amount',
                  count: '$count',
                },
              },
              totalAmount: { $sum: '$amount' },
              totalCount: { $sum: '$count' },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  return {
    summary: analytics[0].summary.length > 0 ? analytics[0].summary[0] : {},
    timeline: analytics[0].timeline,
    typeAnalysis: analytics[0].typeAnalysis,
    paymentAnalysis: analytics[0].paymentAnalysis,
    donorSegmentation: analytics[0].donorSegmentation,
    topDonors: analytics[0].topDonors,
    monthlyPatterns: analytics[0].monthlyPatterns,
  };
}

// Helper: Get contact analytics
async function getContactAnalytics(dateFilter, dateFormat) {
  const matchStage = {};
  if (dateFilter.$gte || dateFilter.$lte) {
    matchStage.createdAt = dateFilter;
  }

  const analytics = await Contact.aggregate([
    { $match: matchStage },
    {
      $facet: {
        // Summary statistics
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
              inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
              resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
              closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
              spam: { $sum: { $cond: [{ $eq: ['$status', 'spam'] }, 1, 0] } },
              urgent: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } },
              avgResponseTime: {
                $avg: {
                  $cond: [
                    { $and: [{ $in: ['$status', ['resolved', 'closed']] }, { $gt: [{ $size: '$responses' }, 0] }] },
                    {
                      $divide: [
                        { $subtract: [{ $arrayElemAt: ['$responses.sentAt', 0] }, '$createdAt'] },
                        1000 * 60 * 60,
                      ],
                    },
                    null,
                  ],
                },
              },
            },
          },
        ],
        
        // Timeline trends
        timeline: [
          {
            $group: {
              _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
              count: { $sum: 1 },
              resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
              avgResponseTime: {
                $avg: {
                  $cond: [
                    { $and: [{ $in: ['$status', ['resolved', 'closed']] }, { $gt: [{ $size: '$responses' }, 0] }] },
                    {
                      $divide: [
                        { $subtract: [{ $arrayElemAt: ['$responses.sentAt', 0] }, '$createdAt'] },
                        1000 * 60 * 60,
                      ],
                    },
                    null,
                  ],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ],
        
        // Category analysis
        categoryAnalysis: [
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 },
              resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
              avgResponseTime: {
                $avg: {
                  $cond: [
                    { $and: [{ $in: ['$status', ['resolved', 'closed']] }, { $gt: [{ $size: '$responses' }, 0] }] },
                    {
                      $divide: [
                        { $subtract: [{ $arrayElemAt: ['$responses.sentAt', 0] }, '$createdAt'] },
                        1000 * 60 * 60,
                      ],
                    },
                    null,
                  ],
                },
              },
              topSubjects: {
                $push: {
                  subject: '$subject',
                  count: 1,
                },
              },
            },
          },
          {
            $project: {
              _id: 1,
              count: 1,
              resolved: 1,
              resolutionRate: { $divide: ['$resolved', '$count'] },
              avgResponseTime: 1,
              topSubjects: {
                $slice: [
                  {
                    $reduce: {
                      input: '$topSubjects',
                      initialValue: [],
                      in: {
                        $concatArrays: [
                          '$$value',
                          {
                            $cond: [
                              {
                                $in: ['$$this.subject', '$$value.subject'],
                              },
                              [],
                              ['$$this'],
                            ],
                          },
                        ],
                      },
                    },
                  },
                  5,
                ],
              },
            },
          },
          { $sort: { count: -1 } },
        ],
        
        // Priority analysis
        priorityAnalysis: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 },
              avgResponseTime: {
                $avg: {
                  $cond: [
                    { $and: [{ $in: ['$status', ['resolved', 'closed']] }, { $gt: [{ $size: '$responses' }, 0] }] },
                    {
                      $divide: [
                        { $subtract: [{ $arrayElemAt: ['$responses.sentAt', 0] }, '$createdAt'] },
                        1000 * 60 * 60,
                      ],
                    },
                    null,
                  ],
                },
              },
              resolutionRate: {
                $avg: { $cond: [{ $in: ['$status', ['resolved', 'closed']] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: -1 } },
        ],
        
        // Response time distribution
        responseTimeDistribution: [
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
              category: 1,
              priority: 1,
            },
          },
          {
            $bucket: {
              groupBy: '$responseHours',
              boundaries: [0, 1, 6, 12, 24, 48, 72, 168],
              default: '168+',
              output: {
                count: { $sum: 1 },
                categories: { $addToSet: '$category' },
                avgPriority: { $avg: { $indexOfArray: [['low', 'medium', 'high', 'urgent'], '$priority'] } },
              },
            },
          },
        ],
        
        // Top responders
        topResponders: [
          {
            $unwind: '$responses',
          },
          {
            $group: {
              _id: '$responses.responder',
              responseCount: { $sum: 1 },
              avgResponseTime: {
                $avg: {
                  $divide: [
                    { $subtract: ['$responses.sentAt', '$createdAt'] },
                    1000 * 60 * 60,
                  ],
                },
              },
              categories: { $addToSet: '$category' },
            },
          },
          { $sort: { responseCount: -1 } },
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
              responderId: '$_id',
              responderName: '$userDetails.name',
              responderRole: '$userDetails.role',
              responseCount: 1,
              avgResponseTime: 1,
              categories: 1,
              avatar: '$userDetails.avatar',
            },
          },
        ],
      },
    },
  ]);

  return {
    summary: analytics[0].summary.length > 0 ? analytics[0].summary[0] : {},
    timeline: analytics[0].timeline,
    categoryAnalysis: analytics[0].categoryAnalysis,
    priorityAnalysis: analytics[0].priorityAnalysis,
    responseTimeDistribution: analytics[0].responseTimeDistribution,
    topResponders: analytics[0].topResponders,
  };
}

// Helper: Get system analytics
async function getSystemAnalytics(dateFilter) {
  const matchStage = {};
  if (dateFilter.$gte || dateFilter.$lte) {
    matchStage.createdAt = dateFilter;
  }

  const analytics = await ActivityLog.aggregate([
    { $match: matchStage },
    {
      $facet: {
        // System performance
        performance: [
          {
            $match: { 'performance.duration': { $gt: 0 } },
          },
          {
            $group: {
              _id: null,
              avgResponseTime: { $avg: '$performance.duration' },
              maxResponseTime: { $max: '$performance.duration' },
              minResponseTime: { $min: '$performance.duration' },
              p95ResponseTime: {
                $percentile: {
                  input: '$performance.duration',
                  p: [0.95],
                  method: 'approximate',
                },
              },
              totalRequests: { $sum: 1 },
            },
          },
        ],
        
        // Error analysis
        errorAnalysis: [
          {
            $match: {
              severity: { $in: ['error', 'critical'] },
            },
          },
          {
            $group: {
              _id: {
                actionType: '$actionType',
                category: '$category',
              },
              count: { $sum: 1 },
              lastOccurrence: { $max: '$createdAt' },
              users: { $addToSet: '$user' },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ],
        
        // User activity patterns
        userActivity: [
          {
            $match: { user: { $ne: null } },
          },
          {
            $group: {
              _id: '$user',
              activityCount: { $sum: 1 },
              lastActivity: { $max: '$createdAt' },
              categories: { $addToSet: '$category' },
              errorCount: {
                $sum: { $cond: [{ $in: ['$severity', ['error', 'critical']] }, 1, 0] },
              },
            },
          },
          { $sort: { activityCount: -1 } },
          { $limit: 20 },
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
              userRole: '$userDetails.role',
              activityCount: 1,
              lastActivity: 1,
              errorCount: 1,
              errorRate: { $divide: ['$errorCount', '$activityCount'] },
              categories: 1,
              avatar: '$userDetails.avatar',
            },
          },
        ],
        
        // Peak usage times
        peakUsage: [
          {
            $group: {
              _id: {
                hour: { $hour: '$createdAt' },
                dayOfWeek: { $dayOfWeek: '$createdAt' },
              },
              count: { $sum: 1 },
              avgResponseTime: { $avg: '$performance.duration' },
            },
          },
          {
            $group: {
              _id: '$_id.hour',
              count: { $sum: '$count' },
              avgCountPerDay: { $avg: '$count' },
              avgResponseTime: { $avg: '$avgResponseTime' },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  // Calculate system health score
  const performance = analytics[0].performance.length > 0 ? analytics[0].performance[0] : {};
  const errorCount = analytics[0].errorAnalysis.reduce((sum, error) => sum + error.count, 0);
  const totalRequests = performance.totalRequests || 1;
  
  const healthScore = {
    performance: performance.avgResponseTime < 1000 ? 100 : Math.max(0, 100 - (performance.avgResponseTime / 100)),
    errorRate: Math.max(0, 100 - (errorCount / totalRequests * 10000)),
    availability: 100, // Assuming 100% uptime for now
    overall: 0,
  };
  
  healthScore.overall = (healthScore.performance + healthScore.errorRate + healthScore.availability) / 3;

  return {
    performance,
    errorAnalysis: analytics[0].errorAnalysis,
    userActivity: analytics[0].userActivity,
    peakUsage: analytics[0].peakUsage,
    healthScore,
  };
}

// Helper: Get conversion analytics
async function getConversionAnalytics(dateFilter) {
  const matchStage = {};
  if (dateFilter.$gte || dateFilter.$lte) {
    matchStage.createdAt = dateFilter;
  }

  const [
    donorStats,
    requestStats,
    fundingStats,
    userJourney,
  ] = await Promise.all([
    // Donor conversion rate
    User.aggregate([
      {
        $match: {
          role: 'donor',
          ...matchStage,
        },
      },
      {
        $group: {
          _id: null,
          totalDonors: { $sum: 1 },
          activeDonors: {
            $sum: {
              $cond: [
                { $or: [
                  { $gt: ['$totalDonations', 0] },
                  { $gt: [{ $ifNull: ['$lastDonationDate', null] }, null] },
                ]},
                1,
                0,
              ],
            },
          },
          availableDonors: {
            $sum: { $cond: [{ $eq: ['$isAvailable', true] }, 1, 0] },
          },
        },
      },
    ]),

    // Request completion rate
    DonationRequest.aggregate([
      {
        $match: {
          isActive: true,
          ...matchStage,
        },
      },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          completedRequests: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          avgCompletionTime: {
            $avg: {
              $cond: [
                { $eq: ['$status', 'done'] },
                {
                  $divide: [
                    { $subtract: [{ $arrayElemAt: ['$statusHistory.changedAt', -1] }, '$createdAt'] },
                    1000 * 60 * 60,
                  ],
                },
                null,
              ],
            },
          },
        },
      },
    ]),

    // Funding conversion rate
    Funding.aggregate([
      {
        $match: {
          ...matchStage,
        },
      },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          successfulPayments: { $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, 1, 0] } },
          failedPayments: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          refundedPayments: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
          avgAmount: { $avg: '$amount' },
        },
      },
    ]),

    // User journey analysis
    User.aggregate([
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: 'donationrequests',
          localField: '_id',
          foreignField: 'requester',
          as: 'requests',
        },
      },
      {
        $lookup: {
          from: 'donationrequests',
          localField: '_id',
          foreignField: 'donor',
          as: 'donations',
        },
      },
      {
        $lookup: {
          from: 'fundings',
          localField: '_id',
          foreignField: 'donor',
          as: 'fundings',
        },
      },
      {
        $project: {
          role: 1,
          createdAt: 1,
          hasMadeRequest: { $gt: [{ $size: '$requests' }, 0] },
          hasDonated: { $gt: [{ $size: '$donations' }, 0] },
          hasFunded: { $gt: [{ $size: '$fundings' }, 0] },
          daysToFirstRequest: {
            $cond: [
              { $gt: [{ $size: '$requests' }, 0] },
              {
                $divide: [
                  { $subtract: [{ $min: '$requests.createdAt' }, '$createdAt'] },
                  1000 * 60 * 60 * 24,
                ],
              },
              null,
            ],
          },
          daysToFirstDonation: {
            $cond: [
              { $gt: [{ $size: '$donations' }, 0] },
              {
                $divide: [
                  { $subtract: [{ $min: '$donations.createdAt' }, '$createdAt'] },
                  1000 * 60 * 60 * 24,
                ],
              },
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          avgDaysToFirstRequest: { $avg: '$daysToFirstRequest' },
          avgDaysToFirstDonation: { $avg: '$daysToFirstDonation' },
          requestRate: { $avg: { $cond: [{ $eq: ['$hasMadeRequest', true] }, 1, 0] } },
          donationRate: { $avg: { $cond: [{ $eq: ['$hasDonated', true] }, 1, 0] } },
          fundingRate: { $avg: { $cond: [{ $eq: ['$hasFunded', true] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const donorConversion = donorStats.length > 0 ? donorStats[0] : {};
  const requestConversion = requestStats.length > 0 ? requestStats[0] : {};
  const fundingConversion = fundingStats.length > 0 ? fundingStats[0] : {};

  return {
    donorConversion: {
      totalDonors: donorConversion.totalDonors || 0,
      activeDonors: donorConversion.activeDonors || 0,
      availableDonors: donorConversion.availableDonors || 0,
      activationRate: donorConversion.totalDonors > 0 
        ? (donorConversion.activeDonors / donorConversion.totalDonors) * 100 
        : 0,
      availabilityRate: donorConversion.activeDonors > 0 
        ? (donorConversion.availableDonors / donorConversion.activeDonors) * 100 
        : 0,
    },
    requestConversion: {
      totalRequests: requestConversion.totalRequests || 0,
      completedRequests: requestConversion.completedRequests || 0,
      completionRate: requestConversion.totalRequests > 0 
        ? (requestConversion.completedRequests / requestConversion.totalRequests) * 100 
        : 0,
      avgCompletionTime: requestConversion.avgCompletionTime || 0,
    },
    fundingConversion: {
      totalPayments: fundingConversion.totalPayments || 0,
      successfulPayments: fundingConversion.successfulPayments || 0,
      successRate: fundingConversion.totalPayments > 0 
        ? (fundingConversion.successfulPayments / fundingConversion.totalPayments) * 100 
        : 0,
      refundRate: fundingConversion.successfulPayments > 0 
        ? (fundingConversion.refundedPayments / fundingConversion.successfulPayments) * 100 
        : 0,
      avgAmount: fundingConversion.avgAmount || 0,
    },
    userJourney,
    overall: {
      donorConversion: donorConversion.totalDonors > 0 
        ? (donorConversion.activeDonors / donorConversion.totalDonors) * 100 
        : 0,
      requestCompletion: requestConversion.totalRequests > 0 
        ? (requestConversion.completedRequests / requestConversion.totalRequests) * 100 
        : 0,
      paymentSuccess: fundingConversion.totalPayments > 0 
        ? (fundingConversion.successfulPayments / fundingConversion.totalPayments) * 100 
        : 0,
    },
  };
}

// Helper: Get geographic analytics
async function getGeographicAnalytics(dateFilter) {
  const matchStage = {};
  if (dateFilter.$gte || dateFilter.$lte) {
    matchStage.createdAt = dateFilter;
  }

  const [
    userDistribution,
    donationDistribution,
    requestDistribution,
    fundingDistribution,
  ] = await Promise.all([
    // User geographic distribution
    User.aggregate([
      { $match: { ...matchStage, district: { $ne: null } } },
      {
        $group: {
          _id: '$district',
          userCount: { $sum: 1 },
          donorCount: { $sum: { $cond: [{ $eq: ['$role', 'donor'] }, 1, 0] } },
          volunteerCount: { $sum: { $cond: [{ $eq: ['$role', 'volunteer'] }, 1, 0] } },
          adminCount: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
          upazilas: { $addToSet: '$upazila' },
        },
      },
      { $sort: { userCount: -1 } },
    ]),

    // Donation geographic distribution
    DonationRequest.aggregate([
      { 
        $match: { 
          isActive: true, 
          status: 'done',
          recipientDistrict: { $ne: null },
          ...matchStage,
        } 
      },
      {
        $group: {
          _id: '$recipientDistrict',
          donationCount: { $sum: 1 },
          bloodGroups: { $addToSet: '$bloodGroup' },
          hospitals: { $addToSet: '$hospitalName' },
          upazilas: { $addToSet: '$recipientUpazila' },
        },
      },
      { $sort: { donationCount: -1 } },
    ]),

    // Request geographic distribution
    DonationRequest.aggregate([
      { 
        $match: { 
          isActive: true,
          status: 'pending',
          recipientDistrict: { $ne: null },
          ...matchStage,
        } 
      },
      {
        $group: {
          _id: '$recipientDistrict',
          requestCount: { $sum: 1 },
          urgentCount: { $sum: { $cond: [{ $in: ['$urgency', ['high', 'critical']] }, 1, 0] } },
          bloodGroups: { $addToSet: '$bloodGroup' },
          upazilas: { $addToSet: '$recipientUpazila' },
        },
      },
      { $sort: { requestCount: -1 } },
    ]),

    // Funding geographic distribution
    Funding.aggregate([
      { 
        $match: { 
          status: 'succeeded',
          ...matchStage,
        } 
      },
      {
        $lookup: {
          from: 'users',
          localField: 'donor',
          foreignField: '_id',
          as: 'donorInfo',
        },
      },
      {
        $unwind: '$donorInfo',
      },
      {
        $match: {
          'donorInfo.district': { $ne: null },
        },
      },
      {
        $group: {
          _id: '$donorInfo.district',
          fundingAmount: { $sum: '$amount' },
          donationCount: { $sum: 1 },
          donors: { $addToSet: '$donor' },
          avgAmount: { $avg: '$amount' },
        },
      },
      { $sort: { fundingAmount: -1 } },
    ]),
  ]);

  return {
    userDistribution,
    donationDistribution,
    requestDistribution,
    fundingDistribution,
    heatmapData: generateHeatmapData(userDistribution, donationDistribution, requestDistribution),
  };
}

// Helper: Get performance analytics
async function getPerformanceAnalytics(dateFilter) {
  const matchStage = {};
  if (dateFilter.$gte || dateFilter.$lte) {
    matchStage.createdAt = dateFilter;
  }

  const analytics = await ActivityLog.aggregate([
    { $match: { ...matchStage, 'performance.duration': { $gt: 0 } } },
    {
      $facet: {
        // API endpoint performance
        endpointPerformance: [
          {
            $match: { 'request.endpoint': { $ne: null } },
          },
          {
            $group: {
              _id: '$request.endpoint',
              count: { $sum: 1 },
              avgDuration: { $avg: '$performance.duration' },
              p95Duration: {
                $percentile: {
                  input: '$performance.duration',
                  p: [0.95],
                  method: 'approximate',
                },
              },
              maxDuration: { $max: '$performance.duration' },
              errorCount: {
                $sum: { $cond: [{ $in: ['$severity', ['error', 'critical']] }, 1, 0] },
              },
              successRate: {
                $avg: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
              },
            },
          },
          { $sort: { avgDuration: -1 } },
          { $limit: 20 },
        ],
        
        // User role performance
        rolePerformance: [
          {
            $lookup: {
              from: 'users',
              localField: 'user',
              foreignField: '_id',
              as: 'userInfo',
            },
          },
          {
            $unwind: '$userInfo',
          },
          {
            $group: {
              _id: '$userInfo.role',
              count: { $sum: 1 },
              avgDuration: { $avg: '$performance.duration' },
              errorRate: {
                $avg: { $cond: [{ $in: ['$severity', ['error', 'critical']] }, 1, 0] },
              },
              successRate: {
                $avg: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
              },
            },
          },
        ],
        
        // Time-based performance
        timePerformance: [
          {
            $group: {
              _id: {
                hour: { $hour: '$createdAt' },
                dayOfWeek: { $dayOfWeek: '$createdAt' },
              },
              count: { $sum: 1 },
              avgDuration: { $avg: '$performance.duration' },
              errorRate: {
                $avg: { $cond: [{ $in: ['$severity', ['error', 'critical']] }, 1, 0] },
              },
            },
          },
          {
            $group: {
              _id: '$_id.hour',
              count: { $sum: '$count' },
              avgDuration: { $avg: '$avgDuration' },
              avgErrorRate: { $avg: '$errorRate' },
            },
          },
          { $sort: { _id: 1 } },
        ],
        
        // Resource usage
        resourceUsage: [
          {
            $match: {
              'performance.memoryUsage': { $gt: 0 },
              'performance.cpuUsage': { $gt: 0 },
            },
          },
          {
            $group: {
              _id: null,
              avgMemoryUsage: { $avg: '$performance.memoryUsage' },
              maxMemoryUsage: { $max: '$performance.memoryUsage' },
              avgCpuUsage: { $avg: '$performance.cpuUsage' },
              maxCpuUsage: { $max: '$performance.cpuUsage' },
            },
          },
        ],
      },
    },
  ]);

  return {
    endpointPerformance: analytics[0].endpointPerformance,
    rolePerformance: analytics[0].rolePerformance,
    timePerformance: analytics[0].timePerformance,
    resourceUsage: analytics[0].resourceUsage.length > 0 ? analytics[0].resourceUsage[0] : {},
  };
}

// Helper: Generate insights from analytics data
function generateInsights(analytics) {
  const insights = [];

  // User insights
  const userSummary = analytics.userAnalytics.summary;
  if (userSummary) {
    if (userSummary.blocked > 0) {
      insights.push({
        type: 'warning',
        title: 'Blocked Users',
        message: `${userSummary.blocked} users are currently blocked. Consider reviewing their status.`,
        priority: 'medium',
      });
    }
    
    const activationRate = (userSummary.active / userSummary.total) * 100;
    if (activationRate < 50) {
      insights.push({
        type: 'warning',
        title: 'Low User Activation',
        message: `Only ${activationRate.toFixed(1)}% of users are active. Consider re-engagement campaigns.`,
        priority: 'high',
      });
    }
  }

  // Donation insights
  const donationSummary = analytics.donationAnalytics.summary;
  if (donationSummary) {
    const completionRate = (donationSummary.completed / donationSummary.total) * 100;
    if (completionRate < 30) {
      insights.push({
        type: 'warning',
        title: 'Low Donation Completion',
        message: `Only ${completionRate.toFixed(1)}% of donation requests are completed. Consider improving donor matching.`,
        priority: 'high',
      });
    }
    
    if (donationSummary.urgent > 5) {
      insights.push({
        type: 'alert',
        title: 'High Urgent Requests',
        message: `${donationSummary.urgent} urgent donation requests need immediate attention.`,
        priority: 'critical',
      });
    }
  }

  // Funding insights
  const fundingSummary = analytics.fundingAnalytics.summary;
  if (fundingSummary) {
    const anonymousPercentage = (fundingSummary.anonymousCount / fundingSummary.totalDonations) * 100;
    if (anonymousPercentage > 50) {
      insights.push({
        type: 'info',
        title: 'High Anonymous Donations',
        message: `${anonymousPercentage.toFixed(1)}% of donations are anonymous. Consider adding incentives for named donations.`,
        priority: 'low',
      });
    }
  }

  // Conversion insights
  const conversionOverall = analytics.conversionAnalytics.overall;
  if (conversionOverall) {
    if (conversionOverall.donorConversion < 20) {
      insights.push({
        type: 'warning',
        title: 'Low Donor Conversion',
        message: `Only ${conversionOverall.donorConversion.toFixed(1)}% of donors are active. Consider activation campaigns.`,
        priority: 'high',
      });
    }
    
    if (conversionOverall.requestCompletion < 40) {
      insights.push({
        type: 'warning',
        title: 'Low Request Completion',
        message: `Only ${conversionOverall.requestCompletion.toFixed(1)}% of requests are completed. Consider improving response times.`,
        priority: 'medium',
      });
    }
  }

  // Performance insights
  const performance = analytics.performanceAnalytics.endpointPerformance;
  if (performance && performance.length > 0) {
    const slowEndpoints = performance.filter(ep => ep.avgDuration > 1000);
    if (slowEndpoints.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Slow API Endpoints',
        message: `${slowEndpoints.length} endpoints have average response times over 1 second. Consider optimization.`,
        priority: 'medium',
      });
    }
    
    const highErrorEndpoints = performance.filter(ep => ep.errorCount > 10);
    if (highErrorEndpoints.length > 0) {
      insights.push({
        type: 'error',
        title: 'High Error Endpoints',
        message: `${highErrorEndpoints.length} endpoints have high error rates. Consider debugging and fixing.`,
        priority: 'high',
      });
    }
  }

  // Add positive insights
  if (donationSummary && donationSummary.completed > 100) {
    insights.push({
      type: 'success',
      title: 'Donation Milestone',
      message: `Over ${donationSummary.completed} donations completed successfully!`,
      priority: 'low',
    });
  }
  
  if (fundingSummary && fundingSummary.totalAmount > 100000) {
    insights.push({
      type: 'success',
      title: 'Funding Milestone',
      message: `Over ${(fundingSummary.totalAmount / 1000).toFixed(0)}K BDT raised for blood donation!`,
      priority: 'low',
    });
  }

  return insights;
}

// Helper: Generate heatmap data for geographic visualization
function generateHeatmapData(userDist, donationDist, requestDist) {
  const heatmap = {};
  
  // Combine all districts
  const allDistricts = new Set([
    ...userDist.map(d => d._id),
    ...donationDist.map(d => d._id),
    ...requestDist.map(d => d._id),
  ]);
  
  allDistricts.forEach(district => {
    const userData = userDist.find(d => d._id === district);
    const donationData = donationDist.find(d => d._id === district);
    const requestData = requestDist.find(d => d._id === district);
    
    heatmap[district] = {
      users: userData ? userData.userCount : 0,
      donors: userData ? userData.donorCount : 0,
      donations: donationData ? donationData.donationCount : 0,
      requests: requestData ? requestData.requestCount : 0,
      urgentRequests: requestData ? requestData.urgentCount : 0,
      score: calculateDistrictScore(userData, donationData, requestData),
    };
  });
  
  return heatmap;
}

// Helper: Calculate district score for heatmap
function calculateDistrictScore(userData, donationData, requestData) {
  let score = 0;
  
  if (userData) {
    score += userData.donorCount * 2;
    score += userData.volunteerCount * 3;
  }
  
  if (donationData) {
    score += donationData.donationCount * 5;
  }
  
  if (requestData) {
    score -= requestData.requestCount * 1;
    score -= requestData.urgentCount * 3;
  }
  
  return Math.max(0, score);
}

// @desc    Export analytics data
// @route   POST /api/analytics/export
// @access  Private/Admin
exports.exportAnalytics = asyncHandler(async (req, res, next) => {
  const { reportType, format = 'json', startDate, endDate } = req.body;

  if (!reportType) {
    return next(new ErrorResponse('Report type is required', 400));
  }

  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  let data;
  let fileName;

  switch (reportType) {
    case 'user-growth':
      data = await getUserGrowthReport(dateFilter);
      fileName = `user_growth_report_${new Date().toISOString().split('T')[0]}`;
      break;

    case 'donation-performance':
      data = await getDonationPerformanceReport(dateFilter);
      fileName = `donation_performance_report_${new Date().toISOString().split('T')[0]}`;
      break;

    case 'funding-analysis':
      data = await getFundingAnalysisReport(dateFilter);
      fileName = `funding_analysis_report_${new Date().toISOString().split('T')[0]}`;
      break;

    case 'system-performance':
      data = await getSystemPerformanceReport(dateFilter);
      fileName = `system_performance_report_${new Date().toISOString().split('T')[0]}`;
      break;

    case 'comprehensive':
      const analytics = await exports.getComprehensiveAnalytics(req, res, next);
      if (analytics.success === false) {
        return next(new ErrorResponse('Failed to generate comprehensive analytics', 500));
      }
      data = analytics.data;
      fileName = `comprehensive_analytics_report_${new Date().toISOString().split('T')[0]}`;
      break;

    default:
      return next(new ErrorResponse('Invalid report type', 400));
  }

  // Log export activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Exported Analytics Report',
    actionType: 'read',
    category: 'analytics',
    description: `Exported ${reportType} analytics report`,
    details: `Format: ${format}, Date range: ${startDate || 'Beginning'} to ${endDate || 'Now'}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (format === 'csv') {
    // Convert to CSV
    const { Parser } = require('json2csv');
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(Array.isArray(data) ? data : [data]);

    res.header('Content-Type', 'text/csv');
    res.attachment(`${fileName}.csv`);
    return res.send(csv);
  }

  // Default: Return JSON
  res.status(200).json({
    success: true,
    reportType,
    format,
    exportedAt: new Date(),
    data,
  });
});

// Helper: Get user growth report
async function getUserGrowthReport(dateFilter) {
  const report = await User.aggregate([
    {
      $match: dateFilter.$gte || dateFilter.$lte ? { createdAt: dateFilter } : {},
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        },
        total: { $sum: 1 },
        donors: { $sum: { $cond: [{ $eq: ['$role', 'donor'] }, 1, 0] } },
        volunteers: { $sum: { $cond: [{ $eq: ['$role', 'volunteer'] }, 1, 0] } },
        admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
      },
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day',
          },
        },
        total: 1,
        donors: 1,
        volunteers: 1,
        admins: 1,
        active: 1,
        activationRate: { $divide: ['$active', '$total'] },
      },
    },
    { $sort: { date: 1 } },
  ]);

  return report;
}

// Helper: Get donation performance report
async function getDonationPerformanceReport(dateFilter) {
  const report = await DonationRequest.aggregate([
    {
      $match: {
        isActive: true,
        ...(dateFilter.$gte || dateFilter.$lte ? { createdAt: dateFilter } : {}),
      },
    },
    {
      $group: {
        _id: {
          bloodGroup: '$bloodGroup',
          district: '$recipientDistrict',
          status: '$status',
        },
        count: { $sum: 1 },
        avgCompletionTime: {
          $avg: {
            $cond: [
              { $eq: ['$status', 'done'] },
              {
                $divide: [
                  { $subtract: [{ $arrayElemAt: ['$statusHistory.changedAt', -1] }, '$createdAt'] },
                  1000 * 60 * 60,
                ],
              },
              null,
            ],
          },
        },
        avgUnits: { $avg: '$unitsRequired' },
      },
    },
    {
      $group: {
        _id: {
          bloodGroup: '$_id.bloodGroup',
          district: '$_id.district',
        },
        total: { $sum: '$count' },
        completed: {
          $sum: { $cond: [{ $eq: ['$_id.status', 'done'] }, '$count', 0] },
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$_id.status', 'pending'] }, '$count', 0] },
        },
        avgCompletionTime: { $avg: '$avgCompletionTime' },
        avgUnits: { $avg: '$avgUnits' },
      },
    },
    {
      $project: {
        bloodGroup: '$_id.bloodGroup',
        district: '$_id.district',
        total: 1,
        completed: 1,
        pending: 1,
        completionRate: { $divide: ['$completed', '$total'] },
        avgCompletionTime: 1,
        avgUnits: 1,
      },
    },
    { $sort: { total: -1 } },
  ]);

  return report;
}

// Helper: Get funding analysis report
async function getFundingAnalysisReport(dateFilter) {
  const report = await Funding.aggregate([
    {
      $match: {
        status: 'succeeded',
        ...(dateFilter.$gte || dateFilter.$lte ? { transactionDate: dateFilter } : {}),
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'donor',
        foreignField: '_id',
        as: 'donorInfo',
      },
    },
    {
      $unwind: '$donorInfo',
    },
    {
      $group: {
        _id: {
          donationType: '$donationType',
          district: '$donorInfo.district',
          month: { $month: '$transactionDate' },
          year: { $year: '$transactionDate' },
        },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
        donors: { $addToSet: '$donor' },
        anonymousCount: { $sum: { $cond: [{ $eq: ['$isAnonymous', true] }, 1, 0] } },
      },
    },
    {
      $project: {
        donationType: '$_id.donationType',
        district: '$_id.district',
        month: '$_id.month',
        year: '$_id.year',
        amount: 1,
        count: 1,
        uniqueDonors: { $size: '$donors' },
        anonymousCount: 1,
        anonymousPercentage: { $divide: ['$anonymousCount', '$count'] },
        avgAmount: { $divide: ['$amount', '$count'] },
      },
    },
    { $sort: { year: 1, month: 1, amount: -1 } },
  ]);

  return report;
}

// Helper: Get system performance report
async function getSystemPerformanceReport(dateFilter) {
  const report = await ActivityLog.aggregate([
    {
      $match: {
        'performance.duration': { $gt: 0 },
        ...(dateFilter.$gte || dateFilter.$lte ? { createdAt: dateFilter } : {}),
      },
    },
    {
      $group: {
        _id: {
          endpoint: '$request.endpoint',
          hour: { $hour: '$createdAt' },
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$performance.duration' },
        p95Duration: {
          $percentile: {
            input: '$performance.duration',
            p: [0.95],
            method: 'approximate',
          },
        },
        errorCount: {
          $sum: { $cond: [{ $in: ['$severity', ['error', 'critical']] }, 1, 0] },
        },
        avgMemory: { $avg: '$performance.memoryUsage' },
        avgCpu: { $avg: '$performance.cpuUsage' },
      },
    },
    {
      $group: {
        _id: '$_id.endpoint',
        totalRequests: { $sum: '$count' },
        avgDuration: { $avg: '$avgDuration' },
        p95Duration: { $avg: '$p95Duration' },
        errorRate: { $avg: { $divide: ['$errorCount', '$count'] } },
        peakHour: {
          $max: {
            hour: '$_id.hour',
            count: '$count',
          },
        },
        avgMemory: { $avg: '$avgMemory' },
        avgCpu: { $avg: '$avgCpu' },
      },
    },
    {
      $project: {
        endpoint: '$_id',
        totalRequests: 1,
        avgDuration: 1,
        p95Duration: 1,
        errorRate: { $multiply: ['$errorRate', 100] },
        peakHour: '$peakHour.hour',
        requestsAtPeak: '$peakHour.count',
        avgMemoryMB: { $divide: ['$avgMemory', 1024 * 1024] },
        avgCpuPercent: '$avgCpu',
      },
    },
    { $sort: { avgDuration: -1 } },
  ]);

  return report;
}