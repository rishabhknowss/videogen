// app/api/broll/route.ts
// This service handles generating broll images from keywords extracted from script
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import prisma from "@/prisma/db";
import { fal } from "@fal-ai/client";


// Function to extract keywords from script
function extractKeywords(script: string): string[] {
  // Remove common words, conjunctions, and articles
  const stopWords = [
    "a", "an", "the", "and", "or", "but", "if", "because", "as", "what", 
    "when", "where", "how", "which", "who", "whom", "whose", "that", "this",
    "these", "those", "am", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should",
    "may", "might", "must", "can", "could", "to", "for", "of", "in", "on", "at", 
    "by", "with", "about", "against", "between", "into", "through", "during", "before",
    "after", "above", "below", "from", "up", "down", "out", "off", "over", "under",
    "again", "further", "then", "once", "here", "there", "all", "any", "both", "each",
    "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "should", "now", "i", "me", "my", "myself",
    "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself",
    "they", "them", "their", "theirs", "themselves"
  ];

  // Clean text and tokenize
  const cleanScript = script.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s{2,}/g, ' '); // Remove extra spaces
  
  const words = cleanScript.split(' ');
  
  // Filter out stop words and get unique words longer than 3 characters
  const filteredWords = words
    .filter(word => !stopWords.includes(word) && word.length > 3)
    .map(word => word.trim());
  
  // Get unique words and sort by length (longer words tend to be more meaningful)
  const uniqueWords = [...new Set(filteredWords)]
    .sort((a, b) => b.length - a.length);
  
  // Extract key phrases using co-occurrence and named entities
  // This is a simplified approach - could be expanded with NLP
  let keywords: string[] = [];
  
  // First take some of the unique longer words
  const individualKeywords = uniqueWords.slice(0, 10);
  keywords = [...individualKeywords];
  
  // Look for bigrams (word pairs) that might make more meaningful concepts
  // Only choose 5 to keep result count manageable
  for (let i = 0; i < words.length - 1 && keywords.length < 15; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (!stopWords.includes(words[i]) && !stopWords.includes(words[i + 1]) && 
        words[i].length > 3 && words[i + 1].length > 3) {
      keywords.push(bigram);
    }
    if (keywords.length >= 15) break;
  }
  
  // Limit to max 8 keywords for API efficiency
  return keywords.slice(0, 8);
}

async function generateImageForKeyword(keyword: string): Promise<string | null> {
  try {
    // Configure fal.ai client
    fal.config({
      credentials: process.env.FAL_AI_API_KEY,
    });
    
    console.log(`Generating image for keyword "${keyword}"`);
    
    // Use the Flux Pro model as specified
    const result = await fal.subscribe("fal-ai/flux-pro/v1.1", {
      input: {
        prompt: `High quality, professional image of ${keyword}. Detailed, well-lit, 4K resolution.`,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });
    
    console.log("Flux Pro result data:", result.data);
    console.log("Request ID:", result.requestId);
    
    // Extract image URL from the response
    const imageUrl = result.data.images?.[0]?.url;
    
    if (!imageUrl) {
      console.error("No image URL in response:", result.data);
      return null;
    }

    return imageUrl;
  } catch (error) {
    console.error(`Error generating image for keyword "${keyword}":`, error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Parse request body
    const { projectId } = await req.json();
    
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    // Fetch project
    const project = await prisma.project.findUnique({
      where: { id: Number(projectId) },
      select: { 
        id: true,
        title: true,
        script: true,
        keywords: true,
        userId: true
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if user owns this project
    if (project.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let keywords: string[] = [];

    // Use existing keywords if available, otherwise extract from script
    if (project.keywords && project.keywords.length > 0) {
      keywords = project.keywords;
      console.log(`Using existing keywords for project ${projectId}:`, keywords);
    } else if (project.script) {
      keywords = extractKeywords(project.script);
      console.log(`Extracted keywords for project ${projectId}:`, keywords);
    } else {
      return NextResponse.json({ error: "Project has no script or keywords" }, { status: 400 });
    }
    
    // Generate images for each keyword
    const imagePromises = keywords.map(keyword => generateImageForKeyword(keyword));
    const imageResults = await Promise.all(imagePromises);
    const validImageUrls = imageResults.filter(img => img !== null) as string[];
    
    if (validImageUrls.length === 0) {
      return NextResponse.json({ 
        error: "Failed to generate any images from the script" 
      }, { status: 500 });
    }
    
    console.log(`Generated ${validImageUrls.length} images for project ${projectId}`);

    // Update project record with generated images
    await prisma.project.update({
      where: { id: Number(projectId) },
      data: {
        brollImages: validImageUrls,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: `Generated ${validImageUrls.length} broll images`,
      keywords,
      imageCount: validImageUrls.length,
      imageUrls: validImageUrls 
    });
    
  } catch (error) {
    console.error("Broll generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}