import express from "express";
import { downloadVideo, getUserDownloads } from "../controllers/download.js";
import { authenticateFirebase } from "../middleware/firebaseAuth.js";

const routes = express.Router();

routes.use(authenticateFirebase);
routes.get("/mine", getUserDownloads);
routes.get("/:videoId", downloadVideo);

export default routes;
