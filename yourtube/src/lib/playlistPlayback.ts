export type PlaylistSource = "liked" | "watch-later";

const PLAYBACK_QUEUE_KEY = "yourtube-playback-queue";

type StoredPlaybackQueue = {
  source: PlaylistSource;
  videoIds: string[];
};

export function savePlaybackQueue(source: PlaylistSource, videoIds: string[]) {
  if (typeof window === "undefined") return;

  const queue: StoredPlaybackQueue = {
    source,
    videoIds: videoIds.filter((videoId) => typeof videoId === "string" && videoId.length > 0),
  };
  window.sessionStorage.setItem(PLAYBACK_QUEUE_KEY, JSON.stringify(queue));
}

export function readPlaybackQueue(source: PlaylistSource): string[] {
  if (typeof window === "undefined") return [];

  const storedQueue = window.sessionStorage.getItem(PLAYBACK_QUEUE_KEY);
  if (!storedQueue) return [];

  try {
    const queue = JSON.parse(storedQueue) as StoredPlaybackQueue;
    if (queue.source !== source || !Array.isArray(queue.videoIds)) return [];
    return queue.videoIds.filter(
      (videoId): videoId is string => typeof videoId === "string" && videoId.length > 0
    );
  } catch (error) {
    console.error("Unable to read playlist playback queue:", error);
    window.sessionStorage.removeItem(PLAYBACK_QUEUE_KEY);
    return [];
  }
}
