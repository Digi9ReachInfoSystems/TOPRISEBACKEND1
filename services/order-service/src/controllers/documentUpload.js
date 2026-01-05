const DocumentUpload = require("../models/documentUpload");
const Order = require("../models/order");
const { sendSuccess, sendError } = require("/packages/utils/responseHandler");
const logger = require("/packages/utils/logger");
const { uploadFile } = require("/packages/utils/s3Helper");
const axios = require("axios");

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://user-service:5001";

// Helper function to fetch user details
async function fetchUserDetails(userId, authHeader) {
    try {
        const response = await axios.get(`${USER_SERVICE_URL}/api/users/${userId}`, {
            headers: { Authorization: authHeader },
            timeout: 5000,
        });
        return response.data?.data || null;
    } catch (error) {
        logger.warn(`Failed to fetch user details for ${userId}:`, error.message);
        return null;
    }
}

/**
 * Create document upload (User side)
 * @route POST /api/documents/upload
 * @access User, Dealer
 */
exports.createDocumentUpload = async (req, res) => {
    try {
        const {
            description,
            user_id,
            name,
            email,
            phone,
            address,
            pincode,
            priority,
            vehicle_details,
            estimated_order_value,
        } = req.body;

        // Validation
        if (!description || !user_id || !req.files?.length) {
            logger.error("Description, user_id, and files are required");
            return sendError(res, "Description, user_id, and at least one file are required", 400);
        }

        if (!email && !phone) {
            logger.error("Either email or phone number is required");
            return sendError(res, "Either email or phone number is required for contact", 400);
        }

        // Upload files to S3
        const uploadedFiles = await Promise.all(
            req.files.map(async (file) => {
                const result = await uploadFile(
                    file.buffer,
                    file.originalname,
                    file.mimetype,
                    "document-uploads"
                );

                // Determine file type
                const fileType = file.mimetype.includes("pdf") ? "pdf" : "image";

                return {
                    url: result.Location,
                    file_type: fileType,
                    file_name: file.originalname,
                    uploaded_at: new Date(),
                };
            })
        );

        // Create document upload
        const documentUpload = new DocumentUpload({
            document_files: uploadedFiles,
            description,
            customer_details: {
                user_id,
                name: name || "",
                email: email || "",
                phone: phone || "",
                address: address || "",
                pincode: pincode || "",
            },
            vehicle_details: vehicle_details || "",
            priority: priority || "Medium",
            estimated_order_value: estimated_order_value || 0,
            status: "Pending-Review",
        });

        await documentUpload.save();

        logger.info(`Document upload created: ${documentUpload.document_number}`);
        return sendSuccess(
            res,
            documentUpload,
            "Document uploaded successfully. Our team will review and contact you soon.",
            201
        );
    } catch (error) {
        logger.error("Error creating document upload:", error);
        return sendError(res, "Error uploading document", 500);
    }
};

/**
 * Get user's document uploads
 * @route GET /api/documents/my-uploads
 * @access User, Dealer
 */
exports.getMyDocumentUploads = async (req, res) => {
    try {
        const { user_id } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const { status } = req.query;

        if (!user_id) {
            return sendError(res, "user_id is required", 400);
        }

        const filter = { "customer_details.user_id": user_id };
        if (status) filter.status = status;

        const totalDocuments = await DocumentUpload.countDocuments(filter);
        const documents = await DocumentUpload.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("order_id", "orderId status order_Amount")
            .lean();

        const totalPages = Math.ceil(totalDocuments / limit);

        logger.info(`Fetched ${documents.length} documents for user ${user_id}`);
        return sendSuccess(res, {
            data: documents,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalDocuments,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        });
    } catch (error) {
        logger.error("Error fetching user documents:", error);
        return sendError(res, "Error fetching documents", 500);
    }
};

/**
 * Get documents for a particular user (Enhanced with service data)
 * @route GET /api/documents/user/:userId
 * @access User, Dealer, Admin
 */
