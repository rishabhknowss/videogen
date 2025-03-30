"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AppLayout from "./components/AppLayout";
import Link from "next/link";
import { Video, Mic, FileText, ArrowRight } from "lucide-react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If user is authenticated, redirect to dashboard
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row items-center py-12">
          <div className="md:w-1/2 mb-8 md:mb-0">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-500">
              Create Professional Videos with AI
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Turn your scripts into engaging videos with AI-powered lip-syncing technology.
              No video editing skills required!
            </p>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-500 text-white rounded-md font-medium hover:opacity-90 text-center"
              >
                Get Started
              </Link>
              <a
                href="#how-it-works"
                className="px-6 py-3 border border-purple-600 text-purple-600 rounded-md font-medium hover:bg-purple-50 text-center"
              >
                Learn More
              </a>
            </div>
          </div>
          <div className="md:w-1/2">
            <div className="aspect-video bg-gray-100 rounded-lg shadow-lg overflow-hidden flex items-center justify-center">
              <Video className="h-24 w-24 text-purple-300" />
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div id="how-it-works" className="py-16">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Video className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Upload Your Video</h3>
              <p className="text-gray-600">
                Upload a short video of yourself talking. This will be used as your AI avatar.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Mic className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Train Your Voice</h3>
              <p className="text-gray-600">
                Upload an audio sample to create a personalized AI voice clone.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Generate Your Video</h3>
              <p className="text-gray-600">
                Create a script, generate audio, and watch as we produce a perfectly lip-synced video.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-16 bg-gradient-to-r from-purple-600 to-blue-500 rounded-xl text-white text-center px-4 mb-16">
          <h2 className="text-3xl font-bold mb-4">Ready to Create Your First Video?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Sign up and get started in minutes. No credit card required.
          </p>
          <Link
            href="/dashboard"
            className="px-8 py-3 bg-white text-purple-600 rounded-md font-medium hover:bg-gray-100 inline-flex items-center"
          >
            Get Started <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}