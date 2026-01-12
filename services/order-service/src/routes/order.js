const express = require("express");
const router = express.Router();
const orderController = require("../controllers/order");
const slaController = require("../controllers/slaController");
const slaViolationManagementController = require("../controllers/slaViolationManagement");
const slaViolationEnhancedController = require("../controllers/slaViolationEnhanced");
const dealerOrderKPIController = require("../controllers/dealerOrderKPI");
const orderStatsController = require("../controllers/orderStatsController");
const paymentStatsController = require("../controllers/paymentStats");
const {
  setOrderSLAExpectations,
  checkSLACompliance,
} = require("../jobs/slaBreach");
const slaViolationMiddleware = require("../middleware/slaViolationMiddleware");
const slaViolationScheduler = require("../jobs/slaViolationScheduler");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const {
  authenticate,
  authorizeRoles,
} = require("/packages/utils/authMiddleware");
const auditLogger = require("../.././../../packages/utils/auditLoggerMiddleware");
const AuditLogger = require("../utils/auditLogger");
const { requireAuth } = require("../middleware/authMiddleware");

// Middleware for role-based access control
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
};

// Middleware for audit logging - only applies when user is authenticated
const auditMiddleware = (action, targetType = null, category = null) => {
  return (req, res, next) => {
    // Only apply audit logging if user is authenticated
    if (req.user && req.user.id && req.user.role) {
      return AuditLogger.createMiddleware(action, targetType, category)(
        req,
        res,
        next
      );
    } else {
      // Skip audit logging and continue to next middleware
      return next();
    }
  };
};

// Order retrieval
router.get(
  "/all",
  requireAuth,
  // auditLogger("ORDER_LIST_ACCESSED", "Order"),
  // auditMiddleware("ORDER_LIST_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getOrders
);
router.get(
  "/id/:id",
  requireAuth,
  // auditMiddleware("ORDER_DETAILS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getOrderById
);
router.get(
  "/picklists",
  requireAuth,
  // auditMiddleware("PICKLIST_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getPickList
);
router.get(
  "/picklists/dealer/:dealerId",
  requireAuth,
  // auditMiddleware("DEALER_PICKLIST_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getPickListByDealer
);
router.get(
  "/picklists/employee/:employeeId",
  requireAuth,
  // auditMiddleware("EMPLOYEE_PICKLIST_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getPickListByEmployee
);

/**
 * @route GET /api/orders/picklists/:id
 * @desc Get comprehensive picklist details by ID with all service data
 * @access Authenticated users
 */
router.get(
  "/picklists/:id",
  requireAuth,
  // auditMiddleware("PICKLIST_DETAILS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getPickListById
);

/**
 * @route GET /api/orders/picklists/stats
 * @desc Get picklist statistics with dealer and staff details
 * @access Authenticated users
 */
router.get(
  "/picklists/stats",
  requireAuth,
  // auditMiddleware("PICKLIST_STATS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getPickListStatistics
);
router.get(
  "/picklists/stats/staff",
  requireAuth,
  // auditMiddleware("FULFILLMENT_STAFF_PICKLIST_STATS_ACCESSED", "Order", "REPORTING"),
  orderController.getFulfillmentStaffPicklistStats
);
router.get(
  "/scanlogs",
  requireAuth,
  // auditMiddleware("SCAN_LOGS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getScanLogs
);
router.get(
  "/scanlogs/dealer/:dealerId",
  requireAuth,
  // auditMiddleware("DEALER_SCAN_LOGS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getScanLogsByDealer
);
router.get(
  "/user/:userId",
  requireAuth,
  // auditMiddleware("USER_ORDERS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getOrderByUserId
);

// Dealer Order KPI Routes
router.get(
  "/dealer/:dealerId/kpis",
  requireAuth,
  // auditMiddleware("DEALER_ORDER_KPIS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  dealerOrderKPIController.getDealerOrderKPIs
);

router.get(
  "/dealer/:dealerId/orders",
  requireAuth,
  // auditMiddleware("DEALER_ORDERS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  dealerOrderKPIController.getDealerOrders
);

router.get(
  "/reports",
  requireAuth,
  // auditMiddleware("ORDER_REPORTS_GENERATED", "Report", "REPORTING"),
  orderController.generateOrderReports
);

