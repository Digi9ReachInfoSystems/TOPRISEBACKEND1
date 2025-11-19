const Return = require("../models/return");
const Order = require("../models/order");
const Payment = require("../models/paymentModel");
const { sendSuccess, sendError } = require("/packages/utils/responseHandler");
const logger = require("/packages/utils/logger");
const axios = require("axios");
const {
  createUnicastOrMulticastNotificationUtilityFunction,
} = require("/packages/utils/notificationService");

// Helper function to geocode address
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

// Helper function to build address string
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

// Helper function to fetch dealer information from user service
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

// Helper function to fetch user information from user service
async function fetchUserInfo(userId, authorizationHeader) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (authorizationHeader) {
      headers.Authorization = authorizationHeader;
    }

    const response = await axios.get(
      `http://user-service:5001/api/users/${userId}`,
      { timeout: 5000, headers }
    );

    return response.data?.data || null;
  } catch (error) {
    logger.warn(`Failed to fetch user info for ${userId}:`, error.message);
    return null;
  }
}

// Product service URL for checking returnable status
const PRODUCT_SERVICE_URL =
  process.env.PRODUCT_SERVICE_URL || "http://product-service:5002/api/products";

// User service URL for fetching user details
const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://user-service:5001/api/users";

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

    // Check if quantity is valid
    if (quantity > orderSku.quantity) {
      return sendError(res, "Return quantity cannot exceed ordered quantity");
    }

    // Validate return eligibility
    const eligibilityResult = await validateReturnEligibility(order, sku);

    // Create return request
    const returnRequest = await Return.create({
      orderId,
      customerId,
      sku,
      quantity,
      returnReason,
      returnDescription,
      returnImages,
      isEligible: eligibilityResult.isEligible,
      eligibilityReason: eligibilityResult.reason,
      isWithinReturnWindow: eligibilityResult.isWithinReturnWindow,
      isProductReturnable: eligibilityResult.isProductReturnable,
      returnWindowDays: eligibilityResult.returnWindowDays,
      originalOrderDate: order.orderDate,
      originalDeliveryDate: order.skus.find((s) => s.sku === sku)?.tracking_info
        ?.timestamps?.deliveredAt,
      dealerId: orderSku.dealerMapped?.[0]?.dealerId,
      returnStatus: eligibilityResult.isEligible ? "Validated" : "Requested",
      refund: {
        refundAmount: orderSku.selling_price * quantity,
      },
      timestamps: {
        requestedAt: new Date(),
        validatedAt: eligibilityResult.isEligible ? new Date() : null,
      },
    });

    order.skus = order.skus.map((s) => {
      if (s.sku === sku) {
        s.return_info = {
          is_return: true,
          return_id: returnRequest._id,
        };
      }
      return s;
    });
    await order.save();
    // Send notification to customer
    await createUnicastOrMulticastNotificationUtilityFunction(
      [customerId],
      ["INAPP", "PUSH"],
      "Return Request Created",
      `Your return request for ${sku} has been ${
        eligibilityResult.isEligible ? "validated" : "submitted for review"
      }`,
      "",
      "",
      "Return",
      { returnId: returnRequest._id },
      req.headers.authorization
    );

    // If eligible, automatically schedule pickup
    if (eligibilityResult.isEligible) {
      await schedulePickup(returnRequest._id, req.headers.authorization);
    }

    return sendSuccess(
      res,
      returnRequest,
      "Return request created successfully"
    );
  } catch (error) {
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
    returnRequest.returnStatus = eligibilityResult.isEligible
      ? "Validated"
      : "Requested";
    returnRequest.timestamps.validatedAt = new Date();

    await returnRequest.save();

    // Send notification to customer
    await createUnicastOrMulticastNotificationUtilityFunction(
      [returnRequest.customerId],
      ["INAPP", "PUSH"],
      "Return Request Validated",
      `Your return request has been ${
        eligibilityResult.isEligible ? "approved" : "rejected"
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

    // Create pickup request with logistics partner (Borzo)
    const pickupRequest = await createLogisticsPickupRequest(
      returnRequest,
      scheduledDate,
      pickupAddress,
      req.headers.authorization
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
      refundMethod,
      req.headers.authorization
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
      "orderId orderDate customerDetails"
    );
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
      orderId,
      page = 1,
      limit = 10,
      startDate,
      endDate,
    } = req.query;

    const filter = {};

    if (customerId) filter.customerId = customerId;
    if (status) filter.returnStatus = status;
    if (orderId) filter.orderId = orderId;

    if (startDate && endDate) {
      filter["timestamps.requestedAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    const returnRequests = await Return.find(filter)
      .populate("orderId", "orderId orderDate customerDetails")
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

    const returnWindowDays = 7;
    const returnDeadline = new Date(deliveryDate);
    returnDeadline.setDate(returnDeadline.getDate() + returnWindowDays);

    const isWithinReturnWindow = new Date() <= returnDeadline;

    // Check if product is returnable
    let isProductReturnable = false;
    try {
      const productResponse = await axios.get(
        `${PRODUCT_SERVICE_URL}/sku/${sku}`
      );
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
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      throw new Error("Return request not found");
    }

    // Schedule pickup for tomorrow by default
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 1);

    // Create Borzo pickup request
    const pickupRequest = await createLogisticsPickupRequest(
      returnRequest,
      scheduledDate,
      null, // Use customer address from order
      authToken
    );

    // Update return request
    returnRequest.returnStatus = "Pickup_Scheduled";
    returnRequest.pickupRequest = {
      ...returnRequest.pickupRequest,
      ...pickupRequest,
    };
    returnRequest.timestamps.pickupScheduledAt = new Date();

    await returnRequest.save();

    logger.info(
      `Pickup scheduled for return ${returnId}: Borzo order ${pickupRequest.borzoOrderId || pickupRequest.pickupId}`
    );

    return pickupRequest;
  } catch (error) {
    logger.error("Schedule pickup error:", error);
    throw error;
  }
}

/**
 * Create logistics pickup request with Borzo
 * Pickup from customer address, delivery to dealer address
 */
async function createLogisticsPickupRequest(
  returnRequest,
  scheduledDate,
  pickupAddress,
  authToken
) {
  try {
    // Fetch order to get customer details
    const order = await Order.findById(returnRequest.orderId);
    if (!order) {
      throw new Error("Order not found for return request");
    }

    // Fetch dealer information
    let dealerInfo = null;
    if (returnRequest.dealerId) {
      dealerInfo = await fetchDealerInfo(returnRequest.dealerId.toString(), authToken);
    }

    // Build customer address (pickup point)
    const customerAddressString =
      pickupAddress?.address ||
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
      "Customer Address";

    const customerGeo = await geocodeAddress(customerAddressString);

    // Build dealer address (drop point)
    const dealerAddressString =
      dealerInfo?.address?.full ||
      buildAddressString({
        building_no: dealerInfo?.address?.building_no,
        street: dealerInfo?.address?.street,
        area: dealerInfo?.address?.area,
        city: dealerInfo?.address?.city,
        state: dealerInfo?.address?.state,
        pincode: dealerInfo?.address?.pincode,
        country: dealerInfo?.address?.country || "India",
      }) ||
      dealerInfo?.business_address ||
      dealerInfo?.registered_address ||
      "Dealer Address";

    const dealerGeo = await geocodeAddress(dealerAddressString);

    // Create pickup point (from customer)
    const pickupPoint = {
      address: customerAddressString,
      contact_person: {
        name: order.customerDetails?.name || "Customer",
        phone: order.customerDetails?.phone || "0000000000",
      },
      latitude: customerGeo?.latitude || 28.583905,
      longitude: customerGeo?.longitude || 77.322733,
      client_order_id: `RETURN_${returnRequest._id}_${Date.now()}`,
    };

    // Create drop point (to dealer)
    const dropPoint = {
      address: dealerAddressString,
      contact_person: {
        name: dealerInfo?.business_name || dealerInfo?.legal_name || "Dealer",
        phone:
          dealerInfo?.mobile_number ||
          dealerInfo?.contact_number ||
          dealerInfo?.phone ||
          "0000000000",
      },
      latitude: dealerGeo?.latitude || 28.57908,
      longitude: dealerGeo?.longitude || 77.31912,
      client_order_id: `RETURN_${returnRequest._id}_${Date.now()}`,
    };

    // Create Borzo order payload
    const borzoOrderPayload = {
      type: "standard", // Use standard for returns
      matter: "Return",
      vehicle_type_id: "8",
      total_weight_kg: "2", // Default weight for returns
      insurance_amount: "500.00",
      is_client_notification_enabled: true,
      is_contact_person_notification_enabled: true,
      points: [pickupPoint, dropPoint],
    };

    logger.info(
      `[BORZO] Creating return pickup order for return ${returnRequest._id}`
    );
    logger.info(
      `[BORZO] Pickup from: ${customerAddressString}, Delivery to: ${dealerAddressString}`
    );

    // Create Borzo order
    let borzoResponse = null;
    try {
      const response = await axios.post(
        "https://robotapitest-in.borzodelivery.com/api/business/1.6/create-order",
        borzoOrderPayload,
        {
          headers: {
            "X-DV-Auth-Token": "29C64BE0ED20FC6C654F947F7E3D8E33496F51F6",
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      borzoResponse = response.data;
      logger.info(
        `[BORZO] Return pickup order created successfully: ${borzoResponse.order_id}`
      );
    } catch (borzoError) {
      logger.error("[BORZO] Failed to create return pickup order:", {
        status: borzoError.response?.status,
        statusText: borzoError.response?.statusText,
        data: borzoError.response?.data,
        message: borzoError.message,
      });
      // Continue even if Borzo fails - we'll still create the pickup request record
    }

    // Return pickup request details
    return {
      pickupId: borzoResponse?.order_id || `PICKUP_${Date.now()}`,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
      logisticsPartner: "Borzo",
      trackingNumber: borzoResponse?.tracking_number || `TRK_${Date.now()}`,
      borzoOrderId: borzoResponse?.order_id || null,
      borzoTrackingUrl: borzoResponse?.tracking_url || null,
      pickupAddress: {
        address: customerAddressString,
        city: order.customerDetails?.city || "Unknown",
        pincode: order.customerDetails?.pincode || "000000",
        state: order.customerDetails?.state || "Unknown",
        latitude: customerGeo?.latitude,
        longitude: customerGeo?.longitude,
      },
      deliveryAddress: {
        address: dealerAddressString,
        city: dealerInfo?.address?.city || "Unknown",
        pincode: dealerInfo?.address?.pincode || "000000",
        state: dealerInfo?.address?.state || "Unknown",
        latitude: dealerGeo?.latitude,
        longitude: dealerGeo?.longitude,
      },
      borzoResponse: borzoResponse || null,
    };
  } catch (error) {
    logger.error("Create logistics pickup request error:", error);
    throw error;
  }
}

/**
 * Process refund payment through Razorpay
 * Checks for bank account in user, if available uses payout, otherwise refunds to source
 */
async function processRefundPayment(returnRequest, refundMethod, authToken = null) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_je9PPHh0HQqIFX";
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "tdB9zkAvQLdYVRKgtOWNfIhZ";
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    // Fetch order and payment details
    const order = await Order.findById(returnRequest.orderId).populate("payment_id");
    if (!order) {
      throw new Error("Order not found for return request");
    }

    const payment = await Payment.findById(order.payment_id);
    if (!payment) {
      throw new Error("Payment not found for order");
    }

    const refundAmount = returnRequest.refund.refundAmount;
    const Refund = require("../models/refund");

    // Fetch user details to check for bank account
    let userData = null;
    let hasBankAccount = false;
    
    try {
      const userResponse = await axios.get(
        `http://user-service:5001/api/users/${returnRequest.customerId}`,
        {
          headers: {
            Authorization: authToken || "",
            "Content-Type": "application/json",
          },
          timeout: 5000,
        }
      );
      userData = userResponse.data?.data || userResponse.data;
      
      // Check if user has bank account details
      hasBankAccount = !!(
        userData?.bank_details?.account_number &&
        userData?.bank_details?.ifsc_code &&
        userData?.bank_details?.bank_account_holder_name
      );
    } catch (userError) {
      logger.warn(`Failed to fetch user details: ${userError.message}`);
      // Continue with source refund if user fetch fails
    }

    // Determine refund method based on user bank account and refundMethod parameter
    const useBankPayout = hasBankAccount && (
      refundMethod === "Bank_Account" || 
      refundMethod === "Wallet" ||
      !payment.payment_id // If no payment_id, use payout
    );

    if (useBankPayout) {
      // Refund to bank account using Razorpay Payouts
      logger.info(`Processing refund to bank account for return ${returnRequest._id}`);
      
      try {
        // Step 1: Create Contact
        const contactResp = await axios.post(
          "https://api.razorpay.com/v1/contacts",
          {
            name: userData.bank_details.bank_account_holder_name,
            email: userData.email || order.customerDetails?.email || "",
            contact: userData.phone_Number || order.customerDetails?.phone || "",
            type: "customer",
            reference_id: `ref_${returnRequest._id}_${Date.now()}`,
            notes: { 
              purpose: "Return Refund Payout",
              return_id: returnRequest._id.toString(),
              order_id: order._id.toString()
            },
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          }
        );

        const contactId = contactResp.data.id;

        // Step 2: Create Fund Account (Bank Account)
        const fundResp = await axios.post(
          "https://api.razorpay.com/v1/fund_accounts",
          {
            contact_id: contactId,
            account_type: "bank_account",
            bank_account: {
              name: userData.bank_details.bank_account_holder_name,
              ifsc: userData.bank_details.ifsc_code.toUpperCase(),
              account_number: userData.bank_details.account_number,
            },
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          }
        );

        const fundAccountId = fundResp.data.id;

        // Step 3: Create Payout
        const notes = {
          order_id: order._id.toString(),
          return_id: returnRequest._id.toString(),
          purpose: "Return Refund",
        };

        const payoutResp = await axios.post(
          "https://api.razorpay.com/v1/payouts",
          {
            account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER || keyId, // RazorpayX account
            fund_account_id: fundAccountId,
            amount: Math.round(refundAmount * 100), // Convert to paise
            currency: "INR",
            mode: "NEFT", // NEFT | RTGS | IMPS | UPI
            purpose: "payout",
            queue_if_low_balance: true,
            narration: "Return Refund Payout",
            reference_id: `payout_${returnRequest._id}_${Date.now()}`,
            notes: notes,
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
              "X-Payout-Idempotency": `payout_${returnRequest._id}_${Date.now()}`,
            },
            timeout: 30000,
          }
        );

        // Create refund record
        const refundRecord = new Refund({
          order_id: order._id,
          return_id: returnRequest._id.toString(),
          razorpay_payout_id: payoutResp.data.id,
          amount: refundAmount,
          currency: payoutResp.data.currency || "INR",
          status: payoutResp.data.status,
          entity: payoutResp.data.entity,
          refund_type: "Refund-COD",
          receipt: payoutResp.data.reference_id,
          reason: "Return refund via bank payout",
          mode: payoutResp.data.mode || "NEFT",
        });

        await refundRecord.save();
        returnRequest.refund.refund_id = refundRecord._id;
        await returnRequest.save();

        logger.info(`Bank payout created successfully: ${payoutResp.data.id}`);

        return {
          success: true,
          transactionId: payoutResp.data.id,
          refundId: refundRecord._id,
          refundType: "Bank_Payout",
          message: "Refund processed successfully to bank account",
          razorpayResponse: payoutResp.data,
        };
      } catch (payoutError) {
        logger.error("Bank payout failed, falling back to source refund:", payoutError.response?.data || payoutError.message);
        // Fall through to source refund if payout fails
      }
    }

    // Refund to source account (original payment method)
    logger.info(`Processing refund to source account for return ${returnRequest._id}`);
    
    if (!payment.payment_id) {
      throw new Error("Payment ID not found. Cannot process refund to source account.");
    }

    // Check payment details and refundable balance
    const paymentDetailsResponse = await axios.get(
      `https://api.razorpay.com/v1/payments/${payment.payment_id}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        timeout: 30000,
      }
    );

    const paymentDetails = paymentDetailsResponse.data;
    const capturedAmount = paymentDetails.amount || 0;
    const alreadyRefunded = paymentDetails.amount_refunded || 0;
    const requestedRefundAmount = Math.round(refundAmount * 100); // in paise
    const refundableBalance = capturedAmount - alreadyRefunded;

    if (requestedRefundAmount > refundableBalance) {
      throw new Error(
        `Refund amount (₹${refundAmount}) exceeds available balance (₹${refundableBalance / 100})`
      );
    }

    // Create refund request
    const notes = {
      order_id: order._id.toString(),
      return_id: returnRequest._id.toString(),
      purpose: "Return Refund",
    };

    const refundRequestData = {
      amount: requestedRefundAmount,
      speed: "optimum",
      notes: notes,
      receipt: `receipt_${returnRequest._id}_${Date.now()}`,
    };

    const refundResponse = await axios.post(
      `https://api.razorpay.com/v1/payments/${payment.payment_id}/refund`,
      refundRequestData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        timeout: 30000,
      }
    );

    if (refundResponse.data.status === "failed") {
      throw new Error(
        `Refund failed: ${refundResponse.data.error?.description || "Unknown error"}`
      );
    }

    // Create refund record
    const refundRecord = new Refund({
      order_id: order._id,
      return_id: returnRequest._id.toString(),
      razorpay_refund_id: refundResponse.data.id,
      amount: refundAmount,
      currency: refundResponse.data.currency || "INR",
      status: refundResponse.data.status,
      entity: refundResponse.data.entity,
      refund_type: "Refund-Online",
      receipt: refundResponse.data.receipt,
      reason: "Return refund to source account",
    });

    await refundRecord.save();
    returnRequest.refund.refund_id = refundRecord._id;
    await returnRequest.save();

    logger.info(`Source refund created successfully: ${refundResponse.data.id}`);

    return {
      success: true,
      transactionId: refundResponse.data.id,
      refundId: refundRecord._id,
      refundType: "Source_Refund",
      message: "Refund processed successfully to source account",
      razorpayResponse: refundResponse.data,
    };
  } catch (error) {
    logger.error("Process refund payment error:", {
      error: error.message,
      response: error.response?.data,
      returnId: returnRequest._id,
    });
    return {
      success: false,
      message: error.response?.data?.error?.description || error.message || "Failed to process refund payment",
      error: error.response?.data || error.message,
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
