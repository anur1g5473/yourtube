import axios from "axios";
import { auth } from "./firebase";

const baseURL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "http://localhost:5000";
export const DEVICE_ID_STORAGE_KEY = "yourtube-device-id";
export const APP_SESSION_STORAGE_KEY = "yourtube-app-session";

const axiosInstance = axios.create({
  baseURL,
});

axiosInstance.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined") {
    config.headers = config.headers || {};
    if (auth.currentUser) {
      config.headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    }
    const deviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    const sessionToken = window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY);
    if (deviceId) config.headers["X-YourTube-Device"] = deviceId;
    if (sessionToken) config.headers["X-YourTube-Session"] = sessionToken;
  }
  return config;
});

export default axiosInstance;
