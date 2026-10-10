import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import LoginChallenge from "../Modals/loginchallenge.js";
import SecurityLog from "../Modals/securitylog.js";
import TrustedDevice from "../Modals/trusteddevice.js";
import UserPhone from "../Modals/userphone.js";
import { lookupIpLocation } from "../services/geolocation.js";
import { checkSmsVerification, isTwilioVerifyConfigured, sendSmsVerification } from "../services/twilioVerify.js";

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const OTP_RESEND_WAIT_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const TRUSTED_DEVICE_DAYS = 30;
const APP_SESSION_LIFETIME_SECONDS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60;

const getDeviceDetails = (req) => {
  const userAgent = req.get("user-agent") || "";
  const edge = /Edg\/([\d.]+)/.exec(userAgent);
  const firefox = /Firefox\/([\d.]+)/.exec(userAgent);
  const chrome = /Chrome\/([\d.]+)/.exec(userAgent);
  const safari = /Version\/([\d.]+).*Safari/.exec(userAgent);
  const platform = req.get("sec-ch-ua-platform") || "";

  return {
    browser: edge ? `Edge ${edge[1]}` :
      firefox ? `Firefox ${firefox[1]}` :
        chrome ? `Chrome ${chrome[1]}` :
          safari ? `Safari ${safari[1]}` : "Unknown",
    os: platform.replace(/^"|"$/g, "") || (
      /Windows NT/.test(userAgent) ? "Windows" :
        /Android/.test(userAgent) ? "Android" :
          /iPhone|iPad|iOS/.test(userAgent) ? "iOS" :
            /Mac OS X/.test(userAgent) ? "macOS" :
              /Linux/.test(userAgent) ? "Linux" : "Unknown"
    ),
    deviceType: /iPad|Tablet/i.test(userAgent) ? "Tablet" :
      /Mobi|Android|iPhone/i.test(userAgent) ? "Mobile" : "Desktop",
  };
};

const validDeviceId = (deviceId) =>
  typeof deviceId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId);

const hashDeviceId = (deviceId) => crypto.createHash("sha256").update(deviceId).digest("hex");
const hashOtp = (challengeId, otp) =>
  crypto.createHmac("sha256", process.env.APP_SESSION_SECRET)
    .update(`${challengeId}:${otp}`)
    .digest("hex");

const getSecurityEmailConfig = () => {
  const { RESEND_API_KEY, SECURITY_EMAIL_FROM, APP_SESSION_SECRET } = process.env;
  if (!APP_SESSION_SECRET || APP_SESSION_SECRET.length < 32) {
    return "APP_SESSION_SECRET must contain at least 32 characters";
  }
  if (!RESEND_API_KEY || !SECURITY_EMAIL_FROM) {
    return "Email OTP requires RESEND_API_KEY and SECURITY_EMAIL_FROM";
  }
  return null;
};

const validPhoneNumber = (phoneNumber) =>
  typeof phoneNumber === "string" && /^\+[1-9]\d{7,14}$/.test(phoneNumber);

const maskPhoneNumber = (phoneNumber) => `+${"*".repeat(Math.max(0, phoneNumber.length - 5))}${phoneNumber.slice(-4)}`;

const getVerifiedPhone = async (userId) =>
  UserPhone.findOne({ userId, phoneNumber: { $exists: true }, phoneVerifiedAt: { $exists: true } });

