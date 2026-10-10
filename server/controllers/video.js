import crypto from "node:crypto";
import fs from "node:fs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import TrustedDevice from "../Modals/trusteddevice.js";
import Video from "../Modals/video.js";
import { canAccessPremiumVideo, getActivePlan, getPrivateVideoPath } from "../utils/subscriptionAccess.js";

const MEDIA_TOKEN_LIFETIME_SECONDS = 6 * 60 * 60;

const mediaTokenSecret = () => {
  const secret = process.env.MEDIA_TOKEN_SECRET;
  return secret && secret.length >= 32 ? secret : null;
};

const QUALITY_UPLOAD_FIELDS = {
  quality360p: "360p",
  quality480p: "480p",
  quality720p: "720p",
  quality1080p: "1080p",
};

const cleanupUploadedFiles = async (files = []) => {
  const results = await Promise.allSettled(files.map((file) => fs.promises.unlink(file.path)));
  for (const result of results) {
    if (result.status === "rejected" && result.reason.code !== "ENOENT") {
      console.error("Failed to remove unregistered uploaded media:", result.reason);
    }
  }
};

export const uploadvideo = async (req, res) => {
  const files = Object.values(req.files || {}).flat();
  const sourceFile = req.files?.file?.[0];
  if (!sourceFile) {
    await cleanupUploadedFiles(files);
    return res.status(400).json({ message: "Please upload an MP4 video file" });
  }

  try {
    if (typeof req.body.videotitle !== "string" || !req.body.videotitle.trim()) {
      await cleanupUploadedFiles(files);
      return res.status(400).json({ message: "A video title is required" });
    }
    const qualityVariants = Object.entries(QUALITY_UPLOAD_FIELDS).flatMap(([fieldName, quality]) =>
      (req.files[fieldName] || []).map((file) => ({
        quality,
        filepath: file.path,
        filesize: file.size,
      }))
    );
    const file = new Video({
      videotitle: req.body.videotitle.trim(),
      filename: sourceFile.originalname,
      filepath: sourceFile.path,
      filetype: sourceFile.mimetype,
      filesize: sourceFile.size,
      videochanel: req.body.videochanel,
      uploader: req.authenticatedUser._id.toString(),
      isPremium: req.body.isPremium === "true",
      qualityVariants,
    });
    await file.save();
    return res.status(201).json({ message: "Video uploaded successfully", id: file._id });
  } catch (error) {
    await cleanupUploadedFiles(files);
    console.error("Error saving video:", error);
    return res.status(500).json({ message: "Unable to save this video" });
  }
};

export const getallvideo = async (req, res) => {
  try {
    const files = await Video.find().select("-filepath -filename -qualityVariants");
    return res.status(200).json(files);
  } catch (error) {
    console.error("Error loading videos:", error);
    return res.status(500).json({ message: "Unable to load videos" });
  }
};

export const createPlaybackToken = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) return res.status(400).json({ message: "Invalid video ID" });
  const secret = mediaTokenSecret();
  if (!secret) return res.status(503).json({ message: "Private media access is not configured" });

  try {
    const item = await Video.findById(videoId).select("_id isPremium filepath qualityVariants");
    if (!item) return res.status(404).json({ message: "Video not found" });
    const userId = req.authenticatedUser._id.toString();
    const plan = await getActivePlan(userId);
    if (item.isPremium && !canAccessPremiumVideo(plan)) {
      return res.status(403).json({
        code: "PREMIUM_REQUIRED",
        message: "An active paid subscription is required to watch this video.",
      });
    }

    const signQualityToken = (quality) => jwt.sign({
      videoId: item._id.toString(),
      quality,
      deviceHash: req.trustedDevice.deviceHash,
      appSessionId: req.trustedDevice.sessionId,
    }, secret, {
        algorithm: "HS256",
        subject: userId,
        issuer: "yourtube",
        audience: "yourtube-media",
        expiresIn: MEDIA_TOKEN_LIFETIME_SECONDS,
    });
    const sourceToken = signQualityToken("source");
    const qualities = [
      { quality: "source", label: "Original", url: `/video/${item._id}/stream?token=${encodeURIComponent(sourceToken)}` },
      ...(item.qualityVariants || []).map((variant) => ({
        quality: variant.quality,
        label: variant.quality,
        url: `/video/${item._id}/stream?token=${encodeURIComponent(signQualityToken(variant.quality))}`,
      })),
    ];
    return res.status(200).json({
      url: qualities[0].url,
      qualities,
      expiresIn: MEDIA_TOKEN_LIFETIME_SECONDS,
    });
  } catch (error) {
    console.error("Unable to authorize video playback:", error);
    return res.status(500).json({ message: "Unable to authorize video playback" });
  }
};

