const User = require("../models/user");
const Dealer = require("../models/dealer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const admin = require("firebase-admin");
const { sendSuccess, sendError } = require("/packages/utils/responseHandler");
const logger = require("/packages/utils/logger");
const redisClient = require("/packages/utils/redisClient");
const mongoose = require("mongoose");
const Employee = require("../models/employee");
const ObjectId = mongoose.Types.ObjectId;
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const csv = require("csv-parser");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const streamifier = require("streamifier");
const axios = require("axios");
const PasswordReset = require("../models/PasswordReset");
const crypto = require("crypto");
const auditLogger = require("../../../../packages/utils/auditLoggerMiddleware");

// Helper function to fetch SLA type information from order service
async function fetchSLATypeInfo(slaTypeId, authorizationHeader) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (authorizationHeader) {
      headers.Authorization = authorizationHeader;
    }

    const response = await axios.get(
      `http://order-service:5002/api/orders/sla/types/${slaTypeId}`,
      { timeout: 5000, headers }
    );

    return response.data?.data || null;
  } catch (error) {
    logger.warn(
      `Failed to fetch SLA type info for ${slaTypeId}:`,
      error.message
    );
    return null;
  }
}

// Helper function to fetch dealer SLA configuration from order service
async function fetchDealerSLAConfig(dealerId, authorizationHeader) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (authorizationHeader) {
      headers.Authorization = authorizationHeader;
    }

    const response = await axios.get(
      `http://order-service:5002/api/orders/dealers/${dealerId}/sla`,
      { timeout: 5000, headers }
    );

    return response.data?.data || null;
  } catch (error) {
    logger.warn(
      `Failed to fetch dealer SLA config for ${dealerId}:`,
      error.message
    );
    return null;
  }
}

// Helper function to fetch SLA violations for a dealer from order service
async function fetchDealerSLAViolations(
  dealerId,
  authorizationHeader,
  limit = 10
) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (authorizationHeader) {
      headers.Authorization = authorizationHeader;
    }

    const response = await axios.get(
      `http://order-service:5002/api/orders/sla/violations/summary/${dealerId}?limit=${limit}`,
      { timeout: 5000, headers }
    );

    return response.data?.data || null;
  } catch (error) {
    logger.warn(
      `Failed to fetch SLA violations for dealer ${dealerId}:`,
      error.message
    );
    return null;
  }
}

const {
  createUnicastOrMulticastNotificationUtilityFunction,
  sendEmailNotifiation,
} = require("../../../../packages/utils/notificationService");
const {
  welcomeEmail,
  resetPassword,
} = require("../../../../packages/utils/email_templates/email_templates");
const generateJWT = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6IjE3NzMxNzdlODhlZTFiZTMyNWZiMzkyZDZkMDU3MGVkIn0.e30.Om3KOQDXsSvrY8I7BBABYugTo25IadUd7wF1LIgjv8VlDyNYsaXI_t4rPYcZgiMd8JxfS2y2hlQRc86S3Y_vEA",
    { expiresIn: "30d" }
  );
};

exports.signupUser = async (req, res) => {
  try {
    const { firebaseToken, role } = req.body;

    if (!firebaseToken || !role) {
      return sendError(res, "firebaseToken and role are required", 400);
    }

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const phone_Number = decodedToken.phone_number;
    // const email = decodedToken.email || ""; // optional, fallback to empty

    if (!phone_Number) {
      return sendError(res, "Phone number not found in Firebase token", 400);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone_Number });
    if (existingUser) return sendError(res, "User already exists", 400);

    // Create user
    const user = await User.create({
      // email,
      phone_Number,
      role,
    });

    const token = generateJWT(user);
    logger.info(`✅ User created: ${phone_Number}`);
    sendSuccess(res, { user, token }, "User created successfully");
  } catch (err) {
    logger.error(`❌ Signup error: ${err.message}`);
    sendError(res, err);
  }
};

exports.createUser = async (req, res) => {
  try {
    const { email, password, username, phone_Number, role } = req.body;

    // Verify Firebase token
    // const email = decodedToken.email || ""; // optional, fallback to empty

    if (!phone_Number) {
      return sendError(res, "Phone number not found in Firebase token", 400);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, "User already exists", 400);

    // Create user
    const user = await User.create({
      email,
      password,
      username,
      phone_Number,
      role,
    });
    const htmlTemplate = await welcomeEmail(
      username,
      email,
      password,
      "www.toprise.in",
      "company Phone ",
      "company Email",
      "www.Toprise.in"
    );
    const sendData = await sendEmailNotifiation(
      email,
      "Welcome to Toprise",
      htmlTemplate
    );
    const token = generateJWT(user);
    logger.info(`✅ User created: ${phone_Number}`);
    sendSuccess(res, { user, token }, "User created successfully");
  } catch (err) {
    logger.error(`❌ Signup error: ${err.message}`);
    sendError(res, err);
  }
};

exports.createUser1 = async (req, res) => {
  try {
    const { email, password, username, phone_Number, role } = req.body;

    // Verify Firebase token
    // const email = decodedToken.email || ""; // optional, fallback to empty

    if (!phone_Number) {
      return sendError(res, "Phone number not found in Firebase token", 400);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, "User already exists", 400);

    // Create user
    const user = await User.create({
      email,
      password,
      username,
      phone_Number,
      role,
    });
    const htmlTemplate = await welcomeEmail(
      username,
      email,
      password,
      "www.toprise.in",
      "company Phone ",
      "company Email",
      "www.Toprise.in"
    );
    const sendData = await sendEmailNotifiation(
      email,
      "Welcome to Toprise",
      htmlTemplate
    );
    const token = generateJWT(user);
    logger.info(`✅ User created: ${phone_Number}`);
    sendSuccess(res, { user, token }, "User created successfully");
  } catch (err) {
    logger.error(`❌ Signup error: ${err.message}`);
    sendError(res, err);
  }
};
//only use firebaserToken
exports.loginUserForMobile = async (req, res) => {
  try {
    const { firebaseToken } = req.body;

    if (!firebaseToken) {
      return sendError(res, "Firebase token is required", 400);
    }

    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    console.log(decodedToken);
    const firebaseEmail = decodedToken.phone_number;

    const firebaseUser = await User.findOne({ phone_Number: firebaseEmail });
    if (!firebaseUser) return sendError(res, "User not found", 404);

    // ✅ Update last_login timestamp
    firebaseUser.last_login = new Date();
    await firebaseUser.save();

    const token = generateJWT(firebaseUser);
    logger.info(`✅ Firebase login: ${firebaseEmail}`);
    const successData =
      await createUnicastOrMulticastNotificationUtilityFunction(
        [firebaseUser._id],
        ["INAPP", "PUSH"],
        "LOGIN ALERT",
        "You have logged in successfully",
        "",
        "",
        "Bearer " + token
      );
    if (!successData.success) {
      logger.error("❌ Create notification error:", successData.message);
    } else {
      logger.info("✅ Notification created successfully");
    }

    return sendSuccess(res, { user: firebaseUser, token }, "Login successful");
  } catch (err) {
    try {
      auditLogger("Login_Failed_user", "USER");
    } catch (err) {
      console.log(err);
    }
    logger.error(`❌ Firebase login error: ${err.message}`);
    sendError(res, err);
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const cacheKey = "users:all";
    // const cached = await redisClient.get(cacheKey);
    // if (cached) {
    //   logger.info("Serving users from cache");
    //   return sendSuccess(res, JSON.parse(cached));
    // }

    const users = await User.find();
    // await redisClient.setEx(cacheKey, 60 * 5, JSON.stringify(users)); // cache for 5 minutes
    logger.info("Fetched all users from DB");
    sendSuccess(res, users);
  } catch (err) {
    logger.error(`Fetch users error: ${err.message}`);
    sendError(res, err);
  }
};

async function fetchUser(userId) {
  try {
    const { data } = await axios.get(`${USER_SERVICE_URL}/${userId}`);
    return data.data || null;
  } catch (e) {
    return null;
  }
}

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    // const cacheKey = `users:${id}`;
    // const cached = await redisClient.get(cacheKey);
    // if (cached) {
    //   logger.info(`Serving user ${id} from cache`);
    //   return sendSuccess(res, JSON.parse(cached));
    // }

    const user = await User.findById(id);
    if (!user) return sendError(res, "User not found", 404);

    // await redisClient.setEx(cacheKey, 60 * 5, JSON.stringify(user));
    logger.info(`Fetched user: ${id}`);
    sendSuccess(res, user);
  } catch (err) {
    logger.error(`Get user error: ${err.message}`);
    sendError(res, err);
  }
};
// exports.getUserById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const user = await User.findById(id).lean();
//     if (!user) return sendError(res, "User not found", 404);

//     const vehicles = user.vehicle_details || [];

//     // Enrich each vehicle with metadata by calling product-service individually
//     const enrichedVehicles = await Promise.all(
//       vehicles.map(async (v) => {
//         const brandId = v.brand;
//         const modelId = v.model;
//         const variantId = v.variant;

//         if (!brandId && !modelId && !variantId) return v;

//         try {
//           const { data } = await axios.get(
//             "http://product-service:5001/products/v1/getVehicleDetails",
//             {
//               params: {
//                 brandId,
//                 modelId,
//                 variantId,
//               },
//             }
//           );

//           return {
//             ...v,
//             brand_details: data.brand || {},
//             model_details: data.model || {},
//             variant_details: data.variant || {},
//           };
//         } catch (err) {
//           logger.warn(
//             `Failed to fetch vehicle details for brand=${brandId}, model=${modelId}, variant=${variantId}: ${err.message}`
//           );
//           return v;
//         }
//       })
//     );

//     user.vehicle_details = enrichedVehicles;

//     logger.info(`Fetched user: ${id}`);
//     sendSuccess(res, user);
//   } catch (err) {
//     logger.error(`Get user error: ${err.message}`);
//     sendError(res, err.message || "Internal server error");
//   }
// };

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return sendError(res, "User not found", 404);
    logger.info(`Deleted user: ${req.params.id}`);
    sendSuccess(res, null, "User deleted");
  } catch (err) {
    logger.error(`Delete user error: ${err.message}`);
    sendError(res, err);
  }
};

exports.revokeRole = async (req, res) => {
  try {
    const { id } = req.params;

    // The id parameter is always an employee ID
    const employee = await Employee.findById(id);

    if (!employee) {
      return sendError(res, "Employee not found", 404);
    }

    // Check if employee is already inactive
    if (!employee.active) {
      return sendError(res, "Employee role is already revoked", 400);
    }

    // Store original employee data for response
    const originalEmployeeData = {
      employee_id: employee.employee_id,
      First_name: employee.First_name,
      email: employee.email,
      role: employee.role,
      assigned_dealers: employee.assigned_dealers,
      assigned_regions: employee.assigned_regions,
      last_login: employee.last_login,
      created_at: employee.created_at,
      updated_at: employee.updated_at
    };

    // Only update the active field to false - DO NOT change the role
    const updatedEmployee = await Employee.findByIdAndUpdate(
      employee._id,
      {
        active: false,
        updated_at: new Date()
      },
      { new: true }
    );

    logger.info(
      `✅ Employee role revoked (active=false) for: ${employee.employee_id} (${employee.First_name}) - Role preserved: ${employee.role}`
    );

    sendSuccess(
      res,
      {
        message: "Employee role revoked successfully",
        employee: {
          _id: updatedEmployee._id,
          employee_id: updatedEmployee.employee_id,
          First_name: updatedEmployee.First_name,
          email: updatedEmployee.email,
          role: updatedEmployee.role, // Role is preserved, not changed
          active: updatedEmployee.active,
          revoked_at: updatedEmployee.updated_at,
          original_data: originalEmployeeData
        }
      },
      "Role revoked successfully - only active field changed"
    );
  } catch (err) {
    logger.error(`❌ Revoke role error: ${err.message}`);
    sendError(res, err);
  }
};
exports.createDealer = async (req, res) => {
  try {
    const {
      email,
      password,
      phone_Number,
      legal_name,
      trade_name,
      GSTIN,
      Pan,
      Address,
      contact_person,
      brands_allowed,
      categories_allowed,
      upload_access_enabled,
      default_margin,
      last_fulfillment_date,
      assigned_Toprise_employee,
      SLA_type,
      dealer_dispatch_time,
      onboarding_date,
      serviceable_pincodes,
      remarks,
    } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, "User already exists", 400);

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password: hashedPassword,
      phone_Number,
      role: "Dealer",
    });

    const dealer = await Dealer.create({
      user_id: user._id,
      legal_name,
      trade_name,
      GSTIN,
      Pan,
      Address,
      contact_person,
      dealerId: uuidv4(),
      categories_allowed,
      upload_access_enabled,
      default_margin,
      brands_allowed,
      last_fulfillment_date,
      assigned_Toprise_employee,
      SLA_type,
      dealer_dispatch_time,
      onboarding_date,
      serviceable_pincodes,
      remarks,
    });
    //update assigned employee with dealer id make sure noy to duplicate assigned dealers
    assigned_Toprise_employee.forEach(async (employee) => {
      await Employee.findByIdAndUpdate(employee.assigned_user, {
        $addToSet: { assigned_dealers: dealer._id },
      });
    })

    logger.info(`✅ Dealer created for user: ${email}`);
    sendSuccess(res, { user, dealer }, "Dealer created successfully");
  } catch (err) {
    logger.error(`❌ Create dealer error: ${err.message}`);
    sendError(res, err);
  }
};
exports.updateDealer = async (req, res) => {
  try {
    const { id } = req.params;
    const dealerData = await Dealer.findById(id);

    if (req.body.assigned_Toprise_employee) {



      //remove dealer from employee
      dealerData.assigned_Toprise_employee.forEach(async (employee) => {
        await Employee.findByIdAndUpdate(employee.assigned_user, {
          $pull: { assigned_dealers: id },
        });
      })
    }
    const updatedDealer = await Dealer.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (req.body.assigned_Toprise_employee) {
      //update assigned employee with dealer id make sure noy to duplicate assigned dealers
      req.body.assigned_Toprise_employee.forEach(async (employee) => {
        await Employee.findByIdAndUpdate(employee.assigned_user, {
          $addToSet: { assigned_dealers: id },
        });
      })
    }
    // check for brand change- removed brandids
    const removedBrands = dealerData.brands_allowed.filter(
      (brand) => !req.body.brands_allowed.includes(brand)
    )
    console.log("removedBrands", removedBrands);
    // call the api in product service put api to reomove
    if (removedBrands.length > 0) {
      const result = await axios.put(`http://product-service:5001/products/v1/remove/delar/bybrandIds`, {
        dealerId: id,
        brandIds: removedBrands
      });
      console.log("result", result.data);
    }


    if (!updatedDealer) return sendError(res, "Dealer not found", 404);
    logger.info(`Updated dealer: ${id}`);
    sendSuccess(res, updatedDealer, "Dealer updated successfully");
  } catch (err) {
    logger.error(`Update dealer error: ${err.message}`);
    sendError(res, err);
  }
};

