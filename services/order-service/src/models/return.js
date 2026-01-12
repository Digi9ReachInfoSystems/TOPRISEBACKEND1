const mongoose = require("mongoose");

const ReturnSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
  },
  customerId: {
    type: String,
    required: true,
  },
  sku: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,

    required: true,
    default: 1,
  },
  returnReason: {
    type: String,
    required: true,
  },
  returnDescription: {
    type: String,
  },
  returnImages: [String],

  isEligible: {
    type: Boolean,
    default: false,
  },
  eligibilityReason: {
    type: String,
  },
  returnWindowDays: {
    type: Number,
    default: 7,
  },
  isWithinReturnWindow: {
    type: Boolean,
    default: false,
  },
  isProductReturnable: {
    type: Boolean,
    default: false,
  },

  returnStatus: {
    type: String,
    enum: [
      "Requested",
      "Validated",
      "Pickup_Scheduled",
      "Pickup_Completed",
      "Under_Inspection",
      "Approved",
      "Rejected",
      "Refund_Processed",
      "Completed",
      "Shipment_Intiated",
      "Shipment_Delivered",
      "Shipment_Completed",
      "Inspection_Started",
      "Inspection_Completed",
      "Initiated_Refund",
      "Refund_Completed",
      "Refund_Failed"
    ],
    default: "Requested",
  },
  delivery_chanel: {
    type: String,
    enum: ["Borzo", "Manual_Rapido"],
    default: "Borzo"
  },
  shipment_started: {
    type: Boolean,
    default: false,
  },
  shipment_completed: {
    type: Boolean,
    default: true,
  },

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
    // Individual SKU status
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Assigned", "Packed", "Shipped", "Delivered", "OUT_FOR_DELIVERY", "On_The_Way_To_Next_Delivery_Point", "Cancelled", "Returned", "Picked Up"],
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


  // pickupRequest: {
  //   pickupId: String,
  //   scheduledDate: Date,
  //   completedDate: Date,
  //   logisticsPartner: String,
  //   trackingNumber: String,
  //   pickupAddress: {
  //     address: String,
  //     city: String,
  //     pincode: String,
  //     state: String,
  //   },
  //   deliveryAddress: {
  //     address: String,
  //     city: String,
  //     pincode: String,
  //     state: String,
  //   },
  // },


  inspection: {
    inspectedBy: String,
    inspectionStartedAt: Date,
    inspectionCompletedAt: Date,
    isSuperAdminInspected: {
      type: Boolean,
      default: false,
    },
    skuMatch: {
      type: Boolean,
      default: false,
    },
    condition: {
      type: String,
      enum: ["Excellent", "Good", "Fair", "Poor", "Damaged", "N/A"],
      default: "N/A",
    },
    note: String,
    inspectionImages: [String],
    isApproved: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Not_Started", "In_Progress", "Completed"],
      default: "Not_Started",
    },
  },
  timestamps: {
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    rejectedAt: Date,
    validatedAt: Date,
    pickupScheduledAt: Date,
    pickupCompletedAt: Date,
    borzoShipmentInitiatedAt: Date,
    borzoShipmentCompletedAt: Date,
    inspectionStartedAt: Date,
    inspectionCompletedAt: Date,
    refundInitiatedAt: Date,
    refundCompletedAt: Date,
    returnCompletedAt: Date,
  },
  rejectReason: {
    type: String,
    default: null,
  },

  refund: {
    processedAt: Date,
    processCompletedAt: Date,
    refundAmount: {
      type: Number,
      required: true,
    },
    refundMethod: {
      type: String,
      enum: ["Original_Payment_Method", "Manual_Refund",],
      default: "Original_Payment_Method",
    },
    refundStatus: {
      type: String,
      enum: ["Pending", "Processing", "Processed", "Completed", "Failed"],
      default: "Pending",
    },
    transactionId: String,
    refundNotes: String,
    refund_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Refund",
    }
  },


  // actionTaken: {
  //   type: String,
  //   enum: ["Refund", "Replacement", "Exchange", "Rejected"],
  //   default: "Refund",
  // },



  originalOrderDate: Date,
  originalDeliveryDate: Date,
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
  },
  notes: [{
    note: String,
    addedBy: String,
    addedAt: {
      type: Date,
      default: Date.now,
    },
  }],
}, {
  timestamps: true,
});

ReturnSchema.index({ orderId: 1, sku: 1 });
ReturnSchema.index({ customerId: 1 });
ReturnSchema.index({ returnStatus: 1 });
ReturnSchema.index({ "pickupRequest.pickupId": 1 });

module.exports = mongoose.models.Return || mongoose.model("Return", ReturnSchema);
