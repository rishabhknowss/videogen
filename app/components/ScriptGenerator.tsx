"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FileText, Wand2, AlertCircle, CheckCircle, Image as ImageIcon } from "lucide-react";

// Define the enhanced scene structure
interface Scene {
  content: string;
  imagePrompts: string[];  // Multiple image prompts per scene
}

export default function ScriptGenerator() {
  const { data: session } = useSession();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [fullScript, setFullScript] = useState<string>("");

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    setError(null);
  };

  const handleGenerateScript = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt for script generation");
      return;
    }

    if (!session?.user?.id) {
      setError("You must be logged in to generate a script");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      console.log("Sending script generation request for prompt:", prompt);
      
      // Generate script with Gemini API
      const response = await fetch("/api/script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      console.log("Script API response:", data);
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate script");
      }

      if (!data || !data.scenes || !data.fullScript) {
        console.error("Invalid response format:", data);
        throw new Error("Script data not found in response");
      }
      
      setScenes(data.scenes);
      setFullScript(data.fullScript);
      setGenerated(true);
    } catch (err) {
      console.error("Script generation error:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    try {
      // Save script to a new project
      const response = await fetch("/api/project/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt,
          script: fullScript,
          scenes: scenes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save project");
      }

      // Success - project saved!
      const data = await response.json();
      console.log("Project saved:", data);
      
      alert("Project saved successfully!");
    } catch (err) {
      console.error("Save project error:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Generate Script</h2>
      <p className="text-gray-600 mb-4">
        Enter a topic or idea, and we'll generate a scene-by-scene script with multiple visuals for each scene of your video.
      </p>

      <div className="mb-4">
        <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
          What do you want your video to be about?
        </label>
        <textarea
          id="prompt"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="E.g., The benefits of meditation, An introduction to my business, etc."
          value={prompt}
          onChange={handlePromptChange}
          disabled={generating}
        ></textarea>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center mb-4">
          <AlertCircle className="h-4 w-4 mr-2" />
          {error}
        </div>
      )}

      <button
        onClick={handleGenerateScript}
        disabled={!prompt.trim() || generating}
        className={`w-full py-2 px-4 rounded-md font-medium mb-4 ${
          !prompt.trim() || generating
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-purple-600 text-white hover:bg-purple-700"
        }`}
      >
        {generating ? (
          <span className="flex items-center justify-center">
            <Wand2 className="animate-spin h-4 w-4 mr-2" />
            Generating...
          </span>
        ) : (
          <span className="flex items-center justify-center">
            <Wand2 className="h-4 w-4 mr-2" />
            Generate Scene-by-Scene Script
          </span>
        )}
      </button>

      {generated && scenes.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-medium text-gray-700">Generated Script</h3>
            <button
              onClick={handleSave}
              className="text-sm px-3 py-1 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md flex items-center"
            >
              <FileText className="h-3 w-3 mr-1" />
              Save to Project
            </button>
          </div>
          
          <div className="space-y-4">
            {scenes.map((scene, index) => (
              <div key={index} className="border border-gray-200 rounded-md overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <h4 className="font-medium text-gray-700">Scene {index + 1}</h4>
                </div>
                <div className="p-4">
                  <div className="mb-3">
                    <h5 className="text-sm font-medium text-gray-600 mb-1">Content:</h5>
                    <p className="text-gray-800">{scene.content}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-600 mb-1 flex items-center">
                      <ImageIcon className="h-3 w-3 mr-1" />
                      Image Prompts:
                    </h5>
                    <div className="space-y-2">
                      {scene.imagePrompts.map((imagePrompt, promptIndex) => (
                        <p 
                          key={promptIndex} 
                          className="text-sm bg-blue-50 border border-blue-100 rounded-md p-2 text-blue-800"
                        >
                          {promptIndex + 1}. {imagePrompt}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-md">
            <p className="text-sm text-purple-800">
              This script is divided into {scenes.length} scenes. Each scene has content and multiple image prompts for
              visual variety. When you save this project, we'll generate several images for each scene and create a more
              dynamic video with your AI avatar narrating the script.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}