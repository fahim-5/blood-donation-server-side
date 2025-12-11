// server/src/controllers/donationController.js
import DonationRequest from "../models/DonationRequest.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import ActivityLog from "../models/ActivityLog.js";
import asyncHandler from "../middleware/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";

// @desc    Get all donation requests
// @route   GET /api/donations
// @access  Public/Private (based on role)
export const getAllDonations = asyncHandler(async (req, res, next) => {
  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Base filter - only active requests
  const filter = { isActive: true };

  // Role-based filtering
  if (req.user) {
    // Admin and Volunteer see all
    if (req.user.role === "admin" || req.user.role === "volunteer") {
      // Admin/Volunteer can see all
    }
    // Donor sees only their own requests
    else if (req.user.role === "donor") {
      filter.$or = [{ requester: req.user.id }, { donor: req.user.id }];
    }
  } else {
    // Public users see only pending requests
    filter.status = "pending";
  }

  // Additional filters
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bloodGroup)
    filter.bloodGroup = req.query.bloodGroup.toUpperCase();
  if (req.query.district) filter.recipientDistrict = req.query.district;
  if (req.query.upazila) filter.recipientUpazila = req.query.upazila;
  if (req.query.urgency) filter.urgency = req.query.urgency;
  if (req.query.search) {
    filter.$or = [
      { recipientName: { $regex: req.query.search, $options: "i" } },
      { hospitalName: { $regex: req.query.search, $options: "i" } },
      { hospitalAddress: { $regex: req.query.search, $options: "i" } },
    ];
  }

  // Date filtering
  if (req.query.startDate || req.query.endDate) {
    filter.donationDate = {};
    if (req.query.startDate)
      filter.donationDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate)
      filter.donationDate.$lte = new Date(req.query.endDate);
  }

  // Sorting
  const sort = {};
  if (req.query.sort) {
    const sortField = req.query.sort.startsWith("-")
      ? req.query.sort.substring(1)
      : req.query.sort;
    sort[sortField] = req.query.sort.startsWith("-") ? -1 : 1;
  } else {
    // Default: urgency first, then donation date
    sort.urgency = -1;
    sort.donationDate = 1;
  }

  // Execute query
  const [donations, total] = await Promise.all([
    DonationRequest.find(filter)
      .populate("requester", "name email avatar bloodGroup")
      .populate("donor", "name email avatar bloodGroup")
      .skip(skip)
      .limit(limit)
      .sort(sort),
    DonationRequest.countDocuments(filter),
  ]);

  // Log activity if user is logged in
  if (req.user) {
    await ActivityLog.logActivity({
      user: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: "Viewed Donation Requests",
      actionType: "read",
      category: "donation",
      description: `Viewed ${donations.length} donation requests`,
      details: `Filters: ${JSON.stringify(req.query)}`,
      status: "success",
      userIp: req.ip,
      userAgent: req.headers["user-agent"],
      request: {
        method: req.method,
        url: req.originalUrl,
        queryParams: req.query,
      },
    });
  }

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
    data: donations,
  });
});