exports.getDocumentsForUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            page = 1,
            limit = 20,
            status,
            priority,
            startDate,
            endDate,
            sortBy = "createdAt",
            sortOrder = "desc"
        } = req.query;

        const skip = (page - 1) * limit;

        if (!userId) {
            return sendError(res, "User ID is required", 400);
        }

        // Build filter
        const filter = { "customer_details.user_id": userId };

        if (status) filter.status = status;
        if (priority) filter.priority = priority;

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === "asc" ? 1 : -1;

        const totalDocuments = await DocumentUpload.countDocuments(filter);

        // Get documents with enhanced data
        const documents = await DocumentUpload.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Fetch user details from user service
        const userDetails = await fetchUserDetails(userId, req.headers.authorization);

        // Enhanced documents with additional data
        const enhancedDocuments = await Promise.all(
            documents.map(async (document) => {
                try {
                    // Fetch order details if order exists
                    let orderDetails = null;
                    if (document.order_id) {
                        const order = await Order.findById(document.order_id).lean();
                        if (order) {
                            orderDetails = {
                                _id: order._id,
                                orderId: order.orderId,
                                status: order.status,
                                totalAmount: order.totalAmount,
                                order_Amount: order.order_Amount,
                                paymentType: order.paymentType,
                                deliveryType: order.deliveryType,
                                createdAt: order.createdAt,
                                updatedAt: order.updatedAt
                            };
                        }
                    }

                    // Calculate computed fields
                    const daysSinceCreated = Math.floor((new Date() - new Date(document.createdAt)) / (1000 * 60 * 60 * 24));
                    const isOverdue = document.status === "Pending-Review" && daysSinceCreated > 3;

                    return {
                        ...document,
                        orderDetails,
                        userDetails,
                        computedFields: {
                            daysSinceCreated,
                            isOverdue,
                            totalFiles: document.document_files?.length || 0,
                            hasOrder: !!document.order_id,
                            estimatedProcessingTime: calculateEstimatedProcessingTime(document)
                        }
                    };
                } catch (error) {
                    logger.error(`Error enhancing document ${document._id}:`, error);
                    return {
                        ...document,
                        orderDetails: null,
                        userDetails,
                        computedFields: {
                            daysSinceCreated: 0,
                            isOverdue: false,
                            totalFiles: 0,
                            hasOrder: false,
                            estimatedProcessingTime: 0
                        }
                    };
                }
            })
        );

        // Calculate summary statistics
        const summary = {
            totalDocuments,
            statusBreakdown: {
                "Pending-Review": enhancedDocuments.filter(d => d.status === "Pending-Review").length,
                "Under-Review": enhancedDocuments.filter(d => d.status === "Under-Review").length,
                "Contacted": enhancedDocuments.filter(d => d.status === "Contacted").length,
                "Order-Created": enhancedDocuments.filter(d => d.status === "Order-Created").length,
                "Rejected": enhancedDocuments.filter(d => d.status === "Rejected").length,
                "Cancelled": enhancedDocuments.filter(d => d.status === "Cancelled").length
            },
            priorityBreakdown: {
                "Low": enhancedDocuments.filter(d => d.priority === "Low").length,
                "Medium": enhancedDocuments.filter(d => d.priority === "Medium").length,
                "High": enhancedDocuments.filter(d => d.priority === "High").length,
                "Urgent": enhancedDocuments.filter(d => d.priority === "Urgent").length
            },
            overdueCount: enhancedDocuments.filter(d => d.computedFields.isOverdue).length,
            ordersCreated: enhancedDocuments.filter(d => d.status === "Order-Created").length
        };

        const pagination = {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalDocuments / limit),
            totalItems: totalDocuments,
            itemsPerPage: parseInt(limit),
            hasNextPage: page < Math.ceil(totalDocuments / limit),
            hasPreviousPage: page > 1
        };

        logger.info(`Fetched ${enhancedDocuments.length} enhanced documents for user ${userId}`);

        return sendSuccess(res, {
            data: enhancedDocuments,
            pagination,
            summary,
            userDetails,
            filters: {
                appliedFilters: { status, priority, startDate, endDate, sortBy, sortOrder }
            }
        }, "Enhanced user documents fetched successfully");

    } catch (error) {
        logger.error("Error fetching enhanced user documents:", error);
        return sendError(res, "Error fetching user documents", 500);
    }
};

// Helper function to calculate estimated processing time
function calculateEstimatedProcessingTime(document) {
    const baseTime = 60; // 60 minutes base processing time
    const fileTime = (document.document_files?.length || 0) * 10; // 10 minutes per file
    const priorityMultiplier = {
        "Low": 1.5,
        "Medium": 1.0,
        "High": 0.7,
        "Urgent": 0.5
    };

    return Math.round((baseTime + fileTime) * (priorityMultiplier[document.priority] || 1.0));
}

/**
 * Get document upload by ID
 * @route GET /api/documents/:id
 * @access User, Dealer, Admin
 */
