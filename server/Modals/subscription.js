import mongoose from "mongoose";

const subscriptionSchema = mongoose.Schema(
  {
    userId: { type: String, required: true },
    plan: { type: String, enum: ["free", "bronze", "silver", "gold"], default: "free" },
    status: { type: String, enum: ["active", "expired", "cancelled", "superseded"], default: "active" },
    price: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    billingPeriod: { type: String, enum: ["monthly", "quarterly", "yearly"], default: "monthly" },
    durationMonths: { type: Number, default: 1 },
    paymentStatus: { type: String, enum: ["paid", "free"], default: "free" },
    paymentId: { type: String, unique: true, sparse: true },
    orderId: { type: String },
    invoiceNumber: { type: String },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    renewalDate: { type: Date },
    autoRenew: { type: Boolean, default: false },
    receiptEmailStatus: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
    receiptSentAt: { type: Date },
    receiptMessageId: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("subscription", subscriptionSchema);
