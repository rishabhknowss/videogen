"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Mic, CheckCircle, AlertCircle } from "lucide-react";

export default function VoiceTraining() {
  const { data: session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [training, setTraining] = useState(false);
  const [trained, setTrained] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setError(null);
  };

  const handleUploadAndTrain = async () => {
    if (!file) {
      setError("Please select an audio file first");
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

      // Step 3: Update user record with the audio URL
      const s3Url = `https://s3.${urlData.region || 'us-west-1'}.amazonaws.com/${urlData.bucket}/${urlData.key}`;
      setAudioUrl(s3Url);
      
      // Save audio URL to user profile
      const updateResponse = await fetch("/api/user/updateAudio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audioUrl: s3Url,
        }),
      });

      if (!updateResponse.ok) {
        const data = await updateResponse.json();
        throw new Error(data.error || "Failed to update user profile");
      }

      setUploading(false);
      setTraining(true);

      // Step 4: Train voice model with the uploaded audio
      const trainResponse = await fetch("/api/audio/train", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio: s3Url,  // This should be the S3 URL, not a local file path
        }),
      });

      if (!trainResponse.ok) {
        const data = await trainResponse.json();
        throw new Error(data.error || "Failed to train voice model");
      }

      const trainData = await trainResponse.json();
      setVoiceId(trainData.voice_id);
      setTrained(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setUploading(false);
      setTraining(false);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-gray-200">Train Your Voice Model</h2>
      <p className="text-gray-400 mb-4">
        Upload an audio recording of your voice (at least 1 minute). We'll use this to create your AI voice clone.
      </p>

      <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center mb-4 bg-gray-900">
        <input
          type="file"
          id="audio-upload"
          accept="audio/mp3,audio/mpeg,audio/wav,audio/m4a"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading || training}
        />
        <label
          htmlFor="audio-upload"
          className="flex flex-col items-center justify-center cursor-pointer"
        >
          <Mic className="h-10 w-10 text-gray-500 mb-2" />
          <span className="text-sm font-medium text-gray-300">
            {file ? file.name : "Select audio file"}
          </span>
          <span className="text-xs text-gray-500 mt-1">
            MP3, WAV or M4A (max. 50MB, min. 1 minute)
          </span>
        </label>
      </div>

      {error && (
        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded flex items-center mb-4">
          <AlertCircle className="h-4 w-4 mr-2" />
          {error}
        </div>
      )}

      {trained && voiceId && (
        <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded flex items-center mb-4">
          <CheckCircle className="h-4 w-4 mr-2" />
          Voice model trained successfully!
        </div>
      )}

      <button
        onClick={handleUploadAndTrain}
        disabled={!file || uploading || training}
        className={`w-full py-2 px-4 rounded-md font-medium ${
          !file || uploading || training
            ? "bg-gray-700 text-gray-500 cursor-not-allowed"
            : "bg-purple-600 text-white hover:bg-purple-700"
        }`}
      >
        {uploading ? "Uploading..." : training ? "Training Voice..." : "Upload and Train Voice"}
      </button>
    </div>
  );
}