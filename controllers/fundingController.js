// server/src/controllers/fundingController.js
import Funding from "../models/Funding.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import ActivityLog from "../models/ActivityLog.js";
import asyncHandler from "../middleware/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";
import Stripe from "stripe";

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

// Helper functions
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  try {
    const { metadata, id, receipt_url, customer } = paymentIntent;

    // Find funding by Stripe session ID
    const funding = await Funding.findOne({ stripeSessionId: id });

    if (!funding) {
      console.error("Funding not found for payment intent:", id);
      return;
    }

    // Update funding as succeeded
    await funding.markAsSucceeded({
      stripePaymentId: id,
      receiptUrl: receipt_url || "",
      stripeCustomerId: customer,
    });

    // Update user's funding statistics
    await User.findByIdAndUpdate(funding.donor, {
      $inc: { totalFundings: 1 },
    });

    // Create success notification
    await Notification.createSystemNotification({
      recipient: funding.donor,
      recipientEmail: funding.donorEmail,
      title: "Donation Successful! 🎉",
      message: `Thank you for your donation of ${funding.formattedAmount}. Your contribution helps save lives!`,
      type: "success",
      category: "funding",
      priority: "medium",
      actionUrl: `/dashboard/funding/${funding._id}`,
      data: {
        fundingId: funding._id,
        amount: funding.amount,
        receiptNumber: funding.receiptNumber,
      },
    });

    // Log activity
    await ActivityLog.logActivity({
      user: funding.donor,
      userName: funding.donorName,
      userEmail: funding.donorEmail,
      userRole: "donor",
      action: "Payment Succeeded",
      actionType: "update",
      category: "funding",
      entityType: "funding",
      entityId: funding._id,
      description: `Payment succeeded for ${funding.formattedAmount}`,
      details: `Stripe Payment ID: ${id}, Receipt: ${funding.receiptNumber}`,
      status: "success",
    });

    console.log(`Payment succeeded for funding ${funding._id}`);
  } catch (error) {
    console.error("Error handling payment intent succeeded:", error);
  }
};

const handlePaymentIntentFailed = async (paymentIntent) => {
  try {
    const { id, last_payment_error } = paymentIntent;

    const funding = await Funding.findOne({ stripeSessionId: id });

    if (!funding) {
      console.error("Funding not found for failed payment intent:", id);
      return;
    }

    // Update funding as failed
    funding.status = "failed";
    funding.metadata.lastError = last_payment_error || {};
    await funding.save();

    // Create failure notification
    await Notification.createSystemNotification({
      recipient: funding.donor,
      recipientEmail: funding.donorEmail,
      title: "Payment Failed ❌",
      message: `Your donation of ${funding.formattedAmount} failed to process. Please try again or contact support.`,
      type: "error",
      category: "funding",
      priority: "medium",
      actionUrl: `/funding/donate`,
      data: {
        fundingId: funding._id,
        error: last_payment_error?.message || "Payment failed",
      },
    });

    console.log(`Payment failed for funding ${funding._id}`);
  } catch (error) {
    console.error("Error handling payment intent failed:", error);
  }
};

const handleChargeRefunded = async (charge) => {
  try {
    const { id, refunds } = charge;

    // Find funding by Stripe payment ID
    const funding = await Funding.findOne({ stripePaymentId: id });

    if (!funding) {
      console.error("Funding not found for refunded charge:", id);
      return;
    }

    // Update funding as refunded
    const latestRefund = refunds.data[0];
    await funding.processRefund({
      amount: latestRefund.amount / 100, // Convert from cents
      reason: "Refund processed via Stripe",
      stripeRefundId: latestRefund.id,
    });

    // Create refund notification
    await Notification.createSystemNotification({
      recipient: funding.donor,
      recipientEmail: funding.donorEmail,
      title: "Donation Refunded",
      message: `Your donation of ${funding.formattedAmount} has been refunded.`,
      type: "info",
      category: "funding",
      priority: "medium",
      actionUrl: `/dashboard/funding/${funding._id}`,
      data: {
        fundingId: funding._id,
        refundAmount: latestRefund.amount / 100,
        refundId: latestRefund.id,
      },
    });

    console.log(`Refund processed for funding ${funding._id}`);
  } catch (error) {
    console.error("Error handling charge refunded:", error);
  }
};

