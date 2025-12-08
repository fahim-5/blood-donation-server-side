// server/src/controllers/contactController.js
const Contact = require('../models/Contact');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const sendEmail = require('../utils/emailService');

// @desc    Submit contact form (Public)
// @route   POST /api/contact
// @access  Public
exports.submitContact = asyncHandler(async (req, res, next) => {
  const {
    name,
    email,
    phone,
    subject,
    message,
    category = 'general',
    bloodGroup = 'not_applicable',
    district,
    upazila,
    consentGiven = false,
    allowMarketing = false,
  } = req.body;

  // Validate required fields
  if (!name || !email || !subject || !message) {
    return next(new ErrorResponse('Name, email, subject, and message are required', 400));
  }

  // Validate message length
  if (message.length < 10) {
    return next(new ErrorResponse('Message must be at least 10 characters', 400));
  }

  // Validate email format
  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    return next(new ErrorResponse('Please enter a valid email address', 400));
  }

  // Check for duplicate submissions (same email and similar message within 24 hours)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const duplicate = await Contact.findOne({
    email: email.toLowerCase(),
    message: { $regex: message.substring(0, 50), $options: 'i' },
    createdAt: { $gte: twentyFourHoursAgo },
  });

  if (duplicate) {
    return next(new ErrorResponse('You have already submitted a similar message recently. Please wait 24 hours before submitting again.', 429));
  }

  // Get user if logged in
  let user = null;
  if (req.user) {
    user = req.user._id;
  }

  // Determine priority based on category
  let priority = 'medium';
  if (category === 'emergency' || category === 'complaint') {
    priority = 'high';
  } else if (category === 'general' || category === 'feedback') {
    priority = 'low';
  }

  // Create contact submission
  const contact = await Contact.create({
    name,
    email: email.toLowerCase(),
    phone: phone || '',
    user,
    subject,
    message,
    category,
    priority,
    bloodGroup: bloodGroup.toUpperCase(),
    location: {
      district: district || '',
      upazila: upazila || '',
    },
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || '',
    source: 'contact_form',
    consentGiven,
    allowMarketing,
    isSubscribed: true,
  });

  // Send auto-reply email
  try {
    await sendEmail({
      to: email,
      subject: `Thank you for contacting Blood Donation App - ${subject}`,
      template: 'contact-auto-reply',
      context: {
        name,
        subject,
        message,
        category,
        priority,
        referenceId: contact._id.toString().slice(-8),
        estimatedResponseTime: '24-48 hours',
        contactEmail: process.env.SUPPORT_EMAIL || 'support@blooddonation.app',
      },
    });
  } catch (emailError) {
    console.error('Auto-reply email failed:', emailError);
    // Don't fail the request if email fails
  }

  // Create notification for admins
  const admins = await User.find({
    role: 'admin',
    status: 'active',
  });

  const adminNotifications = admins.map(admin => ({
    recipient: admin._id,
    recipientEmail: admin.email,
    title: 'New Contact Submission 📧',
    message: `New ${category} submission from ${name}: ${subject}`,
    type: 'info',
    category: 'contact',
    priority,
    actionUrl: `/dashboard/contacts/${contact._id}`,
    data: {
      contactId: contact._id,
      category,
      priority,
      from: name,
    },
  }));

  if (adminNotifications.length > 0) {
    await Notification.insertMany(adminNotifications);
  }

  // If it's an emergency, also notify volunteers in the same area
  if (category === 'emergency' && district) {
    const volunteers = await User.find({
      role: 'volunteer',
      status: 'active',
      district: district,
    });

    const volunteerNotifications = volunteers.map(volunteer => ({
      recipient: volunteer._id,
      recipientEmail: volunteer.email,
      title: 'Emergency Contact Submission 🚨',
      message: `Emergency contact from ${name} in ${district}: ${subject}`,
      type: 'alert',
      category: 'contact',
      priority: 'critical',
      actionUrl: `/dashboard/contacts/${contact._id}`,
      data: {
        contactId: contact._id,
        category: 'emergency',
        location: district,
        from: name,
      },
    }));

    if (volunteerNotifications.length > 0) {
      await Notification.insertMany(volunteerNotifications);
    }
  }

  // Log activity
  await ActivityLog.logActivity({
    user: user || null,
    userName: name,
    userEmail: email,
    userRole: user ? req.user.role : 'anonymous',
    action: 'Submitted Contact Form',
    actionType: 'create',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: name,
    description: `Submitted contact form: ${subject}`,
    details: `Category: ${category}, Priority: ${priority}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({
    success: true,
    data: contact,
    message: 'Thank you for contacting us. We will get back to you soon.',
  });
});

// @desc    Get all contacts (Admin/Volunteer only)
// @route   GET /api/contacts
// @access  Private/Admin/Volunteer
exports.getAllContacts = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = {};

  // Role-based filtering
  if (req.user.role === 'volunteer') {
    // Volunteers see contacts assigned to them or unassigned
    filter.$or = [
      { assignedTo: req.user.id },
      { assignedTo: null },
    ];
  }

  // Additional filters
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.assignedTo) {
    if (req.query.assignedTo === 'unassigned') {
      filter.assignedTo = null;
    } else if (req.query.assignedTo === 'me') {
      filter.assignedTo = req.user.id;
    } else {
      filter.assignedTo = req.query.assignedTo;
    }
  }
  
  // Search filter
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
      { subject: { $regex: req.query.search, $options: 'i' } },
      { message: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Date filtering
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
  }

  // Sorting
  const sort = {};
  if (req.query.sort) {
    const sortField = req.query.sort.startsWith('-') ? req.query.sort.substring(1) : req.query.sort;
    sort[sortField] = req.query.sort.startsWith('-') ? -1 : 1;
  } else {
    // Default: priority first, then newest
    sort.priority = -1;
    sort.createdAt = -1;
  }

  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .populate('user', 'name email avatar')
      .populate('assignedTo', 'name email avatar')
      .populate('responses.responder', 'name email avatar')
      .skip(skip)
      .limit(limit)
      .sort(sort),
    Contact.countDocuments(filter),
  ]);

  // Get contact statistics
  const stats = await Contact.aggregate([
    {
      $match: filter,
    },
    {
      $facet: {
        statusDistribution: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              urgentCount: {
                $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] },
              },
            },
          },
        ],
        categoryDistribution: [
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        priorityDistribution: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 },
            },
          },
        ],
        assignmentDistribution: [
          {
            $group: {
              _id: {
                $cond: [{ $eq: ['$assignedTo', null] }, 'unassigned', 'assigned'],
              },
              count: { $sum: 1 },
            },
          },
        ],
        responseTimeStats: [
          {
            $match: {
              status: { $in: ['resolved', 'closed'] },
              'responses.0': { $exists: true },
            },
          },
          {
            $project: {
              createdAt: 1,
              firstResponse: { $arrayElemAt: ['$responses', 0] },
            },
          },
          {
            $project: {
              responseTime: {
                $divide: [
                  { $subtract: ['$firstResponse.sentAt', '$createdAt'] },
                  1000 * 60 * 60, // Convert to hours
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              avgHours: { $avg: '$responseTime' },
              minHours: { $min: '$responseTime' },
              maxHours: { $max: '$responseTime' },
            },
          },
        ],
      },
    },
  ]);

  res.status(200).json({
    success: true,
    count: contacts.length,
    total,
    statistics: stats.length > 0 ? stats[0] : {},
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

// @desc    Get single contact
// @route   GET /api/contacts/:id
// @access  Private/Admin/Volunteer
exports.getContact = asyncHandler(async (req, res, next) => {
  const contact = await Contact.findById(req.params.id)
    .populate('user', 'name email avatar phone bloodGroup district upazila')
    .populate('assignedTo', 'name email avatar')
    .populate('responses.responder', 'name email avatar role')
    .populate('archivedBy', 'name email');

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  // Check authorization
  const canView = 
    req.user.role === 'admin' || 
    contact.assignedTo?.toString() === req.user.id ||
    (!contact.assignedTo && req.user.role === 'volunteer');

  if (!canView) {
    return next(new ErrorResponse('Not authorized to view this contact', 403));
  }

  // Mark as read if it was new
  if (contact.status === 'new' && (req.user.role === 'admin' || contact.assignedTo?.toString() === req.user.id)) {
    contact.status = 'read';
    await contact.save();
  }

  res.status(200).json({
    success: true,
    data: contact,
  });
});

// @desc    Update contact status
// @route   PATCH /api/contacts/:id/status
// @access  Private/Admin/Volunteer
exports.updateContactStatus = asyncHandler(async (req, res, next) => {
  const { status, note } = req.body;
  const validStatuses = ['new', 'read', 'in-progress', 'resolved', 'closed', 'spam'];

  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse(`Invalid status. Valid statuses: ${validStatuses.join(', ')}`, 400));
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  // Check authorization
  const canUpdate = 
    req.user.role === 'admin' || 
    contact.assignedTo?.toString() === req.user.id;

  if (!canUpdate) {
    return next(new ErrorResponse('Not authorized to update this contact', 403));
  }

  const oldStatus = contact.status;
  contact.status = status;

  // Add note if provided
  if (note) {
    contact.followUpNotes = note;
  }

  // Set follow-up date if status is in-progress
  if (status === 'in-progress' && !contact.followUpDate) {
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 3); // Follow up in 3 days
    contact.followUpDate = followUpDate;
  }

  await contact.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Updated Contact Status',
    actionType: 'update',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: contact.name,
    description: `Changed status from ${oldStatus} to ${status} for contact from ${contact.name}`,
    details: note || 'No additional note',
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Notify user if status is resolved or closed
  if ((status === 'resolved' || status === 'closed') && contact.user) {
    await Notification.createSystemNotification({
      recipient: contact.user,
      recipientEmail: contact.email,
      title: `Contact ${status === 'resolved' ? 'Resolved' : 'Closed'}`,
      message: `Your contact submission "${contact.subject}" has been ${status}. ${note || 'Thank you for reaching out to us.'}`,
      type: status === 'resolved' ? 'success' : 'info',
      category: 'contact',
      priority: 'medium',
      actionUrl: `/contact/${contact._id}`,
      data: {
        contactId: contact._id,
        status,
        resolvedBy: req.user.name,
      },
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
    });
  }

  res.status(200).json({
    success: true,
    data: contact,
    message: `Contact status updated to ${status}`,
  });
});

// @desc    Assign contact to user
// @route   PATCH /api/contacts/:id/assign
// @access  Private/Admin
exports.assignContact = asyncHandler(async (req, res, next) => {
  const { assignTo } = req.body;

  if (!assignTo) {
    return next(new ErrorResponse('User ID to assign is required', 400));
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  // Check if assignTo user exists and is admin/volunteer
  const assignUser = await User.findById(assignTo);
  if (!assignUser || (assignUser.role !== 'admin' && assignUser.role !== 'volunteer')) {
    return next(new ErrorResponse('Can only assign to admins or volunteers', 400));
  }

  const oldAssignee = contact.assignedTo;
  contact.assignedTo = assignTo;
  
  // Update status if it was new
  if (contact.status === 'new') {
    contact.status = 'in-progress';
  }

  await contact.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Assigned Contact',
    actionType: 'assign',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: contact.name,
    description: `Assigned contact from ${contact.name} to ${assignUser.name}`,
    details: `Previous assignee: ${oldAssignee ? 'Someone else' : 'Unassigned'}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Notify the assigned user
  await Notification.createSystemNotification({
    recipient: assignTo,
    recipientEmail: assignUser.email,
    title: 'New Contact Assigned to You 📋',
    message: `You have been assigned a contact from ${contact.name}: "${contact.subject}"`,
    type: 'info',
    category: 'contact',
    priority: contact.priority === 'urgent' ? 'high' : 'medium',
    actionUrl: `/dashboard/contacts/${contact._id}`,
    data: {
      contactId: contact._id,
      from: contact.name,
      subject: contact.subject,
      priority: contact.priority,
      assignedBy: req.user.name,
    },
    sender: req.user._id,
    senderName: req.user.name,
    senderRole: req.user.role,
  });

  res.status(200).json({
    success: true,
    data: contact,
    message: `Contact assigned to ${assignUser.name}`,
  });
});

