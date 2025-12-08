const Notification = require('../models/Notification');
const User = require('../models/User');
const emailService = require('./emailService');
const logger = require('./../middleware/loggerMiddleware').logger;

// Notification utility functions
const notificationUtils = {
    // Send in-app notification
    sendInAppNotification: async (notificationData) => {
        try {
            const {
                recipient,
                sender,
                type,
                title,
                message,
                relatedTo,
                actionUrl,
                priority = 'medium'
            } = notificationData;

            // Create notification in database
            const notification = new Notification({
                recipient,
                sender: sender || null,
                type,
                title,
                message,
                relatedTo: relatedTo || null,
                actionUrl: actionUrl || null,
                priority,
                isRead: false
            });

            await notification.save();

            // Populate sender info
            const populatedNotification = await Notification.findById(notification._id)
                .populate('sender', 'name email avatar')
                .lean();

            logger.info(`In-app notification sent to user ${recipient}: ${title}`);

            return {
                success: true,
                notification: populatedNotification
            };
        } catch (error) {
            logger.error(`Send in-app notification error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send email notification
    sendEmailNotification: async (userId, emailData) => {
        try {
            const user = await User.findById(userId);
            
            if (!user || !user.email) {
                return {
                    success: false,
                    error: 'User not found or no email address'
                };
            }

            const result = await emailService.sendEmail({
                to: user.email,
                subject: emailData.subject,
                template: emailData.template,
                data: {
                    name: user.name,
                    ...emailData.data
                }
            });

            if (result.success) {
                logger.info(`Email notification sent to ${user.email}: ${emailData.subject}`);
            }

            return result;
        } catch (error) {
            logger.error(`Send email notification error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send push notification (placeholder for actual push service)
    sendPushNotification: async (userId, pushData) => {
        try {
            const user = await User.findById(userId);
            
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Check if user has push notifications enabled
            if (!user.notificationPreferences?.pushNotifications) {
                return {
                    success: false,
                    error: 'Push notifications disabled by user'
                };
            }

            // In a real implementation, you would:
            // 1. Get user's device tokens
            // 2. Send via Firebase Cloud Messaging, OneSignal, etc.
            // 3. Handle responses

            logger.info(`Push notification would be sent to user ${userId}: ${pushData.title}`);

            return {
                success: true,
                message: 'Push notification queued (not implemented)',
                data: pushData
            };
        } catch (error) {
            logger.error(`Send push notification error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send donation request notification to matching donors
    sendDonationRequestNotification: async (donationRequest, matchingDonors) => {
        try {
            const notifications = [];
            const emails = [];
            const pushes = [];

            for (const donor of matchingDonors) {
                // Check if donor wants notifications
                if (donor.notificationPreferences?.donationRequestAlerts !== false) {
                    // In-app notification
                    const inAppResult = await notificationUtils.sendInAppNotification({
                        recipient: donor._id,
                        sender: donationRequest.requester,
                        type: 'donation_request',
                        title: 'New Blood Donation Request',
                        message: `A new blood donation request (${donationRequest.bloodGroup}) has been posted in your area`,
                        relatedTo: donationRequest._id,
                        actionUrl: `/dashboard/donation-requests/${donationRequest._id}`,
                        priority: 'high'
                    });

                    if (inAppResult.success) {
                        notifications.push(inAppResult.notification);
                    }

                    // Email notification
                    if (donor.notificationPreferences?.emailNotifications !== false) {
                        const emailResult = await notificationUtils.sendEmailNotification(donor._id, {
                            subject: 'New Blood Donation Request in Your Area',
                            template: 'donation-request',
                            data: {
                                recipientName: donationRequest.recipientName,
                                bloodGroup: donationRequest.bloodGroup,
                                hospitalName: donationRequest.hospitalName,
                                hospitalAddress: donationRequest.hospitalAddress,
                                donationDate: new Date(donationRequest.donationDate).toLocaleDateString(),
                                donationTime: donationRequest.donationTime,
                                requestLink: `${process.env.APP_URL}/donation-requests/${donationRequest._id}`,
                                urgencyLevel: donationRequest.urgencyLevel
                            }
                        });

                        if (emailResult.success) {
                            emails.push({ donor: donor.email, success: true });
                        } else {
                            emails.push({ donor: donor.email, success: false, error: emailResult.error });
                        }
                    }

                    // Push notification
                    if (donor.notificationPreferences?.pushNotifications !== false) {
                        const pushResult = await notificationUtils.sendPushNotification(donor._id, {
                            title: 'New Blood Donation Request',
                            body: `Blood group ${donationRequest.bloodGroup} needed in ${donationRequest.recipientDistrict}`,
                            data: {
                                type: 'donation_request',
                                requestId: donationRequest._id.toString(),
                                bloodGroup: donationRequest.bloodGroup
                            }
                        });

                        pushes.push(pushResult);
                    }
                }
            }

            return {
                success: true,
                summary: {
                    totalDonors: matchingDonors.length,
                    notificationsSent: notifications.length,
                    emailsSent: emails.filter(e => e.success).length,
                    pushesSent: pushes.filter(p => p.success).length
                },
                details: {
                    notifications,
                    emails,
                    pushes
                }
            };
        } catch (error) {
            logger.error(`Send donation request notifications error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send donation status update notification
    sendDonationStatusNotification: async (donationRequest, donorId, status) => {
        try {
            const requester = await User.findById(donationRequest.requester);
            const donor = donorId ? await User.findById(donorId) : null;

            let title, message, emailSubject, emailTemplate;

            switch (status) {
                case 'inprogress':
                    title = 'Donation Request Accepted';
                    message = 'Your donation request has been accepted by a donor';
                    emailSubject = 'Donation Request Accepted';
                    emailTemplate = 'donation-status-accepted';
                    break;
                case 'done':
                    title = 'Donation Completed';
                    message = 'The blood donation has been successfully completed';
                    emailSubject = 'Donation Completed Successfully';
                    emailTemplate = 'donation-status-completed';
                    break;
                case 'canceled':
                    title = 'Donation Cancelled';
                    message = 'The donation request has been cancelled';
                    emailSubject = 'Donation Request Cancelled';
                    emailTemplate = 'donation-status-cancelled';
                    break;
                default:
                    title = 'Donation Status Updated';
                    message = `Your donation request status has been updated to ${status}`;
                    emailSubject = 'Donation Status Updated';
                    emailTemplate = 'donation-status-updated';
            }

            const results = {
                requester: {},
                donor: {}
            };

            // Notify requester
            if (requester) {
                // In-app notification
                results.requester.inApp = await notificationUtils.sendInAppNotification({
                    recipient: requester._id,
                    sender: donorId,
                    type: 'donation_status',
                    title,
                    message,
                    relatedTo: donationRequest._id,
                    actionUrl: `/dashboard/donation-requests/${donationRequest._id}`,
                    priority: 'medium'
                });

                // Email notification
                if (requester.notificationPreferences?.emailNotifications !== false) {
                    results.requester.email = await notificationUtils.sendEmailNotification(requester._id, {
                        subject: emailSubject,
                        template: emailTemplate,
                        data: {
                            recipientName: donationRequest.recipientName,
                            bloodGroup: donationRequest.bloodGroup,
                            status,
                            donationLink: `${process.env.APP_URL}/dashboard/donation-requests/${donationRequest._id}`
                        }
                    });
                }
            }

            // Notify donor (if different from requester)
            if (donor && donor._id.toString() !== donationRequest.requester.toString()) {
                const donorTitle = status === 'done' ? 'Donation Completed' : 'Donation Updated';
                const donorMessage = status === 'done' 
                    ? 'You successfully donated blood' 
                    : `Donation status updated to ${status}`;

                // In-app notification
                results.donor.inApp = await notificationUtils.sendInAppNotification({
                    recipient: donor._id,
                    sender: donationRequest.requester,
                    type: 'donation_status',
                    title: donorTitle,
                    message: donorMessage,
                    relatedTo: donationRequest._id,
                    actionUrl: `/dashboard/donation-requests/${donationRequest._id}`,
                    priority: 'medium'
                });

                // Email notification
                if (donor.notificationPreferences?.emailNotifications !== false) {
                    results.donor.email = await notificationUtils.sendEmailNotification(donor._id, {
                        subject: donorTitle,
                        template: 'donation-status-donor',
                        data: {
                            recipientName: donationRequest.recipientName,
                            bloodGroup: donationRequest.bloodGroup,
                            status,
                            donationLink: `${process.env.APP_URL}/dashboard/donation-requests/${donationRequest._id}`
                        }
                    });
                }
            }

            return {
                success: true,
                results
            };
        } catch (error) {
            logger.error(`Send donation status notification error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send user status change notification
    sendUserStatusNotification: async (userId, status, adminId, reason = '') => {
        try {
            const user = await User.findById(userId);
            const admin = await User.findById(adminId);

            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            const title = status === 'blocked' ? 'Account Blocked' : 'Account Unblocked';
            const message = status === 'blocked' 
                ? `Your account has been blocked by an administrator${reason ? `: ${reason}` : ''}` 
                : 'Your account has been unblocked and is now active';

            const results = {};

            // In-app notification
            results.inApp = await notificationUtils.sendInAppNotification({
                recipient: user._id,
                sender: adminId,
                type: 'account_status',
                title,
                message,
                priority: 'high'
            });

            // Email notification
            if (user.notificationPreferences?.emailNotifications !== false) {
                results.email = await notificationUtils.sendEmailNotification(user._id, {
                    subject: title,
                    template: 'account-status',
                    data: {
                        status: status === 'blocked' ? 'blocked' : 'active',
                        reason,
                        supportEmail: process.env.SUPPORT_EMAIL || 'support@blooddonation.com',
                        action: status === 'blocked' ? 'blocked by an administrator' : 'unblocked and is now active'
                    }
                });
            }

            return {
                success: true,
                results
            };
        } catch (error) {
            logger.error(`Send user status notification error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send role change notification
    sendRoleChangeNotification: async (userId, newRole, adminId) => {
        try {
            const user = await User.findById(userId);
            const admin = await User.findById(adminId);

            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            const results = {};

            // In-app notification
            results.inApp = await notificationUtils.sendInAppNotification({
                recipient: user._id,
                sender: adminId,
                type: 'role_change',
                title: 'Role Updated',
                message: `Your role has been changed to ${newRole}`,
                priority: 'medium'
            });

            // Email notification
            if (user.notificationPreferences?.emailNotifications !== false) {
                results.email = await notificationUtils.sendEmailNotification(user._id, {
                    subject: 'Your Role Has Been Updated',
                    template: 'role-change',
                    data: {
                        newRole,
                        previousRole: user.role,
                        adminName: admin?.name || 'Administrator'
                    }
                });
            }

            return {
                success: true,
                results
            };
        } catch (error) {
            logger.error(`Send role change notification error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send funding received notification
    sendFundingNotification: async (funding, donor) => {
        try {
            // Get all admins
            const admins = await User.find({ role: 'admin', status: 'active' });

            const results = {
                admins: [],
                donor: {}
            };

            // Notify admins
            for (const admin of admins) {
                if (admin.notificationPreferences?.fundingUpdates !== false) {
                    const adminResult = await notificationUtils.sendInAppNotification({
                        recipient: admin._id,
                        sender: donor._id,
                        type: 'funding_received',
                        title: 'New Funding Received',
                        message: `${donor.name || 'A donor'} donated ৳${funding.amount}`,
                        relatedTo: funding._id,
                        actionUrl: `/dashboard/funding/${funding._id}`,
                        priority: 'low'
                    });

                    results.admins.push({
                        admin: admin.email,
                        success: adminResult.success
                    });
                }
            }

            // Notify donor (receipt)
            if (donor.notificationPreferences?.emailNotifications !== false) {
                results.donor.email = await notificationUtils.sendEmailNotification(donor._id, {
                    subject: 'Thank You for Your Donation',
                    template: 'funding-receipt',
                    data: {
                        amount: funding.amount,
                        transactionId: funding._id,
                        date: new Date(funding.createdAt).toLocaleDateString(),
                        paymentMethod: funding.paymentMethod
                    }
                });
            }

            return {
                success: true,
                results
            };
        } catch (error) {
            logger.error(`Send funding notification error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send volunteer assignment notification
    sendVolunteerAssignmentNotification: async (volunteerId, assignment) => {
        try {
            const volunteer = await User.findById(volunteerId);

            if (!volunteer) {
                return {
                    success: false,
                    error: 'Volunteer not found'
                };
            }

            const results = {};

            // In-app notification
            results.inApp = await notificationUtils.sendInAppNotification({
                recipient: volunteer._id,
                type: 'volunteer_assignment',
                title: 'New Volunteer Assignment',
                message: `You have been assigned to: ${assignment.description}`,
                relatedTo: assignment._id,
                actionUrl: `/dashboard/assignments/${assignment._id}`,
                priority: 'medium'
            });

            // Email notification
            if (volunteer.notificationPreferences?.emailNotifications !== false) {
                results.email = await notificationUtils.sendEmailNotification(volunteer._id, {
                    subject: 'New Volunteer Assignment',
                    template: 'volunteer-assignment',
                    data: {
                        assignmentType: assignment.type,
                        description: assignment.description,
                        dueDate: new Date(assignment.dueDate).toLocaleDateString(),
                        priority: assignment.priority,
                        assignmentLink: `${process.env.APP_URL}/dashboard/assignments/${assignment._id}`
                    }
                });
            }

            return {
                success: true,
                results
            };
        } catch (error) {
            logger.error(`Send volunteer assignment notification error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Send system announcement
    sendSystemAnnouncement: async (announcement, recipientIds = null) => {
        try {
            let recipients;
            
            if (recipientIds) {
                recipients = await User.find({ 
                    _id: { $in: recipientIds },
                    status: 'active'
                });
            } else {
                // Send to all active users
                recipients = await User.find({ status: 'active' });
            }

            const results = {
                totalRecipients: recipients.length,
                successful: 0,
                failed: 0,
                details: []
            };

            for (const recipient of recipients) {
                try {
                    // Check if user wants system announcements
                    if (recipient.notificationPreferences?.systemAnnouncements !== false) {
                        // In-app notification
                        await notificationUtils.sendInAppNotification({
                            recipient: recipient._id,
                            type: 'system',
                            title: announcement.title,
                            message: announcement.message,
                            relatedTo: announcement._id,
                            actionUrl: announcement.actionUrl || '/dashboard/announcements',
                            priority: announcement.priority || 'medium'
                        });

                        // Email notification (optional)
                        if (announcement.sendEmail && recipient.notificationPreferences?.emailNotifications !== false) {
                            await notificationUtils.sendEmailNotification(recipient._id, {
                                subject: announcement.title,
                                template: 'system-announcement',
                                data: {
                                    title: announcement.title,
                                    message: announcement.message,
                                    announcementDate: new Date().toLocaleDateString()
                                }
                            });
                        }

                        results.successful++;
                        results.details.push({
                            recipient: recipient.email,
                            success: true
                        });
                    } else {
                        results.details.push({
                            recipient: recipient.email,
                            success: false,
                            reason: 'Notifications disabled'
                        });
                    }
                } catch (error) {
                    results.failed++;
                    results.details.push({
                        recipient: recipient.email,
                        success: false,
                        error: error.message
                    });
                }
            }

            return {
                success: results.failed === 0,
                results
            };
        } catch (error) {
            logger.error(`Send system announcement error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Mark notification as read
    markNotificationAsRead: async (notificationId, userId) => {
        try {
            const notification = await Notification.findOneAndUpdate(
                { 
                    _id: notificationId,
                    recipient: userId 
                },
                { 
                    isRead: true,
                    readAt: new Date()
                },
                { new: true }
            ).populate('sender', 'name email avatar');

            if (!notification) {
                return {
                    success: false,
                    error: 'Notification not found'
                };
            }

            return {
                success: true,
                notification
            };
        } catch (error) {
            logger.error(`Mark notification as read error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Mark all notifications as read
    markAllNotificationsAsRead: async (userId) => {
        try {
            const result = await Notification.updateMany(
                { 
                    recipient: userId,
                    isRead: false 
                },
                { 
                    isRead: true,
                    readAt: new Date()
                }
            );

            return {
                success: true,
                modifiedCount: result.modifiedCount,
                message: `${result.modifiedCount} notifications marked as read`
            };
        } catch (error) {
            logger.error(`Mark all notifications as read error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get user notification preferences
    getUserNotificationPreferences: async (userId) => {
        try {
            const user = await User.findById(userId).select('notificationPreferences');
            
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Default preferences if not set
            const defaultPreferences = {
                emailNotifications: true,
                pushNotifications: true,
                inAppNotifications: true,
                donationRequestAlerts: true,
                donationStatusUpdates: true,
                fundingUpdates: true,
                systemAnnouncements: true,
                volunteerAssignmentAlerts: true
            };

            const preferences = {
                ...defaultPreferences,
                ...(user.notificationPreferences || {})
            };

            return {
                success: true,
                preferences
            };
        } catch (error) {
            logger.error(`Get notification preferences error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Update user notification preferences
    updateNotificationPreferences: async (userId, preferences) => {
        try {
            const user = await User.findByIdAndUpdate(
                userId,
                { 
                    notificationPreferences: preferences,
                    updatedAt: new Date()
                },
                { new: true }
            ).select('notificationPreferences');

            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            return {
                success: true,
                preferences: user.notificationPreferences
            };
        } catch (error) {
            logger.error(`Update notification preferences error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get notification statistics
    getNotificationStats: async (userId, period = '30days') => {
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

            const stats = await Notification.aggregate([
                {
                    $match: {
                        recipient: userId,
                        createdAt: { $gte: dateFilter }
                    }
                },
                {
                    $group: {
                        _id: {
                            type: '$type',
                            isRead: '$isRead'
                        },
                        count: { $sum: 1 },
                        avgReadTime: {
                            $avg: {
                                $cond: [
                                    { $eq: ['$isRead', true] },
                                    { $subtract: ['$readAt', '$createdAt'] },
                                    null
                                ]
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: '$_id.type',
                        total: { $sum: '$count' },
                        read: {
                            $sum: {
                                $cond: [{ $eq: ['$_id.isRead', true] }, '$count', 0]
                            }
                        },
                        unread: {
                            $sum: {
                                $cond: [{ $eq: ['$_id.isRead', false] }, '$count', 0]
                            }
                        },
                        avgReadTimeMs: { $avg: '$avgReadTime' }
                    }
                },
                {
                    $project: {
                        type: '$_id',
                        total: 1,
                        read: 1,
                        unread: 1,
                        readRate: {
                            $cond: [
                                { $eq: ['$total', 0] },
                                0,
                                { $multiply: [{ $divide: ['$read', '$total'] }, 100] }
                            ]
                        },
                        avgReadTimeMinutes: {
                            $cond: [
                                { $eq: ['$avgReadTimeMs', null] },
                                0,
                                { $divide: ['$avgReadTimeMs', 1000 * 60] }
                            ]
                        }
                    }
                },
                { $sort: { total: -1 } }
            ]);

            const totalStats = await Notification.aggregate([
                {
                    $match: {
                        recipient: userId,
                        createdAt: { $gte: dateFilter }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        read: {
                            $sum: {
                                $cond: [{ $eq: ['$isRead', true] }, 1, 0]
                            }
                        },
                        avgPriority: { $avg: { $indexOfArray: [['low', 'medium', 'high', 'urgent'], '$priority'] } }
                    }
                }
            ]);

            const total = totalStats[0] || { total: 0, read: 0, avgPriority: 1 };

            return {
                success: true,
                period,
                total: total.total,
                read: total.read,
                unread: total.total - total.read,
                readRate: total.total > 0 ? (total.read / total.total) * 100 : 0,
                avgPriority: total.avgPriority,
                byType: stats,
                engagement: {
                    notificationsPerDay: total.total / 30, // Assuming 30 days
                    responseRate: total.read > 0 ? (stats.reduce((sum, s) => sum + s.read, 0) / total.read) * 100 : 0
                }
            };
        } catch (error) {
            logger.error(`Get notification stats error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Clean up old notifications
    cleanupOldNotifications: async (days = 90) => {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const result = await Notification.deleteMany({
                createdAt: { $lt: cutoffDate },
                isRead: true // Only delete read notifications
            });

            logger.info(`Cleaned up ${result.deletedCount} old notifications`);

            return {
                success: true,
                deletedCount: result.deletedCount,
                cutoffDate: cutoffDate.toISOString()
            };
        } catch (error) {
            logger.error(`Cleanup old notifications error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Test notification delivery
    testNotificationDelivery: async (userId, type = 'inApp') => {
        try {
            const user = await User.findById(userId);
            
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            let result;

            switch (type) {
                case 'inApp':
                    result = await notificationUtils.sendInAppNotification({
                        recipient: user._id,
                        type: 'system',
                        title: 'Test Notification',
                        message: 'This is a test notification to verify delivery.',
                        priority: 'low'
                    });
                    break;

                case 'email':
                    result = await notificationUtils.sendEmailNotification(user._id, {
                        subject: 'Test Email Notification',
                        template: 'test-notification',
                        data: {
                            testMessage: 'This is a test email to verify notification delivery.'
                        }
                    });
                    break;

                case 'push':
                    result = await notificationUtils.sendPushNotification(user._id, {
                        title: 'Test Push Notification',
                        body: 'This is a test push notification.',
                        data: {
                            type: 'test',
                            timestamp: new Date().toISOString()
                        }
                    });
                    break;

                default:
                    return {
                        success: false,
                        error: 'Invalid notification type'
                    };
            }

            return {
                success: true,
                type,
                result
            };
        } catch (error) {
            logger.error(`Test notification delivery error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

module.exports = notificationUtils;