exports.getDocumentUploadById = async (req, res) => {
    try {
        const { id } = req.params;

        const document = await DocumentUpload.findById(id)
            .populate("order_id")
            .lean();

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        // Fetch user details
        const userDetails = await fetchUserDetails(
            document.customer_details.user_id,
            req.headers.authorization
        );

        // Fetch admin details if assigned/reviewed
        let assignedToDetails = null;
        let reviewedByDetails = null;
        let orderCreatedByDetails = null;

        if (document.assigned_to) {
            assignedToDetails = await fetchUserDetails(
                document.assigned_to,
                req.headers.authorization
            );
        }

        if (document.reviewed_by) {
            reviewedByDetails = await fetchUserDetails(
                document.reviewed_by,
                req.headers.authorization
            );
        }

        if (document.order_created_by) {
            orderCreatedByDetails = await fetchUserDetails(
                document.order_created_by,
                req.headers.authorization
            );
        }

        const enrichedDocument = {
            ...document,
            user_details: userDetails
                ? {
                    _id: userDetails._id,
                    email: userDetails.email,
                    username: userDetails.username,
                    phone_Number: userDetails.phone_Number,
                    role: userDetails.role,
                }
                : null,
            assigned_to_details: assignedToDetails
                ? {
                    _id: assignedToDetails._id,
                    email: assignedToDetails.email,
                    username: assignedToDetails.username,
                }
                : null,
            reviewed_by_details: reviewedByDetails
                ? {
                    _id: reviewedByDetails._id,
                    email: reviewedByDetails.email,
                    username: reviewedByDetails.username,
                }
                : null,
            order_created_by_details: orderCreatedByDetails
                ? {
                    _id: orderCreatedByDetails._id,
                    email: orderCreatedByDetails.email,
                    username: orderCreatedByDetails.username,
                }
                : null,
        };

        logger.info(`Document fetched: ${document.document_number}`);
        return sendSuccess(res, enrichedDocument);
    } catch (error) {
        logger.error("Error fetching document:", error);
        return sendError(res, "Error fetching document", 500);
    }
};

/**
 * Cancel document upload (User side)
 * @route PATCH /api/documents/:id/cancel
 * @access User, Dealer
 */
exports.cancelDocumentUpload = async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, reason } = req.body;

        if (!user_id) {
            return sendError(res, "user_id is required", 400);
        }

        const document = await DocumentUpload.findById(id);

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        // Check if user owns this document
        if (document.customer_details.user_id !== user_id) {
            return sendError(res, "You can only cancel your own documents", 403);
        }

        // Check if already processed
        if (document.status === "Order-Created") {
            return sendError(
                res,
                "Cannot cancel - order has already been created from this document",
                400
            );
        }

        document.status = "Cancelled";
        if (reason) {
            document.admin_notes.push({
                note: `Cancelled by user. Reason: ${reason}`,
                added_by: user_id,
                added_at: new Date(),
            });
        }

        await document.save();

        logger.info(`Document cancelled by user: ${document.document_number}`);
        return sendSuccess(res, document, "Document cancelled successfully");
    } catch (error) {
        logger.error("Error cancelling document:", error);
        return sendError(res, "Error cancelling document", 500);
    }
};

/**
 * Delete document upload (User side)
 * @route DELETE /api/documents/:id
 * @access User, Dealer
 */
exports.deleteDocumentUpload = async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id } = req.query;

        if (!user_id) {
            return sendError(res, "user_id is required", 400);
        }

        const document = await DocumentUpload.findById(id);

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        // Check if user owns this document
        if (document.customer_details.user_id !== user_id) {
            return sendError(res, "You can only delete your own documents", 403);
        }

        // Check if already processed - cannot delete if order was created
        if (document.status === "Order-Created") {
            return sendError(
                res,
                "Cannot delete - order has already been created from this document. Please contact support.",
                400
            );
        }

        // Check if currently under review by admin
        if (document.status === "Under-Review" || document.status === "Contacted") {
            return sendError(
                res,
                "Cannot delete - document is currently being reviewed by admin. Please cancel instead or contact support.",
                400
            );
        }

        const documentNumber = document.document_number;

        // Delete the document
        await DocumentUpload.findByIdAndDelete(id);

        logger.info(`Document deleted by user: ${documentNumber} (user: ${user_id})`);
        return sendSuccess(res, null, "Document deleted successfully");
    } catch (error) {
        logger.error("Error deleting document:", error);
        return sendError(res, "Error deleting document", 500);
    }
};

module.exports = exports;

