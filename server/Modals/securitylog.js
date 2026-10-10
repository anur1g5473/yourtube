import mongoose from "mongoose";

const securityLogSchema = mongoose.Schema(
  {
    userId: { type: String, required: true },
    eventType: { type: String, default: "login" },
    status: { type: String, enum: ["success", "failed", "otp_verified", "challenge"], default: "success" },
    ipAddress: { type: String },
    browser: { type: String },
    os: { type: String },
    deviceType: { type: String },
    deviceModel: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    locationStatus: { type: String, enum: ["resolved", "not_found", "unconfigured", "lookup_failed"] },
    latitude: { type: Number },
    longitude: { type: Number },
    trustedDevice: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("securitylog", securityLogSchema);
