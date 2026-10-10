import express from "express";
import { createPlaybackToken, getallvideo, streamVideo, uploadvideo } from "../controllers/video.js";
import upload from "../filehelper/filehelper.js";
import { authenticateFirebase } from "../middleware/firebaseAuth.js";

const routes = express.Router();

routes.get("/getall", getallvideo);
routes.post(
  "/upload",
  authenticateFirebase,
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "quality360p", maxCount: 1 },
    { name: "quality480p", maxCount: 1 },
    { name: "quality720p", maxCount: 1 },
    { name: "quality1080p", maxCount: 1 },
  ]),
  uploadvideo
);
routes.get("/:videoId/playback", authenticateFirebase, createPlaybackToken);
routes.get("/:videoId/stream", streamVideo);
export default routes;
