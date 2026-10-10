import mongoose from "mongoose";

const watchProgressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    videoId: { type: String, required: true },
    currentTime: { type: Number, required: true, min: 0 },
    duration: { type: Number, required: true, min: 0 },
    completed: { type: Boolean, default: false },
    lastWatchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

watchProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true });

export default mongoose.model("watchprogress", watchProgressSchema);
