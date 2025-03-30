"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppLayout from "../components/AppLayout";
import VoiceTraining from "../components/VoiceTraining";
import { CheckCircle, ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function VoicePage() {
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

  const isVideoUploaded = userProfile?.videoUrl;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-gray-100">Train Your Voice Model</h1>
        <p className="text-gray-400 mb-8">
          Upload an audio recording to create your AI voice clone for generating speech.
        </p>

        {/* Progress steps */}
        <div className="flex items-center mb-8">
          <div className="flex items-center">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isVideoUploaded ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
              {isVideoUploaded ? <CheckCircle className="h-5 w-5" /> : "1"}
            </div>
            <span className={`ml-2 ${isVideoUploaded ? 'text-green-400 font-medium' : 'text-gray-400'}`}>Upload Video</span>
          </div>
          <div className="flex-1 h-0.5 mx-4 bg-gray-700"></div>
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center">
              2
            </div>
            <span className="ml-2 font-medium text-gray-200">Train Voice</span>
          </div>
          <div className="flex-1 h-0.5 mx-4 bg-gray-700"></div>
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-gray-700 text-gray-300 flex items-center justify-center">
              3
            </div>
            <span className="ml-2 text-gray-400">Create Video</span>
          </div>
        </div>

        {!isVideoUploaded ? (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-6 mb-8">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-400 mr-2" />
              <h3 className="text-lg font-medium text-yellow-200">Video Upload Required</h3>
            </div>
            <p className="text-yellow-300 mb-4">
              Before training your voice model, you need to upload a video first. This will be used as the base for your AI avatar.
            </p>
            <Link
              href="/upload"
              className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
            >
              Go to Video Upload <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* Voice Training component */}
            <div className="mb-8">
              <VoiceTraining />
            </div>

            {/* Status and next steps */}
            {userProfile?.voice_id && (
              <div className="bg-green-900 border border-green-700 rounded-lg p-6 mb-8">
                <div className="flex items-center mb-4">
                  <CheckCircle className="h-6 w-6 text-green-400 mr-2" />
                  <h3 className="text-lg font-medium text-green-200">Voice Model Trained Successfully!</h3>
                </div>
                <p className="text-green-300 mb-4">
                  Great job! Your voice model has been trained and is ready to use.
                  You can now create videos with your AI avatar and voice.
                </p>
                <Link
                  href="/create"
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Create Your First Video <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}