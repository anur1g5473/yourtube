import Subscription from "../Modals/subscription.js";
import path from "node:path";

export const getActivePlan = async (userId, now = new Date()) => {
  const subscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "cancelled"] },
    endDate: { $gt: now },
  }).sort({ createdAt: -1 });
  return subscription?.plan || "free";
};

export const canAccessPremiumVideo = (plan) => plan !== "free";

export const getPrivateVideoPath = (storedPath) => {
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || "uploads");
  const safeFilename = path.basename(String(storedPath || "").replace(/\\/g, "/"));
  const filePath = path.resolve(uploadRoot, safeFilename);
  if (!safeFilename || !filePath.startsWith(`${uploadRoot}${path.sep}`)) return null;
  return filePath;
};
