import User from '../models/User.js';
import crypto from 'crypto';
import sendEmail from '../utils/emailService.js';
import logger from '../middleware/loggerMiddleware.js';

const authController = {
  // Register user
  register: async (req, res) => {
    try {
      const { name, email, password, bloodGroup, district, upazila, avatar } = req.body;
      
      // Check if user exists
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({
          success: false,
          message: 'User already exists'
        });
      }
      
      // Create user
      const user = await User.create({
        name,
        email,
        password,
        bloodGroup,
        district,
        upazila,
        avatar
      });
      
      // Generate token
      const token = user.generateAuthToken();
      
      res.status(201).json({
        success: true,
        data: {
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            bloodGroup: user.bloodGroup,
            district: user.district,
            upazila: user.upazila,
            avatar: user.avatar,
            role: user.role
          },
          token
        },
        message: 'Registration successful'
      });
    } catch (error) {
      logger.error(`Registration error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error during registration'
      });
    }
  },

  // Login user
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Check if user exists
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
      // Check password
      const isPasswordMatch = await user.comparePassword(password);
      if (!isPasswordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
      // Check if user is active
      if (user.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Account is not active. Please contact support.'
        });
      }
      
      // Generate token
      const token = user.generateAuthToken();
      
      // Update last login
      user.lastLogin = new Date();
      await user.save();
      
      res.status(200).json({
        success: true,
        data: {
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            bloodGroup: user.bloodGroup,
            district: user.district,
            upazila: user.upazila,
            avatar: user.avatar,
            role: user.role,
            lastDonationDate: user.lastDonationDate
          },
          token
        },
        message: 'Login successful'
      });
    } catch (error) {
      logger.error(`Login error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error during login'
      });
    }
  },

  // Get current user
  getCurrentUser: async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select('-password');
      
      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error(`Get current user error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error fetching user'
      });
    }
  },

  // Refresh token
  refreshToken: async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token required'
        });
      }
      
      // Verify refresh token and generate new access token
      // Implementation depends on your token strategy
      
      res.status(200).json({
        success: true,
        data: {
          token: 'new-access-token'
        }
      });
    } catch (error) {
      logger.error(`Refresh token error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error refreshing token'
      });
    }
  },

  // Forgot password
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found with this email'
        });
      }
      
      // Generate reset token
      const resetToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });
      
      // Create reset URL
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
      
      // Send email
      try {
        await sendEmail({
          to: user.email,
          subject: 'Password Reset Request',
          template: 'password-reset',
          data: {
            name: user.name,
            resetUrl,
            expiryTime: '10 minutes'
          }
        });
        
        res.status(200).json({
          success: true,
          message: 'Password reset email sent successfully'
        });
      } catch (emailError) {
        // Reset token fields if email fails
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });
        
        logger.error(`Email send error: ${emailError.message}`);
        return res.status(500).json({
          success: false,
          message: 'Failed to send reset email. Please try again.'
        });
      }
    } catch (error) {
      logger.error(`Forgot password error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error processing password reset'
      });
    }
  },

  // Reset password
  resetPassword: async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;
      
      // Hash token to compare with stored token
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
      
      // Find user with valid token
      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }
      });
      
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }
      
      // Update password
      user.password = password;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      
      // Generate new token
      const authToken = user.generateAuthToken();
      
      res.status(200).json({
        success: true,
        data: {
          token: authToken
        },
        message: 'Password reset successful'
      });
    } catch (error) {
      logger.error(`Reset password error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error resetting password'
      });
    }
  },

  // Change password
  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id).select('+password');
      
      // Check current password
      const isPasswordMatch = await user.comparePassword(currentPassword);
      if (!isPasswordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      
      // Update password
      user.password = newPassword;
      await user.save();
      
      // Generate new token
      const token = user.generateAuthToken();
      
      res.status(200).json({
        success: true,
        data: {
          token
        },
        message: 'Password changed successfully'
      });
    } catch (error) {
      logger.error(`Change password error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error changing password'
      });
    }
  },

  // Logout
  logout: async (req, res) => {
    try {
      // In a stateless JWT setup, logout is client-side
      // Just return success
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error(`Logout error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error during logout'
      });
    }
  },

  // Get all users (admin only)
  getAllUsers: async (req, res) => {
    try {
      const { page = 1, limit = 10, search = '' } = req.query;
      
      const query = {};
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      
      const users = await User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();
      
      const total = await User.countDocuments(query);
      
      res.status(200).json({
        success: true,
        data: {
          users,
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error(`Get all users error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Server error fetching users'
      });
    }
  }
};

export default authController;