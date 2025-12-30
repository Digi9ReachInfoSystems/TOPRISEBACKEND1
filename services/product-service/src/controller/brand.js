const Brand = require("../models/brand");
const redisClient = require("/packages/utils/redisClient");
const { sendSuccess, sendError } = require("/packages/utils/responseHandler");
const logger = require("/packages/utils/logger");
const { uploadFile } = require("/packages/utils/s3Helper");
const axios = require("axios");
const { createUnicastOrMulticastNotificationUtilityFunction } = require("../../../../packages/utils/notificationService");
const XLSX = require("xlsx");
const stream = require("stream");
const path = require("path");
const unzipper = require("unzipper");
const Type = require("../models/type");
const Product = require("../models/productModel");
const mongoose = require("mongoose");
// ✅ CREATE BRAND
exports.createBrand = async (req, res) => {
  try {
    const {
      brand_name,
      brand_code,
      type,
      created_by,
      updated_by,
      status,
      preview_video,
      featured_brand,
    } = req.body;

    // Check for duplicate brand_name or brand_code
    const existingBrand = await Brand.findOne({
      $or: [
        // { brand_name: brand_name },
        { brand_code: brand_code }
      ]
    });

    if (existingBrand) {
      // if (existingBrand.brand_name === brand_name) {
      //   logger.warn(`Duplicate brand name attempted: ${brand_name}`);
      //   return sendError(res, `Brand with name "${brand_name}" already exists`, 409);
      // }
      if (existingBrand.brand_code === brand_code) {
        logger.warn(`Duplicate brand code attempted: ${brand_code}`);
        return sendError(res, `Brand with code "${brand_code}" already exists`, 409);
      }
    }

    let brand_logo = undefined;

    if (req.file) {
      const uploaded = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        "brands"
      );
      brand_logo = uploaded.Location;
    }

    const newBrand = await Brand.create({
      brand_name,
      brand_code,
      type,
      created_by,
      updated_by,
      brand_logo,
      preview_video,
      featured_brand
      // status,
    });

    // await redisClient.del("brands:all");
    // await redisClient.del(`brands:type:${type}`);
    const userData = await axios.get(`http://user-service:5001/api/users/`, {
      headers: {
        Authorization: req.headers.authorization
      }
    })
    let filteredUsers = userData.data.data.filter(user => user.role === "Super-admin" || user.role === "Inventory-Admin" || user.role === "Inventory-Staff");
    let users = filteredUsers.map(user => user._id);
    const successData = await createUnicastOrMulticastNotificationUtilityFunction(
      users,
      ["INAPP", "PUSH"],
      "Brand Create ALERT",
      `New brand has been created by ${created_by} - ${brand_name}`,
      "",
      "",
      "Brand",
      {
        barand_id: newBrand._id
      },
      req.headers.authorization
    )
    if (!successData.success) {
      logger.error("❌ Create notification error:", successData.message);
    } else {
      logger.info("✅ Notification created successfully");
    }

    logger.info("✅ Brand created successfully");
    sendSuccess(res, newBrand, "Brand created successfully");
  } catch (err) {
    logger.error(`❌ Create brand error: ${err.message}`);
    return sendError(res, err);
  }
};

// ✅ GET ALL BRANDS
exports.getAllBrands = async (req, res) => {
  try {
    const cacheKey = "brands:all";
    const {featured,status} = req.query
    // const cached = await redisClient.get(cacheKey);
    // if (cached) {
    //   logger.info("🔁 Served brands from cache");
    //   return sendSuccess(res, JSON.parse(cached));
    // }
    let featuredFilter={};
    if (featured === "true") {
      featuredFilter = { featured_brand: true };
    } else if (featured === "false") {
      featuredFilter = { featured_brand: false };
    }
    if (status ) {
      featuredFilter = { ...featuredFilter, status: status };
    } 
    const brands = await Brand.find(featuredFilter).populate("type").sort({ created_at: -1 });
    // await redisClient.set(cacheKey, JSON.stringify(brands), "EX", 3600);
    logger.info("✅ Fetched all brands");
    sendSuccess(res, brands);
  } catch (err) {
    logger.error(`❌ Get all brands error: ${err.message}`);
    return sendError(res, err);
  }
};

