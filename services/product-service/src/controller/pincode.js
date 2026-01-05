const Pincode = require("../models/pincode");
const { sendSuccess, sendError } = require("/packages/utils/responseHandler");
const logger = require("/packages/utils/logger");
const XLSX = require("xlsx");
// ✅ CREATE PINCODE
// exports.createPincode = async (req, res) => {
//     try {
//         const {
//             pincode,
//             city,
//             state,
//             district,
//             area,
//             delivery_available = true,
//             delivery_charges = 0,
//             estimated_delivery_days = 3,
//             cod_available = true,
//             status = "active",
//             created_by,
//             updated_by
//         } = req.body;

//         // Validate required fields
//         if (!pincode || !city || !state || !district || !created_by || !updated_by) {
//             return sendError(res, "Missing required fields: pincode, city, state, district, created_by, updated_by", 400);
//         }

//         // Check if pincode already exists
//         const existingPincode = await Pincode.findOne({ pincode });
//         if (existingPincode) {
//             return sendError(res, "Pincode already exists", 409);
//         }

//         const newPincode = await Pincode.create({
//             pincode,
//             city,
//             state,
//             district,
//             area,
//             delivery_available,
//             delivery_charges,
//             estimated_delivery_days,
//             cod_available,
//             status,
//             created_by,
//             updated_by
//         });

//         logger.info(`✅ Pincode created successfully: ${pincode}`);
//         sendSuccess(res, newPincode, "Pincode created successfully");

//     } catch (error) {
//         logger.error("❌ Create pincode error:", error);
//         sendError(res, "Failed to create pincode", 500);
//     }
// };

// ✅ GET ALL PINCODES
exports.getAllPincodes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,

      // Search & location
      search,
      city,
      state,
      district,
      area,

      // Availability filters
      delivery_available,
      cod_available,
      shipRocket_availability,
      borzo_standard,
      borzo_endOfDay,

      // Delivery config
      estimated_delivery_days,

      // Status
      status,

      // Sorting
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    // -----------------------------
    // Pagination
    // -----------------------------
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // -----------------------------
    // FILTER BUILDING
    // -----------------------------
    const filter = {};

    // 🔍 Global search
    if (search) {
      filter.$or = [
        { pincode: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
        { district: { $regex: search, $options: "i" } },
        { area: { $regex: search, $options: "i" } },
      ];
    }

    // 📍 Location filters
    if (city) filter.city = { $regex: city, $options: "i" };
    if (state) filter.state = { $regex: state, $options: "i" };
    if (district) filter.district = { $regex: district, $options: "i" };
    if (area) filter.area = { $regex: area, $options: "i" };

    // 🚚 Delivery & COD
    if (delivery_available !== undefined) {
      filter.delivery_available = delivery_available === "true";
    }

    if (cod_available !== undefined) {
      filter.cod_available = cod_available === "true";
    }

    // 🚀 Courier availability
    if (shipRocket_availability !== undefined) {
      filter.shipRocket_availability = shipRocket_availability === "true";
    }

    if (borzo_standard !== undefined) {
      filter["borzo_availability.standard"] = borzo_standard === "true";
    }

    if (borzo_endOfDay !== undefined) {
      filter["borzo_availability.endOfDay"] = borzo_endOfDay === "true";
    }

    // ⏱ Estimated delivery days
    if (estimated_delivery_days) {
      filter.estimated_delivery_days = Number(estimated_delivery_days);
    }

    // 🔄 Status
    if (status) {
      filter.status = status;
    }

    logger.info("🔍 Pincode filter:", filter);

    // -----------------------------
    // SORTING
    // -----------------------------
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // -----------------------------
    // QUERY
    // -----------------------------
    const pincodes = await Pincode.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNumber)
      .lean();
      

    const totalPincodes = await Pincode.countDocuments(filter);

    // -----------------------------
    // PAGINATION META
    // -----------------------------
    const totalPages = Math.ceil(totalPincodes / limitNumber);

    // -----------------------------
    // RESPONSE
    // -----------------------------
    return sendSuccess(
      res,
      {
        pincodes,
        pagination: {
          currentPage: pageNumber,
          totalPages,
          totalItems: totalPincodes,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
          nextPage: pageNumber < totalPages ? pageNumber + 1 : null,
          prevPage: pageNumber > 1 ? pageNumber - 1 : null,
        },
        appliedFilters: {
          search: search || null,
          city: city || null,
          state: state || null,
          district: district || null,
          area: area || null,
          delivery_available: delivery_available ?? null,
          cod_available: cod_available ?? null,
          shipRocket_availability: shipRocket_availability ?? null,
          borzo_standard: borzo_standard ?? null,
          borzo_endOfDay: borzo_endOfDay ?? null,
          estimated_delivery_days: estimated_delivery_days ?? null,
          status: status || null,
          sortBy,
          sortOrder,
        },
      },
      "Pincodes fetched successfully"
    );
  } catch (error) {
    logger.error("❌ Get all pincodes error:", error);
    return sendError(res, "Failed to fetch pincodes", 500);
  }
};


