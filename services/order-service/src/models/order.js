const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    orderId: String,
    orderDate: Date,
    deliveryCharges: Number,
    ordered_pincode: String,
    GST: Number,
    CGST: Number,
    SGST: Number,
    IGST: Number,
    totalAmount: Number,
    orderType: { type: String, enum: ["Online", "Offline", "System"] },
    orderSource: { type: String, enum: ["Web", "Mobile", "POS"] },
    slaInfo: {
      slaType: { type: String },
      expectedFulfillmentTime: Date,
      actualFulfillmentTime: Date,
      isSLAMet: Boolean,
      violationMinutes: Number,
    },
    order_track_info: {
      borzo_order_id: String,
      borzo_tracking_url: String,
      borzo_tracking_status: String,
      borzo_tracking_number: String,
      borzo_order_status: String,
      borzo_event_datetime: Date,
      borzo_event_type: String,
      borzo_last_updated: Date
    },
    skus: [
      {
        sku: String,
        quantity: Number,
        delivery_chanel:{
          type: String,
          enum: ["Borzo", "Manual_Rapido"],
          default: "Borzo"
        },
        product_image: [String],
        productId: String,
        productName: String,
        selling_price: Number,
        gst_percentage: String,
        mrp: Number,
        mrp_gst_amount: Number,
        gst_amount: Number,
        product_total: Number,
        totalPrice: Number,
        is_available: Boolean,
        dealerMapped: [
          {
            dealerId: mongoose.Schema.Types.ObjectId,
          },
        ],
        // Individual SKU tracking information
        tracking_info: {
          borzo_order_id: String,
          borzo_tracking_url: String,
          borzo_tracking_status: String,
          borzo_tracking_number: String,
          borzo_order_status: String,
          borzo_event_datetime: Date,
          borzo_event_type: String,
          borzo_last_updated: Date,
          borzo_payment_amount: Number,
          borzo_delivery_fee_amount: Number,
          borzo_weight_fee_amount: Number,
          borzo_required_finish_datetime: Date,
          borzo_weight:Number,
          // Individual SKU status
          status: {
            type: String,
            enum: ["Pending", "Confirmed", "Assigned", "Packed","Picked Up", "Shipped", "Delivered","OUT_FOR_DELIVERY","On_The_Way_To_Next_Delivery_Point", "Cancelled", "Returned"],
            default: "Pending"
          },
          // Individual SKU timestamps
          timestamps: {
            confirmedAt: Date,
            assignedAt: Date,
            packedAt: Date,
            shippedAt: Date,
            outForDeliveryAt: Date,
            deliveredAt: Date,
            cancelledAt: Date,
            onTheWayToNextDeliveryPointAt: Date,

          }
        },
        return_info: {
          is_returned: {
            type: Boolean,
            default: false
          },
          return_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Return",
            default: null
          },
          is_returnable: {
            type: Boolean,
            default: false
          },
          return_window_days: {
            type: Number,
            default: 14
          },
        },
        amount_collected:{
          type: Boolean,
          default: true,
        },
        picklistId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Picklist",
          default: null,
        },
        piclistGenerated:{
          type: Boolean,
          default: false,
        },
        markAsPacked: {
          type: Boolean,
          default: false,
        },
        inspectionStarted: {
          type: Boolean,
          default: false,
        },
        inspectionCompleted: {
          type: Boolean,
          default: false,
        },

      },
    ],
    order_Amount: Number,
    customerDetails: {
      userId: String,
      name: String,
      phone: String,
      address: String,
      pincode: String,
      email: String,
    },
    paymentType: { type: String, enum: ["COD", "Prepaid", "System"] },
    dealerMapping: [
      {
        sku: String,
        dealerId: mongoose.Schema.Types.ObjectId,
        status: {
          type: String,
          enum: ["Pending", "Scanning", "Packed"],
          default: "Pending",
        },
        assignedAt: {
          type: Date,
          default: Date.now,
        },
        packedAt: Date,
      },
    ],
    status: {
      type: String,
      enum: [
        "Confirmed",
        "Assigned",
        "Scanning",
        "Packed",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Returned",
      ],
      default: "Confirmed",
    },

    invoiceNumber: String,
    timestamps: {
      createdAt: Date,
      assignedAt: Date,
      scannedAt: Date,
      packedAt: Date,
      shippedAt: Date,
    },
    type_of_delivery: {
      type: String,
      enum: ["Standard", "Express"],
    },
    delivery_type: {
      type: String,
      enum: ["standard", "endofday"],
    },
    trackingInfo: {
      awb: String,
      courierName: String,
      trackingUrl: String,
    },
    razorpay_order_id: String,
    razorpay_payment_id: String,
    payment_status: String,
    refund_status: String,
    auditLogs: [
      {
        action: String,
        actorId: mongoose.Schema.Types.ObjectId,
        role: String,
        timestamp: Date,
        reason: String,
      },
    ],
    payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    ratting: {
      type: Number,
      default: 0,
    },
    review: {
      type: String,
    },
    review_Date: {
      type: Date,
    },
    purchaseOrderId: {
      type: String,
      default: null,
    },
    // refund_id: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Refund",
    //   default: null,
    // },
    invoiceUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Order || mongoose.model("Order", OrderSchema);
