import express from "express";
import { createMeeting, getMeetingToken } from "../controllers/meeting.js";
import { authenticateFirebase } from "../middleware/firebaseAuth.js";

const routes = express.Router();

routes.use(authenticateFirebase);
routes.post("/", createMeeting);
routes.get("/:roomId/token", getMeetingToken);

export default routes;
