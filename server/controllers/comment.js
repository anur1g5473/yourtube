import comment from "../Modals/comment.js";
import mongoose from "mongoose";
import users from "../Modals/Auth.js";

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const COMMENT_COOLDOWN_MS = 5000;
const COMMENT_LIMIT_PER_MINUTE = 5;
const blockedTerms = (process.env.COMMENT_BLOCKED_TERMS || "")
  .split(",")
  .map((term) => term.trim().toLocaleLowerCase())
  .filter(Boolean);

const validateCommentBody = (body) => {
  if (typeof body !== "string") return "A comment is required";
  const text = body.trim();
  if (!text) return "A comment cannot be empty";
  if (text.length > 2000) return "Comments must be 2,000 characters or fewer";
  if (/(\p{So}|\p{Sk}){12,}/u.test(text)) return "Please avoid repeated emoji or symbol-only comments";
  if (/(https?:\/\/|www\.)/i.test(text)) return "Links are not allowed in comments";
  if (blockedTerms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))) {
    return "This comment contains language that is not allowed";
  }
  return null;
};

const validateObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const extractMentionNames = (text) => [
  ...new Set([...text.matchAll(/(?:^|[^\w@])@([a-zA-Z0-9_]{1,30})\b/g)].map((match) => match[1].toLocaleLowerCase())),
].slice(0, 10);

const resolveMentions = async (text) => {
  const names = extractMentionNames(text);
  if (!names.length) return [];
  const channelnamePatterns = names.map((name) => new RegExp(`^${escapeRegex(name)}$`, "i"));
  const mentionedUsers = await users.find({ channelname: { $in: channelnamePatterns } }).select("_id").limit(10);
  return mentionedUsers.map((mentionedUser) => mentionedUser._id);
};

export const searchCommentUsers = async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!/^[a-zA-Z0-9_]{1,30}$/.test(query)) {
    return res.status(400).json({ message: "Enter 1–30 letters, numbers, or underscores to search" });
  }
  try {
    const results = await users.find({
      channelname: { $regex: escapeRegex(query), $options: "i" },
    }).select("_id name channelname image").limit(8).lean();
    return res.status(200).json({ users: results });
  } catch (error) {
    console.error("Unable to search comment mentions:", error);
    return res.status(500).json({ message: "Unable to search for users" });
  }
};