exports.getAllDealers = async (req, res) => {
  try {
    const { includeSLAInfo = false } = req.query;
    const authorizationHeader = req.headers.authorization;

    // const cacheKey = "dealers:all";

    // const cached = await redisClient.get(cacheKey);
    // if (cached) {
    //   logger.info("Serving dealers from cache");
    //   return sendSuccess(res, JSON.parse(cached));
    // }

    const dealers = await Dealer.find()
      .populate("user_id", "email phone_Number role")
      .populate({
        path: "assigned_Toprise_employee.assigned_user",
        model: "Employee",
        populate: {
          path: "user_id",
          model: "User",
          select: "email username phone_Number role",
        },
      });

    // Transform the dealers data to include employee details
    let transformedDealers = dealers.map((dealer) => {
      const dealerObj = dealer.toObject();

      if (
        dealerObj.assigned_Toprise_employee &&
        dealerObj.assigned_Toprise_employee.length > 0
      ) {
        dealerObj.assigned_Toprise_employee =
          dealerObj.assigned_Toprise_employee.map((assignment) => {
            if (assignment.assigned_user) {
              return {
                ...assignment,
                employee_details: {
                  _id: assignment.assigned_user._id,
                  employee_id: assignment.assigned_user.employee_id,
                  First_name: assignment.assigned_user.First_name,
                  profile_image: assignment.assigned_user.profile_image,
                  mobile_number: assignment.assigned_user.mobile_number,
                  email: assignment.assigned_user.email,
                  role: assignment.assigned_user.role,
                  user_details: assignment.assigned_user.user_id,
                },
              };
            }
            return assignment;
          });
      }

      return dealerObj;
    });

    // Fetch SLA information if requested
    if (includeSLAInfo === "true") {
      try {
        // Fetch SLA information for all dealers in parallel
        const slaPromises = transformedDealers.map(async (dealer) => {
          try {
            // Fetch SLA type information
            if (dealer.SLA_type) {
              const slaTypeInfo = await fetchSLATypeInfo(
                dealer.SLA_type,
                authorizationHeader
              );
              dealer.sla_type_details = slaTypeInfo;
            }

            // Fetch dealer SLA configuration
            const dealerSLAConfig = await fetchDealerSLAConfig(
              dealer.dealerId,
              authorizationHeader
            );
            if (dealerSLAConfig) {
              dealer.sla_configuration = dealerSLAConfig;
            }

            // Fetch recent SLA violations (limit to 3 for list view)
            const slaViolations = await fetchDealerSLAViolations(
              dealer.dealerId,
              authorizationHeader,
              3
            );
            if (slaViolations) {
              dealer.recent_sla_violations = slaViolations;
            }

            // Add SLA summary information
            dealer.sla_summary = {
              sla_type: dealer.SLA_type,
              sla_type_details: dealer.sla_type_details,
              dispatch_hours: dealer.dispatch_hours,
              sla_max_dispatch_time: dealer.SLA_max_dispatch_time,
              sla_configuration: dealer.sla_configuration,
              recent_violations_count:
                dealer.recent_sla_violations?.length || 0,
            };

            return dealer;
          } catch (slaError) {
            logger.warn(
              `Failed to fetch SLA information for dealer ${dealer.dealerId}:`,
              slaError.message
            );
            return dealer; // Return dealer without SLA info
          }
        });

        transformedDealers = await Promise.all(slaPromises);
      } catch (slaError) {
        logger.warn(
          `Failed to fetch SLA information for dealers:`,
          slaError.message
        );
        // Continue without SLA info rather than failing the entire request
      }
    }

    // await redisClient.setEx(cacheKey, 300, JSON.stringify(transformedDealers));
    logger.info("Fetched all dealers with employee and SLA information");
    sendSuccess(res, transformedDealers);
  } catch (err) {
    logger.error(`Fetch dealers error: ${err.message}`);
    sendError(res, err);
  }
};

exports.getDealerById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeSLAInfo = false } = req.query;
    const authorizationHeader = req.headers.authorization;
    // const cacheKey = `dealers:${id}`;
    // const cached = await redisClient.get(cacheKey);
    // if (cached) {
    //   logger.info(`Serving dealer ${id} from cache`);
    //   return sendSuccess(res, JSON.parse(cached));
    // }

    const dealer = await Dealer.findById(id)
      .populate("user_id", "email phone_Number role")
      .populate({
        path: "assigned_Toprise_employee.assigned_user",
        model: "Employee",
        populate: {
          path: "user_id",
          model: "User",
          select: "email username phone_Number role",
        },
      });

    if (!dealer) return sendError(res, "Dealer not found", 404);

    // Transform the assigned_Toprise_employee data to include employee details
    const transformedDealer = dealer.toObject();

    if (
      transformedDealer.assigned_Toprise_employee &&
      transformedDealer.assigned_Toprise_employee.length > 0
    ) {
      transformedDealer.assigned_Toprise_employee =
        transformedDealer.assigned_Toprise_employee.map((assignment) => {
          if (assignment.assigned_user) {
            return {
              ...assignment,
              employee_details: {
                _id: assignment.assigned_user._id,
                employee_id: assignment.assigned_user.employee_id,
                First_name: assignment.assigned_user.First_name,
                profile_image: assignment.assigned_user.profile_image,
                mobile_number: assignment.assigned_user.mobile_number,
                email: assignment.assigned_user.email,
                role: assignment.assigned_user.role,
                user_details: assignment.assigned_user.user_id,
              },
            };
          }
          return assignment;
        });
    }

    // Fetch SLA information if requested
    if (includeSLAInfo === "true") {
      try {
        // Fetch SLA type information
        if (transformedDealer.SLA_type) {
          const slaTypeInfo = await fetchSLATypeInfo(
            transformedDealer.SLA_type,
            authorizationHeader
          );
          transformedDealer.sla_type_details = slaTypeInfo;
        }

        // Fetch dealer SLA configuration
        const dealerSLAConfig = await fetchDealerSLAConfig(
          transformedDealer.dealerId,
          authorizationHeader
        );
        if (dealerSLAConfig) {
          transformedDealer.sla_configuration = dealerSLAConfig;
        }

        // Fetch recent SLA violations
        const slaViolations = await fetchDealerSLAViolations(
          transformedDealer.dealerId,
          authorizationHeader,
          5
        );
        if (slaViolations) {
          transformedDealer.recent_sla_violations = slaViolations;
        }

        // Add SLA summary information
        transformedDealer.sla_summary = {
          sla_type: transformedDealer.SLA_type,
          sla_type_details: transformedDealer.sla_type_details,
          dispatch_hours: transformedDealer.dispatch_hours,
          sla_max_dispatch_time: transformedDealer.SLA_max_dispatch_time,
          sla_configuration: transformedDealer.sla_configuration,
          recent_violations_count:
            transformedDealer.recent_sla_violations?.length || 0,
        };
      } catch (slaError) {
        logger.warn(
          `Failed to fetch SLA information for dealer ${id}:`,
          slaError.message
        );
        // Continue without SLA info rather than failing the entire request
      }
    }

    // Fetch category names from product service if categories_allowed exist
    if (
      transformedDealer.categories_allowed &&
      transformedDealer.categories_allowed.length > 0
    ) {
      try {
        logger.info(
          `Fetching categories for dealer ${id} (user_id: ${transformedDealer.user_id}) with entries:`,
          transformedDealer.categories_allowed
        );

        // Split into ObjectId-like and name/code entries
        const allowed = transformedDealer.categories_allowed;
        const idCandidates = allowed.filter((v) => {
          try {
            return require("mongoose").Types.ObjectId.isValid(v);
          } catch (_) {
            return false;
          }
        });
        const nameOrCodeCandidates = allowed.filter(
          (v) => !idCandidates.includes(v)
        );

        const headers = { "Content-Type": "application/json" };

        // Fetch by IDs in bulk
        let categoriesById = {};
        if (idCandidates.length > 0) {
          try {
            const byIdsResp = await axios.post(
              "http://product-service:5002/api/category/bulk-by-ids",
              { ids: idCandidates, user_id: transformedDealer.user_id },
              { timeout: 10000, headers }
            );
            const arr = byIdsResp?.data?.data || [];
            categoriesById = arr.reduce((acc, c) => {
              if (c && c._id) acc[String(c._id)] = c;
              return acc;
            }, {});
          } catch (e) {
            logger.warn(`bulk-by-ids fetch failed for dealer ${id}: ${e.message}`);
          }
        }

        // Fetch all categories to resolve name/code matches
        let allCategories = [];
        try {
          const allResp = await axios.get(
            "http://product-service:5002/api/category",
            { timeout: 10000, headers }
          );
          allCategories = allResp?.data?.data || [];
        } catch (e) {
          logger.warn(`GET all categories failed for dealer ${id}: ${e.message}`);
        }

        const findByNameOrCode = (val) =>
          allCategories.find(
            (cat) =>
              cat?.category_name?.trim()?.toLowerCase() ===
              String(val).trim().toLowerCase() ||
              cat?.category_code?.trim()?.toLowerCase() ===
              String(val).trim().toLowerCase()
          );

        // Build assigned_categories array preserving original entries
        transformedDealer.assigned_categories = allowed.map((entry) => {
          const isId = idCandidates.includes(entry);
          const fromId = isId ? categoriesById[String(entry)] : null;
          const fromName = !fromId ? findByNameOrCode(entry) : null;
          const category = fromId || fromName || null;

          return {
            _id: category?._id || entry,
            category_name: category?.category_name || String(entry),
            category_code: category?.category_code || String(entry),
            category_Status: category?.category_Status || "Active",
            main_category: category?.main_category || false,
          };
        });

        logger.info(
          `Final assigned_categories for dealer ${id}:`,
          JSON.stringify(transformedDealer.assigned_categories, null, 2)
        );
      } catch (categoryError) {
        logger.warn(
          `Error fetching category details for dealer ${id}:`,
          categoryError.message
        );
        // Fallback: create assigned_categories with just entries
        transformedDealer.assigned_categories =
          transformedDealer.categories_allowed.map((entry) => ({
            _id: entry,
            category_name: String(entry),
          }));
      }
    } else {
      transformedDealer.assigned_categories = [];
    }

    // await redisClient.setEx(cacheKey, 300, JSON.stringify(transformedDealer));
    logger.info(
      `Fetched dealer by ID: ${id} with employee, SLA information, and category details`
    );
    sendSuccess(res, transformedDealer);
  } catch (err) {
    logger.error(`Get dealer by ID error: ${err.message}`);
    sendError(res, err);
  }
};

exports.editAddress = async (req, res) => {
  try {
  } catch { }
};

exports.updateUserAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { address } = req.body;

    if (!Array.isArray(address)) {
      return sendError(res, "Address must be an array of address objects", 400);
    }

    // Get current user to check existing addresses
    const currentUser = await User.findById(id);
    if (!currentUser) return sendError(res, "User not found", 404);

    // Prepare new addresses with auto-incremented indexes
    const newAddresses = address.map((addr, i) => ({
      ...addr,
      // Start indexing from current length or continue sequence
      index: currentUser.address.length + i,
    }));

    // Update user with new addresses
    const user = await User.findByIdAndUpdate(
      id,
      { $push: { address: { $each: newAddresses } } },
      { new: true }
    );
    const successData =
      await createUnicastOrMulticastNotificationUtilityFunction(
        [user._id],
        ["INAPP", "PUSH"],
        "ADDRESS UPDATE ALERT",
        "Address has added successfully",
        "",
        "",
        req.headers.authorization
      );
    if (!successData.success) {
      logger.error("❌ Create notification error:", successData.message);
    } else {
      logger.info("✅ Notification created successfully");
    }
    logger.info(`✅ Updated address for user: ${id}`);
    sendSuccess(res, user, "Address updated successfully");
  } catch (err) {
    logger.error(`❌ Update address error: ${err.message}`);
    sendError(res, "Failed to update address", 500);
  }
};

exports.loginUserForDashboard = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Debug logging
    logger.info(`🔍 Login attempt for email: ${email}`);
    logger.info(`🔍 Password provided: ${password ? 'Yes' : 'No'}`);

    // Validate required fields
    if (!email || !password) {
      logger.warn(`❌ Missing credentials - Email: ${email ? 'Yes' : 'No'}, Password: ${password ? 'Yes' : 'No'}`);
      return sendError(res, "Email and password are required", 400);
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      logger.warn(`❌ User not found for email: ${email}`);
      return sendError(res, "Invalid credentials", 401);
    }

    // Debug logging for user password
    logger.info(`🔍 User found: ${user._id}, Password field exists: ${user.password ? 'Yes' : 'No'}`);

    // Check if user has a password (some users might not have passwords if created via social login)
    if (!user.password) {
      logger.warn(`❌ User ${email} has no password set`);
      return sendError(res, "No password set for this account. Please use password reset or contact support.", 401);
    }

    // Validate password
    try {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        logger.warn(`❌ Password mismatch for user: ${email}`);
        return sendError(res, "Invalid credentials", 401);
      }
      try {
        auditLogger("Login_Failed_admin", "USER");
      } catch (err) {
        console.log(err);
      }
    } catch (bcryptError) {
      try {
        auditLogger("Login_Failed_admin", "USER");
      } catch (err) {
        console.log(err);
      }
      logger.error(`❌ Bcrypt comparison error for user ${email}:`, bcryptError.message);
      logger.error(`❌ Password type: ${typeof password}, User password type: ${typeof user.password}`);
      return sendError(res, "Authentication error. Please try again.", 500);
    }

    // Check if user is an employee and if their account is active
    // Handle potential duplicate Employee docs by evaluating all linked records
    const employees = await Employee.find({ user_id: user._id }).select("_id employee_id active updated_at user_id");
    if (employees && employees.length > 0) {
      const anyActive = employees.some((e) => e.active === true);
      const allInactive = employees.every((e) => e.active === false);

      logger.info(
        `🔎 Employee link check for user ${user._id}: total=${employees.length}, anyActive=${anyActive}, allInactive=${allInactive}`
      );

      if (allInactive) {
        const latest = employees
          .slice()
          .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
        logger.warn(
          `❌ Login attempt by inactive employee: ${email} (Latest Employee ID: ${latest?.employee_id || "N/A"})`
        );
        return sendError(
          res,
          "Your account has been deactivated. Please contact your administrator.",
          403
        );
      }
      // If at least one linked employee is active, allow login to proceed
    }

    // ✅ Update last_login timestamp
    user.last_login = new Date();
    await user.save();

    // ✅ Generate the token
    const token = generateJWT(user);

    const successData =
      await createUnicastOrMulticastNotificationUtilityFunction(
        [user._id],
        ["INAPP", "EMAIL", "PUSH"],
        "LOGIN ALERT",
        "You have logged in successfully",
        "",
        "",
        "Bearer " + token
      );
    if (!successData.success) {
      logger.error("❌ Create notification error:", successData.message);
    } else {
      logger.info("✅ Notification created successfully");
    }
    logger.info(`✅ User logged in: ${email}`);
    sendSuccess(res, { user, token }, "Login successful");
  } catch (err) {
    logger.error(`❌ Login error: ${err.message}`);
    sendError(res, err);
  }
};

exports.mapCategoriesToUser = async (req, res) => {
  try {
    const { dealer_id, category_ids } = req.body;

    const user = await User.findById(dealer_id);
    if (!user) return sendError(res, "User not found", 404);

    user.assigned_categories = category_ids;
    await user.save();

    logger.info(`✅ Updated user ${dealer_id} with assigned categories`);
    sendSuccess(res, user, "Assigned categories to user successfully");
  } catch (err) {
    logger.error(`❌ Failed to assign categories to user: ${err.message}`);
    sendError(res, err);
  }
};

exports.checkUserAccountCreated = async (req, res) => {
  try {
    const { phone_Number } = req.body;

    if (!phone_Number) {
      return sendError(res, "Phone number is required", 400);
    }

    const user = await User.findOne({ phone_Number });

    if (user) {
      logger.info(`✅ User exists with phone number: ${phone_Number}`);
      return sendSuccess(res, { exists: true }, "User account exists");
    } else {
      logger.info(`❌ No user found with phone number: ${phone_Number}`);
      return sendSuccess(res, { exists: false }, "User account does not exist");
    }
  } catch (err) {
    logger.error(`❌ Error checking user existence: ${err.message}`);
    sendError(res, err);
  }
};

exports.editUserAddress = async (req, res) => {
  try {
    const { userId } = req.params;
    const { index, updatedAddress } = req.body;

    const user = await User.findById(userId);
    if (!user) return sendError(res, "User not found", 404);

    if (!user.address[index])
      return sendError(res, "Address index does not exist", 400);

    user.address[index] = { ...user.address[index], ...updatedAddress };
    await user.save();

    const successData =
      await createUnicastOrMulticastNotificationUtilityFunction(
        [user._id],
        ["INAPP", "PUSH"],
        "ADDRESS UPDATE ALERT",
        "Your address has been updated",
        "",
        "",
        req.headers.authorization
      );
    if (!successData.success) {
      logger.error("❌ Create notification error:", successData.message);
    } else {
      logger.info("✅ Notification created successfully");
    }

    logger.info(`✅ Address updated for user: ${userId}`);
    sendSuccess(res, user, "Address updated successfully");
  } catch (err) {
    logger.error(`❌ Edit address error: ${err.message}`);
    sendError(res, err);
  }
};

