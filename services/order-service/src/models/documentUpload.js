const mongoose = require("mongoose");

const DocumentUploadSchema = new mongoose.Schema(
    {
        document_number: {
            type: String,
            unique: true,
            sparse: true,
        },
        document_files: [
            {
                url: {
                    type: String,
                    required: true,
                },
                file_type: {
                    type: String,
                    enum: ["pdf", "image"],
                    required: true,
                },
                file_name: String,
                uploaded_at: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        description: {
            type: String,
            required: true,
        },
        vehicle_details: {
            type: String,
            default: "",
        },
        customer_details: {
            user_id: {
                type: String,
                required: true,
                index: true,
            },
            name: String,
            email: String,
            phone: String,
            address: String,
            pincode: String,
        },
        status: {
            type: String,
            enum: [
                "Pending-Review",
                "Under-Review",
                "Contacted",
                "Order-Created",
                "Rejected",
                "Cancelled",
            ],
            default: "Pending-Review",
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "High", "Urgent","null"],
            default: "Medium",
        },
        admin_notes: [
            {
                note: String,
                added_by: String,
                added_at: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        contact_history: [
            {
                contacted_by: String,
                contacted_at: {
                    type: Date,
                    default: Date.now,
                },
                contact_method: {
                    type: String,
                    enum: ["Phone", "Email", "WhatsApp", "In-Person"],
                },
                notes: String,
                outcome: String,
            },
        ],
        assigned_to: {
            type: String,
            index: true,
        },
        assigned_at: Date,
        reviewed_by: String,
        reviewed_at: Date,
        order_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
        order_created_at: Date,
        order_created_by: String,
        estimated_order_value: {
            type: Number,
            default: 0,
        },
        items_requested: [
            {
                product_name: String,
                quantity: Number,
                sku: String,
                notes: String,
            },
        ],
        rejection_reason: String,
        rejected_by: String,
        rejected_at: Date,
    },
    { timestamps: true }
);

// Auto-generate document number before saving
DocumentUploadSchema.pre("save", async function (next) {
    if (!this.document_number) {
        const count = await mongoose.model("DocumentUpload").countDocuments();
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, "0");
        this.document_number = `DOC-${year}${month}-${String(count + 1).padStart(5, "0")}`;
    }
    next();
});

// Indexes for faster queries
DocumentUploadSchema.index({ status: 1, createdAt: -1 });
DocumentUploadSchema.index({ "customer_details.user_id": 1, status: 1 });
DocumentUploadSchema.index({ assigned_to: 1, status: 1 });
DocumentUploadSchema.index({ priority: 1, status: 1 });

module.exports = mongoose.model("DocumentUpload", DocumentUploadSchema);

