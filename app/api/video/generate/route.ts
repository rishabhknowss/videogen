// app/api/video/generate/route.ts - Fixed version

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import prisma from "@/prisma/db";
import { fal } from "@fal-ai/client";
import path from 'path';
import os from 'os';
import fs from 'fs';
import { 
  downloadFromURL, 
  uploadToS3,
  cleanupTempFiles
} from '@/app/lib/ffmpeg-utils';
import { getTranscriptWithTimestamps, groupWordsIntoScenes } from '@/app/lib/assemblyai';
import { spawn } from 'child_process';

// Define the scene structure for parsing
interface Scene {
  content: string;
  imagePrompt: string;
}

// Define a type for the image scene with timing
export interface TimedScene {
  start: number;     // Start time in milliseconds
  end: number;       // End time in milliseconds
  imagePrompt: string;
  imageUrl?: string; // URL of the generated image (optional)
}
  
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
  // Initialize projectId variable
  let projectId: number | null = null;

  try {
    // Parse request body
    const body = await req.json();
    projectId = body.projectId ? Number(body.projectId) : null;
    
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    // Fetch project with scenes and generated images
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { 
        id: true,
        title: true,
        script: true,
        scenes: true,
        imagePrompts: true,
        generatedImages: true,
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

    // Update project status to PROCESSING
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "PROCESSING",
        updatedAt: new Date(),
      },
    });

    // Check if we have image prompts
    if (!project.imagePrompts || project.imagePrompts.length === 0) {
      return NextResponse.json({ error: "No image prompts found in project" }, { status: 400 });
    }
    
    // Generate or use generated images
    let generatedImages = project.generatedImages || [];
    if (generatedImages.length === 0) {
      generatedImages = await generateImagesFromPrompts(project.imagePrompts);
      
      // Save the generated images to the project
      await prisma.project.update({
        where: { id: projectId },
        data: {
          generatedImages: generatedImages,
          updatedAt: new Date(),
        },
      });
    }
    
    // Generate audio from script
    console.log("Generating audio from script...");
    const audioUrl = await generateAudio(project.script || "", session.user.id);
    
    if (!audioUrl) {
      throw new Error("Failed to generate audio from script");
    }
    
    // Get transcript with timestamps from AssemblyAI
    console.log("Getting transcript with timestamps from AssemblyAI...");
    const transcript = await getTranscriptWithTimestamps(audioUrl);
    
    // Group words into scenes and assign images
    console.log("Grouping words into scenes and assigning images...");
    const timedScenes: TimedScene[] = groupWordsIntoScenes(
      transcript.words, 
      project.imagePrompts,
      transcript.audio_duration
    );
    
    // Assign image URLs to scenes
    for (let i = 0; i < timedScenes.length; i++) {
      if (i < generatedImages.length) {
        timedScenes[i].imageUrl = generatedImages[i];
      }
    }
    
    // Download images for the slideshow
    console.log("Downloading images for slideshow...");
    const imageDownloadPromises = generatedImages.map(url => downloadFromURL(url));
    const imagePaths = await Promise.all(imageDownloadPromises);
    tempFiles.push(...imagePaths);
    
    // Download audio file
    console.log("Downloading audio file...");
    const audioPath = await downloadFromURL(audioUrl);
    tempFiles.push(audioPath);
    
    // Create a slideshow with proper error handling and fallback
    console.log("Creating enhanced slideshow...");
    const slideshowPath = path.join(tempDir, `slideshow_${projectId}_${Date.now()}.mp4`);
    tempFiles.push(slideshowPath);
    
    let slideshowSuccess = false;
    
    try {
      // First try with the enhanced slideshow with effects
      await createSimplifiedSlideshow(
        imagePaths,
        audioPath,
        slideshowPath,
        timedScenes,
        transcript.audio_duration * 1000 // Convert to milliseconds
      );
      console.log("Enhanced slideshow created successfully");
      slideshowSuccess = true;
    } catch (slideshowError) {
      console.error("Enhanced slideshow creation failed:", slideshowError);
      console.log("Falling back to basic slideshow...");
      
      try {
        // Fallback to a simpler slideshow approach
        await createBasicSlideshow(
          imagePaths,
          audioPath,
          slideshowPath,
          timedScenes,
          transcript.audio_duration * 1000
        );
        console.log("Basic slideshow created successfully as fallback");
        slideshowSuccess = true;
      } catch (fallbackError) {
        console.error("Basic slideshow creation also failed:", fallbackError);
        // Continue with the rest of the flow, we'll skip split screen if slideshow fails
      }
    }
    
    // Generate lip-synced video with the user's video
    console.log("Generating lip-synced video...");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { videoUrl: true }
    });
    
    if (!user?.videoUrl) {
      throw new Error("User has no uploaded video");
    }
    
    const lipsyncUrl = await generateLipSyncVideo(user.videoUrl, audioUrl, project.title);
    
    if (!lipsyncUrl) {
      throw new Error("Failed to generate lip-synced video");
    }
    
    // Download lip-synced video
    console.log("Downloading lip-synced video...");
    const lipsyncPath = await downloadFromURL(lipsyncUrl);
    tempFiles.push(lipsyncPath);
    
    // Upload slideshow to S3 if it was created successfully
    let slideshowUrl = null;
    if (slideshowSuccess) {
      console.log("Uploading slideshow to S3...");
      slideshowUrl = await uploadToS3(
        slideshowPath,
        session.user.id,
        'slideshows'
      );
    }
    
    // Create split-screen video if slideshow was created successfully
    let splitScreenUrl = null;
    if (slideshowSuccess) {
      try {
        console.log("Creating split-screen video...");
        const splitScreenPath = path.join(tempDir, `splitscreen_${projectId}_${Date.now()}.mp4`);
        tempFiles.push(splitScreenPath);
        
        await createSplitScreenVideo(
          slideshowPath,
          lipsyncPath,
          splitScreenPath
        );
        
        console.log("Uploading split-screen video to S3...");
        splitScreenUrl = await uploadToS3(
          splitScreenPath,
          session.user.id,
          'final-videos'
        );
      } catch (splitScreenError) {
        console.error("Split-screen video creation failed:", splitScreenError);
        // Continue with the flow, we'll at least have the lipsync video
      }
    }
    
    // Update project with final outputs and transcript data
    const updateData: any = {
      outputUrl: lipsyncUrl,                  // The lip-synced video
      transcript: JSON.stringify(transcript), // Store the full transcript
      timedScenes: JSON.stringify(timedScenes), // Store the timed scenes
      audioDuration: transcript.audio_duration, // Store audio duration
      status: "COMPLETED",
      updatedAt: new Date(),
    };
    
    // Only add these fields if they were successfully created
    if (slideshowUrl) {
      updateData.slideshowUrl = slideshowUrl;
    }
    
    if (splitScreenUrl) {
      updateData.finalVideoUrl = splitScreenUrl;
    }
    
    await prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });
    
    // Clean up temp files
    cleanupTempFiles(tempFiles);
    
    return NextResponse.json({ 
      success: true, 
      message: "Videos generated successfully",
      lipsyncUrl: lipsyncUrl,
      slideshowUrl: slideshowUrl,
      splitScreenUrl: splitScreenUrl,
      wordCount: transcript.words.length,
      duration: transcript.audio_duration
    });
    
  } catch (error) {
    console.error("Video generation error:", error);
    
    // Update project status to FAILED if we have a projectId
    if (projectId) {
      try {
        await prisma.project.update({
          where: { id: projectId },
          data: {
            status: "FAILED",
            updatedAt: new Date(),
          },
        });
      } catch (dbError) {
        console.error("Error updating project status:", dbError);
      }
    }
    
    // Clean up temp files on error
    cleanupTempFiles(tempFiles);
    
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Helper function to generate images from prompts
async function generateImagesFromPrompts(prompts: string[]): Promise<string[]> {
  // Configure fal.ai client
  fal.config({
    credentials: process.env.FAL_AI_API_KEY,
  });
  
  console.log(`Generating ${prompts.length} images from prompts...`);
  
  const imagePromises = prompts.map(async (prompt) => {
    try {
      console.log(`Generating image for prompt: "${prompt.substring(0, 50)}..."`);
      
      // Use the Flux Pro model for high-quality images
      const result = await fal.subscribe("fal-ai/flux-pro/v1.1", {
        input: {
          prompt: prompt,
        
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        },
      });
      
      const imageUrl = result.data.images?.[0]?.url;
      
      if (!imageUrl) {
        console.error("No image URL in response");
        return null;
      }
      
      return imageUrl;
    } catch (error) {
      console.error(`Error generating image for prompt: ${error}`);
      return null;
    }
  });
  
  const results = await Promise.all(imagePromises);
  return results.filter(url => url !== null) as string[];
}

// Helper function to generate audio from text
async function generateAudio(text: string, userId: string): Promise<string | null> {
  try {
    // Find user's voice_id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { voice_id: true }
    });
    
    if (!user || !user.voice_id) {
      throw new Error("Voice ID not found for user");
    }
    
    // Call ElevenLabs API
    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${user.voice_id}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        }),
      }
    );

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("ElevenLabs API error:", errorText);
      throw new Error(`ElevenLabs API error: ${errorText}`);
    }
    
    // Get the audio data
    const audioData = await elevenLabsResponse.arrayBuffer();
    const audioBuffer = Buffer.from(audioData);
    
    // Upload to S3
    const fileName = `${userId}/audio/${Date.now()}.mp3`;
    const s3Params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: audioBuffer,
      ContentType: "audio/mpeg",
    };
    
    // Import and configure S3 client
    const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-west-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
    
    await s3Client.send(new PutObjectCommand(s3Params));
    
    // Create the S3 URL
    const region = process.env.AWS_REGION || "us-west-1";
    const bucket = process.env.AWS_S3_BUCKET_NAME || "";
    const audioUrl = `https://s3.${region}.amazonaws.com/${bucket}/${fileName}`;
    
    return audioUrl;
  } catch (error) {
    console.error("Error generating audio:", error);
    return null;
  }
}

