const Notification = require('../models/Notification');
const User = require('../models/User');
const mongoose = require('mongoose');

// @desc    Get all notifications for a user
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 10, markAsRead = false } = req.query;
        
        const query = { recipient: req.user._id };
        
        // Filter by read status if specified
        if (markAsRead === 'true') {
            query.isRead = true;
        } else if (markAsRead === 'false') {
            query.isRead = false;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('sender', 'name email avatar')
            .lean();

        const total = await Notification.countDocuments(query);

        // Mark as read if requested
        if (markAsRead === 'false') {
            await Notification.updateMany(
                { recipient: req.user._id, isRead: false },
                { isRead: true }
            );
        }

        res.status(200).json({
            success: true,
            data: {
                notifications,
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching notifications'
        });
    }
};

// @desc    Get notification count (unread)
// @route   GET /api/notifications/count
// @access  Private
const getNotificationCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            recipient: req.user._id,
            isRead: false
        });

        res.status(200).json({
            success: true,
            data: { count }
        });
    } catch (error) {
        console.error('Get notification count error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching notification count'
        });
    }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification ID'
            });
        }

        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient: req.user._id },
            { isRead: true, readAt: new Date() },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.status(200).json({
            success: true,
            data: notification
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while marking notification as read'
        });
    }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/mark-all-read
// @access  Private
const markAllAsRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        res.status(200).json({
            success: true,
            data: {
                modifiedCount: result.modifiedCount,
                message: `${result.modifiedCount} notifications marked as read`
            }
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while marking all notifications as read'
        });
    }
};

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification ID'
            });
        }

        const notification = await Notification.findOneAndDelete({
            _id: id,
            recipient: req.user._id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting notification'
        });
    }
};

// @desc    Delete all notifications
// @route   DELETE /api/notifications
// @access  Private
const deleteAllNotifications = async (req, res) => {
    try {
        const result = await Notification.deleteMany({
            recipient: req.user._id
        });

        res.status(200).json({
            success: true,
            data: {
                deletedCount: result.deletedCount,
                message: `${result.deletedCount} notifications deleted`
            }
        });
    } catch (error) {
        console.error('Delete all notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting all notifications'
        });
    }
};

// @desc    Create notification (internal use - called from other controllers)
// @access  Private
const createNotification = async (data) => {
    try {
        const notification = new Notification({
            recipient: data.recipient,
            sender: data.sender || null,
            type: data.type,
            title: data.title,
            message: data.message,
            relatedTo: data.relatedTo || null,
            actionUrl: data.actionUrl || null,
            priority: data.priority || 'medium'
        });

        await notification.save();
        
        // Populate sender info before returning
        const populatedNotification = await Notification.findById(notification._id)
            .populate('sender', 'name email avatar')
            .lean();

        return populatedNotification;
    } catch (error) {
        console.error('Create notification error:', error);
        throw error;
    }
};

// @desc    Send donation request notification to donors
// @access  Private
const sendDonationRequestNotification = async (donationRequest, donors) => {
    try {
        const notifications = donors.map(donor => ({
            recipient: donor._id,
            sender: donationRequest.requester,
            type: 'donation_request',
            title: 'New Blood Donation Request',
            message: `A new blood donation request (${donationRequest.bloodGroup}) has been posted in your area`,
            relatedTo: donationRequest._id,
            actionUrl: `/dashboard/donation-requests/${donationRequest._id}`,
            priority: 'high'
        }));

        await Notification.insertMany(notifications);
        
        return notifications.length;
    } catch (error) {
        console.error('Send donation request notifications error:', error);
        throw error;
    }
};

// @desc    Send donation status update notification
// @access  Private
const sendDonationStatusNotification = async (donationRequest, donorId, status) => {
    try {
        let title, message;
        
        switch (status) {
            case 'inprogress':
                title = 'Donation Request Accepted';
                message = 'Your donation request has been accepted by a donor';
                break;
            case 'done':
                title = 'Donation Completed';
                message = 'The blood donation has been successfully completed';
                break;
            case 'canceled':
                title = 'Donation Cancelled';
                message = 'The donation request has been cancelled';
                break;
            default:
                title = 'Donation Status Updated';
                message = `Your donation request status has been updated to ${status}`;
        }

        // Notify requester
        const requesterNotification = await createNotification({
            recipient: donationRequest.requester,
            sender: donorId,
            type: 'donation_status',
            title,
            message,
            relatedTo: donationRequest._id,
            actionUrl: `/dashboard/donation-requests/${donationRequest._id}`,
            priority: 'medium'
        });

        // Notify donor if different from requester
        if (donorId && donorId.toString() !== donationRequest.requester.toString()) {
            await createNotification({
                recipient: donorId,
                sender: donationRequest.requester,
                type: 'donation_status',
                title: `Donation ${status === 'done' ? 'Completed' : 'Updated'}`,
                message: `You ${status === 'done' ? 'successfully donated blood' : `status updated to ${status}`}`,
                relatedTo: donationRequest._id,
                actionUrl: `/dashboard/donation-requests/${donationRequest._id}`,
                priority: 'medium'
            });
        }

        return requesterNotification;
    } catch (error) {
        console.error('Send donation status notification error:', error);
        throw error;
    }
};

// @desc    Send user status change notification
// @access  Private
const sendUserStatusNotification = async (userId, status, adminId) => {
    try {
        const title = status === 'blocked' ? 'Account Blocked' : 'Account Unblocked';
        const message = status === 'blocked' 
            ? 'Your account has been blocked by an administrator' 
            : 'Your account has been unblocked and is now active';

        const notification = await createNotification({
            recipient: userId,
            sender: adminId,
            type: 'account_status',
            title,
            message,
            priority: 'high'
        });

        return notification;
    } catch (error) {
        console.error('Send user status notification error:', error);
        throw error;
    }
};

// @desc    Send role change notification
// @access  Private
const sendRoleChangeNotification = async (userId, newRole, adminId) => {
    try {
        const notification = await createNotification({
            recipient: userId,
            sender: adminId,
            type: 'role_change',
            title: 'Role Updated',
            message: `Your role has been changed to ${newRole}`,
            priority: 'medium'
        });

        return notification;
    } catch (error) {
        console.error('Send role change notification error:', error);
        throw error;
    }
};

// @desc    Send funding notification
// @access  Private
const sendFundingNotification = async (funding, adminId) => {
    try {
        const notification = await createNotification({
            recipient: adminId,
            sender: funding.user,
            type: 'funding_received',
            title: 'New Funding Received',
            message: `${funding.userName || 'A user'} donated ${funding.amount} BDT`,
            relatedTo: funding._id,
            actionUrl: `/dashboard/funding`,
            priority: 'low'
        });

        return notification;
    } catch (error) {
        console.error('Send funding notification error:', error);
        throw error;
    }
};

module.exports = {
    getNotifications,
    getNotificationCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    createNotification,
    sendDonationRequestNotification,
    sendDonationStatusNotification,
    sendUserStatusNotification,
    sendRoleChangeNotification,
    sendFundingNotification
};