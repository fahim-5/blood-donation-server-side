// server/src/controllers/searchController.js
import User from "../models/User.js";
import DonationRequest from "../models/DonationRequest.js";
import Funding from "../models/Funding.js";
import Contact from "../models/Contact.js";
import ActivityLog from "../models/ActivityLog.js";
import asyncHandler from "../middleware/asyncHandler.js";
import ErrorResponse from "../utils/errorResponse.js";

// @desc    Search donors with filters
// @route   GET /api/search/donors
// @access  Public
export const searchDonors = asyncHandler(async (req, res, next) => {
  const {
    bloodGroup,
    district,
    upazila,
    page = 1,
    limit = 20,
    sortBy = "relevance",
    sortOrder = "desc",
    availableOnly = true,
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Build filter for donors
  const filter = {
    role: "donor",
    status: "active",
  };

  // Apply blood group filter
  if (bloodGroup && bloodGroup !== "all") {
    filter.bloodGroup = bloodGroup.toUpperCase();
  }

  // Apply location filters
  if (district && district !== "all") {
    filter.district = district;
  }

  if (upazila && upazila !== "all") {
    filter.upazila = upazila;
  }

  // Apply availability filter
  if (availableOnly === "true") {
    filter.isAvailable = true;

    // Also check eligibility based on last donation date
    filter.$or = [
      { lastDonationDate: null },
      {
        lastDonationDate: {
          $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        },
      },
    ];
  }

  // Sorting logic
  const sort = {};
  switch (sortBy) {
    case "recent":
      sort.createdAt = sortOrder === "desc" ? -1 : 1;
      break;
    case "donations":
      sort.totalDonations = sortOrder === "desc" ? -1 : 1;
      break;
    case "name":
      sort.name = sortOrder === "desc" ? -1 : 1;
      break;
    case "location":
      sort.district = sortOrder === "desc" ? -1 : 1;
      sort.upazila = sortOrder === "desc" ? -1 : 1;
      break;
    default: // relevance - prioritize available donors with matching blood group
      sort.isAvailable = -1;
      sort.totalDonations = -1;
      sort.lastDonationDate = 1; // Those who haven't donated recently first
  }

  // Execute query with pagination
  const [donors, total] = await Promise.all([
    User.find(filter)
      .select("-password -notificationPreferences")
      .skip(skip)
      .limit(limitNum)
      .sort(sort),
    User.countDocuments(filter),
  ]);

  // Enrich donors with additional information
  const enrichedDonors = await Promise.all(
    donors.map(async (donor) => {
      const donorObj = donor.toObject();

      // Calculate eligibility
      let isEligible = true;
      let eligibilityMessage = "Available for donation";
      let daysSinceLastDonation = null;

      if (donor.lastDonationDate) {
        daysSinceLastDonation = Math.floor(
          (new Date() - new Date(donor.lastDonationDate)) /
            (1000 * 60 * 60 * 24)
        );

        if (daysSinceLastDonation < 90) {
          isEligible = false;
          const daysLeft = 90 - daysSinceLastDonation;
          eligibilityMessage = `Can donate in ${daysLeft} days`;
        }
      }

      // Get donor's recent donation history
      const recentDonations = await DonationRequest.find({
        donor: donor._id,
        status: "done",
        isActive: true,
      })
        .sort({ donationDate: -1 })
        .limit(3)
        .select("recipientName donationDate bloodGroup");

      // Get donor's location details
      const locationDetails = {
        district: donor.district,
        upazila: donor.upazila,
        fullAddress: `${donor.upazila}, ${donor.district}`,
      };

      // Calculate response rate (if donor has been contacted before)
      const acceptedRequests = await DonationRequest.countDocuments({
        donor: donor._id,
        status: "done",
      });

      const totalRequests = await DonationRequest.countDocuments({
        donor: donor._id,
      });

      const responseRate =
        totalRequests > 0
          ? Math.round((acceptedRequests / totalRequests) * 100)
          : 100;

      return {
        ...donorObj,
        eligibility: {
          isEligible,
          message: eligibilityMessage,
          lastDonationDate: donor.lastDonationDate,
          daysSinceLastDonation,
          nextEligibleDate: donor.lastDonationDate
            ? new Date(
                new Date(donor.lastDonationDate).getTime() +
                  90 * 24 * 60 * 60 * 1000
              )
            : null,
        },
        statistics: {
          totalDonations: donor.totalDonations || 0,
          recentDonations: recentDonations.length,
          responseRate: `${responseRate}%`,
          successRate: donor.totalDonations > 0 ? "100%" : "0%",
        },
        location: locationDetails,
        recentActivity: recentDonations,
        contactInfo: {
          canContact: donor.isAvailable && isEligible,
          lastActive: donor.updatedAt,
        },
      };
    })
  );

  // Get search statistics
  const searchStats = await User.aggregate([
    {
      $match: {
        role: "donor",
        status: "active",
        ...(bloodGroup && bloodGroup !== "all"
          ? { bloodGroup: bloodGroup.toUpperCase() }
          : {}),
        ...(district && district !== "all" ? { district } : {}),
        ...(upazila && upazila !== "all" ? { upazila } : {}),
      },
    },
    {
      $facet: {
        bloodGroupStats: [
          {
            $group: {
              _id: "$bloodGroup",
              count: { $sum: 1 },
              available: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$isAvailable", true] },
                        {
                          $or: [
                            { $eq: ["$lastDonationDate", null] },
                            {
                              $lt: [
                                {
                                  $divide: [
                                    {
                                      $subtract: [
                                        new Date(),
                                        "$lastDonationDate",
                                      ],
                                    },
                                    1000 * 60 * 60 * 24,
                                  ],
                                },
                                90,
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { count: -1 } },
        ],
        locationStats: [
          {
            $group: {
              _id: {
                district: "$district",
                upazila: "$upazila",
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        eligibilityStats: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              available: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$isAvailable", true] },
                        {
                          $or: [
                            { $eq: ["$lastDonationDate", null] },
                            {
                              $lt: [
                                {
                                  $divide: [
                                    {
                                      $subtract: [
                                        new Date(),
                                        "$lastDonationDate",
                                      ],
                                    },
                                    1000 * 60 * 60 * 24,
                                  ],
                                },
                                90,
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
      },
    },
  ]);

  // Log search activity if user is logged in
  if (req.user) {
    await ActivityLog.logActivity({
      user: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: "Searched for Donors",
      actionType: "search",
      category: "search",
      description: `Searched donors with filters: Blood Group=${
        bloodGroup || "Any"
      }, District=${district || "Any"}, Upazila=${upazila || "Any"}`,
      details: `Found ${total} donors matching criteria`,
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
    count: enrichedDonors.length,
    total,
    filters: {
      bloodGroup: bloodGroup || "Any",
      district: district || "Any",
      upazila: upazila || "Any",
      availableOnly: availableOnly === "true",
      sortBy,
      sortOrder,
    },
    statistics: searchStats.length > 0 ? searchStats[0] : {},
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasNextPage: pageNum * limitNum < total,
      hasPrevPage: pageNum > 1,
    },
    data: enrichedDonors,
  });
});

// @desc    Search donation requests
// @route   GET /api/search/donation-requests
// @access  Public
export const searchDonationRequests = asyncHandler(async (req, res, next) => {
  const {
    bloodGroup,
    district,
    upazila,
    status = "pending",
    urgency,
    page = 1,
    limit = 20,
    sortBy = "urgency",
    sortOrder = "desc",
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Build filter for donation requests
  const filter = {
    isActive: true,
    status: status,
  };

  // Apply blood group filter
  if (bloodGroup && bloodGroup !== "all") {
    filter.bloodGroup = bloodGroup.toUpperCase();
  }

  // Apply location filters
  if (district && district !== "all") {
    filter.recipientDistrict = district;
  }

  if (upazila && upazila !== "all") {
    filter.recipientUpazila = upazila;
  }

  // Apply urgency filter
  if (urgency && urgency !== "all") {
    filter.urgency = urgency;
  }

  // Exclude expired donations
  const now = new Date();
  filter.$or = [
    { donationDate: { $gte: now } },
    { donationDate: { $exists: false } },
  ];

  // Sorting logic
  const sort = {};
  switch (sortBy) {
    case "date":
      sort.donationDate = sortOrder === "desc" ? -1 : 1;
      break;
    case "created":
      sort.createdAt = sortOrder === "desc" ? -1 : 1;
      break;
    case "hospital":
      sort.hospitalName = sortOrder === "desc" ? -1 : 1;
      break;
    default: // urgency
      sort.urgency = sortOrder === "desc" ? -1 : 1;
      sort.donationDate = 1; // Soonest first
  }

  // Execute query
  const [requests, total] = await Promise.all([
    DonationRequest.find(filter)
      .populate("requester", "name email avatar phone")
      .populate("donor", "name email avatar")
      .skip(skip)
      .limit(limitNum)
      .sort(sort),
    DonationRequest.countDocuments(filter),
  ]);

  // Get search statistics
  const searchStats = await DonationRequest.aggregate([
    {
      $match: {
        isActive: true,
        status: status,
        ...(bloodGroup && bloodGroup !== "all"
          ? { bloodGroup: bloodGroup.toUpperCase() }
          : {}),
        ...(district && district !== "all"
          ? { recipientDistrict: district }
          : {}),
        ...(upazila && upazila !== "all" ? { recipientUpazila: upazila } : {}),
        ...(urgency && urgency !== "all" ? { urgency } : {}),
      },
    },
    {
      $facet: {
        bloodGroupStats: [
          {
            $group: {
              _id: "$bloodGroup",
              count: { $sum: 1 },
              urgent: {
                $sum: {
                  $cond: [{ $in: ["$urgency", ["high", "critical"]] }, 1, 0],
                },
              },
            },
          },
          { $sort: { count: -1 } },
        ],
        locationStats: [
          {
            $group: {
              _id: {
                district: "$recipientDistrict",
                upazila: "$recipientUpazila",
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        urgencyStats: [
          {
            $group: {
              _id: "$urgency",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        hospitalStats: [
          {
            $group: {
              _id: "$hospitalName",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);

  // Log search activity
  if (req.user) {
    await ActivityLog.logActivity({
      user: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: "Searched for Donation Requests",
      actionType: "search",
      category: "search",
      description: `Searched donation requests with filters: Blood Group=${
        bloodGroup || "Any"
      }, District=${district || "Any"}, Status=${status}`,
      details: `Found ${total} requests matching criteria`,
      status: "success",
      userIp: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  res.status(200).json({
    success: true,
    count: requests.length,
    total,
    filters: {
      bloodGroup: bloodGroup || "Any",
      district: district || "Any",
      upazila: upazila || "Any",
      status,
      urgency: urgency || "Any",
      sortBy,
      sortOrder,
    },
    statistics: searchStats.length > 0 ? searchStats[0] : {},
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasNextPage: pageNum * limitNum < total,
      hasPrevPage: pageNum > 1,
    },
    data: requests,
  });
});

// @desc    Global search across all entities
// @route   GET /api/search/global
// @access  Private (based on role)
export const globalSearch = asyncHandler(async (req, res, next) => {
  const { q: searchQuery, type = "all", page = 1, limit = 10 } = req.query;

  if (!searchQuery || searchQuery.trim().length < 2) {
    return next(
      new ErrorResponse("Search query must be at least 2 characters", 400)
    );
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const searchRegex = { $regex: searchQuery, $options: "i" };
  let results = [];
  let total = 0;
  let entityCounts = {};

  // Determine what to search based on user role and type parameter
  const searchTypes =
    type === "all" ? ["users", "donations", "fundings", "contacts"] : [type];

  // Build search promises based on types
  const searchPromises = [];

  // Search Users
  if (searchTypes.includes("users")) {
    const userFilter = {
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ],
    };

    // Role-based filtering for users
    if (req.user.role === "donor") {
      userFilter.role = "donor"; // Donors can only see other donors
    }

    searchPromises.push(
      User.find(userFilter)
        .select("-password")
        .skip(type === "users" ? skip : 0)
        .limit(type === "users" ? limitNum : 5)
        .then((users) => ({
          type: "users",
          data: users,
          total:
            type === "users"
              ? User.countDocuments(userFilter)
              : Promise.resolve(users.length),
        }))
    );
  }

  // Search Donation Requests
  if (
    searchTypes.includes("donations") &&
    (req.user.role === "admin" || req.user.role === "volunteer")
  ) {
    const donationFilter = {
      isActive: true,
      $or: [
        { recipientName: searchRegex },
        { hospitalName: searchRegex },
        { hospitalAddress: searchRegex },
        { requesterName: searchRegex },
        { donorName: searchRegex },
      ],
    };

    searchPromises.push(
      DonationRequest.find(donationFilter)
        .populate("requester", "name email")
        .populate("donor", "name email")
        .skip(type === "donations" ? skip : 0)
        .limit(type === "donations" ? limitNum : 5)
        .then((donations) => ({
          type: "donations",
          data: donations,
          total:
            type === "donations"
              ? DonationRequest.countDocuments(donationFilter)
              : Promise.resolve(donations.length),
        }))
    );
  }

  // Search Fundings (admin/volunteer only)
  if (
    searchTypes.includes("fundings") &&
    (req.user.role === "admin" || req.user.role === "volunteer")
  ) {
    const fundingFilter = {
      $or: [
        { donorName: searchRegex },
        { donorEmail: searchRegex },
        { receiptNumber: searchRegex },
        { stripePaymentId: searchRegex },
      ],
    };

    searchPromises.push(
      Funding.find(fundingFilter)
        .populate("donor", "name email")
        .skip(type === "fundings" ? skip : 0)
        .limit(type === "fundings" ? limitNum : 5)
        .then((fundings) => ({
          type: "fundings",
          data: fundings,
          total:
            type === "fundings"
              ? Funding.countDocuments(fundingFilter)
              : Promise.resolve(fundings.length),
        }))
    );
  }

  // Search Contacts (admin/volunteer only)
  if (
    searchTypes.includes("contacts") &&
    (req.user.role === "admin" || req.user.role === "volunteer")
  ) {
    const contactFilter = {
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { subject: searchRegex },
        { message: searchRegex },
      ],
    };

    searchPromises.push(
      Contact.find(contactFilter)
        .populate("user", "name email")
        .populate("assignedTo", "name email")
        .skip(type === "contacts" ? skip : 0)
        .limit(type === "contacts" ? limitNum : 5)
        .then((contacts) => ({
          type: "contacts",
          data: contacts,
          total:
            type === "contacts"
              ? Contact.countDocuments(contactFilter)
              : Promise.resolve(contacts.length),
        }))
    );
  }

  // Execute all search promises
  const searchResults = await Promise.all(
    searchPromises.map((p) =>
      p.then(async (result) => ({
        type: result.type,
        data: result.data,
        total: await result.total,
      }))
    )
  );

  // Combine results
  results = searchResults.flatMap((result) =>
    result.data.map((item) => ({
      ...item.toObject(),
      _type: result.type.slice(0, -1), // Remove 's' for singular
      type: result.type,
    }))
  );

  // Calculate totals
  entityCounts = searchResults.reduce((acc, result) => {
    acc[result.type] = result.total;
    return acc;
  }, {});

  total = results.length;

  // Sort results by relevance
  results.sort((a, b) => {
    // Priority: exact matches in name/title first
    const aName = a.name || a.recipientName || a.donorName || "";
    const bName = b.name || b.recipientName || b.donorName || "";

    const aExactMatch = aName.toLowerCase() === searchQuery.toLowerCase();
    const bExactMatch = bName.toLowerCase() === searchQuery.toLowerCase();

    if (aExactMatch && !bExactMatch) return -1;
    if (!aExactMatch && bExactMatch) return 1;

    // Then by type priority
    const typePriority = { users: 1, donations: 2, fundings: 3, contacts: 4 };
    return typePriority[a.type] - typePriority[b.type];
  });

  // Apply pagination if searching all types
  if (type === "all") {
    results = results.slice(skip, skip + limitNum);
  }

  // Log search activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Performed Global Search",
    actionType: "search",
    category: "search",
    description: `Global search for "${searchQuery}"`,
    details: `Types: ${searchTypes.join(", ")}, Found ${total} results`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
    request: {
      method: req.method,
      url: req.originalUrl,
      queryParams: req.query,
    },
  });

  res.status(200).json({
    success: true,
    query: searchQuery,
    count: results.length,
    total,
    entityCounts,
    filters: {
      type,
      page: pageNum,
      limit: limitNum,
    },
    pagination:
      type === "all"
        ? {
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            hasNextPage: pageNum * limitNum < total,
            hasPrevPage: pageNum > 1,
          }
        : null,
    data: results,
  });
});

// @desc    Get available filters for search
// @route   GET /api/search/filters
// @access  Public
export const getSearchFilters = asyncHandler(async (req, res, next) => {
  const { type = "donors" } = req.query;

  let filters = {};

  switch (type) {
    case "donors":
      // Get unique blood groups from donors
      const bloodGroups = await User.distinct("bloodGroup", {
        role: "donor",
        status: "active",
        bloodGroup: { $ne: null },
      });

      // Get unique districts from donors
      const donorDistricts = await User.distinct("district", {
        role: "donor",
        status: "active",
        district: { $ne: null, $ne: "" },
      });

      // Get upazilas based on selected district
      let donorUpazilas = [];
      if (req.query.district) {
        donorUpazilas = await User.distinct("upazila", {
          role: "donor",
          status: "active",
          district: req.query.district,
          upazila: { $ne: null, $ne: "" },
        });
      }

      filters = {
        bloodGroups: bloodGroups.sort(),
        districts: donorDistricts.sort(),
        upazilas: donorUpazilas.sort(),
        sortOptions: [
          { value: "relevance", label: "Most Relevant" },
          { value: "recent", label: "Most Recent" },
          { value: "donations", label: "Most Donations" },
          { value: "name", label: "Name (A-Z)" },
          { value: "location", label: "Location" },
        ],
        availabilityOptions: [
          { value: "true", label: "Available Only" },
          { value: "false", label: "All Donors" },
        ],
      };
      break;

    case "donation-requests":
      // Get unique blood groups from donation requests
      const requestBloodGroups = await DonationRequest.distinct("bloodGroup", {
        isActive: true,
        status: "pending",
        bloodGroup: { $ne: null },
      });

      // Get unique districts from donation requests
      const requestDistricts = await DonationRequest.distinct(
        "recipientDistrict",
        {
          isActive: true,
          status: "pending",
          recipientDistrict: { $ne: null, $ne: "" },
        }
      );

      // Get upazilas based on selected district
      let requestUpazilas = [];
      if (req.query.district) {
        requestUpazilas = await DonationRequest.distinct("recipientUpazila", {
          isActive: true,
          status: "pending",
          recipientDistrict: req.query.district,
          recipientUpazila: { $ne: null, $ne: "" },
        });
      }

      filters = {
        bloodGroups: requestBloodGroups.sort(),
        districts: requestDistricts.sort(),
        upazilas: requestUpazilas.sort(),
        statusOptions: [
          { value: "pending", label: "Pending" },
          { value: "inprogress", label: "In Progress" },
          { value: "all", label: "All Statuses" },
        ],
        urgencyOptions: [
          { value: "all", label: "All Urgency Levels" },
          { value: "critical", label: "Critical" },
          { value: "high", label: "High" },
          { value: "medium", label: "Medium" },
          { value: "low", label: "Low" },
        ],
        sortOptions: [
          { value: "urgency", label: "Urgency (High to Low)" },
          { value: "date", label: "Date (Soonest First)" },
          { value: "created", label: "Recently Created" },
          { value: "hospital", label: "Hospital Name" },
        ],
      };
      break;

    case "global":
      filters = {
        searchTypes: [
          { value: "all", label: "All" },
          { value: "users", label: "Users" },
          { value: "donations", label: "Donation Requests" },
          { value: "fundings", label: "Donations" },
          { value: "contacts", label: "Contacts" },
        ],
        minQueryLength: 2,
      };

      // Add role-specific filters
      if (req.user) {
        if (req.user.role === "admin" || req.user.role === "volunteer") {
          filters.adminFilters = {
            quickFilters: [
              { value: "urgent", label: "Urgent Requests" },
              { value: "unverified", label: "Unverified Donations" },
              { value: "blocked", label: "Blocked Users" },
            ],
          };
        }
      }
      break;

    default:
      return next(new ErrorResponse("Invalid search type", 400));
  }

  // Add common location data
  filters.locationData = {
    allDistricts: districts.map((d) => ({ value: d.name, label: d.name })),
    allUpazilas: upazilas.map((u) => ({
      value: u.name,
      label: u.name,
      district: u.district,
    })),
  };

  res.status(200).json({
    success: true,
    type,
    data: filters,
  });
});

// @desc    Quick search for urgent needs
// @route   GET /api/search/urgent
// @access  Public
export const getUrgentNeeds = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 5;

  // Get urgent donation requests
  const urgentRequests = await DonationRequest.find({
    isActive: true,
    status: "pending",
    urgency: { $in: ["high", "critical"] },
    donationDate: { $gte: new Date() }, // Not expired
  })
    .populate("requester", "name email avatar")
    .select(
      "recipientName bloodGroup hospitalName donationDate urgency recipientDistrict recipientUpazila"
    )
    .sort({ urgency: -1, donationDate: 1 })
    .limit(limit);

  // Get rare blood group needs
  const rareBloodGroups = ["AB-", "B-", "A-", "O-"];
  const rareBloodNeeds = await DonationRequest.find({
    isActive: true,
    status: "pending",
    bloodGroup: { $in: rareBloodGroups },
    donationDate: { $gte: new Date() },
  })
    .select("bloodGroup recipientDistrict recipientUpazila donationDate")
    .sort({ donationDate: 1 })
    .limit(limit);

  // Group rare blood needs by type
  const rareBloodStats = {};
  rareBloodNeeds.forEach((need) => {
    if (!rareBloodStats[need.bloodGroup]) {
      rareBloodStats[need.bloodGroup] = [];
    }
    rareBloodStats[need.bloodGroup].push({
      location: `${need.recipientUpazila}, ${need.recipientDistrict}`,
      date: need.donationDate,
    });
  });

  // Get locations with most urgent needs
  const locationStats = await DonationRequest.aggregate([
    {
      $match: {
        isActive: true,
        status: "pending",
        urgency: { $in: ["high", "critical"] },
        donationDate: { $gte: new Date() },
      },
    },
    {
      $group: {
        _id: {
          district: "$recipientDistrict",
          upazila: "$recipientUpazila",
        },
        count: { $sum: 1 },
        bloodGroups: { $addToSet: "$bloodGroup" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  res.status(200).json({
    success: true,
    data: {
      urgentRequests,
      rareBloodNeeds: rareBloodStats,
      hotspotLocations: locationStats,
      summary: {
        totalUrgent: urgentRequests.length,
        totalRareBlood: Object.keys(rareBloodStats).length,
        hotspotCount: locationStats.length,
      },
    },
  });
});

// @desc    Export search results as PDF
// @route   POST /api/search/export
// @access  Private
export const exportSearchResults = asyncHandler(async (req, res, next) => {
  const { type, filters, format = "pdf" } = req.body;

  if (!type || !filters) {
    return next(new ErrorResponse("Type and filters are required", 400));
  }

  let data;
  let fileName;
  let exportData;

  switch (type) {
    case "donors":
      // Apply filters and get donors
      const donorFilter = {
        role: "donor",
        status: "active",
      };

      if (filters.bloodGroup && filters.bloodGroup !== "all") {
        donorFilter.bloodGroup = filters.bloodGroup.toUpperCase();
      }
      if (filters.district && filters.district !== "all") {
        donorFilter.district = filters.district;
      }
      if (filters.upazila && filters.upazila !== "all") {
        donorFilter.upazila = filters.upazila;
      }
      if (filters.availableOnly) {
        donorFilter.isAvailable = true;
      }

      data = await User.find(donorFilter)
        .select(
          "name email bloodGroup district upazila phone totalDonations lastDonationDate isAvailable"
        )
        .sort({ name: 1 });

      exportData = data.map((donor) => ({
        Name: donor.name,
        Email: donor.email,
        "Blood Group": donor.bloodGroup,
        District: donor.district,
        Upazila: donor.upazila,
        Phone: donor.phone || "N/A",
        "Total Donations": donor.totalDonations || 0,
        "Last Donation": donor.lastDonationDate
          ? new Date(donor.lastDonationDate).toLocaleDateString()
          : "Never",
        "Currently Available": donor.isAvailable ? "Yes" : "No",
      }));

      fileName = `donors_${filters.bloodGroup || "all"}_${
        filters.district || "all"
      }_${new Date().toISOString().split("T")[0]}`;
      break;

    case "donation-requests":
      const requestFilter = {
        isActive: true,
        status: filters.status || "pending",
      };

      if (filters.bloodGroup && filters.bloodGroup !== "all") {
        requestFilter.bloodGroup = filters.bloodGroup.toUpperCase();
      }
      if (filters.district && filters.district !== "all") {
        requestFilter.recipientDistrict = filters.district;
      }
      if (filters.upazila && filters.upazila !== "all") {
        requestFilter.recipientUpazila = filters.upazila;
      }
      if (filters.urgency && filters.urgency !== "all") {
        requestFilter.urgency = filters.urgency;
      }

      data = await DonationRequest.find(requestFilter)
        .populate("requester", "name email phone")
        .select(
          "recipientName bloodGroup hospitalName hospitalAddress donationDate donationTime urgency status"
        )
        .sort({ donationDate: 1 });

      exportData = data.map((request) => ({
        "Patient Name": request.recipientName,
        "Blood Group": request.bloodGroup,
        Hospital: request.hospitalName,
        Address: request.hospitalAddress,
        "Donation Date": new Date(request.donationDate).toLocaleDateString(),
        "Donation Time": request.donationTime,
        Urgency: request.urgency,
        Status: request.status,
        "Requester Name": request.requester?.name || "N/A",
        "Requester Contact": request.requester?.phone || "N/A",
      }));

      fileName = `donation_requests_${filters.status || "pending"}_${
        new Date().toISOString().split("T")[0]
      }`;
      break;

    default:
      return next(new ErrorResponse("Invalid export type", 400));
  }

  // Log export activity
  await ActivityLog.logActivity({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: "Exported Search Results",
    actionType: "read",
    category: "search",
    description: `Exported ${type} search results`,
    details: `Filters: ${JSON.stringify(
      filters
    )}, Format: ${format}, Records: ${exportData.length}`,
    status: "success",
    userIp: req.ip,
    userAgent: req.headers["user-agent"],
  });

  if (format === "csv") {
    // Convert to CSV
    const { Parser } = require("json2csv");
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(exportData);

    res.header("Content-Type", "text/csv");
    res.attachment(`${fileName}.csv`);
    return res.send(csv);
  }

  // Default: Return JSON data for frontend to generate PDF
  res.status(200).json({
    success: true,
    data: exportData,
    metadata: {
      type,
      filters,
      exportedAt: new Date(),
      recordCount: exportData.length,
      fileName: `${fileName}.${format}`,
    },
  });
});
