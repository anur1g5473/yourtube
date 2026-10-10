import express from "express";
import {
  deletecomment,
  editcomment,
  getCommentHistory,
  getReportedComments,
  getallcomment,
  moderateComment,
  postcomment,
  reactToComment,
  reportComment,
  searchCommentUsers,
  translateComment,
} from "../controllers/comment.js";
import { authenticateFirebase } from "../middleware/firebaseAuth.js";
import { requireModerator } from "../middleware/requireModerator.js";

const routes = express.Router();
routes.get("/users", authenticateFirebase, searchCommentUsers);
routes.get("/:videoid", getallcomment);
routes.post("/postcomment", authenticateFirebase, postcomment);
routes.delete("/deletecomment/:id", authenticateFirebase, deletecomment);
routes.patch("/editcomment/:id", authenticateFirebase, editcomment);
routes.get("/:id/history", authenticateFirebase, getCommentHistory);
routes.post("/:id/reactions", authenticateFirebase, reactToComment);
routes.post("/:id/report", authenticateFirebase, reportComment);
routes.post("/:id/translate", translateComment);
routes.get("/moderation/reports", authenticateFirebase, requireModerator, getReportedComments);
routes.patch("/moderation/:id", authenticateFirebase, requireModerator, moderateComment);

export default routes;