// ✅ GET PINCODE BY ID
exports.getPincodeById = async (req, res) => {
    try {
        const { id } = req.params;

        const pincode = await Pincode.findById(id);
        if (!pincode) {
            return sendError(res, "Pincode not found", 404);
        }

        logger.info(`✅ Pincode fetched successfully: ${pincode.pincode}`);
        sendSuccess(res, pincode, "Pincode fetched successfully");

    } catch (error) {
        logger.error("❌ Get pincode by ID error:", error);
        sendError(res, "Failed to fetch pincode", 500);
    }
};

// ✅ UPDATE PINCODE
// exports.updatePincode = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const updateData = req.body;

//         // Remove fields that shouldn't be updated directly
//         delete updateData._id;
//         delete updateData.created_at;
//         delete updateData.created_by;

//         // Add updated_by if not provided
//         if (!updateData.updated_by) {
//             updateData.updated_by = req.user?.id || 'system';
//         }

//         const pincode = await Pincode.findByIdAndUpdate(
//             id,
//             updateData,
//             { new: true, runValidators: true }
//         );

//         if (!pincode) {
//             return sendError(res, "Pincode not found", 404);
//         }

//         logger.info(`✅ Pincode updated successfully: ${pincode.pincode}`);
//         sendSuccess(res, pincode, "Pincode updated successfully");

//     } catch (error) {
//         logger.error("❌ Update pincode error:", error);
//         sendError(res, "Failed to update pincode", 500);
//     }
// };

// ✅ DELETE PINCODE
exports.deletePincode = async (req, res) => {
    try {
        const { id } = req.params;

        const pincode = await Pincode.findByIdAndDelete(id);
        if (!pincode) {
            return sendError(res, "Pincode not found", 404);
        }

        logger.info(`✅ Pincode deleted successfully: ${pincode.pincode}`);
        sendSuccess(res, { deletedPincode: pincode.pincode }, "Pincode deleted successfully");

    } catch (error) {
        logger.error("❌ Delete pincode error:", error);
        sendError(res, "Failed to delete pincode", 500);
    }
};

// ✅ CHECK PINCODE AVAILABILITY
exports.checkPincode = async (req, res) => {
    try {
        const { pincode } = req.params;

        if (!pincode) {
            return sendError(res, "Pincode is required", 400);
        }

        // Validate pincode format
        if (!/^[1-9][0-9]{5}$/.test(pincode)) {
            return sendError(res, "Invalid pincode format. Must be a 6-digit Indian pincode", 400);
        }

        const pincodeData = await Pincode.findOne({
            pincode,
            status: 'active'
        });

        if (!pincodeData) {
            return sendSuccess(res, {
                available: false,
                pincode,
                message: "Pincode not available for delivery"
            }, "Pincode check completed");
        }
  const available =(pincodeData.borzo_availability.standard || pincodeData.borzo_availability.endOfDay || pincodeData.shipRocket_availability   )
        const response = {
            available: available,
            pincode: pincodeData.pincode,
            city: pincodeData.city,
            state: pincodeData.state,
            district: pincodeData.district,
            area: pincodeData.area,
            borzo_standard: pincodeData.borzo_availability.standard,
            borzo_endOfDay: pincodeData.borzo_availability.endOfDay,
            shipRocket_availability: pincodeData.shipRocket_availability,
            // delivery_available: pincodeData.delivery_available,
            // delivery_charges: pincodeData.delivery_charges,
            // estimated_delivery_days: pincodeData.estimated_delivery_days,
            // cod_available: pincodeData.cod_available,
            status: pincodeData.status,
            message: "Pincode is available for delivery"
        };

        logger.info(`✅ Pincode check completed: ${pincode} - ${response.available ? 'Available' : 'Not Available'}`);
        sendSuccess(res, response, "Pincode check completed");

    } catch (error) {
        logger.error("❌ Check pincode error:", error);
        sendError(res, "Failed to check pincode", 500);
    }
};

