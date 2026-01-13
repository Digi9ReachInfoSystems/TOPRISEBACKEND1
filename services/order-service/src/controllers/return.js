const Return = require("../models/return");
const Order = require("../models/order");
const { sendSuccess, sendError } = require("/packages/utils/responseHandler");
const logger = require("/packages/utils/logger");
const axios = require("axios");
const {
  createUnicastOrMulticastNotificationUtilityFunction,
} = require("/packages/utils/notificationService");

// Product service URL for checking returnable status
const PRODUCT_SERVICE_URL =
  process.env.PRODUCT_SERVICE_URL || "http://product-service:5001/products/v1";

// User service URL for fetching user details
const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://user-service:5001/api/users";
const mongoose = require("mongoose");
/**
 * 1. Create Return Request - Customer initiates return
 */
exports.createReturnRequest = async (req, res) => {
  try {
    const {
      orderId,
      sku,
      quantity = 1,
      returnReason,
      returnDescription,
      returnImages = [],
    } = req.body;

    const customerId = req.user?.id || req.body.customerId;

    if (!orderId || !sku || !returnReason || !customerId) {
      return sendError(
        res,
        "Missing required fields: orderId, sku, returnReason, customerId"
      );
    }

    // Check if return already exists for this order and SKU
    const existingReturn = await Return.findOne({ orderId, sku });
    console.log("Existing Return:", existingReturn);
    if (existingReturn) {
      return sendError(
        res,
        "Return request already exists for this order and SKU"
      );
    }

    // Fetch order details
    const order = await Order.findById(orderId);
    if (!order) {
      return sendError(res, "Order not found");
    }

    // Check if customer owns this order
    if (order.customerDetails?.userId !== customerId) {
      return sendError(res, "Unauthorized: Order does not belong to customer");
    }

    // Find the specific SKU in the order
    const orderSku = order.skus.find((s) => s.sku === sku);
    if (!orderSku) {
      return sendError(res, "SKU not found in order");
    }

    // console.log("Order SKU:", orderSku,"orderSku.totalPrice",orderSku.totalPrice);
    // Check if quantity is valid
    if (quantity > orderSku.quantity) {
      return sendError(res, "Return quantity cannot exceed ordered quantity");
    }

    // Validate return eligibility
    // const eligibilityResult = await validateReturnEligibility(order, sku);
    // console.log("Eligibility Result:", eligibilityResult);
    // if (!eligibilityResult.isEligible) {
    //   return sendError(res, "Return is not eligible");
    // }
    // Create return request
    const returnRequest = await Return.create({
      orderId,
      customerId,
      sku,
      quantity,
      returnReason,
      returnDescription,
      returnImages,
      isEligible: true,
      isWithinReturnWindow: true,
      // isEligible: eligibilityResult.isEligible,
      // eligibilityReason: eligibilityResult.reason,
      // isWithinReturnWindow: eligibilityResult.isWithinReturnWindow,
      // isProductReturnable: eligibilityResult.isProductReturnable,
      // returnWindowDays: eligibilityResult.returnWindowDays,
      originalOrderDate: order.orderDate,
      originalDeliveryDate: order.skus.find((s) => s.sku === sku)?.tracking_info
        ?.timestamps?.deliveredAt,
      dealerId: order.dealerMapping.find((d) => d.sku === sku)?.dealerId,
      returnStatus: "Requested",
      refund: {
        refundAmount: orderSku.totalPrice,
      },
      timestamps: {
        requestedAt: new Date(),
      },
    });

    order.skus = order.skus.map((s) => {
      if (s.sku === sku) {
        s.return_info = {
          ...s.return_info,
          is_returned: true,
          return_id: returnRequest._id,

        };
      }
      return s;
    });
    // console.log("Updated Order SKUs:", order.skus);
    order.markModified("skus");
    await order.save();
    // Send notification to customer
    // await createUnicastOrMulticastNotificationUtilityFunction(
    //   [customerId],
    //   ["INAPP", "PUSH"],
    //   "Return Request Created",
    //   `Your return request for ${sku} has been ${eligibilityResult.isEligible ? "validated" : "submitted for review"
    //   }`,
    //   "",
    //   "",
    //   "Return",
    //   { returnId: returnRequest._id },
    //   req.headers.authorization
    // );

    // // If eligible, automatically schedule pickup
    // if (eligibilityResult.isEligible) {
    //   await schedulePickup(returnRequest._id, req.headers.authorization);
    // }

    return sendSuccess(
      res,
      returnRequest,
      "Return request created successfully"
    );
  } catch (error) {
    console.log("Error:", error);
    logger.error("Create return request error:", error);
    return sendError(res, "Failed to create return request");
  }
};

/**
 * 2. Validate Return Request - System validates eligibility
 */
exports.validateReturnRequest = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    // Fetch order details
    const order = await Order.findById(returnRequest.orderId);
    if (!order) {
      return sendError(res, "Order not found");
    }

    // Validate return eligibility
    const eligibilityResult = await validateReturnEligibility(
      order,
      returnRequest.sku
    );

    // Update return request
    returnRequest.isEligible = eligibilityResult.isEligible;
    returnRequest.eligibilityReason = eligibilityResult.reason;
    returnRequest.isWithinReturnWindow = eligibilityResult.isWithinReturnWindow;
    returnRequest.isProductReturnable = eligibilityResult.isProductReturnable;
    returnRequest.returnStatus = "Requested"
    // ? "Validated"
    // : "Requested";
    returnRequest.timestamps.validatedAt = new Date();

    await returnRequest.save();

    // Send notification to customer
    await createUnicastOrMulticastNotificationUtilityFunction(
      [returnRequest.customerId],
      ["INAPP", "PUSH"],
      "Return Request Validated",
      `Your return request has been ${eligibilityResult.isEligible ? "approved" : "rejected"
      }: ${eligibilityResult.reason}`,
      "",
      "",
      "Return",
      { returnId: returnRequest._id },
      req.headers.authorization
    );

    // If eligible, schedule pickup
    if (eligibilityResult.isEligible) {
      await schedulePickup(returnRequest._id, req.headers.authorization);
    }

    return sendSuccess(
      res,
      returnRequest,
      "Return request validated successfully"
    );
  } catch (error) {
    logger.error("Validate return request error:", error);
    return sendError(res, "Failed to validate return request");
  }
};

/**
 * 3. Schedule Pickup - Create pickup request with logistics partner
 */
