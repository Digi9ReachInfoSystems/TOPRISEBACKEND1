const mongoose = require("mongoose");
const { permission } = require("process");

const dealerSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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
  dealerId: {
    type: String,
    // required: true,
    unique: true,
  },
  legal_name: {
    type: String,
    required: true,
  },
  trade_name: {
    type: String,
    required: true,
  },
  GSTIN: {
    type: String,
    required: true,
    unique: true,
    maxLength: 15,
  },
  Pan: {
    type: String,
    required: true,
    unique: true,
    maxLength: 15,
  },
  Address: {
    street: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    pincode: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
  },
  contact_person: {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone_number: {
      type: String,
      required: true,
    },
  },
  is_active: {
    type: Boolean,
    default: true,
  },
  categories_allowed: [
    {
      type: String,
    },
  ],
  brands_allowed: [
    {
      type: String,
    },
  ],
  upload_access_enabled: {
    type: Boolean,
    default: false,
  },
  default_margin: {
    type: Number,
    default: 0,
  },
  last_fulfillment_date: {
    type: Date,
  },
  assigned_Toprise_employee: [
    {
      assigned_user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
      },
      assigned_at: {
        type: Date,
        default: Date.now,
      },
      status: {
        type: String,
        enum: ["Active", "Removed", "Updated"],
        default: "Active",
      },
    },
  ],
  SLA_type: {
    type: String,
    // enum: ["Standard", "Priority", "Limited"],
    default: "",
  },
  dispatch_hours: {
    start: {
      type: Number,
      min: 0,
      max: 23,
    },
    end: {
      type: Number,
      min: 0,
      max: 23,
    },
  },
  SLA_max_dispatch_time: {
    type: Number,
    default: 0,
  },
  onboarding_date: {
    type: Date,
    default: Date.now,
  },
  remarks: {
    type: String,
  },
  is_permissios_set: {
    type: Boolean,
    default: true,
  },
  serviceable_pincodes: [
    {
      type: String,
    },
  ],
  permission:{
    readPermissions: {
      isEnabled: {
        type: Boolean,
        default: true
      },
      allowed_fields: {                          
        type: Array,
        default: ["sku_code","manufacturer_part_name","product_name","brand","category","sub_category","product_type","is_universal","make","model","year_range","variant","dimensions","weight","images","video_url"]
      }
    },
    updatePermissions: {
      isEnabled: {
        type: Boolean,
        default: false
      },
      allowed_fields: {
        type: Array,
        default: []
      }
    },
    isDelete: {
      type: Boolean,
      default: false
    },
    isAdd: {
      
        type: Boolean,
        default: false
      
    },
    isUpdateStock: {
      type: Boolean,
      default: true
    }
  }
});

module.exports = mongoose.model("Dealer", dealerSchema);
