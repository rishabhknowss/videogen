"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppLayout from "../../components/AppLayout";
import { 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Film, 
  Layers, 
  AlertCircle, 
  Loader2, 
  Download,
  Check,
  ArrowLeft,
  RefreshCw
} from "lucide-react";
import Link from "next/link";

interface WordTimestamp {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

// Updated TimedScene interface to handle multiple images
interface TimedScene {
  start: number;
  end: number;
  imagePrompts: string[];
  imageUrls?: string[];
}

interface Project {
  id: number;
  title: string;
  script: string;
  scenes?: string;
  sceneImageMap?: string; // Added for multiple images per scene
  status: string;
  imagePrompts?: string[];
  generatedImages?: string[];
  outputUrl?: string; // Lip-synced video
  slideshowUrl?: string; // Slideshow of generated images
  finalVideoUrl?: string; // Split-screen combined video
  transcript?: string;
  timedScenes?: string;
  audioDuration?: number;
}

export default function GeneratePage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Generation states
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  
  // Result URLs
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [slideshowUrl, setSlideshowUrl] = useState<string | null>(null);
  const [lipsyncUrl, setLipsyncUrl] = useState<string | null>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  
  // Transcript and timed scenes state
  const [transcript, setTranscript] = useState<{ words: WordTimestamp[] } | null>(null);
  const [timedScenes, setTimedScenes] = useState<TimedScene[]>([]);
  