exports.schedulePickup = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { scheduledDate, pickupAddress } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    if (returnRequest.returnStatus !== "Validated") {
      return sendError(
        res,
        "Return request must be validated before scheduling pickup"
      );
    }

    // Create pickup request with logistics partner
    const pickupRequest = await createLogisticsPickupRequest(
      returnRequest,
      scheduledDate,
      pickupAddress
    );

    // Update return request
    returnRequest.returnStatus = "Pickup_Scheduled";
    returnRequest.pickupRequest = {
      ...returnRequest.pickupRequest,
      ...pickupRequest,
    };
    returnRequest.timestamps.pickupScheduledAt = new Date();

    await returnRequest.save();

    // Send notification to customer
    await createUnicastOrMulticastNotificationUtilityFunction(
      [returnRequest.customerId],
      ["INAPP", "PUSH"],
      "Pickup Scheduled",
      `Pickup scheduled for your return on ${scheduledDate}`,
      "",
      "",
      "Return",
      { returnId: returnRequest._id },
      req.headers.authorization
    );

    return sendSuccess(res, returnRequest, "Pickup scheduled successfully");
  } catch (error) {
    logger.error("Schedule pickup error:", error);
    return sendError(res, "Failed to schedule pickup");
  }
};

/**
 * 4. Complete Pickup - Logistics partner completes pickup
 */
exports.completePickup = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { trackingNumber } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    if (returnRequest.returnStatus !== "Pickup_Scheduled") {
      return sendError(
        res,
        "Return request must be in Pickup_Scheduled status"
      );
    }

    // Update return request
    returnRequest.returnStatus = "Pickup_Completed";
    returnRequest.pickupRequest.completedDate = new Date();
    returnRequest.pickupRequest.trackingNumber = trackingNumber;
    returnRequest.timestamps.pickupCompletedAt = new Date();

    await returnRequest.save();

    // Send notification to dealer for inspection
    if (returnRequest.dealerId) {
      await createUnicastOrMulticastNotificationUtilityFunction(
        [returnRequest.dealerId],
        ["INAPP", "PUSH"],
        "Return Item Received",
        `Return item ${returnRequest.sku} received and ready for inspection`,
        "",
        "",
        "Return",
        { returnId: returnRequest._id },
        req.headers.authorization
      );
    }

    return sendSuccess(res, returnRequest, "Pickup completed successfully");
  } catch (error) {
    logger.error("Complete pickup error:", error);
    return sendError(res, "Failed to complete pickup");
  }
};

/**
 * 5. Start Inspection - Fulfillment Staff starts inspection
 */
exports.startInspection = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { staffId } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    if (returnRequest.returnStatus !== "Pickup_Completed") {
      return sendError(
        res,
        "Return request must be in Pickup_Completed status"
      );
    }

    // Update return request
    returnRequest.returnStatus = "Under_Inspection";
    returnRequest.inspection.inspectedBy = staffId;
    returnRequest.inspection.inspectedAt = new Date();
    returnRequest.timestamps.inspectionStartedAt = new Date();

    await returnRequest.save();

    return sendSuccess(res, returnRequest, "Inspection started successfully");
  } catch (error) {
    logger.error("Start inspection error:", error);
    return sendError(res, "Failed to start inspection");
  }
};

/**
 * 6. Complete Inspection - Fulfillment Staff completes inspection
 */
exports.completeInspection = async (req, res) => {
  try {
    const { returnId } = req.params;
    const {
      skuMatch,
      condition,
      conditionNotes,
      inspectionImages = [],
      isApproved,
      rejectionReason,
    } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    if (returnRequest.returnStatus !== "Under_Inspection") {
      return sendError(
        res,
        "Return request must be in Under_Inspection status"
      );
    }

    // Update inspection details
    returnRequest.inspection.skuMatch = skuMatch;
    returnRequest.inspection.condition = condition;
    returnRequest.inspection.conditionNotes = conditionNotes;
    returnRequest.inspection.inspectionImages = inspectionImages;
    returnRequest.inspection.isApproved = isApproved;
    returnRequest.inspection.rejectionReason = rejectionReason;
    returnRequest.timestamps.inspectionCompletedAt = new Date();

    // Update return status based on inspection result
    if (isApproved) {
      returnRequest.returnStatus = "Approved";
      returnRequest.actionTaken = "Refund";
    } else {
      returnRequest.returnStatus = "Rejected";
      returnRequest.actionTaken = "Rejected";
    }

    await returnRequest.save();

    // Send notification to customer
    const notificationTitle = isApproved
      ? "Return Approved"
      : "Return Rejected";
    const notificationBody = isApproved
      ? "Your return has been approved and will be processed for refund"
      : `Your return has been rejected: ${rejectionReason}`;

    await createUnicastOrMulticastNotificationUtilityFunction(
      [returnRequest.customerId],
      ["INAPP", "PUSH"],
      notificationTitle,
      notificationBody,
      "",
      "",
      "Return",
      { returnId: returnRequest._id },
      req.headers.authorization
    );

    // If approved, notify fulfillment admin for refund processing
    if (isApproved) {
      // Find fulfillment admin users
      const adminUsers = await findFulfillmentAdmins();
      if (adminUsers.length > 0) {
        await createUnicastOrMulticastNotificationUtilityFunction(
          adminUsers.map((u) => u._id),
          ["INAPP", "PUSH"],
          "Return Ready for Refund",
          `Return ${returnRequest.sku} approved and ready for refund processing`,
          "",
          "",
          "Return",
          { returnId: returnRequest._id },
          req.headers.authorization
        );
      }
    }

    return sendSuccess(res, returnRequest, "Inspection completed successfully");
  } catch (error) {
    logger.error("Complete inspection error:", error);
    return sendError(res, "Failed to complete inspection");
  }
};

/**
 * 7. Process Refund - Fulfillment Admin processes refund
 */
exports.processRefund = async (req, res) => {
  try {
    const { returnId } = req.params;
    const {
      adminId,
      refundMethod = "Original_Payment_Method",
      refundNotes,
    } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    if (returnRequest.returnStatus !== "Approved") {
      return sendError(
        res,
        "Return request must be approved before processing refund"
      );
    }

    // Process refund with payment gateway
    const refundResult = await processRefundPayment(
      returnRequest,
      refundMethod
    );

    if (!refundResult.success) {
      return sendError(
        res,
        `Refund processing failed: ${refundResult.message}`
      );
    }

    // Update return request
    returnRequest.returnStatus = "Refund_Processed";
    returnRequest.refund.processedBy = adminId;
    returnRequest.refund.processedAt = new Date();
    returnRequest.refund.refundMethod = refundMethod;
    returnRequest.refund.refundStatus = "Completed";
    returnRequest.refund.transactionId = refundResult.transactionId;
    returnRequest.refund.refundNotes = refundNotes;
    returnRequest.timestamps.refundProcessedAt = new Date();

    await returnRequest.save();

    // Send notification to customer
    await createUnicastOrMulticastNotificationUtilityFunction(
      [returnRequest.customerId],
      ["INAPP", "PUSH"],
      "Refund Processed",
      `Your refund of ₹${returnRequest.refund.refundAmount} has been processed successfully`,
      "",
      "",
      "Return",
      { returnId: returnRequest._id },
      req.headers.authorization
    );

    return sendSuccess(res, returnRequest, "Refund processed successfully");
  } catch (error) {
    logger.error("Process refund error:", error);
    return sendError(res, "Failed to process refund");
  }
};

/**
 * 8. Complete Return - Mark return as completed
 */
