// app/api/audio/text-to-speech/route.ts
import { authOptions } from "@/app/lib/authOptions";
import prisma from "@/prisma/db";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

// Configure S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const dbUser = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      voice_id: true
    }
  });
  
  if (!dbUser || !dbUser.voice_id) {
    return NextResponse.json({ error: "Voice ID not found for user" }, { status: 404 });
  }
  
  const { text } = await req.json();
  
  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  
  try {
    console.log("Starting text-to-speech conversion with voice ID:", dbUser.voice_id);
    
    // Call ElevenLabs API directly
    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${dbUser.voice_id}`,
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
            stability: 0.3,         // Lower stability for more dynamic range and emotion
            similarity_boost: 0.7,  // Higher similarity to the original voice
            style: 0.7,             // Increase style to amplify the original speaker's style
            use_speaker_boost: true // Enhances similarity to the original speaker
          },
          speed: 1.15               // 15% faster than normal speech for that short-form video pace
        }),
      }
    );

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("ElevenLabs API error:", errorText);
      return NextResponse.json({ error: `ElevenLabs API error: ${errorText}` }, { status: 500 });
    }
    
    // Get the audio data
    const audioData = await elevenLabsResponse.arrayBuffer();
    const audioBuffer = Buffer.from(audioData);
    
    console.log(`Audio buffer created: ${audioBuffer.length} bytes`);
    
    // Upload to S3
    const fileName = `${session.user.id}/${uuidv4()}.mp3`;
    const s3Params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: audioBuffer,
      ContentType: "audio/mpeg",
    };
    
    console.log("Uploading audio to S3...");
    await s3Client.send(new PutObjectCommand(s3Params));
    
    // Create the S3 URL
    const region = process.env.AWS_REGION || "us-west-1";
    const bucket = process.env.AWS_S3_BUCKET_NAME || "";
    const audioUrl = `https://s3.${region}.amazonaws.com/${bucket}/${fileName}`;
    console.log("Audio uploaded to:", audioUrl);
    
    // Return the S3 URL
    return NextResponse.json({ 
      msg: "success", 
      response: audioUrl 
    });
  } catch (error) {
    console.error("Text-to-speech error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}