export const streamVideo = async (req, res) => {
  const secret = mediaTokenSecret();
  if (!secret) return res.status(503).json({ message: "Private media access is not configured" });

  try {
    const claims = jwt.verify(req.query.token || "", secret, {
      algorithms: ["HS256"],
      issuer: "yourtube",
      audience: "yourtube-media",
    });
    if (
      typeof claims === "string" ||
      claims.videoId !== req.params.videoId ||
      !claims.sub ||
      !claims.deviceHash ||
      !claims.appSessionId
    ) {
      return res.status(401).json({ message: "This playback link is invalid or expired" });
    }

    const trustedDevice = await TrustedDevice.findOne({
      userId: claims.sub,
      deviceHash: claims.deviceHash,
      sessionId: claims.appSessionId,
      trustedUntil: { $gt: new Date() },
    }).select("_id");
    if (!trustedDevice) return res.status(401).json({ message: "Sign in again to continue playback" });

    const item = await Video.findById(claims.videoId).select("filepath isPremium qualityVariants");
    if (!item) return res.status(404).json({ message: "Video not found" });
    if (item.isPremium) {
      const plan = await getActivePlan(claims.sub);
      if (!canAccessPremiumVideo(plan)) {
        return res.status(403).json({ message: "Your premium video access has expired" });
      }
    }

    const variant = claims.quality && claims.quality !== "source"
      ? item.qualityVariants.find((candidate) => candidate.quality === claims.quality)
      : null;
    if (claims.quality && claims.quality !== "source" && !variant) {
      return res.status(404).json({ message: "This video quality is no longer available" });
    }
    const filePath = getPrivateVideoPath(variant?.filepath || item.filepath);
    if (!filePath) return res.status(404).json({ message: "The video file is unavailable" });
    let fileStat;
    try {
      fileStat = await fs.promises.stat(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return res.status(404).json({ message: "The video file is unavailable" });
      throw error;
    }
    if (!fileStat.isFile()) return res.status(404).json({ message: "The video file is unavailable" });

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    const range = req.get("range");
    if (!range) {
      res.status(200);
      res.setHeader("Content-Length", fileStat.size);
      const fullStream = fs.createReadStream(filePath);
      fullStream.on("error", (error) => {
        console.error("Private media stream failed:", error);
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
      });
      return fullStream.pipe(res);
    }

    const matches = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!matches || (!matches[1] && !matches[2])) {
      res.setHeader("Content-Range", `bytes */${fileStat.size}`);
      return res.status(416).end();
    }
    let start;
    let end;
    if (!matches[1]) {
      const suffixLength = Number(matches[2]);
      start = Math.max(fileStat.size - suffixLength, 0);
      end = fileStat.size - 1;
    } else {
      start = Number(matches[1]);
      end = matches[2] ? Number(matches[2]) : fileStat.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= fileStat.size) {
      res.setHeader("Content-Range", `bytes */${fileStat.size}`);
      return res.status(416).end();
    }
    end = Math.min(end, fileStat.size - 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileStat.size}`);
    res.setHeader("Content-Length", end - start + 1);
    const partialStream = fs.createReadStream(filePath, { start, end });
    partialStream.on("error", (error) => {
      console.error("Private media range stream failed:", error);
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    });
    return partialStream.pipe(res);
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "This playback link is invalid or expired" });
    }
    console.error("Unable to stream private video:", error);
    return res.status(500).json({ message: "Unable to stream this video" });
  }
};