// ✅ BULK CREATE PINCODES
exports.bulkCreatePincodes = async (req, res) => {
    try {
        const { pincodes, created_by, updated_by } = req.body;

        if (!pincodes || !Array.isArray(pincodes) || pincodes.length === 0) {
            return sendError(res, "Pincodes array is required", 400);
        }

        if (!created_by || !updated_by) {
            return sendError(res, "created_by and updated_by are required", 400);
        }

        const validPincodes = [];
        const errors = [];

        // Validate each pincode
        for (let i = 0; i < pincodes.length; i++) {
            const pincodeData = pincodes[i];

            try {
                // Check if pincode already exists
                const existingPincode = await Pincode.findOne({ pincode: pincodeData.pincode });
                if (existingPincode) {
                    errors.push({
                        index: i,
                        pincode: pincodeData.pincode,
                        error: "Pincode already exists"
                    });
                    continue;
                }

                // Validate required fields
                if (!pincodeData.pincode || !pincodeData.city || !pincodeData.state || !pincodeData.district) {
                    errors.push({
                        index: i,
                        pincode: pincodeData.pincode || 'N/A',
                        error: "Missing required fields: pincode, city, state, district"
                    });
                    continue;
                }

                // Validate pincode format
                if (!/^[1-9][0-9]{5}$/.test(pincodeData.pincode)) {
                    errors.push({
                        index: i,
                        pincode: pincodeData.pincode,
                        error: "Invalid pincode format"
                    });
                    continue;
                }

                validPincodes.push({
                    ...pincodeData,
                    created_by,
                    updated_by
                });

            } catch (error) {
                errors.push({
                    index: i,
                    pincode: pincodeData.pincode || 'N/A',
                    error: error.message
                });
            }
        }

        // Insert valid pincodes
        let insertedCount = 0;
        if (validPincodes.length > 0) {
            const result = await Pincode.insertMany(validPincodes, { ordered: false });
            insertedCount = result.length;
        }

        const response = {
            totalSubmitted: pincodes.length,
            validPincodes: validPincodes.length,
            insertedCount,
            errorCount: errors.length,
            errors
        };

        logger.info(`✅ Bulk create pincodes completed: ${insertedCount} inserted, ${errors.length} errors`);
        sendSuccess(res, response, "Bulk create pincodes completed");

    } catch (error) {
        logger.error("❌ Bulk create pincodes error:", error);
        sendError(res, "Failed to bulk create pincodes", 500);
    }
};

// ✅ GET PINCODE STATISTICS
exports.getPincodeStats = async (req, res) => {
    try {
        const { state, city, delivery_available } = req.query;

        // Build filter
        const filter = {};
        if (state) filter.state = { $regex: state, $options: 'i' };
        if (city) filter.city = { $regex: city, $options: 'i' };
        if (delivery_available !== undefined) filter.delivery_available = delivery_available === 'true';

        // Get statistics
        const stats = await Pincode.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalPincodes: { $sum: 1 },
                    activePincodes: {
                        $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
                    },
                    inactivePincodes: {
                        $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 1, 0] }
                    },
                    deliveryAvailable: {
                        $sum: { $cond: ["$delivery_available", 1, 0] }
                    },
                    codAvailable: {
                        $sum: { $cond: ["$cod_available", 1, 0] }
                    },
                    avgDeliveryCharges: { $avg: "$delivery_charges" },
                    avgDeliveryDays: { $avg: "$estimated_delivery_days" }
                }
            }
        ]);

        // Get state-wise distribution
        const stateDistribution = await Pincode.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$state",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Get city-wise distribution
        const cityDistribution = await Pincode.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$city",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const response = {
            summary: stats[0] || {
                totalPincodes: 0,
                activePincodes: 0,
                inactivePincodes: 0,
                deliveryAvailable: 0,
                codAvailable: 0,
                avgDeliveryCharges: 0,
                avgDeliveryDays: 0
            },
            distribution: {
                byState: stateDistribution,
                byCity: cityDistribution
            },
            filters: {
                state: state || null,
                city: city || null,
                delivery_available: delivery_available || null
            }
        };

        logger.info(`✅ Pincode statistics fetched successfully`);
        sendSuccess(res, response, "Pincode statistics fetched successfully");

    } catch (error) {
        logger.error("❌ Get pincode statistics error:", error);
        sendError(res, "Failed to fetch pincode statistics", 500);
    }
};


