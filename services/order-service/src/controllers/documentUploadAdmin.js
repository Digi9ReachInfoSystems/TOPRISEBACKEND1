const DocumentUpload = require("../models/documentUpload");
const Order = require("../models/order");
const { sendSuccess, sendError } = require("/packages/utils/responseHandler");
const logger = require("/packages/utils/logger");
const axios = require("axios");
const Payment = require("../models/paymentModel");

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://user-service:5001";
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || "http://product-service:5002";
const { v4: uuidv4 } = require("uuid");
const dealerAssignmentQueue = require("../queues/assignmentQueue");
const Cart = require("../models/cart");
const { generatePdfAndUploadInvoice } = require("../../../../packages/utils/generateInvoice");
const { createUnicastOrMulticastNotificationUtilityFunction } = require("../../../../packages/utils/notificationService");
/**
 * Get all document uploads (Admin side with filters)
 * @route GET /api/documents/admin/all
 * @access Super-admin, Fulfillment-Admin, Customer-Support
 */
exports.getAllDocumentUploads = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const {
            status,
            priority,
            assigned_to,
            startDate,
            endDate,
            search,
        } = req.query;

        // Build filter
        const filter = {};

        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (assigned_to) filter.assigned_to = assigned_to;

        if (search) {
            filter.$or = [
                { document_number: new RegExp(search, "i") },
                { description: new RegExp(search, "i") },
                { "customer_details.name": new RegExp(search, "i") },
                { "customer_details.email": new RegExp(search, "i") },
                { "customer_details.phone": new RegExp(search, "i") },
            ];
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        const totalDocuments = await DocumentUpload.countDocuments(filter);

        const documents = await DocumentUpload.find(filter)
            .sort({ priority: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("order_id", "orderId status order_Amount")
            .lean();

        const totalPages = Math.ceil(totalDocuments / limit);

        logger.info(`Admin fetched ${documents.length} document uploads`);
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
            filters: { status, priority, assigned_to, search, startDate, endDate },
        });
    } catch (error) {
        logger.error("Error fetching documents (admin):", error);
        return sendError(res, "Error fetching documents", 500);
    }
};

/**
 * Assign document to admin/support staff
 * @route PATCH /api/documents/admin/:id/assign
 * @access Super-admin, Fulfillment-Admin
 */
exports.assignDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { assigned_to, assigned_by } = req.body;

        if (!assigned_to) {
            return sendError(res, "assigned_to is required", 400);
        }

        const document = await DocumentUpload.findById(id);

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        document.assigned_to = assigned_to;
        document.assigned_at = new Date();
        document.status = "Under-Review";

        document.admin_notes.push({
            note: `Document assigned to ${assigned_to}`,
            added_by: assigned_by || "System",
            added_at: new Date(),
        });

        await document.save();

        logger.info(`Document ${document.document_number} assigned to ${assigned_to}`);
        return sendSuccess(res, document, "Document assigned successfully");
    } catch (error) {
        logger.error("Error assigning document:", error);
        return sendError(res, "Error assigning document", 500);
    }
};

/**
 * Add contact history
 * @route POST /api/documents/admin/:id/contact
 * @access Super-admin, Fulfillment-Admin, Customer-Support
 */
exports.addContactHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { contacted_by, contact_method, notes, outcome } = req.body;

        if (!contacted_by || !contact_method) {
            return sendError(res, "contacted_by and contact_method are required", 400);
        }

        const document = await DocumentUpload.findById(id);

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        document.contact_history.push({
            contacted_by,
            contacted_at: new Date(),
            contact_method,
            notes: notes || "",
            outcome: outcome || "",
        });

        // Update status to Contacted if it's the first contact
        if (document.status === "Pending-Review" || document.status === "Under-Review") {
            document.status = "Contacted";
        }

        await document.save();

        logger.info(`Contact history added to document ${document.document_number}`);
        return sendSuccess(res, document, "Contact history added successfully");
    } catch (error) {
        logger.error("Error adding contact history:", error);
        return sendError(res, "Error adding contact history", 500);
    }
};

/**
 * Add admin notes
 * @route POST /api/documents/admin/:id/notes
 * @access Super-admin, Fulfillment-Admin, Customer-Support
 */
