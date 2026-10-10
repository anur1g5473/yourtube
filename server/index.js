import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import multer from "multer";
import mongoose from "mongoose";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyrroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import subscriptionroutes from "./routes/subscription.js";
import downloadroutes from "./routes/download.js";
import securityroutes from "./routes/security.js";
import watchprogressroutes from "./routes/watchprogress.js";
import meetingroutes from "./routes/meeting.js";
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.get("/", (req, res) => {
  res.send("You tube backend is working");
});
app.get("/health", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  return res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? "ok" : "database_unavailable",
  });
});
app.use(bodyParser.json());
app.use("/user", userroutes);
app.use("/video", videoroutes);
app.use("/like", likeroutes);
app.use("/watch", watchlaterroutes);
app.use("/history", historyrroutes);
app.use("/comment", commentroutes);
app.use("/subscription", subscriptionroutes);
app.use("/download", downloadroutes);
app.use("/security", securityroutes);
app.use("/watchprogress", watchprogressroutes);
app.use("/meeting", meetingroutes);
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ message: error.code === "LIMIT_FILE_SIZE" ? "Each MP4 file must be 100MB or smaller" : error.message });
  }
  if (error.message === "Only MP4 video files are supported") {
    return res.status(400).json({ message: error.message });
  }
  console.error("Unhandled API request error:", error);
  return res.status(500).json({ message: "An unexpected server error occurred" });
});
const PORT = process.env.PORT || 5000;

const DBURL = process.env.DB_URL;
if (DBURL) {
  mongoose
    .connect(DBURL)
    .then(() => {
      console.log("Mongodb connected");
      app.listen(PORT, () => {
        console.log(`server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Unable to connect to MongoDB:", error);
      process.exitCode = 1;
    });
} else {
  console.error("DB_URL is required; refusing to start without MongoDB.");
  process.exitCode = 1;
}
