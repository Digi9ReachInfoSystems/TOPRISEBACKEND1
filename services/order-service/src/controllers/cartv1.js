const Cart = require("../models/cart");

const {
  cacheGet,
  cacheSet,
  cacheDel, // ⬅️ writer-side “del” helper
} = require("/packages/utils/cache");
const logger = require("/packages/utils/logger");
const { sendSuccess, sendError } = require("/packages/utils/responseHandler");
const Redis = require("redis");
const axios = require("axios");
const redisClient = require("/packages/utils/redisClient");

const calculateCartTotals = async (items, existingDeliveryCharge = 0) => {
  let setting = await axios.get("http://user-service:5001/api/appSetting/");
  const availableItems = items.filter(item => item.is_available === true);
  const totalPrice = availableItems.reduce(
    (acc, item) => acc + item.selling_price,
    0
  );
  const handlingCharge = 0;

  const gst_amount = availableItems.reduce((acc, item) => acc + item.gst_amount, 0);
  const itemTotal = availableItems.reduce((acc, item) => acc + item.product_total, 0);
  const total_mrp = availableItems.reduce((acc, item) => acc + item.mrp, 0);
  const total_mrp_gst_amount = availableItems.reduce(
    (acc, item) => acc + item.mrp_gst_amount,
    0
  );
  const total_mrp_with_gst = availableItems.reduce(
    (acc, item) => acc + item.total_mrp,
    0
  );

  //   const deliveryCharge = itemTotal < setting.data.data.minimumOrderValue
  //     ? setting.data.data.deliveryCharge
  //     : 0;

  const grandTotal = (totalPrice + handlingCharge + existingDeliveryCharge).toFixed(2);

  return {
    totalPrice: totalPrice.toFixed(2),
    handlingCharge: handlingCharge.toFixed(2),
    deliveryCharge: existingDeliveryCharge.toFixed(2),
    gst_amount: gst_amount.toFixed(2),
    itemTotal: itemTotal.toFixed(2),
    total_mrp: total_mrp.toFixed(2),
    total_mrp_gst_amount: total_mrp_gst_amount.toFixed(2),
    total_mrp_with_gst: total_mrp_with_gst.toFixed(2),
    grandTotal,
  };
};

const updateCartItemsPrice = async (items, token, pincode) => {
  let returnData = await Promise.all(
    items.map(async (item) => {
      const product = await axios.get(
        `http://product-service:5001/products/v1/get-ProductById/${item.productId}`,
        {
          headers: {
            Authorization: token,
          },
        }
      );
      if (!product) {
        logger.error(`❌ Product not found for product: ${item.productId}`);
        return null;
      }
      let pincodeDetails;
      let pincodeId;
      try {
        const res = await axios.get(
          `http://product-service:5001/api/pincodes/get/serviceable/${pincode}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: token || "",
            },
          }
        );

        if (res.data?.success && res.data?.data?._id) {
          pincodeId = res.data.data._id.toString(); // ✅ store as string
          pincodeDetails = res.data.data;
        }

      } catch (err) {
        console.log(err);
      }
      if (product.data.data.live_status == "Rejected") {
        logger.error(`❌ Product no longer available: ${item.productId}`);
        return null;
      }
      if (product.data.data.out_of_stock) {
        logger.error(`❌ Product out of stock: ${item.productId}`);
        return null;
      }
      const productData = product.data.data;

      let availableDealer = [];
      if (productData.available_dealers && productData.available_dealers.length > 0) {
        availableDealer = await Promise.all(productData.available_dealers.map(async (dealer) => {
          try {
            const res = await axios.get(
              `http://user-service:5001/api/users/dealer/${dealer.dealers_Ref}`,
              {
                headers: {
                  "Content-Type": "application/json",
                  Authorization: token || "",
                },
              }
            );
            const dealerData = res.data.data;
            if (!dealerData) {
              return {
                ...dealer,
                serviceable_pincodes: false,
                // Return dealer as is if dealerData is not found
              }
            }

            return {
              ...dealer,
              serviceable_pincodes: dealerData.serviceable_pincodes.includes(pincodeId.toString()) || false,
            }



          } catch (err) {
            console.log("error", err);
            return null;
            // throw new Error(`Failed to fetch pincode ${pincode}: ${err.message}`);
          }
        }));
      }
      console.log("availableDealer", availableDealer);
      availableDealer = availableDealer.filter(dealer => dealer !== null);
      let isServiceable = []

      if (availableDealer.length == 0) {
        isServiceable = false;
      } else {
        isServiceable = availableDealer.some(dealer => dealer.serviceable_pincodes && dealer.inStock);
      }
      console.log("isServiceable", isServiceable);
      item.product_image =
        productData.images.length > 0
          ? productData.images
          : [
            "https://firebasestorage.googleapis.com/v0/b/lmseducationplaform.appspot.com/o/Media%201.svg?alt=media&token=454fba64-184a-4612-a5df-e473f964daa1",
          ];
      item.product_name = productData.product_name;
      item.selling_price = productData.selling_price * item.quantity;
      // item.mrp = ((productData.mrp_with_gst-((productData.mrp_with_gst)*(productData.gst_percentage/100))) * item.quantity).toFixed(2);
      item.mrp = (productData.mrp_with_gst * item.quantity).toFixed(2);
      item.mrp_gst_amount =
        // (productData.mrp_with_gst / 100) *
        // productData.gst_percentage *
        // item.quantity;
        productData.mrp_with_gst * item.quantity;
      item.total_mrp =
        ((productData.mrp_with_gst) * item.quantity).toFixed(2);
      // ((productData.mrp_with_gst
      //   //  +
      //   // (productData.mrp_with_gst ) * (productData.gst_percentage/ 100)
      // ) *
      // item.quantity).toFixed(2);
      item.sku = productData.sku_code;
      item.gst_amount =
        // (productData.selling_price / 100) *
        // productData.gst_percentage *
        // item.quantity;
        ((((productData.selling_price) * (productData.gst_percentage / 100))) * item.quantity).toFixed(2);
      item.product_total = productData.selling_price * item.quantity;
      item.totalPrice =
        // (productData.selling_price +
        //   (productData.selling_price / 100) * productData.gst_percentage) *
        // item.quantity;
        (productData.selling_price) * item.quantity;
      item.is_available = isServiceable;
      return item;
    })
  );
  returnData = returnData.filter((item) => item !== null);
  return returnData;
};

