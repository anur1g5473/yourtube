"use clinet";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Play } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";

export default function VideoCard({ video }: any) {
  return (
    <Link href={`/watch/${video?._id}`} className="group">
      <div className="space-y-3">
        <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
          <div className="flex h-full items-center justify-center text-gray-600" aria-hidden="true">
            <Play className="h-8 w-8" />
          </div>
        </div>
        <div className="flex gap-3">
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarFallback>{video?.videochanel?.[0] || "V"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600">
              {video?.videotitle}
            </h3>
            <p className="text-sm text-gray-600 mt-1">{video?.videochanel}</p>
            <p className="text-sm text-gray-600">
              {(video?.views ?? 0).toLocaleString()} views
              {video?.createdAt && ` • ${formatDistanceToNow(new Date(video.createdAt))} ago`}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
