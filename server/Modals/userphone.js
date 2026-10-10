import mongoose from "mongoose";

const userPhoneSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    phoneNumber: { type: String },
    phoneVerifiedAt: { type: Date },
    pendingPhoneNumber: { type: String },
    pendingSentAt: { type: Date },
    pendingExpiresAt: { type: Date },
    verificationAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("userphone", userPhoneSchema);
