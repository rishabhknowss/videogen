"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Upload, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function VideoUpload() {
  const { data: session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    if (!session?.user?.id) {
      setError("You must be logged in to upload files");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Step 1: Get a pre-signed URL from your API
      const fileType = file.type;
      const contentType = file.type;
      const fileName = file.name;
      
      const urlResponse = await fetch("/api/preSignUrl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileType,
          fileName,
          contentType,
        }),
      });

      const urlData = await urlResponse.json();
      
      if (!urlResponse.ok) {
        throw new Error(urlData.error || "Failed to get upload URL");
      }

      // Step 2: Upload file to S3 using the pre-signed URL
      const uploadResponse = await fetch(urlData.url, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      // Step 3: Update user record with the video URL
      const s3Url = `https://s3.${urlData.region || 'us-west-1'}.amazonaws.com/${urlData.bucket}/${urlData.key}`;
      
      // Update user profile with video URL
      const updateResponse = await fetch("/api/user/updateVideo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl: s3Url,
        }),
      });

      if (!updateResponse.ok) {
        const data = await updateResponse.json();
        throw new Error(data.error || "Failed to update user profile");
      }

      setVideoUrl(s3Url);
      setUploaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-gray-200">Upload Your Video</h2>
      <p className="text-gray-400 mb-4">
        Upload a short video (5-10 seconds) of yourself talking. We'll use this to create your AI avatar.
      </p>

      <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center mb-4 bg-gray-900">
        <input
          type="file"
          id="video-upload"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <label
          htmlFor="video-upload"
          className="flex flex-col items-center justify-center cursor-pointer"
        >
          <Upload className="h-10 w-10 text-gray-500 mb-2" />
          <span className="text-sm font-medium text-gray-300">
            {file ? file.name : "Select video file"}
          </span>
          <span className="text-xs text-gray-500 mt-1">
            MP4, MOV or WebM (max. 50MB)
          </span>
        </label>
      </div>

      {error && (
        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded flex items-center mb-4">
          <AlertCircle className="h-4 w-4 mr-2" />
          {error}
        </div>
      )}

      {uploaded && videoUrl && (
        <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded flex items-center mb-4">
          <CheckCircle className="h-4 w-4 mr-2" />
          Video uploaded successfully!
         
        </div>
        
      )}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className={`w-full py-2 px-4 rounded-md font-medium ${
          !file || uploading
            ? "bg-gray-700 text-gray-500 cursor-not-allowed"
            : "bg-purple-600 text-white hover:bg-purple-700"
        }`}
      >
        {uploading ? "Uploading..." : "Upload Video"}
      </button>
    </div>
  );
}