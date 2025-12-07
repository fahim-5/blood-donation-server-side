// server/src/controllers/volunteerController.js
const DonationRequest = require('../models/DonationRequest');
const User = require('../models/User');
const Contact = require('../models/Contact');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get volunteer dashboard statistics
// @route   GET /api/volunteer/dashboard-stats
// @access  Private/Volunteer
exports.getVolunteerDashboard = asyncHandler(async (req, res, next) => {
  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

  // Get volunteer-specific statistics
  const [
    pendingRequests,
    urgentRequests,
    requestsToday,
    requestsThisWeek,
    totalRequestsManaged,
    completedRequests,
    recentActivities,
    assignedContacts,
    activeDonors,
  ] = await Promise.all([
    // Pending donation requests
    DonationRequest.countDocuments({
      isActive: true,
      status: 'pending',
    }),

    // Urgent requests
    DonationRequest.countDocuments({
      isActive: true,
      status: 'pending',
      urgency: { $in: ['high', 'critical'] },
    }),

    // Today's requests
    DonationRequest.countDocuments({
      isActive: true,
      createdAt: { $gte: startOfToday },
    }),

    // This week's requests
    DonationRequest.countDocuments({
      isActive: true,
      createdAt: { $gte: startOfWeek },
    }),

    // Requests managed by this volunteer (status changed by them)
    DonationRequest.countDocuments({
      'statusHistory.changedBy': req.user.id,
    }),

    // Requests completed this week
    DonationRequest.countDocuments({
      isActive: true,
      status: 'done',
      'statusHistory': {
        $elemMatch: {
          status: 'done',
          changedBy: req.user.id,
        },
      },
    }),

    // Recent activities by this volunteer
    ActivityLog.find({
      user: req.user.id,
      category: 'donation',
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('action description createdAt'),

    // Contacts assigned to this volunteer
    Contact.countDocuments({
      assignedTo: req.user.id,
      status: { $in: ['new', 'in-progress'] },
    }),

    // Active donors in volunteer's area
    User.countDocuments({
      role: 'donor',
      status: 'active',
      isAvailable: true,
      district: req.user.district, // Same district as volunteer
    }),
  ]);

  const stats = {
    overview: {
      pendingRequests,
      urgentRequests,
      requestsToday,
      requestsThisWeek,
      totalManaged: totalRequestsManaged,
      completedThisWeek: completedRequests,
      completionRate: totalRequestsManaged > 0 
        ? ((completedRequests / totalRequestsManaged) * 100).toFixed(2) 
        : 0,
    },
    tasks: {
      assignedContacts,
      activeDonorsInArea: activeDonors,
    },
    recentActivities,
  };

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Viewed Volunteer Dashboard',
    actionType: 'read',
    category: 'dashboard',
    description: 'Viewed volunteer dashboard statistics',
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: stats,
  });
});

