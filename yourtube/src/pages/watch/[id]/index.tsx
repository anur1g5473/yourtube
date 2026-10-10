import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/Videopplayer";
import axiosInstance from "@/lib/axiosinstance";
import { PlaylistSource, readPlaybackQueue } from "@/lib/playlistPlayback";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

const index = () => {
  const router = useRouter();
  const { id } = router.query;
  const [videos, setvideo] = useState<any>(null);
  const [video, setvide] = useState<any>(null);
  const [loading, setloading] = useState(true);
  const [playlistSource, setPlaylistSource] = useState<PlaylistSource | null>(null);
  const [playlistQueue, setPlaylistQueue] = useState<string[]>([]);
  useEffect(() => {
    const fetchvideo = async () => {
      if (!router.isReady || !id || typeof id !== "string") return;
      setloading(true);
      const requestedPlaylist = router.query.playlist;
      const source: PlaylistSource | null =
        requestedPlaylist === "liked" || requestedPlaylist === "watch-later"
          ? requestedPlaylist
          : null;
      setPlaylistSource(source);
      setPlaylistQueue(source ? readPlaybackQueue(source) : []);
      try {
        const res = await axiosInstance.get("/video/getall");
        const video = res.data?.filter((vid: any) => vid._id === id);
        setvideo(video[0]);
        setvide(res.data);
      } catch (error) {
        console.log(error);
      } finally {
        setloading(false);
      }
    };
    void fetchvideo();
  }, [id, router.isReady, router.query.playlist]);
  // const relatedVideos = [
  //   {
  //     _id: "1",
  //     videotitle: "Amazing Nature Documentary",
  //     filename: "nature-doc.mp4",
  //     filetype: "video/mp4",
  //     filepath: "/videos/nature-doc.mp4",
  //     filesize: "500MB",
  //     videochanel: "Nature Channel",
  //     Like: 1250,
  //     Dislike: 50,
  //     views: 45000,
  //     uploader: "nature_lover",
  //     createdAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "2",
  //     videotitle: "Cooking Tutorial: Perfect Pasta",
  //     filename: "pasta-tutorial.mp4",
  //     filetype: "video/mp4",
  //     filepath: "/videos/pasta-tutorial.mp4",
  //     filesize: "300MB",
  //     videochanel: "Chef's Kitchen",
  //     Like: 890,
  //     Dislike: 20,
  //     views: 23000,
  //     uploader: "chef_master",
  //     createdAt: new Date(Date.now() - 86400000).toISOString(),
  //   },
  // ];
  if (loading) {
    return <div>Loading..</div>;
  }
  
  if (!videos) {
    return <div>Video not found</div>;
  }
  const currentVideoIndex = Array.isArray(video)
    ? video.findIndex((item: any) => item._id === videos._id)
    : -1;
  const playlistVideoIndex = playlistQueue.indexOf(videos._id);
  const nextVideo = playlistSource
    ? playlistVideoIndex >= 0
      ? playlistQueue
          .slice(playlistVideoIndex + 1)
          .map((videoId) => video.find((item: any) => item._id === videoId))
          .find(Boolean)
      : null
    : currentVideoIndex >= 0 && Array.isArray(video)
      ? video[currentVideoIndex + 1]
      : null;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Videopplayer
              video={videos}
              onNext={
                nextVideo
                  ? () =>
                      void router.push(
                        playlistSource
                          ? `/watch/${nextVideo._id}?playlist=${playlistSource}`
                          : `/watch/${nextVideo._id}`
                      )
                  : undefined
              }
            />
            <VideoInfo video={videos} />
            <Comments videoId={videos._id} />
          </div>
          <div className="space-y-4">
            <RelatedVideos videos={video} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default index;
