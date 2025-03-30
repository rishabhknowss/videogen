// app/api/project/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import prisma from "@/prisma/db";

// Define the enhanced scene structure with multiple image prompts
interface Scene {
  content: string;
  imagePrompts: string[];  // Array of image prompts for each scene
}

// Interface for mapping scenes to their image prompts
interface SceneImageMap {
  [sceneIndex: number]: {
    imagePrompts: string[];
    generatedImageUrls?: string[];
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, script, scenes = [] } = await req.json();
    
    if (!title || !script) {
      return NextResponse.json({ 
        error: "Title and script are required" 
      }, { status: 400 });
    }

    // Extract all image prompts from scenes
    const allImagePrompts = scenes.flatMap((scene: Scene) => scene.imagePrompts);

    // Create a mapping of scene indices to their image prompts
    const sceneImageMap: SceneImageMap = {};
    scenes.forEach((scene: Scene, index: number) => {
      sceneImageMap[index] = {
        imagePrompts: scene.imagePrompts,
        generatedImageUrls: [] // Will be populated later
      };
    });

    // Create new project with enhanced scene data
    const project = await prisma.project.create({
      data: {
        title,
        script,
        scenes: JSON.stringify(scenes), // Store scenes as a JSON string
        imagePrompts: allImagePrompts, // Store all image prompts in a flat array
        sceneImageMap: JSON.stringify(sceneImageMap), // Store mapping of scenes to image prompts
        userId: session.user.id,
        status: "DRAFT",
      },
    });

    return NextResponse.json({ 
      success: true, 
      project 
    });
    
  } catch (error) {
    console.error("Error creating project:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}