// @desc    Get all fundings (Admin/Volunteer only)
// @route   GET /api/fundings
// @access  Private/Admin/Volunteer
export const getAllFundings = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = {};

  // Role-based filtering
  if (req.user.role === "donor") {
    // Donors can only see their own donations
    filter.donor = req.user.id;
  }

  // Additional filters
  if (req.query.status) filter.status = req.query.status;
  if (req.query.donationType) filter.donationType = req.query.donationType;
  if (req.query.isAnonymous)
    filter.isAnonymous = req.query.isAnonymous === "true";

  // Date filtering
  if (req.query.startDate || req.query.endDate) {
    filter.transactionDate = {};
    if (req.query.startDate)
      filter.transactionDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate)
      filter.transactionDate.$lte = new Date(req.query.endDate);
  }

  // Search filter
  if (req.query.search) {
    filter.$or = [
      { donorName: { $regex: req.query.search, $options: "i" } },
      { donorEmail: { $regex: req.query.search, $options: "i" } },
      { receiptNumber: { $regex: req.query.search, $options: "i" } },
      { stripePaymentId: { $regex: req.query.search, $options: "i" } },
    ];
  }

  // Sorting
  const sort = {};
  if (req.query.sort) {
    const sortField = req.query.sort.startsWith("-")
      ? req.query.sort.substring(1)
      : req.query.sort;
    sort[sortField] = req.query.sort.startsWith("-") ? -1 : 1;
  } else {
    sort.transactionDate = -1; // Default: newest first
  }

  const [fundings, total] = await Promise.all([
    Funding.find(filter)
      .populate("donor", "name email avatar")
      .skip(skip)
      .limit(limit)
      .sort(sort),
    Funding.countDocuments(filter),
  ]);

  // Get funding statistics
  const stats = await Funding.aggregate([
    {
      $match: filter,
    },
    {
      $facet: {
        // Total amount
        totalAmount: [
          {
            $match: {
              status: "succeeded",
              $or: [{ refund: { $exists: false } }, { "refund.amount": 0 }],
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ],
        // Status distribution
        statusDistribution: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              amount: { $sum: "$amount" },
            },
          },
        ],
        // Donation type distribution
        typeDistribution: [
          {
            $match: { status: "succeeded" },
          },
          {
            $group: {
              _id: "$donationType",
              count: { $sum: 1 },
              amount: { $sum: "$amount" },
            },
          },
        ],
        // Monthly trends
        monthlyTrends: [
          {
            $match: { status: "succeeded" },
          },
          {
            $group: {
              _id: {
                year: { $year: "$transactionDate" },
                month: { $month: "$transactionDate" },
              },
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
          { $limit: 12 },
        ],
        // Top donors
        topDonors: [
          {
            $match: {
              status: "succeeded",
              isAnonymous: false,
            },
          },
          {
            $group: {
              _id: "$donor",
              donorName: { $first: "$donorName" },
              totalAmount: { $sum: "$amount" },
              donationCount: { $sum: 1 },
            },
          },
          { $sort: { totalAmount: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);

  res.status(200).json({
    success: true,
    count: fundings.length,
    total,
    statistics: stats.length > 0 ? stats[0] : {},
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
    data: fundings,
  });
});

// @desc    Get single funding
// @route   GET /api/fundings/:id
// @access  Private
export const getFunding = asyncHandler(async (req, res, next) => {
  const funding = await Funding.findById(req.params.id)
    .populate("donor", "name email avatar")
    .populate("verifiedBy", "name email");

  if (!funding) {
    return next(
      new ErrorResponse(`Funding not found with id ${req.params.id}`, 404)
    );
  }

  // Check authorization
  if (
    req.user.role !== "admin" &&
    funding.donor._id.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to view this funding", 403));
  }

  res.status(200).json({
    success: true,
    data: funding,
  });
});

// @desc    Create payment intent for Stripe
// @route   POST /api/fundings/create-payment-intent
// @access  Private
export const createPaymentIntent = asyncHandler(async (req, res, next) => {
  const {
    amount,
    currency = "BDT",
    donationType = "general",
    message = "",
    isAnonymous = false,
    displayName = "",
  } = req.body;

  // Validate amount
  if (!amount || amount < 10) {
    return next(new ErrorResponse("Minimum donation amount is 10 BDT", 400));
  }

  if (amount > 100000) {
    return next(
      new ErrorResponse("Maximum donation amount is 100,000 BDT", 400)
    );
  }

  // Convert BDT to USD for Stripe (approximate conversion)
  let stripeAmount = amount;
  let stripeCurrency = currency.toLowerCase();

  if (currency === "BDT") {
    // Convert BDT to USD (approximate rate, use real exchange rate in production)
    stripeAmount = Math.round(amount * 0.009); // 1 BDT ≈ 0.009 USD
    stripeCurrency = "usd";

    // Ensure minimum amount for Stripe (0.50 USD)
    if (stripeAmount < 50) {
      // 50 cents = 0.50 USD
      stripeAmount = 50;
    }
  }

  // Create Stripe customer if doesn't exist
  let customerId = null;
  if (req.user.stripeCustomerId) {
    customerId = req.user.stripeCustomerId;
  } else {
    const customer = await stripeInstance.customers.create({
      email: req.user.email,
      name: req.user.name,
      metadata: {
        userId: req.user.id,
        userRole: req.user.role,
      },
    });
    customerId = customer.id;

    // Save customer ID to user
    await User.findByIdAndUpdate(req.user.id, { stripeCustomerId: customerId });
  }

  // Create payment intent
  const paymentIntent = await stripeInstance.paymentIntents.create({
    amount: stripeAmount,
    currency: stripeCurrency,
    customer: customerId,
    metadata: {
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      originalAmount: amount,
      originalCurrency: currency,
      donationType,
      isAnonymous: isAnonymous.toString(),
      displayName,
    },
    description: `Blood Donation App - ${donationType} donation`,
  });

  // Create funding record in pending state
  const funding = await Funding.create({
    donor: req.user.id,
    donorName: req.user.name,
    donorEmail: req.user.email,
    amount,
    currency,
    paymentMethod: "stripe",
    stripeCustomerId: customerId,
    stripeSessionId: paymentIntent.id,
    status: "pending",
    donationType,
    message,
    isAnonymous,
    displayName: isAnonymous && displayName ? displayName : "",
    metadata: {
      stripePaymentIntentId: paymentIntent.id,
      stripeClientSecret: paymentIntent.client_secret,
      originalAmount: amount,
      convertedAmount: stripeAmount,
      convertedCurrency: stripeCurrency,
    },
  });

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Created Payment Intent",
    actionType: "create",
    category: "funding",
    entityType: "funding",
    entityId: funding._id,
    description: `Created payment intent for ${amount} ${currency}`,
    details: `Donation type: ${donationType}, Anonymous: ${isAnonymous}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res.status(201).json({
    success: true,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    fundingId: funding._id,
    data: {
      funding,
      stripe: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerId,
      },
    },
  });
});

// @desc    Handle Stripe webhook
// @route   POST /api/fundings/webhook
// @access  Public (Stripe calls this)
export const handleWebhook = asyncHandler(async (req, res, next) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripeInstance.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  res.json({ received: true });
});

// @desc    Create manual funding (admin only - for cash/check donations)
// @route   POST /api/fundings/manual
// @access  Private/Admin
export const createManualFunding = asyncHandler(async (req, res, next) => {
  const {
    donorId,
    amount,
    currency = "BDT",
    paymentMethod,
    donationType = "general",
    message = "",
    isAnonymous = false,
    displayName = "",
    transactionDate,
  } = req.body;

  // Validate input
  if (!donorId || !amount || !paymentMethod) {
    return next(
      new ErrorResponse(
        "Donor ID, amount, and payment method are required",
        400
      )
    );
  }

  if (amount < 10) {
    return next(new ErrorResponse("Minimum donation amount is 10 BDT", 400));
  }

  // Get donor info
  const donor = await User.findById(donorId);
  if (!donor) {
    return next(new ErrorResponse("Donor not found", 404));
  }

  // Create funding record
  const funding = await Funding.create({
    donor: donor._id,
    donorName: donor.name,
    donorEmail: donor.email,
    amount,
    currency,
    paymentMethod,
    status: "succeeded", // Manual donations are immediately successful
    donationType,
    message,
    isAnonymous,
    displayName: isAnonymous && displayName ? displayName : "",
    transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
    isVerified: true,
    verifiedBy: req.user.id,
    verifiedAt: new Date(),
    receiptNumber: `MAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  });

  // Update donor's funding statistics
  await User.findByIdAndUpdate(donor._id, {
    $inc: { totalFundings: 1 },
  });

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Created Manual Funding",
    actionType: "create",
    category: "funding",
    entityType: "funding",
    entityId: funding._id,
    description: `Created manual funding for ${donor.name}: ${amount} ${currency}`,
    details: `Payment method: ${paymentMethod}, Type: ${donationType}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Create notification for donor
  await Notification.createSystemNotification({
    recipient: donor._id,
    recipientEmail: donor.email,
    title: "Manual Donation Recorded ✅",
    message: `A manual donation of ${funding.formattedAmount} has been recorded in your name. Thank you for your contribution!`,
    type: "success",
    category: "funding",
    priority: "medium",
    actionUrl: `/dashboard/funding/${funding._id}`,
    data: {
      fundingId: funding._id,
      amount: funding.amount,
      receiptNumber: funding.receiptNumber,
      recordedBy: req.user.name,
    },
    sender: req.user._id,
    senderName: req.user.name,
    senderRole: req.user.role,
  });

  res.status(201).json({
    success: true,
    data: funding,
    message: "Manual funding recorded successfully",
  });
});

// @desc    Verify funding (admin only)
// @route   PATCH /api/fundings/:id/verify
// @access  Private/Admin
export const verifyFunding = asyncHandler(async (req, res, next) => {
  const funding = await Funding.findById(req.params.id);

  if (!funding) {
    return next(
      new ErrorResponse(`Funding not found with id ${req.params.id}`, 404)
    );
  }

  if (funding.isVerified) {
    return next(new ErrorResponse("Funding is already verified", 400));
  }

  funding.isVerified = true;
  funding.verifiedBy = req.user.id;
  funding.verifiedAt = new Date();

  // If status is pending, mark as succeeded
  if (funding.status === "pending") {
    funding.status = "succeeded";
    funding.transactionDate = new Date();
  }

  await funding.save();

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Verified Funding",
    actionType: "verify",
    category: "funding",
    entityType: "funding",
    entityId: funding._id,
    description: `Verified funding ${funding.receiptNumber}`,
    details: `Amount: ${funding.formattedAmount}, Donor: ${funding.donorName}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Notify donor
  await Notification.createSystemNotification({
    recipient: funding.donor,
    recipientEmail: funding.donorEmail,
    title: "Donation Verified ✅",
    message: `Your donation of ${funding.formattedAmount} has been verified by an administrator. Thank you for your support!`,
    type: "success",
    category: "funding",
    priority: "medium",
    actionUrl: `/dashboard/funding/${funding._id}`,
    data: {
      fundingId: funding._id,
      verifiedBy: req.user.name,
      verifiedAt: funding.verifiedAt,
    },
    sender: req.user._id,
    senderName: req.user.name,
    senderRole: req.user.role,
  });

  res.status(200).json({
    success: true,
    data: funding,
    message: "Funding verified successfully",
  });
});

// @desc    Process refund (admin only)
// @route   POST /api/fundings/:id/refund
// @access  Private/Admin
export const processRefund = asyncHandler(async (req, res, next) => {
  const { amount, reason } = req.body;

  if (!amount || amount <= 0) {
    return next(new ErrorResponse("Valid refund amount is required", 400));
  }

  const funding = await Funding.findById(req.params.id);

  if (!funding) {
    return next(
      new ErrorResponse(`Funding not found with id ${req.params.id}`, 404)
    );
  }

  if (funding.status !== "succeeded") {
    return next(
      new ErrorResponse("Only successful payments can be refunded", 400)
    );
  }

  if (funding.refund?.amount > 0) {
    return next(new ErrorResponse("Funding has already been refunded", 400));
  }

  if (amount > funding.amount) {
    return next(
      new ErrorResponse(
        "Refund amount cannot exceed original donation amount",
        400
      )
    );
  }

  // Process Stripe refund if it was a Stripe payment
  let stripeRefundId = "";
  if (funding.paymentMethod === "stripe" && funding.stripePaymentId) {
    try {
      const refund = await stripeInstance.refunds.create({
        payment_intent: funding.stripePaymentId,
        amount: Math.round(amount * 100), // Convert to cents
        reason: "requested_by_customer",
      });
      stripeRefundId = refund.id;
    } catch (stripeError) {
      console.error("Stripe refund error:", stripeError);
      return next(
        new ErrorResponse(`Stripe refund failed: ${stripeError.message}`, 500)
      );
    }
  }

  // Update funding with refund
  await funding.processRefund({
    amount,
    reason: reason || "Refund requested",
    processedBy: req.user.id,
    stripeRefundId,
  });

  // Log activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Processed Refund",
    actionType: "update",
    category: "funding",
    entityType: "funding",
    entityId: funding._id,
    description: `Processed refund for funding ${funding.receiptNumber}`,
    details: `Amount: ${amount}, Reason: ${reason || "Not specified"}`,
    status: "success",
    severity: "warning",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Notify donor
  await Notification.createSystemNotification({
    recipient: funding.donor,
    recipientEmail: funding.donorEmail,
    title: "Donation Refunded",
    message: `Your donation of ${
      funding.formattedAmount
    } has been partially refunded. Refund amount: ${
      funding.currency === "BDT" ? "৳" : "$"
    }${amount.toLocaleString()}`,
    type: "info",
    category: "funding",
    priority: "medium",
    actionUrl: `/dashboard/funding/${funding._id}`,
    data: {
      fundingId: funding._id,
      refundAmount: amount,
      reason: reason || "Not specified",
      processedBy: req.user.name,
    },
  });

  res.status(200).json({
    success: true,
    data: funding,
    message: "Refund processed successfully",
  });
});

// @desc    Get funding statistics
// @route   GET /api/fundings/stats
// @access  Private/Admin
export const getFundingStats = asyncHandler(async (req, res, next) => {
  // Get date ranges
  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  const stats = await Funding.aggregate([
    {
      $match: {
        status: "succeeded",
        $or: [{ refund: { $exists: false } }, { "refund.amount": 0 }],
      },
    },
    {
      $facet: {
        // Overall totals
        overall: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
              totalDonations: { $sum: 1 },
              avgDonation: { $avg: "$amount" },
            },
          },
        ],
        // Time-based stats
        today: [
          {
            $match: {
              transactionDate: { $gte: startOfToday },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ],
        thisWeek: [
          {
            $match: {
              transactionDate: { $gte: startOfWeek },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ],
        thisMonth: [
          {
            $match: {
              transactionDate: { $gte: startOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ],
        thisYear: [
          {
            $match: {
              transactionDate: { $gte: startOfYear },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ],
        // Donation type distribution
        byType: [
          {
            $group: {
              _id: "$donationType",
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { amount: -1 } },
        ],
        // Payment method distribution
        byMethod: [
          {
            $group: {
              _id: "$paymentMethod",
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { amount: -1 } },
        ],
        // Anonymous vs named
        anonymity: [
          {
            $group: {
              _id: "$isAnonymous",
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ],
        // Monthly trends
        monthlyTrends: [
          {
            $group: {
              _id: {
                year: { $year: "$transactionDate" },
                month: { $month: "$transactionDate" },
              },
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
          { $limit: 12 },
        ],
        // Top donors
        topDonors: [
          {
            $match: {
              isAnonymous: false,
            },
          },
          {
            $group: {
              _id: "$donor",
              donorName: { $first: "$donorName" },
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { amount: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "donorDetails",
            },
          },
          {
            $unwind: "$donorDetails",
          },
          {
            $project: {
              donorId: "$_id",
              donorName: 1,
              amount: 1,
              count: 1,
              avatar: "$donorDetails.avatar",
              bloodGroup: "$donorDetails.bloodGroup",
              location: {
                $concat: [
                  "$donorDetails.upazila",
                  ", ",
                  "$donorDetails.district",
                ],
              },
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
    thisYear: stats[0].thisYear.length > 0 ? stats[0].thisYear[0] : null,
    byType: stats[0].byType,
    byMethod: stats[0].byMethod,
    anonymity: stats[0].anonymity,
    monthlyTrends: stats[0].monthlyTrends,
    topDonors: stats[0].topDonors,
  };

  res.status(200).json({
    success: true,
    data: result,
  });
});

// @desc    Get recent donations for public display
// @route   GET /api/fundings/recent
// @access  Public
export const getRecentDonations = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;

  const recentDonations = await Funding.find({
    status: "succeeded",
    isVerified: true,
  })
    .populate("donor", "name avatar bloodGroup")
    .select(
      "donorName amount currency transactionDate message isAnonymous displayName"
    )
    .sort({ transactionDate: -1 })
    .limit(limit);

  // Format for public display (hide email, show display name for anonymous)
  const formattedDonations = recentDonations.map((donation) => {
    const donationObj = donation.toObject();

    if (donation.isAnonymous) {
      donationObj.displayName = donation.displayName || "Anonymous Hero";
      delete donationObj.donorName;
      delete donationObj.donorEmail;
    }

    if (donation.donor && donation.donor.avatar) {
      donationObj.avatar = donation.donor.avatar;
    }

    return donationObj;
  });

  res.status(200).json({
    success: true,
    count: formattedDonations.length,
    data: formattedDonations,
  });
});