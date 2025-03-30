// app/api/images/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import prisma from "@/prisma/db";
import { fal } from "@fal-ai/client";

// Interface for mapping scenes to their image prompts
interface SceneImageMap {
  [sceneIndex: number]: {
    imagePrompts: string[];
    generatedImageUrls?: string[];
  }
}

async function generateImageFromPrompt(prompt: string): Promise<string | null> {
  try {
    // Configure fal.ai client
    fal.config({
      credentials: process.env.FAL_AI_API_KEY,
    });
    
    console.log(`Generating image with prompt: "${prompt}"`);
    
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
    
    console.log("Image generation result:", result.requestId);
    
    // Extract image URL from the response
    const imageUrl = result.data.images?.[0]?.url;
    
    if (!imageUrl) {
      console.error("No image URL in response");
      return null;
    }

    return imageUrl;
  } catch (error) {
    console.error(`Error generating image: ${error}`);
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

    // Fetch project with image prompts
    const project = await prisma.project.findUnique({
      where: { id: Number(projectId) },
      select: { 
        id: true,
        title: true,
        scenes: true,
        imagePrompts: true,
        sceneImageMap: true,
        generatedImages: true,
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

    // Check if we have image prompts
    if (!project.imagePrompts || project.imagePrompts.length === 0) {
      return NextResponse.json({ error: "No image prompts found in project" }, { status: 400 });
    }
    
    console.log(`Generating ${project.imagePrompts.length} images for project ${projectId}`);
    
    // Generate images for each prompt
    const imagePromises = project.imagePrompts.map(prompt => generateImageFromPrompt(prompt));
    const imageResults = await Promise.all(imagePromises);
    const validImageUrls = imageResults.filter(url => url !== null) as string[];
    
    if (validImageUrls.length === 0) {
      return NextResponse.json({ 
        error: "Failed to generate any images from the prompts" 
      }, { status: 500 });
    }
    
    console.log(`Successfully generated ${validImageUrls.length} images`);

    // Update scene-image mapping to include generated image URLs
    let sceneImageMap: SceneImageMap = {};
    if (project.sceneImageMap) {
      try {
        sceneImageMap = JSON.parse(project.sceneImageMap);
        
        // Track which image URL belongs to which prompt/scene
        let imageIndex = 0;
        
        // For each scene in the map
        for (const sceneIndex in sceneImageMap) {
          const scene = sceneImageMap[sceneIndex];
          scene.generatedImageUrls = [];
          
          // For each image prompt in the scene
          for (let promptIndex = 0; promptIndex < scene.imagePrompts.length; promptIndex++) {
            // If we have a valid image URL for this prompt
            if (imageIndex < validImageUrls.length) {
              scene.generatedImageUrls.push(validImageUrls[imageIndex]);
              imageIndex++;
            }
          }
        }
      } catch (e) {
        console.error("Error parsing scene-image map:", e);
      }
    }

    // Update project record with generated images
    await prisma.project.update({
      where: { id: Number(projectId) },
      data: {
        generatedImages: validImageUrls,
        sceneImageMap: JSON.stringify(sceneImageMap),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: `Generated ${validImageUrls.length} images`,
      imageCount: validImageUrls.length,
      imageUrls: validImageUrls,
      sceneImageMap: sceneImageMap
    });
    
  } catch (error) {
    console.error("Image generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}