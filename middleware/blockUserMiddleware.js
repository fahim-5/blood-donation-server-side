import User from "../models/User.js";

const checkBlockedUser = async (req, res, next) => {
  try {
    if (!req.user) {
      return next();
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.status === "blocked") {
      // Log out the user by clearing token
      if (req.headers.authorization) {
        // Invalidate token or handle logout
      }

      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact administrator.",
        status: "blocked",
      });
    }

    next();
  } catch (error) {
    console.error("Blocked user middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const preventBlockedUserAction = (actions = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const user = await User.findById(req.user._id);

      if (user.status === "blocked") {
        const action = req.method + " " + req.baseUrl + req.path;

        if (actions.includes(action) || actions.includes("*")) {
          return res.status(403).json({
            success: false,
            message: "Blocked users cannot perform this action",
          });
        }
      }

      next();
    } catch (error) {
      console.error("Prevent blocked user action error:", error);
      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };
};

const checkUserStatusBeforeRequest = async (req, res, next) => {
  try {
    if (req.body.email) {
      const user = await User.findOne({ email: req.body.email });

      if (user && user.status === "blocked") {
        return res.status(403).json({
          success: false,
          message:
            "This account has been blocked. Please contact administrator.",
        });
      }
    }

    next();
  } catch (error) {
    console.error("Check user status before request error:", error);
    next();
  }
};

const adminOnlyBlocking = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Only administrators can block/unblock users",
    });
  }
  next();
};

// Export as ES6
export {
  checkBlockedUser,
  preventBlockedUserAction,
  checkUserStatusBeforeRequest,
  adminOnlyBlocking,
};

export default {
  checkBlockedUser,
  preventBlockedUserAction,
  checkUserStatusBeforeRequest,
  adminOnlyBlocking,
};
