import mongoose from "mongoose";
const commentschema = mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    commentbody: { type: String },
    usercommented: { type: String },
    commentedon: { type: Date, default: Date.now },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "comment", default: null },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    sourceLanguage: { type: String, maxlength: 35 },
    translations: [
      {
        targetLanguage: { type: String, required: true, maxlength: 35 },
        sourceLanguage: { type: String, maxlength: 35 },
        translatedText: { type: String, required: true, maxlength: 4000 },
        translatedAt: { type: Date, default: Date.now },
      },
    ],
    editedAt: { type: Date },
    editHistory: [
      {
        commentbody: { type: String, required: true },
        editedAt: { type: Date, required: true },
      },
    ],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    reports: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
        reason: { type: String, enum: ["spam", "harassment", "offensive", "other"], required: true },
        reportedAt: { type: Date, default: Date.now },
      },
    ],
    moderationStatus: {
      type: String,
      enum: ["visible", "under_review", "removed"],
      default: "visible",
    },
  },
  {
    timestamps: true,
  }
);

commentschema.index({ videoid: 1, commentedon: -1 });
commentschema.index({ userid: 1, commentedon: -1 });

export default mongoose.model("comment", commentschema);
