import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback": () => void;
          "expired-callback": () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  commentedon: string;
  editedAt?: string;
  parentId?: string | null;
  sourceLanguage?: string;
  translations?: Array<{
    targetLanguage: string;
    sourceLanguage?: string;
    translatedText: string;
    translatedAt: string;
  }>;
  translatedLanguage?: string;
  likes?: string[];
  dislikes?: string[];
  translatedText?: string;
  author?: {
    name?: string;
    channelname?: string;
    image?: string;
    location?: string;
  };
  mentionProfiles?: Array<{ _id: string; channelname?: string; name?: string }>;
}

interface MentionUser {
  _id: string;
  name?: string;
  channelname: string;
  image?: string;
}

interface CommentRevision {
  commentbody: string;
  editedAt: string;
}

type SortOrder = "newest" | "oldest" | "mostLiked" | "relevant";
type MentionComposer = "new" | "edit" | "reply";

const Comments = ({ videoId }: { videoId: string }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [visibleHistoryId, setVisibleHistoryId] = useState<string | null>(null);
  const [commentHistory, setCommentHistory] = useState<Record<string, CommentRevision[]>>({});
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionUser[]>([]);
  const [activeMentionComposer, setActiveMentionComposer] = useState<MentionComposer | null>(null);
  const captchaContainer = React.useRef<HTMLDivElement>(null);
  const captchaWidget = React.useRef<string | null>(null);
  const mentionSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionRequestId = useRef(0);
  const { user } = useUser();

  useEffect(() => () => {
    if (mentionSearchTimer.current) clearTimeout(mentionSearchTimer.current);
  }, []);

  const updateComposerText = (composer: MentionComposer, value: string) => {
    if (composer === "new") setNewComment(value);
    if (composer === "edit") setEditText(value);
    if (composer === "reply") setReplyText(value);

    if (mentionSearchTimer.current) clearTimeout(mentionSearchTimer.current);
    const requestId = ++mentionRequestId.current;
    const match = /(?:^|[^\w@])@([a-zA-Z0-9_]{1,30})$/.exec(value);
    if (!user || !match) {
      setActiveMentionComposer(null);
      setMentionSuggestions([]);
      return;
    }

    setActiveMentionComposer(composer);
    mentionSearchTimer.current = setTimeout(async () => {
      try {
        const response = await axiosInstance.get<{ users: MentionUser[] }>("/comment/users", {
          params: { q: match[1] },
        });
        if (requestId === mentionRequestId.current) setMentionSuggestions(response.data.users);
      } catch (error) {
        console.error("Unable to search for comment mentions:", error);
        if (requestId === mentionRequestId.current) {
          setMentionSuggestions([]);
          setMessage("User suggestions for mentions could not be loaded.");
        }
      }
    }, 250);
  };

  const chooseMention = (composer: MentionComposer, mentionedUser: MentionUser) => {
    const currentText = composer === "new" ? newComment : composer === "edit" ? editText : replyText;
    const updatedText = currentText.replace(
      /(^|[^\w@])@[a-zA-Z0-9_]{1,30}$/,
      (_match, prefix: string) => `${prefix}@${mentionedUser.channelname} `
    );
    if (composer === "new") setNewComment(updatedText);
    if (composer === "edit") setEditText(updatedText);
    if (composer === "reply") setReplyText(updatedText);
    setMentionSuggestions([]);
    setActiveMentionComposer(null);
  };

  const renderMentionSuggestions = (composer: MentionComposer) => {
    if (activeMentionComposer !== composer || !mentionSuggestions.length) return null;
    return (
      <div className="max-h-48 overflow-y-auto rounded-md border bg-white p-1" role="listbox" aria-label="Mention suggestions">
        {mentionSuggestions.map((mentionedUser) => (
          <button
            key={mentionedUser._id}
            type="button"
            role="option"
            aria-selected="false"
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => chooseMention(composer, mentionedUser)}
          >
            <span className="font-medium">@{mentionedUser.channelname}</span>
            {mentionedUser.name && <span className="text-gray-600">{mentionedUser.name}</span>}
          </button>
        ))}
      </div>
    );
  };

  const renderCommentBody = (comment: Comment) => {
    const mentionProfiles = new Map(
      (comment.mentionProfiles || [])
        .filter((profile) => profile.channelname)
        .map((profile) => [profile.channelname!.toLocaleLowerCase(), profile])
    );
    const parts: React.ReactNode[] = [];
    const expression = /(^|[^\w@])@([a-zA-Z0-9_]{1,30})\b/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(comment.commentbody)) !== null) {
      const mentionStart = match.index + match[1].length;
      if (mentionStart > cursor) parts.push(comment.commentbody.slice(cursor, mentionStart));
      const profile = mentionProfiles.get(match[2].toLocaleLowerCase());
      parts.push(profile ? (
        <a key={`${mentionStart}-${profile._id}`} className="font-medium text-primary underline" href={`/channel/${profile._id}`}>
          @{match[2]}
        </a>
      ) : `@${match[2]}`);
      cursor = mentionStart + match[0].length - match[1].length;
    }
    if (cursor < comment.commentbody.length) parts.push(comment.commentbody.slice(cursor));
    return parts;
  };

  useEffect(() => {
    if (!captchaRequired || !captchaContainer.current) return;
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      setMessage("Comment verification is not configured in this deployment.");
      return;
    }

    let active = true;
    const renderWidget = () => {
      if (!active || !window.turnstile || !captchaContainer.current) return;
      captchaWidget.current = window.turnstile.render(captchaContainer.current, {
        sitekey: siteKey,
        callback: setCaptchaToken,
        "error-callback": () => {
          setCaptchaToken("");
          setMessage("CAPTCHA could not be verified. Please retry.");
        },
        "expired-callback": () => setCaptchaToken(""),
      });
    };
    let script = document.getElementById("turnstile-script") as HTMLScriptElement | null;
    if (window.turnstile) {
      renderWidget();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.id = "turnstile-script";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderWidget);
    }

    return () => {
      active = false;
      if (script) script.removeEventListener("load", renderWidget);
      if (captchaWidget.current && window.turnstile) {
        window.turnstile.remove(captchaWidget.current);
        captchaWidget.current = null;
      }
    };
  }, [captchaRequired]);

  const loadComments = useCallback(async () => {
    try {
      const response = await axiosInstance.get<Comment[]>(`/comment/${videoId}`, {
        params: { sort: sortOrder },
      });
      setComments(response.data);
      setMessage("");
    } catch (error) {
      console.error("Unable to load comments:", error);
      setMessage("Comments could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [videoId, sortOrder]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const byId = useMemo(() => new Map(comments.map((comment) => [comment._id, comment])), [comments]);
  const topLevel = comments.filter((comment) => !comment.parentId || !byId.has(comment.parentId));
  const repliesFor = (id: string) =>
    comments
      .filter((comment) => comment.parentId === id)
      .sort((a, b) => new Date(a.commentedon).getTime() - new Date(b.commentedon).getTime());

  const postComment = async (commentbody: string, parentId?: string) => {
    if (!user || !commentbody.trim()) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        commentbody: commentbody.trim(),
        parentId,
        captchaToken: captchaToken || undefined,
      });
      setNewComment("");
      setReplyText("");
      setReplyTo(null);
      setCaptchaRequired(false);
      setCaptchaToken("");
      await loadComments();
    } catch (error: any) {
      console.error("Unable to post comment:", error);
      if (error.response?.data?.captchaRequired) {
        setCaptchaRequired(true);
        setCaptchaToken("");
        if (captchaWidget.current && window.turnstile) window.turnstile.reset(captchaWidget.current);
      }
      setMessage(error.response?.data?.message || "Comment could not be posted.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateComment = async () => {
    if (!editingCommentId || !editText.trim()) return;
    try {
      await axiosInstance.patch(`/comment/editcomment/${editingCommentId}`, {
        commentbody: editText,
      });
      setEditingCommentId(null);
      setEditText("");
      await loadComments();
    } catch (error: any) {
      console.error("Unable to edit comment:", error);
      setMessage(error.response?.data?.message || "Comment could not be edited.");
    }
  };

  const toggleCommentHistory = async (id: string) => {
    if (visibleHistoryId === id) {
      setVisibleHistoryId(null);
      return;
    }
    try {
      const response = await axiosInstance.get<{ revisions: CommentRevision[] }>(`/comment/${id}/history`);
      setCommentHistory((history) => ({ ...history, [id]: response.data.revisions }));
      setVisibleHistoryId(id);
    } catch (error: any) {
      console.error("Unable to load comment history:", error);
      setMessage(error.response?.data?.message || "Comment history could not be loaded.");
    }
  };

  const deleteComment = async (id: string) => {
    try {
      await axiosInstance.delete(`/comment/deletecomment/${id}`);
      await loadComments();
    } catch (error: any) {
      console.error("Unable to delete comment:", error);
      setMessage(error.response?.data?.message || "Comment could not be deleted.");
    }
  };

  const reactToComment = async (id: string, reaction: "like" | "dislike") => {
    if (!user) {
      setMessage("Sign in to react to comments.");
      return;
    }
    try {
      await axiosInstance.post(`/comment/${id}/reactions`, { reaction });
      await loadComments();
    } catch (error: any) {
      console.error("Unable to react to comment:", error);
      setMessage(error.response?.data?.message || "Reaction could not be saved.");
    }
  };

  const reportComment = async (id: string) => {
    if (!user) {
      setMessage("Sign in to report a comment.");
      return;
    }
    const reason = window.prompt("Report reason: spam, harassment, offensive, or other", "spam");
    if (!reason) return;
    try {
      const normalizedReason = reason.trim().toLocaleLowerCase();
      if (!["spam", "harassment", "offensive", "other"].includes(normalizedReason)) {
        setMessage("Choose spam, harassment, offensive, or other as the report reason.");
        return;
      }
      const response = await axiosInstance.post(`/comment/${id}/report`, {
        reason: normalizedReason,
      });
      setMessage(response.data.message);
    } catch (error: any) {
      console.error("Unable to report comment:", error);
      setMessage(error.response?.data?.message || "Report could not be submitted.");
    }
  };

  const translateComment = async (comment: Comment) => {
    const targetLanguage = window.prompt("Translate to language code (for example, hi or en):", "en");
    if (!targetLanguage?.trim()) return;
    try {
      const response = await axiosInstance.post(`/comment/${comment._id}/translate`, {
        targetLanguage: targetLanguage.trim(),
      });
      setComments((existing) =>
        existing.map((item) =>
          item._id === comment._id
            ? {
                ...item,
                translatedText: response.data.translatedText,
                translatedLanguage: response.data.targetLanguage,
                sourceLanguage: response.data.sourceLanguage || item.sourceLanguage,
              }
            : item
        )
      );
    } catch (error: any) {
      console.error("Unable to translate comment:", error);
      setMessage(error.response?.data?.message || "Translation is unavailable.");
    }
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <div key={comment._id} className={`flex gap-3 ${isReply ? "ml-10 border-l pl-4" : ""}`}>
      <Avatar className="h-9 w-9">
        <AvatarImage src={comment.author?.image || (comment.userid === user?._id ? user?.image || "" : "")} />
        <AvatarFallback>{(comment.author?.channelname || comment.usercommented)?.[0] || "U"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <a className="text-sm font-semibold" href={`/channel/${comment.userid}`}>
            {comment.author?.channelname || comment.usercommented}
          </a>
          {comment.author?.location && <span className="text-xs text-gray-600">{comment.author.location}</span>}
          <span className="text-xs text-gray-600">
            {formatDistanceToNow(new Date(comment.commentedon), { addSuffix: true })}
          </span>
          {comment.sourceLanguage && <span className="text-xs text-gray-600">Original: {comment.sourceLanguage}</span>}
          {comment.editedAt && <span className="text-xs text-gray-600">Edited</span>}
        </div>

        {editingCommentId === comment._id ? (
          <div className="space-y-2">
            <Textarea value={editText} onChange={(event) => updateComposerText("edit", event.target.value)} maxLength={2000} />
            {renderMentionSuggestions("edit")}
            <div className="flex gap-2">
              <Button size="sm" onClick={updateComment} disabled={!editText.trim()}>Save</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingCommentId(null);
                  setEditText("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">
            {renderCommentBody(comment)}
            {(comment as Comment & { translatedText?: string }).translatedText && (
              <span className="mt-2 block text-gray-600">
                Translation{comment.translatedLanguage ? ` (${comment.translatedLanguage})` : ""}: {comment.translatedText}
              </span>
            )}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <button type="button" onClick={() => void reactToComment(comment._id, "like")}>
            Like {comment.likes?.length || 0}
          </button>
          <button type="button" onClick={() => void reactToComment(comment._id, "dislike")}>
            Dislike {comment.dislikes?.length || 0}
          </button>
          {!isReply && (
            <button type="button" onClick={() => setReplyTo(replyTo === comment._id ? null : comment._id)}>
              Reply
            </button>
          )}
          <button type="button" onClick={() => void translateComment(comment)}>Translate</button>
          <button type="button" onClick={() => void reportComment(comment._id)}>Report</button>
          {comment.userid === user?._id && editingCommentId !== comment._id && (
            <>
              <button type="button" onClick={() => void toggleCommentHistory(comment._id)}>
                {visibleHistoryId === comment._id ? "Hide history" : "History"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingCommentId(comment._id);
                  setEditText(comment.commentbody);
                }}
              >
                Edit
              </button>
              <button type="button" onClick={() => void deleteComment(comment._id)}>Delete</button>
            </>
          )}
        </div>

        {visibleHistoryId === comment._id && (
          <div className="mt-3 space-y-2 rounded border p-3" aria-label="Comment edit history">
            <p className="text-xs font-semibold">Previous versions</p>
            {commentHistory[comment._id]?.length ? commentHistory[comment._id].map((revision, index) => (
              <div key={`${revision.editedAt}-${index}`} className="border-t pt-2">
                <p className="whitespace-pre-wrap break-words text-sm">{revision.commentbody}</p>
                <p className="text-xs text-gray-600">
                  {formatDistanceToNow(new Date(revision.editedAt), { addSuffix: true })}
                </p>
              </div>
            )) : <p className="text-sm text-gray-600">No previous versions.</p>}
          </div>
        )}

        {replyTo === comment._id && (
          <div className="mt-3 space-y-2">
            <Textarea
              aria-label={`Reply to ${comment.usercommented}`}
              placeholder="Write a reply…"
              value={replyText}
              maxLength={2000}
              onChange={(event) => updateComposerText("reply", event.target.value)}
            />
            {renderMentionSuggestions("reply")}
            <Button size="sm" onClick={() => void postComment(replyText, comment._id)} disabled={!replyText.trim() || isSubmitting}>
              {isSubmitting ? "Posting…" : "Post reply"}
            </Button>
          </div>
        )}
        {!isReply && repliesFor(comment._id).map((reply) => renderComment(reply, true))}
      </div>
    </div>
  );

  if (loading) return <div>Loading comments…</div>;

  return (
    <section className="space-y-5" aria-label="Comments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{comments.length} Comments</h2>
        <label className="flex items-center gap-2 text-sm">
          Sort
          <select
            className="rounded border bg-white px-2 py-1"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="mostLiked">Most liked</option>
            <option value="relevant">Most relevant</option>
          </select>
        </label>
      </div>

      {message && <p role="status" className="text-sm text-red-700">{message}</p>}

      {user ? (
        <div className="flex gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.image || ""} />
            <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              aria-label="Add a comment"
              placeholder="Add a comment…"
              value={newComment}
              maxLength={2000}
              onChange={(event) => updateComposerText("new", event.target.value)}
              className="min-h-[80px] resize-y"
            />
            {renderMentionSuggestions("new")}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">{newComment.length}/2000</span>
              {captchaRequired && <div ref={captchaContainer} className="my-3" aria-label="Human verification" />}
              <Button onClick={() => void postComment(newComment)} disabled={!newComment.trim() || isSubmitting}>
                {isSubmitting ? "Posting…" : "Comment"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600">Sign in to join the conversation.</p>
      )}

      <div className="space-y-5">
        {!topLevel.length ? (
          <p className="text-sm italic text-gray-500">No comments yet. Be the first to comment!</p>
        ) : (
          topLevel.map((comment) => renderComment(comment))
        )}
      </div>
    </section>
  );
};

export default Comments;
