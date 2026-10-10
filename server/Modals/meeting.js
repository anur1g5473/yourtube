import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

meetingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("meeting", meetingSchema);