// @desc    Get single donation request
// @route   GET /api/donations/:id
// @access  Private
export const getDonation = asyncHandler(async (req, res, next) => {
  const donation = await DonationRequest.findById(req.params.id)
    .populate(
      "requester",
      "name email avatar phone bloodGroup district upazila"
    )
    .populate("donor", "name email avatar phone bloodGroup district upazila");

  if (!donation) {
    return next(
      new ErrorResponse(
        `Donation request not found with id ${req.params.id}`,
        404
      )
    );
  }

  // Check authorization
  const canView =
    req.user.role === "admin" ||
    req.user.role === "volunteer" ||
    donation.requester._id.toString() === req.user.id ||
    (donation.donor && donation.donor._id.toString() === req.user.id);

  if (!canView) {
    return next(
      new ErrorResponse("Not authorized to view this donation request", 403)
    );
  }

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Viewed Donation Request Details",
    actionType: "read",
    category: "donation",
    entityType: "donation_request",
    entityId: donation._id,
    entityName: donation.recipientName,
    description: `Viewed donation request for ${donation.recipientName}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res.status(200).json({
    success: true,
    data: donation,
  });
});

// @desc    Create donation request
// @route   POST /api/donations
// @access  Private (Donor/Admin/Volunteer)
export const createDonation = asyncHandler(async (req, res, next) => {
  // Check if user is blocked
  if (req.user.status === "blocked") {
    return next(
      new ErrorResponse(
        "Your account is blocked. Cannot create donation requests.",
        403
      )
    );
  }

  // Format donation date
  const donationDate = new Date(req.body.donationDate);
  if (donationDate < new Date().setHours(0, 0, 0, 0)) {
    return next(new ErrorResponse("Donation date cannot be in the past", 400));
  }

  // Create donation request
  const donation = await DonationRequest.create({
    requester: req.user.id,
    requesterName: req.user.name,
    requesterEmail: req.user.email,
    recipientName: req.body.recipientName,
    recipientDistrict: req.body.recipientDistrict,
    recipientUpazila: req.body.recipientUpazila,
    hospitalName: req.body.hospitalName,
    hospitalAddress: req.body.hospitalAddress,
    bloodGroup: req.body.bloodGroup.toUpperCase(),
    donationDate: donationDate,
    donationTime: req.body.donationTime,
    requestMessage: req.body.requestMessage,
    urgency: req.body.urgency || "medium",
    unitsRequired: req.body.unitsRequired || 1,
    contactPerson: req.body.contactPerson || {},
  });

  // Populate requester info
  await donation.populate("requester", "name email avatar");

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Created Donation Request",
    actionType: "create",
    category: "donation",
    entityType: "donation_request",
    entityId: donation._id,
    entityName: donation.recipientName,
    description: `Created donation request for ${donation.recipientName}`,
    details: `Blood Group: ${donation.bloodGroup}, Hospital: ${donation.hospitalName}, Date: ${donation.donationDate}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Create notification for admins and volunteers about new request
  const adminsAndVolunteers = await User.find({
    role: { $in: ["admin", "volunteer"] },
    status: "active",
  });

  const notifications = adminsAndVolunteers.map((user) => ({
    recipient: user._id,
    recipientEmail: user.email,
    title: "New Donation Request 🆕",
    message: `New blood donation request for ${donation.bloodGroup} at ${donation.hospitalName}. Patient: ${donation.recipientName}`,
    type: "request",
    category: "donation",
    priority: donation.urgency === "critical" ? "high" : "medium",
    actionUrl: `/dashboard/all-blood-donation-request/${donation._id}`,
    data: {
      donationId: donation._id,
      bloodGroup: donation.bloodGroup,
      urgency: donation.urgency,
    },
    sender: req.user._id,
    senderName: req.user.name,
    senderRole: req.user.role,
  }));

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }

  // Also notify compatible donors in the area
  const compatibleDonors = await User.find({
    bloodGroup: donation.bloodGroup,
    district: donation.recipientDistrict,
    status: "active",
    isAvailable: true,
  });

  const donorNotifications = compatibleDonors
    .filter((donor) => donor._id.toString() !== req.user.id) // Don't notify requester
    .map((donor) => ({
      recipient: donor._id,
      recipientEmail: donor.email,
      title: "Urgent: Blood Donation Needed 🩸",
      message: `A patient with ${donation.bloodGroup} blood needs your help at ${donation.hospitalName}. Location: ${donation.recipientUpazila}, ${donation.recipientDistrict}`,
      type: "alert",
      category: "donation",
      priority: donation.urgency === "critical" ? "critical" : "high",
      actionUrl: `/donation-requests/${donation._id}`,
      data: {
        donationId: donation._id,
        bloodGroup: donation.bloodGroup,
        location: `${donation.recipientUpazila}, ${donation.recipientDistrict}`,
        hospital: donation.hospitalName,
      },
    }));

  if (donorNotifications.length > 0) {
    await Notification.insertMany(donorNotifications);
  }

  res.status(201).json({
    success: true,
    data: donation,
    message: "Donation request created successfully",
  });
});