// ✅ GET BRAND BY ID
exports.getBrandById = async (req, res) => {
  try {
    const { id } = req.params; // Fixed: Changed from brandId to id
    // const cacheKey = `brand:${id}`;
    // const cached = await redisClient.get(cacheKey);
    // if (cached) {
    //   logger.info(`🔁 Served brand ${id} from cache`);
    //   return sendSuccess(res, JSON.parse(cached));
    // }

    const brand = await Brand.findById(id).populate(
      "type created_by updated_by"
    );
    if (!brand) return sendError(res, "Brand not found", 404);

    // await redisClient.set(cacheKey, JSON.stringify(brand), "EX", 3600);
    logger.info(`✅ Fetched brand with ID: ${id}`);
    sendSuccess(res, brand);
  } catch (err) {
    logger.error(`❌ Get brand error: ${err.message}`);
    return sendError(res, err);
  }
};

// ✅ UPDATE BRAND
exports.updateBrand = async (req, res) => {
  try {
    const { id } = req.params; // Fixed: Changed from brandId to id
    const {
      brand_name,
      brand_code,
      brand_description,
      type,
      status,
      updated_by,
      preview_video,
      featured_brand,
    } = req.body;

    // Check if brand exists before updating
    const existingBrand = await Brand.findById(id);
    if (!existingBrand) {
      return sendError(res, "Brand not found", 404);
    }
    
    if(status === 'inactive') {
      await Product.updateMany({ brand: id }, { live_status: 'Rejected' ,Qc_status: 'Rejected' });
    } 

    const updateData = {
      brand_name,
      brand_code,
      brand_description,
      status,
      type,
      updated_by,
      preview_video,
      updated_at: new Date(),
      featured_brand
    };

    if (req.file) {
      const uploaded = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        "brands"
      );
      updateData.brand_logo = uploaded.Location;
    }

    const updatedBrand = await Brand.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!updatedBrand) return sendError(res, "Failed to update brand", 500);
    // await redisClient.del("brands:all");
    // await redisClient.del(`brands:type:${oldBrand.type}`);
    const userData = await axios.get(`http://user-service:5001/api/users/`, {
      headers: {
        Authorization: req.headers.authorization
      }
    })
    let filteredUsers = userData.data.data.filter(user => user.role === "Super-admin" || user.role === "Inventory-Admin" || user.role === "Inventory-Staff");
    let users = filteredUsers.map(user => user._id);
    const successData = await createUnicastOrMulticastNotificationUtilityFunction(
      users,
      ["INAPP", "PUSH"],
      "Brand update ALERT",
      ` Brand has been Updated by ${updated_by} - ${brand_name}`,
      "",
      "",
      "Brand",
      {
        brand_id: id
      },
      req.headers.authorization
    )
    if (!successData.success) {
      logger.error("❌ Create notification error:", successData.message);
    } else {
      logger.info("✅ Notification created successfully");
    }

    logger.info(`✅ Brand updated: ${id}`);
    sendSuccess(res, updatedBrand, "Brand updated successfully");
  } catch (err) {
    logger.error(`❌ Update brand error: ${err.message}`);
    return sendError(res, err);
  }
};

// ✅ DELETE BRAND
exports.deleteBrand = async (req, res) => {
  try {
    const { id } = req.params; // Fixed: Changed from brandId to id
    const deleted = await Brand.findByIdAndDelete(id);

    if (!deleted) return sendError(res, "Brand not found", 404);

    // await redisClient.del("brands:all");
    // await redisClient.del(`brand:${id}`);
    const userData = await axios.get(`http://user-service:5001/api/users/`, {
      headers: {
        Authorization: req.headers.authorization
      }
    })
    let filteredUsers = userData.data.data.filter(user => user.role === "Super-admin" || user.role === "Inventory-Admin" || user.role === "Inventory-Staff");
    let users = filteredUsers.map(user => user._id);
    const successData = await createUnicastOrMulticastNotificationUtilityFunction(
      users,
      ["INAPP", "PUSH"],
      "Brand Delete ALERT",
      ` Brand has been Deleted `,
      "",
      "",
      "Brand",
      {
        brand_id: deleted._id
      },
      req.headers.authorization
    )
    if (!successData.success) {
      logger.error("❌ Create notification error:", successData.message);
    } else {
      logger.info("✅ Notification created successfully");
    }

    logger.info(`🗑️ Deleted brand: ${id}`);
    sendSuccess(res, null, "Brand deleted successfully");
  } catch (err) {
    logger.error(`❌ Delete brand error: ${err.message}`);
    return sendError(res, err);
  }
};
exports.getBrandsByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { featured } = req.query;

    // Build query filter
    const filter = {
      type,
      status: "active", // Only return active brands
    };

    // Add featured filter if provided
    if (featured !== undefined) {
      filter.featured_brand = featured === "true";
    }

    // Perform query
    const brands = await Brand.find(filter)
      .populate("type")
      .sort({ created_at: -1 }) // Sort by newest first
      .limit(100); // Limit to 10 items

    // Handle no results
    if (!brands || brands.length === 0) {
      const message =
        featured !== undefined
          ? `No ${featured === "true" ? "featured" : "non-featured"
          } brands found for type ${type}`
          : `No brands found for type ${type}`;

      return sendError(res, message, 404);
    }

    logger.info(
      `✅ Fetched ${brands.length} brands for type=${type}` +
      (featured !== undefined ? ` with featured=${featured}` : "")
    );

    sendSuccess(res, brands, "Brands fetched successfully");
  } catch (err) {
    logger.error(`❌ Error fetching brands by type: ${err.message}`);
    sendError(res, err);
  }
};