router.post(
  "/create",
  requireAuth,
  auditLogger("Order_Created_COD", "ORDER"),
  // setOrderSLAExpectations,
  // auditMiddleware("ORDER_CREATED", "Order", "ORDER_MANAGEMENT"),
  orderController.createOrder
);
router.post(
  "/assign-dealers",
  requireAuth,
  auditLogger("Dealer_Assigned_Order_Manually", "ORDER"),
  // auditMiddleware("DEALER_ASSIGNED", "Order", "ORDER_MANAGEMENT"),
  orderController.assignOrderItemsToDealers
);
router.post(
  "/reassign-dealers",
  requireAuth,
  // auditMiddleware("DEALER_REMAPPED", "Order", "ORDER_MANAGEMENT"),
  orderController.reassignOrderItemsToDealers
);

router.post(
  "/create-pickup",
  requireAuth,
  auditLogger("PickList_created", "ORDER"),
  // auditMiddleware("PICKUP_CREATED", "Order", "ORDER_MANAGEMENT"),
  orderController.createPickup
);
router.post(
  "/assign-picklist",
  requireAuth,
  // auditMiddleware("PICKLIST_ASSIGNED", "Order", "ORDER_MANAGEMENT"),
  orderController.assignPicklistToStaff
);
router.post(
  "/scan",
  requireAuth,
  // auditMiddleware("SKU_SCANNED", "Order", "ORDER_MANAGEMENT"),
  orderController.scanSku
);
router.put(
  "/dealer-update",
  requireAuth,
  // auditMiddleware("ORDER_UPDATED", "Order", "ORDER_MANAGEMENT"),
  orderController.UpdateOrderForDealer
);
router.post(
  "/ship",
  requireAuth,
  // checkSLACompliance,
  // auditMiddleware("ORDER_SHIPPED", "Order", "ORDER_MANAGEMENT"),
  orderController.shipOrder
);

// Status updates (with SLA violation middleware)
router.post(
  "/:orderId/pack",
  requireAuth,
  // slaViolationMiddleware.checkSLAOnOrderUpdate(),
  // auditMiddleware("ORDER_STATUS_CHANGED", "Order", "ORDER_MANAGEMENT"),
  orderController.markAsPacked
);
router.post(
  "/:orderId/deliver",
  requireAuth,
  // slaViolationMiddleware.checkSLAOnOrderUpdate(),
  // auditMiddleware("ORDER_DELIVERED", "Order", "ORDER_MANAGEMENT"),
  orderController.markAsDelivered
);
router.post(
  "/:orderId/cancel",
  requireAuth,
  auditLogger("Order_Cancel", "ORDER"),
  // slaViolationMiddleware.checkSLAOnOrderUpdate(),
  // auditMiddleware("ORDER_CANCELLED", "Order", "ORDER_MANAGEMENT"),
  orderController.cancelOrder
);

// SKU-level status updates
router.post(
  "/:orderId/sku/:sku/pack",
  requireAuth,
  // slaViolationMiddleware.checkSLAOnOrderUpdate(),
  // auditMiddleware("SKU_PACKED", "Order", "ORDER_MANAGEMENT"),
  orderController.markSkuAsPacked
);
router.post(
  "/:orderId/sku/:sku/ship",
  requireAuth,
  // auditMiddleware("SKU_SHIPPED", "Order", "ORDER_MANAGEMENT"),
  orderController.markSkuAsShipped
);
router.post(
  "/:orderId/sku/:sku/deliver",
  requireAuth,
  // auditMiddleware("SKU_DELIVERED", "Order", "ORDER_MANAGEMENT"),
  orderController.markSkuAsDelivered
);

// Order status breakdown
router.get(
  "/:orderId/status-breakdown",
  requireAuth,
  // auditMiddleware(
  //   "ORDER_STATUS_BREAKDOWN_ACCESSED",
  //   "Order",
  //   "ORDER_MANAGEMENT"
  // ),
  orderController.getOrderStatusBreakdown
);

router.post(
  "/:orderId/check-delivery",
  requireAuth,
  // auditMiddleware("ORDER_DELIVERY_CHECKED", "Order", "ORDER_MANAGEMENT"),
  orderController.checkAndMarkOrderAsDelivered
);

