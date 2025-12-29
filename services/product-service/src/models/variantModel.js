const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  variant_name: {
    type: String,
    required: true,
    // unique: true,
  },
  variant_code: {
    type: String,
    required: true,
    unique: true,
  },
  Year: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Year",
    },
  ],
  model: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Model",
  },

  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: String,
  },
  updated_by: [
    {
      updated_by: {
        type: String,
      },
      updated_at: {
        type: Date,
        default: Date.now,
      },
      change_logs: {
        type: String,
      },
    },
  ],
  variant_image: {
    type: String,
    // required: true,
  },
  variant_status: {
    type: String,
    enum: ["active", "inactive", "pending", "created", "rejected"],
    default: "inactive",
  },
  variant_Description: {
    type: String,
    // required: true,
  },
});

module.exports = mongoose.model("Variant", variantSchema);