async function getOrSetCache(key, callback, ttl) {
  try {
    const cachedData = await cacheGet(key);

    if (cachedData !== null) {
      return cachedData;
    }

    const freshData = await callback();

    await cacheSet(key, freshData, ttl);
    return freshData;
  } catch (err) {
    console.warn(`getOrSetCache failed for key ${key}: ${err.message}`);
    return callback();
  }
}

exports.addToCart = async (req, res) => {
  try {
    const { userId, productId, pincode } = req.body;
    let quantity = parseInt(req.body.quantity) || 1;
    if (quantity > 10) {
      quantity = 10;
    }
    const product = await axios.get(
      `http://product-service:5001/products/v1/get-ProductById/${productId}`,
      {
        headers: {
          Authorization: req.headers.authorization,
        },
      }
    );
    if (!product) {
      logger.error(`❌ Product not found for product: ${productId}`);
      sendError(res, "Product not found", 404);
    }
    // get pincode details
    const authHeader = req.headers.authorization;
    let pincodeDetails;
    let pincodeId;
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
        pincodeId = res.data.data._id.toString(); // ✅ store as string
        pincodeDetails = res.data.data;
      }

    } catch (err) {
      console.log(err);
    }


    const productData = product.data.data;

    let availableDealer = [];
    if (productData.available_dealers && productData.available_dealers.length > 0) {
      availableDealer = await Promise.all(productData.available_dealers.map(async (dealer) => {
        try {
          const res = await axios.get(
            `http://user-service:5001/api/users/dealer/${dealer.dealers_Ref}`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader || "",
              },
            }
          );
          const dealerData = res.data.data;

          return {
            ...dealer,
            serviceable_pincodes: dealerData.serviceable_pincodes.includes(pincodeId.toString()) || false,
          }



        } catch (err) {
          console.log(err);
          return null;
          // throw new Error(`Failed to fetch pincode ${pincode}: ${err.message}`);
        }
      }));
    }
    availableDealer = availableDealer.filter(dealer => dealer !== null);
    // console.log("availableDealer", availableDealer);

    if (availableDealer.length == 0) {
      logger.error(`❌ Product not serviceable at pincode: ${pincode}`);
      return sendSuccess(res, {
        success: false,
        productId,
        serviceable: false,
        message: `Product not serviceable at pincode: ${pincode}`,
      }, "Product quantity updated successfully");
    }

    //check if any dealer services the pincode
    const isServiceable = availableDealer.some(dealer => dealer.serviceable_pincodes && dealer.inStock);


    let cart = await Cart.findOne({ userId });

    if (!cart) {
      if (!isServiceable) {
        // logger.error(`❌ Product not serviceable at pincode: ${pincode}`);
        //  return sendSuccess(res, {
        //   success: false,
        //   productId,
        //   serviceable: false,
        //   message: `Product not serviceable at pincode: ${pincode}`,
        //  }, "Product added to cart successfully");
      } else {


        cart = new Cart({
          userId,
          items: [
            {
              productId,
              product_image:
                productData.images.length > 0
                  ? productData.images
                  : [
                    "https://firebasestorage.googleapis.com/v0/b/lmseducationplaform.appspot.com/o/Media%201.svg?alt=media&token=454fba64-184a-4612-a5df-e473f964daa1",
                  ],
              product_name: productData.product_name,
              quantity,
              gst_percentage: productData.gst_percentage.toString(),
              selling_price: productData.selling_price,
              mrp: productData.mrp_with_gst,
              mrp_gst_amount:
                (productData.mrp_with_gst / 100) * productData.gst_percentage,
              total_mrp:
                productData.mrp_with_gst +
                (productData.mrp_with_gst / 100) * productData.gst_percentage,
              sku: productData.sku_code,
              gst_amount:
                (productData.selling_price / 100) *
                productData.gst_percentage *
                quantity,
              product_total: productData.selling_price * quantity,
              totalPrice:
                (productData.selling_price +
                  (productData.selling_price / 100) *
                  productData.gst_percentage) *
                quantity,
              is_available: true,
            },
          ],
          pincode: pincode,
        });

        const updatedUser = await axios.put(
          `http://user-service:5001/api/users/update-cartId/${userId}`,
          {
            cartId: cart._id,
          },
          {
            headers: {
              Authorization: req.headers.authorization,
            },
          }
        );
      }
      // cart = new Cart({ userId, items: [{ productId, quantity, selling_price: 100, mrp_with_gst: 200, sku: 'ABCDE' }] });
    } else {
      const itemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId
      );



      if (itemIndex > -1) {
        if (!isServiceable) {

          // logger.error(`❌ Product not serviceable at pincode: ${pincode}`);
          //  return sendSuccess(res, {
          //   success: false,
          //   productId,
          //   serviceable: false,
          //   message: `Product not serviceable at pincode: ${pincode}`,
          //  }, "Product added to cart successfully");
          cart.items[itemIndex].is_available = false
          cart.pincode = pincode;
        } else {
          if (cart.items[itemIndex].quantity + quantity > 10) {
            cart.items[itemIndex].quantity = 10;
          } else {
            cart.items[itemIndex].quantity += quantity;
          }
          cart.items[itemIndex].is_available = true;
          cart.pincode = pincode;
        }

      } else {
        if (!isServiceable) {
          logger.error(`❌ Product not serviceable at pincode: ${pincode}`);
        } else {


          cart.items.push({
            productId,
            product_image:
              productData.images.length > 0
                ? productData.images
                : [
                  "https://firebasestorage.googleapis.com/v0/b/lmseducationplaform.appspot.com/o/Media%201.svg?alt=media&token=454fba64-184a-4612-a5df-e473f964daa1",
                ],
            product_name: productData.product_name,
            quantity,
            gst_percentage: productData.gst_percentage.toString(),
            selling_price: productData.selling_price,
            mrp: productData.mrp_with_gst,
            mrp_gst_amount:
              (productData.mrp_with_gst / 100) * productData.gst_percentage,
            total_mrp:
              productData.mrp_with_gst +
              (productData.mrp_with_gst / 100) * productData.gst_percentage,
            sku: productData.sku_code,
            gst_amount:
              (productData.selling_price / 100) *
              productData.gst_percentage *
              quantity,
            product_total: productData.selling_price * quantity,
            totalPrice:
              (productData.selling_price +
                (productData.selling_price / 100) * productData.gst_percentage) *
              quantity,
            is_available: true,
          });
        }
      }
    }
    cart.pincode = pincode;
    await cart.save();
    cart.items = await updateCartItemsPrice(
      cart.items,
      req.headers.authorization,
      pincode
    );
    const totals = await calculateCartTotals(cart.items, cart.deliveryCharge || 0);
    Object.assign(cart, totals);

    const savedCart = await cart.save();
    logger.info(`✅ Product added to cart for user: ${userId}`);
    cacheDel(`cart:${userId}`);
    if (!isServiceable) {
      logger.error(`❌ Product not serviceable at pincode: ${pincode}`);
      return sendSuccess(res, {
        success: false,
        productId,
        serviceable: false,
        message: `Product not serviceable at pincode: ${pincode}`,
      }, "Product added to cart successfully");
    }
    return sendSuccess(res, { cart: savedCart, success: true }, "Product added to cart successfully");
  } catch (err) {
    logger.error(`❌ Add to cart error: ${err}`);
    return sendError(res, err);
  }
};

