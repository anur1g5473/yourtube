import mongoose from "mongoose";

const trustedDeviceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    deviceHash: { type: String, required: true },
    browser: { type: String, default: "Unknown" },
    os: { type: String, default: "Unknown" },
    deviceType: { type: String, default: "Unknown" },
    lastIp: { type: String },
    lastCity: { type: String },
    lastState: { type: String },
    lastCountry: { type: String },
    locationStatus: { type: String, enum: ["resolved", "not_found", "unconfigured", "lookup_failed"] },
    trustedUntil: { type: Date, required: true },
    lastUsedAt: { type: Date, default: Date.now },
    sessionId: { type: String },
  },
  { timestamps: true }
);

trustedDeviceSchema.index({ userId: 1, deviceHash: 1 }, { unique: true });

export default mongoose.model("trusteddevice", trustedDeviceSchema);
