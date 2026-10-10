import Subscription from "../Modals/subscription.js";
import PaymentOrder from "../Modals/paymentorder.js";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { sendSubscriptionReceipt } from "../services/receiptEmail.js";

export const planCatalog = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "Monthly",
    description: "Basic access with limited downloads and watch time.",
    features: ["Basic streaming", "1 download per day", "Standard quality"],
  },
  {
    id: "bronze",
    name: "Bronze",
    price: 199,
    period: "Monthly",
    description: "For users wanting more flexibility and download access.",
    features: ["HD streaming", "10 downloads per month", "Priority video access"],
  },
  {
    id: "silver",
    name: "Silver",
    price: 499,
    period: "Monthly",
    description: "A balanced premium plan for frequent learners and viewers.",
    features: ["4K streaming", "Unlimited offline downloads", "Ad-free experience"],
  },
  {
    id: "gold",
    name: "Gold",
    price: 999,
    period: "Monthly",
    description: "Full access for premium members and power users.",
    features: ["Unlimited access", "Premium courses", "Fast streaming and all premium perks"],
  },
];

const billingPeriods = {
  monthly: { months: 1, multiplier: 1 },
  quarterly: { months: 3, multiplier: 2.7 },
  yearly: { months: 12, multiplier: 9.6 },
};

const deliverReceiptSafely = async (subscription, email, displayName) => {
  try {
    return await sendSubscriptionReceipt(subscription, email, displayName);
  } catch (error) {
    console.error("Unable to record subscription receipt delivery:", error);
    return { status: "failed" };
  }
};

const razorpayConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

async function razorpayRequest(endpoint, method, body) {
  const credentials = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Razorpay API request failed:", response.status, data);
    const error = new Error("Payment provider request failed");
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return data;
}

export const getPlans = async (req, res) => {
  try {
    return res.status(200).json(planCatalog);
  } catch (error) {
    console.error("Error loading plans:", error);
    return res.status(500).json({ message: "Failed to load subscription plans" });
  }
};

export const getMySubscription = async (req, res) => {
  try {
    const userId = req.authenticatedUser._id.toString();
    const billingHistory = await Subscription.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    let subscription = billingHistory.find(
      (item) =>
        ["active", "cancelled"].includes(item.status) &&
        item.endDate &&
        item.endDate > new Date()
    );

    if (!subscription) {
      const expiredSubscription = billingHistory.find(
        (item) => item.status === "active" && item.endDate && item.endDate <= new Date()
      );
      if (expiredSubscription) {
        await Subscription.updateOne(
          { _id: expiredSubscription._id, status: "active" },
          { $set: { status: "expired" } }
        );
      }
      subscription = {
        plan: "free",
        status: "active",
        remainingDays: 0,
      };
    } else {
      subscription.remainingDays = Math.max(
        0,
        Math.ceil((new Date(subscription.endDate).getTime() - Date.now()) / 86400000)
      );
    }

    return res.status(200).json({ subscription, billingHistory });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return res.status(500).json({ message: "Unable to fetch subscription status" });
  }
};

export const createPaymentOrder = async (req, res) => {
  const { plan, billingPeriod = "monthly" } = req.body;
  const selectedPlan = planCatalog.find((item) => item.id === plan);
  const period = billingPeriods[billingPeriod];
  if (!selectedPlan || selectedPlan.id === "free" || !period) {
    return res.status(400).json({ message: "Choose a valid paid plan and billing period" });
  }
  if (!razorpayConfigured()) {
    return res.status(503).json({ message: "Razorpay test keys are not configured on the server" });
  }
  try {
    const amount = Math.round(selectedPlan.price * period.multiplier * 100);
    const userId = req.authenticatedUser._id.toString();
    const order = await razorpayRequest("/orders", "POST", {
      amount,
      currency: "INR",
      receipt: `sub_${userId.slice(-8)}_${Date.now()}`,
      notes: { userId, plan, billingPeriod },
    });
    await PaymentOrder.create({
      userId,
      plan,
      billingPeriod,
      amount,
      orderId: order.id,
    });

    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Error creating payment order:", error);
    return res.status(error.status || 500).json({ message: error.message || "Failed to create payment order" });
  }
};