// Helper function to generate lip-synced video
async function generateLipSyncVideo(videoUrl: string, audioUrl: string, title: string): Promise<string | null> {
  try {
    // Configure fal.ai client
    fal.config({
      credentials: process.env.FAL_AI_API_KEY,
    });
    
    console.log("Starting lipsync processing with:");
    console.log("- Audio URL:", audioUrl);
    console.log("- Video URL:", videoUrl);

    // Process with fal.ai
    const result = await fal.subscribe("fal-ai/sync-lipsync", {
      input: {
        video_url: videoUrl,
        audio_url: audioUrl
      },
      logs: true, 
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });
    
    // Check if the result has the expected data structure
    if (!result.data || !result.data.video || !result.data.video.url) {
      console.error("Invalid response format:", result);
      return null;
    }
    
    // Get the output URL from the correct property path
    return result.data.video.url;
  } catch (error) {
    console.error("Error generating lip-synced video:", error);
    return null;
  }
}

// Create a simplified slideshow
async function createSimplifiedSlideshow(
  imagePaths: string[],
  audioPath: string,
  outputPath: string,
  timedScenes: TimedScene[],
  totalDuration: number
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (imagePaths.length === 0) {
      reject(new Error('No images provided for slideshow'));
      return;
    }
    
    try {
      // First, prepare the image inputs part of the command
      const ffmpegInputs: string[] = [];
      
      // Add each image as an input
      imagePaths.forEach((imagePath) => {
        ffmpegInputs.push('-loop', '1', '-i', imagePath);
      });
      
      // Add audio input
      ffmpegInputs.push('-i', audioPath);
      
      // Create a simplified filter complex
      let filterComplex = '';
      
      // Process each image with scale and pad first
      imagePaths.forEach((_, i) => {
        filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
          `pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v${i}];`;
      });
      
      // Create segments with the correct durations
      const segments : string[] = [];
      timedScenes.forEach((scene, i) => {
        if (i < imagePaths.length) {
          // Calculate duration in seconds
          const durationSec = Math.max(1, Math.ceil((scene.end - scene.start) / 1000));
          
          // Create segment with fade in/out
          filterComplex += `[v${i}]trim=duration=${durationSec},` +
            `fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, durationSec - 0.5)}:d=0.5[f${i}];`;
          
          segments.push(`[f${i}]`);
        }
      });
      
      // Concatenate all segments
      filterComplex += `${segments.join('')}concat=n=${segments.length}:v=1:a=0[outv]`;
      
      // Build the FFmpeg command
      const ffmpegArgs = [
        '-y',                           // Overwrite output file if it exists
        ...ffmpegInputs,                // Input files (images and audio)
        '-filter_complex', filterComplex, // The complex filter 
        '-map', '[outv]',               // Map the video output
        '-map', `${imagePaths.length}:a`, // Map the audio (last input)
        '-c:v', 'libx264',              // Video codec
        '-c:a', 'aac',                  // Audio codec
        '-shortest',                    // End when shortest input ends
        '-pix_fmt', 'yuv420p',          // Pixel format for compatibility
        '-preset', 'medium',            // Encoding preset
        '-crf', '23',                   // Constant rate factor (quality)
        outputPath                      // Output file
      ];
      
      console.log('FFmpeg simplified slideshow command:', ffmpegArgs.join(' '));
      
      // Execute the FFmpeg command
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress
        process.stdout.write(`\rFFmpeg: ${data.toString().trim()}`);
      });
      
      ffmpeg.on('error', (error) => {
        console.error('\nFFmpeg process error:', error);
        reject(error);
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('\nFFmpeg slideshow created successfully');
          resolve(outputPath);
        } else {
          console.error(`\nFFmpeg process exited with code ${code}`);
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });
    } catch (error) {
      console.error('Error creating simplified slideshow:', error);
      reject(error);
    }
  });
}

