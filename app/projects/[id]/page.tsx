"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppLayout from "../../components/AppLayout";
import ScriptGenerator from "../../components/ScriptGenerator";
import VideoGenerator from "../../components/VideoGenerator";
import { CheckCircle, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CreatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    // Redirect if not authenticated
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    // Fetch user profile and projects if authenticated
    if (status === "authenticated") {
      const fetchData = async () => {
        try {
          // Fetch user profile
          const userResponse = await fetch("/api/user/profile");
          if (userResponse.ok) {
            const userData = await userResponse.json();
            setUserProfile(userData);
          }

          // Fetch projects
          const projectsResponse = await fetch("/api/projects");
          if (projectsResponse.ok) {
            const projectsData = await projectsResponse.json();
            if (projectsData.success && projectsData.projects) {
              setProjects(projectsData.projects);
            }
          }
        } catch (error) {
          console.error("Error fetching data:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
      </AppLayout>
    );
  }

  const isVideoUploaded = userProfile?.videoUrl;
  const isVoiceTrained = userProfile?.voice_id;
  const setupComplete = isVideoUploaded && isVoiceTrained;

  const handleProjectSelect = (projectId: number) => {
    setSelectedProject(projectId);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Create Your Video</h1>
        <p className="text-gray-600 mb-8">
          Generate a script and create a lip-synced video with your trained avatar.
        </p>

        {/* Progress steps */}
        <div className="flex items-center mb-8">
          <div className="flex items-center">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isVideoUploaded ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {isVideoUploaded ? <CheckCircle className="h-5 w-5" /> : "1"}
            </div>
            <span className={`ml-2 ${isVideoUploaded ? 'text-green-600 font-medium' : 'text-gray-600'}`}>Upload Video</span>
          </div>
          <div className="flex-1 h-0.5 mx-4 bg-gray-300"></div>
          <div className="flex items-center">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isVoiceTrained ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {isVoiceTrained ? <CheckCircle className="h-5 w-5" /> : "2"}
            </div>
            <span className={`ml-2 ${isVoiceTrained ? 'text-green-600 font-medium' : 'text-gray-600'}`}>Train Voice</span>
          </div>
          <div className="flex-1 h-0.5 mx-4 bg-gray-300"></div>
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center">
              3
            </div>
            <span className="ml-2 font-medium">Create Video</span>
          </div>
        </div>

        {!setupComplete ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-500 mr-2" />
              <h3 className="text-lg font-medium text-yellow-800">Setup Required</h3>
            </div>
            <p className="text-yellow-700 mb-4">
              Before creating a video, you need to complete the setup process:
            </p>
            <ul className="mb-4 ml-8 list-disc">
              {!isVideoUploaded && (
                <li className="text-yellow-700 mb-2">Upload a video for your avatar</li>
              )}
              {!isVoiceTrained && (
                <li className="text-yellow-700 mb-2">Train your voice model</li>
              )}
            </ul>
            <Link
              href={!isVideoUploaded ? "/upload" : "/voice"}
              className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
            >
              {!isVideoUploaded ? "Go to Video Upload" : "Go to Voice Training"}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column - Script Generator */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Step 1: Create a Script</h2>
              <ScriptGenerator />
              
              {/* Project Selection */}
              {projects.length > 0 && (
                <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
                  <h3 className="text-lg font-medium mb-3">Your Projects</h3>
                  <p className="text-gray-600 mb-4">
                    Select a project to generate video:
                  </p>
                  <div className="max-h-60 overflow-y-auto">
                    {projects.map((project) => (
                      <div 
                        key={project.id} 
                        className={`p-3 border rounded-md mb-2 cursor-pointer ${
                          selectedProject === project.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => handleProjectSelect(project.id)}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{project.title}</span>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            project.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 
                            project.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {project.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Right Column - Video Generator */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Step 2: Generate Video</h2>
              <VideoGenerator projectId={selectedProject || undefined  } />
              
              {/* Generate new video button */}
              {selectedProject && (
                <button
                  onClick={() => setSelectedProject(null)}
                  className="mt-4 flex items-center text-purple-600 hover:text-purple-700"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Select Different Project
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}