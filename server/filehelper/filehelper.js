"use strict";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, res, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.mp4`);
  },
});
const filefilter = (req, file, cb) => {
  if (file.mimetype === "video/mp4" && path.extname(file.originalname).toLowerCase() === ".mp4") {
    cb(null, true);
  } else {
    cb(new Error("Only MP4 video files are supported"));
  }
};
const upload = multer({
  storage,
  fileFilter: filefilter,
  limits: { fileSize: 100 * 1024 * 1024, files: 5 },
});
export default upload;
