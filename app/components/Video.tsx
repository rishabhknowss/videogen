// app/components/Video.tsx
"use client"
import { useState } from "react";

export const Video = () => {
    const [audioUrl, setAudioUrl] = useState("");
    const [videoUrl, setVideoUrl] = useState("");
    const [response, setResponse] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!audioUrl || !videoUrl) {
            setResponse("Both audio URL and video URL are required");
            return;
        }
        
        setLoading(true);
        try {
            const res = await fetch("/api/video", {
                method: "POST",
                body: JSON.stringify({ audio_url: audioUrl, video_url: videoUrl }),
                headers: {
                    "Content-Type": "application/json",
                },
            });
            
            const data = await res.json();
            if (data.error) {
                setResponse(`Error: ${data.error}`);
            } else {
                setResponse(`Success! Request ID: ${data.request_id}`);
            }
        } catch (error) {
            setResponse(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col p-4 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Generate Lip-Synced Video</h2>
            
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Audio URL</label>
                <input 
                    className="w-full p-2 border rounded" 
                    type="text" 
                    placeholder="https://example.com/audio.mp3" 
                    value={audioUrl} 
                    onChange={(e) => setAudioUrl(e.target.value)} 
                />
            </div>
            
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Video URL</label>
                <input 
                    className="w-full p-2 border rounded" 
                    type="text" 
                    placeholder="https://example.com/video.mp4" 
                    value={videoUrl} 
                    onChange={(e) => setVideoUrl(e.target.value)} 
                />
            </div>
            
            <button 
                className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded disabled:opacity-50"
                onClick={handleSubmit}
                disabled={loading}
            >
                {loading ? 'Processing...' : 'Generate Video'}
            </button>
            
            {response && (
                <div className="mt-4 p-3 border rounded bg-gray-50">
                    {response}
                </div>
            )}
        </div>
    );
};