// @desc    Respond to contact
// @route   POST /api/contacts/:id/respond
// @access  Private/Admin/Volunteer
exports.respondToContact = asyncHandler(async (req, res, next) => {
  const { message, sendVia = 'email', markAsResolved = false } = req.body;

  if (!message) {
    return next(new ErrorResponse('Response message is required', 400));
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  // Check authorization
  const canRespond = 
    req.user.role === 'admin' || 
    contact.assignedTo?.toString() === req.user.id;

  if (!canRespond) {
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

  // Send email response if requested
  if (sendVia === 'email') {
    try {
      await sendEmail({
        to: contact.email,
        subject: `Re: ${contact.subject}`,
        template: 'contact-response',
        context: {
          name: contact.name,
          subject: contact.subject,
          response: message,
          responderName: req.user.name,
          responderRole: req.user.role,
          contactId: contact._id.toString().slice(-8),
          contactEmail: process.env.SUPPORT_EMAIL || 'support@blooddonation.app',
        },
      });
    } catch (emailError) {
      console.error('Response email failed:', emailError);
      // Don't fail the request if email fails
    }
  }

  // Update status if marked as resolved
  if (markAsResolved) {
    await contact.resolve(`Resolved by ${req.user.role} ${req.user.name}`);
  }

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Responded to Contact',
    actionType: 'update',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: contact.name,
    description: `Responded to contact from ${contact.name}`,
    details: `Response sent via ${sendVia}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: contact,
    message: 'Response sent successfully',
  });
});

// @desc    Set follow-up date
// @route   PATCH /api/contacts/:id/follow-up
// @access  Private/Admin/Volunteer
exports.setFollowUp = asyncHandler(async (req, res, next) => {
  const { followUpDate, note } = req.body;

  if (!followUpDate) {
    return next(new ErrorResponse('Follow-up date is required', 400));
  }

  const date = new Date(followUpDate);
  if (date < new Date()) {
    return next(new ErrorResponse('Follow-up date cannot be in the past', 400));
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  // Check authorization
  const canUpdate = 
    req.user.role === 'admin' || 
    contact.assignedTo?.toString() === req.user.id;

  if (!canUpdate) {
    return next(new ErrorResponse('Not authorized to update this contact', 403));
  }

  const oldFollowUpDate = contact.followUpDate;
  contact.followUpDate = date;
  contact.followUpNotes = note || contact.followUpNotes || '';

  // Update status if it was resolved/closed
  if (contact.status === 'resolved' || contact.status === 'closed') {
    contact.status = 'in-progress';
  }

  await contact.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Set Follow-up Date',
    actionType: 'update',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: contact.name,
    description: `Set follow-up date for contact from ${contact.name}`,
    details: `Date: ${date.toLocaleDateString()}, Note: ${note || 'No note'}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Schedule reminder notification
  const reminderDate = new Date(date);
  reminderDate.setHours(reminderDate.getHours() - 2); // 2 hours before follow-up

  await Notification.create({
    recipient: req.user._id,
    recipientEmail: req.user.email,
    title: 'Follow-up Reminder 🔔',
    message: `Follow up with ${contact.name} about "${contact.subject}"`,
    type: 'reminder',
    category: 'contact',
    priority: 'medium',
    scheduledFor: reminderDate,
    actionUrl: `/dashboard/contacts/${contact._id}`,
    data: {
      contactId: contact._id,
      contactName: contact.name,
      subject: contact.subject,
      followUpDate: date,
    },
  });

  res.status(200).json({
    success: true,
    data: contact,
    message: `Follow-up scheduled for ${date.toLocaleDateString()}`,
  });
});

// @desc    Mark contact as spam
// @route   PATCH /api/contacts/:id/spam
// @access  Private/Admin
exports.markAsSpam = asyncHandler(async (req, res, next) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  contact.status = 'spam';
  await contact.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Marked Contact as Spam',
    actionType: 'update',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: contact.name,
    description: `Marked contact from ${contact.name} as spam`,
    details: `Subject: ${contact.subject}`,
    status: 'success',
    severity: 'warning',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: contact,
    message: 'Contact marked as spam',
  });
});

