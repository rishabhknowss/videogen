// app/api/video/merge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import prisma from "@/prisma/db";
import { v4 as uuidv4 } from "uuid";
import path from 'path';
import os from 'os';
import fs from 'fs';
import { 
  downloadFromS3, 
  uploadToS3, 
  mergePortraitVideo, 
  cleanupTempFiles
} from '@/app/lib/ffmpeg-utils';

export async function POST(req: NextRequest) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Create temp directory if it doesn't exist
  const tempDir = path.join(os.tmpdir(), 'videogen');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Array to track temp files for cleanup
  const tempFiles: string[] = [];

  try {
    // Parse request body
    const body = await req.json();
    const { 
      projectId, 
      personSize = 0.4, 
      personPosition = 'bottom',
      additionalKeywords = []
    } = body;
    
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
        outputUrl: true,
        brollVideoUrl: true,
        keywords: true,
        userId: true,
        status: true
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if user owns this project
    if (project.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check if necessary videos exist
    if (!project.outputUrl) {
      return NextResponse.json({ error: "Main video not found" }, { status: 400 });
    }

    if (!project.brollVideoUrl) {
      return NextResponse.json({ error: "B-roll video not found" }, { status: 400 });
    }

    console.log(`Merging videos for project ${projectId} in portrait mode`);
    console.log("Person video:", project.outputUrl);
    console.log("B-roll video:", project.brollVideoUrl);
    
    // Download videos
    console.log("Downloading videos...");
    
    let personVideoPath: string;
    let brollVideoPath: string;
    
    try {
      personVideoPath = await downloadFromS3(project.outputUrl);
      tempFiles.push(personVideoPath);
      console.log("Successfully downloaded person video");
    } catch (error) {
      console.error("Error downloading person video:", error);
      return NextResponse.json({ error: "Failed to download person video" }, { status: 500 });
    }
    
    try {
      brollVideoPath = await downloadFromS3(project.brollVideoUrl);
      tempFiles.push(brollVideoPath);
      console.log("Successfully downloaded broll video");
    } catch (error) {
      console.error("Error downloading broll video:", error);
      return NextResponse.json({ error: "Failed to download broll video" }, { status: 500 });
    }
    
    // Define output video path
    const outputVideoPath = path.join(tempDir, `portrait_${projectId}_${uuidv4()}.mp4`);
    tempFiles.push(outputVideoPath);
    
    // Merge videos using ffmpeg in portrait mode
    console.log("Merging videos in portrait mode...");
    try {
      await mergePortraitVideo(
        personVideoPath,
        brollVideoPath,
        outputVideoPath,
        Number(personSize),
        personPosition as 'bottom' | 'bottom_left' | 'bottom_right'
      );
      console.log("Video merge completed successfully");
    } catch (error) {
      console.error("FFMPEG merge error:", error);
      cleanupTempFiles(tempFiles);
      return NextResponse.json({ 
        error: "Failed to merge videos with FFMPEG",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }
    
    // Upload the merged video to S3
    console.log("Uploading merged video to S3...");
    let mergedVideoUrl: string;
    try {
      mergedVideoUrl = await uploadToS3(
        outputVideoPath,
        session.user.id,
        'merged-videos'
      );
      console.log("Successfully uploaded merged video to:", mergedVideoUrl);
    } catch (error) {
      console.error("S3 upload error:", error);
      cleanupTempFiles(tempFiles);
      return NextResponse.json({ 
        error: "Failed to upload merged video to S3",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }
    
    // Update project with merged video URL and any additional keywords
    try {
      // Combine existing keywords with any new ones
      const updatedKeywords = [...(project.keywords || [])];
      
      // Add any additional keywords that don't already exist
      if (additionalKeywords && additionalKeywords.length > 0) {
        for (const keyword of additionalKeywords) {
          if (!updatedKeywords.includes(keyword)) {
            updatedKeywords.push(keyword);
          }
        }
      }
      
      await prisma.project.update({
        where: { id: Number(projectId) },
        data: {
          finalVideoUrl: mergedVideoUrl,
          keywords: updatedKeywords,
          updatedAt: new Date(),
        },
      });
      console.log("Updated project with final video URL and keywords");
    } catch (error) {
      console.error("Database update error:", error);
      // Don't fail the request if DB update fails but video was created
    }
    
    // Clean up temp files
    cleanupTempFiles(tempFiles);
    
    return NextResponse.json({ 
      success: true, 
      mergedVideoUrl: mergedVideoUrl,
      keywords: project.keywords,
      message: "Portrait video created successfully" 
    });
    
  } catch (error) {
    console.error("Video merge error:", error);
    
    // Clean up temp files on error
    cleanupTempFiles(tempFiles);
    
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}