exports.completeReturn = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    if (returnRequest.returnStatus !== "Refund_Processed") {
      return sendError(
        res,
        "Return request must have refund processed before completion"
      );
    }

    // Update return request
    returnRequest.returnStatus = "Completed";
    returnRequest.timestamps.completedAt = new Date();

    await returnRequest.save();

    // Send final notification to customer
    await createUnicastOrMulticastNotificationUtilityFunction(
      [returnRequest.customerId],
      ["INAPP", "PUSH"],
      "Return Completed",
      "Your return process has been completed successfully",
      "",
      "",
      "Return",
      { returnId: returnRequest._id },
      req.headers.authorization
    );

    return sendSuccess(res, returnRequest, "Return completed successfully");
  } catch (error) {
    logger.error("Complete return error:", error);
    return sendError(res, "Failed to complete return");
  }
};

/**
 * Get Return Request by ID
 */
exports.getReturnRequest = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId).populate(
      "orderId",

    )
      .populate("refund.refund_id");
    // .populate('dealerId', 'dealerName');

    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    return sendSuccess(
      res,
      returnRequest,
      "Return request fetched successfully"
    );
  } catch (error) {
    logger.error("Get return request error:", error);
    return sendError(res, "Failed to get return request");
  }
};

/**
 * Get Return Requests with filters
 */

exports.getReturnRequests = async (req, res) => {
  try {
    const {
      customerId,
      status,
      dealerId,
      refundMethod,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 10,
      sortBy = "requestedAt",
      sortOrder = "desc",
    } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    /* ---------------- BASE FILTER ---------------- */
    const baseFilter = {};
    if (customerId) baseFilter.customerId = customerId;
    if (status) baseFilter.returnStatus = status;
    if (dealerId) baseFilter.dealerId = dealerId;
    if (refundMethod) baseFilter["refund.refundMethod"] = refundMethod;

    if (startDate && endDate) {
      baseFilter["timestamps.requestedAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    /* ---------------- SORT MAP ---------------- */
    const SORT_MAP = {
      requestedAt: "timestamps.requestedAt",
      createdAt: "createdAt",
      returnStatus: "returnStatus",
      sku: "sku",
      orderId: "order.orderId",
      customerName: "order.customerDetails.name",
    };

    const sortField = SORT_MAP[sortBy] || "timestamps.requestedAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    /* ---------------- PIPELINE ---------------- */
    const pipeline = [
      { $match: baseFilter },

      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },
    ];

    /* ---------------- SEARCH ---------------- */
    if (search) {
      const searchConditions = [
        { sku: { $regex: search, $options: "i" } },
        { returnReason: { $regex: search, $options: "i" } },
        { "order.orderId": { $regex: search, $options: "i" } },
        { "order.customerDetails.name": { $regex: search, $options: "i" } },
      ];

      if (mongoose.Types.ObjectId.isValid(search)) {
        searchConditions.push({ _id: new mongoose.Types.ObjectId(search) });
      }

      pipeline.push({ $match: { $or: searchConditions } });
    }

    /* ---------------- FACET ---------------- */
    pipeline.push({
      $facet: {
        data: [
          { $sort: { [sortField]: sortDirection } },
          { $skip: skip },
          { $limit: limitNumber },
        ],
        totalCount: [{ $count: "count" }],
      },
    });

    /* ---------------- EXECUTE ---------------- */
    const result = await Return.aggregate(pipeline);

    const returnRequests = result[0].data;
    const total = result[0].totalCount[0]?.count || 0;

    return sendSuccess(
      res,
      {
        returnRequests,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages: Math.ceil(total / limitNumber),
          hasNextPage: pageNumber < Math.ceil(total / limitNumber),
          hasPreviousPage: pageNumber > 1,
        },
      },
      "Return requests fetched successfully"
    );
  } catch (error) {
    logger.error("❌ Error fetching return requests:", error);
    return sendError(res, "Failed to fetch return requests", 500);
  }
};



/**
 * Get Return Requests for specific user with full population
 */
