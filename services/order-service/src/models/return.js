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
      "Completed"
    ],
    default: "Requested",
  },


  pickupRequest: {
    pickupId: String,
    scheduledDate: Date,
    completedDate: Date,
    logisticsPartner: String,
    trackingNumber: String,
    borzoOrderId: String,
    borzoTrackingUrl: String,
    pickupAddress: {
      address: String,
      city: String,
      pincode: String,
      state: String,
      latitude: Number,
      longitude: Number,
    },
    deliveryAddress: {
      address: String,
      city: String,
      pincode: String,
      state: String,
      latitude: Number,
      longitude: Number,
    },
    borzoResponse: mongoose.Schema.Types.Mixed, // Store full Borzo API response
  },


  inspection: {
    inspectedBy: String,
    inspectedAt: Date,
    skuMatch: {
      type: Boolean,
      default: false,
    },
    condition: {
      type: String,
      enum: ["Excellent", "Good", "Fair", "Poor", "Damaged"],
    },
    conditionNotes: String,
    inspectionImages: [String],
    isApproved: {
      type: Boolean,
      default: false,
    },
    rejectionReason: String,
  },


  refund: {
    processedBy: String,
    processedAt: Date,
    refundAmount: {
      type: Number,
      required: true,
    },
    refundMethod: {
      type: String,
      enum: ["Original_Payment_Method", "Wallet", "Store_Credit"],
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


  actionTaken: {
    type: String,
    enum: ["Refund", "Replacement", "Exchange", "Rejected"],
    default: "Refund",
  },

  timestamps: {
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    validatedAt: Date,
    pickupScheduledAt: Date,
    pickupCompletedAt: Date,
    inspectionStartedAt: Date,
    inspectionCompletedAt: Date,
    refundProcessedAt: Date,
    completedAt: Date,
  },

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