exports.removeProduct = async (req, res) => {
  try {
    const { userId, productId, pincode } = req.body;
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId
    );
    cart.items = await updateCartItemsPrice(
      cart.items,
      req.headers.authorization,
      pincode
    );
    const totals = await calculateCartTotals(cart.items, cart.deliveryCharge || 0);
    Object.assign(cart, totals);
    cart.pincode = pincode;
    await cart.save();

    logger.info(`✅ Product removed from cart for user: ${userId}`);
    cacheDel(`cart:${userId}`);
    return sendSuccess(res, cart, "Product removed from cart successfully");
  } catch (err) {
    logger.error(`❌ Remove from cart error: ${err}`);
    return sendError(res, err);
  }
};

exports.updateQuantity = async (req, res) => {
  try {
    const { userId, productId, pincode } = req.body;
    const { action } = req.query;

    if (!["increase", "decrease"].includes(action)) {
      return res
        .status(400)
        .json({ message: "Invalid action. Use 'increase' or 'decrease'" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    const product = await axios.get(
      `http://product-service:5001/products/v1/get-ProductById/${productId}`,
      {
        headers: {
          Authorization: req.headers.authorization,
        },
      }
    );
    if (!product) {
      logger.error(`❌ Product not found for product: ${productId}`);
      sendError(res, "Product not found", 404);
    }

    // get pincode details
    const authHeader = req.headers.authorization;
    let pincodeDetails;
    let pincodeId;
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
        pincodeId = res.data.data._id.toString(); // ✅ store as string
        pincodeDetails = res.data.data;
      }

    } catch (err) {
      console.log(err);
      // throw new Error(`Failed to fetch pincode ${pincode}: ${err.message}`);
    }


    const productData = product.data.data;

    let availableDealer = [];
    if (productData.available_dealers && productData.available_dealers.length > 0) {
      availableDealer = await Promise.all(productData.available_dealers.map(async (dealer) => {
        try {
          const res = await axios.get(
            `http://user-service:5001/api/users/dealer/${dealer.dealers_Ref}`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader || "",
              },
            }
          );
          const dealerData = res.data.data;

          return {
            ...dealer,
            serviceable_pincodes: dealerData.serviceable_pincodes.includes(pincodeId.toString()) || false,
          }



        } catch (err) {
          console.log(err);
          return null;
          // throw new Error(`Failed to fetch pincode ${pincode}: ${err.message}`);
        }
      }));
    }
    // console.log("availableDealer", availableDealer);
    availableDealer = availableDealer.filter(dealer => dealer !== null);

    if (availableDealer.length == 0) {
      logger.error(`❌ Product not serviceable at pincode: ${pincode}`);
      return sendSuccess(res, {
        success: false,
        productId,
        serviceable: false,
        message: `Product not serviceable at pincode: ${pincode}`,
      }, "Product quantity updated successfully");
    }

    //check if any dealer services the pincode
    const isServiceable = availableDealer.some(dealer => dealer.serviceable_pincodes && dealer.inStock);



    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (itemIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    if (action === "increase") {
      if (!isServiceable) {
        cart.items[itemIndex].is_available = false;
      } else {
        if (cart.items[itemIndex].quantity >= 10) {
          return res.status(400).json({ message: "Maximum quantity reached" });
        } else {
          cart.items[itemIndex].quantity += 1;
        }

        cart.items[itemIndex].is_available = true;
      }

    } else if (action === "decrease") {
      if (cart.items[itemIndex].quantity > 1) {
        if (!isServiceable) {
          cart.items[itemIndex].is_available = false;
        } else {
          cart.items[itemIndex].is_available = true;
          cart.items[itemIndex].quantity -= 1;

        }
      } else {
        // Optionally remove if quantity is 1 and decreasing
        cart.items.splice(itemIndex, 1);
      }
    }
    cart.items = await updateCartItemsPrice(
      cart.items,
      req.headers.authorization,
      pincode
    );
    const totals = await calculateCartTotals(cart.items, cart.deliveryCharge || 0);
    Object.assign(cart, totals);
    cart.pincode = pincode;
    await cart.save();
    if (action === "decrease") {
      logger.info(`✅ Product quantity decreased for user: ${userId}`);
    } else {
      logger.info(`✅ Product quantity increased for user: ${userId}`);
    }
    cacheDel(`cart:${userId}`);
    if (!isServiceable) {
      logger.error(`❌ Product not serviceable at pincode: ${pincode}`);
      return sendSuccess(res, {
        success: false,
        productId,
        serviceable: false,
        message: `Product not serviceable at pincode: ${pincode}`,
      }, "Product quantity updated successfully");
    }
    sendSuccess(res, { success: true, cart: cart }, "Product quantity updated successfully");
  } catch (err) {
    logger.error(`❌ Update quantity error: ${err}`);
    sendError(res, err);
  }
};

