import mongoose from "mongoose";

const paymentOrderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    plan: { type: String, enum: ["bronze", "silver", "gold"], required: true },
    billingPeriod: { type: String, enum: ["monthly", "quarterly", "yearly"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ["created", "verified", "failed"], default: "created" },
  },
  { timestamps: true }
);

export default mongoose.model("paymentorder", paymentOrderSchema);