// @desc    Archive contact
// @route   PATCH /api/contacts/:id/archive
// @access  Private/Admin
exports.archiveContact = asyncHandler(async (req, res, next) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  if (contact.status !== 'closed' && contact.status !== 'resolved') {
    return next(new ErrorResponse('Only resolved or closed contacts can be archived', 400));
  }

  await contact.archive(req.user.id);

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Archived Contact',
    actionType: 'update',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: contact.name,
    description: `Archived contact from ${contact.name}`,
    status: 'success',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: contact,
    message: 'Contact archived successfully',
  });
});

// @desc    Delete contact (Admin only)
// @route   DELETE /api/contacts/:id
// @access  Private/Admin
exports.deleteContact = asyncHandler(async (req, res, next) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return next(new ErrorResponse(`Contact not found with id ${req.params.id}`, 404));
  }

  // Only allow deletion of spam or very old contacts
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (contact.status !== 'spam' && contact.createdAt > thirtyDaysAgo) {
    return next(new ErrorResponse('Can only delete spam contacts or contacts older than 30 days', 400));
  }

  await contact.deleteOne();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'Deleted Contact',
    actionType: 'delete',
    category: 'contact',
    entityType: 'contact',
    entityId: contact._id,
    entityName: contact.name,
    description: `Deleted contact from ${contact.name}`,
    details: `Status was: ${contact.status}`,
    status: 'success',
    severity: 'warning',
    userIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    data: {},
    message: 'Contact deleted successfully',
  });
});