exports.getUserReturnRequests = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      status,
      page = 1,
      limit = 10,
      startDate,
      endDate,
      sortBy = "requestedAt",
      sortOrder = "desc",
    } = req.query;

    if (!userId) {
      return sendError(res, "User ID is required");
    }

    const filter = { customerId: userId };

    if (status) filter.returnStatus = status;

    if (startDate && endDate) {
      filter["timestamps.requestedAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    // Define sort field mapping
    const sortFieldMap = {
      requestedAt: "timestamps.requestedAt",
      updatedAt: "updatedAt",
      returnStatus: "returnStatus",
      refundAmount: "refund.refundAmount",
    };

    const sortField = sortFieldMap[sortBy] || "timestamps.requestedAt";

    // Simplified query with basic population (removed dealerId populate to avoid model registration error)
    const returnRequests = await Return.find(filter)
      .populate({
        path: "orderId",
        select:
          "orderId orderDate customerDetails totalAmount paymentType skus",
      })
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Enhanced processing with better error handling
    const processedReturns = await Promise.all(
      returnRequests.map(async (returnReq) => {
        try {
          // Get the specific SKU data from the order
          const orderSku =
            returnReq.orderId?.skus?.find((s) => s.sku === returnReq.sku) ||
            null;

          // Fetch product details from product service (with timeout)
          let productDetails = null;
          try {
            const productResponse = await axios.get(
              `${PRODUCT_SERVICE_URL}/sku/${returnReq.sku}`,
              {
                timeout: 5000, // 5 second timeout
              }
            );
            if (productResponse.data?.success) {
              productDetails = productResponse.data.data;
            }
          } catch (error) {
            logger.warn(
              `Could not fetch product details for SKU ${returnReq.sku}: ${error.message}`
            );
          }

          // Fetch user details for inspection and refund processing (with timeout)
          let inspectionUser = null;
          let refundUser = null;

          if (returnReq.inspection?.inspectedBy) {
            try {
              const userResponse = await axios.get(
                `${USER_SERVICE_URL}/${returnReq.inspection.inspectedBy}`,
                {
                  headers: { Authorization: req.headers.authorization },
                  timeout: 5000,
                }
              );
              if (userResponse.data?.success) {
                inspectionUser = userResponse.data.data;
              }
            } catch (error) {
              logger.warn(
                `Could not fetch inspection user details: ${error.message}`
              );
            }
          }

          if (returnReq.refund?.processedBy) {
            try {
              const userResponse = await axios.get(
                `${USER_SERVICE_URL}/${returnReq.refund.processedBy}`,
                {
                  headers: { Authorization: req.headers.authorization },
                  timeout: 5000,
                }
              );
              if (userResponse.data?.success) {
                refundUser = userResponse.data.data;
              }
            } catch (error) {
              logger.warn(
                `Could not fetch refund user details: ${error.message}`
              );
            }
          }

          // Calculate time-based fields
          const requestedAt = new Date(returnReq.timestamps.requestedAt);
          const now = new Date();
          const timeSinceRequest = now - requestedAt;

          let processingTime = null;
          if (returnReq.timestamps.completedAt) {
            processingTime =
              new Date(returnReq.timestamps.completedAt) - requestedAt;
          }

          const isOverdue =
            returnReq.returnStatus === "Requested" &&
            timeSinceRequest > 7 * 24 * 60 * 60 * 1000; // 7 days

          return {
            ...returnReq,
            orderSku,
            productDetails: productDetails
              ? {
                sku: productDetails.sku_code || returnReq.sku,
                productName:
                  productDetails.product_name || "Product Name Not Available",
                brand: productDetails.brand_ref || "Brand Not Available",
                category:
                  productDetails.category_ref || "Category Not Available",
                subcategory:
                  productDetails.subcategory_ref ||
                  "Subcategory Not Available",
                images: productDetails.images || [],
                isReturnable: productDetails.is_returnable || false,
                returnPolicy:
                  productDetails.return_policy ||
                  "Return policy not available",
              }
              : {
                sku: returnReq.sku,
                productName: "Product details not available",
                brand: "Brand not available",
                category: "Category not available",
                subcategory: "Subcategory not available",
                images: [],
                isReturnable: false,
                returnPolicy: "Return policy not available",
              },
            inspection: {
              ...returnReq.inspection,
              inspectedByUser: inspectionUser
                ? {
                  id: inspectionUser._id,
                  name:
                    inspectionUser.username ||
                    inspectionUser.email ||
                    "Unknown User",
                  role: inspectionUser.role || "Unknown Role",
                }
                : null,
            },
            refund: {
              ...returnReq.refund,
              processedByUser: refundUser
                ? {
                  id: refundUser._id,
                  name:
                    refundUser.username || refundUser.email || "Unknown User",
                  role: refundUser.role || "Unknown Role",
                }
                : null,
            },
            // Time-based calculations
            timeSinceRequest,
            processingTime,
            isOverdue,
            // Additional helpful fields
            daysSinceRequest: Math.floor(
              timeSinceRequest / (24 * 60 * 60 * 1000)
            ),
            statusDisplay: getStatusDisplay(returnReq.returnStatus),
          };
        } catch (error) {
          logger.error(
            `Error processing return request ${returnReq._id}:`,
            error
          );
          // Return basic data if processing fails
          return {
            ...returnReq,
            orderSku: null,
            productDetails: {
              sku: returnReq.sku,
              productName: "Error loading product details",
              brand: "Error loading brand",
              category: "Error loading category",
              subcategory: "Error loading subcategory",
              images: [],
              isReturnable: false,
              returnPolicy: "Error loading return policy",
            },
            inspection: {
              ...returnReq.inspection,
              inspectedByUser: null,
            },
            refund: {
              ...returnReq.refund,
              processedByUser: null,
            },
            timeSinceRequest:
              new Date() - new Date(returnReq.timestamps.requestedAt),
            processingTime: null,
            isOverdue: false,
            daysSinceRequest: 0,
            statusDisplay: getStatusDisplay(returnReq.returnStatus),
          };
        }
      })
    );

    const total = await Return.countDocuments(filter);

    // Calculate statistics for the user
    const userStats = await Return.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalReturns: { $sum: 1 },
          totalRefundAmount: { $sum: "$refund.refundAmount" },
          averageProcessingTime: {
            $avg: {
              $cond: [
                { $ne: ["$timestamps.completedAt", null] },
                {
                  $subtract: [
                    "$timestamps.completedAt",
                    "$timestamps.requestedAt",
                  ],
                },
                null,
              ],
            },
          },
          statusCounts: {
            $push: "$returnStatus",
          },
        },
      },
    ]);

    const stats = userStats[0] || {
      totalReturns: 0,
      totalRefundAmount: 0,
      averageProcessingTime: 0,
      statusCounts: [],
    };

    // Count statuses
    const statusBreakdown = stats.statusCounts.reduce((acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    logger.info(
      `Successfully fetched ${processedReturns.length} return requests for user ${userId}`
    );

    return sendSuccess(
      res,
      {
        returnRequests: processedReturns,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
        userStats: {
          totalReturns: stats.totalReturns,
          totalRefundAmount: stats.totalRefundAmount,
          averageProcessingTime: stats.averageProcessingTime,
          statusBreakdown,
        },
      },
      "User return requests fetched successfully"
    );
  } catch (error) {
    logger.error("Get user return requests error:", error);
    return sendError(res, "Failed to get user return requests");
  }
};

// Helper function to get user-friendly status display
function getStatusDisplay(status) {
  const statusMap = {
    Requested: "Return Requested",
    Validated: "Return Validated",
    Pickup_Scheduled: "Pickup Scheduled",
    Pickup_Completed: "Pickup Completed",
    Under_Inspection: "Under Inspection",
    Approved: "Return Approved",
    Rejected: "Return Rejected",
    Refund_Processed: "Refund Processed",
    Completed: "Return Completed",
  };
  return statusMap[status] || status;
}

/**
 * Simple test endpoint to check if return requests exist for a user
 */
exports.testUserReturnRequests = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return sendError(res, "User ID is required");
    }

    // Simple query to check if any return requests exist
    const count = await Return.countDocuments({ customerId: userId });

    // Get basic return requests without complex processing
    const basicReturns = await Return.find({ customerId: userId })
      .select(
        "_id orderId sku returnStatus timestamps.requestedAt refund.refundAmount"
      )
      .limit(5)
      .lean();

    logger.info(
      `Test query: Found ${count} return requests for user ${userId}`
    );

    return sendSuccess(
      res,
      {
        userId,
        totalReturns: count,
        sampleReturns: basicReturns,
        message:
          count > 0 ? "Return requests found" : "No return requests found",
      },
      "Test query completed successfully"
    );
  } catch (error) {
    logger.error("Test user return requests error:", error);
    return sendError(res, "Failed to test user return requests");
  }
};

/**
 * Get Return Statistics
 */
exports.getReturnRequestStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = {};
    if (startDate && endDate) {
      filter["timestamps.requestedAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const stats = await Return.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$returnStatus",
          count: { $sum: 1 },
          totalAmount: { $sum: "$refund.refundAmount" },
        },
      },
    ]);

    const totalReturns = await Return.countDocuments(filter);
    const totalRefundAmount = await Return.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$refund.refundAmount" } } },
    ]);

    return sendSuccess(
      res,
      {
        stats,
        totalReturns,
        totalRefundAmount: totalRefundAmount[0]?.total || 0,
      },
      "Return statistics fetched successfully"
    );
  } catch (error) {
    logger.error("Get return stats error:", error);
    return sendError(res, "Failed to get return statistics");
  }
};

/**
 * Add Note to Return Request
 */
exports.addNote = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { note, addedBy } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }

    returnRequest.notes.push({ note, addedBy });
    await returnRequest.save();

    return sendSuccess(res, returnRequest, "Note added successfully");
  } catch (error) {
    logger.error("Add note error:", error);
    return sendError(res, "Failed to add note");
  }
};

// Helper Functions

/**
 * Validate return eligibility
 */
