const SLAViolation = require("../models/slaViolation");
const DealerSLA = require("../models/dealerSla");
const SLAType = require("../models/slaType");
const logger = require("/packages/utils/logger");

/**
 * Calculate expected fulfillment time based on dealer SLA configuration
 * @param {Date} orderDate - When the order was created
 * @param {Object} dealerSLA - Dealer SLA configuration
 * @returns {Date} Expected fulfillment time
 */
function calculateExpectedFulfillmentTime(orderDate, dealerSLA) {
  if (!dealerSLA || !dealerSLA.sla_type) {
    return null;
  }

  const expectedTime = new Date(orderDate);
  
  // Add expected hours from SLA type
  if (dealerSLA.sla_type.expected_hours) {
    expectedTime.setHours(expectedTime.getHours() + dealerSLA.sla_type.expected_hours);
  }

  // Adjust for dispatch hours if configured
  if (dealerSLA.dispatch_hours) {
    const fulfillmentHour = expectedTime.getHours();
    if (fulfillmentHour < dealerSLA.dispatch_hours.start) {
      expectedTime.setHours(dealerSLA.dispatch_hours.start, 0, 0, 0);
    } else if (fulfillmentHour > dealerSLA.dispatch_hours.end) {
      expectedTime.setDate(expectedTime.getDate() + 1);
      expectedTime.setHours(dealerSLA.dispatch_hours.start, 0, 0, 0);
    }
  }

  return expectedTime;
}

/**
 * Check if a specific SKU packing violates SLA
 * @param {Object} order - Order object
 * @param {String} sku - SKU identifier
 * @param {Date} packedAt - When the SKU was packed
 * @returns {Object} SLA violation details for the SKU
 */
async function checkSKUSLAViolation(order, sku, packedAt) {
  try {
    if (!order || !order.dealerMapping || order.dealerMapping.length === 0) {
      return { hasViolation: false, violation: null };
    }

    // Find the SKU in the order
    const skuItem = order.skus?.find(s => s.sku === sku);
    if (!skuItem) {
      return { hasViolation: false, violation: null };
    }

    // Get dealer for this SKU (from skuItem.dealerMapped or order.dealerMapping)
    const dealerId = skuItem.dealerMapped?.[0]?.dealerId || 
                     order.dealerMapping.find(dm => dm.sku === sku)?.dealerId ||
                     order.dealerMapping[0]?.dealerId;
    
    if (!dealerId) {
      return { hasViolation: false, violation: null };
    }

    // Get dealer SLA configuration
    const dealerSLA = await DealerSLA.findOne({ dealer_id: dealerId.toString() }).populate('sla_type');
    if (!dealerSLA || !dealerSLA.is_active) {
      return { hasViolation: false, violation: null };
    }

    // Calculate expected fulfillment time
    const orderDate = order.orderDate || order.createdAt || new Date();
    const expectedFulfillmentTime = calculateExpectedFulfillmentTime(orderDate, dealerSLA);
    
    if (!expectedFulfillmentTime) {
      return { hasViolation: false, violation: null };
    }

    // Check if packing time exceeds expected fulfillment time
    const packedAtDate = new Date(packedAt);
    const violationMinutes = Math.round((packedAtDate - expectedFulfillmentTime) / (1000 * 60));
    
    const hasViolation = violationMinutes > 0;

    if (hasViolation) {
      return {
        hasViolation: true,
        violation: {
          dealer_id: dealerId,
          order_id: order._id,
          sku: sku,
          expected_fulfillment_time: expectedFulfillmentTime,
          actual_fulfillment_time: packedAtDate,
          violation_minutes: violationMinutes,
          notes: `SLA violation detected for SKU ${sku} when packed. Expected: ${expectedFulfillmentTime.toISOString()}, Actual: ${packedAtDate.toISOString()}`
        }
      };
    }

    return { hasViolation: false, violation: null };
  } catch (error) {
    logger.error(`Error checking SLA violation for SKU ${sku}:`, error);
    return { hasViolation: false, violation: null, error: error.message };
  }
}

/**
 * Check if order packing violates SLA (SKU-based tracking)
 * Only marks order as violated if ALL SKUs are violated
 * @param {Object} order - Order object
 * @param {Date} packedAt - When the order/SKU was packed (optional, will use SKU timestamps if not provided)
 * @param {String} sku - Optional: specific SKU to check (if not provided, checks all packed SKUs)
 * @returns {Object} SLA violation details
 */
