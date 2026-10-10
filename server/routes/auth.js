import express from "express";
import { login, updatePreferences, updateprofile } from "../controllers/auth.js";
import { authenticateFirebase, authenticateFirebaseIdentity } from "../middleware/firebaseAuth.js";
const routes = express.Router();

routes.post("/login", authenticateFirebaseIdentity, login);
routes.patch("/update/:id", authenticateFirebase, updateprofile);
routes.patch("/preferences", authenticateFirebase, updatePreferences);
export default routes;