exports.addAdminNotes = async (req, res) => {
    try {
        const { id } = req.params;
        const { note, added_by } = req.body;

        if (!note || !added_by) {
            return sendError(res, "note and added_by are required", 400);
        }

        const document = await DocumentUpload.findById(id);

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        document.admin_notes.push({
            note,
            added_by,
            added_at: new Date(),
        });

        await document.save();

        logger.info(`Admin note added to document ${document.document_number}`);
        return sendSuccess(res, document, "Note added successfully");
    } catch (error) {
        logger.error("Error adding admin note:", error);
        return sendError(res, "Error adding note", 500);
    }
};

/**
 * Add items requested (parsed from document)
 * @route POST /api/documents/admin/:id/items
 * @access Super-admin, Fulfillment-Admin
 */
exports.addItemsRequested = async (req, res) => {
    try {
        const { id } = req.params;
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return sendError(res, "items array is required", 400);
        }

        const document = await DocumentUpload.findById(id);

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        document.items_requested = items;
        await document.save();

        logger.info(`Items added to document ${document.document_number}`);
        return sendSuccess(res, document, "Items added successfully");
    } catch (error) {
        logger.error("Error adding items:", error);
        return sendError(res, "Error adding items", 500);
    }
};

/**
 * Create order from document upload
 * @route POST /api/documents/admin/:id/create-order
 * @access Super-admin, Fulfillment-Admin
 */
