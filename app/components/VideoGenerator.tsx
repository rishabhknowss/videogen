"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { 
  Play, 
  Download, 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  Loader2,
  Film,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Info,
  Layers,
  ArrowLeft,
  ArrowRight,
  X
} from "lucide-react";

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
  outputUrl?: string;
  slideshowUrl?: string;
  finalVideoUrl?: string;
  transcript?: string;
  timedScenes?: string;
  audioDuration?: number;
}

// Parse scenes from JSON string
interface Scene {
  content: string;
  imagePrompts: string[];
}

export default function VideoGenerator({ projectId }: { projectId?: number }) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [parsedScenes, setParsedScenes] = useState<Scene[]>([]);
  const [sceneImageMap, setSceneImageMap] = useState<any>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [slideshowUrl, setSlideshowUrl] = useState<string | null>(null);
  const [splitScreenUrl, setSplitScreenUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ words: WordTimestamp[] } | null>(null);
  const [timedScenes, setTimedScenes] = useState<TimedScene[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeTab, setActiveTab] = useState<'person' | 'slideshow' | 'split'>('split');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Added state for viewing images
  const [viewingScene, setViewingScene] = useState<number | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
    }
  }, [projectId]);

  const fetchProject = async (id: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/project/${id}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch project");
      }
      
      const data = await response.json();
      console.log("Fetched project:", data);
      setProject(data);
      
      // Parse scenes if available
      if (data.scenes) {
        try {
          const parsed = JSON.parse(data.scenes);
          setParsedScenes(parsed);
        } catch (e) {
          console.error("Error parsing scenes:", e);
        }
      }
      
      // Parse sceneImageMap if available
      if (data.sceneImageMap) {
        try {
          const parsed = JSON.parse(data.sceneImageMap);
          setSceneImageMap(parsed);
        } catch (e) {
          console.error("Error parsing scene image map:", e);
        }
      }
      
      // Parse transcript if available
      if (data.transcript) {
        try {
          const parsedTranscript = JSON.parse(data.transcript);
          setTranscript(parsedTranscript);
        } catch (e) {
          console.error("Error parsing transcript:", e);
        }
      }
      
      // Parse timed scenes if available
      if (data.timedScenes) {
        try {
          const parsedTimedScenes = JSON.parse(data.timedScenes);
          setTimedScenes(parsedTimedScenes);
        } catch (e) {
          console.error("Error parsing timed scenes:", e);
        }
      }
      
      if (data.generatedImages && data.generatedImages.length > 0) {
        setGeneratedImages(data.generatedImages);
      }
      
      if (data.outputUrl) {
        setOutputUrl(data.outputUrl);
      }
      
      if (data.slideshowUrl) {
        setSlideshowUrl(data.slideshowUrl);
      }
      
      if (data.finalVideoUrl) {
        setSplitScreenUrl(data.finalVideoUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImages = async () => {
    if (!session?.user?.id || !project?.id) {
      setError("You must be logged in and have a project selected");
      return;
    }

    if (!project.imagePrompts || project.imagePrompts.length === 0) {
      setError("No image prompts found in this project");
      return;
    }

    setError(null);
    setMessage("Generating multiple images for each scene...");
    setGeneratingImages(true);

    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id
        }),
      });
      
      const data = await response.json();
      console.log("Image generation response:", data);
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate images");
      }
      
      setGeneratedImages(data.imageUrls || []);
      if (data.sceneImageMap) {
        setSceneImageMap(data.sceneImageMap);
      }
      
      setMessage(`Generated ${data.imageCount} images across ${Object.keys(data.sceneImageMap || {}).length} scenes!`);
      
      // Refresh project data to get updated images
      fetchProject(project.id);
      
    } catch (err) {
      console.error("Image generation error:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setGeneratingImages(false);
      // Clear message after a delay
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleGenerateVideo = async () => {
    if (!session?.user?.id || !project?.id) {
      setError("You must be logged in and have a project selected");
      return;
    }

    setError(null);
    setMessage("Creating your videos with enhanced multi-image scenes...");
    setGeneratingVideo(true);

    try {
      const response = await fetch("/api/video/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      // Parse JSON response
      const data = await response.json();
      console.log("Video generation response:", data);
      
      setOutputUrl(data.lipsyncUrl);
      setSlideshowUrl(data.slideshowUrl);
      setSplitScreenUrl(data.splitScreenUrl);
      setMessage("All videos created successfully with multiple images per scene!");
      
      // Refresh project data
      fetchProject(project.id);
      
    } catch (err) {
      console.error("Video generation error:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setGeneratingVideo(false);
      // Clear message after a delay
      setTimeout(() => setMessage(null), 5000);
    }
  };

  // Handle video time update to highlight current word
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime * 1000); // Convert to ms
    }
  };

  // Find the current scene based on video time
  const getCurrentScene = (): TimedScene | null => {
    if (!timedScenes.length) return null;
    
    return timedScenes.find(scene => 
      currentTime >= scene.start && currentTime <= scene.end
    ) || null;
  };

  // Find current word based on video time
  const getCurrentWord = (): WordTimestamp | null => {
    if (!transcript?.words?.length) return null;
    
    return transcript.words.find(word => 
      currentTime >= word.start && currentTime <= word.end
    ) || null;
  };

  // View scene images gallery
  const viewSceneImages = (sceneIndex: number) => {
    setViewingScene(sceneIndex);
    setCurrentImageIndex(0);
  };

  // Navigate through images in the scene
  const nextImage = () => {
    if (viewingScene === null || !sceneImageMap) return;
    
    const sceneImages = sceneImageMap[viewingScene]?.generatedImageUrls || [];
    if (currentImageIndex < sceneImages.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  const closeImageViewer = () => {
    setViewingScene(null);
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const currentScene = getCurrentScene();
  const currentWord = getCurrentWord();

  // Determine which video URL to show based on active tab
  const activeVideoUrl = activeTab === 'person' ? outputUrl : 
                        activeTab === 'slideshow' ? slideshowUrl : 
                        splitScreenUrl;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Generate Video</h2>
      
      {project ? (
        <div className="mb-6">
          <h3 className="font-medium text-gray-700 mb-2">Project: {project.title}</h3>
          <div className="p-4 bg-gray-50 rounded-md border border-gray-200 mb-4">
            <p className="text-sm text-gray-500 mb-1">Script:</p>
            <p className="whitespace-pre-wrap text-gray-800">{project.script}</p>
          </div>
          
          <div className="flex items-center mb-4">
            <div className="text-sm text-gray-700 flex items-center">
              Status: 
              {project.status === "COMPLETED" ? (
                <span className="ml-2 flex items-center text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Completed
                </span>
              ) : project.status === "PROCESSING" ? (
                <span className="ml-2 flex items-center text-yellow-600">
                  <Clock className="h-4 w-4 mr-1" />
                  Processing
                </span>
              ) : (
                <span className="ml-2 flex items-center text-gray-600">
                  <Film className="h-4 w-4 mr-1" />
                  Ready to generate
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-gray-600 mb-4">
          Select a project first to generate a video.
        </p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center mb-4">
          <AlertCircle className="h-4 w-4 mr-2" />
          {error}
        </div>
      )}

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded flex items-center mb-4">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {message}
        </div>
      )}

      {/* Scene Image Viewer Modal */}
      {viewingScene !== null && sceneImageMap && sceneImageMap[viewingScene] && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-full overflow-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-medium">Scene {parseInt(viewingScene?.toString() || "0") + 1} Images</h3>
              <button 
                onClick={closeImageViewer}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-4">
              {/* Image Viewer */}
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4 relative">
                {sceneImageMap[viewingScene].generatedImageUrls && 
                 sceneImageMap[viewingScene].generatedImageUrls.length > 0 ? (
                  <>
                    <img 
                      src={sceneImageMap[viewingScene].generatedImageUrls[currentImageIndex]} 
                      alt={`Scene ${parseInt(viewingScene?.toString() || "0") + 1} image ${currentImageIndex + 1}`}
                      className="w-full h-full object-contain"
                    />
                    
                    {/* Navigation arrows */}
                    {sceneImageMap[viewingScene].generatedImageUrls.length > 1 && (
                      <div className="absolute inset-0 flex items-center justify-between p-2">
                        <button 
                          onClick={prevImage}
                          disabled={currentImageIndex === 0}
                          className={`p-2 rounded-full bg-black bg-opacity-50 text-white ${
                            currentImageIndex === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-opacity-70'
                          }`}
                        >
                          <ArrowLeft className="h-5 w-5" />
                        </button>
                        <button 
                          onClick={nextImage}
                          disabled={currentImageIndex === sceneImageMap[viewingScene].generatedImageUrls.length - 1}
                          className={`p-2 rounded-full bg-black bg-opacity-50 text-white ${
                            currentImageIndex === sceneImageMap[viewingScene].generatedImageUrls.length - 1 
                              ? 'opacity-50 cursor-not-allowed' 
                              : 'hover:bg-opacity-70'
                          }`}
                        >
                          <ArrowRight className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                    
                    {/* Image counter */}
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-sm px-2 py-1 rounded">
                      {currentImageIndex + 1} / {sceneImageMap[viewingScene].generatedImageUrls.length}
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-gray-500">No images available</p>
                  </div>
                )}
              </div>
              
              {/* Image Prompt */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Image Prompt:</h4>
                <p className="text-sm bg-blue-50 border border-blue-100 p-3 rounded-md">
                  {sceneImageMap[viewingScene].imagePrompts[currentImageIndex] || "No prompt available"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timed Scenes with Transcript */}
      {timedScenes.length > 0 && transcript && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-gray-700">Timed Scenes with Multiple Images</h3>
            <button 
              onClick={() => setShowTranscript(!showTranscript)}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center"
            >
              <Info className="h-3 w-3 mr-1" />
              {showTranscript ? "Hide Details" : "Show Details"}
            </button>
          </div>
          
          {showTranscript && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-3 text-sm">
              <p className="text-gray-700 mb-2">
                <strong>Total Words:</strong> {transcript.words?.length || 0}
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Audio Duration:</strong> {project?.audioDuration?.toFixed(2) || 0} seconds
              </p>
              <p className="text-gray-700">
                <strong>Scenes:</strong> {timedScenes.length}
              </p>
              
              {currentScene && (
                <div className="mt-3 p-2 bg-blue-50 border border-blue-100 rounded-md">
                  <p className="text-xs text-blue-800">
                    <strong>Current Scene:</strong> Scene {timedScenes.indexOf(currentScene) + 1}
                  </p>
                  <p className="text-xs text-blue-800">
                    <strong>Time Range:</strong> {(currentScene.start/1000).toFixed(2)}s - {(currentScene.end/1000).toFixed(2)}s
                  </p>
                  <p className="text-xs text-blue-800">
                    <strong>Images:</strong> {currentScene.imageUrls?.length || 0} images available
                  </p>
                </div>
              )}
              
              {currentWord && (
                <div className="mt-2 p-2 bg-green-50 border border-green-100 rounded-md">
                  <p className="text-xs text-green-800">
                    <strong>Current Word:</strong> {currentWord.text}
                  </p>
                  <p className="text-xs text-green-800">
                    <strong>Time Range:</strong> {(currentWord.start/1000).toFixed(2)}s - {(currentWord.end/1000).toFixed(2)}s
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Scene-based images grid */}
      {sceneImageMap && Object.keys(sceneImageMap).length > 0 && (
        <div className="mb-6">
          <h3 className="font-medium text-gray-700 mb-2">Scene Images</h3>
          <div className="space-y-4">
            {Object.keys(sceneImageMap).map((sceneIndex) => {
              const scene = sceneImageMap[sceneIndex];
              const imageUrls = scene.generatedImageUrls || [];
              if (imageUrls.length === 0) return null;
              
              return (
                <div key={sceneIndex} className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex justify-between items-center">
                    <h4 className="font-medium text-gray-700">Scene {parseInt(sceneIndex) + 1}</h4>
                    <button 
                      onClick={() => viewSceneImages(parseInt(sceneIndex))}
                      className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                    >
                      View All {imageUrls.length} Images
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {/* Show first 3 images as thumbnails */}
                        {imageUrls.slice(0, 3).map((image: string, imgIndex: number) => (
                        <div key={imgIndex} className="aspect-video bg-gray-100 rounded overflow-hidden">
                          <img 
                          src={image} 
                          alt={`Scene ${parseInt(sceneIndex) + 1} image ${imgIndex + 1}`} 
                          className="w-full h-full object-cover" 
                          />
                        </div>
                        ))}
                      {/* If there are more than 3 images, show a "more" thumbnail */}
                      {imageUrls.length > 3 && (
                        <div 
                          className="aspect-video bg-gray-800 text-white rounded overflow-hidden flex items-center justify-center cursor-pointer hover:bg-gray-700"
                          onClick={() => viewSceneImages(parseInt(sceneIndex))}
                        >
                          <div className="text-center">
                            <p className="text-xl font-bold">+{imageUrls.length - 3}</p>
                            <p className="text-xs">More</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Video Tabs */}
      {(outputUrl || slideshowUrl || splitScreenUrl) && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <ul className="flex flex-wrap -mb-px">
              {splitScreenUrl && (
                <li className="mr-2">
                  <button
                    onClick={() => setActiveTab('split')}
                    className={`inline-block p-4 rounded-t-lg ${
                      activeTab === 'split' 
                        ? 'border-b-2 border-purple-600 text-purple-600' 
                        : 'hover:text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <Layers className="h-4 w-4 mr-2" />
                      Split Screen
                    </div>
                  </button>
                </li>
              )}
              {outputUrl && (
                <li className="mr-2">
                  <button
                    onClick={() => setActiveTab('person')}
                    className={`inline-block p-4 rounded-t-lg ${
                      activeTab === 'person' 
                        ? 'border-b-2 border-purple-600 text-purple-600' 
                        : 'hover:text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <VideoIcon className="h-4 w-4 mr-2" />
                      Lip-Synced Video
                    </div>
                  </button>
                </li>
              )}
              {slideshowUrl && (
                <li className="mr-2">
                  <button
                    onClick={() => setActiveTab('slideshow')}
                    className={`inline-block p-4 rounded-t-lg ${
                      activeTab === 'slideshow' 
                        ? 'border-b-2 border-purple-600 text-purple-600' 
                        : 'hover:text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Enhanced Slideshow
                    </div>
                  </button>
                </li>
              )}
            </ul>
          </div>
          
          {/* Video Player */}
          <div className="mt-4">
            <div className={activeTab === 'split' ? "aspect-video" : "aspect-video"}>
              {activeVideoUrl && (
                <div className="bg-black rounded-md overflow-hidden mb-3 h-full">
                  <video 
                    ref={videoRef}
                    src={activeVideoUrl} 
                    controls 
                    onTimeUpdate={handleTimeUpdate}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>
            
            {/* Download button for active video */}
            {activeVideoUrl && (
              <a 
                href={activeVideoUrl} 
                download 
                target="_blank" 
                rel="noopener noreferrer"
                className={`inline-flex items-center px-4 py-2 text-white rounded-md ${
                  activeTab === 'split' ? 'bg-indigo-600 hover:bg-indigo-700' :
                  activeTab === 'person' ? 'bg-purple-600 hover:bg-purple-700' :
                  'bg-green-600 hover:bg-green-700'
                }`}
              >
                <Download className="h-4 w-4 mr-2" />
                Download {
                  activeTab === 'split' ? 'Split-Screen Video' :
                  activeTab === 'person' ? 'Lip-Synced Video' :
                  'Enhanced Slideshow'
                }
              </a>
            )}
          </div>
        </div>
      )}

      {/* Instructions for enhanced multi-image scenes */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-800">
        <p className="flex items-center">
          <Info className="h-4 w-4 mr-2 flex-shrink-0" />
          The enhanced system now supports multiple images per scene:
        </p>
        <ul className="ml-8 mt-2 list-disc space-y-1">
          <li><strong>Multiple images per scene</strong> for more engaging and varied visuals</li>
          <li><strong>Smooth transitions</strong> between images within each scene</li>
          <li><strong>Three video outputs:</strong> lip-synced video, dynamic slideshow, and split-screen</li>
        </ul>
        <p className="mt-2">Each scene can have 2-3 different images that transition at optimal times for a more professional and engaging result. No more boring slideshows!</p>
      </div>

      {/* Generation buttons */}
      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <button
          onClick={handleGenerateImages}
          disabled={!project || generatingImages || !project.imagePrompts?.length}
          className={`py-2 px-4 rounded-md font-medium flex-1 ${
            !project || generatingImages || !project.imagePrompts?.length
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {generatingImages ? (
            <span className="flex items-center justify-center">
              <Loader2 className="animate-spin h-4 w-4 mr-2" />
              Generating Scene Images...
            </span>
          ) : (
            <span className="flex items-center justify-center">
              <ImageIcon className="h-4 w-4 mr-2" />
              Generate Multiple Images Per Scene
            </span>
          )}
        </button>
        
        <button
          onClick={handleGenerateVideo}
          disabled={!project || generatingVideo || (!project.imagePrompts?.length && !generatedImages.length)}
          className={`py-2 px-4 rounded-md font-medium flex-1 ${
            !project || generatingVideo || (!project.imagePrompts?.length && !generatedImages.length)
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-purple-600 text-white hover:bg-purple-700"
          }`}
        >
          {generatingVideo ? (
            <span className="flex items-center justify-center">
              <Loader2 className="animate-spin h-4 w-4 mr-2" />
              Creating Dynamic Videos...
            </span>
          ) : (
            <span className="flex items-center justify-center">
              <VideoIcon className="h-4 w-4 mr-2" />
              Create Videos with Scene Variety
            </span>
          )}
        </button>
      </div>
    </div>
  );
}