// server/src/controllers/authController.js
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const imageBB = require('../utils/imageBB');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

// Send response with token
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = generateToken(user._id);

  // Cookie options
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  };

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).cookie('token', token, cookieOptions).json({
    success: true,
    token,
    data: {
      user,
    },
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      bloodGroup,
      district,
      upazila,
      phone,
    } = req.body;

    // Validate password match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match',
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email',
      });
    }

    // Handle avatar upload
    let avatarUrl = '';
    if (req.files && req.files.avatar) {
      try {
        const avatar = req.files.avatar;
        const uploadResult = await imageBB.uploadImage(avatar);
        avatarUrl = uploadResult.url;
      } catch (uploadError) {
        console.error('Avatar upload error:', uploadError);
        // Continue without avatar if upload fails
      }
    }

    // Create user
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      avatar: avatarUrl,
      bloodGroup: bloodGroup.toUpperCase(),
      district,
      upazila,
      phone: phone || '',
    });

    // Log activity
    await ActivityLog.logActivity({
      user: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'User Registration',
      actionType: 'register',
      category: 'authentication',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      description: `New user registered: ${user.name} (${user.email})`,
      details: `Role: ${user.role}, Blood Group: ${user.bloodGroup}, Location: ${user.upazila}, ${user.district}`,
      status: 'success',
      userIp: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Create welcome notification
    await Notification.createSystemNotification({
      recipient: user._id,
      recipientEmail: user.email,
      title: 'Welcome to Blood Donation App! 🎉',
      message: `Hello ${user.name}, thank you for registering as a blood donor. Your contribution can save lives!`,
      type: 'success',
      category: 'user',
      priority: 'medium',
      actionUrl: '/dashboard/profile',
      data: { welcome: true },
    });

    sendTokenResponse(user, 201, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password',
      });
    }

    // Check for user
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password'
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Check if user is blocked
    if (user.status === 'blocked') {
      // Log blocked login attempt
      await ActivityLog.logActivity({
        user: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        action: 'Blocked Login Attempt',
        actionType: 'login',
        category: 'security',
        entityType: 'user',
        entityId: user._id,
        entityName: user.name,
        description: `Blocked user attempted to login: ${user.email}`,
        details: 'User account is blocked by admin',
        status: 'failed',
        severity: 'warning',
        userIp: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(403).json({
        success: false,
        error: 'Your account has been blocked. Please contact admin.',
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      // Log failed login attempt
      await ActivityLog.logActivity({
        user: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        action: 'Failed Login Attempt',
        actionType: 'login',
        category: 'security',
        entityType: 'user',
        entityId: user._id,
        entityName: user.name,
        description: `Failed login attempt for: ${user.email}`,
        details: 'Invalid password provided',
        status: 'failed',
        severity: 'warning',
        userIp: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Update last login (you can add this field to User model if needed)
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Log successful login
    await ActivityLog.logActivity({
      user: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'User Login',
      actionType: 'login',
      category: 'authentication',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      description: `User logged in: ${user.name}`,
      details: `Role: ${user.role}, IP: ${req.ip}`,
      status: 'success',
      userIp: req.ip,
      userAgent: req.headers['user-agent'],
    });

    sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user / clear cookie
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    // Log logout activity
    if (req.user) {
      await ActivityLog.logActivity({
        user: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'User Logout',
        actionType: 'logout',
        category: 'authentication',
        entityType: 'user',
        entityId: req.user._id,
        entityName: req.user.name,
        description: `User logged out: ${req.user.name}`,
        status: 'success',
        userIp: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    res.cookie('token', 'none', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user details
// @route   PUT /api/auth/updatedetails
// @access  Private
exports.updateDetails = async (req, res, next) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      phone: req.body.phone,
    };

    // Handle avatar upload if provided
    if (req.files && req.files.avatar) {
      try {
        const avatar = req.files.avatar;
        const uploadResult = await imageBB.uploadImage(avatar);
        fieldsToUpdate.avatar = uploadResult.url;
      } catch (uploadError) {
        console.error('Avatar upload error:', uploadError);
        // Don't fail the request if avatar upload fails
      }
    }

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true,
    });

    // Log profile update
    await ActivityLog.logActivity({
      user: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'Profile Updated',
      actionType: 'update',
      category: 'profile',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      description: `User updated profile: ${user.name}`,
      details: `Updated fields: ${Object.keys(fieldsToUpdate).join(', ')}`,
      status: 'success',
      userIp: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(req.body.currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
      });
    }

    // Validate new password
    if (req.body.newPassword !== req.body.confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'New passwords do not match',
      });
    }

    // Update password
    user.password = req.body.newPassword;
    await user.save();

    // Log password change
    await ActivityLog.logActivity({
      user: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'Password Changed',
      actionType: 'update',
      category: 'security',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      description: `User changed password: ${user.name}`,
      status: 'success',
      severity: 'info',
      userIp: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Create notification for password change
    await Notification.createSystemNotification({
      recipient: user._id,
      recipientEmail: user.email,
      title: 'Password Changed Successfully 🔒',
      message: `Your password was changed successfully on ${new Date().toLocaleDateString()}. If you didn't make this change, please contact support immediately.`,
      type: 'info',
      category: 'security',
      priority: 'medium',
      actionUrl: '/dashboard/profile',
      data: { security: true },
    });

    sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'No user found with that email',
      });
    }

    // Generate reset token (you can implement this in User model)
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set token expire time (10 minutes)
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    // Log forgot password request
    await ActivityLog.logActivity({
      user: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'Forgot Password Request',
      actionType: 'security',
      category: 'security',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      description: `Password reset requested for: ${user.email}`,
      status: 'success',
      severity: 'info',
      userIp: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Create reset URL
    const resetUrl = `${req.protocol}://${req.get(
      'host'
    )}/api/auth/resetpassword/${resetToken}`;

    // Create notification
    await Notification.createSystemNotification({
      recipient: user._id,
      recipientEmail: user.email,
      title: 'Password Reset Requested',
      message: `You requested a password reset. If you didn't make this request, please ignore this notification.`,
      type: 'info',
      category: 'security',
      priority: 'medium',
      actionUrl: `/reset-password?token=${resetToken}`,
      data: { resetToken, resetUrl },
    });

    res.status(200).json({
      success: true,
      message: 'Password reset email sent',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Log password reset
    await ActivityLog.logActivity({
      user: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'Password Reset Successful',
      actionType: 'security',
      category: 'security',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name,
      description: `Password reset completed for: ${user.email}`,
      status: 'success',
      severity: 'info',
      userIp: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Create notification
    await Notification.createSystemNotification({
      recipient: user._id,
      recipientEmail: user.email,
      title: 'Password Reset Successful ✅',
      message: `Your password has been successfully reset. You can now login with your new password.`,
      type: 'success',
      category: 'security',
      priority: 'medium',
      actionUrl: '/login',
      data: { passwordReset: true },
    });

    sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Check if email exists
// @route   GET /api/auth/check-email/:email
// @access  Public
exports.checkEmail = async (req, res, next) => {
  try {
    const email = req.params.email.toLowerCase();
    const exists = await User.emailExists(email);

    res.status(200).json({
      success: true,
      exists,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh token
// @route   POST /api/auth/refresh-token
// @access  Private
exports.refreshToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};