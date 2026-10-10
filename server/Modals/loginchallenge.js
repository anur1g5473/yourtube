import mongoose from "mongoose";

const loginChallengeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    deviceHash: { type: String, required: true },
    codeHash: { type: String, required: true },
    channel: { type: String, enum: ["email", "sms"], default: "email" },
    destination: { type: String },
    sourceIp: { type: String },
    browser: { type: String },
    os: { type: String },
    deviceType: { type: String },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

loginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
loginChallengeSchema.index({ userId: 1, deviceHash: 1, verifiedAt: 1 });

export default mongoose.model("loginchallenge", loginChallengeSchema);
