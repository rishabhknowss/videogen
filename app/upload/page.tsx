"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppLayout from "../components/AppLayout";
import VideoUpload from "../components/VideoUpload";
import { CheckCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function UploadPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Redirect if not authenticated
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    // Fetch user profile if authenticated
    if (status === "authenticated") {
      const fetchUserProfile = async () => {
        try {
          const response = await fetch("/api/user/profile");
          if (response.ok) {
            const data = await response.json();
            setUserProfile(data);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchUserProfile();
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

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-gray-100">Upload Your Video</h1>
        <p className="text-gray-400 mb-8">
          The first step is to upload a short video of yourself talking that will be used for your AI avatar.
        </p>

        {/* Progress steps */}
        <div className="flex items-center mb-8">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center">
              1
            </div>
            <span className="ml-2 font-medium text-gray-200">Upload Video</span>
          </div>
          <div className="flex-1 h-0.5 mx-4 bg-gray-700"></div>
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-gray-700 text-gray-300 flex items-center justify-center">
              2
            </div>
            <span className="ml-2 text-gray-400">Train Voice</span>
          </div>
          <div className="flex-1 h-0.5 mx-4 bg-gray-700"></div>
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-gray-700 text-gray-300 flex items-center justify-center">
              3
            </div>
            <span className="ml-2 text-gray-400">Create Video</span>
          </div>
        </div>

        {/* Upload component */}
        <div className="mb-8">
          <VideoUpload />
        </div>

        {/* Status and next steps */}
        {userProfile?.videoUrl && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-6 mb-8">
            <div className="flex items-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-400 mr-2" />
              <h3 className="text-lg font-medium text-green-200">Video Uploaded Successfully!</h3>
            </div>
            <p className="text-green-300 mb-4">
              Great job! Your video has been uploaded and is ready to be used for your AI avatar.
              The next step is to train your voice model.
            </p>
            <Link
              href="/voice"
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Continue to Voice Training <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}