exports.createOrderFromDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { created_by } = req.body;

        if (!created_by) {
            return sendError(res, "created_by is required", 400);
        }

        const document = await DocumentUpload.findById(id);

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        if (document.status === "Order-Created") {
            return sendError(res, "Order has already been created from this document", 400);
        }

        // Validate order data (skus)
        if (!req.body.skus || !Array.isArray(req.body.skus) || req.body.skus.length === 0) {
            return sendError(res, "Order must contain at least one SKU", 400);
        }

        // Use the exact same logic as createOrder


        const formatDate = (date) => {
            const d = new Date(date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        };

        const orderId = `ORD-${Date.now()}-${uuidv4().slice(0, 8)}`;

        const orderPayload = {
            orderId,
            ...req.body,
            orderDate: new Date(),
            type_of_delivery: req.body.type_of_delivery || "Express",
            delivery_type: req.body.delivery_type || req.body.type_of_delivery || "Express",
            status: "Confirmed",
            timestamps: { createdAt: new Date() },
            // Ensure skus have uppercase SKU and empty dealerMapping slots
            skus: (req.body.skus || []).map((s) => ({
                sku: String(s.sku).toUpperCase().trim(),
                quantity: s.quantity,
                productId: s.productId,
                productName: s.productName,
                selling_price: s.selling_price,
                mrp: s.mrp,
                mrp_gst_amount: s.mrp_gst_amount,
                gst_percentage: s.gst_percentage,
                gst_amount: s.gst_amount,
                product_total: s.product_total,
                totalPrice: s.totalPrice,
                dealerMapped: [],
            })),
            dealerMapping: [],
            created_from_document: true,
            document_upload_id: document._id,
        };

        const newOrder = await Order.create(orderPayload);

        // Generate invoice
        const invoiceNumber = `INV-${Date.now()}`;
        const customerDetails = newOrder.customerDetails;
        const items = newOrder.skus.map((s) => ({
            productName: s.productName,
            sku: s.sku,
            unitPrice: s.selling_price,
            quantity: s.quantity,
            taxRate: `${s.gst_percentage || 0}%`,
            cgstPercent: (s.gst_percentage || 0) / 2,
            cgstAmount: (s.gst_amount || 0) / 2,
            sgstPercent: (s.gst_percentage || 0) / 2,
            sgstAmount: (s.gst_amount || 0) / 2,
            totalAmount: s.totalPrice,
        }));
        const shippingCharges = Number(req.body.deliveryCharges) || 0;
        const totalOrderAmount = Number(req.body.order_Amount) || 0;

        logger.info("🧾 Generating invoice for order from document:", invoiceNumber);
        const invoiceResult = await generatePdfAndUploadInvoice(
            customerDetails,
            newOrder.orderId,
            formatDate(newOrder.orderDate),
            "Delhi", // Place of supply
            customerDetails.address, // Place of delivery
            items,
            shippingCharges,
            totalOrderAmount,
            invoiceNumber
        );

        newOrder.invoiceNumber = invoiceNumber;
        newOrder.invoiceUrl = invoiceResult.Location;
        await newOrder.save();

        // Add to dealer assignment queue
        await dealerAssignmentQueue.add(
            { orderId: newOrder._id.toString() },
            {
                attempts: 5,
                backoff: { type: "exponential", delay: 1000 },
                removeOnComplete: true,
                removeOnFail: false,
            }
        );

        // Clear cart if COD and send notifications
        if (req.body.paymentType === "COD") {
            const cart = await Cart.findOne({
                userId: req.body.customerDetails.userId,
            });
            if (!cart) {
                logger.error(`❌ Cart not found for user: ${req.body.customerDetails.userId}`);
            } else {
                cart.items = [];
                cart.totalPrice = 0;
                cart.itemTotal = 0;
                cart.handlingCharge = 0;
                cart.deliveryCharge = 0;
                cart.gst_amount = 0;
                cart.total_mrp = 0;
                cart.total_mrp_gst_amount = 0;
                cart.total_mrp_with_gst = 0;
                cart.grandTotal = 0;
                await cart.save();
                logger.info(`✅ Cart cleared for user: ${req.body.customerDetails.userId}`);

                // Send notification to customer
                const successData = await createUnicastOrMulticastNotificationUtilityFunction(
                    [req.body.customerDetails.userId],
                    ["INAPP", "PUSH"],
                    "Order Placed",
                    `Order Placed Successfully with order id ${orderId}`,
                    "",
                    "",
                    "Order",
                    {
                        order_id: newOrder._id,
                    },
                    req.headers.authorization
                );
                if (!successData.success) {
                    logger.error("❌ Create notification error:", successData.message);
                } else {
                    logger.info("✅ Notification created successfully", successData.message);
                }

                // Get Super-admin users for notification
                let superAdminIds = [];
                try {
                    const userData = await axios.get(
                        "http://user-service:5001/api/users/internal/super-admins"
                    );
                    if (userData.data.success) {
                        superAdminIds = userData.data.data.map((u) => u._id);
                    }
                } catch (error) {
                    logger.warn("Failed to fetch Super-admin users for notification:", error.message);
                }

                // Send notification to admins
                const notify = await createUnicastOrMulticastNotificationUtilityFunction(
                    superAdminIds,
                    ["INAPP", "PUSH"],
                    "Order Created Alert",
                    `Order Placed Successfully with order id ${orderId}`,
                    "",
                    "",
                    "Order",
                    {
                        order_id: newOrder._id,
                    },
                    req.headers.authorization
                );
                if (!notify.success) {
                    logger.error("❌ Create notification error:", notify.message);
                } else {
                    logger.info("✅ Notification created successfully");
                }
            }
        }

        // Update document status
        document.status = "Order-Created";
        document.order_id = newOrder._id;
        document.order_created_at = new Date();
        document.order_created_by = created_by;
        document.reviewed_by = created_by;
        document.reviewed_at = new Date();

        document.admin_notes.push({
            note: `Order ${newOrder.orderId} created from this document`,
            added_by: created_by,
            added_at: new Date(),
        });

        await document.save();

        logger.info(`Order created from document ${document.document_number}: ${newOrder.orderId}`);

        return sendSuccess(
            res,
            {
                document,
                order: newOrder,
            },
            "Order created successfully from document"
        );
    } catch (error) {
        logger.error("Error creating order from document:", error);
        return sendError(res, "Error creating order from document", 500);
    }
};

/**
 * Reject document upload
 * @route PATCH /api/documents/admin/:id/reject
 * @access Super-admin, Fulfillment-Admin
 */
