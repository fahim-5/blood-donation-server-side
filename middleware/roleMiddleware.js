import User from '../models/User.js';
import DonationRequest from '../models/DonationRequest.js';
import Funding from '../models/Funding.js';

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `User role ${req.user.role} is not authorized to access this route`
            });
        }

        next();
    };
};

const isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Require admin role'
        });
    }
    next();
};

const isVolunteer = (req, res, next) => {
    if (!req.user || !['admin', 'volunteer'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Require volunteer or admin role'
        });
    }
    next();
};

const isDonor = (req, res, next) => {
    if (!req.user || !['admin', 'volunteer', 'donor'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Require donor role or higher'
        });
    }
    next();
};

const isOwnerOrAdmin = (modelName) => {
    return async (req, res, next) => {
        try {
            let Model;
            
            // Dynamically import the model based on modelName
            switch (modelName) {
                case 'User':
                    Model = User;
                    break;
                case 'DonationRequest':
                    Model = DonationRequest;
                    break;
                case 'Funding':
                    Model = Funding;
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid model name'
                    });
            }
            
            const resource = await Model.findById(req.params.id);
            
            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: 'Resource not found'
                });
            }

            if (req.user.role === 'admin') {
                return next();
            }

            if (modelName === 'User' && resource._id.toString() === req.user._id.toString()) {
                return next();
            }

            if (modelName === 'DonationRequest') {
                if (resource.requester.toString() === req.user._id.toString()) {
                    return next();
                }
            }

            if (modelName === 'Funding') {
                if (resource.user && resource.user.toString() === req.user._id.toString()) {
                    return next();
                }
                // Check donor field as well
                if (resource.donor && resource.donor.toString() === req.user._id.toString()) {
                    return next();
                }
            }

            return res.status(403).json({
                success: false,
                message: 'Not authorized to perform this action'
            });
        } catch (error) {
            console.error('Owner or admin middleware error:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    };
};

// Export as ES6 named exports
export {
    authorize,
    isAdmin,
    isVolunteer,
    isDonor,
    isOwnerOrAdmin
};

// Also export a default object if needed
export default {
    authorize,
    isAdmin,
    isVolunteer,
    isDonor,
    isOwnerOrAdmin
};