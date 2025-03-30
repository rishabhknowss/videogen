import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";
import { v4 as uuidv4 } from "uuid";


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
    return NextResponse.json("Unauthorized", { status: 401 });
  }

  try {
 
    const { fileType, fileName, contentType } = await req.json();
    
    if (!fileType || !contentType) {
      return NextResponse.json("Missing required parameters", { status: 400 });
    }

   
    const fileExtension = fileName ? fileName.split('.').pop() : fileType.split('/')[1];
    const uniqueFileName = `${session.user.id}/${uuidv4()}.${fileExtension}`;
    
    // Set up the parameters for the presigned URL
    const putObjectParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: uniqueFileName,
      ContentType: contentType,
    };

   
    const command = new PutObjectCommand(putObjectParams);
    
    
    const presignedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 900 // 15 minutes in seconds
    });

    return NextResponse.json({ 
      url: presignedUrl,
      key: uniqueFileName,
      bucket: process.env.AWS_S3_BUCKET_NAME,
      region: process.env.AWS_REGION || "us-west-1"
    });
    
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}


export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json("Unauthorized", { status: 401 });
  }
  
  return NextResponse.json({ 
    message: "Pre-signed URL endpoint is working. Send a POST request to generate a URL."
  });
}