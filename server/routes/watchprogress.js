import express from "express";
import { getWatchProgress, saveWatchProgress } from "../controllers/watchprogress.js";
import { authenticateFirebase } from "../middleware/firebaseAuth.js";

const routes = express.Router();
routes.use(authenticateFirebase);
routes.get("/:videoId", getWatchProgress);
routes.put("/:videoId", saveWatchProgress);

export default routes;