exports.rejectDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejected_by, rejection_reason } = req.body;
       console.log("req.body",id);

        if (!rejected_by || !rejection_reason) {
            return sendError(res, "rejected_by and rejection_reason are required", 400);
        }

        const document = await DocumentUpload.findById(id);
        console.log("document",document);
        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        if (document.status === "Order-Created") {
            return sendError(
                res,
                "Cannot reject - order has already been created from this document",
                400
            );
        }

        document.status = "Rejected";
        document.rejection_reason = rejection_reason;
        document.rejected_by = rejected_by;
        document.rejected_at = new Date();

        document.admin_notes.push({
            note: `Document rejected. Reason: ${rejection_reason}`,
            added_by: rejected_by,
            added_at: new Date(),
        });

        await document.save();

        logger.info(`Document rejected: ${document.document_number}`);
        return sendSuccess(res, document, "Document rejected");
    } catch (error) {
        logger.error("Error rejecting document:", error);
        return sendError(res, "Error rejecting document", 500);
    }
};

/**
 * Update document status
 * @route PATCH /api/documents/admin/:id/status
 * @access Super-admin, Fulfillment-Admin
 */
exports.updateDocumentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, updated_by } = req.body;

        const validStatuses = [
            "Pending-Review",
            "Under-Review",
            "Contacted",
            "Order-Created",
            "Rejected",
            "Cancelled",
        ];

        if (!status || !validStatuses.includes(status)) {
            return sendError(res, `Status must be one of: ${validStatuses.join(", ")}`, 400);
        }

        const document = await DocumentUpload.findById(id);

        if (!document) {
            return sendError(res, "Document not found", 404);
        }

        const oldStatus = document.status;
        document.status = status;

        document.admin_notes.push({
            note: `Status changed from ${oldStatus} to ${status}`,
            added_by: updated_by || "System",
            added_at: new Date(),
        });

        await document.save();

        logger.info(`Document status updated: ${document.document_number} to ${status}`);
        return sendSuccess(res, document, "Status updated successfully");
    } catch (error) {
        logger.error("Error updating status:", error);
        return sendError(res, "Error updating status", 500);
    }
};

/**
 * Get document statistics
 * @route GET /api/documents/admin/stats
 * @access Super-admin, Fulfillment-Admin
 */
exports.getDocumentStatistics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        const totalDocuments = await DocumentUpload.countDocuments(dateFilter);
        const pendingReview = await DocumentUpload.countDocuments({
            ...dateFilter,
            status: "Pending-Review",
        });
        const underReview = await DocumentUpload.countDocuments({
            ...dateFilter,
            status: "Under-Review",
        });
        const contacted = await DocumentUpload.countDocuments({
            ...dateFilter,
            status: "Contacted",
        });
        const orderCreated = await DocumentUpload.countDocuments({
            ...dateFilter,
            status: "Order-Created",
        });
        const rejected = await DocumentUpload.countDocuments({
            ...dateFilter,
            status: "Rejected",
        });
        const cancelled = await DocumentUpload.countDocuments({
            ...dateFilter,
            status: "Cancelled",
        });

        // Priority breakdown
        const priorityBreakdown = await DocumentUpload.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: "$priority",
                    count: { $sum: 1 },
                },
            },
        ]);

        // Conversion rate
        const conversionRate =
            totalDocuments > 0 ? ((orderCreated / totalDocuments) * 100).toFixed(2) + "%" : "0%";

        // Recent activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentUploads = await DocumentUpload.countDocuments({
            createdAt: { $gte: sevenDaysAgo },
        });

        const stats = {
            total: totalDocuments,
            byStatus: {
                pendingReview,
                underReview,
                contacted,
                orderCreated,
                rejected,
                cancelled,
            },
            byPriority: priorityBreakdown.reduce((acc, item) => {
                acc[item._id || "Unknown"] = item.count;
                return acc;
            }, {}),
            conversionRate,
            recentActivity: {
                last7Days: recentUploads,
            },
        };

        logger.info("Document statistics retrieved");
        return sendSuccess(res, stats, "Statistics retrieved successfully");
    } catch (error) {
        logger.error("Error fetching statistics:", error);
        return sendError(res, "Error fetching statistics", 500);
    }
};