exports.createPincode = async (req, res) => {
  try {
    const {
      pincode,
      city,
      state,
      district,
      area,

      // Optional fields
      borzo_availability,
      shipRocket_availability,
      delivery_available,
      delivery_charges,
      estimated_delivery_days,
      cod_available,
      status,

      created_by,
      updated_by
    } = req.body;

    // -----------------------------
    // Required field validation
    // -----------------------------
    if (!pincode || !city || !state || !district) {
      return sendError(
        res,
        "Missing required fields: pincode, city, state, district",
        400
      );
    }

    // -----------------------------
    // Duplicate check
    // -----------------------------
    const existingPincode = await Pincode.findOne({ pincode });
    if (existingPincode) {
      return sendError(res, "Pincode already exists", 409);
    }

    // -----------------------------
    // Create pincode
    // -----------------------------
    const newPincode = await Pincode.create({
      pincode,
      city,
      state,
      district,
      area,

      borzo_availability: borzo_availability || undefined,
      shipRocket_availability,
      delivery_available,
      delivery_charges,
      estimated_delivery_days,
      cod_available,
      status,

      created_by,
      updated_by: updated_by || created_by
    });

    logger.info(`✅ Pincode created: ${pincode}`);
    return sendSuccess(res, newPincode, "Pincode created successfully");

  } catch (error) {
    logger.error("❌ Create pincode error:", error);
    return sendError(res, error.message || "Failed to create pincode", 500);
  }
};


exports.updatePincode = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // -----------------------------
    // Block protected fields
    // -----------------------------
    delete updateData._id;
    delete updateData.created_at;
    delete updateData.created_by;

    // -----------------------------
    // Set updated_by
    // -----------------------------
    updateData.updated_by =
      updateData.updated_by || req.user?.id || "system";

    // -----------------------------
    // Update
    // -----------------------------
    const updatedPincode = await Pincode.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedPincode) {
      return sendError(res, "Pincode not found", 404);
    }

    logger.info(`✅ Pincode updated: ${updatedPincode.pincode}`);
    return sendSuccess(res, updatedPincode, "Pincode updated successfully");

  } catch (error) {
    logger.error("❌ Update pincode error:", error);
    return sendError(res, error.message || "Failed to update pincode", 500);
  }
};

exports.bulkDeletePincodes = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "IDs array is required", 400);
    }
    await Pincode.deleteMany({ _id: { $in: ids } });
    logger.info(`✅ Pincodes deleted: ${ids.length}`);
    return sendSuccess(res, ids, "Pincodes deleted successfully");
  } catch (error) {
    logger.error("❌ Bulk delete pincodes error:", error);
    return sendError(res, error.message || "Failed to delete pincodes", 500);
  }
};

