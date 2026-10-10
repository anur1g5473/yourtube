import { Check, FileVideo, Upload, X } from "lucide-react";
import React, { ChangeEvent, FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";
import axiosInstance from "@/lib/axiosinstance";

type VideoUploaderProps = {
  channelId: string;
  channelName: string;
  onUploaded: () => Promise<void>;
};

const VideoUploader = ({ channelId, channelName, onUploaded }: VideoUploaderProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [qualityFiles, setQualityFiles] = useState<Record<string, File | null>>({
    quality360p: null,
    quality480p: null,
    quality720p: null,
    quality1080p: null,
  });
  const [videoTitle, setVideoTitle] = useState("");
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const handlefilechange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type !== "video/mp4" || !file.name.toLowerCase().endsWith(".mp4")) {
        toast.error("Please upload an MP4 video file.");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        toast.error("File size exceeds 100MB limit.");
        return;
      }
      setVideoFile(file);
      const filename = file.name;
      if (!videoTitle) {
        setVideoTitle(filename);
      }
    }
  };
  const resetForm = () => {
    setVideoFile(null);
    setQualityFiles({
      quality360p: null,
      quality480p: null,
      quality720p: null,
      quality1080p: null,
    });
    setVideoTitle("");
    setIsUploading(false);
    setUploadProgress(0);
    setUploadComplete(false);
    setUploadError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  const handleQualityFileChange = (field: string, file: File | undefined) => {
    if (!file) {
      setQualityFiles((current) => ({ ...current, [field]: null }));
      return;
    }
    if (file.type !== "video/mp4" || !file.name.toLowerCase().endsWith(".mp4")) {
      toast.error("Quality versions must be MP4 files.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Each quality version must be 100MB or smaller.");
      return;
    }
    setQualityFiles((current) => ({ ...current, [field]: file }));
  };
  const cancelUpload = () => {
    if (isUploading) {
      uploadControllerRef.current?.abort();
      return;
    }
    resetForm();
  };
  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!videoFile || !videoTitle.trim()) {
      setUploadError("Choose an MP4 video and enter a title before uploading.");
      return;
    }
    setUploadError("");
    const formdata = new FormData();
    formdata.append("file", videoFile);
    formdata.append("videotitle", videoTitle);
    formdata.append("videochanel", channelName);
    formdata.append("uploader", channelId);
    Object.entries(qualityFiles).forEach(([field, file]) => {
      if (file) formdata.append(field, file);
    });
    const uploadController = new AbortController();
    uploadControllerRef.current = uploadController;
    try {
      setIsUploading(true);
      setUploadProgress(0);
      await axiosInstance.post("/video/upload", formdata, {
        onUploadProgress: (progresEvent: any) => {
          if (!progresEvent.total) return;
          const progress = Math.round(
            (progresEvent.loaded * 100) / progresEvent.total
          );
          setUploadProgress(progress);
        },
        signal: uploadController.signal,
      });
      resetForm();
      await onUploaded();
      toast.success("Video uploaded successfully.");
    } catch (error) {
      console.error("Error uploading video:", error);
      if (uploadController.signal.aborted) {
        resetForm();
        toast.message("Video upload cancelled.");
      } else {
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Please try again.";
        setUploadError(`Upload failed: ${message}`);
        toast.error(`Video upload failed: ${message}`);
      }
    } finally {
      uploadControllerRef.current = null;
      setIsUploading(false);
    }
  };
  return (
    <form
      className="bg-gray-50 rounded-lg p-6"
      onSubmit={(event) => void handleUpload(event)}
    >
      <h2 className="text-xl font-semibold mb-4">Upload a video</h2>

      <div className="space-y-4">
        {!videoFile ? (
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
            <p className="text-lg font-medium">
              Drag and drop video files to upload
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or click to select files
            </p>
            <p className="text-xs text-gray-400 mt-4">
              MP4 • Up to 100MB per file
            </p>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="video/mp4,.mp4"
              onChange={handlefilechange}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
              <div className="bg-blue-100 p-2 rounded-md">
                <FileVideo className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{videoFile.name}</p>
                <p className="text-sm text-gray-500">
                  {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              {!isUploading && (
                <Button variant="ghost" size="icon" onClick={cancelUpload}>
                  <X className="w-5 h-5" />
                </Button>
              )}
              {uploadComplete && (
                <div className="bg-green-100 p-1 rounded-full">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="title">Title (required)</Label>
                <Input
                  id="title"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Add a title that describes your video"
                  required
                  disabled={isUploading || uploadComplete}
                  className="mt-1"
                />
              </div>
              <details className="rounded-lg border bg-white p-3">
                <summary className="cursor-pointer font-medium">
                  Add optional quality versions
                </summary>
                <p className="mt-2 text-sm text-gray-500">
                  Upload separately encoded MP4 versions. Each version must match its selected resolution and be 100MB or smaller.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    ["quality360p", "360p"],
                    ["quality480p", "480p"],
                    ["quality720p", "720p"],
                    ["quality1080p", "1080p"],
                  ].map(([field, label]) => (
                    <label key={field} className="grid gap-1 text-sm font-medium">
                      {label} MP4
                      <input
                        type="file"
                        accept="video/mp4,.mp4"
                        disabled={isUploading || uploadComplete}
                        onChange={(event) => handleQualityFileChange(field, event.target.files?.[0])}
                      />
                      {qualityFiles[field] && (
                        <span className="font-normal text-gray-500">
                          {qualityFiles[field]?.name} · {(qualityFiles[field]!.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </details>
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {uploadError && (
              <p className="text-sm text-red-700" role="alert">
                {uploadError}
              </p>
            )}

            <div className="flex justify-end gap-3">
              {!uploadComplete && (
                <>
                  <Button
                    type="button"
                    onClick={cancelUpload}
                    disabled={isUploading && !uploadControllerRef.current}
                  >
                    {isUploading ? "Cancel upload" : "Cancel"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      isUploading || !videoFile || !videoTitle.trim() || uploadComplete
                    }
                  >
                    {isUploading ? "Uploading..." : "Upload"}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </form>
  );
};

export default VideoUploader;