router.post(
  "/sla/types",
  requireAuth,
  // auditMiddleware("SLA_TYPE_CREATED", "SLA", "SLA_MANAGEMENT"),
  slaController.createSLAType
);
router.get(
  "/sla/types",
  requireAuth,
  // auditMiddleware("SLA_TYPES_ACCESSED", "SLA", "SLA_MANAGEMENT"),
  slaController.getSLATypes
);
router.get(
  "/get-by-name",
  // requireAuth,
  // auditMiddleware("SLA_BY_NAME_ACCESSED", "SLA", "SLA_MANAGEMENT"),
  slaController.getSlaByName
);
router.post(
  "/dealers/:dealerId/sla",
  requireAuth,
  // auditMiddleware("DEALER_SLA_UPDATED", "SLA", "SLA_MANAGEMENT"),
  slaController.setDealerSLA
);
// router.get("/dealers/:dealerId/sla", slaController.getDealerSLA);
router.post(
  "/sla/violations",
  requireAuth,
  // auditMiddleware("SLA_VIOLATION_RECORDED", "SLA", "SLA_MANAGEMENT"),
  slaController.logViolation
);
router.get(
  "/sla/violations",
  requireAuth,
  // auditMiddleware("SLA_VIOLATIONS_ACCESSED", "SLA", "SLA_MANAGEMENT"),
  slaController.getViolations
);
router.get(
  "/sla/violations/order/:orderId",
  requireAuth,
  // auditMiddleware("ORDER_SLA_VIOLATIONS_ACCESSED", "SLA", "SLA_MANAGEMENT"),
  slaController.getViolationsByOrder
);
router.get(
  "/sla/violations/summary/:dealerId",
  requireAuth,
  // auditMiddleware(
  //   "DEALER_SLA_VIOLATIONS_SUMMARY_ACCESSED",
  //   "SLA",
  //   "SLA_MANAGEMENT"
  // ),
  slaController.getViolationsSummary
);
router.get(
  "/sla/violations/dealer/:dealerId",
  requireAuth,
  // auditMiddleware("DEALER_SLA_VIOLATIONS_ACCESSED", "SLA", "SLA_MANAGEMENT"),
  slaController.getViolationsByDealerId
);
router.get(
  "/sla/violations/approaching",
  requireAuth,
  // auditMiddleware(
  //   "APPROACHING_SLA_VIOLATIONS_ACCESSED",
  //   "SLA",
  //   "SLA_MANAGEMENT"
  // ),
  slaController.getApproachingViolations
);
// router.patch("/sla/violations/:violationId", slaController.updateViolationStatus);

// SLA Violation Management Routes
router.post(
  "/sla/violations/manual",
  requireAuth,
  // auditMiddleware("MANUAL_SLA_VIOLATION_CREATED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationManagementController.createManualSLAViolation
);

router.post(
  "/sla/violations/:violationId/contact-dealer",
  requireAuth,
  // auditMiddleware("DEALER_CONTACTED_ABOUT_VIOLATION", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationManagementController.contactDealerAboutViolation
);

router.post(
  "/sla/violations/bulk-contact",
  requireAuth,
  // auditMiddleware("BULK_DEALER_CONTACT_ATTEMPTED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationManagementController.bulkContactDealers
);

router.get(
  "/sla/violations/with-contact-info",
  requireAuth,
  // auditMiddleware("SLA_VIOLATIONS_WITH_CONTACT_INFO_ACCESSED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationManagementController.getSLAViolationsWithContactInfo
);

router.put(
  "/sla/violations/:violationId/resolve",
  requireAuth,
  // auditMiddleware("SLA_VIOLATION_RESOLUTION_ATTEMPTED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationManagementController.resolveSLAViolation
);

router.get(
  "/sla/violations/dealer/:dealerId/summary",
  requireAuth,
  // auditMiddleware("DEALER_VIOLATION_SUMMARY_ACCESSED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationManagementController.getDealerViolationSummary
);

// Enhanced SLA Violation Routes with Populated Data
router.get(
  "/sla/violations/enhanced",
  requireAuth,
  // auditMiddleware("ENHANCED_SLA_VIOLATIONS_ACCESSED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationEnhancedController.getSLAViolationsWithPopulatedData
);

router.get(
  "/sla/violations/enhanced/:violationId",
  requireAuth,
  // auditMiddleware("ENHANCED_SLA_VIOLATION_DETAILS_ACCESSED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationEnhancedController.getSLAViolationByIdWithPopulatedData
);

router.get(
  "/sla/violations/enhanced/dealer/:dealerId",
  requireAuth,
  // auditMiddleware("ENHANCED_DEALER_SLA_VIOLATIONS_ACCESSED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationEnhancedController.getSLAViolationsByDealerWithPopulatedData
);