// @desc    Get donation requests for volunteer management
// @route   GET /api/volunteer/donation-requests
// @access  Private/Volunteer
exports.getVolunteerDonationRequests = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter - volunteers can see all active requests
  const filter = { isActive: true };

  // Apply additional filters
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup.toUpperCase();
  if (req.query.district) filter.recipientDistrict = req.query.district;
  if (req.query.upazila) filter.recipientUpazila = req.query.upazila;
  if (req.query.urgency) filter.urgency = req.query.urgency;
  
  // Search filter
  if (req.query.search) {
    filter.$or = [
      { recipientName: { $regex: req.query.search, $options: 'i' } },
      { hospitalName: { $regex: req.query.search, $options: 'i' } },
      { requesterName: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Date filtering
  if (req.query.startDate || req.query.endDate) {
    filter.donationDate = {};
    if (req.query.startDate) filter.donationDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.donationDate.$lte = new Date(req.query.endDate);
  }

  // Priority: urgent first, then by date
  const sort = { urgency: -1, donationDate: 1, createdAt: -1 };

  const [donations, total] = await Promise.all([
    DonationRequest.find(filter)
      .populate('requester', 'name email avatar phone')
      .populate('donor', 'name email avatar phone')
      .skip(skip)
      .limit(limit)
      .sort(sort),
    DonationRequest.countDocuments(filter),
  ]);

  // Get statistics for the filtered results
  const stats = await DonationRequest.aggregate([
    {
      $match: filter,
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        urgentCount: {
          $sum: { $cond: [{ $in: ['$urgency', ['high', 'critical']] }, 1, 0] },
        },
      },
    },
  ]);

  const statusStats = {};
  let totalUrgent = 0;
  
  stats.forEach(stat => {
    statusStats[stat._id] = {
      total: stat.count,
      urgent: stat.urgentCount,
    };
    totalUrgent += stat.urgentCount;
  });

  res.status(200).json({
    success: true,
    count: donations.length,
    total,
    statistics: {
      byStatus: statusStats,
      totalUrgent,
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

// @desc    Update donation request status (Volunteer can update status only)
// @route   PATCH /api/volunteer/donation-requests/:id/status
// @access  Private/Volunteer
exports.updateDonationStatus = asyncHandler(async (req, res, next) => {
  const { status, note } = req.body;
  const validStatuses = ['pending', 'inprogress', 'done', 'canceled'];

  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse(`Invalid status. Valid statuses: ${validStatuses.join(', ')}`, 400));
  }

  const donation = await DonationRequest.findById(req.params.id);

  if (!donation) {
    return next(new ErrorResponse(`Donation request not found with id ${req.params.id}`, 404));
  }

  // Volunteers can only update status (not other fields)
  const oldStatus = donation.status;
  
  // Special rules for volunteers:
  // - Can change pending to inprogress (if no donor yet)
  // - Can change inprogress to done or canceled
  // - Can change pending to canceled
  // - Cannot change done or canceled to other statuses
  
  if ((oldStatus === 'done' || oldStatus === 'canceled') && status !== oldStatus) {
    return next(new ErrorResponse(`Cannot change status from ${oldStatus} to ${status}`, 400));
  }

  if (oldStatus === 'pending' && status === 'inprogress' && !donation.donor) {
    return next(new ErrorResponse('Cannot mark as inprogress without a donor', 400));
  }

  // Update status
  donation.status = status;
  
  // Add to status history
  donation.statusHistory.push({
    status,
    changedBy: req.user.id,
    changedAt: new Date(),
    note: note || `Status updated by volunteer ${req.user.name}`,
  });

  await donation.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Updated Donation Status',
    actionType: 'update',
    category: 'donation',
    entityType: 'donation_request',
    entityId: donation._id,
    entityName: donation.recipientName,
    description: `Changed status from ${oldStatus} to ${status} for ${donation.recipientName}`,
    details: `Note: ${note || 'No additional note'}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Notify relevant parties
  const notifications = [];

  if (status === 'done') {
    // Notify requester
    notifications.push({
      recipient: donation.requester,
      recipientEmail: donation.requesterEmail,
      title: 'Donation Completed Successfully! ✅',
      message: `The blood donation for ${donation.recipientName} has been marked as completed by volunteer ${req.user.name}.`,
      type: 'success',
      category: 'donation',
      priority: 'medium',
      actionUrl: `/donation-requests/${donation._id}`,
      data: { 
        donationId: donation._id, 
        completed: true,
        volunteer: req.user.name,
      },
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
    });

    // Notify donor if exists
    if (donation.donor) {
      notifications.push({
        recipient: donation.donor,
        recipientEmail: donation.donorEmail,
        title: 'Thank You for Your Donation! ❤️',
        message: `Volunteer ${req.user.name} has confirmed that your donation for ${donation.recipientName} was completed successfully. Thank you for saving lives!`,
        type: 'success',
        category: 'donation',
        priority: 'medium',
        actionUrl: '/dashboard',
        data: { 
          donationId: donation._id, 
          lifesaver: true,
          volunteer: req.user.name,
        },
      });
    }
  } else if (status === 'canceled') {
    // Notify requester
    notifications.push({
      recipient: donation.requester,
      recipientEmail: donation.requesterEmail,
      title: 'Donation Request Cancelled',
      message: `Volunteer ${req.user.name} has cancelled the donation request for ${donation.recipientName}. Reason: ${note || 'Not specified'}`,
      type: 'warning',
      category: 'donation',
      priority: 'medium',
      actionUrl: `/dashboard`,
      data: { 
        donationId: donation._id, 
        cancelled: true,
        volunteer: req.user.name,
        reason: note,
      },
    });

    // Notify donor if exists
    if (donation.donor) {
      notifications.push({
        recipient: donation.donor,
        recipientEmail: donation.donorEmail,
        title: 'Donation Request Cancelled',
        message: `Volunteer ${req.user.name} has cancelled the donation request you accepted. Reason: ${note || 'Not specified'}`,
        type: 'warning',
        category: 'donation',
        priority: 'medium',
        actionUrl: '/dashboard',
        data: { 
          donationId: donation._id, 
          cancelled: true,
          volunteer: req.user.name,
          reason: note,
        },
      });
    }
  }

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }

  res.status(200).json({
    success: true,
    data: donation,
    message: `Donation status updated to ${status}`,
  });
});

// @desc    Assign donor to donation request (Volunteer can suggest/match)
// @route   POST /api/volunteer/donation-requests/:id/assign-donor
// @access  Private/Volunteer
exports.assignDonor = asyncHandler(async (req, res, next) => {
  const { donorId, note } = req.body;

  if (!donorId) {
    return next(new ErrorResponse('Donor ID is required', 400));
  }

  const [donation, donor] = await Promise.all([
    DonationRequest.findById(req.params.id),
    User.findById(donorId),
  ]);

  if (!donation) {
    return next(new ErrorResponse(`Donation request not found with id ${req.params.id}`, 404));
  }

  if (!donor) {
    return next(new ErrorResponse(`Donor not found with id ${donorId}`, 404));
  }

  // Check if donor is actually a donor
  if (donor.role !== 'donor') {
    return next(new ErrorResponse('User is not a donor', 400));
  }

  // Check if donor is blocked
  if (donor.status === 'blocked') {
    return next(new ErrorResponse('Cannot assign blocked donor', 400));
  }

  // Check if donor is available
  if (!donor.isAvailable) {
    return next(new ErrorResponse('Donor is not available for donations', 400));
  }

  // Check if donation can accept donor
  if (donation.status !== 'pending') {
    return next(new ErrorResponse(`Cannot assign donor to ${donation.status} donation`, 400));
  }

  // Check blood group compatibility
  if (donor.bloodGroup !== donation.bloodGroup) {
    return next(new ErrorResponse(
      `Donor blood group (${donor.bloodGroup}) does not match required blood group (${donation.bloodGroup})`,
      400
    ));
  }

  // Check if donor has donated recently (90 days)
  if (donor.lastDonationDate) {
    const daysSinceLastDonation = Math.floor(
      (new Date() - new Date(donor.lastDonationDate)) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLastDonation < 90) {
      return next(new ErrorResponse(
        `Donor can only donate every 90 days. Last donation was ${daysSinceLastDonation} days ago.`,
        400
      ));
    }
  }

  // Create assignment notification (don't auto-accept, just suggest)
  await Notification.createSystemNotification({
    recipient: donor._id,
    recipientEmail: donor.email,
    title: 'Donation Match Found! 🩸',
    message: `Volunteer ${req.user.name} has matched you with a donation request for ${donation.bloodGroup} blood at ${donation.hospitalName}. Patient: ${donation.recipientName}. ${note || ''}`,
    type: 'request',
    category: 'donation',
    priority: donation.urgency === 'critical' ? 'critical' : 'high',
    actionUrl: `/donation-requests/${donation._id}`,
    data: {
      donationId: donation._id,
      bloodGroup: donation.bloodGroup,
      hospital: donation.hospitalName,
      patient: donation.recipientName,
      location: `${donation.recipientUpazila}, ${donation.recipientDistrict}`,
      suggestedBy: req.user.name,
      note,
    },
    sender: req.user._id,
    senderName: req.user.name,
    senderRole: req.user.role,
  });

  // Update donation with volunteer suggestion
  donation.volunteerSuggestions = donation.volunteerSuggestions || [];
  donation.volunteerSuggestions.push({
    volunteer: req.user.id,
    donor: donor._id,
    suggestedAt: new Date(),
    note: note || '',
  });

  await donation.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Suggested Donor for Donation',
    actionType: 'update',
    category: 'donation',
    entityType: 'donation_request',
    entityId: donation._id,
    entityName: donation.recipientName,
    description: `Suggested donor ${donor.name} for donation request`,
    details: `Donor: ${donor.name} (${donor.bloodGroup}), Note: ${note || 'No note'}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Notify requester about volunteer action
  await Notification.createSystemNotification({
    recipient: donation.requester,
    recipientEmail: donation.requesterEmail,
    title: 'Potential Donor Found!',
    message: `Volunteer ${req.user.name} has found a potential donor (${donor.name}) for your request. The donor has been notified.`,
    type: 'info',
    category: 'donation',
    priority: 'medium',
    actionUrl: `/donation-requests/${donation._id}`,
    data: {
      donationId: donation._id,
      volunteer: req.user.name,
      potentialDonor: donor.name,
    },
    sender: req.user._id,
    senderName: req.user.name,
    senderRole: req.user.role,
  });

  res.status(200).json({
    success: true,
    message: 'Donor suggestion sent successfully',
    data: {
      donation: donation._id,
      donor: {
        id: donor._id,
        name: donor.name,
        email: donor.email,
        bloodGroup: donor.bloodGroup,
      },
      suggestedBy: req.user.name,
    },
  });
});

// @desc    Get available donors for matching
// @route   GET /api/volunteer/available-donors
// @access  Private/Volunteer
exports.getAvailableDonors = asyncHandler(async (req, res, next) => {
  const {
    bloodGroup,
    district,
    upazila,
    page = 1,
    limit = 20,
    excludeAssigned = true,
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Build filter for available donors
  const filter = {
    role: 'donor',
    status: 'active',
    isAvailable: true,
  };

  if (bloodGroup) filter.bloodGroup = bloodGroup.toUpperCase();
  if (district) filter.district = district;
  if (upazila) filter.upazila = upazila;

  // Exclude donors who have been recently suggested for the same request
  if (excludeAssigned === 'true' && req.query.donationId) {
    const donation = await DonationRequest.findById(req.query.donationId);
    if (donation && donation.volunteerSuggestions) {
      const suggestedDonorIds = donation.volunteerSuggestions.map(s => s.donor.toString());
      filter._id = { $nin: suggestedDonorIds };
    }
  }

  const [donors, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limitNum)
      .sort({ totalDonations: -1, lastDonationDate: 1 }),
    User.countDocuments(filter),
  ]);

  // Enrich donors with eligibility information
  const enrichedDonors = donors.map(donor => {
    const donorObj = donor.toObject();
    
    // Calculate eligibility
    let isEligible = true;
    let eligibilityMessage = 'Available for donation';
    
    if (donor.lastDonationDate) {
      const daysSinceLastDonation = Math.floor(
        (new Date() - new Date(donor.lastDonationDate)) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceLastDonation < 90) {
        isEligible = false;
        const daysLeft = 90 - daysSinceLastDonation;
        eligibilityMessage = `Can donate in ${daysLeft} days`;
      }
    }
    
    return {
      ...donorObj,
      eligibility: {
        isEligible,
        message: eligibilityMessage,
        lastDonationDate: donor.lastDonationDate,
        daysSinceLastDonation: donor.lastDonationDate 
          ? Math.floor((new Date() - new Date(donor.lastDonationDate)) / (1000 * 60 * 60 * 24))
          : null,
        nextEligibleDate: donor.lastDonationDate
          ? new Date(new Date(donor.lastDonationDate).getTime() + 90 * 24 * 60 * 60 * 1000)
          : null,
      },
      stats: {
        totalDonations: donor.totalDonations || 0,
        successRate: donor.totalDonations > 0 ? '100%' : '0%', // Simplified
      },
    };
  });

  // Get blood group compatibility stats
  const bloodGroupStats = await User.aggregate([
    {
      $match: {
        role: 'donor',
        status: 'active',
        isAvailable: true,
      },
    },
    {
      $group: {
        _id: '$bloodGroup',
        count: { $sum: 1 },
        eligibleCount: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$lastDonationDate', null] },
                  {
                    $lt: [
                      { $divide: [{ $subtract: [new Date(), '$lastDonationDate'] }, 1000 * 60 * 60 * 24] },
                      90,
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { count: -1 } },
  ]);

  res.status(200).json({
    success: true,
    count: enrichedDonors.length,
    total,
    filters: {
      bloodGroup: bloodGroup || 'Any',
      district: district || 'Any',
      upazila: upazila || 'Any',
    },
    statistics: {
      bloodGroups: bloodGroupStats,
      totalAvailable: total,
    },
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasNextPage: pageNum * limitNum < total,
      hasPrevPage: pageNum > 1,
    },
    data: enrichedDonors,
  });
});

// @desc    Get volunteer's assigned contacts
// @route   GET /api/volunteer/assigned-contacts
// @access  Private/Volunteer
exports.getAssignedContacts = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {
    assignedTo: req.user.id,
  };

  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
      { subject: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .populate('user', 'name email avatar')
      .skip(skip)
      .limit(limit)
      .sort({ priority: -1, createdAt: -1 }),
    Contact.countDocuments(filter),
  ]);

  // Get contact statistics
  const contactStats = await Contact.aggregate([
    {
      $match: { assignedTo: req.user.id },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        urgentCount: {
          $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] },
        },
      },
    },
  ]);

  const stats = {};
  contactStats.forEach(stat => {
    stats[stat._id] = {
      total: stat.count,
      urgent: stat.urgentCount,
    };
  });

  res.status(200).json({
    success: true,
    count: contacts.length,
    total,
    statistics: stats,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    data: contacts,
  });
});