async function checkSLAViolationOnPacking(order, packedAt, sku = null) {
  try {
    if (!order || !order.skus || order.skus.length === 0) {
      return { hasViolation: false, violation: null, skuViolations: [] };
    }

    const skuViolations = [];
    let allSkusViolated = true;
    let hasAnyViolation = false;

    // If specific SKU is provided, check only that SKU
    if (sku) {
      const skuItem = order.skus.find(s => s.sku === sku);
      if (!skuItem) {
        return { hasViolation: false, violation: null, skuViolations: [] };
      }

      // Use SKU's packedAt timestamp if available, otherwise use provided packedAt
      const skuPackedAt = skuItem.tracking_info?.timestamps?.packedAt || packedAt || new Date();
      
      const skuCheck = await checkSKUSLAViolation(order, sku, skuPackedAt);
      if (skuCheck.hasViolation) {
        skuViolations.push({
          sku: sku,
          violation: skuCheck.violation
        });
        hasAnyViolation = true;
      }

      // For single SKU check, return the result directly
      return {
        hasViolation: skuCheck.hasViolation,
        violation: skuCheck.violation,
        skuViolations: skuViolations,
        allSkusViolated: skuCheck.hasViolation
      };
    }

    // Check all SKUs in the order
    const packedSkus = order.skus.filter(s => 
      s.tracking_info?.status === "Packed" && 
      s.tracking_info?.timestamps?.packedAt
    );

    if (packedSkus.length === 0) {
      return { hasViolation: false, violation: null, skuViolations: [] };
    }

    // Check each packed SKU for violations
    for (const skuItem of packedSkus) {
      const skuPackedAt = skuItem.tracking_info.timestamps.packedAt || packedAt || new Date();
      const skuCheck = await checkSKUSLAViolation(order, skuItem.sku, skuPackedAt);
      
      if (skuCheck.hasViolation) {
        skuViolations.push({
          sku: skuItem.sku,
          violation: skuCheck.violation
        });
        hasAnyViolation = true;
      } else {
        // If any SKU is not violated, order is not fully violated
        allSkusViolated = false;
      }
    }

    // Order is only considered violated if ALL SKUs are violated
    const orderViolated = hasAnyViolation && allSkusViolated && skuViolations.length === packedSkus.length;

    // If order is violated, return aggregate violation info
    if (orderViolated) {
      // Calculate aggregate violation (use maximum violation minutes)
      const maxViolation = skuViolations.reduce((max, sv) => 
        sv.violation.violation_minutes > (max?.violation_minutes || 0) ? sv : max, 
        null
      );

      return {
        hasViolation: true,
        violation: maxViolation ? {
          dealer_id: maxViolation.violation.dealer_id,
          order_id: order._id,
          expected_fulfillment_time: maxViolation.violation.expected_fulfillment_time,
          actual_fulfillment_time: maxViolation.violation.actual_fulfillment_time,
          violation_minutes: maxViolation.violation.violation_minutes,
          notes: `SLA violation detected: All SKUs violated. ${skuViolations.length} SKU(s) violated. Max violation: ${maxViolation.violation.violation_minutes} minutes.`
        } : null,
        skuViolations: skuViolations,
        allSkusViolated: true
      };
    }

    // Order not fully violated, but some SKUs may be
    return {
      hasViolation: false,
      violation: null,
      skuViolations: skuViolations,
      allSkusViolated: false,
      message: skuViolations.length > 0 
        ? `Partial violation: ${skuViolations.length}/${packedSkus.length} SKUs violated. Order not marked as violated.`
        : null
    };
  } catch (error) {
    logger.error("Error checking SLA violation on packing:", error);
    return { hasViolation: false, violation: null, skuViolations: [], error: error.message };
  }
}

/**
 * Record SLA violation in database
 * @param {Object} violationData - Violation details
 * @returns {Object} Created violation record
 */
async function recordSLAViolation(violationData) {
  try {
    const violation = new SLAViolation({
      dealer_id: violationData.dealer_id,
      order_id: violationData.order_id,
      sku: violationData.sku || null, // SKU-level tracking
      expected_fulfillment_time: violationData.expected_fulfillment_time,
      actual_fulfillment_time: violationData.actual_fulfillment_time,
      violation_minutes: violationData.violation_minutes,
      notes: violationData.notes,
      resolved: false
    });

    await violation.save();
    const skuInfo = violationData.sku ? ` for SKU ${violationData.sku}` : '';
    logger.info(`SLA violation recorded for order ${violationData.order_id}${skuInfo}: ${violationData.violation_minutes} minutes`);
    
    return violation;
  } catch (error) {
    logger.error("Error recording SLA violation:", error);
    throw error;
  }
}

/**
 * Record multiple SKU-level violations
 * @param {Array} violations - Array of violation data objects
 * @returns {Array} Created violation records
 */
async function recordSKUViolations(violations) {
  try {
    const violationRecords = violations.map(violationData => ({
      dealer_id: violationData.dealer_id,
      order_id: violationData.order_id,
      sku: violationData.sku || null,
      expected_fulfillment_time: violationData.expected_fulfillment_time,
      actual_fulfillment_time: violationData.actual_fulfillment_time,
      violation_minutes: violationData.violation_minutes,
      notes: violationData.notes,
      resolved: false
    }));

    const savedViolations = await SLAViolation.insertMany(violationRecords);
    logger.info(`Recorded ${savedViolations.length} SKU-level SLA violations`);
    
    return savedViolations;
  } catch (error) {
    logger.error("Error recording SKU violations:", error);
    throw error;
  }
}

/**
 * Update order with SLA violation information
 * @param {String} orderId - Order ID
 * @param {Object} violationData - Violation details
 * @returns {Object} Updated order
 */
async function updateOrderWithSLAViolation(orderId, violationData) {
  try {
    const Order = require("../models/order");
    
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        "slaInfo.actualFulfillmentTime": violationData.actual_fulfillment_time,
        "slaInfo.isSLAMet": false,
        "slaInfo.violationMinutes": violationData.violation_minutes,
        "slaInfo.expectedFulfillmentTime": violationData.expected_fulfillment_time
      },
      { new: true }
    );

    logger.info(`Order ${orderId} updated with SLA violation information`);
    return updatedOrder;
  } catch (error) {
    logger.error("Error updating order with SLA violation:", error);
    throw error;
  }
}

module.exports = {
  checkSLAViolationOnPacking,
  checkSKUSLAViolation,
  recordSLAViolation,
  recordSKUViolations,
  updateOrderWithSLAViolation,
  calculateExpectedFulfillmentTime
};
