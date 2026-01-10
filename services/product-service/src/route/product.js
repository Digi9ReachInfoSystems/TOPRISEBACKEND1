const express = require("express");
const router = express.Router();
const productController = require("../controller/product");
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const {
  authenticate,
  authorizeRoles,
} = require("/packages/utils/authMiddleware");
const { optionalAuth } = require("../middleware/authMiddleware");
const ProductAuditLogger = require("../utils/auditLogger");
const auditLogger = require("../.././../../packages/utils/auditLoggerMiddleware");
router.get("/reports", productController.generateProductReports);

router.post(
  "/",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "BULK_PRODUCTS_UPLOADED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
  auditLogger("Bulk_Upload_Product", "PRODUCT"),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  upload.fields([
    { name: "dataFile", maxCount: 1 },
    { name: "imageZip", maxCount: 1 },
  ]),
  productController.bulkUploadProducts
);

router.put(
  "/bulk-edit-products",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "BULK_PRODUCTS_EDITED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
  auditLogger("Bulk_Edit_Product", "PRODUCT"),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  upload.fields([
    { name: "dataFile", maxCount: 1 },
    { name: "imageZip", maxCount: 1 }, // optional – for updated images
  ]),
  productController.bulkEditProducts
);

router.post(
  "/bulk/assign-Dealers",
  optionalAuth,
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  upload.fields([{ name: "dataFile", maxCount: 1 }]),
  productController.bulkAssignDealersProducts
);
router.patch(
  "/products/:id/availableDealers/:dealerId",
  productController.decrementDealerStock
);
router.post(
  "/assign/dealers",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  upload.fields([{ name: "dealersFile", maxCount: 1 }]),
  productController.assignDealers
);

router.put(
  "/bulk-edit",

  authenticate,
  upload.fields([{ name: "editsFile", maxCount: 1 }]),
  authorizeRoles("Super-admin", "Inventory-Admin"),
  productController.bulkEdit
);

router.patch(
  "/deactivate/:id",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  productController.deactivateProductsSingle
);

router.patch(
  "/deactivateProduct/bulk",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  productController.deactivateProductsBulk
);

router.post(
  "/createProduct",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "PRODUCT_CREATED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
  upload.array("images"),
   auditLogger("Create_Product", "PRODUCT"),
  productController.createProductSingle
);

router.post("/disable-by-dealer", productController.disableProductsByDealer);
router.post("/enable-by-dealer", productController.enableproductsByDealer);
router.put(
  "/updateProduct/:id",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "PRODUCT_UPDATED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
  authenticate,
  upload.array("images"),
 auditLogger("Edit_Product", "PRODUCT"),
  authorizeRoles("Super-admin", "Inventory-Admin", "Dealer"),
  productController.editProductSingle
);

router.patch(
  "/reject/:id",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "PRODUCT_REJECTED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
  productController.rejectProduct
);

router.patch(
  "/approve/:id",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "PRODUCT_APPROVED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
  auditLogger("Product_Approve", "PRODUCT"),
  productController.approveProduct
);

router.get("/", productController.getProductsByFilters);
router.get("/getVehicleDetails", productController.getVehicleDetails);
router.get(
  "/products/:id/availableDealers",
  productController.getAssignedDealers
);

router.get(
  "/products/:id/availableDealers/pincode/:pincode",
  productController.getAssignedDealersByPincode
);
// router.get(
//   "/get-Dashboard",
//   authenticate,
//   authorizeRoles("Super-admin", "Inventory-Admin"),
//   productController.getProductsForDashboard
// );

router.get(
  "/export",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  productController.exportDealerProducts
);

router.get(
  "/get-ProductById/:id",

  productController.getProductById
);

router.get("/get-all-productLogs", productController.getAllProductBulkSessions);

router.get("/get-products-Logs", productController.getProductBulkSessionLogs);

router.get(
  "/get-products-by-dealer/:dealerId",
  productController.getProductByDealerId
);

router.get(
  "/get-products-by-dealer",
  productController.getProductByDealerId
);
router.patch(
  "/bulk/approve",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "BULK_PRODUCTS_APPROVED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
  authenticate,
    auditLogger("Product_Bulk_Approve", "PRODUCT"),
  // authorizeRoles("Super-admin"),
  productController.bulkapproveProduct
);
router.patch(
  "/bulk/reject",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "BULK_PRODUCTS_REJECTED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
    auditLogger("Product_Bulk_Reject", "PRODUCT"),
  authenticate,
  authorizeRoles("Super-admin"),
  productController.bulkrejectProduct
);
router.put(
  "/update-stockByDealer/:id",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "PRODUCT_STOCK_UPDATED",
  //   "Product",
  //   "INVENTORY_MANAGEMENT"
  // ),
   auditLogger("Dealer_Stock_Update", "PRODUCT"),
  authenticate,
  authorizeRoles("Dealer","Super-admin"),
  productController.updateProductDealerStock
);

router.get(
  "/get-all-products/pagination",
  productController.getProductsByFiltersWithPagination
);

router.post(
  "/createProductByDealer",
  upload.array("images"),
  // authenticate,
  // authorizeRoles("Dealer"),
  productController.createProductSingleByDealer
);

