import mongoose from "mongoose";

const downloadQuotaSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    bucketKey: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

downloadQuotaSchema.index({ userId: 1, bucketKey: 1 }, { unique: true });

export default mongoose.model("downloadquota", downloadQuotaSchema);
