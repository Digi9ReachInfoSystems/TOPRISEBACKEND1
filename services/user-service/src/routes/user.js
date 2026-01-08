const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const userController = require("../controllers/user");
const dealerStatsController = require("../controllers/dealerStats");
const dealerDashboardController = require("../controller/dealerDashboard");
const fulfillmentStaffController = require("../controllers/fulfillmentStaff");
const {
  authenticate,
  authorizeRoles,
} = require("/packages/utils/authMiddleware");
const { auth } = require("firebase-admin");
const UserAuditLogger = require("../utils/auditLogger");
const Dealer = require("../models/dealer");
const User = require("../models/user");
const auditLogger = require("../.././../../packages/utils/auditLoggerMiddleware");

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
      return UserAuditLogger.createMiddleware(action, targetType, category)(
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
router.get(
  "/getemployees",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("EMPLOYEE_LIST_ACCESSED", "Employee", "EMPLOYEE_MANAGEMENT"),
  userController.getAllEmployees
);

router.get(
  "/stats",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("USER_STATS_ACCESSED", "System", "REPORTING"),
  userController.getUserStats
);

router.get(
  "/insights",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("USER_INSIGHTS_ACCESSED", "System", "REPORTING"),
  userController.getUserInsights
);

router.get(
  "/employee/get-by-id",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware(
  //   "EMPLOYEE_DETAILS_ACCESSED",
  //   "Employee",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.getEmployeeById
);

router.get(
  "/employee/stats",
  authenticate,
  requireRole(["Super-admin","Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("EMPLOYEE_STATS_ACCESSED", "Employee", "REPORTING"),
  userController.getEmployeeStats
);

router.get(
  "/dealer/stats",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("DEALER_STATS_ACCESSED", "Dealer", "REPORTING"),
  dealerStatsController.getDealerStats
);

// ============================================
// FULFILLMENT STAFF ROUTES
// ============================================

// Get all fulfillment staff with pagination and filters
router.get(
  "/fulfillment-staff",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("FULFILLMENT_STAFF_LIST_ACCESSED", "Employee", "EMPLOYEE_MANAGEMENT"),
  fulfillmentStaffController.getAllFulfillmentStaff
);

// Get fulfillment staff statistics
router.get(
  "/fulfillment-staff/stats",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("FULFILLMENT_STAFF_STATS_ACCESSED", "Employee", "REPORTING"),
  fulfillmentStaffController.getFulfillmentStaffStats
);

// Get available regions
router.get(
  "/fulfillment-staff/regions",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("FULFILLMENT_STAFF_REGIONS_ACCESSED", "Employee", "EMPLOYEE_MANAGEMENT"),
  fulfillmentStaffController.getAvailableRegions
);

// Get fulfillment staff by region
router.get(
  "/fulfillment-staff/by-region",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("FULFILLMENT_STAFF_BY_REGION_ACCESSED", "Employee", "EMPLOYEE_MANAGEMENT"),
  fulfillmentStaffController.getFulfillmentStaffByRegion
);

// Get fulfillment staff by user ID
router.get(
  "/fulfillment-staff/by-user/:userId",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin", "Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("FULFILLMENT_STAFF_BY_USER_ACCESSED", "Employee", "EMPLOYEE_MANAGEMENT"),
  fulfillmentStaffController.getFulfillmentStaffByUserId
);

router.get(
  "/fulfillment-staff/:id",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin", "Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("FULFILLMENT_STAFF_DETAILS_ACCESSED", "Employee", "EMPLOYEE_MANAGEMENT"),
  fulfillmentStaffController.getFulfillmentStaffById
);

router.post(
  "/signup",
  // // auditMiddleware("USER_CREATED", "User", "USER_MANAGEMENT"),
  userController.signupUser
);

router.post(
  "/createUser",
  authenticate,
  requireRole(["Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // // auditMiddleware("USER_CREATED", "User", "USER_MANAGEMENT"),
  userController.createUser
);
router.post(
  "/createUserforWeb",

  userController.createUser1
);

router.post(
  "/login",
   auditLogger("Login_Successful_user", "USER",),
  // // auditMiddleware("LOGIN_ATTEMPT_SUCCESS", "User", "AUTHENTICATION"),
  userController.loginUserForMobile
);

router.post(
  "/loginWeb",
  auditLogger("Login_Successful_admin", "USER"),
  // // auditMiddleware("LOGIN_ATTEMPT_SUCCESS", "User", "AUTHENTICATION"),
  userController.loginUserForDashboard
);

router.post(
  "/check-user",
  // // auditMiddleware("USER_ACCOUNT_CHECKED", "User", "USER_MANAGEMENT"),
  userController.checkUserAccountCreated
);

router.get(
  "/dealers",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("DEALER_LIST_ACCESSED", "Dealer", "DEALER_MANAGEMENT"),
  userController.getAllDealers
);

// User CRUD Routes
router.get(
  "/dealer/:id",
  // authenticate,
  // requireRole([
  //   "Super-admin",
  //   "Fulfillment-Admin",
  //   "Inventory-Admin",
  //   "Dealer",
  // ]),
  // // auditMiddleware("DEALER_DETAILS_ACCESSED", "Dealer", "DEALER_MANAGEMENT"),
  userController.getDealerById
);

router.get(
  "/allUsers/internal",
  // authenticate,
  // requireRole(["Super-admin"]),
  // // auditMiddleware("USER_LIST_ACCESSED", "User", "USER_MANAGEMENT"),
  userController.getAllUsers
);

router.get(
  "/",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Fulfillment-Staff",
    "Inventory-Admin",
    "Inventory-Staff",
    "Dealer",
    "User",
    "Customer-Support",
  ]),
  // // auditMiddleware("USER_LIST_ACCESSED", "User", "USER_MANAGEMENT"),
  userController.getAllUsers
);

router.get(
  "/:id",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Fulfillment-Staff",
    "Inventory-Admin",
    "Inventory-Staff",
    "Dealer",
    "User",
    "Customer-Support",
  ]),
  // // auditMiddleware("USER_DETAILS_ACCESSED", "User", "USER_MANAGEMENT"),
  userController.getUserById
);

router.get(
  "/employee/:employeeId",
  authenticate,
  auditLogger("Update_Employee_Profile", "USER",),
  // requireRole(["Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware(
  //   "EMPLOYEE_DETAILS_ACCESSED",
  //   "Employee",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.getEmployeeDetails
);

router.delete(
  "/:id",
  authenticate,
  requireRole(["Super-admin","User","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // // auditMiddleware("USER_DELETED", "User", "USER_MANAGEMENT"),
  userController.deleteUser
);

router.put(
  "/revoke-role/:id",
  authenticate,
  requireRole(["Super-admin"]),
  // // auditMiddleware("ROLE_REVOKED", "User", "ROLE_MANAGEMENT"),
  userController.revokeRole
);

// Dealer Routes
router.post(
  "/dealer",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  auditLogger("Create_Dealer", "USER"),
  // // auditMiddleware("DEALER_CREATED", "Dealer", "DEALER_MANAGEMENT"),
  userController.createDealer
);

router.patch(
  "/disable-dealer/:dealerId",
  authenticate,
   auditLogger("Deactivate_Dealer", "USER"),
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("DEALER_DEACTIVATED", "Dealer", "DEALER_MANAGEMENT"),
  userController.disableDealer
);

router.post(
  "/create-Employee",
  authenticate,
  requireRole(["Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
   auditLogger("Create_Employee", "USER"),
  // // auditMiddleware("EMPLOYEE_CREATED", "Employee", "EMPLOYEE_MANAGEMENT"),
  userController.createEmployee
);

// ==================== EMPLOYEE REGION & DEALER ROUTES ====================

/**
 * Get employees by dealer
 * @route GET /api/users/employees/dealer/:dealerId
 * @desc Get all employees assigned to a specific dealer
 */
router.get(
  "/employees/dealer/:dealerId",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Fulfillment-Staff",
    "Inventory-Staff",
  ]),
  // // auditMiddleware(
  //   "EMPLOYEES_BY_DEALER_ACCESSED",
  //   "Employee",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.getEmployeesByDealer
);

/**
 * Get employees by region
 * @route GET /api/users/employees/region/:region
 * @desc Get all employees assigned to a specific region (including those without dealer assignments)
 */
router.get(
  "/employees/region/:region",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Fulfillment-Staff",
    "Inventory-Staff",
  ]),
  // // auditMiddleware(
  //   "EMPLOYEES_BY_REGION_ACCESSED",
  //   "Employee",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.getEmployeesByRegion
);

/**
 * Get employees by region and dealer
 * @route GET /api/users/employees/region/:region/dealer/:dealerId
 * @desc Get all employees assigned to both a specific region and dealer
 */
router.get(
  "/employees/region/:region/dealer/:dealerId",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Fulfillment-Staff",
    "Inventory-Staff",
  ]),
  // // auditMiddleware(
  //   "EMPLOYEES_BY_REGION_AND_DEALER_ACCESSED",
  //   "Employee",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.getEmployeesByRegionAndDealer
);

