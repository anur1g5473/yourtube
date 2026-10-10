import mongoose from "mongoose";

const downloadSchema = mongoose.Schema(
  {
    userId: { type: String, required: true },
    videoId: { type: String, required: true },
    videoTitle: { type: String, required: true },
    thumbnail: { type: String },
    fileSize: { type: String, default: "0 MB" },
    status: { type: String, enum: ["completed", "pending", "failed"], default: "completed" },
    plan: { type: String, default: "free" },
    quotaRemaining: { type: Number, default: 0 },
    bucketKey: { type: String, required: true },
    ipAddress: { type: String },
    browser: { type: String },
    device: { type: String },
    downloadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

downloadSchema.index(
  { userId: 1, videoId: 1, bucketKey: 1 },
  { unique: true, partialFilterExpression: { bucketKey: { $type: "string" } } }
);

export default mongoose.model("download", downloadSchema);