const sendLoginOtp = async (email, otp, displayName) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.SECURITY_EMAIL_FROM,
      to: [email],
      subject: "Your YourTube sign-in verification code",
      text: `Hello ${displayName || "there"}, your YourTube verification code is ${otp}. It expires in 10 minutes. If you did not try to sign in, secure your account.`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Email delivery failed with status ${response.status}`);
  }
};

const issueAppSession = (userId, deviceHash, sessionId) => jwt.sign(
  { deviceHash },
  process.env.APP_SESSION_SECRET,
  {
    algorithm: "HS256",
    subject: userId,
    jwtid: sessionId,
    issuer: "yourtube",
    audience: "yourtube-api",
    expiresIn: APP_SESSION_LIFETIME_SECONDS,
  }
);

const getRequestLocation = async (req) => {
  try {
    return await lookupIpLocation(req.ip);
  } catch (error) {
    console.error("Local GeoIP database lookup failed:", error.message);
    return { status: "lookup_failed" };
  }
};

const logSecurityEvent = async (req, eventType, status, location) => {
  const { browser, os, deviceType } = getDeviceDetails(req);
  const resolvedLocation = location || await getRequestLocation(req);
  await SecurityLog.create({
    userId: req.authenticatedUser._id.toString(),
    eventType,
    status,
    ipAddress: req.ip,
    browser,
    os,
    deviceType,
    city: resolvedLocation.city,
    state: resolvedLocation.state,
    country: resolvedLocation.country,
    locationStatus: resolvedLocation.status,
    trustedDevice: eventType === "login" && (status === "otp_verified" || status === "success"),
  });
};

export const getUserSecurityLog = async (req, res) => {
  try {
    const logs = await SecurityLog.find({
      userId: req.authenticatedUser._id.toString(),
    }).sort({ createdAt: -1 }).limit(50);
    return res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching security logs:", error);
    return res.status(500).json({ message: "Failed to fetch security logs" });
  }
};

export const beginLoginVerification = async (req, res) => {
  const { deviceId, channel = "email", forceChallenge = false } = req.body;
  if (!req.authenticatedUser) return res.status(401).json({ message: "No YourTube account is linked to this sign-in" });
  if (!validDeviceId(deviceId)) {
    return res.status(400).json({ message: "A valid browser device identifier is required" });
  }
  if (!["email", "sms"].includes(channel) || typeof forceChallenge !== "boolean") {
    return res.status(400).json({ message: "Choose a valid verification method" });
  }
  if (!process.env.APP_SESSION_SECRET || process.env.APP_SESSION_SECRET.length < 32) {
    return res.status(503).json({ message: "APP_SESSION_SECRET must contain at least 32 characters" });
  }

  const userId = req.authenticatedUser._id.toString();
  const deviceHash = hashDeviceId(deviceId);
  const now = new Date();
  try {
    const details = getDeviceDetails(req);
    const location = await getRequestLocation(req);
    const phone = await getVerifiedPhone(userId);
    const phoneAvailable = Boolean(phone);
    const smsAvailable = phoneAvailable && isTwilioVerifyConfigured();
    const trusted = await TrustedDevice.findOne({ userId, deviceHash });
    const locationChanged = location.status === "resolved" && trusted && (
      trusted.lastCity !== location.city ||
      trusted.lastState !== location.state ||
      trusted.lastCountry !== location.country
    );
    if (
      trusted &&
      trusted.trustedUntil > now &&
      trusted.lastIp === req.ip &&
      trusted.browser === details.browser &&
      trusted.os === details.os &&
      trusted.deviceType === details.deviceType &&
      !forceChallenge &&
      !locationChanged
    ) {
      const sessionId = crypto.randomUUID();
      trusted.sessionId = sessionId;
      trusted.lastUsedAt = now;
      trusted.lastCity = location.city;
      trusted.lastState = location.state;
      trusted.lastCountry = location.country;
      trusted.locationStatus = location.status;
      await trusted.save();
      await logSecurityEvent(req, "login", "success", location);
      return res.status(200).json({
        trusted: true,
        sessionToken: issueAppSession(userId, deviceHash, sessionId),
      });
    }

    if (trusted) {
      trusted.sessionId = undefined;
      await trusted.save();
    }

    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentChallenges = await LoginChallenge.countDocuments({
      userId,
      createdAt: { $gte: hourAgo },
    });
    if (recentChallenges >= 5) {
      return res.status(429).json({ message: "Too many verification codes. Try again in an hour." });
    }

    if (channel === "sms" && !phoneAvailable) {
      return res.status(400).json({ message: "Add and verify a mobile number before using SMS verification." });
    }
    const configError = channel === "sms"
      ? (isTwilioVerifyConfigured() ? null : "SMS verification requires Twilio Verify credentials")
      : getSecurityEmailConfig();
    if (configError) {
      return res.status(503).json({ message: configError, smsAvailable, maskedSms: phone ? maskPhoneNumber(phone.phoneNumber) : null });
    }

    await LoginChallenge.deleteMany({ userId, deviceHash, verifiedAt: null });
    const otp = channel === "email" ? String(crypto.randomInt(0, 1_000_000)).padStart(6, "0") : null;
    const challenge = await LoginChallenge.create({
      userId,
      deviceHash,
      codeHash: channel === "email" ? "pending" : "twilio-verify",
      channel,
      destination: channel === "sms" ? phone.phoneNumber : req.authenticatedUser.email,
      sourceIp: req.ip,
      ...details,
      expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
    });

    try {
      if (channel === "sms") {
        await sendSmsVerification(phone.phoneNumber);
      } else {
        await sendLoginOtp(req.authenticatedUser.email, otp, req.authenticatedUser.name);
        challenge.codeHash = hashOtp(challenge._id.toString(), otp);
      }
      await challenge.save();
    } catch (error) {
      await LoginChallenge.deleteOne({ _id: challenge._id });
      await logSecurityEvent(req, "login_otp_delivery", "failed", location);
      console.error(`Unable to send login verification by ${channel}:`, error.message);
      return res.status(502).json({
        message: `Unable to send a sign-in verification code by ${channel === "sms" ? "SMS" : "email"}. Try again later.`,
        smsAvailable,
        maskedSms: phone ? maskPhoneNumber(phone.phoneNumber) : null,
      });
    }

    await logSecurityEvent(req, "login_otp_challenge", "challenge", location);
    return res.status(200).json({
      trusted: false,
      challengeId: challenge._id.toString(),
      channel,
      destination: channel === "sms"
        ? maskPhoneNumber(phone.phoneNumber)
        : req.authenticatedUser.email.replace(/^(.).+(@.+)$/, "$1***$2"),
      smsAvailable,
      maskedSms: phone ? maskPhoneNumber(phone.phoneNumber) : null,
    });
  } catch (error) {
    console.error("Unable to start login verification:", error);
    return res.status(500).json({ message: "Unable to start sign-in verification" });
  }
};

export const resendLoginVerification = async (req, res) => {
  const { challengeId } = req.body;
  if (!req.authenticatedUser) return res.status(401).json({ message: "No YourTube account is linked to this sign-in" });
  if (!mongoose.Types.ObjectId.isValid(challengeId)) {
    return res.status(400).json({ message: "Invalid sign-in challenge" });
  }

  try {
    const challenge = await LoginChallenge.findOne({
      _id: challengeId,
      userId: req.authenticatedUser._id.toString(),
      verifiedAt: null,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: OTP_MAX_ATTEMPTS },
    });
    if (!challenge) return res.status(404).json({ message: "Sign-in challenge expired. Start sign-in again." });
    const resendAvailableAt = new Date(challenge.lastSentAt.getTime() + OTP_RESEND_WAIT_MS);
    if (resendAvailableAt > new Date()) {
      return res.status(429).json({
        message: "Please wait before requesting another code.",
        retryAfterSeconds: Math.ceil((resendAvailableAt.getTime() - Date.now()) / 1000),
      });
    }

    const configError = challenge.channel === "sms"
      ? (isTwilioVerifyConfigured() ? null : "SMS verification requires Twilio Verify credentials")
      : getSecurityEmailConfig();
    if (configError) return res.status(503).json({ message: configError });

    if (challenge.channel === "sms") {
      await sendSmsVerification(challenge.destination);
      challenge.codeHash = "twilio-verify";
    } else {
      const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      await sendLoginOtp(challenge.destination || req.authenticatedUser.email, otp, req.authenticatedUser.name);
      challenge.codeHash = hashOtp(challenge._id.toString(), otp);
    }
    challenge.attempts = 0;
    challenge.lastSentAt = new Date();
    challenge.expiresAt = new Date(Date.now() + OTP_LIFETIME_MS);
    await challenge.save();
    return res.status(200).json({ message: "A new verification code has been sent." });
  } catch (error) {
    console.error("Unable to resend login verification:", error);
    return res.status(502).json({ message: "Unable to resend the verification code" });
  }
};

export const verifyLoginVerification = async (req, res) => {
  const { challengeId, deviceId, code } = req.body;
  if (!req.authenticatedUser) return res.status(401).json({ message: "No YourTube account is linked to this sign-in" });
  if (!mongoose.Types.ObjectId.isValid(challengeId) || !validDeviceId(deviceId) || !/^\d{6}$/.test(code || "")) {
    return res.status(400).json({ message: "Enter the six-digit verification code" });
  }
  if (!process.env.APP_SESSION_SECRET || process.env.APP_SESSION_SECRET.length < 32) {
    return res.status(503).json({ message: "Verified application sessions are not configured" });
  }

  const userId = req.authenticatedUser._id.toString();
  const deviceHash = hashDeviceId(deviceId);
  try {
    const challenge = await LoginChallenge.findOne({
      _id: challengeId,
      userId,
      deviceHash,
      verifiedAt: null,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: OTP_MAX_ATTEMPTS },
    });
    if (!challenge) {
      return res.status(400).json({ message: "The code expired or the attempt limit was reached. Start sign-in again." });
    }

    let valid;
    if (challenge.channel === "sms") {
      try {
        if (!isTwilioVerifyConfigured()) {
          return res.status(503).json({ message: "SMS verification requires Twilio Verify credentials" });
        }
        valid = await checkSmsVerification(challenge.destination, code);
      } catch (error) {
        console.error("Unable to check Twilio verification code:", error.message);
        return res.status(502).json({ message: "SMS verification is temporarily unavailable. Try again later." });
      }
    } else {
      const submittedHash = Buffer.from(hashOtp(challenge._id.toString(), code), "hex");
      const savedHash = Buffer.from(challenge.codeHash, "hex");
      valid = submittedHash.length === savedHash.length && crypto.timingSafeEqual(submittedHash, savedHash);
    }
    if (!valid) {
      const updatedChallenge = await LoginChallenge.findOneAndUpdate(
        {
          _id: challenge._id,
          verifiedAt: null,
          expiresAt: { $gt: new Date() },
          attempts: { $lt: OTP_MAX_ATTEMPTS },
        },
        { $inc: { attempts: 1 } },
        { new: true }
      );
      await logSecurityEvent(req, "login_otp_verification", "failed", await getRequestLocation(req));
      return res.status(400).json({
        message: !updatedChallenge || updatedChallenge.attempts >= OTP_MAX_ATTEMPTS
          ? "Too many incorrect codes. Start sign-in again."
          : "That verification code is incorrect.",
      });
    }

    const now = new Date();
    const claimedChallenge = await LoginChallenge.findOneAndUpdate(
      {
        _id: challenge._id,
        verifiedAt: null,
        expiresAt: { $gt: now },
        attempts: { $lt: OTP_MAX_ATTEMPTS },
      },
      { $set: { verifiedAt: now } },
      { new: true }
    );
    if (!claimedChallenge) {
      return res.status(409).json({ message: "This verification code has already been used or expired." });
    }
    const trustedUntil = new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000);
    const sessionId = crypto.randomUUID();
    const location = await getRequestLocation(req);
    const device = await TrustedDevice.findOneAndUpdate(
      { userId, deviceHash },
      {
        $set: {
          ...getDeviceDetails(req),
          lastIp: req.ip,
          lastCity: location.city,
          lastState: location.state,
          lastCountry: location.country,
          locationStatus: location.status,
          trustedUntil,
          lastUsedAt: now,
          sessionId,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await LoginChallenge.deleteMany({ userId, deviceHash, _id: { $ne: challenge._id }, verifiedAt: null });
    await logSecurityEvent(req, "login", "otp_verified", location);
    return res.status(200).json({
      sessionToken: issueAppSession(device.userId, deviceHash, sessionId),
      userId,
      trustedUntil,
    });
  } catch (error) {
    console.error("Unable to verify login code:", error);
    return res.status(500).json({ message: "Unable to verify the sign-in code" });
  }
};

export const getTrustedDevices = async (req, res) => {
  try {
    const devices = await TrustedDevice.find({
      userId: req.authenticatedUser._id.toString(),
      trustedUntil: { $gt: new Date() },
    })
      .select("browser os deviceType lastIp lastCity lastState lastCountry locationStatus lastUsedAt trustedUntil createdAt")
      .sort({ lastUsedAt: -1 })
      .lean();
    return res.status(200).json(devices.map((device) => ({
      ...device,
      current: device._id.toString() === req.trustedDevice._id.toString(),
    })));
  } catch (error) {
    console.error("Unable to fetch trusted devices:", error);
    return res.status(500).json({ message: "Unable to fetch trusted devices" });
  }
};

export const getPhoneVerificationStatus = async (req, res) => {
  try {
    const phone = await UserPhone.findOne({ userId: req.authenticatedUser._id.toString() }).lean();
    const pendingIsCurrent = phone?.pendingExpiresAt > new Date();
    return res.status(200).json({
      verified: Boolean(phone?.phoneNumber && phone?.phoneVerifiedAt),
      phoneNumber: phone?.phoneNumber ? maskPhoneNumber(phone.phoneNumber) : null,
      pendingPhoneNumber: pendingIsCurrent ? maskPhoneNumber(phone.pendingPhoneNumber) : null,
    });
  } catch (error) {
    console.error("Unable to fetch SMS verification settings:", error);
    return res.status(500).json({ message: "Unable to fetch SMS verification settings" });
  }
};

export const startPhoneVerification = async (req, res) => {
  const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";
  if (!validPhoneNumber(phoneNumber)) {
    return res.status(400).json({ message: "Enter a valid mobile number in international format, such as +14155552671." });
  }
  if (!isTwilioVerifyConfigured()) {
    return res.status(503).json({ message: "SMS verification requires Twilio Verify credentials" });
  }

  const userId = req.authenticatedUser._id.toString();
  const now = new Date();
  let phone;
  try {
    phone = await UserPhone.findOne({ userId });
    if (phone?.phoneNumber === phoneNumber && phone.phoneVerifiedAt) {
      return res.status(409).json({ message: "This mobile number is already verified." });
    }
    if (phone?.pendingSentAt && phone.pendingSentAt.getTime() + OTP_RESEND_WAIT_MS > now.getTime()) {
      return res.status(429).json({
        message: "Please wait before requesting another mobile verification code.",
        retryAfterSeconds: Math.ceil((phone.pendingSentAt.getTime() + OTP_RESEND_WAIT_MS - now.getTime()) / 1000),
      });
    }

    const pending = {
      pendingPhoneNumber: phoneNumber,
      pendingSentAt: now,
      pendingExpiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
      verificationAttempts: 0,
    };
    if (phone) {
      phone = await UserPhone.findOneAndUpdate(
        {
          _id: phone._id,
          $or: [
            { pendingSentAt: { $exists: false } },
            { pendingSentAt: { $lte: new Date(now.getTime() - OTP_RESEND_WAIT_MS) } },
          ],
        },
        { $set: pending },
        { new: true, runValidators: true }
      );
      if (!phone) return res.status(429).json({ message: "A mobile verification was just started. Wait before trying again." });
    } else {
      phone = await UserPhone.create({ userId, ...pending });
    }
  } catch (error) {
    if (error.code === 11000) {
      return res.status(429).json({ message: "A mobile verification was just started. Wait before trying again." });
    }
    console.error("Unable to prepare mobile verification:", error);
    return res.status(500).json({ message: "Unable to prepare mobile verification" });
  }

  try {
    await sendSmsVerification(phoneNumber);
  } catch (error) {
    try {
      await UserPhone.updateOne(
        { userId, pendingPhoneNumber: phoneNumber, pendingSentAt: now },
        { $unset: { pendingPhoneNumber: 1, pendingExpiresAt: 1 } }
      );
    } catch (cleanupError) {
      console.error("Unable to clear failed mobile verification state:", cleanupError);
    }
    console.error("Unable to send mobile verification code:", error.message);
    return res.status(502).json({ message: "Unable to send a mobile verification code. Try again later." });
  }

  return res.status(200).json({
    message: "A verification code has been sent.",
    pendingPhoneNumber: maskPhoneNumber(phoneNumber),
    expiresAt: phone.pendingExpiresAt,
  });
};

export const verifyPhoneNumber = async (req, res) => {
  const { code } = req.body;
  if (!/^\d{6}$/.test(code || "")) {
    return res.status(400).json({ message: "Enter the six-digit mobile verification code." });
  }
  if (!isTwilioVerifyConfigured()) {
    return res.status(503).json({ message: "SMS verification requires Twilio Verify credentials" });
  }

  const userId = req.authenticatedUser._id.toString();
  const now = new Date();
  try {
    const phone = await UserPhone.findOne({
      userId,
      pendingPhoneNumber: { $exists: true },
      pendingExpiresAt: { $gt: now },
      verificationAttempts: { $lt: OTP_MAX_ATTEMPTS },
    });
    if (!phone) {
      return res.status(400).json({ message: "The mobile verification expired or the attempt limit was reached. Request a new code." });
    }

    let valid;
    try {
      valid = await checkSmsVerification(phone.pendingPhoneNumber, code);
    } catch (error) {
      console.error("Unable to check mobile verification code:", error.message);
      return res.status(502).json({ message: "SMS verification is temporarily unavailable. Try again later." });
    }
    if (!valid) {
      const updatedPhone = await UserPhone.findOneAndUpdate(
        {
          _id: phone._id,
          pendingExpiresAt: { $gt: new Date() },
          verificationAttempts: { $lt: OTP_MAX_ATTEMPTS },
        },
        { $inc: { verificationAttempts: 1 } },
        { new: true }
      );
      return res.status(400).json({
        message: !updatedPhone || updatedPhone.verificationAttempts >= OTP_MAX_ATTEMPTS
          ? "Too many incorrect codes. Request a new mobile verification."
          : "That mobile verification code is incorrect.",
      });
    }

    const verifiedPhone = await UserPhone.findOneAndUpdate(
      {
        _id: phone._id,
        pendingExpiresAt: { $gt: new Date() },
        verificationAttempts: { $lt: OTP_MAX_ATTEMPTS },
      },
      {
        $set: { phoneNumber: phone.pendingPhoneNumber, phoneVerifiedAt: new Date(), verificationAttempts: 0 },
        $unset: { pendingPhoneNumber: 1, pendingExpiresAt: 1 },
      },
      { new: true, runValidators: true }
    );
    if (!verifiedPhone) return res.status(409).json({ message: "This mobile verification has already been used or expired." });
    return res.status(200).json({
      verified: true,
      phoneNumber: maskPhoneNumber(verifiedPhone.phoneNumber),
      message: "Mobile number verified. It can now be used for sign-in verification.",
    });
  } catch (error) {
    console.error("Unable to verify mobile number:", error);
    return res.status(500).json({ message: "Unable to verify the mobile number" });
  }
};

export const revokeTrustedDevice = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid device ID" });
  try {
    const device = await TrustedDevice.findOneAndUpdate(
      { _id: id, userId: req.authenticatedUser._id.toString() },
      { $set: { trustedUntil: new Date(), sessionId: null } },
      { new: true }
    );
    if (!device) return res.status(404).json({ message: "Trusted device not found" });
    await logSecurityEvent(req, "trusted_device_revoked", "success");
    return res.status(200).json({
      message: "Trusted device revoked",
      currentDevice: device._id.toString() === req.trustedDevice._id.toString(),
    });
  } catch (error) {
    console.error("Unable to revoke trusted device:", error);
    return res.status(500).json({ message: "Unable to revoke trusted device" });
  }
};

export const endCurrentAppSession = async (req, res) => {
  try {
    req.trustedDevice.sessionId = null;
    await req.trustedDevice.save();
    return res.status(200).json({ message: "Signed out from this browser" });
  } catch (error) {
    console.error("Unable to end application session:", error);
    return res.status(500).json({ message: "Unable to securely end this session" });
  }
};
