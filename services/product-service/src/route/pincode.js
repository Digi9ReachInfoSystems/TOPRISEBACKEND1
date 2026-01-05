const express = require("express");
const router = express.Router();
const pincodeController = require("../controller/pincode");
const {
    authenticate,
    authorizeRoles,
} = require("/packages/utils/authMiddleware");
const { optionalAuth } = require("../middleware/authMiddleware");
const ProductAuditLogger = require("../utils/auditLogger");
const multer = require("multer");
const upload = multer();
const auditLogger = require("../.././../../packages/utils/auditLoggerMiddleware");

// ✅ CREATE PINCODE
router.post(
    "/",
    optionalAuth,
    // ProductAuditLogger.createMiddleware("PINCODE_CREATED", "Pincode", "PINCODE_MANAGEMENT"),
    authenticate,
    auditLogger("Pincode_Created", "SETTING"),
    authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff"),
    pincodeController.createPincode
);

// ✅ GET ALL PINCODES
router.get(
    "/",
    optionalAuth,
    // ProductAuditLogger.createMiddleware("PINCODE_LIST_ACCESSED", "Pincode", "PINCODE_MANAGEMENT"),
    authenticate,
    authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff", "Dealer", "User"),
    pincodeController.getAllPincodes
);

// ✅ GET PINCODE BY ID
router.get(
    "/:id",
    optionalAuth,
    // ProductAuditLogger.createMiddleware("PINCODE_DETAILS_ACCESSED", "Pincode", "PINCODE_MANAGEMENT"),
    authenticate,
    authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff", "Dealer", "User"),
    pincodeController.getPincodeById
);

// ✅ UPDATE PINCODE
router.put(
    "/:id",
    optionalAuth,
    auditLogger("Pincode_Edited", "SETTING"),
    // ProductAuditLogger.createMiddleware("PINCODE_UPDATED", "Pincode", "PINCODE_MANAGEMENT"),
    authenticate,
    authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff"),
    pincodeController.updatePincode
);

// ✅ DELETE PINCODE
router.delete(
    "/:id",
    optionalAuth,
    auditLogger("Pincode_Deleted", "SETTING"),
    // ProductAuditLogger.createMiddleware("PINCODE_DELETED", "Pincode", "PINCODE_MANAGEMENT"),
    authenticate,
    authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff"),
    pincodeController.deletePincode
);

// ✅ CHECK PINCODE AVAILABILITY (Public endpoint - no auth required)
router.get(
    "/check/:pincode",
    // ProductAuditLogger.createMiddleware("PINCODE_CHECKED", "Pincode", "PINCODE_MANAGEMENT"),
    pincodeController.checkPincode
);

// ✅ BULK CREATE PINCODES
router.post(
    "/bulk",
    optionalAuth,
    auditLogger("Pincode_Bulk_create", "SETTING"),
    // ProductAuditLogger.createMiddleware("BULK_PINCODES_CREATED", "Pincode", "PINCODE_MANAGEMENT"),
    authenticate,
    authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff"),
    pincodeController.bulkCreatePincodes
);

// ✅ GET PINCODE STATISTICS
router.get(
    "/stats/overview",
    optionalAuth,
    // ProductAuditLogger.createMiddleware("PINCODE_STATS_ACCESSED", "Pincode", "REPORTING"),
    authenticate,
    authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff", "Analytics-Admin"),
    pincodeController.getPincodeStats
);

router.delete(
    "/bulk/delete",
 auditLogger("Pincode_Bulk_Delete", "SETTING"),
    // ProductAuditLogger.createMiddleware("BULK_PINCODES_DELETED", "Pincode", "PINCODE_MANAGEMENT"),
    authenticate,
    authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff"),
    pincodeController.bulkDeletePincodes
);

router.post(
  "/bulk-upload",
   auditLogger("Pincode_Bulk_create", "SETTING"),
  upload.single("file"),
  pincodeController.bulkUploadPincodes
);

router.get(
  "/get/pincode/metadata",
  authenticate,
  authorizeRoles("Super-admin", "Fulfillment-Admin", "Inventory-Admin", "Inventory-Staff", "Analytics-Admin"),
  pincodeController.getPincodeMetaData
)

router.get("/get/serviceable/:pincode",
  pincodeController.getPincodeByPincode
)

router.get("/get/all",pincodeController.getAllPincodesNoPagination)
module.exports = router;