  // Refs for videos
  const slideshowRef = useRef<HTMLVideoElement>(null);
  const lipsyncRef = useRef<HTMLVideoElement>(null);
  const finalVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Redirect if not authenticated
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && params.id) {
      fetchProject(parseInt(params.id));
    }
  }, [status, params.id]);

  const fetchProject = async (id: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/project/${id}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch project");
      }
      
      const data = await response.json();
      setProject(data);
      
      // Set states based on what's already generated
      if (data.generatedImages && data.generatedImages.length > 0) {
        setGeneratedImages(data.generatedImages);
      }
      
      if (data.slideshowUrl) {
        setSlideshowUrl(data.slideshowUrl);
      }
      
      if (data.outputUrl) {
        setLipsyncUrl(data.outputUrl);
      }
      
      if (data.finalVideoUrl) {
        setFinalVideoUrl(data.finalVideoUrl);
      }
      
      // Parse transcript and timed scenes if available
      if (data.transcript) {
        try {
          const parsedTranscript = JSON.parse(data.transcript);
          setTranscript(parsedTranscript);
        } catch (e) {
          console.error("Error parsing transcript:", e);
        }
      }
      
      if (data.timedScenes) {
        try {
          const parsedTimedScenes = JSON.parse(data.timedScenes);
          setTimedScenes(parsedTimedScenes);
        } catch (e) {
          console.error("Error parsing timed scenes:", e);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImages = async () => {
    if (!project?.id) return;
    
    setGeneratingImages(true);
    setError(null);
    
    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate images");
      }
      
      const data = await response.json();
      setGeneratedImages(data.imageUrls || []);
      
      // Refresh project data
      fetchProject(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate images");
    } finally {
      setGeneratingImages(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!project?.id) return;
    
    setGeneratingVideo(true);
    setError(null);
    
    try {
      // Call enhanced video generation API that handles slideshow, lip-sync, and split-screen in one go
      const response = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate videos");
      }
      
      const data = await response.json();
      
      // Set all the URLs returned from the API
      setLipsyncUrl(data.lipsyncUrl || null);
      setSlideshowUrl(data.slideshowUrl || null);
      setFinalVideoUrl(data.splitScreenUrl || null);
      
      // Refresh project data to get updated transcript and timed scenes
      fetchProject(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate videos");
    } finally {
      setGeneratingVideo(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Link href="/create" className="inline-flex items-center text-gray-400 hover:text-gray-200 mb-2">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Script Creation
            </Link>
            <h1 className="text-3xl font-bold text-gray-100">Generate Video: {project?.title}</h1>
          </div>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded flex items-center mb-6">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* 1. Generated Images */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-200">
              <ImageIcon className="h-5 w-5 mr-2 text-purple-400" />
              1. Generated Images
            </h2>
            
            {generatedImages.length > 0 ? (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {generatedImages.slice(0, 6).map((image, index) => (
                    <div key={index} className="aspect-video bg-gray-900 rounded overflow-hidden">
                      <img 
                        src={image} 
                        alt={`Generated image ${index + 1}`} 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">
                    {generatedImages.length} images generated
                  </span>
                  <button
                    onClick={handleGenerateImages}
                    disabled={generatingImages}
                    className="text-xs flex items-center px-2 py-1 rounded bg-purple-900 text-purple-200 hover:bg-purple-800"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 bg-gray-900 rounded-md">
                <ImageIcon className="h-12 w-12 text-gray-600 mb-4" />
                <p className="text-gray-400 mb-4 text-center">No images generated yet</p>
                <button
                  onClick={handleGenerateImages}
                  disabled={generatingImages}
                  className={`py-2 px-4 rounded-md font-medium flex items-center ${
                    generatingImages
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-purple-600 text-white hover:bg-purple-700"
                  }`}
                >
                  {generatingImages ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Generating Images...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Generate Images
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 2. Audio-Synced Images Slideshow */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-200">
              <Film className="h-5 w-5 mr-2 text-purple-400" />
              2. Audio-Synced Slideshow
            </h2>
            
            {slideshowUrl ? (
              <div>
                <div className="aspect-video bg-black rounded-md overflow-hidden mb-4">
                  <video 
                    ref={slideshowRef}
                    src={slideshowUrl} 
                    controls 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={handleGenerateVideo}
                    disabled={generatingVideo}
                    className="text-xs flex items-center px-2 py-1 rounded bg-purple-900 text-purple-200 hover:bg-purple-800"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerate All Videos
                  </button>
                  <a 
                    href={slideshowUrl} 
                    download 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs flex items-center px-2 py-1 rounded bg-blue-900 text-blue-200 hover:bg-blue-800"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 bg-gray-900 rounded-md">
                <Film className="h-12 w-12 text-gray-600 mb-4" />
                <p className="text-gray-400 mb-4 text-center">
                  {generatedImages.length === 0 
                    ? "Generate images first to create videos" 
                    : "Ready to create audio-synced slideshow and videos"}
                </p>
                <button
                  onClick={handleGenerateVideo}
                  disabled={generatingVideo || generatedImages.length === 0}
                  className={`py-2 px-4 rounded-md font-medium flex items-center ${
                    generatingVideo || generatedImages.length === 0
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-purple-600 text-white hover:bg-purple-700"
                  }`}
                >
                  {generatingVideo ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Generating All Videos...
                    </>
                  ) : (
                    <>
                      <Film className="h-4 w-4 mr-2" />
                      Generate All Videos
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 3. Lip-Sync Video */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-200">
              <VideoIcon className="h-5 w-5 mr-2 text-purple-400" />
              3. Lip-Sync Video
            </h2>
            
            {lipsyncUrl ? (
              <div>
                <div className="aspect-video bg-black rounded-md overflow-hidden mb-4">
                  <video 
                    ref={lipsyncRef}
                    src={lipsyncUrl} 
                    controls 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex justify-end">
                  <a 
                    href={lipsyncUrl} 
                    download 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs flex items-center px-2 py-1 rounded bg-blue-900 text-blue-200 hover:bg-blue-800"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 bg-gray-900 rounded-md">
                <VideoIcon className="h-12 w-12 text-gray-600 mb-4" />
                <p className="text-gray-400 mb-4 text-center">
                  {generatedImages.length === 0 
                    ? "Generate images first to create videos" 
                    : "Click 'Generate All Videos' to create lip-sync video"}
                </p>
              </div>
            )}
          </div>

          {/* 4. Final Combined Video */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-200">
              <Layers className="h-5 w-5 mr-2 text-purple-400" />
              4. Final Combined Video (BETA)
            </h2>
            
            {finalVideoUrl ? (
              <div>
                <div className="aspect-video bg-black rounded-md overflow-hidden mb-4">
                  <video 
                    ref={finalVideoRef}
                    src={finalVideoUrl} 
                    controls 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex justify-end">
                  <a 
                    href={finalVideoUrl} 
                    download 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs flex items-center px-2 py-1 rounded bg-blue-900 text-blue-200 hover:bg-blue-800"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 bg-gray-900 rounded-md">
                <Layers className="h-12 w-12 text-gray-600 mb-4" />
                <p className="text-gray-400 mb-4 text-center">
                  {generatedImages.length === 0 
                    ? "Generate images first to create videos" 
                    : "Click 'Generate All Videos' to create split-screen video"}
                </p>
              </div>
            )}
          </div>
        </div>
        
        {/* Scene Information Section (Optional) */}
    

        {/* Success message when all videos are generated */}
        {finalVideoUrl && slideshowUrl && lipsyncUrl && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-6 mb-8">
            <div className="flex items-center mb-4">
              <Check className="h-6 w-6 text-green-400 mr-2" />
              <h3 className="text-lg font-medium text-green-200">Your video has been successfully created!</h3>
            </div>
            <p className="text-green-300 mb-4">
              All components of your video have been generated. You can now download the final video or any of the individual components.
            </p>
            <div className="flex gap-4">
              <a 
                href={finalVideoUrl} 
                download 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Final Video
              </a>
              <Link
                href="/dashboard"
                className="px-4 py-2 border border-green-500 text-green-400 rounded-md hover:bg-green-800 flex items-center"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}