// @desc    Respond to assigned contact
// @route   POST /api/volunteer/contacts/:id/respond
// @access  Private/Volunteer
exports.respondToContact = asyncHandler(async (req, res, next) => {
  const { message, sendVia = 'email', markAsResolved = false } = req.body;

  if (!message) {
    return next(new ErrorResponse('Response message is required', 400));
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  // Check if contact is assigned to this volunteer
  if (contact.assignedTo?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to respond to this contact', 403));
  }

  // Add response
  await contact.addResponse({
    responder: req.user.id,
    responderName: req.user.name,
    responderRole: req.user.role,
    message,
    sentVia,
  });

  // Update status if marked as resolved
  if (markAsResolved) {
    await contact.resolve(`Resolved by volunteer ${req.user.name}`);
  }

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Responded to Contact Inquiry',
    actionType: 'update',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: contact.name,
    description: `Responded to contact inquiry from ${contact.name}`,
    details: `Response sent via ${sendVia}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    message: 'Response sent successfully',
    data: contact,
  });
});

// @desc    Get volunteer's activity log
// @route   GET /api/volunteer/activity-log
// @access  Private/Volunteer
exports.getVolunteerActivityLog = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {
    user: req.user.id,
  };

  if (req.query.actionType) filter.actionType = req.query.actionType;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
  }

  const [activities, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('entityId')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    ActivityLog.countDocuments(filter),
  ]);

  // Get activity statistics
  const activityStats = await ActivityLog.aggregate([
    {
      $match: {
        user: req.user._id,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          category: '$category',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        total: { $sum: '$count' },
        byCategory: {
          $push: {
            category: '$_id.category',
            count: '$count',
          },
        },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: 7 }, // Last 7 days
  ]);

  res.status(200).json({
    success: true,
    count: activities.length,
    total,
    statistics: {
      last7Days: activityStats,
    },
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    data: activities,
  });
});

// @desc    Get urgent tasks for volunteer
// @route   GET /api/volunteer/urgent-tasks
// @access  Private/Volunteer
exports.getUrgentTasks = asyncHandler(async (req, res, next) => {
  // Get urgent donation requests
  const urgentDonations = await DonationRequest.find({
    isActive: true,
    status: 'pending',
    urgency: { $in: ['high', 'critical'] },
    donationDate: { $gte: new Date() }, // Not expired
  })
    .populate('requester', 'name email avatar')
    .sort({ urgency: -1, donationDate: 1 })
    .limit(10);

  // Get assigned urgent contacts
  const urgentContacts = await Contact.find({
    assignedTo: req.user.id,
    status: { $in: ['new', 'in-progress'] },
    priority: { $in: ['high', 'urgent'] },
  })
    .sort({ priority: -1, createdAt: -1 })
    .limit(10);

  // Get donors who need follow-up (suggested but not accepted)
  const pendingSuggestions = await DonationRequest.find({
    'volunteerSuggestions.volunteer': req.user.id,
    status: 'pending',
    isActive: true,
  })
    .populate('requester', 'name email')
    .populate('volunteerSuggestions.donor', 'name email')
    .limit(10);

  const tasks = {
    urgentDonations,
    urgentContacts,
    pendingSuggestions,
    summary: {
      totalUrgentDonations: urgentDonations.length,
      totalUrgentContacts: urgentContacts.length,
      totalPendingSuggestions: pendingSuggestions.length,
      totalTasks: urgentDonations.length + urgentContacts.length + pendingSuggestions.length,
    },
  };

  res.status(200).json({
    success: true,
    data: tasks,
  });
});

// @desc    Mark task as completed
// @route   POST /api/volunteer/tasks/:id/complete
// @access  Private/Volunteer
exports.completeTask = asyncHandler(async (req, res, next) => {
  const { taskType, donationId, contactId, notes } = req.body;

  if (!taskType) {
    return next(new ErrorResponse('Task type is required', 400));
  }

  let result;
  let message;

  switch (taskType) {
    case 'donation_followup':
      if (!donationId) {
        return next(new ErrorResponse('Donation ID is required for donation followup', 400));
      }
      
      const donation = await DonationRequest.findById(donationId);
      if (!donation) {
        return next(new ErrorResponse('Donation not found', 404));
      }

      // Log followup activity
      await ActivityLog.logActivity({
        user: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'Completed Donation Followup',
        actionType: 'update',
        category: 'donation',
        entityType: 'donation_request',
        entityId: donation._id,
        entityName: donation.recipientName,
        description: `Completed followup for donation request`,
        details: notes || 'No additional notes',
        status: 'success',
        userIp: req.ip,
        userAgent: req.headers['user-agent'],
      });

      result = donation;
      message = 'Donation followup marked as completed';
      break;

    case 'contact_response':
      if (!contactId) {
        return next(new ErrorResponse('Contact ID is required for contact response', 400));
      }

      const contact = await Contact.findById(contactId);
      if (!contact) {
        return next(new ErrorResponse('Contact not found', 404));
      }

      // Update contact status
      await contact.resolve(notes || 'Resolved by volunteer');

      result = contact;
      message = 'Contact response marked as completed';
      break;

    default:
      return next(new ErrorResponse('Invalid task type', 400));
  }

  res.status(200).json({
    success: true,
    message,
    data: result,
  });
});