exports.createOrderforPurchaseRequest = async (req, res) => {
    try {
        const orderId = `ORD-${Date.now()}-${uuidv4().slice(0, 8)}`;

        const orderPayload = {
            orderId,
            ...req.body,
            orderDate: new Date(),
            type_of_delivery: req.body.type_of_delivery || "Express",
            delivery_type:
                req.body.delivery_type || req.body.type_of_delivery || "Express",
            status: "Confirmed",
            timestamps: { createdAt: new Date() },
            // ensure skus have uppercase SKU and empty dealerMapping slots
            skus: (req.body.skus || []).map((s) => ({
                sku: String(s.sku).toUpperCase().trim(),
                quantity: s.quantity,
                productId: s.productId,
                productName: s.productName,
                selling_price: s.selling_price,
                mrp: s.mrp,
                mrp_gst_amount: s.mrp_gst_amount,
                gst_percentage: s.gst_percentage,
                gst_amount: s.gst_amount,
                product_total: s.product_total,
                totalPrice: s.totalPrice,
                dealerMapped: [],
            })),
            dealerMapping: [],
            ordered_pincode: req.body.ordered_pincode || req.body.customerDetails?.pincode || "",
        };

        const newOrder = await Order.create(orderPayload);
        const documentUpload = await DocumentUpload.findOne({ _id: req.body.document_upload_id });
        if (documentUpload) {
            documentUpload.status = "Order-Created";
            documentUpload.order_id = newOrder._id;
            documentUpload.order_created_at = new Date();
            documentUpload.order_created_by = req.body.created_by || "system";
            await documentUpload.save();
        }

        const invoiceNumber = `INV-${Date.now()}`;
        const customerDetails = newOrder.customerDetails;
        const items = newOrder.skus.map((s) => ({
            productName: s.productName,
            sku: s.sku,
            unitPrice: s.selling_price,
            quantity: s.quantity,
            taxRate: `${s.gst_percentage || 0}%`,
            cgstPercent: (s.gst_percentage || 0) / 2,
            cgstAmount: (s.gst_amount || 0) / 2,
            sgstPercent: (s.gst_percentage || 0) / 2,
            sgstAmount: (s.gst_amount || 0) / 2,
            totalAmount: s.totalPrice,
        }));
        const shippingCharges = Number(req.body.deliveryCharges) || 0;
        const totalOrderAmount = Number(req.body.order_Amount) || 0;

        console.log("🧾 Generating invoice for order:", invoiceNumber, customerDetails, items, shippingCharges, totalOrderAmount);
        const invoiceResult = await generatePdfAndUploadInvoice(
            customerDetails,
            newOrder.orderId,
            formatDate(newOrder.orderDate),
            "Delhi", // Place of supply
            customerDetails.address, // Place of delivery
            items,
            shippingCharges,
            totalOrderAmount,
            invoiceNumber
        );

        newOrder.invoiceNumber = invoiceNumber;
        newOrder.invoiceUrl = invoiceResult.Location;
        const savedOrder = await newOrder.save();
        const payment = new Payment({
            order_id: savedOrder._id,
            payment_method: "COD",
            razorpay_order_id: null,
            amount: savedOrder.order_Amount,
            created_at: new Date(),
            payment_status: "Created",
        })
        await payment.save();
        // add payment id to order
        await Order.findByIdAndUpdate(savedOrder._id, { payment_id: payment._id });
        // console.log("payment",payment);

        // Log order creation audit
        // await logOrderAction({
        //   orderId: newOrder._id,
        //   action: "ORDER_CREATED",
        //   performedBy: req.body.customerDetails?.userId || "system",
        //   performedByRole: "customer",
        //   details: {
        //     orderId: newOrder.orderId,
        //     customerId: req.body.customerDetails?.userId,
        //     totalAmount: req.body.totalAmount,
        //     skuCount: req.body.skus?.length || 0,
        //     deliveryType: req.body.delivery_type || req.body.type_of_delivery,
        //     paymentType: req.body.paymentType,
        //     source: "mobile_app",
        //   },
        //   timestamp: new Date(),
        // });

        await dealerAssignmentQueue.add(
            { orderId: newOrder._id.toString() },
            {
                attempts: 5,
                backoff: { type: "exponential", delay: 1000 },
                removeOnComplete: true,
                removeOnFail: false,
            }
        );
        if (req.body.paymentType === "COD") {
            const cart = await Cart.findOne({
                userId: req.body.customerDetails.userId,
            });
            if (!cart) {
                logger.error(
                    `❌ Cart not found for user: ${req.body.customerDetails.userId}`
                );
            } else {
                cart.items = [];
                cart.totalPrice = 0;
                cart.itemTotal = 0;
                cart.handlingCharge = 0;
                cart.deliveryCharge = 0;
                cart.gst_amount = 0;
                cart.total_mrp = 0;
                cart.total_mrp_gst_amount = 0;
                cart.total_mrp_with_gst = 0;
                cart.grandTotal = 0;
                await cart.save();
                logger.info(
                    `✅ Cart cleared for user: ${req.body.customerDetails.userId}`
                );
                const successData =
                    await createUnicastOrMulticastNotificationUtilityFunction(
                        [req.body.customerDetails.userId],
                        ["INAPP", "PUSH", "EMAIL"],
                        "Order Placed",
                        `Order Placed Successfully with order id ${orderId}`,
                        "",
                        "",
                        "Order",
                        {
                            order_id: newOrder._id,
                        },
                        req.headers.authorization
                    );
                if (!successData.success) {
                    logger.error("❌ Create notification error:", successData.message);
                } else {
                    logger.info(
                        "✅ Notification created successfully",
                        successData.message
                    );
                }

                // Send order confirmation email
                try {
                    const emailResult = await sendOrderConfirmationEmail(
                        req.body.customerDetails.email,
                        newOrder,
                        req.headers.authorization
                    );
                    if (emailResult.success) {
                        logger.info("✅ Order confirmation email sent successfully");
                    } else {
                        logger.error("❌ Failed to send order confirmation email:", emailResult.message);
                    }
                } catch (emailError) {
                    logger.error("❌ Error sending order confirmation email:", emailError);
                }
                // Get Super-admin users for notification (using internal endpoint)
                let superAdminIds = [];
                try {
                    const userData = await axios.get(
                        "http://user-service:5001/api/users/internal/super-admins"
                    );
                    if (userData.data.success) {
                        superAdminIds = userData.data.data.map((u) => u._id);
                    }
                } catch (error) {
                    logger.warn(
                        "Failed to fetch Super-admin users for notification:",
                        error.message
                    );
                }

                const notify =
                    await createUnicastOrMulticastNotificationUtilityFunction(
                        superAdminIds,
                        ["INAPP", "PUSH", "EMAIL"],
                        "Order Created Alert",
                        `Order Placed Successfully with order id ${orderId}`,
                        "",
                        "",
                        "Order",
                        {
                            order_id: newOrder._id,
                        },
                        req.headers.authorization
                    );
                if (!notify.success)
                    logger.error("❌ Create notification error:", notify.message);
                else logger.info("✅ Notification created successfully");
            }
        }

        return sendSuccess(res, newOrder, "Order created successfully");
    } catch (error) {
        console.error("Create Order failed:", error);
        return sendError(res, error.message || "Failed to create order");
    }
};

const formatDate = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-based
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
};

exports.getAllDocumentUploadsNoPagination = async (req, res) => {
  try {
    const {
      status,
      priority,
      assigned_to,
      startDate,
      endDate,
      search,
    } = req.query;

    // Build filter
    const filter = {};

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assigned_to) filter.assigned_to = assigned_to;

    // Search filter
    if (search) {
      filter.$or = [
        { document_number: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { "customer_details.name": new RegExp(search, "i") },
        { "customer_details.email": new RegExp(search, "i") },
        { "customer_details.phone": new RegExp(search, "i") },
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Fetch all documents (NO pagination)
    const documents = await DocumentUpload.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .populate("order_id", "orderId status order_Amount")
      .lean();

    logger.info(`Fetched ${documents.length} document uploads (no pagination)`);

    return sendSuccess(res, {
      data: documents,
      filters: { status, priority, assigned_to, search, startDate, endDate },
    });
  } catch (error) {
    logger.error("Error fetching documents (no pagination):", error);
    return sendError(res, "Error fetching documents", 500);
  }
};


module.exports = exports;