export const verifyPayment = async (req, res) => {
  const { orderId, paymentId, signature } = req.body;
  if (![orderId, paymentId, signature].every((value) => typeof value === "string" && value)) {
    return res.status(400).json({ message: "Order, payment, and signature are required" });
  }
  if (!razorpayConfigured()) {
    return res.status(503).json({ message: "Razorpay test keys are not configured on the server" });
  }

  try {
    const userId = req.authenticatedUser._id.toString();
    const pendingOrder = await PaymentOrder.findOne({ orderId, userId });
    if (!pendingOrder) {
      return res.status(404).json({ message: "Payment order not found for this account" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${pendingOrder.orderId}|${paymentId}`)
      .digest();
    const providedSignature = Buffer.from(signature, "hex");
    if (
      providedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(providedSignature, expectedSignature)
    ) {
      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    const existingSubscription = await Subscription.findOne({ paymentId });
    if (existingSubscription) {
      const receipt = existingSubscription.receiptEmailStatus === "sent"
        ? { status: "sent" }
        : await deliverReceiptSafely(existingSubscription, req.authenticatedUser.email, req.authenticatedUser.name);
      return res.status(200).json({
        message: "Payment already verified",
        subscription: existingSubscription,
        receiptEmailStatus: receipt.status,
      });
    }

    const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, "GET");
    if (
      payment.order_id !== pendingOrder.orderId ||
      payment.amount !== pendingOrder.amount ||
      payment.currency !== pendingOrder.currency
    ) {
      return res.status(400).json({ message: "Payment details do not match the server order" });
    }
    if (payment.status === "authorized") {
      await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, "POST", {
        amount: pendingOrder.amount,
        currency: pendingOrder.currency,
      });
    } else if (payment.status !== "captured") {
      return res.status(409).json({ message: "Payment has not been captured successfully" });
    }

    const capturedPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, "GET");
    if (capturedPayment.status !== "captured") {
      return res.status(409).json({ message: "Payment capture is still pending" });
    }

    const startDate = new Date();
    const durationMonths = billingPeriods[pendingOrder.billingPeriod].months;
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);
    await Subscription.updateMany(
      { userId, status: "active", endDate: { $gt: startDate } },
      { $set: { status: "superseded", autoRenew: false } }
    );
    const subscription = await Subscription.create({
      userId,
      plan: pendingOrder.plan,
      status: "active",
      price: pendingOrder.amount / 100,
      currency: pendingOrder.currency,
      billingPeriod: pendingOrder.billingPeriod,
      durationMonths,
      paymentStatus: "paid",
      paymentId,
      orderId: pendingOrder.orderId,
      invoiceNumber: `YT-${pendingOrder.orderId}`,
      startDate,
      endDate,
      renewalDate: endDate,
      autoRenew: false,
    });
    pendingOrder.paymentId = paymentId;
    pendingOrder.status = "verified";
    await pendingOrder.save();

    const receipt = await deliverReceiptSafely(subscription, req.authenticatedUser.email, req.authenticatedUser.name);
    return res.status(200).json({
      message: "Subscription activated",
      subscription,
      receiptEmailStatus: receipt.status,
    });
  } catch (error) {
    if (error?.code === 11000 && req.body.paymentId) {
      const subscription = await Subscription.findOne({ paymentId: req.body.paymentId });
      if (subscription) {
        const receipt = subscription.receiptEmailStatus === "sent"
          ? { status: "sent" }
          : await deliverReceiptSafely(subscription, req.authenticatedUser.email, req.authenticatedUser.name);
        return res.status(200).json({
          message: "Payment already verified",
          subscription,
          receiptEmailStatus: receipt.status,
        });
      }
    }
    console.error("Error verifying payment:", error);
    return res.status(error.status || 500).json({ message: error.message || "Failed to verify payment" });
  }
};

export const resendSubscriptionReceipt = async (req, res) => {
  const { subscriptionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
    return res.status(400).json({ message: "Invalid subscription ID" });
  }
  try {
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      userId: req.authenticatedUser._id.toString(),
      paymentStatus: "paid",
    });
    if (!subscription) return res.status(404).json({ message: "Paid subscription not found" });
    if (subscription.receiptEmailStatus === "sent") {
      return res.status(409).json({ message: "The receipt was already sent" });
    }

    const receipt = await sendSubscriptionReceipt(
      subscription,
      req.authenticatedUser.email,
      req.authenticatedUser.name
    );
    if (receipt.status !== "sent") {
      return res.status(502).json({ message: "Receipt email could not be sent. Check email configuration and retry." });
    }
    return res.status(200).json({ message: "Receipt email sent" });
  } catch (error) {
    console.error("Unable to resend subscription receipt:", error);
    return res.status(500).json({ message: "Unable to resend receipt email" });
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.authenticatedUser._id.toString();
    const subscription = await Subscription.findOneAndUpdate(
      { userId, status: "active", endDate: { $gt: new Date() } },
      { $set: { status: "cancelled", autoRenew: false } },
      { sort: { createdAt: -1 }, new: true }
    );
    if (!subscription) {
      return res.status(404).json({ message: "No active paid subscription to cancel" });
    }
    return res.status(200).json({ message: "Subscription cancelled", subscription });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return res.status(500).json({ message: "Failed to cancel subscription" });
  }
};
