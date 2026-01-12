const express = require("express");
const router = express.Router();
const returnController = require("../controllers/return");
const {
    authenticate,
    authorizeRoles,
} = require("/packages/utils/authMiddleware");
const auditLogger = require("../.././../../packages/utils/auditLoggerMiddleware");

// Return request management
router.post("/create", 
    auditLogger("Order_Return_Created", "RETURN"),
    returnController.createReturnRequest);
router.get("/:returnId",  returnController.getReturnRequest);
router.get("/", returnController.getReturnRequests);
router.get("/stats/overview", returnController.getReturnRequestStats);
router.get("/user/:userId", returnController.getUserReturnRequests);
router.get("/user/:userId/test", returnController.testUserReturnRequests);
//return request byuser

// Return validation and processing
router.put("/:returnId/validate",
     auditLogger("Return_Validated", "RETURN"),
    returnController.validateReturnRequest);
router.put("/:returnId/schedule-pickup", returnController.schedulePickup);
router.put("/:returnId/complete-pickup", returnController.completePickup);

// Inspection process
router.put("/:returnId/start-inspection", returnController.startInspection);
router.put("/:returnId/complete-inspection", returnController.completeInspection);

// Refund processing

//TODO
router.put("/:returnId/process-refund", returnController.processRefund);
router.put("/:returnId/complete", returnController.completeReturn);

// Additional features
router.post("/:returnId/notes", returnController.addNote);

router.put("/validate-return/:returnId",
      auditLogger("Return_Validated", "RETURN"),
    returnController.validateReturnRequest);
router.put("/Intiate-Borzo-Return/:returnId",
      auditLogger("Return_Borzo_Initiated", "RETURN"),
    returnController.intiateBorzoOrderForReturn);
router.put("/start-Inspection/:returnId",returnController.startReturnRequestInspection);
router.put("/complete-Inspection/:returnId",
     auditLogger("Return_Inspection_Completed", "RETURN"),
    returnController.completeReturnRequestInspection); 
router.put("/Reject-return/:returnId",
    auditLogger("Return_Rejected", "RETURN"),
    returnController.rejectReturnRequest);
router.get("/return/stats",returnController.getReturnStatusCounts);

router.post("/return/forFullfillmentStaff",returnController.getReturnRequestsFulfillmentStaff);
router.put("/Intiate-Rapido-Return/:returnId",
      auditLogger("Return_Rapido_Initiated", "RETURN"),
    returnController.initiatesManualRapidoPickupForReturn);

router.put("/Deliver-Rapido-Return/:returnId",
    returnController.markDeliveredManualRapidoReturn);

module.exports = router;