async function validateReturnEligibility(order, sku) {
  try {
    const orderSku = order.skus.find((s) => s.sku === sku);
    if (!orderSku) {
      return { isEligible: false, reason: "SKU not found in order" };
    }

    // Check if within return window (7 days from delivery)
    const deliveryDate = orderSku.tracking_info?.timestamps?.deliveredAt;
    if (!deliveryDate) {
      return { isEligible: false, reason: "Delivery date not found" };
    }
    console.log("Delivery Date:", deliveryDate);

    const returnWindowDays = 7;
    const returnDeadline = new Date(deliveryDate);

    returnDeadline.setDate(returnDeadline.getDate() + returnWindowDays);
    console.log("Return Deadline:", returnDeadline);
    const isWithinReturnWindow = new Date() <= returnDeadline;

    // Check if product is returnable
    let isProductReturnable = false;
    try {
      const productResponse = await axios.get(
        `${PRODUCT_SERVICE_URL}/sku/${sku}`
      );
      console.log("Product Response:", productResponse);
      if (productResponse.data?.success) {
        isProductReturnable = productResponse.data.data?.is_returnable || false;
      }
    } catch (error) {
      logger.error("Error fetching product details:", error);
      isProductReturnable = false;
    }

    const isEligible = isWithinReturnWindow && isProductReturnable;
    const reason = isEligible
      ? "Return request is eligible"
      : !isWithinReturnWindow
        ? "Return window has expired"
        : "Product is not returnable";

    return {
      isEligible,
      reason,
      isWithinReturnWindow,
      isProductReturnable,
      returnWindowDays,
    };
  } catch (error) {
    logger.error("Validate return eligibility error:", error);
    return { isEligible: false, reason: "Error validating eligibility" };
  }
}

/**
 * Schedule pickup with logistics partner
 */
async function schedulePickup(returnId, authToken) {
  try {
    // This would integrate with your logistics partner API
    // For now, we'll create a mock pickup request
    const pickupId = `PICKUP_${Date.now()}`;
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 1); // Schedule for tomorrow

    return {
      pickupId,
      scheduledDate,
      logisticsPartner: "Borzo", // Your logistics partner
      trackingNumber: `TRK_${Date.now()}`,
    };
  } catch (error) {
    logger.error("Schedule pickup error:", error);
    throw error;
  }
}

/**
 * Create logistics pickup request
 */
async function createLogisticsPickupRequest(
  returnRequest,
  scheduledDate,
  pickupAddress
) {
  try {
    // This would integrate with your logistics partner API
    // For now, we'll create a mock pickup request
    const pickupId = `PICKUP_${Date.now()}`;

    return {
      pickupId,
      scheduledDate: new Date(scheduledDate),
      logisticsPartner: "Borzo",
      trackingNumber: `TRK_${Date.now()}`,
      pickupAddress: pickupAddress || {
        address: "Customer Address",
        city: "Customer City",
        pincode: "123456",
        state: "Customer State",
      },
      deliveryAddress: {
        address: "Dealer Address",
        city: "Dealer City",
        pincode: "654321",
        state: "Dealer State",
      },
    };
  } catch (error) {
    logger.error("Create logistics pickup request error:", error);
    throw error;
  }
}

/**
 * Process refund payment
 */
async function processRefundPayment(returnRequest, refundMethod) {
  try {
    // This would integrate with your payment gateway API
    // For now, we'll create a mock refund
    const transactionId = `REFUND_${Date.now()}`;

    return {
      success: true,
      transactionId,
      message: "Refund processed successfully",
    };
  } catch (error) {
    logger.error("Process refund payment error:", error);
    return {
      success: false,
      message: "Failed to process refund payment",
    };
  }
}

/**
 * Find fulfillment admin users
 */
async function findFulfillmentAdmins() {
  try {
    // This would fetch users with Fulfillment-Admin role from user service
    // For now, we'll return an empty array
    return [];
  } catch (error) {
    logger.error("Find fulfillment admins error:", error);
    return [];
  }
}



exports.validateReturnRequest = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }
    const updatedReturnRequest = await Return.findByIdAndUpdate(
      returnId,
      {
        $set: {
          returnStatus: "Validated",
          "timestamps.validatedAt": new Date()
        }
      },
      { new: true }
    );

    return sendSuccess(
      res,
      updatedReturnRequest,
      "Return request validated successfully"
    );

  } catch (error) {
    logger.error("Validate return request error:", error);
    return sendError(res, "Failed to validate return request");
  }
}

