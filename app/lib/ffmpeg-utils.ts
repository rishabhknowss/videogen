// app/lib/ffmpeg-utils.ts
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { TimedScene } from '../api/video/generate/route';

// Configure S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Helper to download file from URL to local temp directory
export async function downloadFromURL(url: string): Promise<string> {
  try {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'videogen');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate a temp file path with random filename
    const fileExt = path.extname(url) || determineExtensionFromUrl(url);
    const tempFilePath = path.join(tempDir, `download_${uuidv4()}${fileExt}`);
    
    console.log(`Downloading from URL: ${url}`);
    
    // Download the file from the URL
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    
    // Get the file buffer
    const fileBuffer = await response.arrayBuffer();
    
    // Write to temp file
    fs.writeFileSync(tempFilePath, Buffer.from(fileBuffer));
    
    console.log(`Downloaded file to: ${tempFilePath}`);
    return tempFilePath;
  } catch (error) {
    console.error('Error downloading from URL:', error);
    throw error;
  }
}

// Helper function to determine file extension from URL for Fal AI files
function determineExtensionFromUrl(url: string): string {
  // Check if it's a Fal AI URL 
  if (url.includes('fal.media/files/')) {
    // Fal AI images are JPG
    return '.jpg';
  }
  
  // Default to jpg for images if no extension is found
  return '.jpg';
}

// Helper to download file from S3 to local temp directory
export async function downloadFromS3(s3Url: string): Promise<string> {
  try {
    // Check if the URL is a Fal AI URL
    if (s3Url.includes('fal.media/files/')) {
      // Use direct download for Fal AI URLs
      return downloadFromURL(s3Url);
    }
    
    // Parse the S3 URL to extract bucket and key
    const urlPattern = /https:\/\/s3\.([\w-]+)\.amazonaws\.com\/([\w.-]+)\/(.*)/;
    const match = s3Url.match(urlPattern);
    
    if (!match) {
      // If not an S3 URL, try direct download
      return downloadFromURL(s3Url);
    }
    
    const region = match[1];
    const bucket = match[2];
    const key = match[3];
    
    console.log(`Downloading from S3: bucket=${bucket}, key=${key}`);
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'videogen');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate a temp file path
    const tempFilePath = path.join(tempDir, `${uuidv4()}_${path.basename(key)}`);
    
    // Download the file from S3
    const params = {
      Bucket: bucket,
      Key: key,
    };
    
    const { Body } = await s3Client.send(new GetObjectCommand(params));
    
    if (!Body) {
      throw new Error(`Failed to get S3 object: ${s3Url}`);
    }
    
    // Create a write stream to the temp file
    const writeStream = fs.createWriteStream(tempFilePath);
    
    // Pipe the S3 object body to the write stream
    await new Promise<void>((resolve, reject) => {
      const readStream = Body as Readable;
      readStream.pipe(writeStream)
        .on('error', reject)
        .on('finish', resolve);
    });
    
    console.log(`Downloaded file to: ${tempFilePath}`);
    return tempFilePath;
  } catch (error) {
    console.error('Error downloading from S3:', error);
    throw error;
  }
}

// Helper to upload a file to S3 and return the URL
export async function uploadToS3(filePath: string, userId: string, type: string): Promise<string> {
  try {
    const fileName = `${userId}/${type}/${uuidv4()}${path.extname(filePath)}`;
    const fileContent = fs.readFileSync(filePath);
    
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME || "",
      Key: fileName,
      Body: fileContent,
      ContentType: type.includes('video') ? 'video/mp4' : 'image/jpeg'
    };
    
    await s3Client.send(new PutObjectCommand(params));
    
    // Generate and return the S3 URL
    const region = process.env.AWS_REGION || "us-west-1";
    const bucket = process.env.AWS_S3_BUCKET_NAME || "";
    const url = `https://s3.${region}.amazonaws.com/${bucket}/${fileName}`;
    
    console.log(`Uploaded file to S3: ${url}`);
    return url;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
}

// Clean up temporary files
export function cleanupTempFiles(filePaths: string[]): void {
  for (const file of filePaths) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`Deleted temporary file: ${file}`);
      }
    } catch (error) {
      console.error(`Error deleting file ${file}:`, error);
    }
  }
}

