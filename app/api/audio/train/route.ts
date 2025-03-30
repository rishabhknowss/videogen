import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "elevenlabs";
import prisma from "@/prisma/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

// Configure S3 client
const s3Client = new S3Client({ 
  region: "us-west-1" 
});

export async function POST(req: NextRequest) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Parse request body
    const body = await req.json();
    const { audio } = body;
    
    // Validate audio URL
    if (!audio || typeof audio !== "string") {
      return NextResponse.json({ error: "Valid audio URL is required" }, { status: 400 });
    }
    
    // Parse the S3 URL to extract bucket and key
    let bucketName, objectKey;
    
    try {
      const urlPattern = /https:\/\/(?:s3\.[\w-]+\.amazonaws\.com\/([^\/]+)\/(.+)|([^.]+)\.s3\.[\w-]+\.amazonaws\.com\/(.+))/;
      const match = audio.match(urlPattern);
      
      if (match) {
        if (match[1] && match[2]) {
          // Path-style URL: https://s3.region.amazonaws.com/bucketname/keyname
          bucketName = match[1];
          objectKey = match[2];
        } else if (match[3] && match[4]) {
          // Virtual-hosted style: https://bucketname.s3.region.amazonaws.com/keyname
          bucketName = match[3];
          objectKey = match[4];
        }
      } else {
        // For your specific bucket format
        bucketName = "bucket.mailtosocial.com";
        const urlObj = new URL(audio);
        objectKey = urlObj.pathname.substring(1); // Remove leading slash
      }
    } catch (error) {
      console.error("S3 URL processing failed:", error);
      return NextResponse.json({ error: "Invalid S3 URL format" }, { status: 400 });
    }

    // Get the object from S3
    const getObjectParams = {
      Bucket: bucketName,
      Key: objectKey,
    };
    
    const { Body } = await s3Client.send(new GetObjectCommand(getObjectParams));
    
    if (!Body) {
      return NextResponse.json({ error: "Could not retrieve audio file from S3" }, { status: 404 });
    }
    
    // Convert the S3 object stream to a Blob
    const chunks = [];
    const stream = Body as Readable;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    const audioBlob = new Blob([buffer]);

    // Initialize ElevenLabs client
    const client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
    
    // Send to ElevenLabs using the file Blob
    const response = await client.voices.add({
      name: session.user.id,
      description: "Generated voice for VideoGen",
      files: [audioBlob],
    });
    
    // Update user in database
    await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        voice_id: response.voice_id 
      },
    });

    return NextResponse.json({ 
      success: true, 
      voice_id: response.voice_id 
    });
    
  } catch (error) {
    console.error("Voice training error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}