router.get(
  "/sla/violations/enhanced/order/:orderId",
  requireAuth,
  // auditMiddleware("ENHANCED_ORDER_SLA_VIOLATIONS_ACCESSED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationEnhancedController.getSLAViolationsByOrderWithPopulatedData
);

router.get(
  "/sla/violations/enhanced/analytics",
  requireAuth,
  // auditMiddleware("ENHANCED_SLA_VIOLATION_ANALYTICS_ACCESSED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationEnhancedController.getSLAViolationAnalytics
);

router.get(
  "/sla/violations/enhanced/search",
  requireAuth,
  // auditMiddleware("ENHANCED_SLA_VIOLATION_SEARCH_ACCESSED", "SLAViolation", "SLA_MANAGEMENT"),
  slaViolationEnhancedController.searchSLAViolations
);

// SLA Scheduler Management
router.post(
  "/sla/scheduler/start",
  requireAuth,
  // auditMiddleware("SLA_SCHEDULER_STARTED", "SLA", "SLA_MANAGEMENT"),
  slaController.startScheduler
);
router.post(
  "/sla/scheduler/stop",
  requireAuth,
  // auditMiddleware("SLA_SCHEDULER_STOPPED", "SLA", "SLA_MANAGEMENT"),
  slaController.stopScheduler
);
router.get(
  "/sla/scheduler/status",
  requireAuth,
  // auditMiddleware("SLA_SCHEDULER_STATUS_ACCESSED", "SLA", "SLA_MANAGEMENT"),
  slaController.getSchedulerStatus
);
router.post(
  "/sla/scheduler/trigger-check",
  requireAuth,
  // auditMiddleware("SLA_MANUAL_CHECK_TRIGGERED", "SLA", "SLA_MANAGEMENT"),
  slaController.triggerManualCheck
);

// Analytics
router.get(
  "/analytics/fulfillment",
  requireAuth,
  // auditMiddleware("FULFILLMENT_ANALYTICS_ACCESSED", "Order", "REPORTING"),
  orderController.getFulfillmentMetrics
);
router.get(
  "/analytics/sla-compliance",
  requireAuth,
  // auditMiddleware("SLA_COMPLIANCE_REPORT_ACCESSED", "Order", "REPORTING"),
  orderController.getSLAComplianceReport
);
router.get(
  "/analytics/dealer-performance",
  requireAuth,
  // auditMiddleware(
  //   "DEALER_PERFORMANCE_ANALYTICS_ACCESSED",
  //   "Order",
  //   "REPORTING"
  // ),
  orderController.getDealerPerformance
);
router.get(
  "/stats",
  requireAuth,
  requireRole(["Super-admin", "Inventory-Admin", "Fulfillment-Admin"]),
  // auditMiddleware("ORDER_STATS_ACCESSED", "Order", "REPORTING"),
  orderController.getOrderStats
);

// Batch processing
router.post(
  "/batch/assign",
  requireAuth,
  // auditMiddleware("BATCH_ORDER_ASSIGNMENT", "Order", "ORDER_MANAGEMENT"),
  orderController.batchAssignOrders
);
router.post(
  "/batch/status-update",
  requireAuth,
  // auditMiddleware("BATCH_ORDER_STATUS_UPDATE", "Order", "ORDER_MANAGEMENT"),
  orderController.batchUpdateStatus
);

router.get(
  "/get/order-by-dealer/:dealerId",
  requireAuth,
  // auditMiddleware("DEALER_ORDERS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getOrdersByDealerId
);
router.get(
  "/staff/:staffId/orders",
  requireAuth,
  // auditMiddleware("STAFF_ORDERS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  orderController.getOrdersForFulfillmentStaff
);
router.put(
  "/update/order-status-by-dealer",
  requireAuth,
  // auditMiddleware("DEALER_ORDER_STATUS_UPDATED", "Order", "ORDER_MANAGEMENT"),
  orderController.markDealerPackedAndUpdateOrderStatus
);
router.put("/add/order-rating/by-userId", orderController.addReview);
router.post(
  "/createOrder/forPurchseOrder",
  orderController.createOrderBySuperAdmin
);
router.get(
  "/getOrder/forPurchseOrder/:purchaseOrderId",
  orderController.getOrderByPurchaseOrderId
);