// Create a basic slideshow as a fallback option
async function createBasicSlideshow(
  imagePaths: string[],
  audioPath: string,
  outputPath: string,
  timedScenes: TimedScene[],
  totalDuration: number
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (imagePaths.length === 0) {
      reject(new Error('No images provided for slideshow'));
      return;
    }
    
    try {
      // Calculate duration per image in seconds
      const audioDurationSec = totalDuration / 1000;
      const durationPerImageSec = audioDurationSec / imagePaths.length;
      
      // Create a text file with image durations for concat demuxer
      const tempDir = path.dirname(outputPath);
      const inputListPath = path.join(tempDir, `concat_list_${Date.now()}.txt`);
      
      // Create the file content for concat
      let fileContent = '';
      imagePaths.forEach((imagePath) => {
        fileContent += `file '${imagePath.replace(/'/g, "'\\''")}'` + '\n';
        fileContent += `duration ${durationPerImageSec}` + '\n';
      });
      // Add the last file again with a very short duration to avoid issues
      fileContent += `file '${imagePaths[imagePaths.length - 1].replace(/'/g, "'\\''")}'` + '\n';
      fileContent += `duration 0.1` + '\n';
      
      // Write the list file
      fs.writeFileSync(inputListPath, fileContent);
      
      // Simple FFmpeg command using concat demuxer
      const ffmpegArgs = [
        '-y',                        // Overwrite output file
        '-f', 'concat',              // Use concat demuxer
        '-safe', '0',                // Allow unsafe file paths
        '-i', inputListPath,         // Input file list
        '-i', audioPath,             // Audio input
        '-c:v', 'libx264',           // Video codec
        '-c:a', 'aac',               // Audio codec
        '-pix_fmt', 'yuv420p',       // Pixel format
        '-shortest',                 // End with shortest input
        outputPath                   // Output file
      ];
      
      console.log('FFmpeg basic slideshow command:', ffmpegArgs.join(' '));
      
      // Execute FFmpeg
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        process.stdout.write(`\rFFmpeg basic: ${data.toString().trim()}`);
      });
      
      ffmpeg.on('error', (error) => {
        console.error('\nFFmpeg process error:', error);
        reject(error);
      });
      
      ffmpeg.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(inputListPath);
        } catch (err) {
          console.error('Error deleting temp file:', err);
        }
        
        if (code === 0) {
          console.log('\nFFmpeg basic slideshow created successfully');
          resolve(outputPath);
        } else {
          console.error(`\nFFmpeg process exited with code ${code}`);
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg basic slideshow failed with code ${code}: ${stderr}`));
        }
      });
    } catch (error) {
      console.error('Error creating basic slideshow:', error);
      reject(error);
    }
  });
}

// Function to merge slideshow and person video into a split-screen format
async function createSplitScreenVideo(
  slideshowPath: string,
  personVideoPath: string,
  outputPath: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      // Check if input files exist
      if (!fs.existsSync(slideshowPath)) {
        throw new Error(`Slideshow file does not exist: ${slideshowPath}`);
      }
      if (!fs.existsSync(personVideoPath)) {
        throw new Error(`Person video file does not exist: ${personVideoPath}`);
      }
      
      // Simplified filter to avoid potential issues
      const filterComplex = 
        `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,setsar=1[top];` + 
        `[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,setsar=1[bottom];` + 
        `[top][bottom]vstack=inputs=2[v]`;
        
      // Build FFmpeg command for split-screen merge
      const ffmpegArgs = [
        '-y',                                 // Overwrite output file if it exists
        '-i', slideshowPath,                  // Slideshow input
        '-i', personVideoPath,                // Person video input
        '-filter_complex', filterComplex,     // Split screen filter
        '-map', '[v]',                        // Map combined video
        '-map', '0:a',                        // Use audio from slideshow
        '-c:v', 'libx264',                    // Video codec
        '-c:a', 'aac',                        // Audio codec
        '-preset', 'fast',                    // Faster encoding
        '-crf', '23',                         // Quality level
        '-shortest',                          // End when shortest input ends
        outputPath                            // Output file
      ];
      
      console.log('FFmpeg split-screen command:', ffmpegArgs.join(' '));
      
      // Execute the FFmpeg command
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress
        process.stdout.write(`\rFFmpeg Merge: ${data.toString().trim()}`);
      });
      
      ffmpeg.on('error', (error) => {
        console.error('\nFFmpeg merge error:', error);
        reject(error);
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('\nFFmpeg split-screen merge completed successfully');
          resolve(outputPath);
        } else {
          console.error(`\nFFmpeg merge exited with code ${code}`);
          console.error('FFmpeg merge stderr:', stderr);
          
          // Try an even simpler approach as a fallback
          console.log("Trying a simpler approach for split-screen...");
          
          // Very basic command - just stack the two videos without any scaling
          const simpleArgs = [
            '-y',                  // Overwrite output
            '-i', slideshowPath,   // Slideshow input
            '-i', personVideoPath, // Person video input
            '-filter_complex', '[0:v][1:v]vstack[v]', // Simple vstack filter
            '-map', '[v]',         // Map video
            '-map', '0:a',         // Map audio
            '-c:v', 'libx264',     // Video codec
            '-c:a', 'aac',         // Audio codec
            '-preset', 'ultrafast', // Fastest encoding
            '-crf', '23',          // Quality
            outputPath             // Output
          ];
          
          const simpleFfmpeg = spawn('ffmpeg', simpleArgs);
          let simpleStderr = '';
          
          simpleFfmpeg.stderr.on('data', (data) => {
            simpleStderr += data.toString();
          });
          
          simpleFfmpeg.on('close', (simpleCode) => {
            if (simpleCode === 0) {
              console.log('\nSimplified split-screen merge completed successfully');
              resolve(outputPath);
            } else {
              reject(new Error(`Both split-screen approaches failed. Last error: ${simpleStderr}`));
            }
          });
        }
      });
    } catch (error) {
      console.error('Error creating split-screen video:', error);
      reject(error);
    }
  });
}