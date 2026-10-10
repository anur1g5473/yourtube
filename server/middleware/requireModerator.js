export function requireModerator(req, res, next) {
  const moderatorEmails = (process.env.MODERATOR_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLocaleLowerCase())
    .filter(Boolean);
  const email = req.authenticatedUser?.email?.toLocaleLowerCase();
  if (!email || !moderatorEmails.includes(email)) {
    return res.status(403).json({ message: "Moderator access is required" });
  }
  return next();
}
