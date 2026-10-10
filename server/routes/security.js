import express from "express";
import {
  beginLoginVerification,
  endCurrentAppSession,
  getPhoneVerificationStatus,
  getTrustedDevices,
  getUserSecurityLog,
  resendLoginVerification,
  revokeTrustedDevice,
  startPhoneVerification,
  verifyPhoneNumber,
  verifyLoginVerification,
} from "../controllers/security.js";
import { authenticateFirebase, authenticateFirebaseIdentity } from "../middleware/firebaseAuth.js";

const routes = express.Router();

routes.post("/challenge", authenticateFirebaseIdentity, beginLoginVerification);
routes.post("/resend", authenticateFirebaseIdentity, resendLoginVerification);
routes.post("/verify", authenticateFirebaseIdentity, verifyLoginVerification);
routes.use(authenticateFirebase);
routes.get("/phone", getPhoneVerificationStatus);
routes.post("/phone/verification", startPhoneVerification);
routes.post("/phone/verify", verifyPhoneNumber);
routes.get("/mine", getUserSecurityLog);
routes.get("/devices", getTrustedDevices);
routes.delete("/devices/:id", revokeTrustedDevice);
routes.post("/logout", endCurrentAppSession);

export default routes;
