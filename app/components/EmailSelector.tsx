'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Mail, Search, ChevronDown, ChevronUp, RefreshCw, X, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { ParsedEmailContent } from '../utils/emailParser';

export interface Email {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  labelIds: string[];
  internalDate: string;
  images?: Array<{
    filename: string;
    mimeType: string;
    dataUrl?: string;
  }>;
  parsedContent?: ParsedEmailContent;
}

interface EmailsResponse {
  messages: Email[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface EmailSelectorProps {
  onEmailSelect: (email: Email) => void;
  onClose: () => void;
  onError?: (errorType: string) => void;
}

export default function EmailSelector({ onEmailSelect, onClose, onError }: EmailSelectorProps) {
  const { data: session, status } = useSession();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  
  // Add styles to ensure email HTML content doesn't cause horizontal overflow
  useEffect(() => {
    // Create a style element to inject CSS that targets HTML email content
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .email-content img, .email-content table, .email-content div, .email-content * {
        max-width: 100% !important;
        height: auto !important;
        box-sizing: border-box !important;
        overflow-wrap: break-word !important;
        word-wrap: break-word !important;
      }
      .email-content a {
        word-break: break-all !important;
      }
    `;
    document.head.appendChild(styleEl);
    
    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  const fetchEmails = useCallback(async (pageToken?: string) => {
    if (status !== 'authenticated') return;
    
    setLoading(true);
    setError(null);
    setPermissionError(false);
    
    try {
      let url = '/api/accounts/google/emails?maxResults=10';
      
      if (pageToken) {
        url += `&pageToken=${pageToken}`;
      }
      
      if (searchQuery) {
        url += `&q=${encodeURIComponent(searchQuery)}`;
      }
      
      const response = await fetch(url);
      
      if (response.status === 403) {
        // This is a permission error
        setPermissionError(true);
        
        // Call the onError callback if provided
        if (onError) {
          onError('permission');
        }
        
        const errorData = await response.json();
        throw new Error(errorData.error || 'Gmail permission denied. Please re-authenticate with correct permissions.');
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch emails');
      }
      
      const data: EmailsResponse = await response.json();
      
      if (pageToken) {
        setEmails(prev => [...prev, ...data.messages]);
      } else {
        setEmails(data.messages);
      }
      
      setNextPageToken(data.nextPageToken || null);
    
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'An error occurred while fetching emails');
      } else {
        setError('An error occurred while fetching emails');
      }
      console.error('Error fetching emails:', err);
    } finally {
      setLoading(false);
    }
  }, [status, searchQuery, onError]);

  useEffect(() => {
    if (session) {
      fetchEmails();
    }
  }, [session, fetchEmails]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEmails();
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      console.error('Error parsing date:', e);
      return dateString;
    }
  };

  const handleLoadMore = () => {
    if (nextPageToken) {
      fetchEmails(nextPageToken);
    }
  };

  const toggleEmailView = (email: Email, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent's onClick
    if (expandedEmailId === email.id) {
      // If this email is already expanded, collapse it
      setExpandedEmailId(null);
    } else {
      // Otherwise, expand this email
      setExpandedEmailId(email.id);
    }
  };
  
  // Function to select an email
  const handleSelectEmail = (email: Email) => {
    setSelectedEmail(email);
  };

  const handleConfirmSelection = () => {
    if (selectedEmail) {
      onEmailSelect(selectedEmail);
    }
  };
  
  const handleReAuthenticate = async () => {
    // Sign out and redirect to sign in page with error param to show reset UI on return
    await signOut({ 
      redirect: true, 
      callbackUrl: '/create?error=GmailPermissionRequired' 
    });
  };

  // Process HTML email content to make it safe for display and prevent overflow
  const processEmailBody = (htmlContent: string) => {
    // Strip width attributes and inline styles that might cause overflow
    return htmlContent
      .replace(/width=(["']).*?\1/gi, 'width="100%"')
      .replace(/style=(["'])[^"']*?(width|min-width|max-width)[^"']*?\1/gi, 'style="max-width:100%"');
  };

  // Display count of images in the email
  const getImageCount = (email: Email) => {
    let count = 0;
    
    // Count attached images
    if (email.images && email.images.length > 0) {
      count += email.images.length;
    }
    
    // Count images from parsed content
    if (email.parsedContent?.urls.images) {
      count += email.parsedContent.urls.images.length;
    }
    
    return count;
  };

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-[rgba(30,30,35,0.95)] p-6 rounded-lg shadow-lg w-full max-w-2xl">
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
            <p className="mt-4 text-[#d9d8dc]">Loading your emails...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-[rgba(30,30,35,0.95)] p-6 rounded-lg shadow-lg w-full max-w-2xl">
          <div className="text-center py-10">
            <p className="mb-4 text-[#d9d8dc]">You need to be signed in with Google to view your emails.</p>
            <p className="text-sm text-[#8c8a94]">Please ensure your Google account has the Gmail permission enabled.</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Display permission error handling
  if (permissionError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-[rgba(30,30,35,0.95)] p-6 rounded-lg shadow-lg w-full max-w-2xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center text-[#d9d8dc]">
              <Mail className="h-5 w-5 mr-2 text-purple-400" />
              Gmail Permission Required
            </h2>
            <button 
              onClick={onClose}
              className="p-1 rounded-full hover:bg-[rgba(255,255,255,0.1)]"
            >
              <X className="h-5 w-5 text-[#8c8a94]" />
            </button>
          </div>
          
          <div className="bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.2)] text-[#ff9999] p-4 rounded mb-6">
            <h3 className="flex items-center text-lg font-medium mb-2 text-[#ff9999]">
              <AlertCircle className="h-5 w-5 mr-2" />
              Gmail Access Permission Required
            </h3>
            <p className="mb-4">
              To use your emails as scripts, the app needs permission to read your Gmail messages. 
              Your current permissions don't allow this.
            </p>
            <p className="mb-4 text-sm">
              You'll need to sign out and sign back in, making sure to grant Gmail read access when prompted.
            </p>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[rgba(255,255,255,0.05)] text-[#d9d8dc] border border-[rgba(255,255,255,0.1)] rounded-md hover:bg-[rgba(255,255,255,0.1)] transition-colors mr-3"
            >
              Cancel
            </button>
            <button
              onClick={handleReAuthenticate}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Re-authenticate with Gmail
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 overflow-y-auto">
      <motion.div 
        className="bg-[rgba(30,30,35,0.95)] p-6 rounded-lg shadow-lg w-full max-w-4xl my-8 mx-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center text-[#d9d8dc]">
            <Mail className="h-5 w-5 mr-2 text-purple-400" />
            Select Email as Script Source
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[rgba(255,255,255,0.1)]"
          >
            <X className="h-5 w-5 text-[#8c8a94]" />
          </button>
        </div>
        
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#8c8a94]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search emails..."
                className="w-full p-2 pl-10 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 text-[#d9d8dc]"
              />
            </div>
            <button 
              type="submit"
              className="px-4 py-2 bg-[rgba(255,255,255,0.08)] text-[#d9d8dc] rounded-md hover:bg-[rgba(255,255,255,0.12)] transition-colors"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center">
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </span>
              ) : 'Search'}
            </button>
          </div>
        </form>
        
        {error && (
          <div className="bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.2)] text-[#ff9999] px-4 py-3 rounded mb-4">
            <p className="flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </p>
          </div>
        )}
        
        <div className="rounded-lg overflow-hidden mb-4 divide-y divide-[rgba(255,255,255,0.08)]">
          <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
            {emails.length === 0 ? (
              <div className="p-4 text-center text-[#8c8a94]">
                {loading ? 'Loading emails...' : 'No emails found'}
              </div>
            ) : (
              emails.map((email) => (
                <div key={email.id} className="break-words">
                  <motion.div 
                    className={`my-1 mx-0 rounded-md p-3 cursor-pointer max-w-full border ${
                      selectedEmail?.id === email.id 
                        ? 'bg-[rgba(255,255,255,0.12)] text-[#d9d8dc] border-[rgba(255,255,255,0.2)]' 
                        : 'bg-[rgba(255,255,255,0.04)] text-[#8c8a94] border-transparent'
                    }`}
                    onClick={() => handleSelectEmail(email)}
                    whileHover={{ 
                      scale: 1.02, 
                      y: -2,
                      backgroundColor: selectedEmail?.id === email.id 
                        ? 'rgba(255,255,255,0.15)' 
                        : 'rgba(255,255,255,0.08)',
                      transition: { duration: 0.2 }
                    }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ 
                      duration: 0.3,
                      type: "spring",
                      stiffness: 150,
                      damping: 15
                    }}
                  >
                    <div className="flex justify-between mb-1 w-full">
                      <span className={`font-medium truncate max-w-[70%] ${selectedEmail?.id === email.id ? 'text-[#d9d8dc]' : ''}`}>
                        {email.from.split('<')[0].trim()}
                      </span>
                      <span className="text-xs truncate ml-1 text-[#8c8a94]">
                        {formatDate(email.date).split(',')[0]}
                      </span>
                    </div>
                    <div className={`font-medium truncate ${selectedEmail?.id === email.id ? 'text-[#d9d8dc]' : ''}`}>
                      {email.subject || 'No Subject'}
                      
                      {/* Image indicator */}
                      {getImageCount(email) > 0 && (
                        <span className="ml-2 inline-flex items-center text-xs bg-[rgba(59,130,246,0.2)] text-[#9cc2ff] px-2 py-0.5 rounded-full">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          {getImageCount(email)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-[#8c8a94] truncate">
                      {email.snippet}
                    </div>
                    <div className="mt-2">
                      <motion.button
                        onClick={(e) => toggleEmailView(email, e)}
                        className={`text-sm focus:outline-none px-2 py-1 rounded ${
                          selectedEmail?.id === email.id
                            ? 'text-[#d9d8dc] bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)]'
                            : 'text-[#8c8a94] hover:text-[#d9d8dc]'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {expandedEmailId === email.id ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-1 inline" />
                            Hide Email
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-1 inline" />
                            View Email
                          </>
                        )}
                      </motion.button>
                    </div>
                  </motion.div>
                  
                  {/* Email content when expanded */}
                  {expandedEmailId === email.id && (
                    <motion.div 
                      className="p-4 border-t border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] max-w-full overflow-hidden"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ 
                        opacity: 1, 
                        height: 'auto',
                        transition: { duration: 0.3 }
                      }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <div className="mb-4 pb-2 border-b border-[rgba(255,255,255,0.1)] max-w-full">
                        <h3 className="text-lg font-semibold mb-2 text-[#d9d8dc] break-words">{email.subject || 'No Subject'}</h3>
                        <div className="grid grid-cols-1 text-sm text-[#8c8a94] mb-1">
                          <div className="break-words"><strong>From:</strong> {email.from}</div>
                          <div className="break-words"><strong>Date:</strong> {formatDate(email.date)}</div>
                          <div className="break-words"><strong>To:</strong> {email.to}</div>
                        </div>
                      </div>
                      
                      <div className="my-2 text-[#b3b3b3] max-w-full">
                        {/* Handle HTML content safely with strict overflow control */}
                        {email.body ? (
                          <div 
                            dangerouslySetInnerHTML={{ 
                              __html: processEmailBody(email.body) 
                            }} 
                            className="email-content max-w-full overflow-hidden break-words"
                            style={{
                              maxWidth: '100%',
                              overflowWrap: 'break-word',
                              wordBreak: 'break-word',
                              wordWrap: 'break-word'
                            }}
                          />
                        ) : (
                          <div className="break-words">{email.snippet}</div>
                        )}
                        
                        {/* Display images from the email */}
                        {(email.images && email.images.length > 0) || 
                         (email.parsedContent?.urls.images && email.parsedContent.urls.images.length > 0) ? (
                          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.1)]">
                            <h4 className="font-medium mb-2 text-[#d9d8dc]">Images:</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {/* Display attached images */}
                              {email.images?.filter(img => img.dataUrl).map((img, idx) => (
                                <div key={`attached-${idx}`} className="aspect-video bg-[rgba(255,255,255,0.05)] rounded overflow-hidden">
                                  <img 
                                    src={img.dataUrl} 
                                    alt={img.filename} 
                                    className="w-full h-full object-contain" 
                                  />
                                </div>
                              ))}
                              
                              {/* Display images from parsed content */}
                              {email.parsedContent?.urls.images?.slice(0, 6).map((url, idx) => (
                                <div key={`parsed-${idx}`} className="aspect-video bg-[rgba(255,255,255,0.05)] rounded overflow-hidden">
                                  <img 
                                    src={url} 
                                    alt={`Image ${idx + 1}`} 
                                    className="w-full h-full object-contain" 
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        
        {nextPageToken && (
          <motion.button
            onClick={handleLoadMore}
            disabled={loading}
            className="w-full py-2 bg-[rgba(255,255,255,0.08)] text-[#d9d8dc] rounded-lg font-semibold transition-colors mb-6"
            whileHover={{ 
              backgroundColor: 'rgba(255,255,255,0.15)',
              scale: 1.02
            }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Loading more...
              </span>
            ) : 'Load more emails'}
          </motion.button>
        )}
        
        <div className="flex justify-end mt-6">
          <motion.button
            onClick={onClose}
            className="px-4 py-2 bg-[rgba(255,255,255,0.05)] text-[#d9d8dc] border border-[rgba(255,255,255,0.1)] rounded-md hover:bg-[rgba(255,255,255,0.1)] transition-colors mr-3"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={handleConfirmSelection}
            disabled={!selectedEmail}
            className={`px-4 py-2 text-white rounded-md transition-colors ${
              selectedEmail ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-600 cursor-not-allowed opacity-50'
            }`}
            whileHover={selectedEmail ? { scale: 1.03 } : {}}
            whileTap={selectedEmail ? { scale: 0.97 } : {}}
          >
            Use Selected Email
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}