// @desc    Get contacts needing follow-up
// @route   GET /api/contacts/needs-follow-up
// @access  Private/Admin/Volunteer
exports.getContactsNeedingFollowUp = asyncHandler(async (req, res, next) => {
  const filter = {
    followUpDate: { $lte: new Date() },
    status: { $in: ['new', 'in-progress', 'read'] },
  };

  // Role-based filtering
  if (req.user.role === 'volunteer') {
    filter.$or = [
      { assignedTo: req.user.id },
      { assignedTo: null },
    ];
  }

  const contacts = await Contact.find(filter)
    .populate('assignedTo', 'name email')
    .sort({ followUpDate: 1 })
    .limit(50);

  res.status(200).json({
    success: true,
    count: contacts.length,
    data: contacts,
  });
});

// @desc    Get contact statistics
// @route   GET /api/contacts/stats
// @access  Private/Admin
exports.getContactStats = asyncHandler(async (req, res, next) => {
  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const stats = await Contact.aggregate([
    {
      $facet: {
        // Overall counts
        overall: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
              inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
              resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
              closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
              spam: { $sum: { $cond: [{ $eq: ['$status', 'spam'] }, 1, 0] } },
            },
          },
        ],
        // Today's contacts
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
        // This week's contacts
        thisWeek: [
          {
            $match: {
              createdAt: { $gte: startOfWeek },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
            },
          },
        ],
        // This month's contacts
        thisMonth: [
          {
            $match: {
              createdAt: { $gte: startOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
            },
          },
        ],
        // Category distribution
        byCategory: [
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        // Priority distribution
        byPriority: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 },
            },
          },
        ],
        // Assignment status
        byAssignment: [
          {
            $group: {
              _id: {
                $cond: [{ $eq: ['$assignedTo', null] }, 'unassigned', 'assigned'],
              },
              count: { $sum: 1 },
            },
          },
        ],
        // Response time analysis
        responseTime: [
          {
            $match: {
              status: { $in: ['resolved', 'closed'] },
              'responses.0': { $exists: true },
            },
          },
          {
            $project: {
              createdAt: 1,
              firstResponse: { $arrayElemAt: ['$responses', 0] },
              category: 1,
              priority: 1,
            },
          },
          {
            $project: {
              responseHours: {
                $divide: [
                  { $subtract: ['$firstResponse.sentAt', '$createdAt'] },
                  1000 * 60 * 60,
                ],
              },
              category: 1,
              priority: 1,
            },
          },
          {
            $group: {
              _id: null,
              avgHours: { $avg: '$responseHours' },
              minHours: { $min: '$responseHours' },
              maxHours: { $max: '$responseHours' },
              byCategory: {
                $push: {
                  category: '$category',
                  hours: '$responseHours',
                },
              },
              byPriority: {
                $push: {
                  priority: '$priority',
                  hours: '$responseHours',
                },
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
            },
          },
        ],
      },
    },
  ]);

  const result = {
    overall: stats[0].overall.length > 0 ? stats[0].overall[0] : null,
    today: stats[0].today.length > 0 ? stats[0].today[0] : null,
    thisWeek: stats[0].thisWeek.length > 0 ? stats[0].thisWeek[0] : null,
    thisMonth: stats[0].thisMonth.length > 0 ? stats[0].thisMonth[0] : null,
    byCategory: stats[0].byCategory,
    byPriority: stats[0].byPriority,
    byAssignment: stats[0].byAssignment,
    responseTime: stats[0].responseTime.length > 0 ? stats[0].responseTime[0] : null,
    topResponders: stats[0].topResponders,
  };

  res.status(200).json({
    success: true,
    data: result,
  });
});