exports.intiateBorzoOrderForReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { securePackageAmount = 0.00 } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }
    const order = await Order.findById(returnRequest.orderId);
    if (!order) {
      return sendError(res, "Order not found");
    }
    const total_weight_kg = order.skus.find(s => s.sku === returnRequest.sku)?.tracking_info?.borzo_weight || "3";
    const authHeader = req.headers.authorization;
    let pickupDealerId = returnRequest.dealerId || null;
    const dealerInfo = pickupDealerId ? await fetchDealerInfo(pickupDealerId, authHeader) : null;
    console.log("[BORZO] Dealer info:", dealerInfo);
    const dealerAddressString =
      dealerInfo?.Address?.full ||
      buildAddressString({
        building_no: dealerInfo?.Address?.building_no,
        street: dealerInfo?.Address?.street,
        area: dealerInfo?.Address?.area,
        city: dealerInfo?.Address?.city,
        state: dealerInfo?.Address?.state,
        pincode: dealerInfo?.Address?.pincode,
        country: dealerInfo?.Address?.country || "India",
      }) ||
      dealerInfo?.business_address ||
      dealerInfo?.registered_address ||
      "Pickup Address";
    const dealerGeo = await geocodeAddress(dealerInfo?.Address?.pincode);
    const customerAddressString =
      order.customerDetails?.address ||
      buildAddressString({
        building_no: order.customerDetails?.building_no,
        street: order.customerDetails?.street,
        area: order.customerDetails?.area,
        city: order.customerDetails?.city,
        state: order.customerDetails?.state,
        pincode: order.customerDetails?.pincode,
        country: order.customerDetails?.country || "India",
      }) ||
      "Delivery Address";
    const customerGeo = await geocodeAddress(order.customerDetails?.pincode);
    let vehicle_type = 8;
    if (total_weight_kg) {
      if (total_weight_kg <= 20) {
        vehicle_type = 8; // bike
      } else if (total_weight_kg > 20 && total_weight_kg <= 500) {
        vehicle_type = 10; // 3 wheeler
      } else if (total_weight_kg > 500 && total_weight_kg <= 750) {
        vehicle_type = 3; //  tata ace  ft
      } else if (total_weight_kg > 750 && total_weight_kg <= 1000) {
        vehicle_type = 2; // tata ace 8 ft
      } else {
        vehicle_type = 2; // tata ace 8 ft
      }
    }
    const dropPoint = {
      address: dealerAddressString,
      contact_person: {
        name: dealerInfo?.contact_person.name || dealerInfo?.legal_name || "Dealer",
        phone:
          dealerInfo?.contact_person.phone_number ||
          dealerInfo?.contact_number ||
          dealerInfo?.phone ||
          "0000000000",
      },
      latitude: dealerGeo?.latitude || 28.57908,
      longitude: dealerGeo?.longitude || 77.31912,
      // latitude: 28.583905,
      // longitude: 77.322733,
      note: `RTN,${returnId},${returnRequest.sku}`,
      client_order_id: `RTN,${returnId}`,
    };

    const pickupPoint = {
      address: customerAddressString,
      contact_person: {
        name: order.customerDetails?.name || "Customer",
        phone: order.customerDetails?.phone || "0000000000",
      },
      latitude: customerGeo?.latitude || 28.583905,
      longitude: customerGeo?.longitude || 77.322733,
      // latitude: 28.583905,
      // longitude: 77.322733,
      client_order_id: `RTN,${returnId}`,
      note: `RTN,${returnId},${returnRequest.sku}`,
    };
    borzoPointsUsed = [pickupPoint, dropPoint];
    const orderData = {
      type: "endofday",
      matter: "Automobile Parts Delivery",
      total_weight_kg: total_weight_kg || "3", // Dynamic weight from request body
      insurance_amount: securePackageAmount,
      vehicle_type_id: vehicle_type,
      is_client_notification_enabled: true,
      is_contact_person_notification_enabled: true,
      points: borzoPointsUsed,
    };
    const instantReq = { body: { ...orderData, type: "standard" } };
    const instantRes = {
      status: (code) => ({
        json: async (Data) => {
          console.log("borzo instant response", Data, code);
          if (code === 200) {
            const data = Data.borzo_order.order;
            borzoOrderResponse = { type: "instant", data };
            if (data.order_id) {
              console.log(
                `Storing Borzo order ID: ${data.order_id} for order: ${order.orderId}`
              );
              const splitedOrderId = data.points[0].client_order_id.split(",");
              const skuValue = splitedOrderId[2];






              if (!returnRequest.tracking_info) {
                sku.tracking_info = {};
              }
              returnRequest.tracking_info.borzo_order_id = data.order_id.toString();
              if (data.points[1].tracking_url) returnRequest.tracking_info.borzo_tracking_url = data.points[1].tracking_url;
              if (data.tracking_number) returnRequest.tracking_info.borzo_tracking_number = data.tracking_number;
              returnRequest.tracking_info.status = "Confirmed";
              if (!returnRequest.tracking_info.timestamps) {
                returnRequest.tracking_info.timestamps = {};
              }
              returnRequest.tracking_info.timestamps.confirmedAt = new Date();
              returnRequest.tracking_info.borzo_payment_amount = data.payment_amount;
              returnRequest.tracking_info.borzo_delivery_fee_amount = data.delivery_fee_amount;
              returnRequest.tracking_info.borzo_weight_fee_amount = data.weight_fee_amount;
              returnRequest.tracking_info.borzo_weight = total_weight_kg;
              returnRequest.tracking_info.borzo_last_updated = new Date();
              returnRequest.returnStatus = "Shipment_Intiated";
              returnRequest.shipment_started = true;
              returnRequest.timestamps.borzoShipmentInitiatedAt = new Date();
              await returnRequest.save();
              try {
                await logOrderAction({
                  orderId: order._id,
                  action: "BORZO_ORDER_CREATED_SUCCESS",
                  performedBy: req.user?.userId || "system",
                  performedByRole: req.user?.role || "system",
                  details: { type: "instant", borzo_order_id: data.order_id, response: data },
                  timestamp: new Date(),
                });
              } catch (_) { }
              console.log(
                `Successfully saved Borzo order ID: ${data.order_id} for order: ${order.orderId} and ${order.skus.length} SKUs`
              );
            }
          } else {
            // console.error("Borzo Instant Order Error:", data);
            // Audit log failure
            // try {
            //   await logOrderAction({
            //     orderId: order._id,
            //     action: "BORZO_ORDER_CREATED_FAILED",
            //     performedBy: req.user?.userId || "system",
            //     performedByRole: req.user?.role || "system",
            //     details: { type: "instant", error: data },
            //     timestamp: new Date(),
            //   });
            // } catch (_) { }
          }
        },
      }),
    };
    await exports.createOrderBorzoInstantUpdated(instantReq, instantRes);
    return sendSuccess(res, borzoOrderResponse, "Borzo order initiated for return successfully");
  } catch (error) {
    console.error("Intiate Borzo Order For Return error:", error);
    logger.error("Intiate Borzo Order For Return error:", error);
    return sendError(res, "Failed to Intiate Borzo Order For Return");
  }
}
function buildAddressString(parts) {
  return [
    parts?.building_no,
    parts?.street,
    parts?.area,
    parts?.city,
    parts?.state,
    parts?.pincode,
    parts?.country,
  ]
    .filter(Boolean)
    .join(", ");
}

exports.createOrderBorzoInstantUpdated = async (req, res) => {
  try {
    const {
      type = "standard",
      matter = "Food",
      total_weight_kg = "3",
      insurance_amount = "500.00",
      is_client_notification_enabled = true,
      is_contact_person_notification_enabled = true,
      vehicle_type_id,
      points = [],
    } = req.body;

    // Validate required fields
    if (!points || points.length < 2) {
      return res.status(400).json({
        error: "At least 2 points (pickup and delivery) are required",
      });
    }

    // Validate total_weight_kg
    if (
      total_weight_kg &&
      (isNaN(parseFloat(total_weight_kg)) || parseFloat(total_weight_kg) <= 0)
    ) {
      return res.status(400).json({
        error: "total_weight_kg must be a positive number",
      });
    }

    // Validate each point has required fields
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (
        !point.address ||
        !point.contact_person ||
        !point.contact_person.name ||
        !point.contact_person.phone ||
        !point.latitude ||
        !point.longitude
      ) {
        return res.status(400).json({
          error: `Point ${i + 1
            } is missing required fields (address, contact_person, latitude, longitude)`,
        });
      }
    }
    console.log("Creating Borzo order with total_weight_kg:", points);

    // Create Borzo order payload with dynamic total_weight_kg
    const borzoOrderPayload = {
      type,
      matter,
      total_weight_kg: total_weight_kg.toString(),
      insurance_amount: insurance_amount.toString(),
      is_client_notification_enabled,
      is_contact_person_notification_enabled,
      vehicle_type_id,
      // points: points.map((point) => ({
      //   address: point.address,
      //   contact_person: {
      //     name: point.contact_person.name,
      //     phone: point.contact_person.phone,
      //   },
      //   latitude: point.latitude,
      //   longitude: point.longitude,
      //   client_order_id:
      //     point.client_order_id ||
      //     `BORZO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      // })),
      points: points,
    };
    console.log("borzoOrderPayload", borzoOrderPayload);
    // Make the actual API call to Borzo
    console.log(
      "Borzo Order Payload:",
      JSON.stringify(borzoOrderPayload, null, 2)
    );

    try {
      const response = await axios.post(
        "https://robotapitest-in.borzodelivery.com/api/business/1.6/create-order",
        borzoOrderPayload,
        {
          headers: {
            "X-DV-Auth-Token": "29C64BE0ED20FC6C654F947F7E3D8E33496F51F6",
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 seconds timeout
        }
      );

      console.log(
        "Borzo API Response:",
        JSON.stringify(response.data, null, 2)
      );

      return res.status(200).json({
        message: "Borzo order created successfully",
        borzo_order: response.data,
        request_payload: borzoOrderPayload,
      });
    } catch (apiError) {
      console.error("Borzo API Error:", {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        message: apiError.message,
      });

      // Return appropriate error response
      if (apiError.response) {
        return res.status(apiError.response.status).json({
          error: "Borzo API Error",
          status: apiError.response.status,
          message:
            apiError.response.data?.message || apiError.response.statusText,
          borzo_error: apiError.response.data,
          request_payload: borzoOrderPayload,
        });
      } else if (apiError.request) {
        return res.status(503).json({
          error: "Borzo API Unavailable",
          message: "Unable to reach Borzo API. Please try again later.",
          request_payload: borzoOrderPayload,
        });
      } else {
        return res.status(500).json({
          error: "Internal Error",
          message: apiError.message,
          request_payload: borzoOrderPayload,
        });
      }
    }
  } catch (error) {
    console.error("Error creating Borzo order:", error);
    return res.status(500).json({
      error: "Failed to create Borzo order",
      details: error.message,
    });
  }
};