// ✅ Delete address by index
exports.deleteUserAddress = async (req, res) => {
  try {
    const { userId } = req.params;
    const { index } = req.query;

    // Validate index parameter
    if (index === undefined || index === null || index === '') {
      return sendError(res, "Index parameter is required", 400);
    }

    // Convert index to number and validate
    const addressIndex = parseInt(index);
    if (isNaN(addressIndex) || addressIndex < 0) {
      return sendError(res, "Index must be a valid non-negative number", 400);
    }

    const user = await User.findById(userId);
    if (!user) return sendError(res, "User not found", 404);

    if (!user.address || !Array.isArray(user.address)) {
      return sendError(res, "User has no addresses", 400);
    }

    if (addressIndex >= user.address.length) {
      return sendError(res, "Address index does not exist", 400);
    }

    // Store the address being deleted for logging
    const deletedAddress = user.address[addressIndex];

    user.address.splice(addressIndex, 1);
    await user.save();

    // Send notification
    const successData =
      await createUnicastOrMulticastNotificationUtilityFunction(
        [user._id],
        ["INAPP", "PUSH"],
        "ADDRESS UPDATE ALERT",
        "Your address has been Deleted",
        "",
        "",
        req.headers.authorization
      );
    if (!successData.success) {
      logger.error("❌ Create notification error:", successData.message);
    } else {
      logger.info("✅ Notification created successfully");
    }

    logger.info(`🗑️ Address deleted for user: ${userId} at index: ${addressIndex}`);
    sendSuccess(res, user, "Address deleted successfully");
  } catch (err) {
    logger.error(`❌ Delete address error: ${err.message}`);
    sendError(res, err);
  }
};

// ✅ Edit or Add email and username
exports.updateEmailOrName = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, username } = req.body;

    //validate emailm using regular expression
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      return sendError(res, "Invalid email format", 400);
    }


    // const emailExists = await User.findOne({ email });
    // if (emailExists) return sendError(res, "Email already exists", 400);

    const employee = await Employee.findOne({ _id: userId });
    if (!employee) return sendError(res, "Employee not found", 404);

    const updateData = {};
    if (email) updateData.email = email;
    if (username) updateData.username = username;

    const updatedUser = await User.findByIdAndUpdate(employee.user_id, updateData, {
      new: true,
    });
    const Update = await Employee.findOneAndUpdate(
      { user_id: userId },
      {
        $set: {
          First_name: username,
          email: email
        }
      },
      { new: true }
    );

    if (!updatedUser) return sendError(res, "User not found", 404);

    logger.info(`✅ Updated email/username for user: ${userId}`);
    sendSuccess(res, updatedUser, "User profile updated successfully");
  } catch (err) {
    logger.error(`❌ Update profile error: ${err.message}`);
    sendError(res, err);
  }
};

exports.updateEmailOrNameUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, username } = req.body;

    //validate emailm using regular expression
    // const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // if (email && !emailRegex.test(email)) {
    //   return sendError(res, "Invalid email format", 400);
    // }


    // const emailExists = await User.findOne({ email });
    // if (emailExists) return sendError(res, "Email already exists", 400);

    const updateData = {};
    if (email) updateData.email = email;
    if (username) updateData.username = username;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    });
   

    if (!updatedUser) return sendError(res, "User not found", 404);

    logger.info(`✅ Updated email/username for user: ${userId}`);
    sendSuccess(res, updatedUser, "User profile updated successfully");
  } catch (err) {
    logger.error(`❌ Update profile error: ${err.message}`);
    sendError(res, err);
  }
};
exports.updateUserCartId = async (req, res) => {
  try {
    const { userId } = req.params;
    const { cartId } = req.body;
    console.log("api Called", cartId);

    const user = await User.findById(userId);
    if (!user) return sendError(res, "User not found", 404);

    user.cartId = cartId;
    await user.save();

    logger.info(`✅ Updated cartId for user: ${userId}`);
    sendSuccess(res, user, "CartId updated successfully");
  } catch (err) {
    logger.error(`❌ Update cartId error: ${err.message}`);
    sendError(res, err);
  }
};

exports.createEmployee = async (req, res) => {
  const session = await mongoose.startSession({ readPreference: 'primary' });
  session.startTransaction(
  );
  try {
    /* ---------- 1.  Pull fields from request ---------- */
    const {
      email,
      username,
      password,
      phone_Number,
      role = "User", // defaults to “User” if omitted
      address = [],

      // employee-specific
      employee_id,
      First_name,
      profile_image,
      mobile_number,
      assigned_dealers = [],
      assigned_regions = [],
      employeeRole, // e.g. "Fulfillment-Staff"
    } = req.body;

    /* ---------- 2.  Basic sanity checks ---------- */
    if (!email || !username || !password || !employee_id || !First_name) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // Check for duplicate user credentials
    const duplicateUser = await User.findOne({
      $or: [
        { email: email },
        { username: username },
        ...(phone_Number ? [{ phone_Number: phone_Number }] : [])
      ]
    });

    if (duplicateUser) {
      if (duplicateUser.email === email) {
        logger.warn(`Duplicate email attempted: ${email}`);
        return res.status(409).json({
          success: false,
          message: `Email "${email}" is already registered.`
        });
      }
      if (duplicateUser.username === username) {
        logger.warn(`Duplicate username attempted: ${username}`);
        return res.status(409).json({
          success: false,
          message: `Username "${username}" is already taken.`
        });
      }
      if (phone_Number && duplicateUser.phone_Number === phone_Number) {
        logger.warn(`Duplicate phone number attempted: ${phone_Number}`);
        return res.status(409).json({
          success: false,
          message: `Phone number "${phone_Number}" is already registered.`
        });
      }
    }

    // Check for duplicate employee ID or mobile number
    const duplicateEmployee = await Employee.findOne({
      $or: [
        { employee_id: employee_id },
        ...(mobile_number ? [{ mobile_number: mobile_number }] : [])
      ]
    });

    if (duplicateEmployee) {
      if (duplicateEmployee.employee_id === employee_id) {
        logger.warn(`Duplicate employee ID attempted: ${employee_id}`);
        return res.status(409).json({
          success: false,
          message: `Employee ID "${employee_id}" is already in use.`
        });
      }
      if (mobile_number && duplicateEmployee.mobile_number === mobile_number) {
        logger.warn(`Duplicate mobile number attempted: ${mobile_number}`);
        return res.status(409).json({
          success: false,
          message: `Mobile number "${mobile_number}" is already registered.`
        });
      }
    }

    /* ---------- 3.  Hash password ---------- */
    const hashedPassword = await bcrypt.hash(password, 12);

    /* ---------- 4.  Create the User ---------- */
    const user = await User.create(
      [
        {
          email,
          username,
          password: hashedPassword,
          phone_Number,
          role,
          address,
        },
      ],
      { session }
    ).then((docs) => docs[0]); // create([]) returns array in a transaction

    /* ---------- 5.  Create the Employee ---------- */
    const employee = await Employee.create(
      [
        {
          user_id: user._id,
          employee_id,
          First_name,
          profile_image,
          mobile_number,
          email, // keep HR systems happy—store again if needed
          role: employeeRole || role,
          assigned_dealers,
          assigned_regions,
        },
      ],
      { session }
    ).then((docs) => docs[0]);

    /* ---------- 6.  Commit the transaction ---------- */
    await session.commitTransaction();
    session.endSession();

    /* ---------- 7.  Sign JWT & respond ---------- */
    const token = generateJWT(user); // 30-day expiry per helper
    const htmlTemplate = await welcomeEmail(
      username,
      email,
      password,
      "www.toprise.in",
      "company Phone ",
      "company Email",
      "www.Toprise.in"
    );
    const sendData = await sendEmailNotifiation(
      email,
      "Welcome to Toprise",
      htmlTemplate
    );
    return res.status(201).json({
      success: true,
      message: "Employee created successfully.",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      employee,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating the employee.",
      error: err.message,
    });
  }
};
exports.getEmployeeDetails = async (req, res) => {
  try {
    const { employeeId } = req.params;

    logger.info(`🔍 Fetching employee details for ID: ${employeeId}`);

    const employee = await Employee.findById(employeeId)
      .populate("user_id", "email username phone_Number role")
      .populate({
        path: "assigned_dealers",
        select:
          "dealerId legal_name trade_name GSTIN Pan Address categories_allowed SLA_type dispatch_hours SLA_max_dispatch_time created_at updated_at",
        populate: {
          path: "user_id",
          select: "email username phone_Number role",
        },
      })
      .exec();

    if (!employee) {
      return sendError(res, "Employee not found", 404);
    }

    // Transform the response to include comprehensive dealer information
    const transformedEmployee = {
      _id: employee._id,
      user_id: employee.user_id,
      employee_id: employee.employee_id,
      First_name: employee.First_name,
      profile_image: employee.profile_image,
      mobile_number: employee.mobile_number,
      email: employee.email,
      role: employee.role,
      assigned_dealers: employee.assigned_dealers.map((dealer) => ({
        _id: dealer._id,
        dealerId: dealer.dealerId,
        legal_name: dealer.legal_name,
        trade_name: dealer.trade_name,
        GSTIN: dealer.GSTIN,
        Pan: dealer.Pan,
        Address: dealer.Address,
        categories_allowed: dealer.categories_allowed,
        SLA_type: dealer.SLA_type,
        dispatch_hours: dealer.dispatch_hours,
        SLA_max_dispatch_time: dealer.SLA_max_dispatch_time,
        user_details: dealer.user_id,
        created_at: dealer.created_at,
        updated_at: dealer.updated_at,
      })),
      assigned_regions: employee.assigned_regions,
      last_login: employee.last_login,
      updated_at: employee.updated_at,
      created_at: employee.created_at,
    };

    // Fetch category names from product service if categories_allowed exist for any dealer
    if (employee.assigned_dealers && employee.assigned_dealers.length > 0) {
      try {
        // Collect all unique category IDs from all assigned dealers
        const allCategoryIds = [];
        employee.assigned_dealers.forEach((dealer) => {
          if (
            dealer.categories_allowed &&
            dealer.categories_allowed.length > 0
          ) {
            allCategoryIds.push(...dealer.categories_allowed);
          }
        });

        // Remove duplicates
        const uniqueCategoryIds = [...new Set(allCategoryIds)];

        if (uniqueCategoryIds.length > 0) {
          logger.info(
            `Fetching categories for employee ${employeeId} with category IDs:`,
            uniqueCategoryIds
          );

          const categoryResponse = await fetch(
            "http://product-service:5002/api/categories/bulk-by-ids",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                user_id: employee.user_id._id,
                ids: uniqueCategoryIds,
              }),
            }
          );

          if (categoryResponse.ok) {
            const categoryData = await categoryResponse.json();
            logger.info(
              `Category service response for employee ${employeeId}:`,
              JSON.stringify(categoryData, null, 2)
            );

            if (categoryData.success && categoryData.data) {
              const categoryMap = {};
              categoryData.data.forEach((category) => {
                categoryMap[category._id] = {
                  _id: category._id,
                  category_name: category.category_name,
                  category_code: category.category_code,
                  category_Status: category.category_Status,
                  main_category: category.main_category,
                };
              });

              logger.info(
                `Category map for employee ${employeeId}:`,
                JSON.stringify(categoryMap, null, 2)
              );

              // Add assigned_categories to each dealer
              transformedEmployee.assigned_dealers =
                transformedEmployee.assigned_dealers.map((dealer) => {
                  if (
                    dealer.categories_allowed &&
                    dealer.categories_allowed.length > 0
                  ) {
                    dealer.assigned_categories = dealer.categories_allowed.map(
                      (categoryId) =>
                        categoryMap[categoryId] || {
                          _id: categoryId,
                          category_name: "Unknown Category",
                        }
                    );
                  } else {
                    dealer.assigned_categories = [];
                  }
                  return dealer;
                });

              logger.info(
                `Final assigned_categories for employee ${employeeId}:`,
                JSON.stringify(
                  transformedEmployee.assigned_dealers.map((d) => ({
                    dealerId: d.dealerId,
                    assigned_categories: d.assigned_categories,
                  })),
                  null,
                  2
                )
              );
            } else {
              logger.warn(
                `Category service returned unsuccessful response for employee ${employeeId}:`,
                categoryData
              );
            }
          } else {
            logger.warn(
              `Failed to fetch category details for employee ${employeeId}: ${categoryResponse.status}`
            );
            // Fallback: create assigned_categories with just IDs
            transformedEmployee.assigned_dealers =
              transformedEmployee.assigned_dealers.map((dealer) => {
                dealer.assigned_categories = dealer.categories_allowed
                  ? dealer.categories_allowed.map((categoryId) => ({
                    _id: categoryId,
                    category_name: "Category details unavailable",
                  }))
                  : [];
                return dealer;
              });
          }
        } else {
          // No categories to fetch
          transformedEmployee.assigned_dealers =
            transformedEmployee.assigned_dealers.map((dealer) => {
              dealer.assigned_categories = [];
              return dealer;
            });
        }
      } catch (categoryError) {
        logger.warn(
          `Error fetching category details for employee ${employeeId}:`,
          categoryError.message
        );
        // Fallback: create assigned_categories with just IDs
        transformedEmployee.assigned_dealers =
          transformedEmployee.assigned_dealers.map((dealer) => {
            dealer.assigned_categories = dealer.categories_allowed
              ? dealer.categories_allowed.map((categoryId) => ({
                _id: categoryId,
                category_name: "Category details unavailable",
              }))
              : [];
            return dealer;
          });
      }
    }

    logger.info(
      `Fetched employee details for ID: ${employeeId} with comprehensive dealer and category information`
    );

    sendSuccess(
      res,
      transformedEmployee,
      "Employee details fetched successfully"
    );
  } catch (err) {
    logger.error(`Get employee details error: ${err.message}`);
    sendError(res, err);
  }
};
exports.getAllEmployees = async (req, res) => {
  try {
    // Optionally filter/sort (example: sort by creation date)
    const employees = await Employee.find()
      .populate("user_id", "email firstName lastName") // Populate user details
      .populate("assigned_dealers", "name location") // Populate dealer details
      .sort({ created_at: -1 }); // Newest first

    // If no employees found (empty array is a valid response)
    if (!employees.length) {
      return res.status(200).json({
        success: true,
        message: "No employees found",
        data: [],
      });
    }

    // Successful response
    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (err) {
    console.error("Error fetching employees:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching employees",
      error: err.message,
    });
  }
};
// Helper function to check for duplicate vehicles
const checkDuplicateVehicle = (existingVehicles, newVehicle, excludeVehicleId = null) => {
  return existingVehicles.find(existingVehicle => {
    // Skip the vehicle being edited (for edit operations)
    if (excludeVehicleId && existingVehicle._id.toString() === excludeVehicleId.toString()) {
      return false;
    }

    return (
      existingVehicle.brand === newVehicle.brand &&
      existingVehicle.model === newVehicle.model &&
      existingVehicle.variant === newVehicle.variant &&
      existingVehicle.vehicle_type === newVehicle.vehicle_type &&
      existingVehicle.year_Range === newVehicle.year_Range
    );
  });
};

