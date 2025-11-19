const mongoose = require("mongoose");

const SLAViolationSchema = new mongoose.Schema({
  dealer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    required: true,
    index: true,
  },
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
    index: true,
  },
  sku: {
    type: String,
    required: false,
    index: true,
  }, // Optional: for SKU-level tracking
  expected_fulfillment_time: { type: Date, required: true },
  actual_fulfillment_time: { type: Date, required: true },
  violation_minutes: { type: Number, required: true },
  resolved: { type: Boolean, default: false },
  notes: String,
  created_at: { type: Date, default: Date.now },
  // New fields for enhanced functionality
  contact_history: [{
    contacted_at: { type: Date, default: Date.now },
    contact_method: { type: String, enum: ["notification", "email", "sms", "phone", "all"] },
    custom_message: String,
    success: { type: Boolean, default: false },
    contacted_by: String,
  }],
  resolved_at: { type: Date, default: null },
  resolution_notes: String,
  resolved_by: String,
  is_manual: { type: Boolean, default: false }, // Flag to identify manually created violations
  created_by: String, // User who created the violation (for manual violations)
});

module.exports = mongoose.models.SLAViolation || mongoose.model("SLAViolation", SLAViolationSchema);
