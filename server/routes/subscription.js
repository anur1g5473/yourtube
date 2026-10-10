import express from "express";
import {
  cancelSubscription,
  createPaymentOrder,
  getMySubscription,
  getPlans,
  resendSubscriptionReceipt,
  verifyPayment,
} from "../controllers/subscription.js";
import { authenticateFirebase } from "../middleware/firebaseAuth.js";

const routes = express.Router();

routes.get("/plans", getPlans);
routes.get("/me", authenticateFirebase, getMySubscription);
routes.post("/orders", authenticateFirebase, createPaymentOrder);
routes.post("/verify", authenticateFirebase, verifyPayment);
routes.post("/receipts/:subscriptionId/resend", authenticateFirebase, resendSubscriptionReceipt);
routes.post("/cancel", authenticateFirebase, cancelSubscription);

export default routes;
