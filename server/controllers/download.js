import fs from "node:fs";
import path from "node:path";
import Download from "../Modals/download.js";
import DownloadQuota from "../Modals/downloadquota.js";
import Video from "../Modals/video.js";
import { canAccessPremiumVideo, getActivePlan, getPrivateVideoPath } from "../utils/subscriptionAccess.js";

const getQuotaPolicy = (plan) => {
  if (plan === "free") return { limit: 1, period: "day" };
  if (plan === "bronze") return { limit: 10, period: "month" };
  return { limit: Infinity, period: "month" };
};

const getBucket = (period, now = new Date()) => {
  const istNow = new Date(now.getTime() + 330 * 60 * 1000);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();
  if (period === "day") {
    return {
      key: `day:${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      start: new Date(Date.UTC(year, month, day) - 330 * 60 * 1000),
    };
  }
  return {
    key: `month:${year}-${String(month + 1).padStart(2, "0")}`,
    start: new Date(Date.UTC(year, month, 1) - 330 * 60 * 1000),
  };
};

const countUsed = (userId, bucketStart) =>
  Download.countDocuments({
    userId,
    downloadedAt: { $gte: bucketStart },
    status: { $in: ["pending", "completed"] },
  });

const reserveQuota = async ({ userId, bucketKey, limit, alreadyUsed }) => {
  if (!Number.isFinite(limit)) return;
  if (alreadyUsed >= limit) {
    const err = new Error("Your download limit for this period has been reached");
    err.status = 429;
    throw err;
  }
  try {
    await DownloadQuota.create({ userId, bucketKey, count: alreadyUsed + 1 });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const reserved = await DownloadQuota.findOneAndUpdate(
      { userId, bucketKey, count: { $lt: limit } },
      { $inc: { count: 1 } },
      { new: true }
    );
    if (!reserved) {
      const err = new Error("Your download limit for this period has been reached");
      err.status = 429;
      throw err;
    }
  }
};

const releaseQuota = async (userId, bucketKey, limit) => {
  if (Number.isFinite(limit)) {
    await DownloadQuota.updateOne(
      { userId, bucketKey, count: { $gt: 0 } },
      { $inc: { count: -1 } }
    );
  }
};

const getDownloadStatus = async (userId, plan, now = new Date()) => {
  const policy = getQuotaPolicy(plan);
  const bucket = getBucket(policy.period, now);
  const used = await countUsed(userId, bucket.start);
  return {
    plan,
    limit: Number.isFinite(policy.limit) ? policy.limit : null,
    period: policy.period,
    used,
    remaining: Number.isFinite(policy.limit) ? Math.max(0, policy.limit - used) : null,
  };
};

export const getUserDownloads = async (req, res) => {
  try {
    const userId = req.authenticatedUser._id.toString();
    const [downloads, plan] = await Promise.all([
      Download.find({ userId }).sort({ downloadedAt: -1 }).limit(100).lean(),
      getActivePlan(userId),
    ]);
    const quota = await getDownloadStatus(userId, plan);
    return res.status(200).json({ downloads, quota });
  } catch (error) {
    console.error("Error fetching downloads:", error);
    return res.status(500).json({ message: "Failed to fetch downloads" });
  }
};

export const downloadVideo = async (req, res) => {
  const { videoId } = req.params;
  const userId = req.authenticatedUser._id.toString();
  let reservation;
  let downloadEntry;
  let quotaReleased = false;
  const releaseReservedQuota = async () => {
    if (!reservation || quotaReleased) return;
    quotaReleased = true;
    await releaseQuota(reservation.userId, reservation.bucketKey, reservation.limit);
  };
  try {
    if (!/^[a-f\d]{24}$/i.test(videoId)) {
      return res.status(400).json({ message: "Invalid video ID" });
    }
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    const filePath = getPrivateVideoPath(video.filepath);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: "The video file is unavailable" });
    }

    const plan = await getActivePlan(userId);
    if (video.isPremium && !canAccessPremiumVideo(plan)) {
      return res.status(403).json({ message: "An active paid subscription is required to download this video" });
    }
    const quotaPolicy = getQuotaPolicy(plan);
    const now = new Date();
    const bucket = getBucket(quotaPolicy.period, now);
    const existing = await Download.findOne({
      userId,
      videoId,
      bucketKey: bucket.key,
      status: { $in: ["pending", "completed"] },
    });
    if (existing) {
      return res.status(409).json({ message: "This video has already been downloaded during the current quota period" });
    }

    const alreadyUsed = await countUsed(userId, bucket.start);
    await reserveQuota({
      userId,
      bucketKey: bucket.key,
      limit: quotaPolicy.limit,
      alreadyUsed,
    });
    reservation = { userId, bucketKey: bucket.key, limit: quotaPolicy.limit };

    const userAgent = req.get("user-agent") || "Unknown";
    const browser = /Edg\//.test(userAgent)
      ? "Edge"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Unknown";
    const device = /iPad|Tablet/i.test(userAgent)
      ? "Tablet"
      : /Mobi|Android|iPhone/i.test(userAgent)
        ? "Mobile"
        : "Desktop";
    const fileSizeBytes = fs.statSync(filePath).size;
    const downloadData = {
      userId,
      videoId: video._id.toString(),
      videoTitle: video.videotitle,
      fileSize: `${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB`,
      status: "pending",
      plan,
      quotaRemaining: Number.isFinite(quotaPolicy.limit)
        ? Math.max(0, quotaPolicy.limit - alreadyUsed - 1)
        : 0,
      ipAddress: req.ip,
      browser,
      device,
      downloadedAt: now,
      bucketKey: bucket.key,
    };
    const previousFailedDownload = await Download.findOne({
      userId,
      videoId,
      bucketKey: bucket.key,
      status: "failed",
    });
    downloadEntry = previousFailedDownload
      ? await Download.findOneAndUpdate(
          { _id: previousFailedDownload._id, status: "failed" },
          { $set: downloadData },
          { new: true, runValidators: true }
        )
      : await Download.create(downloadData);
    if (!downloadEntry) {
      await releaseReservedQuota();
      return res.status(409).json({ message: "This download is already being retried. Please wait." });
    }

    let responseFinished = false;
    res.once("finish", async () => {
      responseFinished = true;
      try {
        await Download.updateOne({ _id: downloadEntry._id }, { $set: { status: "completed" } });
      } catch (error) {
        console.error("Failed to mark completed download:", error);
      }
    });
    res.once("close", async () => {
      if (responseFinished) return;
      try {
        await Download.updateOne({ _id: downloadEntry._id }, { $set: { status: "failed" } });
        await releaseReservedQuota();
      } catch (error) {
        console.error("Failed to release interrupted download quota:", error);
      }
    });

    return res.download(filePath, path.basename(video.filename), async (error) => {
      if (!error) return;
      console.error("Video download stream failed:", error);
      if (!res.headersSent) {
        await Download.updateOne({ _id: downloadEntry._id }, { $set: { status: "failed" } });
        await releaseReservedQuota();
        return res.status(500).json({ message: "Unable to stream this video download" });
      }
      res.destroy(error);
    });
  } catch (error) {
    if (reservation && !downloadEntry) {
      try {
        await releaseReservedQuota();
      } catch (releaseError) {
        console.error("Failed to release unused download quota:", releaseError);
      }
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: "This video has already been downloaded during the current quota period" });
    }
    if (error.status === 409 || error.status === 429) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error authorizing video download:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Unable to authorize this download",
    });
  }
};
