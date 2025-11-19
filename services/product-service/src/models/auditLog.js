const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        // Product related actions
        "PRODUCT_CREATED",
        "PRODUCT_UPDATED",
        "PRODUCT_DELETED",
        "DEALER_PRODUCTS_ACCESSED",
        "Product",
        "PRODUCT_MANAGEMENT",
        "BULK_PRODUCTS_UPLOADED",

        "PRODUCT_APPROVED",
        "PRODUCT_REJECTED",
        "PRODUCT_BULK_UPLOAD",
        "PRODUCT_BULK_UPDATE",
        "STOCK_UPDATED",
        "STOCK_ADJUSTED",
        "PRICE_CHANGED",
        "PRICE_OVERRIDE",
        "PRODUCT_STATUS_CHANGED",
        "PRODUCT_QC_APPROVED",
        "PRODUCT_QC_REJECTED",
        "PRODUCT_LIVE_STATUS_CHANGED",

        // Category related actions
        "CATEGORY_CREATED",
        "CATEGORY_UPDATED",
        "CATEGORY_DELETED",
        "SUBCATEGORY_CREATED",
        "SUBCATEGORY_UPDATED",
        "SUBCATEGORY_DELETED",

        // Brand related actions
        "BRAND_CREATED",
        "BRAND_UPDATED",
        "BRAND_DELETED",

        // Model related actions
        "MODEL_CREATED",
        "MODEL_UPDATED",
        "MODEL_DELETED",

        // Variant related actions
        "VARIANT_CREATED",
        "VARIANT_UPDATED",
        "VARIANT_DELETED",

        // Manufacturer related actions
        "MANUFACTURER_CREATED",
        "MANUFACTURER_UPDATED",
        "MANUFACTURER_DELETED",

        // Type related actions
        "TYPE_CREATED",
        "TYPE_UPDATED",
        "TYPE_DELETED",

        // Year related actions
        "YEAR_CREATED",
        "YEAR_UPDATED",
        "YEAR_DELETED",

        // Banner related actions
        "BANNER_CREATED",
        "BANNER_UPDATED",
        "BANNER_DELETED",

        "VEHICLE_INFO_CREATED",
        "VEHICLE_INFO_UPDATED",
        "VEHICLE_INFO_DELETED",

        "POPULAR_VEHICLE_CREATED",
        "POPULAR_VEHICLE_UPDATED",
        "POPULAR_VEHICLE_DELETED",
        "EMPLOYEE_PICKLIST_ACCESSED",
        "FULFILLMENT_STAFF_PICKLIST_STATS_ACCESSED",

        "PURCHASE_ORDER_CREATED",
        "PURCHASE_ORDER_UPDATED",
        "PURCHASE_ORDER_DELETED",
        "PURCHASE_ORDER_APPROVED",
        "PURCHASE_ORDER_REJECTED",

        // System actions
        "PRODUCT_SYNC_TO_ELASTIC",
        "STOCK_SWEEP_EXECUTED",
        "REPORT_GENERATED",
        "REPORT_EXPORTED",
        "DASHBOARD_ACCESSED",
        "CONFIGURATION_CHANGED",
        "BULK_OPERATION_STARTED",
        "BULK_OPERATION_COMPLETED",
        "BULK_OPERATION_FAILED",
      ],
    },

    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    actorRole: {
      type: String,
      required: true,
      enum: [
        "Super-admin",
        "Fulfillment-Admin",
        "Fulfillment-Staff",
        "Inventory-Admin",
        "Inventory-Staff",
        "Dealer",
        "User",
        "Customer-Support",
        "System",
      ],
    },

    actorName: {
      type: String,
      required: true,
    },

    targetType: {
      type: String,
      enum: [
        "Product",
        "Category",
        "Subcategory",
        "Brand",
        "Model",
        "Variant",
        "Manufacturer",
        "Type",
        "Year",
        "Banner",
        "VehicleInfo",
        "PopularVehicle",
        "PurchaseOrder",
        "System",
      ],
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    targetIdentifier: {
      type: String, // For human-readable identifiers like sku, category name, etc.
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
    },

    userAgent: {
      type: String,
    },

    sessionId: {
      type: String,
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },

    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW",
    },

    category: {
      type: String,
      enum: [
        "PRODUCT_MANAGEMENT",
        "CATEGORY_MANAGEMENT",
        "BRAND_MANAGEMENT",
        "MODEL_MANAGEMENT",
        "VARIANT_MANAGEMENT",
        "MANUFACTURER_MANAGEMENT",
        "TYPE_MANAGEMENT",
        "YEAR_MANAGEMENT",
        "BANNER_MANAGEMENT",
        "VEHICLE_MANAGEMENT",
        "PURCHASE_ORDER_MANAGEMENT",
        "STOCK_MANAGEMENT",
        "PRICING_MANAGEMENT",
        "SYSTEM_ADMIN",
        "REPORTING",
      ],
      required: true,
    },

    // For performance tracking
    executionTime: {
      type: Number, // in milliseconds
    },

    // For error tracking
    errorDetails: {
      type: mongoose.Schema.Types.Mixed,
    },

    // For data changes
    oldValues: {
      type: mongoose.Schema.Types.Mixed,
    },

    newValues: {
      type: mongoose.Schema.Types.Mixed,
    },

    // For bulk operations
    bulkOperationId: {
      type: String,
    },

    // For file operations
    fileName: {
      type: String,
    },

    fileSize: {
      type: Number,
    },
  },
  {
    timestamps: true,
    collection: "product_audit_logs",
  }
);

// Indexes for efficient querying
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ category: 1, timestamp: -1 });
AuditLogSchema.index({ severity: 1, timestamp: -1 });
AuditLogSchema.index({ actorRole: 1, timestamp: -1 });
AuditLogSchema.index({ bulkOperationId: 1 });
AuditLogSchema.index({ targetIdentifier: 1 });

// TTL index to automatically delete old logs (optional - adjust retention period as needed)
// AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 }); // 1 year

module.exports = mongoose.model("ProductAuditLog", AuditLogSchema);
