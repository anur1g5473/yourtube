import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import VideoUploader from "@/components/VideoUploader";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

type ChannelVideo = {
  _id: string;
  videotitle: string;
  videochanel: string;
  uploader: string;
  views: number;
  createdAt: string;
};

type ChannelTab = "videos" | "about";

const ChannelPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();
  const channelId = typeof id === "string" ? id : "";
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videoError, setVideoError] = useState("");
  const [activeTab, setActiveTab] = useState<ChannelTab>("videos");

  const loadVideos = useCallback(async () => {
    if (!channelId) return;
    setLoadingVideos(true);
    try {
      const response = await axiosInstance.get<ChannelVideo[]>("/video/getall");
      setVideos(response.data.filter((video) => video.uploader === channelId));
      setVideoError("");
    } catch (error) {
      console.error("Unable to load channel videos:", error);
      setVideoError("Could not load your videos. Try again.");
    } finally {
      setLoadingVideos(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (router.isReady && user?._id === channelId) void loadVideos();
  }, [router.isReady, user?._id, channelId, loadVideos]);

  if (!router.isReady || !user) {
    return <main className="flex-1 p-8 text-center">Sign in to open your creator dashboard.</main>;
  }

  if (!channelId || user._id !== channelId || !user.channelname) {
    return <main className="flex-1 p-8 text-center">This creator dashboard is unavailable.</main>;
  }

  return (
    <div className="min-h-screen flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-full">
        <ChannelHeader channel={user} user={user} />
        <Channeltabs activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === "videos" ? (
          <>
            <div className="px-4 pb-8">
              <VideoUploader
                channelId={channelId}
                channelName={user.channelname}
                onUploaded={loadVideos}
              />
            </div>
            <div className="px-4 pb-8">
              {videoError ? (
                <div role="alert" className="space-y-3 py-8 text-center">
                  <p>{videoError}</p>
                  <button type="button" className="underline" onClick={() => void loadVideos()}>
                    Retry
                  </button>
                </div>
              ) : loadingVideos ? (
                <p className="py-8 text-center" role="status">Loading your videos…</p>
              ) : (
                <ChannelVideos videos={videos} />
              )}
            </div>
          </>
        ) : (
          <section className="mx-4 my-6 rounded-lg border p-6" aria-label="Channel information">
            <h2 className="mb-3 text-xl font-semibold">About this channel</h2>
            <p>{user.description || "No channel description has been added yet."}</p>
            {user.location && <p className="mt-2">{user.location}</p>}
          </section>
        )}
      </div>
    </div>
  );
};

export default ChannelPage;