// @desc    Update donation request
// @route   PUT /api/donations/:id
// @access  Private
export const updateDonation = asyncHandler(async (req, res, next) => {
  let donation = await DonationRequest.findById(req.params.id);

  if (!donation) {
    return next(
      new ErrorResponse(
        `Donation request not found with id ${req.params.id}`,
        404
      )
    );
  }

  // Check authorization
  const canUpdate =
    req.user.role === "admin" || donation.requester.toString() === req.user.id;

  if (!canUpdate) {
    return next(
      new ErrorResponse("Not authorized to update this donation request", 403)
    );
  }

  // Don't allow updates if donation is in progress or completed
  if (donation.status !== "pending") {
    return next(
      new ErrorResponse(
        `Cannot update donation with status: ${donation.status}`,
        400
      )
    );
  }

  // Update donation
  const updates = { ...req.body };

  // Don't allow updating certain fields
  delete updates.requester;
  delete updates.requesterName;
  delete updates.requesterEmail;
  delete updates.status;
  delete updates.donor;
  delete updates.donorName;
  delete updates.donorEmail;

  // Format blood group
  if (updates.bloodGroup) {
    updates.bloodGroup = updates.bloodGroup.toUpperCase();
  }

  // Format donation date if provided
  if (updates.donationDate) {
    const donationDate = new Date(updates.donationDate);
    if (donationDate < new Date().setHours(0, 0, 0, 0)) {
      return next(
        new ErrorResponse("Donation date cannot be in the past", 400)
      );
    }
    updates.donationDate = donationDate;
  }

  donation = await DonationRequest.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).populate("requester donor");

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Updated Donation Request",
    actionType: "update",
    category: "donation",
    entityType: "donation_request",
    entityId: donation._id,
    entityName: donation.recipientName,
    description: `Updated donation request for ${donation.recipientName}`,
    details: `Updated fields: ${Object.keys(req.body).join(", ")}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Notify donor if donation was inprogress
  if (donation.donor && donation.status === "inprogress") {
    await Notification.createSystemNotification({
      recipient: donation.donor,
      recipientEmail: donation.donorEmail,
      title: "Donation Request Updated",
      message: `The donation request you accepted has been updated. Please review the new details.`,
      type: "info",
      category: "donation",
      priority: "medium",
      actionUrl: `/donation-requests/${donation._id}`,
      data: {
        donationId: donation._id,
        updatedBy: req.user.name,
      },
    });
  }

  res.status(200).json({
    success: true,
    data: donation,
    message: "Donation request updated successfully",
  });
});

// @desc    Delete donation request
// @route   DELETE /api/donations/:id
// @access  Private
export const deleteDonation = asyncHandler(async (req, res, next) => {
  const donation = await DonationRequest.findById(req.params.id);

  if (!donation) {
    return next(
      new ErrorResponse(
        `Donation request not found with id ${req.params.id}`,
        404
      )
    );
  }

  // Check authorization
  const canDelete =
    req.user.role === "admin" || donation.requester.toString() === req.user.id;

  if (!canDelete) {
    return next(
      new ErrorResponse("Not authorized to delete this donation request", 403)
    );
  }

  // Don't allow deletion if donation is in progress
  if (donation.status === "inprogress") {
    return next(
      new ErrorResponse(
        "Cannot delete donation request that is in progress",
        400
      )
    );
  }

  // Soft delete (set isActive to false)
  donation.isActive = false;
  await donation.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Deleted Donation Request",
    actionType: "delete",
    category: "donation",
    entityType: "donation_request",
    entityId: donation._id,
    entityName: donation.recipientName,
    description: `Deleted donation request for ${donation.recipientName}`,
    details: `Status was: ${donation.status}`,
    status: "success",
    severity: "warning",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Notify donor if there was one
  if (donation.donor) {
    await Notification.createSystemNotification({
      recipient: donation.donor,
      recipientEmail: donation.donorEmail,
      title: "Donation Request Cancelled",
      message: `The donation request you accepted has been cancelled by the requester.`,
      type: "warning",
      category: "donation",
      priority: "medium",
      actionUrl: "/dashboard",
      data: {
        donationId: donation._id,
        cancelledBy: req.user.name,
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {},
    message: "Donation request deleted successfully",
  });
});

// @desc    Accept donation request
// @route   POST /api/donations/:id/accept
// @access  Private (Donor only)
export const acceptDonation = asyncHandler(async (req, res, next) => {
  const donation = await DonationRequest.findById(req.params.id);

  if (!donation) {
    return next(
      new ErrorResponse(
        `Donation request not found with id ${req.params.id}`,
        404
      )
    );
  }

  // Check if user is a donor
  if (req.user.role !== "donor") {
    return next(
      new ErrorResponse("Only donors can accept donation requests", 403)
    );
  }

  // Check if user is blocked
  if (req.user.status === "blocked") {
    return next(
      new ErrorResponse(
        "Your account is blocked. Cannot accept donation requests.",
        403
      )
    );
  }

  // Check if user is available
  if (!req.user.isAvailable) {
    return next(
      new ErrorResponse(
        "You are marked as unavailable for donations. Please update your availability first.",
        400
      )
    );
  }

  // Check if donation can be accepted
  if (donation.status !== "pending") {
    return next(
      new ErrorResponse(
        `This donation request is already ${donation.status}`,
        400
      )
    );
  }

  // Check if donation is expired
  if (donation.isExpired) {
    return next(new ErrorResponse("This donation request has expired", 400));
  }

  // Check blood group compatibility (basic check)
  if (req.user.bloodGroup !== donation.bloodGroup) {
    return next(
      new ErrorResponse(
        `Your blood group (${req.user.bloodGroup}) does not match the required blood group (${donation.bloodGroup})`,
        400
      )
    );
  }

  // Check if donor has donated recently (90 days)
  if (req.user.lastDonationDate) {
    const daysSinceLastDonation = Math.floor(
      (new Date() - new Date(req.user.lastDonationDate)) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLastDonation < 90) {
      return next(
        new ErrorResponse(
          `You can only donate blood every 90 days. Your last donation was ${daysSinceLastDonation} days ago.`,
          400
        )
      );
    }
  }

  // Accept donation
  await donation.acceptDonation(req.user.id, req.user.name, req.user.email);

  // Update donor's last donation date and increment total donations
  await User.findByIdAndUpdate(req.user.id, {
    lastDonationDate: donation.donationDate,
    $inc: { totalDonations: 1 },
  });

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Accepted Donation Request",
    actionType: "update",
    category: "donation",
    entityType: "donation_request",
    entityId: donation._id,
    entityName: donation.recipientName,
    description: `${req.user.name} accepted donation request for ${donation.recipientName}`,
    details: `Blood Group: ${donation.bloodGroup}, Hospital: ${donation.hospitalName}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Notify requester
  await Notification.createSystemNotification({
    recipient: donation.requester,
    recipientEmail: donation.requesterEmail,
    title: "Donation Request Accepted! 🎉",
    message: `${req.user.name} has accepted your donation request for ${donation.recipientName}. Please contact them to coordinate.`,
    type: "success",
    category: "donation",
    priority: "high",
    actionUrl: `/donation-requests/${donation._id}`,
    data: {
      donationId: donation._id,
      donorName: req.user.name,
      donorEmail: req.user.email,
      donorPhone: req.user.phone,
    },
    sender: req.user._id,
    senderName: req.user.name,
    senderRole: req.user.role,
  });

  res.status(200).json({
    success: true,
    data: donation,
    message: "Donation request accepted successfully",
  });
});