// Borzo delivery orders
router.post("/borzo/instant", orderController.createOrderBorzoInstant);
router.post("/borzo/endofday", orderController.createOrderBorzoEndofDay);

// Borzo label endpoints
router.get("/borzo/labels/:order_id", orderController.getBorzoOrderLabels);
router.get(
  "/borzo/labels/:order_id/json",
  orderController.getBorzoOrderLabelsAsJSON
);
router.get(
  "/borzo/labels/internal/:internalOrderId",
  orderController.getBorzoOrderLabelsByInternalOrderId
);

// Borzo webhook endpoint
router.post("/borzo/webhook", orderController.borzoWebhook);

// Order tracking endpoint
router.get("/tracking/:orderId", orderController.getOrderTrackingInfo);

// SKU tracking endpoints
router.get("/tracking/:orderId/sku/:sku", orderController.getSkuTrackingInfo);
router.put(
  "/tracking/:orderId/sku/:sku",
  orderController.updateSkuTrackingStatus
);

// Debug endpoint for Borzo order ID
router.post("/debug/borzo-order-id", orderController.debugBorzoOrderId);

router.get(
  "/get/order/stats",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Fulfillment-Admin"),
  orderController.getOrderStatsCount
);
router.get("/get/orderSummary", orderController.getOrderSummaryMonthlyorWeekly);

// Order-specific Audit Log Endpoints

/**
 * @route GET /api/orders/:orderId/audit-logs
 * @desc Get audit logs for a specific order
 * @access Authenticated users with order access
 */
router.get(
  "/:orderId/audit-logs",
  requireAuth,
  // auditMiddleware("ORDER_AUDIT_LOGS_ACCESSED", "Order", "ORDER_MANAGEMENT"),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { page = 1, limit = 10, action, startDate, endDate } = req.query;

      const query = { targetId: orderId };
      if (action) query.action = action;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const auditLogs = await AuditLogger.getAuditLogs({
        query,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.json({
        success: true,
        data: auditLogs,
        message: "Order audit logs fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching order audit logs:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch order audit logs",
      });
    }
  }
);

/**
 * @route GET /api/orders/user/:userId/audit-logs
 * @desc Get audit logs for all orders by a specific user
 * @access Authenticated users
 */
router.get(
  "/user/:userId/audit-logs",
  requireAuth,
  // auditMiddleware(
  //   "USER_ORDER_AUDIT_LOGS_ACCESSED",
  //   "Order",
  //   "ORDER_MANAGEMENT"
  // ),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10, action, startDate, endDate } = req.query;

      const query = { actorId: userId };
      if (action) query.action = action;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const auditLogs = await AuditLogger.getAuditLogs({
        query,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.json({
        success: true,
        data: auditLogs,
        message: "User order audit logs fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching user order audit logs:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch user order audit logs",
      });
    }
  }
);

/**
 * @route GET /api/orders/dealer/:dealerId/audit-logs
 * @desc Get audit logs for all orders handled by a specific dealer
 * @access Authenticated users
 */
router.get(
  "/dealer/:dealerId/audit-logs",
  requireAuth,
  // auditMiddleware(
  //   "DEALER_ORDER_AUDIT_LOGS_ACCESSED",
  //   "Order",
  //   "ORDER_MANAGEMENT"
  // ),
  async (req, res) => {
    try {
      const { dealerId } = req.params;
      const { page = 1, limit = 10, action, startDate, endDate } = req.query;

      const query = {
        "details.dealerId": dealerId,
        targetType: "Order",
      };
      if (action) query.action = action;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const auditLogs = await AuditLogger.getAuditLogs({
        query,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.json({
        success: true,
        data: auditLogs,
        message: "Dealer order audit logs fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching dealer order audit logs:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch dealer order audit logs",
      });
    }
  }
);

// Order Statistics Routes
/**
 * @route GET /api/orders/stats
 * @desc Get comprehensive order statistics including revenue, customers, AOV, time-based metrics, payment methods, order statuses, and recent orders
 * @access Super Admin, Fulfillment Admin, Inventory Admin, Analytics Admin
 */
router.get(
  "/stats",
  requireAuth,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Analytics-Admin",
  ]),
  // auditMiddleware("ORDER_STATS_ACCESSED", "System", "ANALYTICS"),
  orderStatsController.getOrderStats
);

