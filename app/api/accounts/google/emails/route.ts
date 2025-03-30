// app/api/accounts/google/emails/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import db from "@/prisma/db";
import { parseEmailContent } from "@/app/utils/emailParser";
import { refreshGoogleToken } from "@/app/utils/googleTokenRefresh";

import {
  GmailMessagePart,
  GmailAttachment,
  GmailMessage,
} from "../../../../types/types";

// Define interface for Gmail API response
interface GmailMessagesResponse {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "You must be signed in to access your emails" },
        { status: 401 }
      );
    }

    const userId = (session.user as { id: string }).id;

    let googleAccount = await db.account.findFirst({
      where: {
        userId: userId,
        provider: "google",
      },
    });

    if (!googleAccount || !googleAccount.access_token) {
      console.error("Google account not found or access token missing", {
        userId,
        accountFound: !!googleAccount,
        hasToken: !!(googleAccount && googleAccount.access_token),
      });

      return NextResponse.json(
        { error: "Google account not connected or access token missing" },
        { status: 403 }
      );
    }

    // Check if token is expired and refresh if needed
    if (googleAccount.expires_at) {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const isExpired = googleAccount.expires_at <= currentTimestamp;
      
      if (isExpired) {
        console.log("Token expired, attempting to refresh", {
          expiresAt: googleAccount.expires_at,
          currentTime: currentTimestamp,
          diff: currentTimestamp - googleAccount.expires_at,
        });

        // Try to refresh the token
        const refreshedAccount = await refreshGoogleToken(googleAccount);
        
        if (!refreshedAccount) {
          return NextResponse.json(
            {
              error: "Failed to refresh Google access token. Please reconnect your account.",
            },
            { status: 401 }
          );
        }
        
        // Use the refreshed account
        googleAccount = refreshedAccount;
        console.log("Successfully refreshed Google token");
      }
    }

    const url = new URL(request.url);
    const maxResults = url.searchParams.get("maxResults") || "10";
    const labelIds = url.searchParams.get("labelIds") || "INBOX";
    const q = url.searchParams.get("q") || "";
    const pageToken = url.searchParams.get("pageToken") || "";

    let gmailUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;

    if (labelIds) {
      gmailUrl += `&labelIds=${encodeURIComponent(labelIds)}`;
    }

    if (q) {
      gmailUrl += `&q=${encodeURIComponent(q)}`;
    }

    if (pageToken) {
      gmailUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const messagesResponse = await fetch(gmailUrl, {
      headers: {
        Authorization: `Bearer ${googleAccount.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!messagesResponse.ok) {
      const errorData = await messagesResponse.text();
      console.error("Gmail API error:", errorData);
      
      // Check if it's a token-related error (could be expired even after our check)
      if (messagesResponse.status === 401) {
        // One more attempt to refresh token if needed
        const refreshedAccount = await refreshGoogleToken(googleAccount);
        
        if (!refreshedAccount) {
          return NextResponse.json(
            { error: "Failed to access Gmail API - authentication error" },
            { status: 401 }
          );
        }
        
        // Retry with new token
        const retryResponse = await fetch(gmailUrl, {
          headers: {
            Authorization: `Bearer ${refreshedAccount.access_token}`,
            "Content-Type": "application/json",
          },
        });
        
        if (!retryResponse.ok) {
          return NextResponse.json(
            { error: "Failed to fetch emails from Gmail API" },
            { status: retryResponse.status }
          );
        }
        
        const retryData = await retryResponse.json() as GmailMessagesResponse;
        return handleMessagesData(retryData, refreshedAccount.access_token as string);
      }
      
      return NextResponse.json(
        { error: "Failed to fetch emails from Gmail API" },
        { status: messagesResponse.status }
      );
    }

    const messagesData = await messagesResponse.json() as GmailMessagesResponse;
    return handleMessagesData(messagesData, googleAccount.access_token as string);
    
  } catch (error) {
    console.error("Error in email route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleMessagesData(messagesData: GmailMessagesResponse, accessToken: string) {
    if (!messagesData.messages || messagesData.messages.length === 0) {
      return NextResponse.json({
        messages: [],
        nextPageToken: messagesData.nextPageToken,
        resultSizeEstimate: messagesData.resultSizeEstimate,
      });
    }
  
    const messagesToFetch = messagesData.messages.slice(0, 10);
    const messageDetailsPromises = messagesToFetch.map(
      async (message: { id: string }) => {
        try {
          // Use correct URL format for individual message fetch
          const messageResponse = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );
  
          if (!messageResponse.ok) {
            console.error(`Failed to fetch message ${message.id}: ${messageResponse.status}`);
            return null;
          }
  
          return messageResponse.json() as Promise<GmailMessage>;
        } catch (error) {
          console.error(`Error fetching message ${message.id}:`, error);
          return null;
        }
      }
    );
  
    const messageDetails = await Promise.all(messageDetailsPromises);
    const validMessageDetails = messageDetails.filter(
      (msg): msg is GmailMessage => msg !== null
    );
  
    const processedMessages = await Promise.all(
      validMessageDetails.map(async (message) => {
        try {
          // Add comprehensive null/undefined checking
          if (!message.payload) {
            console.warn(`Message ${message.id} has no payload`);
            return {
              id: message.id,
              threadId: message.threadId || '',
              subject: 'No Subject',
              from: '',
              to: '',
              date: '',
              snippet: message.snippet || '',
              body: '',
              labelIds: message.labelIds || [],
              internalDate: message.internalDate || '',
            };
          }
          
          const headers = message.payload.headers || [];
          const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
          const from = headers.find((h) => h.name === "From")?.value || "";
          const to = headers.find((h) => h.name === "To")?.value || "";
          const date = headers.find((h) => h.name === "Date")?.value || "";
  
          const content = {
            body: "",
            images: [] as GmailAttachment[],
            html: false,
          };
  
          // Extract content safely
          const extractContent = (
            part: GmailMessagePart,
            accumulator: typeof content
          ) => {
            if (part && part.body && part.body.data) {
              const mimeType = part.mimeType || "";
  
              if (mimeType.includes("text/html")) {
                accumulator.body += Buffer.from(
                  part.body.data,
                  "base64"
                ).toString("utf-8");
                accumulator.html = true;
              } else if (mimeType.includes("text/plain") && !accumulator.html) {
                accumulator.body += Buffer.from(
                  part.body.data,
                  "base64"
                ).toString("utf-8");
              } else if (mimeType.includes("image/")) {
                const filename =
                  part.filename || `image_${accumulator.images.length + 1}`;
                accumulator.images.push({
                  filename,
                  mimeType,
                  attachmentId: part.body.attachmentId!,
                  size: part.body.size!,
                });
              }
            }
  
            if (part && part.parts) {
              for (const subPart of part.parts) {
                extractContent(subPart, accumulator);
              }
            }
          };
  
          if (message.payload) {
            extractContent(message.payload, content);
          }
  
          // Handle message body
          if (message.payload.body && message.payload.body.data) {
            const mimeType = message.payload.mimeType || "";
            if (
              mimeType.includes("text/html") ||
              mimeType.includes("text/plain")
            ) {
              content.body += Buffer.from(
                message.payload.body.data,
                "base64"
              ).toString("utf-8");
              if (mimeType.includes("text/html")) {
                content.html = true;
              }
            }
          }
  
          // Process images
          const images: GmailAttachment[] = [];
          if (content.images.length > 0) {
            const imagesToFetch = content.images.slice(0, 5);
            for (const image of imagesToFetch) {
              if (image.attachmentId) {
                try {
                  const attachmentResponse = await fetch(
                    `https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}/attachments/${image.attachmentId}`,
                    {
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                      },
                    }
                  );
  
                  if (attachmentResponse.ok) {
                    const attachmentData = await attachmentResponse.json();
                    const dataBase64 = attachmentData.data;
  
                    if (dataBase64) {
                      const dataUrl = `data:${image.mimeType};base64,${dataBase64}`;
  
                      images.push({
                        ...image,
                        data: dataBase64,
                        dataUrl,
                      });
                    }
                  } else {
                    console.error(
                      `Failed to fetch attachment ${image.attachmentId} for message ${message.id}`
                    );
                  }
                } catch (error) {
                  console.error(
                    `Error fetching attachment for message ${message.id}:`,
                    error
                  );
                }
              }
            }
          }
  
          // Parse content
          let parsedContent = null;
          if (content.body) {
            try {
              parsedContent = parseEmailContent(content.body);
            } catch (error) {
              console.error(
                `Error parsing email content for message ${message.id}:`,
                error
              );
            }
          }
  
          return {
            id: message.id,
            threadId: message.threadId || '',
            subject,
            from,
            to,
            date,
            snippet: message.snippet || '',
            body: content.body,
            labelIds: message.labelIds || [],
            internalDate: message.internalDate || '',
            images: images.length > 0 ? images : undefined,
            parsedContent: parsedContent
              ? {
                  text: parsedContent.text,
                  urls: parsedContent.urls,
                }
              : undefined,
          };
        } catch (error) {
          console.error(`Error processing message ${message.id}:`, error);
          // Return minimal valid message data on error
          return {
            id: message.id,
            threadId: message.threadId || '',
            subject: 'Error Processing Email',
            from: '',
            to: '',
            date: '',
            snippet: message.snippet || 'Unable to process this email',
            body: '',
            labelIds: message.labelIds || [],
            internalDate: message.internalDate || '',
          };
        }
      })
    );
  
    return NextResponse.json({
      messages: processedMessages,
      nextPageToken: messagesData.nextPageToken,
      resultSizeEstimate: messagesData.resultSizeEstimate,
    });
  }