/**
 * Get fulfillment staff by region
 * @route GET /api/users/employees/fulfillment/region/:region
 * @desc Get fulfillment staff assigned to a specific region
 */
router.get(
  "/employees/fulfillment/region/:region",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Inventory-Admin",
    "Fulfillment-Staff",
    "Inventory-Staff",
  ]),
  // // auditMiddleware(
  //   "FULFILLMENT_STAFF_BY_REGION_ACCESSED",
  //   "Employee",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.getFulfillmentStaffByRegion
);

router.post(
  "/dealers/bulk",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  upload.single("file"),
  // // auditMiddleware("BULK_DEALERS_CREATED", "Dealer", "DEALER_MANAGEMENT"),
  userController.createDealersBulk
);

router.post(
  "/map-categories/",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("CATEGORIES_MAPPED_TO_USER", "User", "USER_MANAGEMENT"),
  userController.mapCategoriesToUser
);

router.put(
  "/updateAddress/:id",
  authenticate,
  requireRole(["User","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // // auditMiddleware("ADDRESS_UPDATED", "User", "USER_MANAGEMENT"),
  userController.updateUserAddress
);

router.put(
  "/dealer/:id",
  authenticate,
  auditLogger("Update_Dealer_Details", "USER"),
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // // auditMiddleware("DEALER_UPDATED", "Dealer", "DEALER_MANAGEMENT"),
  userController.updateDealer
);
router.put(
  "/address/:userId",
  authenticate,
  requireRole(["User","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("ADDRESS_EDITED", "User", "USER_MANAGEMENT"),
  userController.editUserAddress
);

router.delete(
  "/address/:userId",
  authenticate,
  requireRole(["User","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("ADDRESS_DELETED", "User", "USER_MANAGEMENT"),
  userController.deleteUserAddress
);

router.put(
  "/profile/:userId",
  authenticate,
  // requireRole(["User"]),
auditLogger("Update_Employee_Profile", "USER"),
  // auditMiddleware("USER_PROFILE_UPDATED", "User", "USER_MANAGEMENT"),
  userController.updateEmailOrName
);

router.put(
  "/profile/user/:userId",
  authenticate,
  // requireRole(["User"]),
  // auditMiddleware("USER_PROFILE_UPDATED", "User", "USER_MANAGEMENT"),
  userController.updateEmailOrNameUser
);

router.put(
  "/update-cartId/:userId",
  authenticate,
  requireRole(["User", "Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("USER_CART_ID_UPDATED", "User", "USER_MANAGEMENT"),
  userController.updateUserCartId
);

router.post(
  "/:userId/vehicles",
  authenticate,
  requireRole(["User", "Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("VEHICLE_ADDED", "User", "USER_MANAGEMENT"),
  userController.addVehicleDetails
);

router.put(
  "/:userId/vehicles/:vehicleId",
  authenticate,
  requireRole(["User", "Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("VEHICLE_UPDATED", "User", "USER_MANAGEMENT"),
  userController.editVehicleDetails
);

router.delete(
  "/:userId/vehicles/:vehicleId",
  authenticate,
  requireRole(["User", "Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("VEHICLE_DELETED", "User", "USER_MANAGEMENT"),
  userController.deleteVehicleDetails
);

router.put(
  "/update-fcmToken/:userId",
  authenticate,
  requireRole(["User", "Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("FCM_TOKEN_UPDATED", "User", "USER_MANAGEMENT"),
  userController.updateFCMToken
);

router.put(
  "/assign-support/:ticketId/:supportId",
  authenticate,
  requireRole(["Super-admin", "Customer-Support","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("SUPPORT_ASSIGNED", "User", "USER_MANAGEMENT"),
  userController.assignTicketToSupport
);

router.put(
  "/remove-support/:ticketId/:supportId",
  authenticate,
  requireRole(["Super-admin", "Customer-Support","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("SUPPORT_REMOVED", "User", "USER_MANAGEMENT"),
  userController.removeTicketFromSupport
);

router.put(
  "/update-wishlistId/:userId",
  authenticate,
  requireRole(["User", "Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("WISHLIST_ID_UPDATED", "User", "USER_MANAGEMENT"),
  userController.updateWhislistId
);

router.patch(
  "/enable-dealer/:dealerId",
  authenticate,
  auditLogger("Activate_Dealer", "USER"),
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("DEALER_ACTIVATED", "Dealer", "DEALER_MANAGEMENT"),
  userController.enableDealer
);

router.get(
  "/get/dealer-for-assign/:productId",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware(
  //   "DEALER_FOR_ASSIGNMENT_ACCESSED",
  //   "Dealer",
  //   "DEALER_MANAGEMENT"
  // ),
  userController.getDealersByAllowedCategory
);

router.get(
  "/get/userBy/Email/:email",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("USER_BY_EMAIL_ACCESSED", "User", "USER_MANAGEMENT"),
  userController.getUserByEmail
);

router.patch(
  "/updateDealer/addAllowedCategores/:dealerId",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("ALLOWED_CATEGORIES_ADDED", "Dealer", "DEALER_MANAGEMENT"),
  userController.addAllowedCategories
);

router.patch(
  "/updateDealer/removeAllowedCategores/:dealerId",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("ALLOWED_CATEGORIES_REMOVED", "Dealer", "DEALER_MANAGEMENT"),
  userController.removeAllowedCategories
);

// Bank Details Routes
router.post(
  "/:userId/bank-details",
  // authenticate,
  // requireRole(["User", "Super-admin"]),
  // auditMiddleware("BANK_DETAILS_ADDED", "User", "USER_MANAGEMENT"),
  userController.addBankDetails
);

router.put(
  "/:userId/bank-details",
  // authenticate,
  // requireRole(["User", "Super-admin"]),
  // auditMiddleware("BANK_DETAILS_UPDATED", "User", "USER_MANAGEMENT"),
  userController.updateBankDetails
);

router.get(
  "/:userId/bank-details",

  // auditMiddleware("BANK_DETAILS_ACCESSED", "User", "USER_MANAGEMENT"),
  userController.getBankDetails
);

router.delete(
  "/:userId/bank-details",
  authenticate,
  requireRole(["User", "Super-admin","Inventory-Admin", "Inventory-Staff","Fulfillment-Admin","Fulfillment-Staff"]),
  // auditMiddleware("BANK_DETAILS_DELETED", "User", "USER_MANAGEMENT"),
  userController.deleteBankDetails
);

router.get(
  "/validate-ifsc",
  // auditMiddleware("IFSC_VALIDATION_ACCESSED", "System", "USER_MANAGEMENT"),
  userController.validateIFSC
);

router.get(
  "/bank-details/account/:account_number",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff",]),
  // auditMiddleware(
  //   "BANK_DETAILS_BY_ACCOUNT_ACCESSED",
  //   "User",
  //   "USER_MANAGEMENT"
  // ),
  userController.getBankDetailsByAccountNumber
);

// Employee Assignment Routes
router.post(
  "/dealers/:dealerId/assign-employees",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware(
  //   "EMPLOYEES_ASSIGNED_TO_DEALER",
  //   "Dealer",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.assignEmployeesToDealer
);

router.delete(
  "/dealers/:dealerId/remove-employees",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware(
  //   "EMPLOYEES_REMOVED_FROM_DEALER",
  //   "Dealer",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.removeEmployeesFromDealer
);

router.get(
  "/dealers/:dealerId/assigned-employees",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Dealer","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware(
  //   "DEALER_ASSIGNED_EMPLOYEES_ACCESSED",
  //   "Dealer",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.getDealerAssignedEmployees
);

router.put(
  "/dealers/:dealerId/assignments/:assignmentId/status",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware(
  //   "EMPLOYEE_ASSIGNMENT_STATUS_UPDATED",
  //   "Dealer",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.updateEmployeeAssignmentStatus
);

router.get(
  "/employees/:employeeId/dealer-assignments",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware(
  //   "EMPLOYEE_ASSIGNMENTS_ACCESSED",
  //   "Employee",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  userController.getEmployeesAssignedToMultipleDealers
);

router.post(
  "/dealers/bulk-assign-employees",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("BULK_EMPLOYEES_ASSIGNED", "Dealer", "EMPLOYEE_MANAGEMENT"),
  userController.bulkAssignEmployeesToDealers
);

router.get(
  "/all/users",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin",
    "Fulfillment-Staff",
    "Inventory-Admin",
    "Inventory-Staff",
    "Dealer",
    "User",
    "Customer-Support",
  ]),
  // auditMiddleware("USER_LIST_ACCESSED", "User", "USER_MANAGEMENT"),
  userController.getAllUsers
);

router.get(
  "/user/stats/userCounts",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("USER_STATS_ACCESSED", "System", "REPORTING"),
  userController.getUserStats
);

router.get(
  "/get/dealerByCategory/:categoryId",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin","Fulfillment-Staff",
    "Inventory-Admin",
    "Dealer",
    "User",
    "Customer-Support",
  ]),
  // auditMiddleware("DEALER_BY_CATEGORY_ACCESSED", "Dealer", "DEALER_MANAGEMENT"),
  userController.getDealersByCategoryId
);

router.get(
  "/get/dealerByCategoryName/:categoryName",
  authenticate,
  requireRole([
    "Super-admin",
    "Fulfillment-Admin","Fulfillment-Staff",
    "Inventory-Admin",
    "Dealer",
    "User",
    "Customer-Support",
  ]),
  // auditMiddleware(
  //   "DEALER_BY_CATEGORY_NAME_ACCESSED",
  //   "Dealer",
  //   "DEALER_MANAGEMENT"
  // ),
  userController.getDealersByCategoryName
);

// User-specific Audit Log Endpoints

/**
 * @route GET /api/users/:userId/audit-logs
 * @desc Get audit logs for a specific user
 * @access Authenticated users with user access
 */
router.get(
  "/:userId/audit-logs",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff", "Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("USER_AUDIT_LOGS_ACCESSED", "User", "USER_MANAGEMENT"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10, action, startDate, endDate } = req.query;

      const query = { targetId: userId };
      if (action) query.action = action;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const auditLogs = await UserAuditLogger.getAuditLogs({
        query,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.json({
        success: true,
        data: auditLogs,
        message: "User audit logs fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching user audit logs:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch user audit logs",
      });
    }
  }
);

/**
 * @route GET /api/users/dealer/:dealerId/audit-logs
 * @desc Get audit logs for a specific dealer
 * @access Authenticated users
 */
router.get(
  "/dealer/:dealerId/audit-logs",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware("DEALER_AUDIT_LOGS_ACCESSED", "Dealer", "DEALER_MANAGEMENT"),
  async (req, res) => {
    try {
      const { dealerId } = req.params;
      const { page = 1, limit = 10, action, startDate, endDate } = req.query;

      const query = { targetId: dealerId };
      if (action) query.action = action;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const auditLogs = await UserAuditLogger.getAuditLogs({
        query,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.json({
        success: true,
        data: auditLogs,
        message: "Dealer audit logs fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching dealer audit logs:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch dealer audit logs",
      });
    }
  }
);

/**
 * @route GET /api/users/employee/:employeeId/audit-logs
 * @desc Get audit logs for a specific employee
 * @access Authenticated users
 */
router.get(
  "/employee/:employeeId/audit-logs",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  // auditMiddleware(
  //   "EMPLOYEE_AUDIT_LOGS_ACCESSED",
  //   "Employee",
  //   "EMPLOYEE_MANAGEMENT"
  // ),
  async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { page = 1, limit = 10, action, startDate, endDate } = req.query;

      const query = { targetId: employeeId };
      if (action) query.action = action;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const auditLogs = await UserAuditLogger.getAuditLogs({
        query,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.json({
        success: true,
        data: auditLogs,
        message: "Employee audit logs fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching employee audit logs:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch employee audit logs",
      });
    }
  }
);

/**
 * @route GET /api/users/internal/dealer/:dealerId
 * @desc Get dealer details for internal service communication (no auth required)
 * @access Internal services only
 */
router.get("/internal/dealer/:dealerId", async (req, res) => {
  try {
    const { dealerId } = req.params;

    const dealer = await Dealer.findById(dealerId).populate(
      "user_id",
      "email phone_Number role"
    );

    if (!dealer) {
      return res.status(404).json({
        success: false,
        error: "Dealer not found",
      });
    }

    return res.json({
      success: true,
      data: dealer,
      message: "Dealer details fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching dealer details:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch dealer details",
    });
  }
});

/**
 * @route GET /api/users/internal/dealers/user/:userId
 * @desc Get dealers by userId for internal service communication (no auth required)
 * @access Internal services only
 */
router.get("/internal/dealers/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const dealers = await Dealer.find({ user_id: userId }).populate(
      "user_id",
      "email phone_Number role"
    );

    if (!dealers || dealers.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No dealers found for this user",
      });
    }

    return res.json({
      success: true,
      data: dealers,
      message: "Dealers fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching dealers by userId:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch dealers by userId",
    });
  }
});

/**
 * @route GET /api/users/internal/employee/:employeeId
 * @desc Get employee details for internal service communication (no auth required)
 * @access Internal services only
 */
router.get("/internal/employee/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await User.findById(employeeId).select("-password");

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found",
      });
    }

    return res.json({
      success: true,
      data: employee,
      message: "Employee details fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching employee details:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch employee details",
    });
  }
});

/**
 * @route GET /api/users/internal/super-admins
 * @desc Get all Super-admin users for internal service communication (no auth required)
 * @access Internal services only
 */
router.get("/internal/super-admins", async (req, res) => {
  try {
    const superAdmins = await User.find({ role: "Super-admin" }).select(
      "_id email name role"
    );

    return res.json({
      success: true,
      data: superAdmins,
      message: "Super-admin users fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching Super-admin users:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch Super-admin users",
    });
  }
});

/**
 * @route GET /api/users/internal/customer-support
 * @desc Get all Customer-Support users for internal service communication (no auth required)
 * @access Internal services only
 */
router.get("/internal/customer-support", async (req, res) => {
  try {
    const customerSupport = await User.find({
      role: "Customer-Support",
    }).select("_id email name role ticketsAssigned");

    return res.json({
      success: true,
      data: customerSupport,
      message: "Customer-Support users fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching Customer-Support users:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch Customer-Support users",
    });
  }
});

// Dealer Dashboard Routes
router.get(
  "/dealer/:dealerId/dashboard-stats",
  authenticate,
  requireRole([
    "Dealer",
    "Super-admin",
    "Fulfillment-Admin","Fulfillment-Staff",
    "Inventory-Admin", "Inventory-Staff"
  ]),
  // auditMiddleware(
  //   "DEALER_DASHBOARD_STATS_ACCESSED",
  //   "Dealer",
  //   "DEALER_MANAGEMENT"
  // ),
  dealerDashboardController.getDealerDashboardStats
);

router.get(
  "/dealer/:dealerId/assigned-categories",
  authenticate,
  requireRole([
    "Dealer",
    "Super-admin",
    "Fulfillment-Admin","Fulfillment-Staff",
    "Inventory-Admin", "Inventory-Staff"
  ]),
  
  // // auditMiddleware(
  //   "DEALER_ASSIGNED_CATEGORIES_ACCESSED",
  //   "Dealer",
  //   "DEALER_MANAGEMENT"
  // ),
  dealerDashboardController.getDealerAssignedCategories
);

router.get(
  "/dealer/:dealerId/dashboard",
  authenticate,
  requireRole([
    "Dealer",
    "Super-admin",
    "Fulfillment-Admin","Fulfillment-Staff",
    "Inventory-Admin", "Inventory-Staff"
  ]),
  // auditMiddleware("DEALER_DASHBOARD_ACCESSED", "Dealer", "DEALER_MANAGEMENT"),
  dealerDashboardController.getDealerDashboard
);

// Dealer ID Lookup Routes
router.get(
  "/user/:userId/dealer-id",
  authenticate,
  requireRole([
    "Dealer",
    "Super-admin",
    "Fulfillment-Admin","Fulfillment-Staff",
    "Inventory-Admin", "Inventory-Staff"
  ]),
  // auditMiddleware("DEALER_ID_LOOKUP_BY_USER", "Dealer", "DEALER_MANAGEMENT"),
  dealerDashboardController.getDealerIdByUserId
);

router.get(
  "/user/:userId/all-dealer-ids",
  authenticate,
  requireRole([
    "Dealer",
    "Super-admin",
    "Fulfillment-Admin","Fulfillment-Staff",
    "Inventory-Admin", "Inventory-Staff"
  ]),
  // auditMiddleware(
  //   "ALL_DEALER_IDS_LOOKUP_BY_USER",
  //   "Dealer",
  //   "DEALER_MANAGEMENT"
  // ),
  dealerDashboardController.getAllDealerIdsByUserId
);

router.post("/user/send-reset/paswordmail", userController.sendResetEmail);
router.get("/user/reset/password-verify/:token", userController.checkResetLink);
router.post("/user/reset/password/:token",
  auditLogger("Password_Changed", "USER"),
   userController.resetPassword);

// Employee role management routes
router.put(
  "/employee/revoke-role",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  auditLogger("Deactivate_Employee", "USER"),
  // auditMiddleware("EMPLOYEE_ROLE_REVOKED", "Employee", "EMPLOYEE_MANAGEMENT"),
  userController.revokeEmployeeRole
);

router.put(
  "/employee/reactivate-role",
  authenticate,
  requireRole(["Super-admin", "Fulfillment-Admin","Fulfillment-Staff","Inventory-Admin", "Inventory-Staff"]),
  auditLogger("Activate_Employee", "USER"),
  // auditMiddleware("EMPLOYEE_ROLE_REACTIVATED", "Employee", "EMPLOYEE_MANAGEMENT"),
  userController.reactivateEmployeeRole
);


router.post(
  "/dealer/setPermiossions/:dealerId",
  userController.setDealerPermissions
);

router.get(
  "/dealer/getPermiossions/:dealerId",
  userController.getDealerPermissions
);

router.put(
  "/dealer/resetPermiossions/:dealerId",
  auditLogger("Dealer_Permission_Changed", "SETTING"),
  userController.updateDealerPermissions
);

router.get(
  "/employee/getEmployee/byUserId/:userId",
  
  userController.getEmployeeByUserId
);

router.get(
  "/dealer/getDealer/bydelarId/:dealerId",
  
  userController.getDealersBydealerId
)

router.put(
  "/dealer/update/lastfullfillmentSync/:dealerId",
  
  userController.updateDealerLastfullfillmentTime
);

router.get(
  "/fulfillment/get/allEmployees",
  
  userController.getAllfullfillmentStafsAndAdmins
);

router.get(
  "/get/dealer/byUserId/:userId",
  
  userController.getDealerByUserId
);

router.get(
  "/search/users/byNameOrEmail",
  userController.searchUserByEmailOrName
);
router.patch(
  "/dealler/add/allowedBrands/:dealerId",
  authenticate,
  userController.addAllowedBrandsToDealer
);

router.patch(
  "/dealler/remove/allowedBrands/:dealerId",
  authenticate,
  userController.removeAllowedBrandsFromDealer
);

router.get(
  "/get/dealerBy/brand/:brandId",
  authenticate,
  userController.getDealerByBrandId
);

router.post(
  "/dealer/sla/delete",
  userController.removeSlaFromDealers
);

router.get(
  "/get/fulfillment/staff/byDealer/:dealerId",
  userController.getEmployeesForAssignment
)

router.get(
  "/get/servicable/pincodes/:dealerId",
  userController.getDealerPincodes
)

router.get(
  "/get/servicableDealer/pincodes/:pincode",
  userController.getDealersByServiceablePincode
) 

      

module.exports = router;