const verifyCommentCaptcha = async (token, ipAddress) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { configured: false, success: false };
  if (typeof token !== "string" || !token) return { configured: true, success: false };

  const body = new URLSearchParams({ secret, response: token });
  if (ipAddress) body.set("remoteip", ipAddress);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Turnstile verification returned ${response.status}`);
  const result = await response.json();
  return { configured: true, success: result.success === true };
};

export const postcomment = async (req, res) => {
  const { videoid, commentbody, parentId, captchaToken } = req.body;
  const user = req.authenticatedUser;
  const validationError = validateCommentBody(commentbody);
  if (validationError) return res.status(400).json({ message: validationError });
  if (!validateObjectId(videoid)) return res.status(400).json({ message: "Invalid video ID" });
  if (parentId && !validateObjectId(parentId)) return res.status(400).json({ message: "Invalid reply target" });

  try {
    const now = new Date();
    const recent = await comment.find({
      userid: user._id,
      commentedon: { $gte: new Date(now.getTime() - 60000) },
      moderationStatus: { $ne: "removed" },
    }).sort({ commentedon: -1 }).limit(COMMENT_LIMIT_PER_MINUTE + 1);
    if (recent[0] && now.getTime() - new Date(recent[0].commentedon).getTime() < COMMENT_COOLDOWN_MS) {
      return res.status(429).json({ message: "Please wait a few seconds before commenting again." });
    }
    if (recent.length >= COMMENT_LIMIT_PER_MINUTE) {
      if (!captchaToken) {
        return res.status(429).json({
          captchaRequired: true,
          message: "Verify that you're human to continue commenting.",
        });
      }
      const verification = await verifyCommentCaptcha(captchaToken, req.ip);
      if (!verification.configured) {
        return res.status(503).json({ message: "Comment verification is not configured on this server." });
      }
      if (!verification.success) {
        return res.status(400).json({ captchaRequired: true, message: "CAPTCHA verification failed. Please try again." });
      }
    }
    if (recent.some((entry) => entry.commentbody.trim().toLocaleLowerCase() === commentbody.trim().toLocaleLowerCase())) {
      return res.status(409).json({ message: "Duplicate comments are not allowed." });
    }
    if (parentId) {
      const parent = await comment.findOne({ _id: parentId, videoid, moderationStatus: { $ne: "removed" } });
      if (!parent) return res.status(404).json({ message: "Reply target not found" });
    }

    const created = await comment.create({
      videoid,
      userid: user._id,
      usercommented: user.name || "User",
      commentbody: commentbody.trim(),
      parentId: parentId || null,
      mentions: await resolveMentions(commentbody.trim()),
      commentedon: now,
    });
    return res.status(201).json({ comment: created });
  } catch (error) {
    console.error("Error saving comment:", error);
    return res.status(500).json({ message: "Unable to post comment" });
  }
};

export const getallcomment = async (req, res) => {
  const { videoid } = req.params;
  const sort = ["newest", "oldest", "mostLiked", "relevant"].includes(req.query.sort)
    ? req.query.sort
    : "newest";
  if (!validateObjectId(videoid)) return res.status(400).json({ message: "Invalid video ID" });
  try {
    const sortStage =
      sort === "oldest" ? { commentedon: 1 } :
        sort === "mostLiked" ? { likesCount: -1, commentedon: -1 } :
          sort === "relevant" ? { relevanceScore: -1, commentedon: -1 } :
            { commentedon: -1 };
    const results = await comment.aggregate([
      { $match: { videoid: new mongoose.Types.ObjectId(videoid), moderationStatus: { $ne: "removed" } } },
      { $addFields: { likesCount: { $size: { $ifNull: ["$likes", []] } } } },
      {
        $addFields: {
          relevanceScore: {
            $subtract: [
              { $multiply: ["$likesCount", 10] },
              { $divide: [{ $subtract: [new Date(), "$commentedon"] }, 3600000] },
            ],
          },
        },
      },
      { $sort: sortStage },
      { $limit: 500 },
      {
        $lookup: {
          from: "users",
          localField: "userid",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, channelname: 1, image: 1, location: 1 } }],
          as: "author",
        },
      },
      { $unwind: { path: "$author", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "mentions",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, channelname: 1 } }],
          as: "mentionProfiles",
        },
      },
    ]);
    return res.status(200).json(results);
  } catch (error) {
    console.error("Error fetching comments:", error);
    return res.status(500).json({ message: "Unable to load comments" });
  }
};

export const deletecomment = async (req, res) => {
  const { id } = req.params;
  if (!validateObjectId(id)) return res.status(400).json({ message: "Invalid comment ID" });
  try {
    const existing = await comment.findOne({ _id: id, userid: req.authenticatedUser._id });
    if (!existing) return res.status(404).json({ message: "Comment not found" });
    existing.commentbody = "[deleted]";
    existing.moderationStatus = "removed";
    await existing.save();
    return res.status(200).json({ comment: existing });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return res.status(500).json({ message: "Unable to delete comment" });
  }
};

export const editcomment = async (req, res) => {
  const { id } = req.params;
  const { commentbody } = req.body;
  const validationError = validateCommentBody(commentbody);
  if (validationError) return res.status(400).json({ message: validationError });
  if (!validateObjectId(id)) return res.status(400).json({ message: "Invalid comment ID" });
  try {
    const existing = await comment.findOne({ _id: id, userid: req.authenticatedUser._id });
    if (!existing) return res.status(404).json({ message: "Comment not found" });
    if (Date.now() - new Date(existing.commentedon).getTime() > EDIT_WINDOW_MS) {
      return res.status(403).json({ message: "Comments can only be edited for 15 minutes after posting" });
    }
    const editedAt = new Date();
    const updated = await comment.findOneAndUpdate(
      {
        _id: id,
        userid: req.authenticatedUser._id,
        updatedAt: existing.updatedAt,
        moderationStatus: { $ne: "removed" },
      },
      {
        $set: {
          commentbody: commentbody.trim(),
          mentions: await resolveMentions(commentbody.trim()),
          editedAt,
          translations: [],
        },
        $unset: { sourceLanguage: 1 },
        $push: {
          editHistory: { commentbody: existing.commentbody, editedAt },
        },
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({ message: "This comment changed while you were editing. Reload and try again." });
    }
    return res.status(200).json({ comment: updated });
  } catch (error) {
    console.error("Error editing comment:", error);
    return res.status(500).json({ message: "Unable to edit comment" });
  }
};

export const getCommentHistory = async (req, res) => {
  const { id } = req.params;
  if (!validateObjectId(id)) return res.status(400).json({ message: "Invalid comment ID" });
  try {
    const existing = await comment.findOne({
      _id: id,
      userid: req.authenticatedUser._id,
    }).select("commentbody editHistory");
    if (!existing) return res.status(404).json({ message: "Comment not found" });
    return res.status(200).json({
      current: existing.commentbody,
      revisions: existing.editHistory,
    });
  } catch (error) {
    console.error("Unable to load comment history:", error);
    return res.status(500).json({ message: "Unable to load comment history" });
  }
};

export const reactToComment = async (req, res) => {
  const { id } = req.params;
  const { reaction } = req.body;
  if (!validateObjectId(id)) return res.status(400).json({ message: "Invalid comment ID" });
  if (!["like", "dislike"].includes(reaction)) return res.status(400).json({ message: "Invalid reaction" });
  try {
    const target = await comment.findOne({ _id: id, moderationStatus: { $ne: "removed" } });
    if (!target) return res.status(404).json({ message: "Comment not found" });
    const userId = req.authenticatedUser._id;
    const ownReactions = reaction === "like" ? target.likes : target.dislikes;
    const otherReactions = reaction === "like" ? target.dislikes : target.likes;
    const ownIndex = ownReactions.findIndex((entry) => entry.equals(userId));
    if (ownIndex >= 0) ownReactions.splice(ownIndex, 1);
    else ownReactions.push(userId);
    const otherIndex = otherReactions.findIndex((entry) => entry.equals(userId));
    if (otherIndex >= 0) otherReactions.splice(otherIndex, 1);
    await target.save();
    return res.status(200).json({ comment: target });
  } catch (error) {
    console.error("Error reacting to comment:", error);
    return res.status(500).json({ message: "Unable to update reaction" });
  }
};

export const reportComment = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  if (!validateObjectId(id)) return res.status(400).json({ message: "Invalid comment ID" });
  if (!["spam", "harassment", "offensive", "other"].includes(reason)) {
    return res.status(400).json({ message: "Select a valid report reason" });
  }
  try {
    const target = await comment.findOne({ _id: id, moderationStatus: { $ne: "removed" } });
    if (!target) return res.status(404).json({ message: "Comment not found" });
    const userId = req.authenticatedUser._id;
    if (target.reports.some((report) => report.userId.equals(userId))) {
      return res.status(409).json({ message: "You have already reported this comment" });
    }
    target.reports.push({ userId, reason });
    target.moderationStatus = "under_review";
    await target.save();
    return res.status(201).json({ message: "Report submitted for moderator review" });
  } catch (error) {
    console.error("Error reporting comment:", error);
    return res.status(500).json({ message: "Unable to submit report" });
  }
};

export const getReportedComments = async (req, res) => {
  try {
    const reports = await comment.find({
      moderationStatus: "under_review",
      "reports.0": { $exists: true },
    }).sort({ updatedAt: -1 }).limit(200).lean();
    return res.status(200).json(reports);
  } catch (error) {
    console.error("Unable to load reported comments:", error);
    return res.status(500).json({ message: "Unable to load moderation queue" });
  }
};

export const moderateComment = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  if (!validateObjectId(id)) return res.status(400).json({ message: "Invalid comment ID" });
  if (!["approve", "remove"].includes(action)) {
    return res.status(400).json({ message: "Choose approve or remove" });
  }
  try {
    const target = await comment.findById(id);
    if (!target) return res.status(404).json({ message: "Comment not found" });
    target.moderationStatus = action === "approve" ? "visible" : "removed";
    await target.save();
    return res.status(200).json({ comment: target });
  } catch (error) {
    console.error("Unable to moderate comment:", error);
    return res.status(500).json({ message: "Unable to update moderation status" });
  }
};

export const translateComment = async (req, res) => {
  const { id } = req.params;
  const { targetLanguage } = req.body;
  const translationUrl = process.env.TRANSLATION_API_URL;
  if (!validateObjectId(id)) return res.status(400).json({ message: "Invalid comment ID" });
  if (typeof targetLanguage !== "string" || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(targetLanguage)) {
    return res.status(400).json({ message: "Enter a valid language code, such as en or hi" });
  }
  if (!translationUrl) return res.status(503).json({ message: "Translation service is not configured" });
  try {
    const target = await comment.findOne({ _id: id, moderationStatus: { $ne: "removed" } })
      .select("commentbody sourceLanguage translations");
    if (!target) return res.status(404).json({ message: "Comment not found" });
    const cached = target.translations.find((translation) => translation.targetLanguage === targetLanguage);
    if (cached) {
      return res.status(200).json({
        translatedText: cached.translatedText,
        targetLanguage: cached.targetLanguage,
        sourceLanguage: cached.sourceLanguage || target.sourceLanguage,
        translatedAt: cached.translatedAt,
      });
    }
    const response = await fetch(translationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.TRANSLATION_API_KEY
          ? { Authorization: `Bearer ${process.env.TRANSLATION_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({ q: target.commentbody, target: targetLanguage, format: "text" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("Translation provider returned an error:", response.status);
      return res.status(502).json({ message: "Translation service is unavailable" });
    }
    const result = await response.json();
    const translatedText = result.translatedText || result.translation;
    if (typeof translatedText !== "string" || !translatedText.trim() || translatedText.length > 4000) {
      return res.status(502).json({ message: "Translation service returned an invalid response" });
    }
    const detectedLanguage = result.detectedLanguage?.language;
    const sourceLanguage = typeof detectedLanguage === "string" &&
      /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(detectedLanguage)
      ? detectedLanguage
      : undefined;
    const translatedAt = new Date();
    const translation = {
      targetLanguage,
      sourceLanguage,
      translatedText: translatedText.trim(),
      translatedAt,
    };
    const saved = await comment.updateOne(
      {
        _id: id,
        moderationStatus: { $ne: "removed" },
        commentbody: target.commentbody,
        "translations.targetLanguage": { $ne: targetLanguage },
      },
      {
        $push: { translations: { $each: [translation], $slice: -20 } },
        ...(sourceLanguage ? { $set: { sourceLanguage } } : {}),
      },
      { runValidators: true }
    );
    if (saved.modifiedCount) {
      return res.status(200).json({ ...translation, translatedText: translation.translatedText });
    }
    const latest = await comment.findById(id).select("commentbody sourceLanguage translations");
    if (!latest || latest.commentbody !== target.commentbody) {
      return res.status(409).json({ message: "The comment changed while it was being translated. Please retry." });
    }
    const storedTranslation = latest.translations.find((item) => item.targetLanguage === targetLanguage);
    if (!storedTranslation) {
      return res.status(409).json({ message: "The translation could not be saved. Please retry." });
    }
    return res.status(200).json({
      translatedText: storedTranslation.translatedText,
      targetLanguage: storedTranslation.targetLanguage,
      sourceLanguage: storedTranslation.sourceLanguage || latest.sourceLanguage,
      translatedAt: storedTranslation.translatedAt,
    });
  } catch (error) {
    console.error("Error translating comment:", error);
    return res.status(502).json({ message: "Unable to translate this comment right now" });
  }
};
