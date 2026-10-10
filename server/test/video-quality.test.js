import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { after, test } from "node:test";
import Subscription from "../Modals/subscription.js";
import TrustedDevice from "../Modals/trusteddevice.js";
import Video from "../Modals/video.js";
import { createPlaybackToken, streamVideo, uploadvideo } from "../controllers/video.js";

const previousCwd = process.cwd();
const previousSecret = process.env.MEDIA_TOKEN_SECRET;
const uploadDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../uploads");
const createdFiles = [];
const originalSave = Video.prototype.save;
const originalFindById = Video.findById;
const originalSubscriptionFindOne = Subscription.findOne;
const originalTrustedDeviceFindOne = TrustedDevice.findOne;
let savedVideo;

const makeResponse = () => {
  const chunks = [];
  const response = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  response.headers = {};
  response.statusCode = 200;
  response.setHeader = (name, value) => {
    response.headers[name.toLowerCase()] = value;
    return response;
  };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  response.content = () => Buffer.concat(chunks).toString();
  return response;
};

const makeAsset = async (contents) => {
  const filePath = path.join(uploadDirectory, `${crypto.randomUUID()}.mp4`);
  await fs.writeFile(filePath, contents);
  createdFiles.push(filePath);
  return filePath;
};

after(async () => {
  await Promise.all(createdFiles.map((filePath) => fs.rm(filePath, { force: true })));
  Video.prototype.save = originalSave;
  Video.findById = originalFindById;
  Subscription.findOne = originalSubscriptionFindOne;
  TrustedDevice.findOne = originalTrustedDeviceFindOne;
  if (previousSecret === undefined) delete process.env.MEDIA_TOKEN_SECRET;
  else process.env.MEDIA_TOKEN_SECRET = previousSecret;
  process.chdir(previousCwd);
});

test("uploads optional renditions and issues session-bound streams for each available quality", async () => {
  process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  await fs.mkdir(uploadDirectory, { recursive: true });
  process.env.MEDIA_TOKEN_SECRET = "quality-test-secret-with-at-least-32-characters";
  Video.prototype.save = async function save() {
    savedVideo = this;
    return this;
  };
  Video.findById = () => ({ select: async () => savedVideo });
  Subscription.findOne = () => ({ sort: async () => null });
  TrustedDevice.findOne = () => ({ select: async () => ({ _id: "trusted-device" }) });

  const sourcePath = await makeAsset("source rendition");
  const qualityPath = await makeAsset("720p rendition");
  const uploadResponse = makeResponse();
  await uploadvideo({
    files: {
      file: [{
        path: sourcePath,
        originalname: "source.mp4",
        mimetype: "video/mp4",
        size: Buffer.byteLength("source rendition"),
      }],
      quality720p: [{
        path: qualityPath,
        originalname: "720p.mp4",
        mimetype: "video/mp4",
        size: Buffer.byteLength("720p rendition"),
      }],
    },
    body: { videotitle: "Quality test", videochanel: "Test channel" },
    authenticatedUser: { _id: "test-user" },
  }, uploadResponse);
  assert.equal(uploadResponse.statusCode, 201);
  assert.equal(savedVideo.qualityVariants.length, 1);
  assert.equal(savedVideo.qualityVariants[0].quality, "720p");

  const tokenResponse = makeResponse();
  await createPlaybackToken({
    params: { videoId: savedVideo._id.toString() },
    authenticatedUser: { _id: "test-user" },
    trustedDevice: { deviceHash: "device-hash", sessionId: "app-session" },
  }, tokenResponse);
  assert.equal(tokenResponse.statusCode, 200);
  assert.deepEqual(tokenResponse.body.qualities.map(({ quality }) => quality), ["source", "720p"]);
  assert.equal(tokenResponse.body.url, tokenResponse.body.qualities[0].url);

  for (const [index, quality] of tokenResponse.body.qualities.entries()) {
    const token = new URL(quality.url, "https://yourtube.example").searchParams.get("token");
    assert.equal(jwt.verify(token, process.env.MEDIA_TOKEN_SECRET).quality, quality.quality);
    const response = makeResponse();
    const completed = once(response, "finish");
    await streamVideo({
      params: { videoId: savedVideo._id.toString() },
      query: { token },
      get: () => undefined,
    }, response);
    await completed;
    assert.equal(response.statusCode, 200);
    assert.equal(response.content(), index === 0 ? "source rendition" : "720p rendition");
    assert.equal(response.headers["accept-ranges"], "bytes");
  }

  savedVideo.qualityVariants = [];
  const legacyResponse = makeResponse();
  await createPlaybackToken({
    params: { videoId: savedVideo._id.toString() },
    authenticatedUser: { _id: "test-user" },
    trustedDevice: { deviceHash: "device-hash", sessionId: "app-session" },
  }, legacyResponse);
  assert.deepEqual(legacyResponse.body.qualities.map(({ quality }) => quality), ["source"]);
  const legacyToken = new URL(legacyResponse.body.url, "https://yourtube.example").searchParams.get("token");
  const legacyStreamResponse = makeResponse();
  const legacyStreamFinished = once(legacyStreamResponse, "finish");
  await streamVideo({
    params: { videoId: savedVideo._id.toString() },
    query: { token: legacyToken },
    get: () => undefined,
  }, legacyStreamResponse);
  await legacyStreamFinished;
  assert.equal(legacyStreamResponse.content(), "source rendition");

  TrustedDevice.findOne = () => ({ select: async () => null });
  const rejectedResponse = makeResponse();
  const sourceToken = new URL(tokenResponse.body.url, "https://yourtube.example").searchParams.get("token");
  await streamVideo({
    params: { videoId: savedVideo._id.toString() },
    query: { token: sourceToken },
    get: () => undefined,
  }, rejectedResponse);
  assert.equal(rejectedResponse.statusCode, 401);
  assert.equal(rejectedResponse.body.message, "Sign in again to continue playback");
});
