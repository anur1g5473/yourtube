import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import User from "../Modals/Auth.js";
import TrustedDevice from "../Modals/trusteddevice.js";

const CERTIFICATES_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certificatesCache;
let certificatesExpiresAt = 0;

async function getFirebaseCertificates() {
  if (certificatesCache && Date.now() < certificatesExpiresAt) {
    return certificatesCache;
  }

  const response = await fetch(CERTIFICATES_URL);
  if (!response.ok) {
    throw new Error(`Firebase certificate request failed (${response.status})`);
  }

  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300);
  certificatesCache = await response.json();
  certificatesExpiresAt = Date.now() + maxAge * 1000;
  return certificatesCache;
}

export async function authenticateFirebaseIdentity(req, res, next) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    return res.status(503).json({ message: "Firebase authentication is not configured" });
  }

  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    return res.status(401).json({ message: "Sign in is required" });
  }

  try {
    const header = jwt.decode(token, { complete: true })?.header;
    if (!header?.kid || header.alg !== "RS256") {
      return res.status(401).json({ message: "Invalid Firebase ID token" });
    }

    const certificates = await getFirebaseCertificates();
    const certificate = certificates[header.kid];
    if (!certificate) {
      certificatesExpiresAt = 0;
      return res.status(401).json({ message: "Firebase ID token signing key is unknown" });
    }

    const claims = jwt.verify(token, certificate, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
    if (typeof claims === "string" || !claims.email || claims.email_verified !== true) {
      return res.status(401).json({ message: "A verified Firebase account is required" });
    }

    req.firebaseClaims = claims;
    req.authenticatedUser = await User.findOne({ email: claims.email });
    return next();
  } catch (error) {
    console.error("Firebase authentication failed:", error);
    return res.status(401).json({ message: "Firebase authentication failed" });
  }
}

export async function authenticateFirebase(req, res, next) {
  return authenticateFirebaseIdentity(req, res, async (identityError) => {
    if (identityError) return next(identityError);
    if (!req.authenticatedUser) {
      return res.status(401).json({ message: "No YourTube account is linked to this sign-in" });
    }

    const secret = process.env.APP_SESSION_SECRET;
    if (!secret || secret.length < 32) {
      return res.status(503).json({ message: "Verified application sessions are not configured" });
    }

    const sessionToken = req.get("x-yourtube-session") || "";
    const deviceId = req.get("x-yourtube-device") || "";
    if (!sessionToken || !deviceId) {
      return res.status(401).json({ message: "Complete email verification to continue", code: "OTP_REQUIRED" });
    }

    try {
      const session = jwt.verify(sessionToken, secret, {
        algorithms: ["HS256"],
        issuer: "yourtube",
        audience: "yourtube-api",
      });
      if (
        typeof session === "string" ||
        session.sub !== req.authenticatedUser._id.toString() ||
        session.deviceHash !== crypto.createHash("sha256").update(deviceId).digest("hex")
      ) {
        return res.status(401).json({ message: "Verified application session is invalid", code: "OTP_REQUIRED" });
      }

      const trustedDevice = await TrustedDevice.findOne({
        userId: req.authenticatedUser._id.toString(),
        deviceHash: session.deviceHash,
        sessionId: session.jti,
        trustedUntil: { $gt: new Date() },
      });
      if (!trustedDevice) {
        return res.status(401).json({ message: "Verified application session has expired", code: "OTP_REQUIRED" });
      }

      req.trustedDevice = trustedDevice;
      return next();
    } catch (error) {
      if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Verified application session has expired", code: "OTP_REQUIRED" });
      }
      console.error("Application session verification failed:", error);
      return res.status(500).json({ message: "Unable to verify application session" });
    }
  });
}
