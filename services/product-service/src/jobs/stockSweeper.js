// jobs/stockSweeper.js
const cron = require("node-cron"); //  npm i node-cron
const mongoose = require("mongoose");
const Product = require("../models/productModel"); // ↳ your schema
const ProductLog = require("../models/productLogs"); // ↳ from earlier
const logger = require("/packages/utils/logger");

const MONGO_URI =
  "mongodb+srv://techdev:dLLlFqu0Wx103dzp@toprisedev.xoptvj9.mongodb.net/?retryWrites=true&w=majority&appName=toprisedev";
const DEFAULT_EXPIRY_MIN = 60 * 168; // 24 h if stock_expiry_rule not set

/* ───────────────────────────── helpers ──────────────────────────── */
const minsAgo = (m) => Date.now() - m * 60_000;

/**
 * Decide if a given product should be out-of-stock.
 * @param {Document} p – mongoose Product doc (lean or full)
 * @param {Number}   nowMs – Date.now() already computed for speed
 */
function computeOOS(p, nowMs) {
  // rule #1 – no dealers array or empty
  if (!Array.isArray(p.available_dealers) || p.available_dealers.length === 0) {
    return true;
  }

  // rule #2 – every dealer fails qty > 0 *or* is stale
  const expiryMin = p.stock_expiry_rule || DEFAULT_EXPIRY_MIN;
  const cutoffMs = nowMs - expiryMin * 60_000;

  const anyFreshInStock = p.available_dealers.some((d) => {
    const qty = d.quantity_per_dealer ?? 0;
    const ts = new Date(d.last_stock_update || 0).getTime();
    return qty > 0 && ts >= cutoffMs;
  });

  return !anyFreshInStock;
}

/* ───────────────────────── scheduled task ───────────────────────── */
async function sweep() {
  const started = Date.now();
  logger.info("🔄 Stock-sweeper tick…");

  const cursor = Product.find(
    {},
    {
      // lean cursor for low RAM
      _id: 1,
      out_of_stock: 1,
      available_dealers: 1,
      stock_expiry_rule: 1,
    }
  )
    .lean()
    .cursor();

  let checked = 0,
    updated = 0,
    logs = [];

  for await (const prod of cursor) {
    checked++;
    const shouldBeOOS = computeOOS(prod, started);

    if (shouldBeOOS !== prod.out_of_stock) {
      // • update only if changed
      await Product.updateOne(
        { _id: prod._id },
        {
          $set: { out_of_stock: shouldBeOOS, updated_at: new Date() },
          $inc: { iteration_number: 1 },
        }
      );

      updated++;
      logs.push({
        job_type: "Stock-Sweep",
        product_ref: prod._id,
        user: "SYSTEM",
        changed_fields: ["out_of_stock"],
        changed_value: [
          {
            field: "out_of_stock",
            old_value: prod.out_of_stock,
            new_value: shouldBeOOS,
          },
        ],
      });
    }
  }

  // bulk-insert logs (if any)
  if (logs.length) await ProductLog.insertMany(logs);

  logger.info(
    `✅ sweep done – checked:${checked}  updated:${updated}  ${
      Date.now() - started
    } ms`
  );
}

/* ─────────────────────────── start-up ───────────────────────────── */
async function startSweeper() {
  await mongoose.connect(MONGO_URI);
  logger.info("🛢️  Mongo connected – stock-sweeper online");

  // run once on boot
  sweep().catch((e) => logger.error("sweep-error:", e));

  // “0 */1 * * * *” = every minute; change to 15 or 30 min in prod
  cron.schedule("0 */15 * * * *", () => sweep().catch(logger.error));
}

/* If this file is run directly: `node jobs/stockSweeper.js` */
if (require.main === module) {
  startSweeper().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { sweep };
