"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Captions,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Theater,
} from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import styles from "./Videopplayer.module.css";

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    captionsFile?: string;
  };
  onNext?: () => void;
}

interface SavedProgress {
  currentTime: number;
  duration: number;
  completed: boolean;
}

interface PlaybackQuality {
  quality: string;
  label: string;
  url: string;
}

const COMPLETION_PERCENT = 0.9;
const SAVE_INTERVAL_MS = 10000;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

export default function VideoPlayer({ video, onNext }: VideoPlayerProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const lastSavedAtRef = useRef(0);
  const pendingQualitySwitchRef = useRef<{ currentTime: number; wasPlaying: boolean } | null>(null);
  const onNextRef = useRef(onNext);
  const { user, handlegooglesignin } = useUser();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState(50);
  const [previewFrame, setPreviewFrame] = useState("");
  const [buffered, setBuffered] = useState(0);
  const [sourceQuality, setSourceQuality] = useState("");
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [autoNextSeconds, setAutoNextSeconds] = useState<number | null>(null);
  const [playerMessage, setPlayerMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [availableQualities, setAvailableQualities] = useState<PlaybackQuality[]>([]);
  const [selectedQuality, setSelectedQuality] = useState("source");
  const [playbackError, setPlaybackError] = useState("");
  const [playbackErrorCode, setPlaybackErrorCode] = useState("");
  const [authorizingPlayback, setAuthorizingPlayback] = useState(true);
  const selectedVideoUrl = availableQualities.find((quality) => quality.quality === selectedQuality)?.url || videoUrl;

  const progressKey = `yourtube-progress:${user?._id || "guest"}:${video._id}`;
  onNextRef.current = onNext;

  const capturePreviewFrame = useCallback(() => {
    const preview = previewVideoRef.current;
    if (!preview || preview.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || preview.videoWidth === 0) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 135;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(preview, 0, 0, canvas.width, canvas.height);
      setPreviewFrame(canvas.toDataURL("image/jpeg", 0.65));
    } catch (error) {
      console.error("Unable to capture timeline preview frame:", error);
      setPreviewFrame("");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setVideoUrl("");
    setAvailableQualities([]);
    setSelectedQuality("source");
    pendingQualitySwitchRef.current = null;
    setPreviewTime(null);
    setPreviewFrame("");
    setSourceQuality("");
    setPlaybackError("");
    setPlaybackErrorCode("");

    if (!user) {
      setAuthorizingPlayback(false);
      setPlaybackError("Sign in to watch this video.");
      return;
    }

    setAuthorizingPlayback(true);
    axiosInstance
      .get(`/video/${video._id}/playback`)
      .then((response) => {
        if (cancelled) return;
        const backendUrl = (axiosInstance.defaults.baseURL || "").replace(/\/$/, "");
        const resolvePlaybackUrl = (url: string) => new URL(url, `${backendUrl}/`).toString();
        const qualities: PlaybackQuality[] = Array.isArray(response.data.qualities)
          ? response.data.qualities
            .filter((quality: PlaybackQuality) =>
              ["source", "360p", "480p", "720p", "1080p"].includes(quality.quality)
              && typeof quality.url === "string"
              && typeof quality.label === "string"
            )
            .map((quality: PlaybackQuality) => ({ ...quality, url: resolvePlaybackUrl(quality.url) }))
          : [];
        const original = qualities.find((quality) => quality.quality === "source");
        const originalUrl = original?.url || resolvePlaybackUrl(response.data.url);
        setVideoUrl(originalUrl);
        setAvailableQualities(qualities.length ? qualities : [{ quality: "source", label: "Original", url: originalUrl }]);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Unable to authorize video playback:", error);
        setPlaybackError(error.response?.data?.message || "Video playback could not be authorized.");
        setPlaybackErrorCode(error.response?.data?.code || "");
      })
      .finally(() => {
        if (!cancelled) setAuthorizingPlayback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [video._id, user?._id]);

  useEffect(() => {
    const preview = previewVideoRef.current;
    if (previewTime === null || !preview || preview.readyState < HTMLMediaElement.HAVE_METADATA) {
      return;
    }
    const nextTime = Math.min(previewTime, Math.max(0, preview.duration - 0.05));
    if (Math.abs(preview.currentTime - nextTime) > 0.25) {
      setPreviewFrame("");
      preview.currentTime = nextTime;
    } else capturePreviewFrame();
  }, [capturePreviewFrame, previewTime, selectedVideoUrl]);

  const saveProgress = (time: number, length: number, completed: boolean) => {
    if (!Number.isFinite(length) || length <= 0) return;
    const progress: SavedProgress = {
      currentTime: Math.min(Math.max(time, 0), length),
      duration: length,
      completed,
    };
    localStorage.setItem(progressKey, JSON.stringify(progress));
    if (user && Date.now() - lastSavedAtRef.current >= SAVE_INTERVAL_MS) {
      lastSavedAtRef.current = Date.now();
      axiosInstance
        .put(`/watchprogress/${video._id}`, progress)
        .catch((error) => console.error("Unable to save watch progress:", error));
    }
  };

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const handleLoadedMetadata = async () => {
      const videoDuration = el.duration || 0;
      setDuration(videoDuration);
      setSourceQuality(el.videoWidth && el.videoHeight ? `${el.videoWidth} × ${el.videoHeight}` : "");
      setIsReady(true);
      const pendingSwitch = pendingQualitySwitchRef.current;
      if (pendingSwitch) {
        pendingQualitySwitchRef.current = null;
        const resumeAt = Math.min(pendingSwitch.currentTime, Math.max(0, videoDuration - 0.1));
        el.currentTime = resumeAt;
        setCurrentTime(resumeAt);
        if (pendingSwitch.wasPlaying) {
          try {
            await el.play();
          } catch (error) {
            console.error("Unable to resume playback after changing quality:", error);
            setPlayerMessage("Quality changed. Press play to continue.");
          }
        }
        return;
      }
      let saved: SavedProgress | null = null;
      try {
        const localProgress = localStorage.getItem(progressKey);
        saved = localProgress ? JSON.parse(localProgress) : null;
      } catch (error) {
        console.error("Unable to read local watch progress:", error);
      }

      let resumeTime = saved && !saved.completed ? saved.currentTime : 0;
      if (user) {
        try {
          const response = await axiosInstance.get(`/watchprogress/${video._id}`);
          const serverProgress = response.data?.progress as SavedProgress | undefined;
          if (serverProgress?.completed) {
            resumeTime = 0;
          } else if (serverProgress && serverProgress.currentTime > 0) {
            resumeTime = serverProgress.currentTime;
          }
        } catch (error) {
          console.error("Unable to load server watch progress:", error);
        }
      }

      if (resumeTime > 0 && resumeTime < videoDuration - 1) {
        el.currentTime = resumeTime;
        setCurrentTime(resumeTime);
      }
    };

    const handleTimeUpdate = () => {
      const time = el.currentTime || 0;
      const videoDuration = el.duration || 0;
      setCurrentTime(time);
      const completed = videoDuration > 0 && time / videoDuration >= COMPLETION_PERCENT;
      if (completed || Date.now() - lastSavedAtRef.current >= SAVE_INTERVAL_MS) {
        saveProgress(time, videoDuration, completed);
      }
    };
    const handleProgress = () => {
      if (el.buffered.length > 0 && el.duration > 0) {
        setBuffered((el.buffered.end(el.buffered.length - 1) / el.duration) * 100);
      }
    };
    const handlePlay = () => {
      document.querySelectorAll("video").forEach((otherVideo) => {
        if (otherVideo !== el) otherVideo.pause();
      });
      setIsPlaying(true);
      setPlayerMessage("");
    };
    const handlePause = () => {
      setIsPlaying(false);
      const time = el.currentTime || 0;
      const length = el.duration || 0;
      saveProgress(time, length, length > 0 && time / length >= COMPLETION_PERCENT);
    };
    const handleEnded = () => {
      saveProgress(el.duration || 0, el.duration || 0, true);
      if (onNextRef.current) setAutoNextSeconds(10);
    };

    el.addEventListener("loadedmetadata", handleLoadedMetadata);
    el.addEventListener("timeupdate", handleTimeUpdate);
    el.addEventListener("progress", handleProgress);
    el.addEventListener("play", handlePlay);
    el.addEventListener("pause", handlePause);
    el.addEventListener("ended", handleEnded);
    return () => {
      el.removeEventListener("loadedmetadata", handleLoadedMetadata);
      el.removeEventListener("timeupdate", handleTimeUpdate);
      el.removeEventListener("progress", handleProgress);
      el.removeEventListener("play", handlePlay);
      el.removeEventListener("pause", handlePause);
      el.removeEventListener("ended", handleEnded);
    };
  }, [progressKey, selectedVideoUrl, user, video._id]);

  const handleQualityChange = (quality: string) => {
    if (quality === selectedQuality) return;
    const el = videoRef.current;
    if (el) {
      pendingQualitySwitchRef.current = {
        currentTime: el.currentTime || 0,
        wasPlaying: !el.paused,
      };
    }
    setSelectedQuality(quality);
  };

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    const el = videoRef.current;
    if (el?.textTracks.length) {
      el.textTracks[0].mode = captionsEnabled ? "showing" : "hidden";
    }
  }, [captionsEnabled]);

  useEffect(() => {
    if (autoNextSeconds === null) return;
    if (autoNextSeconds <= 0) {
      setAutoNextSeconds(null);
      onNextRef.current?.();
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoNextSeconds((seconds) => (seconds === null ? null : seconds - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [autoNextSeconds]);

  useEffect(() => {
    if (!showControls || !isPlaying) return;
    const timer = window.setTimeout(() => setShowControls(false), 3000);
    return () => window.clearTimeout(timer);
  }, [showControls, isPlaying]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
      ) {
        return;
      }
      const el = videoRef.current;
      if (!el) return;
      const key = event.key.toLowerCase();

      if (event.code === "Space") {
        event.preventDefault();
        if (el.paused) {
          void el.play().catch((error) =>
            setPlayerMessage(error instanceof Error ? error.message : "Playback could not start")
          );
        }
        else el.pause();
      } else if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault();
        const offset = event.shiftKey ? 60 : 10;
        el.currentTime = Math.min(
          Math.max(el.currentTime + (key === "arrowright" ? offset : -offset), 0),
          el.duration || 0
        );
      } else if (key === "arrowup" || key === "arrowdown") {
        event.preventDefault();
        setVolume((current) =>
          Math.min(1, Math.max(0, current + (key === "arrowup" ? 0.05 : -0.05)))
        );
        setIsMuted(false);
      } else if (key === "m") {
        setIsMuted((muted) => !muted);
      } else if (key === "f") {
        void toggleFullScreen();
      } else if (key === "t") {
        setIsTheaterMode((current) => !current);
      } else if (key === "p") {
        void togglePictureInPicture();
      } else if (key === "c" && video.captionsFile) {
        setCaptionsEnabled((current) => !current);
      } else if (key === "n" && onNextRef.current) {
        onNextRef.current();
      }
      setShowControls(true);
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  const togglePlay = async () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      try {
        await el.play();
      } catch (error) {
        setPlayerMessage(error instanceof Error ? error.message : "Playback could not start");
      }
    } else {
      el.pause();
    }
  };

  const seek = (nextSeconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(nextSeconds, 0), el.duration || nextSeconds);
    setCurrentTime(el.currentTime);
  };

  const handleRangeChange = (value: number) => {
    const el = videoRef.current;
    if (!el) return;
    const next = (value / 100) * (el.duration || 0);
    el.currentTime = next;
    setCurrentTime(next);
  };

  const handleTimelinePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    setPreviewPosition(Math.min(90, Math.max(10, position * 100)));
    setPreviewTime(position * duration);
  };

  const seekPreviewToSelectedTime = () => {
    const preview = previewVideoRef.current;
    if (!preview || previewTime === null || preview.readyState < HTMLMediaElement.HAVE_METADATA) return;
    preview.currentTime = Math.min(previewTime, Math.max(0, preview.duration - 0.05));
  };

  const toggleMute = () => setIsMuted((muted) => !muted);
  const toggleTheaterMode = () => setIsTheaterMode((current) => !current);

  async function toggleFullScreen() {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await player.requestFullscreen();
    } catch (error) {
      setPlayerMessage(error instanceof Error ? error.message : "Fullscreen is unavailable");
    }
  }

  async function togglePictureInPicture() {
    const el = videoRef.current;
    if (!el || !document.pictureInPictureEnabled) {
      setPlayerMessage("Picture-in-Picture is not supported by this browser");
      return;
    }
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await el.requestPictureInPicture();
    } catch (error) {
      setPlayerMessage(error instanceof Error ? error.message : "Picture-in-Picture could not start");
    }
  }

  const handlePointerMove = () => setShowControls(true);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`${styles.player} ${isTheaterMode ? styles.theater : ""}`}>
      <div
        ref={playerRef}
        className={styles.frame}
        onMouseMove={handlePointerMove}
        onTouchStart={handlePointerMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        <video
          key={video._id}
          ref={videoRef}
          className={styles.video}
          src={selectedVideoUrl || undefined}
          preload={selectedVideoUrl ? "metadata" : "none"}
          onClick={() => void togglePlay()}
          onWaiting={() => setIsReady(false)}
          onPlaying={() => setIsReady(true)}
        >
          {video.captionsFile && (
            <track kind="captions" src={video.captionsFile} srcLang="en" label="English" />
          )}
          Your browser does not support the video tag.
        </video>
        {selectedVideoUrl && (
          <video
            ref={previewVideoRef}
            className={styles.previewSource}
            src={selectedVideoUrl}
            muted
            playsInline
            crossOrigin="anonymous"
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
            onLoadedMetadata={seekPreviewToSelectedTime}
            onSeeked={capturePreviewFrame}
          />
        )}

        {!videoUrl && (
          <div className={styles.accessOverlay} role="status">
            <div className={styles.accessContent}>
              <p>{authorizingPlayback ? "Authorizing video…" : playbackError}</p>
              {!authorizingPlayback && !user && (
                <button type="button" onClick={handlegooglesignin}>Sign in with Google</button>
              )}
              {!authorizingPlayback && playbackErrorCode === "PREMIUM_REQUIRED" && (
                <Link href="/plans">View membership plans</Link>
              )}
            </div>
          </div>
        )}

        <div
          className={`${styles.controls} ${showControls ? styles.controlsVisible : styles.controlsHidden}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className={styles.timeline}
            onPointerMove={handleTimelinePointerMove}
            onPointerLeave={() => {
              setPreviewTime(null);
            }}
          >
            <div className={styles.buffered} style={{ width: `${buffered}%` }} />
            <div className={styles.played} style={{ width: `${progress}%` }} />
            {previewTime !== null && (
              <div
                className={styles.timelinePreview}
                style={{ left: `${previewPosition}%` }}
                aria-hidden="true"
              >
                {previewFrame && <img src={previewFrame} alt="" />}
                <span>{formatTime(previewTime)}</span>
              </div>
            )}
            <input
              aria-label="Video progress"
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(event) => handleRangeChange(Number(event.target.value))}
              className={styles.range}
            />
          </div>

          <div className={styles.controlRow}>
            <div className={styles.controlGroup}>
              <button type="button" onClick={() => void togglePlay()} aria-label={isPlaying ? "Pause video" : "Play video"}>
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button type="button" onClick={() => seek(currentTime - 10)} aria-label="Skip backward 10 seconds">
                <SkipBack size={18} />
              </button>
              <button type="button" onClick={() => seek(currentTime + 10)} aria-label="Skip forward 10 seconds">
                <SkipForward size={18} />
              </button>
              <button type="button" onClick={toggleMute} aria-label={isMuted ? "Unmute video" : "Mute video"}>
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                aria-label="Volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(event) => {
                  const nextVolume = Number(event.target.value);
                  setIsMuted(nextVolume === 0);
                  setVolume(nextVolume);
                }}
                className={`${styles.range} ${styles.volume}`}
              />
              <span className={styles.time}>
                {formatTime(currentTime)} / {formatTime(duration)} ({formatTime(duration - currentTime)} left)
              </span>
            </div>

            <div className={styles.controlGroup}>
              {availableQualities.length > 1 && (
                <select
                  aria-label="Video quality"
                  className={styles.qualitySelect}
                  value={selectedQuality}
                  onChange={(event) => handleQualityChange(event.target.value)}
                >
                  {availableQualities.map((quality) => (
                    <option key={quality.quality} value={quality.quality}>{quality.label}</option>
                  ))}
                </select>
              )}
              <select
                aria-label="Playback speed"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              >
                {[0.5, 1, 1.25, 1.5, 2].map((value) => (
                  <option key={value} value={value}>{value}x</option>
                ))}
              </select>
              {video.captionsFile && (
                <button
                  type="button"
                  onClick={() => setCaptionsEnabled((enabled) => !enabled)}
                  aria-label={captionsEnabled ? "Turn captions off" : "Turn captions on"}
                  aria-pressed={captionsEnabled}
                >
                  <Captions size={18} />
                </button>
              )}
              <button type="button" onClick={() => void togglePictureInPicture()} aria-label="Toggle Picture-in-Picture">
                <PictureInPicture2 size={18} />
              </button>
              <button type="button" onClick={toggleTheaterMode} aria-label="Toggle theater mode" aria-pressed={isTheaterMode}>
                <Theater size={18} />
              </button>
              <button type="button" onClick={() => void toggleFullScreen()} aria-label="Toggle full screen">
                <Maximize2 size={18} />
              </button>
            </div>
          </div>

          <div className={styles.statusRow} aria-live="polite">
            <span>{!isReady && "Loading or buffering video…"}</span>
            {sourceQuality && <span>Current dimensions: {sourceQuality}</span>}
            {autoNextSeconds !== null && (
              <span>
                Playing next in {autoNextSeconds}s{" "}
                <button type="button" onClick={() => setAutoNextSeconds(null)}>Cancel</button>
              </span>
            )}
            {playerMessage && <span>{playerMessage}</span>}
          </div>
        </div>
      </div>
      <p className={styles.shortcutHelp}>
        Shortcuts: Space play/pause · ←/→ seek 10s · Shift+←/→ seek 60s · ↑/↓ volume · M mute · P PiP · T theater · F fullscreen · C captions · N next
      </p>
    </div>
  );
}
