import mongoose from "mongoose";
import users from "../Modals/Auth.js";

export const login = async (req, res) => {
  const { email, name, picture } = req.firebaseClaims || {};
  const image = picture || null;
  if (!email || req.firebaseClaims?.email_verified !== true) {
    return res.status(401).json({ message: "A verified Firebase account is required" });
  }

  try {
    const existingUser = await users.findOne({ email });

    if (!existingUser) {
      const newUser = await users.create({ email, name, image });
      return res.status(201).json({ result: newUser });
    } else {
      return res.status(200).json({ result: existingUser });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description, location } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }
  if (req.authenticatedUser._id.toString() !== _id) {
    return res.status(403).json({ message: "You can only update your own profile" });
  }
  if (typeof channelname !== "string" || channelname.trim().length > 80) {
    return res.status(400).json({ message: "Channel names must be 80 characters or fewer" });
  }
  if (typeof description !== "string" || description.length > 1000) {
    return res.status(400).json({ message: "Channel descriptions must be 1,000 characters or fewer" });
  }
  if (location !== undefined && (typeof location !== "string" || location.trim().length > 100)) {
    return res.status(400).json({ message: "Location must be 100 characters or fewer" });
  }
  try {
    const profileUpdates = {
      channelname: channelname.trim(),
      description: description.trim(),
    };
    if (location !== undefined) profileUpdates.location = location.trim();
    const updatedata = await users.findByIdAndUpdate(
      _id,
      { $set: profileUpdates },
      { new: true, runValidators: true }
    );
    return res.status(201).json(updatedata);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const updatePreferences = async (req, res) => {
  const { preferredTheme } = req.body;
  if (!["light", "dark"].includes(preferredTheme)) {
    return res.status(400).json({ message: "Theme must be light or dark" });
  }
  try {
    const user = await users.findByIdAndUpdate(
      req.authenticatedUser._id,
      { $set: { preferredTheme } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ message: "User account not found" });
    return res.status(200).json({ user });
  } catch (error) {
    console.error("Unable to update account preferences:", error);
    return res.status(500).json({ message: "Unable to update account preferences" });
  }
};