router.get(
  "/getProducts/byDealer",
  authenticate,
  authorizeRoles("Super-admin", "Fulfillment-Admin", "User", "Dealer"),
  productController.getAllProductsAddedByDealerWithPagination
);

router.get(
  "/get/similarProducts/:productId",
  authenticate,
  productController.getSimilarProducts
);

router.post(
  "/assign/dealerforProduct/:productId",
  authenticate,
  authorizeRoles("Super-admin", "Fulfillment-Admin"),
  upload.fields([{ name: "dealersFile", maxCount: 1 }]),
  productController.assignDealersForProduct
);

router.post(
  "/bulk-upload/byDealer",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Dealer"),
  upload.fields([
    { name: "dataFile", maxCount: 1 },
    { name: "imageZip", maxCount: 1 },
  ]),
  productController.bulkUploadProductsByDealer
);

router.post(
  "/assign/dealer/manual",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Fulfillment-Admin"),
  productController.manuallyAssignDealer
);

router.delete(
  "/remove/dealer/:productId/:dealerId",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Fulfillment-Admin"),
  productController.removeDealerAssignment
);

router.get(
  "/assign/dealer/:productId",
  authenticate,
  authorizeRoles(
    "Super-admin",
    "Inventory-Admin",
    "Fulfillment-Admin",
    "Dealer"
  ),
  productController.getProductDealerAssignments
);

router.get(
  "/:id/dealer/:dealerId",
  authenticate,
  authorizeRoles(
    "Super-admin",
    "Inventory-Admin",
    "Fulfillment-Admin",
    "Dealer"
  ),
  productController.getProductDealerDetails
);

router.post(
  "/assign/dealer/bulk",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Fulfillment-Admin"),
  upload.fields([{ name: "dealersFile", maxCount: 1 }]),
  productController.bulkAssignDealers
);

router.get("/get/product-stats", productController.getProductStats);


router.get(
  "/pending",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "PENDING_PRODUCTS_ACCESSED",
  //   "Product",
  //   "PRODUCT_APPROVAL"
  // ),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Inventory-Staff"),
  productController.getPendingProducts
);

router.patch(
  "/approve/:productId",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "PRODUCT_APPROVED",
  //   "Product",
  //   "PRODUCT_APPROVAL"
  // ),
    auditLogger("Product_Approve", "PRODUCT"),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  productController.approveSingleProduct
);

// Reject single product
router.patch(
  "/reject/:productId",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "PRODUCT_REJECTED",
  //   "Product",
  //   "PRODUCT_APPROVAL"
  // ),
    auditLogger("Product_Reject", "PRODUCT"),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin"),
  productController.rejectSingleProduct
);

// Bulk approve products
router.patch(
  "/bulk/approve",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "BULK_PRODUCTS_APPROVED",
  //   "Product",
  //   "PRODUCT_APPROVAL"
  // ),
   auditLogger("Product_Bulk_Approve", "PRODUCT"),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Inventory-Staff"),
  productController.bulkApproveProducts
);

// Bulk reject products
router.patch(
  "/bulk/reject",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "BULK_PRODUCTS_REJECTED",
  //   "Product",
  //   "PRODUCT_APPROVAL"
  // ),
   auditLogger("Product_Bulk_Reject", "PRODUCT"),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Inventory-Staff"),
  productController.bulkRejectProducts
);

// Get approval statistics
router.get(
  "/approval/stats",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "APPROVAL_STATS_ACCESSED",
  //   "Product",
  //   "PRODUCT_APPROVAL"
  // ),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Inventory-Staff"),
  productController.getApprovalStats
);

// Get products by dealer with permission matrix
router.get(
  "/dealer/:dealerId",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "DEALER_PRODUCTS_ACCESSED",
  //   "Product",
  //   "PRODUCT_MANAGEMENT"
  // ),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Inventory-Staff", "Dealer", "Fulfillment-Admin"),
  productController.getProductsByDealer
);

// Debug endpoint to check available dealers
router.get(
  "/debug/available-dealers",
  optionalAuth,
  // ProductAuditLogger.createMiddleware(
  //   "AVAILABLE_DEALERS_ACCESSED",
  //   "Product",
  //   "DEBUG"
  // ),
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "Inventory-Staff"),
  productController.getAvailableDealers
);
  
// ==================== INTELLIGENT SEARCH ROUTE ====================

router.get(
  "/intelligent-search",
  productController.intelligentSearch
);

// ==================== HIERARCHICAL SEARCH ROUTE ====================

router.get(
  "/hierarchical-search",
  productController.hierarchicalSearch
);

router.get("/sku/:sku", productController.getProductBySku);
router.put("/update/liveStatus", productController.updateLiveStatus);
router.get("/get/product/for-export", productController.getProductsByFiltersForExport);

router.get("/get/product/stats/by/dealer/:dealerId", productController.getProductStatsByDealerId);
router.put("/remove/delar/bybrandIds", productController.removeDealerFromProductBybrandId);
router.get("/dealer/:dealerId/product-stock-stats", productController.getDealerProductStockStats);
router.get("/get/products/for/purchase-order", productController.getProductsByFiltersForPurchaseOrder);
router.get("/check/product/serviceability/:id/:pincode", productController.checkProductServiceability);
module.exports = router;