// @desc    Update donation status
// @route   PATCH /api/donations/:id/status
// @access  Private (Admin/Volunteer/Donor based on status)
export const updateStatus = asyncHandler(async (req, res, next) => {
  const { status, note } = req.body;
  const validStatuses = ["pending", "inprogress", "done", "canceled"];

  if (!validStatuses.includes(status)) {
    return next(
      new ErrorResponse(
        `Invalid status. Valid statuses: ${validStatuses.join(", ")}`,
        400
      )
    );
  }

  const donation = await DonationRequest.findById(req.params.id);

  if (!donation) {
    return next(
      new ErrorResponse(
        `Donation request not found with id ${req.params.id}`,
        404
      )
    );
  }

  // Authorization logic based on status transition
  let canUpdate = false;
  let updateReason = "";

  switch (status) {
    case "inprogress":
      // Only donor who accepted can change to inprogress (handled in accept endpoint)
      // Admin/Volunteer can also change
      canUpdate = req.user.role === "admin" || req.user.role === "volunteer";
      updateReason = "Marked as in progress";
      break;

    case "done":
      // Donor who accepted, or admin/volunteer can mark as done
      canUpdate =
        req.user.role === "admin" ||
        req.user.role === "volunteer" ||
        (donation.donor && donation.donor.toString() === req.user.id);
      updateReason = "Marked as completed";
      break;

    case "canceled":
      // Requester, donor, admin, or volunteer can cancel
      canUpdate =
        req.user.role === "admin" ||
        req.user.role === "volunteer" ||
        donation.requester.toString() === req.user.id ||
        (donation.donor && donation.donor.toString() === req.user.id);
      updateReason = note || "Cancelled by user";
      break;

    case "pending":
      // Only admin/volunteer can revert to pending
      canUpdate = req.user.role === "admin" || req.user.role === "volunteer";
      updateReason = "Reverted to pending";
      break;

    default:
      canUpdate = false;
  }

  if (!canUpdate) {
    return next(new ErrorResponse("Not authorized to update status", 403));
  }

  // Update status
  const oldStatus = donation.status;
  donation.status = status;

  // Add to status history
  donation.statusHistory.push({
    status,
    changedBy: req.user.id,
    changedAt: new Date(),
    note: updateReason,
  });

  await donation.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Updated Donation Status",
    actionType: "update",
    category: "donation",
    entityType: "donation_request",
    entityId: donation._id,
    entityName: donation.recipientName,
    description: `Changed status from ${oldStatus} to ${status} for ${donation.recipientName}`,
    details: `Reason: ${updateReason}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Notify relevant parties
  const notifications = [];

  if (status === "done") {
    // Notify requester
    notifications.push({
      recipient: donation.requester,
      recipientEmail: donation.requesterEmail,
      title: "Donation Completed Successfully! ✅",
      message: `The blood donation for ${donation.recipientName} has been completed successfully. Thank you for using our platform!`,
      type: "success",
      category: "donation",
      priority: "medium",
      actionUrl: `/donation-requests/${donation._id}`,
      data: { donationId: donation._id, completed: true },
    });

    // Notify donor
    if (donation.donor) {
      notifications.push({
        recipient: donation.donor,
        recipientEmail: donation.donorEmail,
        title: "Thank You for Your Donation! ❤️",
        message: `You have successfully donated blood for ${donation.recipientName}. Your contribution saves lives!`,
        type: "success",
        category: "donation",
        priority: "medium",
        actionUrl: "/dashboard",
        data: { donationId: donation._id, lifesaver: true },
      });
    }
  } else if (status === "canceled") {
    // Notify both parties
    notifications.push({
      recipient: donation.requester,
      recipientEmail: donation.requesterEmail,
      title: "Donation Request Cancelled",
      message: `The donation request for ${
        donation.recipientName
      } has been cancelled. ${note || ""}`,
      type: "warning",
      category: "donation",
      priority: "medium",
      actionUrl: `/dashboard`,
      data: { donationId: donation._id, cancelled: true },
    });

    if (donation.donor) {
      notifications.push({
        recipient: donation.donor,
        recipientEmail: donation.donorEmail,
        title: "Donation Request Cancelled",
        message: `The donation request you accepted has been cancelled. ${
          note || ""
        }`,
        type: "warning",
        category: "donation",
        priority: "medium",
        actionUrl: "/dashboard",
        data: { donationId: donation._id, cancelled: true },
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

// @desc    Get my donation requests
// @route   GET /api/donations/my-requests
// @access  Private
export const getMyDonationRequests = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    requester: req.user.id,
    isActive: true,
  };

  if (req.query.status) filter.status = req.query.status;

  const [donations, total] = await Promise.all([
    DonationRequest.find(filter)
      .populate("donor", "name email avatar phone")
      .skip(skip)
      .limit(limit)
      .sort({ donationDate: 1, createdAt: -1 }),
    DonationRequest.countDocuments(filter),
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
    data: donations,
  });
});

// @desc    Get my accepted donations
// @route   GET /api/donations/my-donations
// @access  Private
export const getMyDonations = asyncHandler(async (req, res, next) => {
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
      .populate("requester", "name email avatar phone")
      .skip(skip)
      .limit(limit)
      .sort({ donationDate: 1, createdAt: -1 }),
    DonationRequest.countDocuments(filter),
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
    data: donations,
  });
});

// @desc    Get donation statistics
// @route   GET /api/donations/stats
// @access  Private/Admin
export const getDonationStats = asyncHandler(async (req, res, next) => {
  // Only admin can see all stats
  if (req.user.role !== "admin") {
    return next(
      new ErrorResponse("Not authorized to view donation statistics", 403)
    );
  }

  const stats = await DonationRequest.aggregate([
    {
      $match: {
        isActive: true,
      },
    },
    {
      $facet: {
        // Status counts
        statusCounts: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],

        // Blood group distribution
        bloodGroupStats: [
          {
            $group: {
              _id: "$bloodGroup",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],

        // Monthly donations
        monthlyStats: [
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
          { $limit: 12 },
        ],

        // Location stats
        locationStats: [
          {
            $group: {
              _id: "$recipientDistrict",
              count: { $sum: 1 },
              upazilas: { $addToSet: "$recipientUpazila" },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],

        // Urgency stats
        urgencyStats: [
          {
            $group: {
              _id: "$urgency",
              count: { $sum: 1 },
            },
          },
        ],

        // Completion rate
        completionRate: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] },
              },
              pending: {
                $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
              },
            },
          },
        ],
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: stats[0],
  });
});

// @desc    Get urgent donation requests
// @route   GET /api/donations/urgent
// @access  Public
export const getUrgentDonations = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;

  const urgentDonations = await DonationRequest.find({
    status: "pending",
    urgency: { $in: ["high", "critical"] },
    isActive: true,
    donationDate: { $gte: new Date() }, // Not expired
  })
    .populate("requester", "name email avatar")
    .sort({ urgency: -1, donationDate: 1 })
    .limit(limit);

  res.status(200).json({
    success: true,
    count: urgentDonations.length,
    data: urgentDonations,
  });
});


// ... (all your existing code)

// Export all functions as named exports (already done)
// Add default export for compatibility
export default {
  getAllDonations,
  getDonation,
  createDonation,
  updateDonation,
  deleteDonation,
  acceptDonation,
  updateStatus,
  getMyDonationRequests,
  getMyDonations,
  getDonationStats,
  getUrgentDonations
};