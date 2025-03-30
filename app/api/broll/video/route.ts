// app/api/broll/video/route.ts
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
  createSlideshowVideo, 
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
    const { projectId } = await req.json();
    
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    // Fetch project with broll images
    const project = await prisma.project.findUnique({
      where: { id: Number(projectId) },
      select: { 
        id: true,
        brollImages: true,
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

    if (!project.brollImages || project.brollImages.length === 0) {
      return NextResponse.json({ error: "Project has no broll images" }, { status: 400 });
    }

    console.log(`Creating broll video from ${project.brollImages.length} images for project ${projectId}`);
    
    // Download all images from S3 to temp directory
    console.log("Downloading images from S3...");
    const downloadedImagePromises = project.brollImages.map(imageUrl => downloadFromS3(imageUrl));
    const downloadedImagePaths = await Promise.all(downloadedImagePromises);
    
    // Add downloaded files to temp files list for cleanup
    tempFiles.push(...downloadedImagePaths);
    
    // Define output video path
    const outputVideoPath = path.join(tempDir, `broll_${projectId}_${uuidv4()}.mp4`);
    tempFiles.push(outputVideoPath);
    
    // Generate slideshow video using ffmpeg
    console.log("Generating slideshow video...");
    await createSlideshowVideo(
      downloadedImagePaths,
      outputVideoPath,
      30, // 30 fps
      1,  // 1 second transition
      3,  // 3 seconds per image
      1.1 // 1.1x zoom factor
    );
    
    // Upload the generated video to S3
    console.log("Uploading video to S3...");
    const brollVideoUrl = await uploadToS3(
      outputVideoPath,
      session.user.id,
      'broll-videos'
    );
    
    // Update project with broll video URL
    await prisma.project.update({
      where: { id: Number(projectId) },
      data: {
        brollVideoUrl: brollVideoUrl,
        updatedAt: new Date(),
      },
    });
    
    // Clean up temp files
    cleanupTempFiles(tempFiles);
    
    return NextResponse.json({ 
      success: true, 
      brollVideoUrl: brollVideoUrl,
      message: "B-roll video generated successfully" 
    });
    
  } catch (error) {
    console.error("B-roll video processing error:", error);
    
    // Clean up temp files on error
    cleanupTempFiles(tempFiles);
    
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}