exports.bulkUploadPincodes = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(
        res,
        "CSV/Excel file is required (field name: file)",
        400
      );
    }

    // Read file buffer
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return sendError(res, "Uploaded file is empty", 400);
    }

    let docs = [];
    let errors = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // header = row 1

      const pincode = String(row.pincode || "").trim();
      const city = String(row.city || "").trim();
      const state = String(row.state || "").trim();
      const district = String(row.district || "").trim();
      const area = String(row.area || "").trim();

      if (!pincode || !city || !state || !district) {
        errors.push({
          row: rowNumber,
          error: "Missing required fields (pincode, city, state, district)",
        });
        skipped++;
        continue;
      }

      // Validate Indian pincode
      if (!/^[1-9][0-9]{5}$/.test(pincode)) {
        errors.push({
          row: rowNumber,
          error: `Invalid pincode format: ${pincode}`,
        });
        skipped++;
        continue;
      }

      docs.push({
        pincode,
        city,
        state,
        district,
        area,

        // delivery_available:
        //   String(row.delivery_available).toLowerCase() === "false"
        //     ? false
        //     : true,

        // delivery_charges: Number(row.delivery_charges || 0),
        // estimated_delivery_days: Number(row.estimated_delivery_days || 3),
        // cod_available:
        //   String(row.cod_available).toLowerCase() === "false" ? false : true,

        shipRocket_availability:
          String(row.shipRocket_availability).toLowerCase() === "true",

        borzo_availability: {
          standard:
            String(row.borzo_standard).toLowerCase() === "true",
          endOfDay:
            String(row.borzo_endOfDay).toLowerCase() === "true",
        },

        status: row.status || "active",
        created_by: row.created_by || "bulk_upload",
        updated_by: row.updated_by || "bulk_upload",
      });
    }

    // Remove duplicates inside file
    const uniqueDocs = docs.filter(
      (v, i, a) =>
        a.findIndex((t) => t.pincode === v.pincode) === i
    );

    // Check existing pincodes in DB
    const existing = await Pincode.find({
      pincode: { $in: uniqueDocs.map((d) => d.pincode) },
    }).select("pincode");

    const existingSet = new Set(existing.map((e) => e.pincode));

    // Exclude already existing pincodes
    const finalDocs = uniqueDocs.filter(
      (d) => !existingSet.has(d.pincode)
    );

    let inserted = 0;
    if (finalDocs.length) {
      const result = await Pincode.insertMany(finalDocs, {
        ordered: false,
      });
      inserted = result.length;
    }

    logger.info(`📦 Bulk pincode upload completed`);

    return sendSuccess(res, {
      totalRows: rows.length,
      inserted,
      skipped: skipped + existingSet.size,
      errors,
    }, "Bulk pincode upload completed");

  } catch (err) {
    logger.error("❌ Bulk pincode upload failed:", err);
    return sendError(res, "Bulk upload failed", 500);
  }
};

exports.getPincodeMetaData = async (req, res) => {
  try {
    // const filter = {
    //   status: "active", // remove this if you want all records
    // };
   const filter = {};
    const [states, districts, cities, areas] = await Promise.all([
      Pincode.distinct("state", filter),
      Pincode.distinct("district", filter),
      Pincode.distinct("city", filter),
      Pincode.distinct("area", {
        ...filter,
        area: { $exists: true, $ne: "" },
      }),
    ]);

    return sendSuccess(
      res,
      {
        states: states.sort(),
        districts: districts.sort(),
        cities: cities.sort(),
        areas: areas.sort(),
      },
      "Pincode metadata fetched successfully"
    );
  } catch (error) {
    logger.error("Get pincode metadata failed:", error);
    return sendError(res, "Failed to fetch pincode metadata");
  }
};

exports.getPincodeByPincode = async (req, res) => {
  try {
    const { pincode } = req.params;

    const pincodeData = await Pincode.findOne({ pincode });
    if (!pincodeData) {
      return sendError(res, "Pincode not found", 404);
    }

    logger.info(`✅ Pincode fetched: ${pincode}`);
    return sendSuccess(res, pincodeData, "Pincode fetched successfully");

  } catch (error) {
    logger.error("❌ Get pincode by pincode error:", error);
    return sendError(res, "Failed to fetch pincode", 500);
  }
};

exports.getAllPincodesNoPagination = async (req, res) => {
  try {
    const pincodes = await Pincode.find({}).lean();

    logger.info(`✅ All pincodes fetched: ${pincodes.length}`);
    return sendSuccess(res, pincodes, "All pincodes fetched successfully");

  } catch (error) {
    logger.error("❌ Get all pincodes no pagination error:", error);
    return sendError(res, "Failed to fetch pincodes", 500);
  }
}
