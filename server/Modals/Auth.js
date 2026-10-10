import mongoose from "mongoose";
const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  location: { type: String, maxlength: 100 },
  image: { type: String },
  preferredTheme: { type: String, enum: ["light", "dark"] },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
