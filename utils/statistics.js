const mongoose = require('mongoose');
const User = require('../models/User');
const DonationRequest = require('../models/DonationRequest');
const Funding = require('../models/Funding');
const logger = require('./../middleware/loggerMiddleware').logger;

// Statistics utility functions
const statisticsUtils = {
    // Get overall statistics
    getOverallStats: async () => {
        try {
            const [
                totalUsers,
                totalDonors,
                totalVolunteers,
                totalAdmins,
                totalDonationRequests,
                pendingDonationRequests,
                completedDonationRequests,
                totalFunding,
                activeUsers,
                blockedUsers
            ] = await Promise.all([
                User.countDocuments(),
                User.countDocuments({ role: 'donor' }),
                User.countDocuments({ role: 'volunteer' }),
                User.countDocuments({ role: 'admin' }),
                DonationRequest.countDocuments(),
                DonationRequest.countDocuments({ status: 'pending' }),
                DonationRequest.countDocuments({ status: 'done' }),
                Funding.aggregate([
                    { $match: { status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]),
                User.countDocuments({ status: 'active' }),
                User.countDocuments({ status: 'blocked' })
            ]);

            const totalFundingAmount = totalFunding[0]?.total || 0;

            // Calculate growth (compared to previous month)
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            const [
                newUsersThisMonth,
                newDonationRequestsThisMonth,
                newFundingThisMonth
            ] = await Promise.all([
                User.countDocuments({ createdAt: { $gte: oneMonthAgo } }),
                DonationRequest.countDocuments({ createdAt: { $gte: oneMonthAgo } }),
                Funding.aggregate([
                    { 
                        $match: { 
                            status: 'completed',
                            createdAt: { $gte: oneMonthAgo }
                        } 
                    },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ])
            ]);

            const newFundingAmount = newFundingThisMonth[0]?.total || 0;

            return {
                success: true,
                data: {
                    users: {
                        total: totalUsers,
                        donors: totalDonors,
                        volunteers: totalVolunteers,
                        admins: totalAdmins,
                        active: activeUsers,
                        blocked: blockedUsers,
                        newThisMonth: newUsersThisMonth,
                        growthRate: totalUsers > 0 ? (newUsersThisMonth / totalUsers) * 100 : 0
                    },
                    donations: {
                        totalRequests: totalDonationRequests,
                        pending: pendingDonationRequests,
                        completed: completedDonationRequests,
                        completionRate: totalDonationRequests > 0 
                            ? (completedDonationRequests / totalDonationRequests) * 100 
                            : 0,
                        newThisMonth: newDonationRequestsThisMonth
                    },
                    funding: {
                        totalAmount: totalFundingAmount,
                        newThisMonth: newFundingAmount,
                        averageDonation: totalFundingAmount > 0 
                            ? totalFundingAmount / (totalFunding[0]?.count || 1) 
                            : 0
                    },
                    system: {
                        uptime: process.uptime(),
                        timestamp: new Date().toISOString()
                    }
                }
            };
        } catch (error) {
            logger.error(`Get overall stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get user statistics
    getUserStats: async (filters = {}) => {
        try {
            const query = {};
            
            // Apply filters
            if (filters.role) query.role = filters.role;
            if (filters.status) query.status = filters.status;
            if (filters.bloodGroup) query.bloodGroup = filters.bloodGroup;
            if (filters.district) query.district = filters.district;
            if (filters.dateFrom || filters.dateTo) {
                query.createdAt = {};
                if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
                if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
            }

            const [
                totalUsers,
                usersByRole,
                usersByStatus,
                usersByBloodGroup,
                usersByDistrict,
                newUsersToday,
                newUsersThisWeek,
                newUsersThisMonth,
                activeUsers,
                avgAccountAge
            ] = await Promise.all([
                User.countDocuments(query),
                User.aggregate([
                    { $match: query },
                    { $group: { _id: '$role', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]),
                User.aggregate([
                    { $match: query },
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]),
                User.aggregate([
                    { $match: query },
                    { $group: { _id: '$bloodGroup', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]),
                User.aggregate([
                    { $match: query },
                    { $group: { _id: '$district', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ]),
                User.countDocuments({
                    ...query,
                    createdAt: { 
                        $gte: new Date().setHours(0, 0, 0, 0) 
                    }
                }),
                User.countDocuments({
                    ...query,
                    createdAt: { 
                        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
                    }
                }),
                User.countDocuments({
                    ...query,
                    createdAt: { 
                        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) 
                    }
                }),
                User.countDocuments({
                    ...query,
                    status: 'active',
                    lastActivity: { 
                        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) 
                    }
                }),
                User.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: null,
                            avgAge: { 
                                $avg: { 
                                    $divide: [
                                        { $subtract: [new Date(), '$createdAt'] },
                                        1000 * 60 * 60 * 24 // Convert to days
                                    ]
                                }
                            }
                        }
                    }
                ])
            ]);

            // Calculate user growth
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            
            const usersOneMonthAgo = await User.countDocuments({
                ...query,
                createdAt: { $lt: oneMonthAgo }
            });

            const growthRate = usersOneMonthAgo > 0 
                ? ((totalUsers - usersOneMonthAgo) / usersOneMonthAgo) * 100 
                : totalUsers > 0 ? 100 : 0;

            return {
                success: true,
                data: {
                    total: totalUsers,
                    growth: {
                        rate: growthRate,
                        today: newUsersToday,
                        thisWeek: newUsersThisWeek,
                        thisMonth: newUsersThisMonth
                    },
                    distribution: {
                        byRole: usersByRole,
                        byStatus: usersByStatus,
                        byBloodGroup: usersByBloodGroup,
                        byDistrict: usersByDistrict
                    },
                    activity: {
                        active: activeUsers,
                        inactive: totalUsers - activeUsers,
                        activityRate: totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0
                    },
                    demographics: {
                        avgAccountAge: avgAccountAge[0]?.avgAge || 0,
                        topDistricts: usersByDistrict
                    }
                }
            };
        } catch (error) {
            logger.error(`Get user stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get donation statistics
    getDonationStats: async (filters = {}) => {
        try {
            const query = {};
            
            // Apply filters
            if (filters.status) query.status = filters.status;
            if (filters.bloodGroup) query.bloodGroup = filters.bloodGroup;
            if (filters.urgencyLevel) query.urgencyLevel = filters.urgencyLevel;
            if (filters.district) query.recipientDistrict = filters.district;
            if (filters.dateFrom || filters.dateTo) {
                query.createdAt = {};
                if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
                if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
            }
            if (filters.donationDateFrom || filters.donationDateTo) {
                query.donationDate = {};
                if (filters.donationDateFrom) query.donationDate.$gte = new Date(filters.donationDateFrom);
                if (filters.donationDateTo) query.donationDate.$lte = new Date(filters.donationDateTo);
            }

            const [
                totalRequests,
                requestsByStatus,
                requestsByBloodGroup,
                requestsByUrgency,
                requestsByDistrict,
                requestsByMonth,
                completedRequests,
                pendingRequests,
                avgResponseTime,
                avgCompletionTime,
                recentRequests
            ] = await Promise.all([
                DonationRequest.countDocuments(query),
                DonationRequest.aggregate([
                    { $match: query },
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]),
                DonationRequest.aggregate([
                    { $match: query },
                    { $group: { _id: '$bloodGroup', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]),
                DonationRequest.aggregate([
                    { $match: query },
                    { $group: { _id: '$urgencyLevel', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]),
                DonationRequest.aggregate([
                    { $match: query },
                    { $group: { _id: '$recipientDistrict', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ]),
                DonationRequest.aggregate([
                    { 
                        $match: { 
                            ...query,
                            createdAt: { 
                                $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) 
                            }
                        } 
                    },
                    {
                        $group: {
                            _id: { 
                                year: { $year: '$createdAt' },
                                month: { $month: '$createdAt' }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { '_id.year': 1, '_id.month': 1 } },
                    { $limit: 12 }
                ]),
                DonationRequest.countDocuments({ ...query, status: 'done' }),
                DonationRequest.countDocuments({ ...query, status: 'pending' }),
                DonationRequest.aggregate([
                    { 
                        $match: { 
                            ...query,
                            status: 'done',
                            createdAt: { $exists: true },
                            updatedAt: { $exists: true }
                        } 
                    },
                    {
                        $project: {
                            responseTime: {
                                $divide: [
                                    { $subtract: ['$updatedAt', '$createdAt'] },
                                    1000 * 60 // Convert to minutes
                                ]
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            avgResponseTime: { $avg: '$responseTime' }
                        }
                    }
                ]),
                DonationRequest.aggregate([
                    { 
                        $match: { 
                            ...query,
                            status: 'done',
                            donationDate: { $exists: true },
                            updatedAt: { $exists: true }
                        } 
                    },
                    {
                        $project: {
                            completionTime: {
                                $divide: [
                                    { $subtract: ['$updatedAt', '$donationDate'] },
                                    1000 * 60 * 60 // Convert to hours
                                ]
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            avgCompletionTime: { $avg: '$completionTime' }
                        }
                    }
                ]),
                DonationRequest.find(query)
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .populate('requester', 'name email')
                    .populate('donor', 'name email')
                    .lean()
            ]);

            // Calculate fulfillment rate
            const fulfillmentRate = totalRequests > 0 
                ? (completedRequests / totalRequests) * 100 
                : 0;

            // Calculate average response time
            const avgResponse = avgResponseTime[0]?.avgResponseTime || 0;
            const avgCompletion = avgCompletionTime[0]?.avgCompletionTime || 0;

            // Get top requesters
            const topRequesters = await DonationRequest.aggregate([
                { $match: query },
                { $group: { _id: '$requester', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: '$user' },
                {
                    $project: {
                        userId: '$_id',
                        name: '$user.name',
                        email: '$user.email',
                        requestCount: '$count'
                    }
                }
            ]);

            return {
                success: true,
                data: {
                    total: totalRequests,
                    status: {
                        completed: completedRequests,
                        pending: pendingRequests,
                        inprogress: totalRequests - completedRequests - pendingRequests,
                        fulfillmentRate: fulfillmentRate
                    },
                    distribution: {
                        byStatus: requestsByStatus,
                        byBloodGroup: requestsByBloodGroup,
                        byUrgency: requestsByUrgency,
                        byDistrict: requestsByDistrict,
                        byMonth: requestsByMonth
                    },
                    performance: {
                        avgResponseTime: avgResponse,
                        avgCompletionTime: avgCompletion,
                        responseEfficiency: avgResponse > 0 ? Math.min(100, (1440 / avgResponse) * 10) : 0 // 1440 minutes in a day
                    },
                    topRequesters,
                    recentRequests
                }
            };
        } catch (error) {
            logger.error(`Get donation stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get funding statistics
    getFundingStats: async (filters = {}) => {
        try {
            const query = { status: 'completed' };
            
            // Apply filters
            if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
            if (filters.dateFrom || filters.dateTo) {
                query.createdAt = {};
                if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
                if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
            }
            if (filters.minAmount || filters.maxAmount) {
                query.amount = {};
                if (filters.minAmount) query.amount.$gte = parseFloat(filters.minAmount);
                if (filters.maxAmount) query.amount.$lte = parseFloat(filters.maxAmount);
            }

            const [
                totalFunding,
                fundingByMethod,
                fundingByMonth,
                fundingByDonor,
                avgDonation,
                maxDonation,
                minDonation,
                recentDonations,
                totalDonors,
                recurringDonations
            ] = await Promise.all([
                Funding.aggregate([
                    { $match: query },
                    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
                ]),
                Funding.aggregate([
                    { $match: query },
                    { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
                    { $sort: { total: -1 } }
                ]),
                Funding.aggregate([
                    { 
                        $match: { 
                            ...query,
                            createdAt: { 
                                $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) 
                            }
                        } 
                    },
                    {
                        $group: {
                            _id: { 
                                year: { $year: '$createdAt' },
                                month: { $month: '$createdAt' }
                            },
                            total: { $sum: '$amount' },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { '_id.year': 1, '_id.month': 1 } },
                    { $limit: 12 }
                ]),
                Funding.aggregate([
                    { $match: query },
                    { $group: { _id: '$user', total: { $sum: '$amount' }, count: { $sum: 1 } } },
                    { $sort: { total: -1 } },
                    { $limit: 10 },
                    {
                        $lookup: {
                            from: 'users',
                            localField: '_id',
                            foreignField: '_id',
                            as: 'user'
                        }
                    },
                    { $unwind: '$user' },
                    {
                        $project: {
                            userId: '$_id',
                            name: '$user.name',
                            email: '$user.email',
                            totalAmount: '$total',
                            donationCount: '$count',
                            avgAmount: { $divide: ['$total', '$count'] }
                        }
                    }
                ]),
                Funding.aggregate([
                    { $match: query },
                    { $group: { _id: null, average: { $avg: '$amount' } } }
                ]),
                Funding.aggregate([
                    { $match: query },
                    { $group: { _id: null, maximum: { $max: '$amount' } } }
                ]),
                Funding.aggregate([
                    { $match: query },
                    { $group: { _id: null, minimum: { $min: '$amount' } } }
                ]),
                Funding.find(query)
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .populate('user', 'name email')
                    .lean(),
                Funding.distinct('user', query),
                Funding.countDocuments({ ...query, isRecurring: true })
            ]);

            const fundingData = totalFunding[0] || { total: 0, count: 0 };
            const avgDonationAmount = avgDonation[0]?.average || 0;
            const maxDonationAmount = maxDonation[0]?.maximum || 0;
            const minDonationAmount = minDonation[0]?.minimum || 0;

            // Calculate growth compared to previous period
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            const previousMonthFunding = await Funding.aggregate([
                { 
                    $match: { 
                        ...query,
                        createdAt: { $lt: oneMonthAgo }
                    } 
                },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);

            const previousTotal = previousMonthFunding[0]?.total || 0;
            const growthRate = previousTotal > 0 
                ? ((fundingData.total - previousTotal) / previousTotal) * 100 
                : fundingData.total > 0 ? 100 : 0;

            return {
                success: true,
                data: {
                    total: {
                        amount: fundingData.total,
                        count: fundingData.count,
                        growthRate: growthRate
                    },
                    distribution: {
                        byPaymentMethod: fundingByMethod,
                        byMonth: fundingByMonth
                    },
                    donors: {
                        total: totalDonors.length,
                        topDonors: fundingByDonor,
                        recurring: recurringDonations
                    },
                    amounts: {
                        average: avgDonationAmount,
                        maximum: maxDonationAmount,
                        minimum: minDonationAmount,
                        median: 0 // Would need to calculate
                    },
                    recent: recentDonations
                }
            };
        } catch (error) {
            logger.error(`Get funding stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get real-time statistics
    getRealTimeStats: async () => {
        try {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            const [
                newUsersLastHour,
                newDonationRequestsLastHour,
                newFundingLastHour,
                activeDonationsNow,
                onlineUsers,
                systemHealth
            ] = await Promise.all([
                User.countDocuments({ createdAt: { $gte: oneHourAgo } }),
                DonationRequest.countDocuments({ createdAt: { $gte: oneHourAgo } }),
                Funding.countDocuments({ createdAt: { $gte: oneHourAgo }, status: 'completed' }),
                DonationRequest.countDocuments({ 
                    status: 'inprogress',
                    donationDate: { $lte: now },
                    $or: [
                        { donationDate: { $gte: todayStart } },
                        { updatedAt: { $gte: oneHourAgo } }
                    ]
                }),
                User.countDocuments({ 
                    lastActivity: { $gte: oneHourAgo },
                    status: 'active'
                }),
                // System health would include database connection, memory usage, etc.
                Promise.resolve({
                    database: 'healthy',
                    api: 'healthy',
                    cache: 'healthy',
                    uptime: process.uptime()
                })
            ]);

            // Calculate requests per minute
            const requestsPerMinute = newDonationRequestsLastHour / 60;

            return {
                success: true,
                data: {
                    lastHour: {
                        newUsers: newUsersLastHour,
                        newDonationRequests: newDonationRequestsLastHour,
                        newFunding: newFundingLastHour,
                        requestsPerMinute: requestsPerMinute.toFixed(2)
                    },
                    current: {
                        activeDonations: activeDonationsNow,
                        onlineUsers: onlineUsers,
                        pendingRequests: await DonationRequest.countDocuments({ status: 'pending' })
                    },
                    system: systemHealth,
                    timestamp: now.toISOString()
                }
            };
        } catch (error) {
            logger.error(`Get real-time stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get geographic statistics
    getGeographicStats: async (metric = 'donors', level = 'district', limit = 20) => {
        try {
            let aggregationPipeline = [];
            
            switch (metric) {
                case 'donors':
                    aggregationPipeline = [
                        { $match: { role: 'donor', status: 'active' } },
                        { $group: { _id: `$${level}`, count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: limit }
                    ];
                    break;
                    
                case 'donations':
                    aggregationPipeline = [
                        { $match: { status: 'done' } },
                        { $group: { _id: `$recipient${level.charAt(0).toUpperCase() + level.slice(1)}`, count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: limit }
                    ];
                    break;
                    
                case 'requests':
                    aggregationPipeline = [
                        { $group: { _id: `$recipient${level.charAt(0).toUpperCase() + level.slice(1)}`, count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: limit }
                    ];
                    break;
                    
                case 'funding':
                    aggregationPipeline = [
                        { $match: { status: 'completed' } },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'user',
                                foreignField: '_id',
                                as: 'donor'
                            }
                        },
                        { $unwind: '$donor' },
                        { $group: { _id: `$donor.${level}`, total: { $sum: '$amount' }, count: { $sum: 1 } } },
                        { $sort: { total: -1 } },
                        { $limit: limit }
                    ];
                    break;
                    
                default:
                    aggregationPipeline = [
                        { $match: { role: 'donor', status: 'active' } },
                        { $group: { _id: `$${level}`, count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: limit }
                    ];
            }
            
            let model;
            switch (metric) {
                case 'donors':
                case 'funding':
                    model = metric === 'funding' ? Funding : User;
                    break;
                case 'donations':
                case 'requests':
                    model = DonationRequest;
                    break;
                default:
                    model = User;
            }
            
            const results = await model.aggregate(aggregationPipeline);
            
            // Calculate percentages
            const total = results.reduce((sum, item) => sum + (item.count || item.total || 0), 0);
            
            const dataWithPercentages = results.map(item => ({
                location: item._id || 'Unknown',
                count: item.count || 0,
                total: item.total || 0,
                percentage: total > 0 ? ((item.count || item.total || 0) / total) * 100 : 0
            }));
            
            return {
                success: true,
                data: {
                    metric,
                    level,
                    total: total,
                    locations: dataWithPercentages,
                    topLocation: dataWithPercentages[0] || null,
                    distribution: dataWithPercentages
                }
            };
        } catch (error) {
            logger.error(`Get geographic stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get blood group statistics
    getBloodGroupStats: async (metric = 'donors') => {
        try {
            let query = {};
            let groupField = 'bloodGroup';
            
            switch (metric) {
                case 'donors':
                    query = { role: 'donor', status: 'active' };
                    groupField = 'bloodGroup';
                    break;
                    
                case 'requests':
                    query = {};
                    groupField = 'bloodGroup';
                    break;
                    
                case 'donations':
                    query = { status: 'done' };
                    groupField = 'bloodGroup';
                    break;
                    
                default:
                    query = { role: 'donor', status: 'active' };
            }
            
            const model = metric === 'requests' || metric === 'donations' ? DonationRequest : User;
            
            const results = await model.aggregate([
                { $match: query },
                { $group: { _id: `$${groupField}`, count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
            
            // Fill in missing blood groups with 0
            const allBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
            const bloodGroupMap = {};
            
            results.forEach(item => {
                bloodGroupMap[item._id] = item.count;
            });
            
            const completeResults = allBloodGroups.map(group => ({
                bloodGroup: group,
                count: bloodGroupMap[group] || 0
            }));
            
            const total = completeResults.reduce((sum, item) => sum + item.count, 0);
            
            const dataWithPercentages = completeResults.map(item => ({
                ...item,
                percentage: total > 0 ? (item.count / total) * 100 : 0
            }));
            
            return {
                success: true,
                data: {
                    metric,
                    total,
                    bloodGroups: dataWithPercentages,
                    mostCommon: dataWithPercentages.reduce((max, curr) => curr.count > max.count ? curr : max, { count: 0 }),
                    leastCommon: dataWithPercentages.reduce((min, curr) => curr.count < min.count ? curr : min, { count: Infinity }),
                    compatibility: {
                        universalDonor: 'O-',
                        universalRecipient: 'AB+'
                    }
                }
            };
        } catch (error) {
            logger.error(`Get blood group stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get volunteer performance statistics
    getVolunteerPerformanceStats: async (period = '30days') => {
        try {
            const dateFilter = new Date();
            switch (period) {
                case '7days':
                    dateFilter.setDate(dateFilter.getDate() - 7);
                    break;
                case '30days':
                    dateFilter.setDate(dateFilter.getDate() - 30);
                    break;
                case '90days':
                    dateFilter.setDate(dateFilter.getDate() - 90);
                    break;
                default:
                    dateFilter.setDate(dateFilter.getDate() - 30);
            }
            
            // Get volunteers and their activities
            const volunteers = await User.find({ 
                role: 'volunteer', 
                status: 'active',
                createdAt: { $lte: dateFilter }
            }).lean();
            
            const performanceData = [];
            
            for (const volunteer of volunteers) {
                // Get volunteer's assigned tasks/completed tasks
                const assignedTasks = await DonationRequest.countDocuments({
                    $or: [
                        { assignedTo: volunteer._id },
                        { updatedBy: volunteer._id }
                    ],
                    updatedAt: { $gte: dateFilter }
                });
                
                const completedTasks = await DonationRequest.countDocuments({
                    $or: [
                        { assignedTo: volunteer._id },
                        { updatedBy: volunteer._id }
                    ],
                    status: 'done',
                    updatedAt: { $gte: dateFilter }
                });
                
                // Calculate response time (average time to update after assignment)
                const responseTimes = await DonationRequest.aggregate([
                    {
                        $match: {
                            assignedTo: volunteer._id,
                            assignedAt: { $exists: true },
                            updatedAt: { $exists: true },
                            updatedAt: { $gte: dateFilter }
                        }
                    },
                    {
                        $project: {
                            responseTime: {
                                $divide: [
                                    { $subtract: ['$updatedAt', '$assignedAt'] },
                                    1000 * 60 // Convert to minutes
                                ]
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            avgResponseTime: { $avg: '$responseTime' }
                        }
                    }
                ]);
                
                const avgResponseTime = responseTimes[0]?.avgResponseTime || 0;
                
                // Calculate completion rate
                const completionRate = assignedTasks > 0 ? (completedTasks / assignedTasks) * 100 : 0;
                
                // Get user ratings (if implemented)
                const userRating = 4.5; // This would come from a ratings system
                
                performanceData.push({
                    volunteer: {
                        _id: volunteer._id,
                        name: volunteer.name,
                        email: volunteer.email,
                        joinDate: volunteer.createdAt
                    },
                    metrics: {
                        assignedTasks,
                        completedTasks,
                        completionRate,
                        avgResponseTime,
                        userRating,
                        daysActive: Math.floor((new Date() - new Date(volunteer.createdAt)) / (1000 * 60 * 60 * 24))
                    },
                    score: completionRate * 0.4 + (100 - Math.min(avgResponseTime, 100)) * 0.3 + (userRating * 20) * 0.3
                });
            }
            
            // Sort by performance score
            performanceData.sort((a, b) => b.score - a.score);
            
            return {
                success: true,
                data: {
                    period,
                    totalVolunteers: performanceData.length,
                    performance: performanceData,
                    summary: {
                        avgCompletionRate: performanceData.reduce((sum, v) => sum + v.metrics.completionRate, 0) / performanceData.length,
                        avgResponseTime: performanceData.reduce((sum, v) => sum + v.metrics.avgResponseTime, 0) / performanceData.length,
                        topPerformer: performanceData[0] || null,
                        needsImprovement: performanceData[performanceData.length - 1] || null
                    }
                }
            };
        } catch (error) {
            logger.error(`Get volunteer performance stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get dashboard summary statistics
    getDashboardSummary: async (userRole = 'donor', userId = null) => {
        try {
            let summary = {};
            
            switch (userRole) {
                case 'donor':
                    if (!userId) {
                        throw new Error('User ID is required for donor dashboard');
                    }
                    
                    const [
                        donorRequests,
                        donorDonations,
                        donorStats,
                        recentActivity
                    ] = await Promise.all([
                        DonationRequest.countDocuments({ requester: userId }),
                        DonationRequest.countDocuments({ donor: userId, status: 'done' }),
                        DonationRequest.aggregate([
                            { $match: { requester: userId } },
                            {
                                $group: {
                                    _id: '$status',
                                    count: { $sum: 1 },
                                    totalUnits: { $sum: '$requiredUnits' }
                                }
                            }
                        ]),
                        DonationRequest.find({ 
                            $or: [
                                { requester: userId },
                                { donor: userId }
                            ]
                        })
                        .sort({ updatedAt: -1 })
                        .limit(5)
                        .populate('requester', 'name')
                        .populate('donor', 'name')
                        .lean()
                    ]);
                    
                    const statusStats = {};
                    donorStats.forEach(stat => {
                        statusStats[stat._id] = {
                            count: stat.count,
                            units: stat.totalUnits
                        };
                    });
                    
                    summary = {
                        role: 'donor',
                        requests: donorRequests,
                        donations: donorDonations,
                        status: statusStats,
                        recentActivity,
                        nextDonationEligibility: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days from now
                    };
                    break;
                    
                case 'volunteer':
                    const [
                        volunteerAssignments,
                        volunteerCompleted,
                        pendingRequests,
                        urgentRequests
                    ] = await Promise.all([
                        DonationRequest.countDocuments({ assignedTo: userId }),
                        DonationRequest.countDocuments({ 
                            assignedTo: userId, 
                            status: 'done' 
                        }),
                        DonationRequest.countDocuments({ status: 'pending' }),
                        DonationRequest.countDocuments({ 
                            status: 'pending',
                            urgencyLevel: 'critical'
                        })
                    ]);
                    
                    summary = {
                        role: 'volunteer',
                        assignments: volunteerAssignments,
                        completed: volunteerCompleted,
                        completionRate: volunteerAssignments > 0 
                            ? (volunteerCompleted / volunteerAssignments) * 100 
                            : 0,
                        pendingRequests,
                        urgentRequests,
                        efficiency: volunteerCompleted > 0 
                            ? Math.min(100, (volunteerCompleted / 30) * 10) // Max 3 per day for perfect score
                            : 0
                    };
                    break;
                    
                case 'admin':
                    const overallStats = await statisticsUtils.getOverallStats();
                    
                    summary = {
                        role: 'admin',
                        ...overallStats.data,
                        system: {
                            uptime: process.uptime(),
                            memoryUsage: process.memoryUsage(),
                            activeConnections: 0 // Would need to track
                        }
                    };
                    break;
                    
                default:
                    throw new Error(`Unsupported role: ${userRole}`);
            }
            
            return {
                success: true,
                data: summary
            };
        } catch (error) {
            logger.error(`Get dashboard summary error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

module.exports = statisticsUtils;