async function streamToBuffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

exports.bulkUploadBrands = async (req, res) => {
  try {
    const excelBuf = req.files?.dataFile?.[0]?.buffer;
    const zipBuf = req.files?.imageZip?.[0]?.buffer;
    if (!excelBuf || !zipBuf) {
      return sendError(res, "Both dataFile & imageZip are required", 400);
    }

    // 1️⃣ Parse CSV
    const wb = XLSX.read(excelBuf, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!rows.length) {
      return sendError(res, "No data found in CSV", 400);
    }

    // 2️⃣ Upload images from ZIP to S3
    const imageMap = {}; // brand_code.toLowerCase() → S3 URL
    let totalZip = 0, imgOk = 0, imgSkip = 0, imgFail = 0;
    const zipStream = stream.Readable.from(zipBuf).pipe(
      unzipper.Parse({ forceStream: true })
    );

    for await (const entry of zipStream) {
      totalZip++;
      if (entry.type === "Directory") {
        imgSkip++;
        entry.autodrain();
        continue;
      }
      const base = path.basename(entry.path);
      const m = base.match(/^(.+?)\.(jpe?g|png|webp)$/i);
      if (!m) {
        imgSkip++;
        entry.autodrain();
        continue;
      }
      const key = m[1].toLowerCase();
      const mime = `image/${m[2].toLowerCase() === "jpg" ? "jpeg" : m[2].toLowerCase()}`;
      try {
        const buf = await streamToBuffer(entry);
        const { Location } = await uploadFile(buf, base, mime, "brand-logos");
        imageMap[key] = Location;
        imgOk++;
      } catch (e) {
        imgFail++;
        console.error(`Image upload failed for ${base}:`, e.message);
      }
    }

    // 3️⃣ Prepare type name → _id map
    const uniqTypes = [...new Set(rows.map(r => String(r.type_name || "").trim()).filter(Boolean))];
    const typeDocs = await Type.find({ type_name: { $in: uniqTypes } });
    const typeMap = new Map(typeDocs.map(t => [t.type_name.trim().toLowerCase(), t._id]));

    // 4️⃣ Build docs
    const docs = [];
    const errors = [];
    for (const row of rows) {
      const typeId = typeMap.get(String(row.type_name || "").trim().toLowerCase());
      if (!typeId) {
        errors.push({ brand_code: row.brand_code, error: `Unknown type: ${row.type_name}` });
        continue;
      }
      docs.push({
        brand_name: row.brand_name,
        featured_brand: String(row.featured_brand).toLowerCase() === "true",
        brand_code: row.brand_code,
        type: typeId,
        created_by: row.created_by || "system",
        updated_by: row.updated_by || "system",
        brand_logo: imageMap[row.brand_code.toLowerCase()] || "",
        preview_video: row.preview_video || "",
        status: row.status || "active",
      });
    }

    if (!docs.length) {
      return sendError(res, "No valid brands to insert", 400);
    }

    // 5️⃣ Insert
    const inserted = await Brand.insertMany(docs, { ordered: false });
    return sendSuccess(res, {
      totalRows: rows.length,
      inserted: inserted.length,
      imgSummary: { total: totalZip, ok: imgOk, skip: imgSkip, fail: imgFail },
      errors
    }, "Brands bulk uploaded successfully");
  } catch (err) {
    console.error("Bulk upload brands error:", err);
    return sendError(res, err.message, 500);
  }
};