// Create a slideshow with images and audio
export async function createSlideshowVideo(
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
      
      // Create a simplified filter complex - USING PORTRAIT DIMENSIONS: 720x1280
      let filterComplex = '';
      
      // Process each image with scale and pad first
      imagePaths.forEach((_, i) => {
        filterComplex += `[${i}:v]scale=720:1280:force_original_aspect_ratio=decrease,` +
          `pad=720:1280:(ow-iw)/2:(oh-ih)/2[v${i}];`;
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
      
      console.log('FFmpeg portrait slideshow command:', ffmpegArgs.join(' '));
      
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
          console.log('\nFFmpeg portrait slideshow created successfully');
          resolve(outputPath);
        } else {
          console.error(`\nFFmpeg process exited with code ${code}`);
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });
    } catch (error) {
      console.error('Error creating portrait slideshow:', error);
      reject(error);
    }
  });
}

// Third, update the basic slideshow fallback function:

// Create a basic slideshow as a fallback option (in portrait mode)
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
      
      // Simple FFmpeg command using concat demuxer with portrait dimensions
      const ffmpegArgs = [
        '-y',                        // Overwrite output file
        '-f', 'concat',              // Use concat demuxer
        '-safe', '0',                // Allow unsafe file paths
        '-i', inputListPath,         // Input file list
        '-i', audioPath,             // Audio input
        '-filter_complex',           // Add filter for portrait mode scaling
        'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2',
        '-c:v', 'libx264',           // Video codec
        '-c:a', 'aac',               // Audio codec
        '-pix_fmt', 'yuv420p',       // Pixel format
        '-shortest',                 // End with shortest input
        outputPath                   // Output file
      ];
      
      console.log('FFmpeg basic portrait slideshow command:', ffmpegArgs.join(' '));
      
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
          console.log('\nFFmpeg basic portrait slideshow created successfully');
          resolve(outputPath);
        } else {
          console.error(`\nFFmpeg process exited with code ${code}`);
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg basic slideshow failed with code ${code}: ${stderr}`));
        }
      });
    } catch (error) {
      console.error('Error creating basic portrait slideshow:', error);
      reject(error);
    }
  });
}


// Create a video that starts with person speaking, then transitions to slideshow
// Updated createIntroToSlideshowVideo function for portrait mode
export async function createIntroToSlideshowVideo(
  personVideoPath: string,
  slideshowPath: string,
  outputPath: string,
  introSeconds: number = 5
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      // Get dimension and duration info for both videos
      const ffprobeArgs = [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration',
        '-of', 'json',
        personVideoPath
      ];
      
      const ffprobe = spawn('ffprobe', ffprobeArgs);
      let probeData = '';
      
      ffprobe.stdout.on('data', (data) => {
        probeData += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`FFprobe exited with code ${code}`));
        }
        
        try {
          // Parse probe data for person video
          const probe = JSON.parse(probeData);
          const personDuration = parseFloat(probe.streams[0].duration);
          const personWidth = parseInt(probe.streams[0].width, 10);
          const personHeight = parseInt(probe.streams[0].height, 10);
          
          console.log(`Person video dimensions: ${personWidth}x${personHeight}, duration: ${personDuration}s`);
          
          // Get slideshow dimensions
          const slideshowProbeArgs = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'json',
            slideshowPath
          ];
          
          const slideshowProbe = spawn('ffprobe', slideshowProbeArgs);
          let slideshowProbeData = '';
          
          slideshowProbe.stdout.on('data', (data) => {
            slideshowProbeData += data.toString();
          });
          
          slideshowProbe.on('close', (slideshowProbeCode) => {
            if (slideshowProbeCode !== 0) {
              return reject(new Error(`FFprobe for slideshow exited with code ${slideshowProbeCode}`));
            }
            
            try {
              // Parse slideshow dimensions
              const slideshowInfo = JSON.parse(slideshowProbeData);
              const slideshowWidth = parseInt(slideshowInfo.streams[0].width, 10);
              const slideshowHeight = parseInt(slideshowInfo.streams[0].height, 10);
              
              console.log(`Slideshow dimensions: ${slideshowWidth}x${slideshowHeight}`);
              
              // Ensure intro duration is not longer than person video
              const actualIntroSeconds = Math.min(introSeconds, personDuration);
              console.log(`Creating portrait intro-to-slideshow with ${actualIntroSeconds}s intro`);
              
              // Ensure both videos are portrait and same width/height
              const targetWidth = 720;  // Standard width for portrait video
              const targetHeight = 1280; // Standard height for portrait (9:16 aspect ratio)
              
              // First create scaled versions of both videos to ensure they have identical dimensions
              const tempDir = path.dirname(outputPath);
              
              // Create scaled intro clip (first N seconds of person video)
              const scaledIntroPath = path.join(tempDir, `scaled_intro_${uuidv4()}.mp4`);
              const introCmdArgs = [
                '-y',
                '-i', personVideoPath,
                '-ss', '0',
                '-t', `${actualIntroSeconds}`,
                '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                scaledIntroPath
              ];
              
              console.log('Creating scaled portrait intro segment...');
              const introProcess = spawn('ffmpeg', introCmdArgs);
              
              let introStderr = '';
              introProcess.stderr.on('data', (data) => {
                introStderr += data.toString();
              });
              
              introProcess.on('close', (introCode) => {
                if (introCode !== 0) {
                  console.error('Error creating intro segment:', introStderr);
                  reject(new Error('Failed to create scaled intro segment'));
                  return;
                }
                
                // Create scaled remaining portion of slideshow
                const scaledRemainingPath = path.join(tempDir, `scaled_remaining_${uuidv4()}.mp4`);
                const remainingCmdArgs = [
                  '-y',
                  '-i', slideshowPath,
                  '-ss', `${actualIntroSeconds}`,
                  '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`,
                  '-c:v', 'libx264',
                  '-c:a', 'aac',
                  scaledRemainingPath
                ];
                
                console.log('Creating scaled portrait slideshow segment...');
                const remainingProcess = spawn('ffmpeg', remainingCmdArgs);
                
                let remainingStderr = '';
                remainingProcess.stderr.on('data', (data) => {
                  remainingStderr += data.toString();
                });
                
                remainingProcess.on('close', (remainingCode) => {
                  if (remainingCode !== 0) {
                    // Clean up
                    try { fs.unlinkSync(scaledIntroPath); } catch (e) {}
                    console.error('Error creating remaining segment:', remainingStderr);
                    reject(new Error('Failed to create scaled slideshow segment'));
                    return;
                  }
                  
                  // Now the simplest method that works reliably is to create a concat list
                  const concatListPath = path.join(tempDir, `concat_list_${uuidv4()}.txt`);
                  fs.writeFileSync(concatListPath, 
                    `file '${scaledIntroPath}'\n` +
                    `file '${scaledRemainingPath}'`
                  );
                  
                  // Simple concat approach - most reliable for consistent dimensions
                  const concatArgs = [
                    '-y',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', concatListPath,
                    '-c', 'copy',  // Just copy the streams, no re-encoding
                    outputPath
                  ];
                  
                  console.log('Creating final portrait video by concat...');
                  const concatProcess = spawn('ffmpeg', concatArgs);
                  
                  let concatStderr = '';
                  concatProcess.stderr.on('data', (data) => {
                    concatStderr += data.toString();
                  });
                  
                  concatProcess.on('close', (concatCode) => {
                    // Clean up temporary files
                    try {
                      fs.unlinkSync(scaledIntroPath);
                      fs.unlinkSync(scaledRemainingPath);
                      fs.unlinkSync(concatListPath);
                    } catch (e) {
                      console.error('Error deleting temp files:', e);
                    }
                    
                    if (concatCode === 0) {
                      console.log('Successfully created portrait intro-to-slideshow video');
                      resolve(outputPath);
                    } else {
                      console.error('Error concatenating videos:', concatStderr);
                      reject(new Error('Failed to concatenate videos'));
                    }
                  });
                });
              });
            } catch (error) {
              reject(error);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      console.error('Error in createIntroToSlideshowVideo:', error);
      reject(error);
    }
  });
}