// app/components/AppLayout.tsx
"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { 
  User, 
  LogOut, 
  Video, 
  Mic, 
  FileText, 
  PlayCircle,
  Home
} from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(#171c21, #2d333f 0, #13171c)" }}>
      {/* Header - Dark Theme */}
      <header className="   border-[#2A2A30]">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold flex items-center gap-2 text-white">
        <Video className="h-6 w-6 text-purple-500" />
        <span>VideoGen</span>
        </Link>

        {/* Mobile menu button */}
        <button 
        className="md:hidden p-2 rounded-md bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)] focus:outline-none text-white"
        onClick={toggleMobileMenu}
        >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        </button>

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center space-x-6">
        {session ? (
          <>
          <Link href="/dashboard" className="text-gray-300 hover:text-white flex items-center gap-2 transition-colors">
            <Home className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>
          <Link href="/upload" className="text-gray-300 hover:text-white flex items-center gap-2 transition-colors">
            <Video className="h-4 w-4" />
            <span>Upload</span>
          </Link>
          <Link href="/voice" className="text-gray-300 hover:text-white flex items-center gap-2 transition-colors">
            <Mic className="h-4 w-4" />
            <span>Voice</span>
          </Link>
          <Link href="/create" className="text-gray-300 hover:text-white flex items-center gap-2 transition-colors">
            <FileText className="h-4 w-4" />
            <span>Create</span>
          </Link>
          <div className="flex items-center gap-4 ml-4 pl-4 border-l border-[#2A2A30]">
            <div className="flex items-center">
            {session.user?.image && (
              <img 
              src={session.user.image} 
              alt={session.user.name || "User"} 
              className="h-8 w-8 rounded-full border border-purple-500"
              />
            )}
            <span className="ml-2 text-white font-medium">{session.user?.name}</span>
            </div>
            <button 
            onClick={() => signOut()} 
            className="p-2 rounded-full bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)] text-white transition-colors"
            >
            <LogOut className="h-5 w-5" />
            </button>
          </div>
          </>
        ) : (
          <button 
          onClick={() => signIn("google")} 
          className="px-4 py-2 bg-[rgba(255,255,255,0.08)] text-white rounded-md hover:bg-[rgba(255,255,255,0.12)] flex items-center gap-2 transition-colors"
          >
          <User className="h-4 w-4" />
          <span>Login</span>
          </button>
        )}
        </nav>
      </div>

      {/* Mobile menu - Dark Theme */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#252529] border-t border-[#2A2A30]">
        <nav className="flex flex-col space-y-1 p-4">
          {session ? (
          <>
            <Link 
            href="/dashboard" 
            className="text-gray-300 hover:text-white hover:bg-[rgba(255,255,255,0.08)] px-3 py-2 rounded-md transition-colors"
            onClick={() => setMobileMenuOpen(false)}
            >
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              <span>Dashboard</span>
            </div>
            </Link>
            <Link 
            href="/upload" 
            className="text-gray-300 hover:text-white hover:bg-[rgba(255,255,255,0.08)] px-3 py-2 rounded-md transition-colors"
            onClick={() => setMobileMenuOpen(false)}
            >
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              <span>Upload</span>
            </div>
            </Link>
            <Link 
            href="/voice" 
            className="text-gray-300 hover:text-white hover:bg-[rgba(255,255,255,0.08)] px-3 py-2 rounded-md transition-colors"
            onClick={() => setMobileMenuOpen(false)}
            >
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              <span>Voice</span>
            </div>
            </Link>
            <Link 
            href="/create" 
            className="text-gray-300 hover:text-white hover:bg-[rgba(255,255,255,0.08)] px-3 py-2 rounded-md transition-colors"
            onClick={() => setMobileMenuOpen(false)}
            >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Create</span>
            </div>
            </Link>
            <div className="border-t border-[#2A2A30] pt-2 mt-2 flex items-center justify-between">
            <div className="flex items-center">
              {session.user?.image && (
              <img 
                src={session.user.image} 
                alt={session.user.name || "User"} 
                className="h-8 w-8 rounded-full border border-purple-500"
              />
              )}
              <span className="ml-2 text-white">{session.user?.name}</span>
            </div>
            <button 
              onClick={() => signOut()} 
              className="p-2 rounded-full bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)] text-white"
            >
              <LogOut className="h-5 w-5" />
            </button>
            </div>
          </>
          ) : (
          <button 
            onClick={() => signIn("google")} 
            className="w-full px-4 py-2 bg-[rgba(255,255,255,0.08)] text-white rounded-md hover:bg-[rgba(255,255,255,0.12)] flex items-center justify-center gap-2"
          >
            <User className="h-4 w-4" />
            <span>Login</span>
          </button>
          )}
        </nav>
        </div>
      )}
      </header>

      {/* Main content */}
      <main className="flex-grow container mx-auto px-4 py-6  min-h-screen">
      {status === "loading" ? (
        <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
      ) : status === "unauthenticated" ? (
        <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-white">Welcome to VideoGen</h1>
        <p className="text-gray-600 mb-8">Sign in to create your own AI-powered videos</p>
        <button 
          onClick={() => signIn("google")} 
          className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2 mx-auto"
        >
          <User className="h-5 w-5" />
          <span>Sign in with Google</span>
        </button>
        </div>
      ) : (
        children
      )}
      </main>

      {/* Footer - Dark Theme */}
      <footer className="bg-[#1E1E23] text-gray-400 py-4 border-t border-[#2A2A30]">
      <div className="container mx-auto px-4 text-center">
        <p>© {new Date().getFullYear()} VideoGen. All rights reserved.</p>
      </div>
      </footer>
    </div>
  );
}