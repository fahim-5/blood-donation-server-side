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
            const Model = require(`../models/${modelName}`);
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
                if (resource.user.toString() === req.user._id.toString()) {
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

module.exports = {
    authorize,
    isAdmin,
    isVolunteer,
    isDonor,
    isOwnerOrAdmin
};