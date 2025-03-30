// app/create/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppLayout from "../components/AppLayout";
import EmailSelector, { Email } from "../components/EmailSelector";
import { AlertCircle, FileText, Wand2, Edit, Save, ArrowRight, Mail } from "lucide-react";
import { extractScriptFromEmail } from "../utils/emailParser";

// Define the scene structure with multiple image prompts
interface Scene {
  content: string;
  imagePrompts: string[];
}

export default function CreatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [fullScript, setFullScript] = useState<string>("");
  const [editingScript, setEditingScript] = useState(false);
  const [editedScript, setEditedScript] = useState<string>("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Email selection state
  const [showEmailSelector, setShowEmailSelector] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [usingEmailAsScript, setUsingEmailAsScript] = useState(false);
  const [emailScriptReady, setEmailScriptReady] = useState(false);

  useEffect(() => {
    // Redirect if not authenticated
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    setError(null);
  };

  const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedScript(e.target.value);
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
      // Generate script with Gemini API
      const response = await fetch("/api/script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate script");
      }

      if (!data || !data.scenes || !data.fullScript) {
        throw new Error("Script data not found in response");
      }
      
      setScenes(data.scenes);
      setFullScript(data.fullScript);
      setEditedScript(data.fullScript);
      setGenerated(true);
      setUsingEmailAsScript(false);
      setEmailScriptReady(false);
    } catch (err) {
      console.error("Script generation error:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateEmailScript = async () => {
    if (!selectedEmail) {
      setError("No email selected");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      // Extract content from the email
      const emailText = selectedEmail.parsedContent?.text || selectedEmail.body || selectedEmail.snippet || "";
      const emailContent = Array.isArray(emailText) ? emailText.join("\n\n") : emailText;
      
      // Extract a clean version of the content
      const extractedScript = extractScriptFromEmail(emailContent);
      
      // Use the script API with the extracted email content as the prompt
      const response = await fetch("/api/script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          prompt: extractedScript || selectedEmail.subject,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate script from email");
      }

      if (!data || !data.scenes || !data.fullScript) {
        throw new Error("Script data not found in response");
      }
      
      setScenes(data.scenes);
      setFullScript(data.fullScript);
      setEditedScript(data.fullScript);
      setGenerated(true);
      setUsingEmailAsScript(true);
      setEmailScriptReady(false);
    } catch (err) {
      console.error("Email script generation error:", err);
      setError(err instanceof Error ? err.message : "An error occurred processing the email");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Use the scenes and script directly from state - these should already be properly
      // structured by the script API with appropriate image prompts
      const scriptToSave = editingScript ? editedScript : fullScript;
      
      // Save script to a new project
      const response = await fetch("/api/project/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: usingEmailAsScript 
            ? (selectedEmail?.subject || "Email Script") 
            : (prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt),
          script: scriptToSave,
          scenes: scenes, // These scenes already contain the proper image prompts from the API
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save project");
      }

      // Success - project saved!
      const data = await response.json();
      setProjectId(data.project.id);
      
      // Redirect to the video generation page
      router.push(`/generate/${data.project.id}`);
    } catch (err) {
      console.error("Save project error:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setSaving(false);
    }
  };

  const toggleEditMode = () => {
    if (!editingScript) {
      setEditingScript(true);
    } else {
      setEditingScript(false);
      // Update the fullScript with edited content
      setFullScript(editedScript);
    }
  };
  
  const handleEmailSelect = (email: Email) => {
    setSelectedEmail(email);
    setShowEmailSelector(false);
    setEmailScriptReady(true);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-gray-100">Create Your Video Script</h1>
        <p className="text-gray-400 mb-8">
          First, let's create a script for your video. You can generate one from a prompt, select from your emails, or write your own.
        </p>

        {error && (
          <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded flex items-center mb-4">
            <AlertCircle className="h-4 w-4 mr-2" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8">
          {/* Script Generation Box */}
          <div className="p-6 rounded-lg shadow-md bg-gray-800 border border-gray-700 text-gray-200">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Wand2 className="h-5 w-5 mr-2 text-purple-400" />
              Create Script
            </h2>
            
            {!generated && !emailScriptReady && (
              <>
                <div className="mb-4">
                  <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
                    What do you want your video to be about?
                  </label>
                  <textarea
                    id="prompt"
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="E.g., The benefits of meditation, An introduction to my business, etc."
                    value={prompt}
                    onChange={handlePromptChange}
                    disabled={generating}
                  ></textarea>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <button
                    onClick={handleGenerateScript}
                    disabled={!prompt.trim() || generating}
                    className={`py-2 px-4 rounded-md font-medium flex items-center justify-center ${
                      !prompt.trim() || generating
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-purple-600 text-white hover:bg-purple-700"
                    }`}
                  >
                    {generating ? (
                      <span className="flex items-center">
                        <Wand2 className="animate-spin h-4 w-4 mr-2" />
                        Generating...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Wand2 className="h-4 w-4 mr-2" />
                        Generate Script
                      </span>
                    )}
                  </button>
                  
                  <button
                    onClick={() => setShowEmailSelector(true)}
                    className="py-2 px-4 rounded-md font-medium bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Use Email as Script
                  </button>
                </div>
              </>
            )}
            
            {/* Email Selected but Script Not Generated Yet */}
            {emailScriptReady && !generated && (
              <div className="mb-6 p-4 bg-blue-900 border border-blue-700 rounded-md text-blue-100">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-medium text-blue-100">Email Selected</h3>
                  <span className="text-sm text-blue-300">{selectedEmail?.subject}</span>
                </div>
                <p className="text-blue-200 mb-4">
                  Email from: {selectedEmail?.from.split('<')[0].trim()}
                </p>
                <p className="text-blue-200 mb-4">
                  You can now generate a script based on this email content.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleGenerateEmailScript}
                    disabled={generating}
                    className={`flex-1 py-2 px-4 rounded-md font-medium flex items-center justify-center ${
                      generating
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {generating ? (
                      <span className="flex items-center">
                        <Wand2 className="animate-spin h-4 w-4 mr-2" />
                        Generating...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Wand2 className="h-4 w-4 mr-2" />
                        Generate Script from Email
                      </span>
                    )}
                  </button>
                  
                  <button
                    onClick={() => {
                      setSelectedEmail(null);
                      setEmailScriptReady(false);
                      setShowEmailSelector(true);
                    }}
                    className="flex-1 py-2 px-4 bg-gray-700 text-gray-200 rounded-md hover:bg-gray-600 flex items-center justify-center"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Choose Different Email
                  </button>
                </div>
              </div>
            )}
            
            {/* Generated Script Box */}
            {generated && (
              <div className="mt-0">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium flex items-center text-gray-200">
                    <FileText className="h-5 w-5 mr-2 text-purple-400" />
                    {usingEmailAsScript ? 'Email Script' : 'Generated Script'}
                  </h3>
                  {usingEmailAsScript && selectedEmail && (
                    <div className="text-sm text-gray-400">
                      From: {selectedEmail.from.split('<')[0].trim()}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={toggleEditMode}
                      className="px-3 py-1 rounded-md text-sm flex items-center"
                    >
                      {editingScript ? (
                        <>
                          <Save className="h-4 w-4 mr-1 text-green-400" />
                          <span className="text-green-400">Apply Changes</span>
                        </>
                      ) : (
                        <>
                          <Edit className="h-4 w-4 mr-1 text-blue-400" />
                          <span className="text-blue-400">Edit Script</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                {editingScript ? (
                  <textarea
                    className="w-full h-64 px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4 font-mono text-sm"
                    value={editedScript}
                    onChange={handleScriptChange}
                  />
                ) : (
                  <div className="bg-gray-900 text-gray-200 p-4 rounded-md mb-4 whitespace-pre-wrap border border-gray-700">
                    {fullScript}
                  </div>
                )}
                
                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`py-2 px-6 flex items-center rounded-md font-medium ${
                      saving
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {saving ? "Saving..." : "Continue to Video Generation"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Email Selector Modal */}
      {showEmailSelector && (
        <EmailSelector 
          onEmailSelect={handleEmailSelect}
          onClose={() => setShowEmailSelector(false)}
        />
      )}
    </AppLayout>
  );
}