exports.addVehicleDetails = async (req, res) => {
  const { userId } = req.params;
  const vehicle = req.body;

  try {
    // First, get the user to check for existing vehicles
    const user = await User.findById(userId);
    if (!user) return sendError(res, "User not found", 404);

    // Check for duplicate vehicle based on key fields
    const duplicateVehicle = checkDuplicateVehicle(user.vehicle_details, vehicle);

    if (duplicateVehicle) {
      logger.warn(`Duplicate vehicle detected for user ${userId}: ${vehicle.brand} ${vehicle.model} ${vehicle.variant}`);
      return sendError(res, {
        message: "A vehicle with the same details already exists in your saved vehicles",
        code: "DUPLICATE_VEHICLE",
        duplicateFields: {
          brand: vehicle.brand,
          model: vehicle.model,
          variant: vehicle.variant,
          vehicle_type: vehicle.vehicle_type,
          year_Range: vehicle.year_Range
        }
      }, 409); // 409 Conflict
    }

    // If no duplicate found, add the vehicle
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { vehicle_details: vehicle } },
      { new: true, runValidators: true }
    );

    logger.info(`Vehicle added successfully for user ${userId}: ${vehicle.brand} ${vehicle.model} ${vehicle.variant}`);
    return sendSuccess(res, updatedUser.vehicle_details, "Vehicle added successfully");
  } catch (err) {
    logger.error(`Add vehicle error: ${err.message}`);
    return sendError(res, err);
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const { employee_id } = req.query;

    if (!employee_id) {
      return res.status(400).json({ message: "employee_id is required" });
    }

    logger.info(`🔍 Fetching employee by ID: ${employee_id}`);

    const employee = await Employee.findOne({ employee_id: employee_id.trim() })
      .populate("user_id", "email username phone_Number role") // populate user details if needed
      .populate({
        path: "assigned_dealers",
        select:
          "dealerId legal_name trade_name GSTIN Pan Address categories_allowed SLA_type dispatch_hours SLA_max_dispatch_time created_at updated_at",
        populate: {
          path: "user_id",
          select: "email username phone_Number role",
        },
      })
      .exec();

    if (!employee) {
      return res
        .status(404)
        .json({ message: `Employee with ID '${employee_id}' not found` });
    }

    // Transform the response to include comprehensive dealer information
    const transformedEmployee = {
      _id: employee._id,
      user_id: employee.user_id,
      employee_id: employee.employee_id,
      First_name: employee.First_name,
      profile_image: employee.profile_image,
      mobile_number: employee.mobile_number,
      email: employee.email,
      role: employee.role,
      assigned_dealers: employee.assigned_dealers.map((dealer) => ({
        _id: dealer._id,
        dealerId: dealer.dealerId,
        legal_name: dealer.legal_name,
        trade_name: dealer.trade_name,
        GSTIN: dealer.GSTIN,
        Pan: dealer.Pan,
        Address: dealer.Address,
        categories_allowed: dealer.categories_allowed,
        SLA_type: dealer.SLA_type,
        dispatch_hours: dealer.dispatch_hours,
        SLA_max_dispatch_time: dealer.SLA_max_dispatch_time,
        user_details: dealer.user_id,
        created_at: dealer.created_at,
        updated_at: dealer.updated_at,
      })),
      assigned_regions: employee.assigned_regions,
      last_login: employee.last_login,
      updated_at: employee.updated_at,
      created_at: employee.created_at,
    };

    // Fetch category names from product service if categories_allowed exist for any dealer
    if (employee.assigned_dealers && employee.assigned_dealers.length > 0) {
      try {
        // Collect all unique category IDs from all assigned dealers
        const allCategoryIds = [];
        employee.assigned_dealers.forEach((dealer) => {
          if (
            dealer.categories_allowed &&
            dealer.categories_allowed.length > 0
          ) {
            allCategoryIds.push(...dealer.categories_allowed);
          }
        });

        // Remove duplicates
        const uniqueCategoryIds = [...new Set(allCategoryIds)];

        if (uniqueCategoryIds.length > 0) {
          logger.info(
            `Fetching categories for employee ${employee_id} with category IDs:`,
            uniqueCategoryIds
          );

          const categoryResponse = await fetch(
            "http://product-service:5002/api/categories/bulk-by-ids",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                user_id: employee.user_id._id,
                ids: uniqueCategoryIds,
              }),
            }
          );

          if (categoryResponse.ok) {
            const categoryData = await categoryResponse.json();
            logger.info(
              `Category service response for employee ${employee_id}:`,
              JSON.stringify(categoryData, null, 2)
            );

            if (categoryData.success && categoryData.data) {
              const categoryMap = {};
              categoryData.data.forEach((category) => {
                categoryMap[category._id] = {
                  _id: category._id,
                  category_name: category.category_name,
                  category_code: category.category_code,
                  category_Status: category.category_Status,
                  main_category: category.main_category,
                };
              });

              logger.info(
                `Category map for employee ${employee_id}:`,
                JSON.stringify(categoryMap, null, 2)
              );

              // Add assigned_categories to each dealer
              transformedEmployee.assigned_dealers =
                transformedEmployee.assigned_dealers.map((dealer) => {
                  if (
                    dealer.categories_allowed &&
                    dealer.categories_allowed.length > 0
                  ) {
                    dealer.assigned_categories = dealer.categories_allowed.map(
                      (categoryId) =>
                        categoryMap[categoryId] || {
                          _id: categoryId,
                          category_name: "Unknown Category",
                        }
                    );
                  } else {
                    dealer.assigned_categories = [];
                  }
                  return dealer;
                });

              logger.info(
                `Final assigned_categories for employee ${employee_id}:`,
                JSON.stringify(
                  transformedEmployee.assigned_dealers.map((d) => ({
                    dealerId: d.dealerId,
                    assigned_categories: d.assigned_categories,
                  })),
                  null,
                  2
                )
              );
            } else {
              logger.warn(
                `Category service returned unsuccessful response for employee ${employee_id}:`,
                categoryData
              );
            }
          } else {
            logger.warn(
              `Failed to fetch category details for employee ${employee_id}: ${categoryResponse.status}`
            );
            // Fallback: create assigned_categories with just IDs
            transformedEmployee.assigned_dealers =
              transformedEmployee.assigned_dealers.map((dealer) => {
                dealer.assigned_categories = dealer.categories_allowed
                  ? dealer.categories_allowed.map((categoryId) => ({
                    _id: categoryId,
                    category_name: "Category details unavailable",
                  }))
                  : [];
                return dealer;
              });
          }
        } else {
          // No categories to fetch
          transformedEmployee.assigned_dealers =
            transformedEmployee.assigned_dealers.map((dealer) => {
              dealer.assigned_categories = [];
              return dealer;
            });
        }
      } catch (categoryError) {
        logger.warn(
          `Error fetching category details for employee ${employee_id}:`,
          categoryError.message
        );
        // Fallback: create assigned_categories with just IDs
        transformedEmployee.assigned_dealers =
          transformedEmployee.assigned_dealers.map((dealer) => {
            dealer.assigned_categories = dealer.categories_allowed
              ? dealer.categories_allowed.map((categoryId) => ({
                _id: categoryId,
                category_name: "Category details unavailable",
              }))
              : [];
            return dealer;
          });
      }
    }

    logger.info(
      `Fetched employee by ID: ${employee_id} with comprehensive dealer and category information`
    );

    res.status(200).json({
      success: true,
      message: "Employee fetched successfully",
      data: transformedEmployee,
    });
  } catch (error) {
    logger.error(`Get employee by ID error: ${error.message}`);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

/**
 * Get employees by dealer
 * Returns employees assigned to a specific dealer
 */
exports.getEmployeesByDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { role, page = 1, limit = 10 } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    if (!dealerId) {
      return sendError(res, "Dealer ID is required", 400);
    }

    // Build filter
    const filter = {
      assigned_dealers: { $in: [dealerId] },
    };

    // Add role filter if specified
    if (role) {
      filter.role = role;
    }

    // Get employees with pagination
    const employees = await Employee.find(filter)
      .populate("user_id", "email username phone_Number role")
      .populate("assigned_dealers", "dealerId legal_name trade_name")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Get total count for pagination
    const total = await Employee.countDocuments(filter);

    const totalPages = Math.ceil(total / limitNumber);

    return sendSuccess(
      res,
      {
        employees,
        pagination: {
          totalItems: total,
          totalPages,
          currentPage: pageNumber,
          itemsPerPage: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
        },
        filters: {
          dealerId,
          role,
        },
      },
      "Employees by dealer retrieved successfully"
    );
  } catch (error) {
    logger.error("Error fetching employees by dealer:", error.message);
    return sendError(res, error);
  }
};

/**
 * Get employees by region
 * Returns employees assigned to a specific region (including those without dealer assignments)
 */
exports.getEmployeesByRegion = async (req, res) => {
  try {
    const { region } = req.params;
    const { role, page = 1, limit = 10, includeNoDealer = true } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    if (!region) {
      return sendError(res, "Region is required", 400);
    }

    // Build filter for employees assigned to this region
    const filter = {
      assigned_regions: { $in: [region] },
    };

    // Add role filter if specified
    if (role) {
      filter.role = role;
    }

    // If includeNoDealer is true, also include employees with no dealer assignments
    if (includeNoDealer === "true") {
      filter.$or = [
        { assigned_dealers: { $exists: false } },
        { assigned_dealers: { $size: 0 } },
      ];
    }

    // Get employees with pagination
    const employees = await Employee.find(filter)
      .populate("user_id", "email username phone_Number role")
      .populate("assigned_dealers", "dealerId legal_name trade_name")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Get total count for pagination
    const total = await Employee.countDocuments(filter);

    const totalPages = Math.ceil(total / limitNumber);

    return sendSuccess(
      res,
      {
        employees,
        pagination: {
          totalItems: total,
          totalPages,
          currentPage: pageNumber,
          itemsPerPage: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
        },
        filters: {
          region,
          role,
          includeNoDealer: includeNoDealer === "true",
        },
      },
      "Employees by region retrieved successfully"
    );
  } catch (error) {
    logger.error("Error fetching employees by region:", error.message);
    return sendError(res, error);
  }
};

/**
 * Get employees by region and dealer
 * Returns employees assigned to both a specific region and dealer
 */
exports.getEmployeesByRegionAndDealer = async (req, res) => {
  try {
    const { region, dealerId } = req.params;
    const { role, page = 1, limit = 10 } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    if (!region || !dealerId) {
      return sendError(res, "Both region and dealer ID are required", 400);
    }

    // Build filter for employees assigned to both region and dealer
    const filter = {
      assigned_regions: { $in: [region] },
      assigned_dealers: { $in: [dealerId] },
    };

    // Add role filter if specified
    if (role) {
      filter.role = role;
    }

    // Get employees with pagination
    const employees = await Employee.find(filter)
      .populate("user_id", "email username phone_Number role")
      .populate("assigned_dealers", "dealerId legal_name trade_name")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Get total count for pagination
    const total = await Employee.countDocuments(filter);

    const totalPages = Math.ceil(total / limitNumber);

    return sendSuccess(
      res,
      {
        employees,
        pagination: {
          totalItems: total,
          totalPages,
          currentPage: pageNumber,
          itemsPerPage: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
        },
        filters: {
          region,
          dealerId,
          role,
        },
      },
      "Employees by region and dealer retrieved successfully"
    );
  } catch (error) {
    logger.error(
      "Error fetching employees by region and dealer:",
      error.message
    );
    return sendError(res, error);
  }
};

/**
 * Get fulfillment staff by region
 * Returns fulfillment staff assigned to a specific region
 */
exports.getFulfillmentStaffByRegion = async (req, res) => {
  try {
    const { region } = req.params;
    const { page = 1, limit = 10, includeNoDealer = true } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    if (!region) {
      return sendError(res, "Region is required", 400);
    }

    // Build filter for fulfillment staff assigned to this region
    const filter = {
      assigned_regions: { $in: [region] },
      role: { $in: ["Fulfillment-Staff", "Fulfillment-Admin"] },
    };

    // If includeNoDealer is true, also include employees with no dealer assignments
    if (includeNoDealer === "true") {
      filter.$or = [
        { assigned_dealers: { $exists: false } },
        { assigned_dealers: { $size: 0 } },
      ];
    }

    // Get employees with pagination
    const employees = await Employee.find(filter)
      .populate("user_id", "email username phone_Number role")
      .populate("assigned_dealers", "dealerId legal_name trade_name")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Get total count for pagination
    const total = await Employee.countDocuments(filter);

    const totalPages = Math.ceil(total / limitNumber);

    return sendSuccess(
      res,
      {
        employees,
        pagination: {
          totalItems: total,
          totalPages,
          currentPage: pageNumber,
          itemsPerPage: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
        },
        filters: {
          region,
          includeNoDealer: includeNoDealer === "true",
        },
      },
      "Fulfillment staff by region retrieved successfully"
    );
  } catch (error) {
    logger.error("Error fetching fulfillment staff by region:", error.message);
    return sendError(res, error);
  }
};
exports.editVehicleDetails = async (req, res) => {
  const { userId, vehicleId } = req.params;
  const updates = req.body;

  try {
    // First, get the user to check for existing vehicles
    const user = await User.findById(userId);
    if (!user) return sendError(res, "User not found", 404);

    // Check if the vehicle exists
    const existingVehicle = user.vehicle_details.find(v => v._id.toString() === vehicleId);
    if (!existingVehicle) return sendError(res, "Vehicle not found", 404);

    // Create the updated vehicle object to check for duplicates
    const updatedVehicle = { ...existingVehicle.toObject(), ...updates };

    // Check for duplicate vehicle (excluding the current vehicle being edited)
    const duplicateVehicle = checkDuplicateVehicle(user.vehicle_details, updatedVehicle, vehicleId);

    if (duplicateVehicle) {
      logger.warn(`Duplicate vehicle detected during edit for user ${userId}: ${updatedVehicle.brand} ${updatedVehicle.model} ${updatedVehicle.variant}`);
      return sendError(res, {
        message: "A vehicle with the same details already exists in your saved vehicles",
        code: "DUPLICATE_VEHICLE",
        duplicateFields: {
          brand: updatedVehicle.brand,
          model: updatedVehicle.model,
          variant: updatedVehicle.variant,
          vehicle_type: updatedVehicle.vehicle_type,
          year_Range: updatedVehicle.year_Range
        }
      }, 409); // 409 Conflict
    }

    // If no duplicate found, update the vehicle
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, "vehicle_details._id": vehicleId },
      {
        $set: Object.fromEntries(
          Object.entries(updates).map(([key, val]) => [
            `vehicle_details.$.${key}`,
            val,
          ])
        ),
      },
      { new: true, runValidators: true }
    );

    const updated = updatedUser.vehicle_details.find((v) => v._id.equals(vehicleId));
    logger.info(`Vehicle ${vehicleId} updated successfully for user ${userId}: ${updatedVehicle.brand} ${updatedVehicle.model} ${updatedVehicle.variant}`);
    return sendSuccess(res, updated, "Vehicle updated successfully");
  } catch (err) {
    logger.error(`Edit vehicle error: ${err.message}`);
    return sendError(res, err);
  }
};

exports.deleteVehicleDetails = async (req, res) => {
  const { userId, vehicleId } = req.params;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { vehicle_details: { _id: vehicleId } } },
      { new: true }
    );

    if (!user) return sendError(res, "User or vehicle not found", 404);

    logger.info(`Vehicle ${vehicleId} deleted for user ${userId}`);
    return sendSuccess(res, user.vehicle_details);
  } catch (err) {
    logger.error(`Delete vehicle error: ${err.message}`);
    return sendError(res, err);
  }
};

exports.updateFCMToken = async (req, res) => {
  const { userId } = req.params;
  const { fcmToken } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { fcmToken },
      { new: true, runValidators: true }
    );

    if (!user) return sendError(res, "User not found", 404);
    logger.info(`FCM token updated for user ${userId}`);
    return sendSuccess(res, user);
  } catch (err) {
    logger.error(`Update FCM token error: ${err.message}`);
    return sendError(res, err);
  }
};

