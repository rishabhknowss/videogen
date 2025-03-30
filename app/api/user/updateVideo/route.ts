// app/api/user/updateVideo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import prisma from "@/prisma/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoUrl } = await req.json();
    
    if (!videoUrl) {
      return NextResponse.json({ error: "Video URL is required" }, { status: 400 });
    }

    // Update user with video URL
    const user = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        videoUrl,
      },
    });

    return NextResponse.json({ 
      success: true, 
      videoUrl: user.videoUrl 
    });
    
  } catch (error) {
    console.error("Error updating video URL:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}