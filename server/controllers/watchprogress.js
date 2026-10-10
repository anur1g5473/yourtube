import mongoose from "mongoose";
import Video from "../Modals/video.js";
import WatchProgress from "../Modals/watchprogress.js";

export const getWatchProgress = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "Invalid video ID" });
  }

  try {
    const progress = await WatchProgress.findOne({
      userId: req.authenticatedUser._id.toString(),
      videoId,
    }).lean();
    return res.status(200).json({
      progress: progress || { currentTime: 0, duration: 0, completed: false },
    });
  } catch (error) {
    console.error("Unable to load watch progress:", error);
    return res.status(500).json({ message: "Unable to load watch progress" });
  }
};

export const saveWatchProgress = async (req, res) => {
  const { videoId } = req.params;
  const { currentTime, duration, completed = false } = req.body;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "Invalid video ID" });
  }
  if (
    !Number.isFinite(currentTime) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    currentTime < 0 ||
    currentTime > duration
  ) {
    return res.status(400).json({ message: "Valid playback position and duration are required" });
  }

  try {
    const exists = await Video.exists({ _id: videoId });
    if (!exists) return res.status(404).json({ message: "Video not found" });

    const progress = await WatchProgress.findOneAndUpdate(
      {
        userId: req.authenticatedUser._id.toString(),
        videoId,
      },
      {
        $set: {
          currentTime,
          duration,
          completed: Boolean(completed),
          lastWatchedAt: new Date(),
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
    return res.status(200).json({ progress });
  } catch (error) {
    console.error("Unable to save watch progress:", error);
    return res.status(500).json({ message: "Unable to save watch progress" });
  }
};
