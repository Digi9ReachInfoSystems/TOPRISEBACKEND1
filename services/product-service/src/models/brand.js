const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema({
  brand_name: {
    type: String,
    required: true,
    // unique: true,
  },
  featured_brand: {
    type: Boolean,
    default: false,
  },
  brand_code: {
    type: String,
    required: true,
    unique: true,
  }, //internal use
  type: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Type",
    required: true,
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
    // ref: "User",
    // required: true,
  },
  updated_by: {
    type: String,
    // ref: "User",
    // required: true,
  },
  brand_logo: {
    type: String,
    // required: true,
  },
  preview_video: {
    type: String,
    // required: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "pending", "created", "rejected"],
    default: "inactive",
    validate: {
      validator: function (value) {
        return ["active", "inactive", "pending", "created", "rejected"].includes(
          value
        );
      },
    },
  },
});

module.exports = mongoose.model("Brand", brandSchema);
