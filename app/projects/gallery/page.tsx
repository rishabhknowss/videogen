"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "../../components/AppLayout";
import { 
  Play, 
  Download, 
  FileText, 
  Trash, 
  Loader2, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp 
} from "lucide-react";
import Link from "next/link";

interface Project {
  id: number;
  title: string;
  script: string | null;
  status: string;
  outputUrl: string | null;
  createdAt: string;
}

export default function ProjectGalleryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);

  useEffect(() => {
    // Redirect if not authenticated
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    // Fetch projects if authenticated
    if (status === "authenticated") {
      fetchProjects();
    }
  }, [status]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch("/api/projects");
      
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.projects)) {
        // Only show completed projects with videos
        const completedProjects = data.projects.filter(
          (project: Project) => project.status === "COMPLETED" && project.outputUrl
        );
        setProjects(completedProjects);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    if (!confirm("Are you sure you want to delete this project?")) {
      return;
    }
    
    try {
      const response = await fetch(`/api/project/${projectId}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        // Remove project from state
        setProjects(projects.filter(project => project.id !== projectId));
      } else {
        const errorData = await response.json();
        console.error("Error deleting project:", errorData.error);
        alert("Failed to delete project");
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("An error occurred while deleting the project");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const toggleExpand = (projectId: number) => {
    if (expandedProject === projectId) {
      setExpandedProject(null);
    } else {
      setExpandedProject(projectId);
    }
  };

  if (status === "loading" || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">My Project Gallery</h1>
          <Link 
            href="/create" 
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Create New Video
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center mb-6">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        {projects.length === 0 ? (
          <div className="bg-white p-12 rounded-lg shadow-md text-center">
            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Completed Projects Yet</h2>
            <p className="text-gray-600 mb-6">
              You don't have any completed video projects to display. Create your first video!
            </p>
            <Link 
              href="/create" 
              className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Create New Video
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            {projects.map(project => (
              <div 
                key={project.id} 
                className="bg-white rounded-lg shadow-md overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-semibold">{project.title}</h2>
                      <p className="text-gray-500 text-sm">Created on {formatDate(project.createdAt)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteProject(project.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-full"
                      title="Delete project"
                    >
                      <Trash className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Video Player */}
                  {project.outputUrl && (
                    <div className="mb-4">
                      <div className="aspect-video bg-black rounded-md overflow-hidden mb-3">
                        <video 
                          src={project.outputUrl} 
                          controls 
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex justify-end">
                        <a 
                          href={project.outputUrl} 
                          download 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download Video
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Script Accordion */}
                  <div className="border rounded-md mt-4">
                    <button
                      onClick={() => toggleExpand(project.id)}
                      className="w-full flex justify-between items-center p-4 text-left"
                    >
                      <span className="font-medium flex items-center">
                        <FileText className="h-4 w-4 mr-2" />
                        View Script
                      </span>
                      {expandedProject === project.id ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </button>
                    
                    {expandedProject === project.id && (
                      <div className="p-4 bg-gray-50 border-t">
                        <p className="whitespace-pre-wrap text-gray-700">
                          {project.script || "No script available"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}