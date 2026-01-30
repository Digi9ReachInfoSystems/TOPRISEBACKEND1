const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartv1");
const orderController = require("../controllers/order");

const {
  authenticate,
  authorizeRoles,
} = require("/packages/utils/authMiddleware");

router.post(
  "/addProduct",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "User"),
  cartController.addToCart
);

router.put(
  "/update",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "User"),
  cartController.updateQuantity
);

router.post(
  "/removeProduct",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "User"),
  cartController.removeProduct
);

// router.get(
//   "/getCart/:userId",
//   authenticate,
//   authorizeRoles("Super-admin", "Inventory-Admin", "User"),
//   cartController.getCart
// );
router.get(
  "/getCart/:userId/:pincode",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "User"),
  cartController.getCart
);

router.get(
  "/getCartById/:id/:pincode",
  authenticate,
  authorizeRoles("Super-admin", "Inventory-Admin", "User"),
  cartController.getCartById
);

router.put(
  "/updateDelivery",
  // authenticate,
  // authorizeRoles("Super-admin", "Inventory-Admin", "User"),
  orderController.updateCartWithDelivery
);

router.post("/add/newLoggedInUser",cartController.bulkAddToCart )
router.post("/get/deliveryChargeForBuyNow",cartController.getDeliveryChargeForBuyNow )

module.exports = router;
