// app/api/project/[id]/resource/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import prisma from "@/prisma/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectId = Number(params.id);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    // First check if the project exists and belongs to the user
    const project = await prisma.project.findUnique({
      where: {
        id: projectId,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify that the user owns this project
    if (project.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Parse request body
    const body = await req.json();
    const { resourceType } = body;

    if (!resourceType || !['brollImages', 'brollVideo', 'mergedVideo'].includes(resourceType)) {
      return NextResponse.json({ 
        error: "Invalid resource type" 
      }, { status: 400 });
    }

    // Update project based on the resource type
    let updateData = {};
    
    if (resourceType === 'brollImages') {
      updateData = {
        brollImages: [],
        // If we delete images, we should also delete the video made from them
        brollVideoUrl: null
      };
    } else if (resourceType === 'brollVideo') {
      updateData = {
        brollVideoUrl: null
      };
    } else if (resourceType === 'mergedVideo') {
      updateData = {
        finalVideoUrl: null
      };
    }

    // Update the project
    await prisma.project.update({
      where: {
        id: projectId,
      },
      data: updateData
    });

    return NextResponse.json({ 
      success: true,
      message: `${resourceType} deleted successfully` 
    });
    
  } catch (error) {
    console.error("Error deleting resource:", error);
    return NextResponse.json(
      { error: "Failed to delete resource" },
      { status: 500 }
    );
  }
}