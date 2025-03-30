// app/middleware.ts
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

let ffmpegVerified = false;

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // Only check paths related to video processing
  if (
    request.nextUrl.pathname.startsWith('/api/broll/video') ||
    request.nextUrl.pathname.startsWith('/api/video/merge')
  ) {
    if (!ffmpegVerified) {
      try {
        // Check if ffmpeg is installed
        await verifyFFMPEG();
        ffmpegVerified = true;
      } catch (error) {
        console.error('FFMPEG verification failed:', error);
        return NextResponse.json(
          { error: 'FFMPEG is not properly installed or configured on the server' },
          { status: 500 }
        );
      }
    }
  }
  
  return NextResponse.next();
}

function verifyFFMPEG(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    
    let stdout = '';
    let stderr = '';
    
    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('error', (error) => {
      console.error('FFMPEG check error:', error);
      reject(new Error('FFMPEG is not installed or not in the PATH'));
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        // Ensure temp directory exists
        const tempDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        console.log('FFMPEG is installed:', stdout.split('\n')[0]);
        resolve();
      } else {
        reject(new Error(`FFMPEG check exited with code ${code}: ${stderr}`));
      }
    });
  });
}

export const config = {
  matcher: [
    '/api/broll/video/:path*',
    '/api/video/merge/:path*',
  ],
};