// ✅ GET BRAND COUNT
exports.getBrandCount = async (req, res) => {
  try {
    const { status, type, featured_brand } = req.query;

    logger.info(`📊 Fetching brand count with filters - status: ${status}, type: ${type}, featured_brand: ${featured_brand}`);

    // Build filter
    const filter = {};
    if (status) {
      filter.status = status;
    }
    if (type) {
      filter.type = type;
    }
    if (featured_brand !== undefined) {
      filter.featured_brand = featured_brand === 'true';
    }

    logger.info(`🔍 Brand filter applied:`, JSON.stringify(filter, null, 2));

    // Get total count
    const totalCount = await Brand.countDocuments(filter);

    // Get count by status
    const statusBreakdown = await Brand.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get count by type
    const typeBreakdown = await Brand.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get featured vs non-featured count
    const featuredBreakdown = await Brand.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$featured_brand",
          count: { $sum: 1 }
        }
      }
    ]);

    const response = {
      summary: {
        totalBrands: totalCount
      },
      breakdown: {
        byStatus: statusBreakdown.map(item => ({
          status: item._id || 'Unknown',
          count: item.count,
          percentage: totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0
        })),
        byType: typeBreakdown.map(item => ({
          type: item._id,
          count: item.count,
          percentage: totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0
        })),
        byFeatured: featuredBreakdown.map(item => ({
          featured: item._id ? 'Featured' : 'Non-Featured',
          count: item.count,
          percentage: totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0
        }))
      },
      filters: {
        status: status || null,
        type: type || null,
        featured_brand: featured_brand || null
      },
      generatedAt: new Date()
    };

    logger.info(`✅ Brand count fetched successfully - Total brands: ${totalCount}`);
    sendSuccess(res, response, "Brand count fetched successfully");

  } catch (error) {
    logger.error("❌ Get brand count failed:", error);
    sendError(res, "Failed to get brand count", 500);
  }
};


exports.activateOrDeactivateBrand = async (req, res) => {
  try {
    const { id } = req.params;
    // const { status } = req.body;
    const brand = await Brand.findById(id);
    if (!brand) {
      return sendError(res, "Brand not found", 404);
    }
    let status ;
    if(brand.status === 'active') {
      status = 'inactive';
    }else{
      status = 'active';
    }
    brand.status = status;
    const updatedBrand = await brand.save();
    if(status === 'inactive') {
      await Product.updateMany({ brand: id }, { live_status: 'Rejected' ,Qc_status: 'Rejected' });
    } 
    sendSuccess(res, updatedBrand, "Brand status updated successfully");
  } catch (error) {
    logger.error("❌ Update brand status failed:", error);
    sendError(res, "Failed to update brand status", 500);
  }
};

exports.getBrandByName = async (req, res) => {
  try {
    const { name } = req.params;
    const brand = await Brand.findOne({ brand_name: name }).populate(
      "type created_by updated_by"
    );
    if (!brand) return sendError(res, "Brand not found", 404);

    logger.info(`✅ Fetched brand with Name: ${name}`);
    sendSuccess(res, brand);
  } catch (err) {
    logger.error(`❌ Get brand by name error: ${err.message}`);
    return sendError(res, err);
  }
};


exports.getBrandsByDealerID = async (req, res) => {
  try {
    const { dealerId,type } = req.params;
    //fetch dealer details from user service 
     const userData = await axios.get(`http://user-service:5001/api/users/dealer/${dealerId}`, {
      headers: {
        Authorization: req.headers.authorization
      }
    })
    if(!userData.data.data){
      return sendError(res, "Dealer not found", 404);
    }
    const dealerBrandIds = userData.data.data.brands_allowed || [];
    //convert string ids to ObjectIds
    const dealerObjectIds = dealerBrandIds.map(id =>  new mongoose.Types.ObjectId(id));

    const brands = await Brand.find({ _id: { $in: dealerObjectIds } , status: 'active',type}).populate("type").sort({ created_at: -1 });

    logger.info(`✅ Fetched brands for Dealer ID: ${dealerId}`);
    sendSuccess(res, brands);
  } catch (err) {
    logger.error(`❌ Get brands by dealer ID error: ${err.message}`);
    return sendError(res, err);
  }
};