exports.getCart = async (req, res) => {
  try {
    const { userId, pincode } = req.params;
    // const cart = await getOrSetCache(`cart:${userId}`, async () => {
    //     const cart = await Cart.findOne({ userId });
    //     if (!cart) {
    //         logger.error(`❌ Cart not found for user: ${userId}`);
    //         return res.status(404).json({ message: "Cart not found" });
    //     }
    //     return cart
    // })

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      logger.error(`❌ Cart not found for user: ${userId}`);
      return res.status(404).json({ message: "Cart not found" });
    }
    cart.items = await updateCartItemsPrice(
      cart.items,
      req.headers.authorization,
      pincode
    );
    const totals = await calculateCartTotals(cart.items, cart.deliveryCharge || 0);
    Object.assign(cart, totals);
    cart.pincode = pincode;
    const savedCart = await cart.save();
    logger.info(`✅ Cart fetched for user: ${userId}`);
    sendSuccess(res, savedCart, "Cart fetched successfully");
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCartById = async (req, res) => {
  try {
    const { id, pincode } = req.params;
    const cart = await Cart.findById(id);
    if (!cart) {
      logger.error(`❌ cart not found for id: ${id}`);
      return res.status(404).json({ message: "Cart not found" });
    }
    cart.items = await updateCartItemsPrice(
      cart.items,
      req.headers.authorization,
      pincode
    );
    const totals = await calculateCartTotals(cart.items, cart.deliveryCharge || 0);
    Object.assign(cart, totals);
    cart.pincode = pincode;
    const savedCart = await cart.save();
    logger.info(`✅ Cart fetched for id: ${id}`);
    sendSuccess(res, savedCart, "Cart fetched successfully");
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
};

exports.getDeliveryChargeForBuyNow = async (req, res) => {
  try {
    const { deliveryType, totalAmount } = req.body;
    const validDeliveryTypes = ["express", "standard"];
    if (!validDeliveryTypes.includes(deliveryType.toLowerCase())) {
      return res
        .status(400)
        .json({ error: "Delivery type must be 'express' or 'standard'" });
    }
    let deliveryCharge = 0;
    let settingDeliveryCharge = 0;
    let settingMinOrderAmount = 0;
    const authHeader = req.headers.authorization;
    try {
      const res = await axios.get(
        `http://user-service:5001/api/appSetting`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader || "",
          },
        }
      );
      console.log("App Setting Response:", res.data);

      if (res.data?.success && res.data?.data) {
        settingDeliveryCharge = res.data.data.deliveryCharge || 0;
        settingMinOrderAmount = res.data.data.minimumOrderValue || 0;
      }

    } catch (err) {
      console.log(err);
      // throw new Error(`Failed to fetch pincode ${pincode}: ${err.message}`);
    }

    if (totalAmount < settingMinOrderAmount) {
      if (deliveryType.toLowerCase() === "express") {
        deliveryCharge = settingDeliveryCharge;
      } else if (deliveryType.toLowerCase() === "standard") {
        deliveryCharge = 90;
      }
    }
    logger.info(`✅ Delivery charge fetched`);
    sendSuccess(res, deliveryCharge, "Delivery charge fetched successfully");
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