async function fetchDealerInfo(dealerId, authorizationHeader) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (authorizationHeader) {
      headers.Authorization = authorizationHeader;
    }

    const response = await axios.get(
      `http://user-service:5001/api/users/dealer/${dealerId}`,
      { timeout: 5000, headers }
    );

    return response.data?.data || null;
  } catch (error) {
    logger.warn(`Failed to fetch dealer info for ${dealerId}:`, error.message);
    return null;
  }
}

async function geocodeAddress(address) {
  try {
    if (!address || typeof address !== "string") return null;
    const resp = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: { q: address, format: "json", limit: 1 },
        headers: { "User-Agent": "toprise-order-service/1.0" },
        timeout: 10000,
      }
    );
    const first = Array.isArray(resp.data) ? resp.data[0] : null;
    if (first && first.lat && first.lon) {
      return { latitude: parseFloat(first.lat), longitude: parseFloat(first.lon) };
    }
    return null;
  } catch (e) {
    logger.warn(`Geocoding failed for address: ${address} -> ${e.message}`);
    return null;
  }
}

exports.createOrderBorzoInstantUpdated = async (req, res) => {
  try {
    const {
      type = "standard",
      matter = "Food",
      total_weight_kg = "3",
      insurance_amount = "500.00",
      is_client_notification_enabled = true,
      is_contact_person_notification_enabled = true,
      points = [],
    } = req.body;

    // Validate required fields
    if (!points || points.length < 2) {
      return res.status(400).json({
        error: "At least 2 points (pickup and delivery) are required",
      });
    }

    // Validate total_weight_kg
    if (
      total_weight_kg &&
      (isNaN(parseFloat(total_weight_kg)) || parseFloat(total_weight_kg) <= 0)
    ) {
      return res.status(400).json({
        error: "total_weight_kg must be a positive number",
      });
    }

    // Validate each point has required fields
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (
        !point.address ||
        !point.contact_person ||
        !point.contact_person.name ||
        !point.contact_person.phone ||
        !point.latitude ||
        !point.longitude
      ) {
        return res.status(400).json({
          error: `Point ${i + 1
            } is missing required fields (address, contact_person, latitude, longitude)`,
        });
      }
    }

    // Create Borzo order payload with dynamic total_weight_kg
    const borzoOrderPayload = {
      type,
      matter,
      total_weight_kg: total_weight_kg.toString(),
      insurance_amount: insurance_amount.toString(),
      is_client_notification_enabled,
      is_contact_person_notification_enabled,
      points: points.map((point) => ({
        address: point.address,
        contact_person: {
          name: point.contact_person.name,
          phone: point.contact_person.phone,
        },
        latitude: point.latitude,
        longitude: point.longitude,
        note: point.note || "",
        client_order_id:
          point.client_order_id ||
          `BORZO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      })),
    };
    console.log("borzoOrderPayload", borzoOrderPayload);
    // Make the actual API call to Borzo
    console.log(
      "Borzo Order Payload:",
      JSON.stringify(borzoOrderPayload, null, 2)
    );

    try {
      const response = await axios.post(
        "https://robotapitest-in.borzodelivery.com/api/business/1.6/create-order",
        borzoOrderPayload,
        {
          headers: {
            "X-DV-Auth-Token": "29C64BE0ED20FC6C654F947F7E3D8E33496F51F6",
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 seconds timeout
        }
      );

      console.log(
        "Borzo API Response:",
        JSON.stringify(response.data, null, 2)
      );

      return res.status(200).json({
        message: "Borzo order created successfully",
        borzo_order: response.data,
        request_payload: borzoOrderPayload,
      });
    } catch (apiError) {
      console.error("Borzo API Error:", {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        message: apiError.message,
      });

      // Return appropriate error response
      if (apiError.response) {
        return res.status(apiError.response.status).json({
          error: "Borzo API Error",
          status: apiError.response.status,
          message:
            apiError.response.data?.message || apiError.response.statusText,
          borzo_error: apiError.response.data,
          request_payload: borzoOrderPayload,
        });
      } else if (apiError.request) {
        return res.status(503).json({
          error: "Borzo API Unavailable",
          message: "Unable to reach Borzo API. Please try again later.",
          request_payload: borzoOrderPayload,
        });
      } else {
        return res.status(500).json({
          error: "Internal Error",
          message: apiError.message,
          request_payload: borzoOrderPayload,
        });
      }
    }
  } catch (error) {
    console.error("Error creating Borzo order:", error);
    return res.status(500).json({
      error: "Failed to create Borzo order",
      details: error.message,
    });
  }
};

exports.startReturnRequestInspection = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { inspectedBy, isSuperAdmin = false } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }
    if (returnRequest.returnStatus !== "Shipment_Completed") {
      return sendError(res, "Return request is not eligible for inspection");
    }

    // Update inspection details
    returnRequest.returnStatus = "Inspection_Started";
    returnRequest.inspection.isSuperAdminInspected = isSuperAdmin
    returnRequest.timestamps.inspectionStartedAt = new Date();
    returnRequest.inspection.inspectedBy = inspectedBy;
    returnRequest.inspection.inspectionStartedAt = new Date();
    returnRequest.inspection.status = "In_Progress";

    await returnRequest.save();

    return sendSuccess(
      res,
      returnRequest,
      "Return request inspection started successfully"
    );
  } catch (error) {
    console.error("Error starting return request inspection:", error);
    logger.error("Start return request inspection error:", error);
    return sendError(res, "Failed to start return request inspection");
  }
}

exports.completeReturnRequestInspection = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { inspectedBy, isSuperAdmin = false, condition, remarks, skuMatch, isApproved, inspectionImages } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }
    if (returnRequest.returnStatus !== "Inspection_Started") {
      return sendError(res, "Return request is not eligible for inspection completion");
    }

    // Update inspection details
    returnRequest.returnStatus = "Inspection_Completed";
    returnRequest.timestamps.inspectionCompletedAt = new Date();
    returnRequest.inspection.inspectedBy = inspectedBy;
    returnRequest.inspection.inspectionCompletedAt = new Date();
    returnRequest.inspection.condition = condition;
    returnRequest.inspection.note = remarks;
    returnRequest.inspection.skuMatch = skuMatch;
    returnRequest.inspection.inspectionImages = inspectionImages || [];
    returnRequest.inspection.isApproved = isApproved;
    returnRequest.inspection.isSuperAdminInspected = isSuperAdmin;
    returnRequest.inspection.status = "Completed";

    await returnRequest.save();

    return sendSuccess(
      res,
      returnRequest,
      "Return request inspection completed successfully"
    );
  } catch (error) {
    console.error("Error completing return request inspection:", error);
    logger.error("Complete return request inspection error:", error);
    return sendError(res, "Failed to complete return request inspection");
  }
}

exports.rejectReturnRequest = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { rejectionReason } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }
    // if(returnRequest.returnStatus !== "Inspection_Completed") {
    //   return sendError(res, "Return request is not eligible for rejection");
    // }

    // Update return request status to Rejected
    returnRequest.returnStatus = "Rejected";
    returnRequest.timestamps.rejectedAt = new Date();
    returnRequest.rejectReason = rejectionReason;

    await returnRequest.save();

    return sendSuccess(
      res,
      returnRequest,
      "Return request rejected successfully"
    );
  } catch (error) {
    logger.error("Reject return request error:", error);
    return sendError(res, "Failed to reject return request");
  }
}

exports.getReturnStatusCounts = async (req, res) => {
  try {
    // List of statuses you want to track
    const statuses = [
      "Rejected",
      "Validated",
      "Requested",
      "Shipment_Intiated",
      "Shipment_Delivered",
      "Shipment_Completed",
      "Inspection_Started",
      "Inspection_Completed",
      "Initiated_Refund",
      "Refund_Completed",
      "Refund_Failed"
    ];

    // Use aggregation for fast grouped counts
    const result = await Return.aggregate([
      {
        $match: {
          returnStatus: { $in: statuses }
        }
      },
      {
        $group: {
          _id: "$returnStatus",
          count: { $sum: 1 }
        }
      }
    ]);

    // Convert aggregation results to key:value mapping
    const counts = {};
    statuses.forEach((status) => {
      counts[status] = 0;
    });

    result.forEach((item) => {
      counts[item._id] = item.count;
    });

    // Add total count
    const totalReturns = await Return.countDocuments();

    return res.status(200).json({
      success: true,
      message: "Return status counts fetched successfully",
      totalReturns,
      statusCounts: counts
    });

  } catch (err) {
    console.error("Error fetching return counts:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch return counts",
      error: err.message
    });
  }
};


exports.getReturnRequestsFulfillmentStaff = async (req, res) => {
  try {
    const {
      customerId,
      status,
      orderId,
      page = 1,
      limit = 10,
      startDate,
      endDate,
      refundMethod,

    } = req.query;
    const {
      dealerId,
    } = req.body;
    const filter = {};

    if (customerId) filter.customerId = customerId;
    if (status) filter.returnStatus = status;
    if (orderId) filter.orderId = orderId;
    // if (dealerId) filter.dealerId = dealerId;
    //dealerId is an Array

    if (Array.isArray(dealerId)) filter.dealerId = { $in: dealerId };

    if (startDate && endDate) {
      filter["timestamps.requestedAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    if (refundMethod) filter['refund.refundMethod'] = refundMethod;

    const skip = (page - 1) * limit;

    const returnRequests = await Return.find(filter)
      .populate("orderId",)
      .populate("refund.refund_id")
      // Note: dealerId populate removed to avoid "Schema hasn't been registered for model 'Dealer'" error
      .sort({ "timestamps.requestedAt": -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Return.countDocuments(filter);

    return sendSuccess(
      res,
      {
        returnRequests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
      "Return requests fetched successfully"
    );
  } catch (error) {
    logger.error("Get return requests error:", error);
    return sendError(res, "Failed to get return requests");
  }
};

exports.initiatesManualRapidoPickupForReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }
    const order = await Order.findById(returnRequest.orderId);
    if (!order) {
      return sendError(res, "Order not found");
    }
    const authHeader = req.headers.authorization;
    if (!returnRequest.tracking_info) {
      sku.tracking_info = {};
    }
    // returnRequest.tracking_info.borzo_order_id = data.order_id.toString();
    // if (data.points[1].tracking_url) returnRequest.tracking_info.borzo_tracking_url = data.points[1].tracking_url;
    // if (data.tracking_number) returnRequest.tracking_info.borzo_tracking_number = data.tracking_number;
    returnRequest.tracking_info.status = "Confirmed";
    if (!returnRequest.tracking_info.timestamps) {
      returnRequest.tracking_info.timestamps = {};
    }
    returnRequest.delivery_chanel = "Manual_Rapido";
    returnRequest.tracking_info.timestamps.confirmedAt = new Date();
    returnRequest.tracking_info.borzo_last_updated = new Date();
    returnRequest.returnStatus = "Shipment_Intiated";
    returnRequest.shipment_started = true;
    returnRequest.shipment_completed = false;
    returnRequest.timestamps.borzoShipmentInitiatedAt = new Date();
    await returnRequest.save();
    return sendSuccess(res, returnRequest, "Manual Rapido pickup initiated successfully");
  } catch (error) {
    logger.error("Initiate manual Rapido pickup error:", error);
    return sendError(res, "Failed to initiate manual Rapido pickup");
  }
};


exports.markDeliveredManualRapidoReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return sendError(res, "Return request not found");
    }
    const order = await Order.findById(returnRequest.orderId);
    if (!order) {
      return sendError(res, "Order not found");
    }
    const authHeader = req.headers.authorization;
    if (!returnRequest.tracking_info) {
      sku.tracking_info = {};
    }
    returnRequest.tracking_info.status = "Delivered";
    returnRequest.tracking_info.timestamps.deliveredAt = new Date();
    returnRequest.returnStatus = "Shipment_Completed";
    returnRequest.timestamps.borzoShipmentCompletedAt = new Date();
    returnRequest.tracking_info.borzo_last_updated = new Date();
    returnRequest.tracking_info.borzo_tracking_status = "finished";
    returnRequest.shipment_completed = true;
    await returnRequest.save();
    return sendSuccess(res, returnRequest, "Manual Rapido return marked as delivered successfully");
  } catch (error) {
    logger.error("Initiate manual Rapido pickup error:", error);
    return sendError(res, "Failed to initiate manual Rapido pickup");
  }
};