exports.disableDealer = async (req, res) => {
  try {
    const rawId = req.params.dealerId;
    const id = rawId.trim();

    if (!id) {
      return res.status(400).json({ message: "Dealer ID is required" });
    }

    // Validate if the ID is a valid MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid dealer ID format" });
    }

    console.log("Looking for dealer with _id:", id);

    const dealer = await Dealer.findOneAndUpdate(
      { _id: new ObjectId(id) }, // Query by ObjectId
      { is_active: false, updated_at: Date.now() },
      { new: true }
    );

    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    const productServiceURL =
      "http://product-service:5001/products/v1/disable-by-dealer";

    // You might want to pass the dealerId (not ObjectId) to the product service
    await axios.post(productServiceURL, { dealerId: dealer._id });

    res.status(200).json({
      message: "Dealer disabled and associated products updated",
      dealer,
    });
  } catch (error) {
    console.error("Error disabling dealer:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

async function getSLAIdByNameRemote(name) {
  try {
    const response = await axios.get(
      `http://order-service:5001/api/orders/get-by-name`,
      { params: { name: name.trim() } }
    );
    if (response.data && response.data._id) {
      return response.data._id;
    } else {
      throw new Error(`SLA not found for name: ${name}`);
    }
  } catch (err) {
    throw new Error(
      `Failed to fetch SLA from Order service for name '${name}': ${err.message}`
    );
  }
}

async function getUserIdByEmployeeId(empId) {
  const employee = await Employee.findOne({ employee_id: empId.trim() });

  if (!employee) {
    throw new Error(`Employee with employee_id '${empId}' not found`);
  }

  if (!employee.user_id) {
    throw new Error(`Employee '${empId}' does not have an associated user_id`);
  }

  return employee.user_id;
}
async function getEmployeeIdByEmployeeId(empId) {
  const employee = await Employee.findOne({ employee_id: empId.trim() });

  if (!employee) {
    throw new Error(`Employee with employee_id '${empId}' not found`);
  }

  if (!employee._id) {
    throw new Error(`Employee '${empId}' does not have an associated _id`);
  }

  return employee._id;
}
const getServiceablePincodeId = async (pincode, authHeader) => {
  try {
    const res = await axios.get(
      `http://product-service:5001/api/pincodes/get/serviceable/${pincode}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || "",
        },
      }
    );

    if (res.data?.success && res.data?.data?._id) {
      return res.data.data._id.toString(); // ✅ store as string
    }

    throw new Error(`Pincode not serviceable: ${pincode}`);
  } catch (err) {
    throw new Error(`Failed to fetch pincode ${pincode}: ${err.message}`);
  }
};

exports.createDealersBulk = async (req, res) => {
  try {
    const results = [];
    const stream = req.file.buffer.toString("utf8");

    await new Promise((resolve, reject) => {
      streamifier
        .createReadStream(Buffer.from(stream))
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", resolve)
        .on("error", reject);
    });

    console.log(`Parsed ${results.length} rows from CSV`);

    const createdDealers = [];
    const failedRows = [];

    for (const [index, row] of results.entries()) {
      console.log(`\n🔹 Processing row ${index + 1}:`, row);

      try {
        /** -------------------------------  
         *  STEP 1: CHECK USER EXIST  
         -------------------------------- */
        const existingUser = await User.findOne({ email: row.email });

        if (existingUser) {
          console.log(`⚠️ Skipping row: User with email ${row.email} already exists`);
          continue;
        }

        /** -------------------------------  
         *  STEP 2: CREATE USER  
         -------------------------------- */
        const hashedPassword = await bcrypt.hash(row.password || "default123", 10);

        const newUser = new User({
          email: row.email,
          username: row.username,
          password: hashedPassword,
          phone_Number: row.phone_Number,
          role: "Dealer",
        });

        await newUser.save();
        console.log(`✅ User Created: ${newUser.email}`);

        /** -------------------------------  
         *  STEP 3: ASSIGNED EMPLOYEES  
         -------------------------------- */
        const assignedEmployees = [];

        if (row.assigned_user_ids) {
          const ids = row.assigned_user_ids.split("|").map(e => e.trim());
          console.log("Assigned employees:", ids);

          for (const empId of ids) {
            try {
              // const userId = await getUserIdByEmployeeId(empId);
              const userId = await getEmployeeIdByEmployeeId(empId);

              assignedEmployees.push({
                assigned_user: userId,
                status: "Active",
              });
            } catch (mapErr) {
              console.warn(`⚠️ Employee mapping failed for ${empId}:`, mapErr.message);
              throw mapErr;
            }
          }
        }

        /** -------------------------------  
         *  STEP 4: SLA TYPE  
         -------------------------------- */
        const slaTypeId = row.SLA_type
          ? await getSLAIdByNameRemote(row.SLA_type)
          : null;

        /** -------------------------------  
         *  STEP 5: BRAND MAPPING  
         *  Using product-service endpoint
         -------------------------------- */
        let mappedBrands = [];
        console.log("Brands to map:", row.brands_allowed);

        if (row.brands_allowed) {
          const brandNames = row.brands_allowed.split("|").map(b => b.trim());

          for (const brandName of brandNames) {
            try {
              const brandRes = await axios.get(
                `http://product-service:5001/api/brands/get/brand/byName/${encodeURIComponent(brandName)}`,
                {
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: req.headers.authorization || "",
                  },
                }
              );

              if (brandRes.data?.success && brandRes.data.data?._id) {
                mappedBrands.push(brandRes.data.data._id);
                console.log(`✔ Brand mapped: ${brandName} → ${brandRes.data.data._id}`);
              } else {
                throw new Error(`Brand not found: ${brandName}`);
              }
            } catch (err) {
              console.log(`❌ Brand fetch failed for: ${brandName}`, err.message);
              throw new Error(`Brand mapping failed for '${brandName}'`);
            }
          }
        }
        /** -------------------------------  
 *  STEP 5.5: SERVICEABLE PINCODES
 -------------------------------- */
let serviceablePincodeIds = [];

if (row.serviceable_pincodes) {
  const pincodes = row.serviceable_pincodes
    .split("|")
    .map(p => p.trim())
    .filter(Boolean);

  console.log("Serviceable pincodes:", pincodes);

  for (const pincode of pincodes) {
    try {
      const pincodeId = await getServiceablePincodeId(
        pincode,
        req.headers.authorization
      );

      serviceablePincodeIds.push(pincodeId);
      console.log(`✔ Pincode mapped: ${pincode} → ${pincodeId}`);
    } catch (err) {
      console.error(`❌ Pincode mapping failed for ${pincode}`, err.message);
      throw err; // ❗ fail this row
    }
  }
}

        /** -------------------------------  
         *  STEP 6: CREATE DEALER  
         -------------------------------- */
        const newDealer = new Dealer({
          user_id: newUser._id,
          dealerId: `DLR-${uuidv4().slice(0, 8)}`,
          legal_name: row.legal_name,
          trade_name: row.trade_name,
          GSTIN: row.GSTIN,
          Pan: row.Pan,
          Address: {
            street: row.street,
            city: row.city,
            pincode: row.pincode,
            state: row.state,
          },
          contact_person: {
            name: row.contact_name,
            email: row.contact_email,
            phone_number: row.contact_phone,
          },
          is_active: row.is_active?.toLowerCase() !== "false",

          /** ✔ Updated field */
          brands_allowed: mappedBrands,
          serviceable_pincodes: serviceablePincodeIds,

          upload_access_enabled: row.upload_access_enabled?.toLowerCase() === "true",
          default_margin: parseFloat(row.default_margin) || 0,
          last_fulfillment_date: row.last_fulfillment_date
            ? new Date(row.last_fulfillment_date)
            : undefined,
          assigned_Toprise_employee: assignedEmployees,
          SLA_type: slaTypeId,
          dispatch_hours: {
            start: parseInt(row.dispatch_start, 10) || 0,
            end: parseInt(row.dispatch_end, 10) || 0,
          },
          SLA_max_dispatch_time: parseInt(row.SLA_max_dispatch_time, 10) || 0,
          onboarding_date: row.onboarding_date ? new Date(row.onboarding_date) : new Date(),
          remarks: row.remarks || "",
        });

        const createdDealer = await newDealer.save();
        if (row.assigned_user_ids) {
          const ids = row.assigned_user_ids.split("|").map(e => e.trim());
          console.log("Assigned employees:", ids);

          for (const empId of ids) {
            try {
              // const userId = await getUserIdByEmployeeId(empId);
              const userId = await getEmployeeIdByEmployeeId(empId);




              await Employee.findByIdAndUpdate(userId, {
                $addToSet: { assigned_dealers: createdDealer._id },
              });

              //update assigned employees with dealer id

            } catch (mapErr) {
              console.warn(`⚠️ Employee mapping failed for ${empId}:`, mapErr.message);
              throw mapErr;
            }
          }
        }
        console.log(`🎉 Dealer Created: ${newDealer.legal_name}`);
        createdDealers.push(newDealer);

      } catch (err) {
        console.error(`❌ Error in row ${index + 1}:`, err.message);
        //delete created user
        const deletedUser = await User.findOneAndDelete({ email: row.email });
        failedRows.push({ row: row.email || row.username, error: err.message });
      }
    }

    res.status(201).json({
      message: `${createdDealers.length} dealers created successfully`,
      failed: failedRows.length,
      failedRows,
      dealers: createdDealers,
    });

  } catch (err) {
    console.error("🚨 Bulk dealer creation error:", err.message);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};


exports;