/**
 * @route GET /api/orders/stats/dealer/:dealerId
 * @desc Get order statistics for a specific dealer
 * @access Super Admin, Fulfillment Admin, Inventory Admin, Analytics Admin
 */
router.get(
  "/stats/dealer/:dealerId",
  requireAuth,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Analytics-Admin",
  ]),
  // auditMiddleware("DEALER_ORDER_STATS_ACCESSED", "Dealer", "ANALYTICS"),
  orderStatsController.getDealerOrderStats
);

/**
 * @route GET /api/orders/stats/dashboard
 * @desc Get comprehensive order statistics dashboard with additional metrics
 * @access Super Admin, Fulfillment Admin, Inventory Admin, Analytics Admin
 */
router.get(
  "/stats/dashboard",
  requireAuth,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Analytics-Admin",
  ]),
  // auditMiddleware("ORDER_STATS_DASHBOARD_ACCESSED", "System", "ANALYTICS"),
  orderStatsController.getOrderStatsDashboard
);

/**
 * @route GET /api/orders/stats/filters
 * @desc Get focused order statistics with filters for today and status, including SKU level tracking
 * @access Super Admin, Fulfillment Admin, Inventory Admin, Analytics Admin
 */
router.get(
  "/stats/filters",
  requireAuth,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Analytics-Admin",
  ]),
  // auditMiddleware("ORDER_STATS_FILTERS_ACCESSED", "System", "ANALYTICS"),
  orderStatsController.getOrderStatsWithFilters
);

/**
 * @route GET /api/orders/dealer/:dealerId/stats
 * @desc Get comprehensive dealer statistics including orders, picklists, and financial metrics
 * @access Super Admin, Fulfillment Admin, Inventory Admin, Analytics Admin
 */
router.get(
  "/dealer/:dealerId/stats",
  requireAuth,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Analytics-Admin",
  ]),
  // auditMiddleware("DEALER_STATS_ACCESSED", "Dealer", "ANALYTICS"),
  orderController.getDealerStats
);

// Payment Statistics Routes
router.get(
  "/payment-stats",
  authenticate,
  authorizeRoles('Super-admin', 'Fulfillment-Admin', 'Inventory-Admin', 'Customer-Support'),
  // auditMiddleware("PAYMENT_STATS_ACCESSED", "Payment", "ANALYTICS"),
  paymentStatsController.getPaymentStats
);

router.get(
  "/payment-stats/period",
  authenticate,
  authorizeRoles('Super-admin', 'Fulfillment-Admin', 'Inventory-Admin', 'Customer-Support'),
  // auditMiddleware("PAYMENT_STATS_PERIOD_ACCESSED", "Payment", "ANALYTICS"),
  paymentStatsController.getPaymentStatsByPeriod
);

router.get(
  "/payment-stats/summary",
  authenticate,
  authorizeRoles('Super-admin', 'Fulfillment-Admin', 'Inventory-Admin', 'Customer-Support'),
  // auditMiddleware("PAYMENT_STATS_SUMMARY_ACCESSED", "Payment", "ANALYTICS"),
  paymentStatsController.getPaymentStatsSummary
);

router.put(
  "/update/order-status-by-dealer/by-sku",
  requireAuth,
  // auditMiddleware("DEALER_ORDER_STATUS_UPDATED", "Order", "ORDER_MANAGEMENT"),
  // orderController.markDealerPackedAndUpdateOrderStatusBySKU
  orderController.markDealerPackedAndUpdateOrderStatusBySKUOne
);

router.post("/borzo/webhook/modified", orderController.borzoWebhookUpdated);
router.get("/test/order-geocode/:orderId", orderController.testGeoCode);


router.get("/order-summury/monthy/weekly", orderController.getOrderStatistics);
router.get("/order/all/exports", orderController.getOrdersNoPagination);
router.get(
  "/picklists/all/exports",
  orderController.getPickListNoPagination
);
router.get("/get/order-stats/by-dealer/:dealerId", orderController.getOrderStatsByDealer);

router.get("/dealer/:dealerId/revenue", orderController.getDealerRevenue);

router.put(
  "/update/order-status-by-dealer/by-sku/manual/deliveryStarted",
  requireAuth,
  orderController.markAsManualDeliveryStarted
);
router.put(
  "/update/order-status-by-dealer/by-sku/manual/deliveryEnded",
  requireAuth,
  orderController.markAsManualDeliveryEnded
);

module.exports = router;
