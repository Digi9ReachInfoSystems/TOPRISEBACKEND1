// workers/dealerAssignmentWorker.js
require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const dealerAssignmentQueue = require("../queues/assignmentQueue");
const Order = require("../models/order");
const logger = require("/packages/utils/logger");

// Build a reusable axios instance with a baseURL
const productApi = axios.create({
  baseURL: process.env.PRODUCT_SERVICE_URL || "http://product-service:5001",
  timeout: 5000,
});
if (mongoose.connection.readyState === 0) {
  mongoose
    .connect("mongodb+srv://techdev:H1E0bf2fvvPiKZ36@toprise-staging.nshaxai.mongodb.net/?retryWrites=true&w=majority&appName=Toprise-Staging"
      , {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
    .then(() => logger.info("✅ Worker MongoDB connected"))
    .catch(err => {
      logger.error("❌ Worker MongoDB connection failed:", err.message);
      process.exit(1);
    });
}
// Note: MongoDB connection is already established in index.js, so we don't need to connect again here

dealerAssignmentQueue.process(async (job) => {
  const { orderId } = job.data;
  logger.info(`🔄 Processing dealer assignment for Order ${orderId}`);

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    logger.info(`Found order ${orderId} with ${order.skus.length} SKUs`);

    order.dealerMapping = [];
    order.skus.forEach((line) => (line.dealerMapped = []));

    for (const line of order.skus) {
      const { sku, quantity: qtyNeeded, productId } = line;
      logger.info(
        `Processing SKU: ${sku}, Quantity: ${qtyNeeded}, ProductId: ${productId}`
      );

      try {
        // 1) Fetch dealers list using the configured productApi instance
        // const resp = await productApi.get(
        //   `/products/v1/products/${productId}/availableDealers`
        // );
        console.log(`Fetching dealers for product ${productId} at pincode ${order.ordered_pincode}`);
        const resp = await productApi.get(
          `/products/v1/products/${productId}/availableDealers/pincode/${order.ordered_pincode}`
        );

        const dealers = resp.data.data || resp.data; // depending on your API shape
   
        logger.info(
          `Found ${dealers.length} available dealers for product ${productId}`
        );

        // 2) Sort & pick
        const candidates = dealers
          .filter((d) => d.quantityAvailable >= qtyNeeded)
          .sort((a, b) =>
            b.priorityOverride !== a.priorityOverride
              ? b.priorityOverride - a.priorityOverride
              : b.quantityAvailable - a.quantityAvailable
          );

        if (!candidates.length) {
          logger.warn(
            `No dealer can fulfill SKU ${sku} - required: ${qtyNeeded}`
          );
          continue;
        }

        const chosen = candidates[0];
        logger.info(`Selected dealer ${chosen.dealerId} for SKU ${sku}`);

        // 3) Record assignment
        order.dealerMapping.push({
          sku,
          dealerId: new mongoose.Types.ObjectId(chosen.dealerId),
          status: "Pending",
          assignedAt: new Date(),
        });
        line.dealerMapped.push({ dealerId: new mongoose.Types.ObjectId(chosen.dealerId) });

        // 4) Decrement stock
        await productApi.patch(
          `/products/v1/products/${productId}/availableDealers/${chosen.dealerId}`,
          { decrementBy: qtyNeeded }
        );

        logger.info(
          `Successfully assigned SKU ${sku} to dealer ${chosen.dealerId}`
        );
      } catch (skuError) {
        logger.error(`Error processing SKU ${sku}:`, skuError.message);
        // Continue with other SKUs even if one fails
      }
    }

    // Update order status to Assigned if we have dealer mappings
    if (order.dealerMapping.length > 0) {
      order.status = "Assigned";
      if (order.timestamps) {
        order.timestamps.assignedAt = new Date();
      }
      logger.info(`Updated order status to Assigned with ${order.dealerMapping.length} dealer mappings`);
    }

    logger.info(`Saving order with dealer mappings:`, order.dealerMapping.map(m => ({ sku: m.sku, dealerId: m.dealerId, status: m.status })));
    await order.save();
    logger.info(`✅ Dealer assignment complete for Order ${orderId}`);
  } catch (error) {
    logger.error(
      `❌ Error in dealer assignment for Order ${orderId}:`,
      error.message
    );
    logger.error(`Full error details:`, error);
    throw error; // Re-throw to mark job as failed
  }
});

dealerAssignmentQueue.on("failed", (job, err) => {
  logger.error(`❌ Job ${job.id} failed:`, err.message);
  logger.error(`Job data:`, job.data);
});

dealerAssignmentQueue.on("completed", (job) => {
  logger.info(`✅ Job ${job.id} completed successfully`);
});

dealerAssignmentQueue.on("error", (err) => {
  logger.error(`❌ Queue error:`, err.message);
});

// Log when the worker starts
logger.info("🚀 Dealer Assignment Worker started and listening for jobs");