exports.assignTicketToSupport = async (req, res) => {
  try {
    const ticketId = req.params.ticketId;
    const supportId = req.params.supportId;
    const user = await User.findById(supportId);
    if (!user) {
      logger.error(`User with ID ${supportId} not found`);
      return res.status(404).json({ message: "Support user not found" });
    }

    user.ticketsAssigned = [...user.ticketsAssigned, ticketId];
    await user.save();

    return res.status(200).json({ message: "Ticket assigned to support" });
  } catch (error) {
    console.error("Error assigning ticket to support:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.removeTicketFromSupport = async (req, res) => {
  try {
    const ticketId = req.params.ticketId;
    const supportId = req.params.supportId;
    const user = await User.findById(supportId);
    if (!user) {
      logger.error(`User with ID ${supportId} not found`);
      return res.status(404).json({ message: "Support user not found" });
    }

    user.ticketsAssigned = user.ticketsAssigned.filter(
      (id) => id.toString() !== ticketId.toString()
    );
    await user.save();

    return res.status(200).json({ message: "Ticket removed from support" });
  } catch (error) {
    console.error("Error removing ticket from support:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const roles = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const newThisMonth = await User.countDocuments({
      createdAt: { $gte: startOfMonth },
    });
    const newThisWeek = await User.countDocuments({
      createdAt: { $gte: startOfWeek },
    });

    const usersWithVehicles = await User.countDocuments({
      vehicle_details: { $exists: true, $ne: [] },
    });

    const avgVehicles = await User.aggregate([
      { $project: { vehicleCount: { $size: "$vehicle_details" } } },
      { $group: { _id: null, avg: { $avg: "$vehicleCount" } } },
    ]);

    res.json({
      totalUsers,
      newThisMonth,
      newThisWeek,
      usersWithVehicles,
      avgVehicles: avgVehicles[0]?.avg || 0,
      roles,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching user stats");
  }
};

exports.getUserInsights = async (req, res) => {
  try {
    const topCities = await User.aggregate([
      { $unwind: "$address" },
      { $group: { _id: "$address.city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    const vehicleTypes = await User.aggregate([
      { $unwind: "$vehicle_details" },
      { $group: { _id: "$vehicle_details.vehicle_type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const mostSelectedVehicle = await User.aggregate([
      { $unwind: "$vehicle_details" },
      { $match: { "vehicle_details.selected_vehicle": true } },
      {
        $group: {
          _id: {
            brand: "$vehicle_details.brand",
            model: "$vehicle_details.model",
            variant: "$vehicle_details.variant",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    const recentLogins = await User.find()
      .sort({ last_login: -1 })
      .limit(10)
      .select("email username last_login role");

    const withPhone = await User.countDocuments({
      phone_Number: { $exists: true, $ne: null },
    });
    const withoutPhone = await User.countDocuments({
      $or: [{ phone_Number: null }, { phone_Number: "" }],
    });

    res.json({
      topCities,
      vehicleTypes,
      mostSelectedVehicle,
      recentLogins,
      phoneBreakdown: {
        withPhone,
        withoutPhone,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching user insights");
  }
};

exports.updateWhislistId = async (req, res) => {
  try {
    const { userId } = req.params;
    const { wishlistId } = req.body;

    if (!wishlistId) {
      return sendError(res, "Wishlist ID is required", 400);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { wishlistId },
      { new: true, runValidators: true }
    );

    if (!user) return sendError(res, "User not found", 404);
    logger.info(`Wishlist ID updated for user ${userId}`);
    return sendSuccess(res, user, "Wishlist ID updated successfully");
  } catch (err) {
    logger.error(`Update wishlist ID error: ${err.message}`);
    return sendError(res, err);
  }
};
exports.enableDealer = async (req, res) => {
  try {
    const rawId = req.params.dealerId;
    const id = rawId.trim();

    if (!id) {
      return res.status(400).json({ message: "Dealer ID is required" });
    }

    // Validate if the ID is a valid MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid dealer ID format" });
    }

    console.log("Looking for dealer with _id:", id);

    const dealer = await Dealer.findOneAndUpdate(
      { _id: new ObjectId(id) }, // Query by ObjectId
      { is_active: true, updated_at: Date.now() },
      { new: true }
    );

    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    const productServiceURL =
      "http://product-service:5001/products/v1/enable-by-dealer";

    // You might want to pass the dealerId (not ObjectId) to the product service
    await axios.post(productServiceURL, { dealerId: dealer._id });

    res.status(200).json({
      message: "Dealer enabled and associated products updated",
      dealer,
    });
  } catch (error) {
    console.error("Error disabling dealer:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getDealersByAllowedCategory = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const product = await axios.get(
      `http://product-service:5001/products/v1/get-ProductById/${productId}`,
      {
        headers: {
          Authorization: req.headers.authorization,
        },
      }
    );
    const categoryId = product.data.data.category;
    const brandId = product.data.data.brand;
    const excludeDealer = product.data.data.available_dealers.map(
      (d) => d.dealers_Ref
    );
    const dealers = await Dealer.find({
      _id: { $nin: excludeDealer },
      // categories_allowed: categoryId,
      brands_allowed: brandId,
      is_active: true,
    })
      .populate("user_id")
      .lean();

    if (!dealers.length) {
      return res.status(200).json({
        success: true,
        message: "No dealers found with this category",
        data: [],
      });
    }

    res.status(200).json({
      success: true,
      message: "Dealers fetched successfully",
      data: dealers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addAllowedCategories = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { categories } = req.body;

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ message: "Categories array is required" });
    }

    // Find dealer and update
    const dealer = await Dealer.findByIdAndUpdate(
      dealerId,
      {
        $addToSet: { categories_allowed: { $each: categories } }, // $addToSet prevents duplicates
        $set: { updated_at: new Date() },
      },
      { new: true, runValidators: true }
    ).populate("user_id", "name email");

    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Categories added successfully",
      data: {
        dealer,
        addedCategories: categories,
        totalAllowedCategories: dealer.categories_allowed.length,
      },
    });
  } catch (error) {
    console.error("Error adding categories:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.removeAllowedCategories = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { categories } = req.body;

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ message: "Categories array is required" });
    }

    // Find dealer and update
    const dealer = await Dealer.findByIdAndUpdate(
      dealerId,
      {
        $pull: { categories_allowed: { $in: categories } }, // Remove all matching categories
        $set: { updated_at: new Date() },
      },
      { new: true, runValidators: true }
    ).populate("user_id", "name email");

    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Categories removed successfully",
      data: {
        dealer,
        removedCategories: categories,
        remainingCategories: dealer.categories_allowed,
      },
    });
  } catch (error) {
    console.error("Error removing categories:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.getEmployeeStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default to all time if no dates provided
    let dateFilter = {};

    if (startDate && endDate) {
      const queryStartDate = new Date(startDate);
      const queryEndDate = new Date(endDate);

      // Validate dates
      if (isNaN(queryStartDate.getTime()) || isNaN(queryEndDate.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Please use ISO date format (YYYY-MM-DD)",
          message: "Invalid date format",
        });
      }

      queryEndDate.setHours(23, 59, 59, 999);

      dateFilter = {
        created_at: {
          $gte: queryStartDate,
          $lte: queryEndDate,
          $exists: true,
          $ne: null,
        },
      };
    } else {
      // Even for all time, ensure created_at exists and is not null
      dateFilter = {
        created_at: {
          $exists: true,
          $ne: null,
        },
      };
    }

    // Get total employees
    let totalEmployees = 0;
    try {
      totalEmployees = await Employee.countDocuments(dateFilter);
    } catch (error) {
      console.error("Error counting total employees:", error);
    }

    // Get employees by role
    let employeesByRole = [];
    try {
      employeesByRole = await Employee.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: { $ifNull: ["$role", "Unknown"] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);
    } catch (aggregationError) {
      console.error("Error in employeesByRole aggregation:", aggregationError);
      employeesByRole = [];
    }

    // Get employees with assigned dealers
    let employeesWithDealers = 0;
    try {
      employeesWithDealers = await Employee.countDocuments({
        ...dateFilter,
        assigned_dealers: { $exists: true, $ne: [], $size: { $gt: 0 } },
      });
    } catch (error) {
      console.error("Error counting employees with dealers:", error);
    }

    // Get employees with assigned regions
    let employeesWithRegions = 0;
    try {
      employeesWithRegions = await Employee.countDocuments({
        ...dateFilter,
        assigned_regions: { $exists: true, $ne: [], $size: { $gt: 0 } },
      });
    } catch (error) {
      console.error("Error counting employees with regions:", error);
    }

    // Get recently active employees (logged in within last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let recentlyActiveEmployees = 0;
    try {
      recentlyActiveEmployees = await Employee.countDocuments({
        ...dateFilter,
        last_login: { $gte: thirtyDaysAgo, $exists: true, $ne: null },
      });
    } catch (error) {
      console.error("Error counting recently active employees:", error);
    }

    // Get employees created in different time periods
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    let newEmployees7Days = 0,
      newEmployees30Days = 0,
      newEmployees90Days = 0;
    try {
      [newEmployees7Days, newEmployees30Days, newEmployees90Days] =
        await Promise.all([
          Employee.countDocuments({
            created_at: { $gte: last7Days, $exists: true, $ne: null },
          }),
          Employee.countDocuments({
            created_at: { $gte: last30Days, $exists: true, $ne: null },
          }),
          Employee.countDocuments({
            created_at: { $gte: last90Days, $exists: true, $ne: null },
          }),
        ]);
    } catch (error) {
      console.error("Error counting new employees by period:", error);
    }

    // Get recent employees (last 10)
    let recentEmployees = [];
    try {
      recentEmployees = await Employee.find({
        ...dateFilter,
        created_at: { $exists: true, $ne: null },
      })
        .sort({ created_at: -1 })
        .limit(10)
        .select("employee_id First_name role created_at last_login")
        .populate("user_id", "email phone_Number");
    } catch (error) {
      console.error("Error fetching recent employees:", error);
    }

    // Get employees by creation month (for chart)
    let employeesByMonth = [];
    try {
      employeesByMonth = await Employee.aggregate([
        { $match: dateFilter },
        {
          $addFields: {
            isValidDate: {
              $and: [
                { $ne: ["$created_at", null] },
                { $ne: ["$created_at", ""] },
                { $eq: [{ $type: "$created_at" }, "date"] },
              ],
            },
          },
        },
        {
          $match: {
            isValidDate: true,
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$created_at" },
              month: { $month: "$created_at" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);
    } catch (aggregationError) {
      console.error("Error in employeesByMonth aggregation:", aggregationError);
      // Continue with empty array if aggregation fails
      employeesByMonth = [];
    }

    // Calculate average employees per role
    const avgEmployeesPerRole =
      totalEmployees > 0
        ? parseFloat(
          (totalEmployees / (employeesByRole.length || 1)).toFixed(2)
        )
        : 0;

    const stats = {
      period: {
        startDate: dateFilter.created_at?.$gte || null,
        endDate: dateFilter.created_at?.$lte || null,
        isAllTime: !startDate && !endDate,
      },
      summary: {
        totalEmployees: totalEmployees || 0,
        employeesWithDealers: employeesWithDealers || 0,
        employeesWithRegions: employeesWithRegions || 0,
        recentlyActiveEmployees: recentlyActiveEmployees || 0,
        avgEmployeesPerRole: avgEmployeesPerRole,
      },
      byRole: employeesByRole.map((item) => ({
        role: item._id || "Unknown",
        count: item.count || 0,
      })),
      newEmployees: {
        last7Days: newEmployees7Days || 0,
        last30Days: newEmployees30Days || 0,
        last90Days: newEmployees90Days || 0,
      },
      employeesByMonth: (employeesByMonth || []).map((item) => ({
        year: item._id?.year || 0,
        month: item._id?.month || 0,
        count: item.count || 0,
      })),
      recentEmployees: recentEmployees.map((emp) => ({
        employee_id: emp.employee_id,
        first_name: emp.First_name,
        role: emp.role,
        created_at: emp.created_at,
        last_login: emp.last_login,
        email: emp.user_id?.email || "",
        phone: emp.user_id?.phone_Number || "",
      })),
    };

    return res.status(200).json({
      success: true,
      message: "Employee statistics retrieved successfully",
      data: stats,
    });
  } catch (error) {
    console.error("Error getting employee stats:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
};

/**
 * Add Bank Details for User
 * This function can add new bank details or update existing ones
 */
exports.addBankDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      account_number,
      ifsc_code,
      account_type,
      bank_account_holder_name,
      bank_name,
    } = req.body;

    // Validate required fields
    if (
      !account_number ||
      !ifsc_code ||
      !account_type ||
      !bank_account_holder_name ||
      !bank_name
    ) {
      return sendError(res, "All bank details fields are required", 400);
    }

    // Validate account number (should be numeric and between 9-18 digits)
    if (!/^\d{9,18}$/.test(account_number)) {
      return sendError(res, "Invalid account number format", 400);
    }

    // Validate IFSC code (should be 11 characters: 4 letters + 7 alphanumeric)
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code.toUpperCase())) {
      return sendError(res, "Invalid IFSC code format", 400);
    }

    // Validate account type
    const validAccountTypes = [
      "Savings",
      "Current",
      "Fixed Deposit",
      "Recurring Deposit",
    ];
    if (!validAccountTypes.includes(account_type)) {
      return sendError(
        res,
        "Invalid account type. Must be one of: Savings, Current, Fixed Deposit, Recurring Deposit",
        400
      );
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Check if bank details already exist
    const hasExistingBankDetails =
      user.bank_details && user.bank_details.account_number;

    // Add or update bank details
    user.bank_details = {
      account_number,
      ifsc_code: ifsc_code.toUpperCase(),
      account_type,
      bank_account_holder_name,
      bank_name,
    };

    await user.save();

    const action = hasExistingBankDetails ? "updated" : "added";
    logger.info(`✅ Bank details ${action} for user: ${userId}`);

    return sendSuccess(
      res,
      {
        user: {
          _id: user._id,
          email: user.email,
          phone_Number: user.phone_Number,
          bank_details: user.bank_details,
        },
      },
      `Bank details ${action} successfully`
    );
  } catch (error) {
    logger.error(`❌ Add bank details error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Update Bank Details for User
 * This function can both create new bank details and update existing ones
 */
exports.updateBankDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      account_number,
      ifsc_code,
      account_type,
      bank_account_holder_name,
      bank_name,
    } = req.body;

    // Validate required fields
    if (
      !account_number ||
      !ifsc_code ||
      !account_type ||
      !bank_account_holder_name ||
      !bank_name
    ) {
      return sendError(res, "All bank details fields are required", 400);
    }

    // Validate account number (should be numeric and between 9-18 digits)
    if (!/^\d{9,18}$/.test(account_number)) {
      return sendError(res, "Invalid account number format", 400);
    }

    // Validate IFSC code (should be 11 characters: 4 letters + 7 alphanumeric)
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code.toUpperCase())) {
      return sendError(res, "Invalid IFSC code format", 400);
    }

    // Validate account type
    const validAccountTypes = [
      "Savings",
      "Current",
      "Fixed Deposit",
      "Recurring Deposit",
    ];
    if (!validAccountTypes.includes(account_type)) {
      return sendError(
        res,
        "Invalid account type. Must be one of: Savings, Current, Fixed Deposit, Recurring Deposit",
        400
      );
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Check if bank details already exist
    const hasExistingBankDetails =
      user.bank_details && user.bank_details.account_number;

    // Update or create bank details
    user.bank_details = {
      account_number,
      ifsc_code: ifsc_code.toUpperCase(),
      account_type,
      bank_account_holder_name,
      bank_name,
    };

    await user.save();

    const action = hasExistingBankDetails ? "updated" : "created";
    logger.info(`✅ Bank details ${action} for user: ${userId}`);

    return sendSuccess(
      res,
      {
        user: {
          _id: user._id,
          email: user.email,
          phone_Number: user.phone_Number,
          bank_details: user.bank_details,
        },
      },
      `Bank details ${action} successfully`
    );
  } catch (error) {
    logger.error(`❌ Update bank details error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Get Bank Details for User
 */
exports.getBankDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user
    const user = await User.findById(userId).select(
      "_id email phone_Number bank_details"
    );
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Check if bank details exist
    if (!user.bank_details || !user.bank_details.account_number) {
      return sendError(res, "No bank details found for this user", 404);
    }

    logger.info(`✅ Bank details retrieved for user: ${userId}`);
    return sendSuccess(
      res,
      {
        user: {
          _id: user._id,
          email: user.email,
          phone_Number: user.phone_Number,
          bank_details: user.bank_details,
        },
      },
      "Bank details retrieved successfully"
    );
  } catch (error) {
    logger.error(`❌ Get bank details error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Delete Bank Details for User
 */
exports.deleteBankDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Check if bank details exist
    if (!user.bank_details || !user.bank_details.account_number) {
      return sendError(res, "No bank details found for this user", 404);
    }

    // Remove bank details
    user.bank_details = {
      account_number: null,
      ifsc_code: null,
      account_type: null,
      bank_account_holder_name: null,
      bank_name: null,
    };

    await user.save();

    logger.info(`✅ Bank details deleted for user: ${userId}`);
    return sendSuccess(
      res,
      {
        user: {
          _id: user._id,
          email: user.email,
          phone_Number: user.phone_Number,
          bank_details: user.bank_details,
        },
      },
      "Bank details deleted successfully"
    );
  } catch (error) {
    logger.error(`❌ Delete bank details error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Validate IFSC Code
 */
exports.validateIFSC = async (req, res) => {
  try {
    const { ifsc_code } = req.query;

    if (!ifsc_code) {
      return sendError(res, "IFSC code is required", 400);
    }

    // Validate IFSC code format
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifsc_code.toUpperCase())) {
      return sendError(res, "Invalid IFSC code format", 400);
    }

    // Here you could integrate with a bank API to validate the IFSC code
    // For now, we'll just return the format validation result
    const isValid = ifscRegex.test(ifsc_code.toUpperCase());

    logger.info(`✅ IFSC validation for: ${ifsc_code}`);
    return sendSuccess(
      res,
      {
        ifsc_code: ifsc_code.toUpperCase(),
        isValid,
        message: isValid
          ? "IFSC code format is valid"
          : "Invalid IFSC code format",
      },
      "IFSC validation completed"
    );
  } catch (error) {
    logger.error(`❌ IFSC validation error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Get Bank Details by Account Number (for admin purposes)
 */
exports.getBankDetailsByAccountNumber = async (req, res) => {
  try {
    const { account_number } = req.params;

    if (!account_number) {
      return sendError(res, "Account number is required", 400);
    }

    // Find user by account number
    const user = await User.findOne({
      "bank_details.account_number": account_number,
    }).select("_id email phone_Number bank_details");

    if (!user) {
      return sendError(res, "No user found with this account number", 404);
    }

    logger.info(
      `✅ Bank details retrieved by account number: ${account_number}`
    );
    return sendSuccess(
      res,
      {
        user: {
          _id: user._id,
          email: user.email,
          phone_Number: user.phone_Number,
          bank_details: user.bank_details,
        },
      },
      "Bank details retrieved successfully"
    );
  } catch (error) {
    logger.error(
      `❌ Get bank details by account number error: ${error.message}`
    );
    return sendError(res, error);
  }
};

/**
 * Assign Employees to Dealer
 */
exports.assignEmployeesToDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { employeeIds, assignmentNotes } = req.body;

    // Validate input
    if (
      !employeeIds ||
      !Array.isArray(employeeIds) ||
      employeeIds.length === 0
    ) {
      return sendError(
        res,
        "Employee IDs array is required and cannot be empty",
        400
      );
    }

    // Find dealer
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return sendError(res, "Dealer not found", 404);
    }

    // Validate that dealer is active
    if (!dealer.is_active) {
      return sendError(res, "Cannot assign employees to inactive dealer", 400);
    }

    // Validate that all employees exist and are active
    const employees = await Employee.find({
      _id: { $in: employeeIds },
      user_id: { $exists: true },
    }).populate("user_id", "email username role");

    if (employees.length !== employeeIds.length) {
      return sendError(res, "One or more employees not found", 404);
    }

    // Check for invalid employee roles (only certain roles can be assigned to dealers)
    const validRoles = [
      "Fulfillment-Staff",
      "Fulfillment-Admin",
      "Inventory-Staff",
      "Inventory-Admin",
    ];
    const invalidEmployees = employees.filter(
      (emp) => !validRoles.includes(emp.user_id.role)
    );

    // if (invalidEmployees.length > 0) {
    //   return sendError(res, `Invalid employee roles: ${invalidEmployees.map(emp => emp.user_id.role).join(', ')}`, 400);
    // }

    // Prepare new assignments
    const newAssignments = employeeIds.map((employeeId) => ({
      assigned_user: employeeId,
      assigned_at: new Date(),
      status: "Active",
      notes: assignmentNotes || "",
    }));

    // Add new assignments to dealer
    dealer.assigned_Toprise_employee.push(...newAssignments);
    dealer.updated_at = new Date();

    await dealer.save();

    // Update employee models with assigned dealer
    await Employee.updateMany(
      { _id: { $in: employeeIds } },
      {
        $addToSet: { assigned_dealers: dealerId },
        $set: { updated_at: new Date() },
      }
    );

    // Populate the updated dealer with employee details
    const updatedDealer = await Dealer.findById(dealerId)
      .populate({
        path: "assigned_Toprise_employee.assigned_user",
        populate: {
          path: "user_id",
          select: "email username role phone_Number",
        },
      })
      .populate("user_id", "email username phone_Number");

    logger.info(`✅ Employees assigned to dealer: ${dealerId}`);
    return sendSuccess(
      res,
      {
        dealer: updatedDealer,
        assignedEmployees: employees.map((emp) => ({
          employeeId: emp._id,
          employeeId_code: emp.employee_id,
          name: emp.First_name,
          email: emp.user_id?.email || "N/A",
          role: emp.user_id?.role || "N/A",
          phone: emp.user_id?.phone_Number || "N/A",
        })),
        assignmentCount: newAssignments.length,
      },
      "Employees assigned to dealer successfully"
    );
  } catch (error) {
    logger.error(`❌ Assign employees to dealer error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Remove Employees from Dealer
 */
exports.removeEmployeesFromDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { employeeIds, removalReason } = req.body;

    // Validate input
    if (
      !employeeIds ||
      !Array.isArray(employeeIds) ||
      employeeIds.length === 0
    ) {
      return sendError(
        res,
        "Employee IDs array is required and cannot be empty",
        400
      );
    }

    // Find dealer
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return sendError(res, "Dealer not found", 404);
    }

    // Update assignment status to "Removed" for specified employees
    const updateResult = await Dealer.updateMany(
      { _id: dealerId },
      {
        $set: {
          "assigned_Toprise_employee.$[elem].status": "Removed",
          "assigned_Toprise_employee.$[elem].removed_at": new Date(),
          "assigned_Toprise_employee.$[elem].removal_reason":
            removalReason || "No reason provided",
          updated_at: new Date(),
        },
      },
      {
        arrayFilters: [{ "elem.assigned_user": { $in: employeeIds } }],
      }
    );

    if (updateResult.modifiedCount === 0) {
      return sendError(
        res,
        "No employees found with specified IDs for this dealer",
        404
      );
    }

    // Update employee models to remove dealer assignment
    await Employee.updateMany(
      { _id: { $in: employeeIds } },
      {
        $pull: { assigned_dealers: dealerId },
        $set: { updated_at: new Date() },
      }
    );

    // Get updated dealer with employee details
    const updatedDealer = await Dealer.findById(dealerId)
      .populate({
        path: "assigned_Toprise_employee.assigned_user",
        populate: {
          path: "user_id",
          select: "email username role phone_Number",
        },
      })
      .populate("user_id", "email username phone_Number");

    // Get removed employees details
    const removedEmployees = await Employee.find({
      _id: { $in: employeeIds },
    }).populate("user_id", "email username role phone_Number");

    logger.info(`✅ Employees removed from dealer: ${dealerId}`);
    return sendSuccess(
      res,
      {
        dealer: updatedDealer,
        removedEmployees: removedEmployees.map((emp) => ({
          employeeId: emp._id,
          employeeId_code: emp.employee_id,
          name: emp.First_name,
          email: emp.user_id?.email || "N/A",
          role: emp.user_id?.role || "N/A",
          phone: emp.user_id?.phone_Number || "N/A",
        })),
        removalCount: employeeIds.length,
        removalReason: removalReason || "No reason provided",
      },
      "Employees removed from dealer successfully"
    );
  } catch (error) {
    logger.error(`❌ Remove employees from dealer error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Get Dealer's Assigned Employees
 */
exports.getDealerAssignedEmployees = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { status = "Active" } = req.query;

    // Validate status filter
    const validStatuses = ["Active", "Removed", "Updated"];
    if (!validStatuses.includes(status)) {
      return sendError(
        res,
        "Invalid status filter. Must be one of: Active, Removed, Updated",
        400
      );
    }

    // Find dealer with populated employee details
    const dealer = await Dealer.findById(dealerId)
      .populate({
        path: "assigned_Toprise_employee.assigned_user",
        populate: {
          path: "user_id",
          select: "email username role phone_Number",
        },
      })
      .populate("user_id", "email username phone_Number");

    if (!dealer) {
      return sendError(res, "Dealer not found", 404);
    }

    // Filter assignments by status and ensure assigned_user exists
    const filteredAssignments = dealer.assigned_Toprise_employee.filter(
      (assignment) => assignment.status === status && assignment.assigned_user
    );

    // Group assignments by status for summary
    const statusSummary = dealer.assigned_Toprise_employee.reduce(
      (acc, assignment) => {
        acc[assignment.status] = (acc[assignment.status] || 0) + 1;
        return acc;
      },
      {}
    );

    logger.info(`✅ Retrieved assigned employees for dealer: ${dealerId}`);
    return sendSuccess(
      res,
      {
        dealer: {
          _id: dealer._id,
          dealerId: dealer.dealerId,
          legal_name: dealer.legal_name,
          trade_name: dealer.trade_name,
          is_active: dealer.is_active,
        },
        assignedEmployees: filteredAssignments.map((assignment) => ({
          assignmentId: assignment._id,
          employeeId: assignment.assigned_user._id,
          employeeId_code: assignment.assigned_user.employee_id,
          name: assignment.assigned_user.First_name,
          email: assignment.assigned_user.user_id?.email || "N/A",
          role: assignment.assigned_user.user_id?.role || "N/A",
          phone: assignment.assigned_user.user_id?.phone_Number || "N/A",
          assigned_at: assignment.assigned_at,
          status: assignment.status,
          notes: assignment.notes,
          removed_at: assignment.removed_at,
          removal_reason: assignment.removal_reason,
        })),
        summary: {
          totalAssignments: dealer.assigned_Toprise_employee.length,
          statusBreakdown: statusSummary,
          currentFilter: status,
        },
      },
      "Dealer assigned employees retrieved successfully"
    );
  } catch (error) {
    logger.error(`❌ Get dealer assigned employees error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Update Employee Assignment Status
 */
exports.updateEmployeeAssignmentStatus = async (req, res) => {
  try {
    const { dealerId, assignmentId } = req.params;
    const { status, notes } = req.body;

    // Validate status
    const validStatuses = ["Active", "Removed", "Updated"];
    if (!validStatuses.includes(status)) {
      return sendError(
        res,
        "Invalid status. Must be one of: Active, Removed, Updated",
        400
      );
    }

    // Find dealer
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return sendError(res, "Dealer not found", 404);
    }

    // Find and update the specific assignment
    const assignment = dealer.assigned_Toprise_employee.id(assignmentId);
    if (!assignment) {
      return sendError(res, "Assignment not found", 404);
    }

    // Update assignment
    assignment.status = status;
    assignment.notes = notes || assignment.notes;

    if (status === "Removed") {
      assignment.removed_at = new Date();
    } else if (status === "Active") {
      assignment.removed_at = undefined;
      assignment.removal_reason = undefined;
    }

    dealer.updated_at = new Date();
    await dealer.save();

    // Update employee model based on status change
    if (assignment) {
      if (status === "Removed") {
        // Remove dealer from employee's assigned_dealers
        await Employee.findByIdAndUpdate(assignment.assigned_user, {
          $pull: { assigned_dealers: dealerId },
          $set: { updated_at: new Date() },
        });
      } else if (status === "Active") {
        // Add dealer to employee's assigned_dealers
        await Employee.findByIdAndUpdate(assignment.assigned_user, {
          $addToSet: { assigned_dealers: dealerId },
          $set: { updated_at: new Date() },
        });
      }
    }

    // Get updated dealer with populated details
    const updatedDealer = await Dealer.findById(dealerId)
      .populate({
        path: "assigned_Toprise_employee.assigned_user",
        populate: {
          path: "user_id",
          select: "email username role phone_Number",
        },
      })
      .populate("user_id", "email username phone_Number");

    const updatedAssignment =
      updatedDealer.assigned_Toprise_employee.id(assignmentId);

    if (!updatedAssignment || !updatedAssignment.assigned_user) {
      return sendError(
        res,
        "Assignment or assigned user not found after update",
        404
      );
    }

    logger.info(
      `✅ Employee assignment status updated for dealer: ${dealerId}`
    );
    return sendSuccess(
      res,
      {
        dealer: {
          _id: updatedDealer._id,
          dealerId: updatedDealer.dealerId,
          legal_name: updatedDealer.legal_name,
          trade_name: updatedDealer.trade_name,
        },
        assignment: {
          assignmentId: updatedAssignment._id,
          employeeId: updatedAssignment.assigned_user._id,
          employeeId_code: updatedAssignment.assigned_user.employee_id,
          name: updatedAssignment.assigned_user.First_name,
          email: updatedAssignment.assigned_user.user_id?.email || "N/A",
          role: updatedAssignment.assigned_user.user_id?.role || "N/A",
          status: updatedAssignment.status,
          notes: updatedAssignment.notes,
          assigned_at: updatedAssignment.assigned_at,
          removed_at: updatedAssignment.removed_at,
          removal_reason: updatedAssignment.removal_reason,
        },
      },
      "Employee assignment status updated successfully"
    );
  } catch (error) {
    logger.error(
      `❌ Update employee assignment status error: ${error.message}`
    );
    return sendError(res, error);
  }
};

/**
 * Get Employees Assigned to Multiple Dealers
 */
exports.getEmployeesAssignedToMultipleDealers = async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Get employee details with assigned dealers
    const employee = await Employee.findById(employeeId)
      .populate("user_id", "email username role phone_Number")
      .populate(
        "assigned_dealers",
        "dealerId legal_name trade_name Address is_active"
      );

    if (!employee) {
      return sendError(res, "Employee not found", 404);
    }

    if (!employee.assigned_dealers || employee.assigned_dealers.length === 0) {
      return sendError(res, "Employee not assigned to any dealers", 404);
    }

    // Get detailed assignment information from dealer model
    const dealerAssignments = await Promise.all(
      employee.assigned_dealers
        .filter((dealer) => dealer && dealer._id) // Filter out null dealers
        .map(async (dealer) => {
          try {
            const dealerWithAssignments = await Dealer.findById(
              dealer._id
            ).populate({
              path: "assigned_Toprise_employee.assigned_user",
              match: { _id: employeeId },
              populate: {
                path: "user_id",
                select: "email username role phone_Number",
              },
            });

            if (!dealerWithAssignments) {
              logger.warn(`Dealer not found: ${dealer._id}`);
              return null;
            }

            const assignment =
              dealerWithAssignments.assigned_Toprise_employee.find(
                (a) =>
                  a.assigned_user &&
                  a.assigned_user._id &&
                  a.assigned_user._id.toString() === employeeId
              );

            return {
              dealerId: dealer._id,
              dealerId_code: dealer.dealerId,
              legal_name: dealer.legal_name,
              trade_name: dealer.trade_name,
              address: dealer.Address,
              is_active: dealer.is_active,
              assignment: {
                assignmentId: assignment?._id,
                status: assignment?.status || "Active",
                assigned_at: assignment?.assigned_at,
                notes: assignment?.notes,
                removed_at: assignment?.removed_at,
                removal_reason: assignment?.removal_reason,
              },
            };
          } catch (error) {
            logger.error(
              `Error processing dealer ${dealer._id}:`,
              error.message
            );
            return null;
          }
        })
    );

    // Filter out null results
    const validDealerAssignments = dealerAssignments.filter(
      (assignment) => assignment !== null
    );

    logger.info(`✅ Retrieved dealer assignments for employee: ${employeeId}`);
    return sendSuccess(
      res,
      {
        employee: {
          employeeId: employee._id,
          employeeId_code: employee.employee_id,
          name: employee.First_name,
          email: employee.user_id.email,
          role: employee.user_id.role,
          phone: employee.user_id.phone_Number,
        },
        dealerAssignments: validDealerAssignments,
        totalDealers: validDealerAssignments.length,
        activeAssignments: validDealerAssignments.filter(
          (d) => d.assignment.status === "Active"
        ).length,
      },
      "Employee dealer assignments retrieved successfully"
    );
  } catch (error) {
    logger.error(`❌ Get employee dealer assignments error: ${error.message}`);
    return sendError(res, error);
  }
};

/**
 * Bulk Assign Employees to Dealers
 */
exports.bulkAssignEmployeesToDealers = async (req, res) => {
  try {
    const { assignments } = req.body;

    // Validate input
    if (
      !assignments ||
      !Array.isArray(assignments) ||
      assignments.length === 0
    ) {
      return sendError(
        res,
        "Assignments array is required and cannot be empty",
        400
      );
    }

    const results = [];
    const errors = [];

    for (const assignment of assignments) {
      try {
        const { dealerId, employeeIds, assignmentNotes } = assignment;

        if (!dealerId || !employeeIds || !Array.isArray(employeeIds)) {
          errors.push({
            dealerId,
            error:
              "Invalid assignment data: dealerId and employeeIds array required",
          });
          continue;
        }

        // Find dealer
        const dealer = await Dealer.findById(dealerId);
        if (!dealer) {
          errors.push({
            dealerId,
            error: "Dealer not found",
          });
          continue;
        }

        // Validate employees exist
        const employees = await Employee.find({
          _id: { $in: employeeIds },
        }).populate("user_id", "email username role");

        if (employees.length !== employeeIds.length) {
          errors.push({
            dealerId,
            error: "One or more employees not found",
          });
          continue;
        }

        // Add assignments
        const newAssignments = employeeIds.map((employeeId) => ({
          assigned_user: employeeId,
          assigned_at: new Date(),
          status: "Active",
          notes: assignmentNotes || "",
        }));

        dealer.assigned_Toprise_employee.push(...newAssignments);
        dealer.updated_at = new Date();
        await dealer.save();

        // Update employee models with assigned dealer
        await Employee.updateMany(
          { _id: { $in: employeeIds } },
          {
            $addToSet: { assigned_dealers: dealerId },
            $set: { updated_at: new Date() },
          }
        );

        results.push({
          dealerId,
          dealerName: dealer.legal_name,
          assignedEmployees: employees.length,
          success: true,
        });
      } catch (error) {
        errors.push({
          dealerId: assignment.dealerId,
          error: error.message,
        });
      }
    }

    logger.info(
      `✅ Bulk assignment completed. Success: ${results.length}, Errors: ${errors.length}`
    );
    return sendSuccess(
      res,
      {
        successfulAssignments: results,
        failedAssignments: errors,
        summary: {
          total: assignments.length,
          successful: results.length,
          failed: errors.length,
        },
      },
      "Bulk assignment completed"
    );
  } catch (error) {
    logger.error(`❌ Bulk assign employees error: ${error.message}`);
    return sendError(res, error);
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: "User" });
    logger.info("Fetched all users from DB");
    sendSuccess(res, users, "Users fetched successfully");
  } catch (err) {
    logger.error(`Fetch users error: ${err.message}`);
    sendError(res, err);
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const allusers = await User.countDocuments();
    const totalUsers = await User.countDocuments({ role: "User" });
    const totalAdmins = await User.countDocuments({ role: "Super-admin" });
    const totalFulfillmentAdmins = await User.countDocuments({
      role: "Fulfillment-Admin",
    });
    const totalFulfillmentStaffs = await User.countDocuments({
      role: "Fulfillment-Staff",
    });
    const totalInventoryAdmins = await User.countDocuments({
      role: "Inventory-Admin",
    });
    const totalInventoryStaffs = await User.countDocuments({
      role: "Inventory-Staff",
    });
    const totalDealers = await Dealer.countDocuments();
    const totalCustomers = await User.countDocuments({
      role: "Customer-Support",
    });

    logger.info("Fetched all users from DB");
    sendSuccess(
      res,
      {
        total: allusers,
        Users: totalUsers,
        Dealers: totalDealers,
        SuperAdmins: totalAdmins,
        FulfillmentAdmins: totalFulfillmentAdmins,
        FulfillmentStaffs: totalFulfillmentStaffs,
        InventoryAdmins: totalInventoryAdmins,
        InventoryStaffs: totalInventoryStaffs,
        Customer_Support: totalCustomers,
      },
      "Users fetched successfully"
    );
  } catch (err) {
    logger.error(`Fetch users error: ${err.message}`);
    sendError(res, err);
  }
};

exports.getDealersByCategoryId = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const dealers = await Dealer.find({
      is_active: true,
      categories_allowed: categoryId,
    })
      .populate("user_id")
      .lean();

    if (!dealers.length) {
      return res.status(200).json({
        success: true,
        message: "No dealers found with this category",
        data: [],
      });
    }

    res.status(200).json({
      success: true,
      message: "Dealers fetched successfully",
      data: dealers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDealersByCategoryName = async (req, res) => {
  try {
    const { categoryName } = req.params;
    const { includeSLAInfo = false, includeEmployeeInfo = false } = req.query;
    const authorizationHeader = req.headers.authorization;

    if (!categoryName) {
      return sendError(res, "Category name is required", 400);
    }

    // Find dealers that have the specified category in their categories_allowed array
    const dealers = await Dealer.find({
      is_active: true,
      categories_allowed: { $in: [categoryName] },
    })
      .populate("user_id", "email phone_Number role")
      .populate({
        path: "assigned_Toprise_employee.assigned_user",
        model: "Employee",
        populate: {
          path: "user_id",
          model: "User",
          select: "email username phone_Number role",
        },
      });

    if (!dealers || dealers.length === 0) {
      return sendSuccess(
        res,
        [],
        "No dealers found for the specified category"
      );
    }

    // Transform the dealers data to include employee details if requested
    let transformedDealers = dealers.map((dealer) => {
      const dealerObj = dealer.toObject();

      if (
        includeEmployeeInfo === "true" &&
        dealerObj.assigned_Toprise_employee &&
        dealerObj.assigned_Toprise_employee.length > 0
      ) {
        dealerObj.assigned_Toprise_employee =
          dealerObj.assigned_Toprise_employee.map((assignment) => {
            if (assignment.assigned_user) {
              return {
                ...assignment,
                employee_details: {
                  _id: assignment.assigned_user._id,
                  employee_id: assignment.assigned_user.employee_id,
                  First_name: assignment.assigned_user.First_name,
                  profile_image: assignment.assigned_user.profile_image,
                  mobile_number: assignment.assigned_user.mobile_number,
                  email: assignment.assigned_user.email,
                  role: assignment.assigned_user.role,
                  user_details: assignment.assigned_user.user_id,
                },
              };
            }
            return assignment;
          });
      }

      return dealerObj;
    });

    // Fetch SLA information if requested
    if (includeSLAInfo === "true") {
      try {
        // Fetch SLA information for all dealers in parallel
        const slaPromises = transformedDealers.map(async (dealer) => {
          try {
            // Fetch SLA type information
            if (dealer.SLA_type) {
              const slaTypeInfo = await fetchSLATypeInfo(
                dealer.SLA_type,
                authorizationHeader
              );
              dealer.sla_type_details = slaTypeInfo;
            }

            // Fetch dealer SLA configuration
            const dealerSLAConfig = await fetchDealerSLAConfig(
              dealer.dealerId,
              authorizationHeader
            );
            if (dealerSLAConfig) {
              dealer.sla_configuration = dealerSLAConfig;
            }

            // Fetch recent SLA violations (limit to 3 for list view)
            const slaViolations = await fetchDealerSLAViolations(
              dealer.dealerId,
              authorizationHeader,
              3
            );
            if (slaViolations) {
              dealer.recent_sla_violations = slaViolations;
            }

            // Add SLA summary information
            dealer.sla_summary = {
              sla_type: dealer.SLA_type,
              sla_type_details: dealer.sla_type_details,
              dispatch_hours: dealer.dispatch_hours,
              sla_max_dispatch_time: dealer.SLA_max_dispatch_time,
              sla_configuration: dealer.sla_configuration,
              recent_violations_count:
                dealer.recent_sla_violations?.length || 0,
            };

            return dealer;
          } catch (slaError) {
            logger.warn(
              `Failed to fetch SLA information for dealer ${dealer.dealerId}:`,
              slaError.message
            );
            return dealer; // Return dealer without SLA info
          }
        });

        transformedDealers = await Promise.all(slaPromises);
      } catch (slaError) {
        logger.warn(
          `Failed to fetch SLA information for dealers:`,
          slaError.message
        );
        // Continue without SLA info rather than failing the entire request
      }
    }

    // Add category information to response
    const response = {
      category_name: categoryName,
      total_dealers: transformedDealers.length,
      dealers: transformedDealers,
      filters: {
        category_name: categoryName,
        include_employee_info: includeEmployeeInfo === "true",
        include_sla_info: includeSLAInfo === "true",
      },
    };

    logger.info(
      `Fetched ${transformedDealers.length} dealers for category: ${categoryName}`
    );
    sendSuccess(
      res,
      response,
      `Dealers for category '${categoryName}' retrieved successfully`
    );
  } catch (err) {
    logger.error(`Get dealers by category name error: ${err.message}`);
    sendError(res, err);
  }
};

exports.sendResetEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // 1. Find the user
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    // 2. Create token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 5 min

    // 3. Save in DB
    await PasswordReset.create({
      userId: user._id,
      token,
      expiresAt
    });


    // 4. Build reset link
    const resetLink = `https://www.toprise.in/reset-password/${token}`;
    const username = user.username || user.email;
    const htmlTemplate = await resetPassword(username, resetLink);


    // 5. Send Email
    const sendData = await sendEmailNotifiation(
      user.email,
      "Password Reset",
      htmlTemplate
    );
    res.json({ success: true, message: "Password reset email sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.checkResetLink = async (req, res) => {
  try {
    const { token } = req.params;

    const resetDoc = await PasswordReset.findOne({ token });
    if (!resetDoc) {
      return res.status(400).json({ valid: false, message: "Invalid or expired token" });
    }

    if (resetDoc.used) {
      return res.status(400).json({ valid: false, message: "Token already used" });
    }

    if (resetDoc.expiresAt < new Date()) {
      return res.status(400).json({ valid: false, message: "Token expired" });
    }

    res.json({ valid: true, message: "Token is valid" });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
};


exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    const resetDoc = await PasswordReset.findOne({ token });
    if (!resetDoc) {
      return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }

    if (resetDoc.used) {
      return res.status(400).json({ success: false, message: "Token already used" });
    }

    if (resetDoc.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "Token expired" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await User.findByIdAndUpdate(resetDoc.userId, { password: hashedPassword });

    // Mark token as used
    resetDoc.used = true;
    await resetDoc.save();

    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.revokeEmployeeRole = async (req, res) => {
  try {
    const { employeeId, updatedBy } = req.body;

    if (!employeeId) {
      return sendError(res, "Employee ID is required", 400);
    }

    // Find the employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return sendError(res, "Employee not found", 404);
    }

    // Check if employee is already inactive
    if (!employee.active) {
      return sendError(res, "Employee role is already revoked", 400);
    }

    // Store original employee data for response
    const originalEmployeeData = {
      employee_id: employee.employee_id,
      First_name: employee.First_name,
      email: employee.email,
      role: employee.role,
      assigned_dealers: employee.assigned_dealers,
      assigned_regions: employee.assigned_regions,
      last_login: employee.last_login,
      created_at: employee.created_at,
      updated_at: employee.updated_at
    };

    // Ensure linked User's role is NOT changed during revoke
    const linkedUser = await User.findById(employee.user_id).lean();
    const preservedUserRole = linkedUser?.role;

    // Only update the active field to false
    employee.active = false;
    employee.updated_at = new Date();
    await employee.save();

    logger.info(
      `✅ Employee role revoked for: ${employee.employee_id} (${employee.First_name}) - Preserved user.role: ${preservedUserRole}`
    );

    return sendSuccess(res, {
      message: "Employee role revoked successfully",
      employee: {
        _id: employee._id,
        employee_id: employee.employee_id,
        First_name: employee.First_name,
        email: employee.email,
        role: employee.role,
        active: employee.active,
        revoked_at: employee.updated_at,
        revoked_by: updatedBy,
        original_data: originalEmployeeData
      }
    }, "Role revoked successfully (user.role preserved)");

  } catch (err) {
    logger.error(`❌ Revoke employee role error: ${err.message}`);
    return sendError(res, err);
  }
};

exports.reactivateEmployeeRole = async (req, res) => {
  try {
    const { employeeId, updatedBy } = req.body;

    if (!employeeId) {
      return sendError(res, "Employee ID is required", 400);
    }

    // Find the employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return sendError(res, "Employee not found", 404);
    }

    // Check if employee is already active
    if (employee.active) {
      return sendError(res, "Employee role is already active", 400);
    }

    // Only update the active field to true
    employee.active = true;
    employee.updated_at = new Date();
    await employee.save();

    logger.info(`✅ Employee role reactivated for: ${employee.employee_id} (${employee.First_name})`);

    return sendSuccess(res, {
      message: "Employee role reactivated successfully",
      employee: {
        _id: employee._id,
        employee_id: employee.employee_id,
        First_name: employee.First_name,
        email: employee.email,
        role: employee.role,
        active: employee.active,
        reactivated_at: employee.updated_at,
        reactivated_by: updatedBy
      }
    }, "Role reactivated successfully");

  } catch (err) {
    logger.error(`❌ Reactivate employee role error: ${err.message}`);
    return sendError(res, err);
  }
};

exports.setDealerPermissions = async (req, res) => {
  try {
    const { dealerId } = req.params;

    const {
      readPermissions,
      updatePermissions,
      isDelete,
      isAdd,
      isUpdateStock
    } = req.body;

    const dealer = await Dealer.findById(dealerId);
    // console.log(dealer);
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    if (dealer.is_permissios_set) {
      return res.status(400).json({
        message: "Permissions already set. Use edit API instead."
      });
    }

    dealer.permission = {
      readPermissions: readPermissions || dealer.permission.readPermissions,
      updatePermissions: updatePermissions || dealer.permission.updatePermissions,
      isDelete: isDelete ?? dealer.permission.isDelete,
      isAdd: isAdd ?? dealer.permission.isAdd,
      isUpdateStock: isUpdateStock ?? dealer.permission.isUpdateStock
    };

    dealer.is_permissios_set = true;
    dealer.updated_at = new Date();

    await dealer.save();

    res.status(200).json({
      message: "Permissions set successfully",
      permission: dealer.permission
    });

  } catch (error) {
    console.error("Error setting permissions:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



exports.updateDealerPermissions = async (req, res) => {
  try {
    const { dealerId } = req.params;

    const {
      readPermissions,
      updatePermissions,
      isDelete,
      isAdd,
      isUpdateStock
    } = req.body;

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    if (!dealer.permission || Object.keys(dealer.permission).length === 0) {
      dealer.permission = {
        readPermissions: {
          isEnabled: false,
          allowed_fields: []
        },
        updatePermissions: {
          isEnabled: false,
          allowed_fields: []
        },
        isDelete: false,
        isAdd: false,
        isUpdateStock: false
      };
    }

    if (readPermissions) {
      dealer.permission.readPermissions.isEnabled =
        readPermissions.isEnabled ??
        dealer.permission.readPermissions.isEnabled;

      dealer.permission.readPermissions.allowed_fields =
        readPermissions.allowed_fields ??
        dealer.permission.readPermissions.allowed_fields;
    }


    if (updatePermissions) {
      dealer.permission.updatePermissions.isEnabled =
        updatePermissions.isEnabled ??
        dealer.permission.updatePermissions.isEnabled;

      dealer.permission.updatePermissions.allowed_fields =
        updatePermissions.allowed_fields ??
        dealer.permission.updatePermissions.allowed_fields;
    }

    if (isDelete !== undefined) dealer.permission.isDelete = isDelete;
    if (isAdd !== undefined) dealer.permission.isAdd = isAdd;
    if (isUpdateStock !== undefined) dealer.permission.isUpdateStock = isUpdateStock;

    dealer.is_permissios_set = true;
    dealer.updated_at = new Date();

    await dealer.save();

    res.status(200).json({
      message: "Permissions created/updated successfully",
      permission: dealer.permission
    });

  } catch (error) {
    console.error("Error updating permissions:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getDealerPermissions = async (req, res) => {
  try {
    const { dealerId } = req.params;

    const dealer = await Dealer.findById(dealerId).select("permission is_permissios_set");
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    res.status(200).json({
      message: "Dealer permissions fetched successfully",
      permission: dealer.permission,
      is_permissios_set: dealer.is_permissios_set
    });

  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


exports.getEmployeeByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    const employee = await Employee.findOne({ user_id: userId })
      .populate("user_id",)
      .populate("assigned_dealers");
    if (!employee) {
      return res.status(404).json({ message: "Employee not found for the given User ID" });
    }

    res.status(200).json({
      message: "Employee fetched successfully",
      employee
    });

  } catch (error) {
    console.error("Error fetching employee by User ID:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

exports.getDealersBydealerId = async (req, res) => {
  try {
    const { dealerId } = req.params;

    const dealers = await Dealer.find({ dealerId: dealerId });
    if (!dealers) {
      return res.status(404).json({ message: "Dealers not found for the given dealer ID" });
    }

    res.status(200).json({
      message: "Dealers fetched successfully",
      dealers
    });

  } catch (error) {
    console.error("Error fetching dealers by dealer ID:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}


exports.updateDealerLastfullfillmentTime = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const dealer = await Dealer.findOne({ _id: dealerId });
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found for the given dealer ID" });
    }

    dealer.last_fulfillment_date = new Date();
    dealer.updated_at = new Date();
    await dealer.save();

    res.status(200).json({
      message: "Dealer last fullfillment time updated successfully",
      dealer
    });

  } catch (error) {
    console.error("Error updating dealer last fullfillment time:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }

}



exports.getAllfullfillmentStafsAndAdmins = async (req, res) => {
  try {
    const users = await Employee.find({
      role: "Fulfillment-Staff",
      active: true,
    })
    logger.info(
      `Fetched ${users.length} fulfillment staff and admin members`
    );
    return sendSuccess(
      res,
      { data: users },
      "Fulfillment staff and admin retrieved successfully"
    );
  } catch (error) {
    logger.error(`Error fetching fulfillment staff and admin: ${error.message}`);
    return sendError(res, error);
  }
}

exports.getDealerByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    const dealer = await Dealer.findOne({ user_id: userId });
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found for the given User ID" });
    }

    res.status(200).json({
      message: "Dealer fetched successfully",
      dealer
    });

  } catch (error) {
    console.error("Error fetching dealer by User ID:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

exports.searchUserByEmailOrName = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return sendError(res, "Search query is required", 400);
    }

    const users = await User.find({
      $or: [
        { email: { $regex: query, $options: "i" } },
        { username: { $regex: query, $options: "i" } }
      ]
    }).select("email username role phone_Number");

    logger.info(`Fetched ${users.length} users matching query: ${query}`);
    return sendSuccess(
      res,
      { data: users },
      "Users retrieved successfully"
    );
  } catch (error) {
    logger.error(`Error searching users: ${error.message}`);
    return sendError(res, error);
  }
}


exports.addAllowedBrandsToDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { brands } = req.body;

    if (!brands || !Array.isArray(brands) || brands.length === 0) {
      return sendError(res, "Brands array is required and cannot be empty", 400);
    }

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return sendError(res, "Dealer not found", 404);
    }

    // Add new brands to the allowed_brands array, avoiding duplicates
    dealer.brands_allowed = Array.from(new Set([...dealer.brands_allowed, ...brands]));
    dealer.updated_at = new Date();
    await dealer.save();

    logger.info(`✅ Added allowed brands to dealer: ${dealerId}`);
    return sendSuccess(
      res,
      {
        dealerId: dealer._id,
        legal_name: dealer.legal_name,
        trade_name: dealer.trade_name,
        brands_allowed: dealer.brands_allowed,
      },
      "Allowed brands added to dealer successfully"
    );
  } catch (error) {
    logger.error(`❌ Add allowed brands to dealer error: ${error.message}`);
    return sendError(res, error);
  }
}

exports.removeAllowedBrandsFromDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { brands } = req.body;
    if (!brands || !Array.isArray(brands) || brands.length === 0) {
      return sendError(res, "Brands array is required and cannot be empty", 400);
    }

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return sendError(res, "Dealer not found", 404);
    }

    // Remove specified brands from the allowed_brands array
    dealer.brands_allowed = dealer.brands_allowed.filter(
      (brand) => !brands.includes(brand)
    );
    dealer.updated_at = new Date();
    await dealer.save();

    logger.info(`✅ Removed allowed brands from dealer: ${dealerId}`);
    return sendSuccess(
      res,
      {
        dealerId: dealer._id,
        legal_name: dealer.legal_name,
        trade_name: dealer.trade_name,
        brands_allowed: dealer.brands_allowed,
      },
      "Allowed brands removed from dealer successfully"
    );
  } catch (error) {
    logger.error(`❌ Remove allowed brands from dealer error: ${error.message}`);
    return sendError(res, error);
  }
}

exports.getDealerByBrandId = async (req, res) => {
  try {
    const { brandId } = req.params;

    const dealers = await Dealer.find({
      is_active: true,
      brands_allowed: { $in: [brandId] },
    })
      .populate("user_id", "email phone_Number role")
      .lean();

    if (!dealers || dealers.length === 0) {
      return sendSuccess(
        res,
        [],
        "No dealers found for the specified brand"
      );
    }

    logger.info(
      `Fetched ${dealers.length} dealers for brand: ${brandId}`
    );
    sendSuccess(
      res,
      {
        brand_id: brandId,
        total_dealers: dealers.length,
        dealers: dealers,
      },
      `Dealers for brand '${brandId}' retrieved successfully`
    );
  } catch (err) {
    logger.error(`Get dealers by brand ID error: ${err.message}`);
    sendError(res, err);
  }
};

exports.removeSlaFromDealers = async (req, res) => {
  try {

    const { slaId } = req.body;

    const dealers = await Dealer.find({ SLA_type: slaId });
    if (!dealers || dealers.length === 0) {
      return sendSuccess(
        res,
        [],
        "No dealers found for the specified SLA"
      );
    }

    for (const dealer of dealers) {
      dealer.SLA_type = null;
      await dealer.save();
    }

    logger.info(
      `Removed SLA from ${dealers.length} dealers`
    );
    sendSuccess(
      res,
      {
        total_dealers: dealers.length,
        dealers: dealers,
      },
      `SLA removed from dealers successfully`
    );
  } catch (err) {
    logger.error(`Remove SLA from dealers error: ${err.message}`);
    sendError(res, err);
  }
};

exports.getEmployeesForAssignment = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const dealers = await Dealer.findById(dealerId);
    if (!dealers) {
      return sendError(res, "Dealer not found", 404);
    }

    const employees = await Employee.find({ role: "Fulfillment-Staff", });
    if (!employees || employees.length === 0) {
      return sendError(res, "No employees found", 404);
    }

    const availableEmployees = employees.filter(
      (emp) => !emp.assigned_dealers.includes(dealers._id)
    );
    const availableEmployeesWithNoDealer = employees.filter(
      (emp) => emp.assigned_dealers.length === 0
    )
    const assignedEmployees = employees.filter(
      (emp) => emp.assigned_dealers.includes(dealers._id)
    );

    logger.info(
      `Fetched ${availableEmployees.length} employees for assignment`
    );
    sendSuccess(res, { availableEmployees,availableEmployeesWithNoDealer, assignedEmployees }, "Employees fetched successfully");
  } catch (err) {
    logger.error(`Get employees for assignment error: ${err.message}`);
    sendError(res, err);
  }
};

exports.getDealerPincodes = async (req, res) => {
  try {
    const { dealerId } = req.params;

    const dealer = await Dealer.findById(dealerId).lean();

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }
    //getAllPincodes
    const allPincodes=[];
    try {
    const res = await axios.get(
      `http://product-service:5001/api/pincodes/get/all`,
      {
        headers: {
          "Content-Type": "application/json",
          // Authorization: authHeader || "",
        },
      }
    );

    if (res.data?.success && res.data?.data) {
      allPincodes.push(...res.data.data);
    }

  } catch (err) {
    console.log(err);
    throw new Error(`Failed to fetch pincode `,err);
  }
 

    // Convert string IDs → ObjectIds
    const mappedPincodeObjectIds = (dealer.serviceable_pincodes || []).map(
      id => new mongoose.Types.ObjectId(id)
    );

 
    const mappedPincodes =  allPincodes.filter(pincode =>
      mappedPincodeObjectIds.some(
        mappedId => mappedId.equals(pincode._id)
      )
    );

    const unmappedPincodes = allPincodes.filter(pincode =>
      !mappedPincodeObjectIds.some(
        mappedId => mappedId.equals(pincode._id)
      )
    );

    return res.json({
      success: true,
      mapped: mappedPincodes,
      unmapped: unmappedPincodes,
    });

  } catch (err) {
    console.error("Dealer pincode fetch error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};


exports.getDealersByServiceablePincode = async (req, res) => {
  try {
    const { pincode } = req.params;
    const authHeader = req.headers.authorization;

    if (!pincode) {
      return res.status(400).json({
        success: false,
        message: "Pincode is required",
      });
    }

    // 🔹 Step 1: Convert pincode → pincodeId
    const pincodeId = await getServiceablePincodeId(pincode, authHeader);

    // 🔹 Step 2: Find dealers
    const dealers = await Dealer.find({
      is_active: true,
      serviceable_pincodes: pincodeId,
    })
      .select(
        "dealerId legal_name trade_name GSTIN Address contact_person brands_allowed categories_allowed default_margin permission"
      )
      .sort({ created_at: -1 });

    return res.status(200).json({
      success: true,
      count: dealers.length,
      data: dealers,
    });
  } catch (error) {
    console.error("Get dealers by pincode error:", error.message);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dealers",
    });
  }
};