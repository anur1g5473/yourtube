import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import Meeting from "../Modals/meeting.js";

const ROOM_ID_PATTERN = /^[a-f\d]{40}$/i;

const jaasConfig = () => {
  const { JITSI_APP_ID, JITSI_API_KEY_ID, JITSI_PRIVATE_KEY } = process.env;
  if (!JITSI_APP_ID || !JITSI_API_KEY_ID || !JITSI_PRIVATE_KEY) return null;
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(JITSI_APP_ID) || !/^[a-zA-Z0-9_-]{1,100}$/.test(JITSI_API_KEY_ID)) {
    throw new Error("Jitsi app ID or API key ID is invalid");
  }
  const privateKey = crypto.createPrivateKey(JITSI_PRIVATE_KEY.replace(/\\n/g, "\n"));
  if (privateKey.asymmetricKeyType !== "rsa") throw new Error("JaaS requires an RSA private key");
  return {
    appId: JITSI_APP_ID,
    apiKeyId: JITSI_API_KEY_ID,
    privateKey,
  };
};

export const createMeeting = async (req, res) => {
  let config;
  try {
    config = jaasConfig();
  } catch (error) {
    console.error("Invalid JaaS configuration:", error.message);
    return res.status(503).json({ message: "JaaS meeting credentials are invalid" });
  }
  if (!config) return res.status(503).json({ message: "Authenticated JaaS meetings are not configured on this server" });
  try {
    const roomId = crypto.randomBytes(20).toString("hex");
    const meeting = await Meeting.create({ roomId, ownerId: req.authenticatedUser._id });
    return res.status(201).json({ roomId: meeting.roomId });
  } catch (error) {
    console.error("Unable to create authenticated meeting:", error);
    return res.status(500).json({ message: "Unable to create meeting" });
  }
};

export const getMeetingToken = async (req, res) => {
  const { roomId } = req.params;
  if (!ROOM_ID_PATTERN.test(roomId)) return res.status(400).json({ message: "Invalid meeting ID" });
  let config;
  try {
    config = jaasConfig();
  } catch (error) {
    console.error("Invalid JaaS configuration:", error.message);
    return res.status(503).json({ message: "JaaS meeting credentials are invalid" });
  }
  if (!config) return res.status(503).json({ message: "Authenticated JaaS meetings are not configured on this server" });

  try {
    const meeting = await Meeting.findOne({ roomId, expiresAt: { $gt: new Date() } });
    if (!meeting) return res.status(404).json({ message: "Meeting not found or expired" });

    const user = req.authenticatedUser;
    const isHost = meeting.ownerId.equals(user._id);
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        aud: "jitsi",
        iss: "chat",
        sub: config.appId,
        room: roomId,
        iat: now,
        nbf: now - 10,
        exp: now + 60 * 60,
        context: {
          user: {
            id: user._id.toString(),
            name: user.channelname || user.name || "YourTube member",
            email: user.email,
            ...(user.image ? { avatar: user.image } : {}),
            moderator: isHost ? "true" : "false",
          },
          features: {
            livestreaming: false,
            recording: false,
            transcription: false,
            "file-upload": true,
            "outbound-call": false,
            "sip-outbound-call": false,
          },
          room: { regex: false },
        },
      },
      config.privateKey,
      {
        algorithm: "RS256",
        header: { kid: `${config.appId}/${config.apiKeyId}`, typ: "JWT" },
      }
    );
    return res.status(200).json({
      token,
      domain: "8x8.vc",
      roomName: `${config.appId}/${roomId}`,
      isHost,
    });
  } catch (error) {
    console.error("Unable to authorize JaaS meeting:", error);
    return res.status(500).json({ message: "Unable to authorize this meeting" });
  }
};
