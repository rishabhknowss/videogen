// app/api/user/updateAudio/route.ts
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

    const { audioUrl } = await req.json();
    
    if (!audioUrl) {
      return NextResponse.json({ error: "Audio URL is required" }, { status: 400 });
    }

    // Update user with audio URL
    const user = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        audioUrl,
      },
    });

    return NextResponse.json({ 
      success: true, 
      audioUrl: user.audioUrl 
    });
    
  } catch (error) {
    console.error("Error updating audio URL:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}