// app/lib/ffmpeg-utils.ts
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

// Create a slideshow video with Ken Burns effect from images
export async function createSlideshowVideo(
  imagePaths: string[],
  outputPath: string,
  fps: number = 30,
  transitionDuration: number = 1,
  displayDuration: number = 3,
  zoomFactor: number = 1.1
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (imagePaths.length === 0) {
      reject(new Error('No images provided for slideshow'));
      return;
    }
    
    // Create a temporary filter complex script
    const filterComplex = imagePaths.map((_, i) => {
      // For each image, create a zooming/panning effect
      const startZoom = 1;
      const endZoom = zoomFactor;
      const zoomDirection = i % 4; // Alternate between 4 different zoom directions
      
      // Determine zoom and pan parameters based on direction
      let xStartStr: string = '0', yStartStr: string = '0';
      
      switch (zoomDirection) {
        case 0: // Zoom in from center
          xStartStr = `(iw-iw*${startZoom})/2`;
          yStartStr = `(ih-ih*${startZoom})/2`;
          break;
        case 1: // Zoom in from top left
          xStartStr = '0';
          yStartStr = '0';
          break;
        case 2: // Zoom in from top right
          xStartStr = `(iw-iw*${startZoom})`;
          yStartStr = '0';
          break;
        case 3: // Zoom in from bottom
          xStartStr = `(iw-iw*${startZoom})/2`;
          yStartStr = `(ih-ih*${startZoom})`;
          break;
      }
      
      const duration = displayDuration;
      
      // Fix the zoompan parameter formatting
      // Note: Using backticks for the outer string, but single quotes for the z expression
      return `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0015,${endZoom})':x=${xStartStr}:y=${yStartStr}:d=${duration*fps},trim=duration=${duration},fade=t=out:st=${duration-transitionDuration}:d=${transitionDuration}[v${i}];`;
    }).join('');
    
    // Concatenate all the video segments
    const concatStr = imagePaths.map((_, i) => `[v${i}]`).join('');
    const lastFilter = `${concatStr}concat=n=${imagePaths.length}:v=1:a=0,format=yuv420p[v]`;
    
    // Build the full filter complex
    const fullFilterComplex = `${filterComplex}${lastFilter}`;
    
    // Create a temporary file for the filter complex
    const filterScriptPath = path.join(os.tmpdir(), `filter_${uuidv4()}.txt`);
    fs.writeFileSync(filterScriptPath, fullFilterComplex);
    
    // Build ffmpeg command
    const ffmpegArgs: string[] = [
      '-y', // Overwrite output file if it exists
    ];
    
    // Add input files
    imagePaths.forEach(imagePath => {
      ffmpegArgs.push('-loop', '1', '-t', displayDuration.toString(), '-i', imagePath);
    });
    
    // Add filter complex and output settings
    ffmpegArgs.push(
      '-filter_complex_script', filterScriptPath,
      '-map', '[v]',
      '-c:v', 'libx264',
      '-r', fps.toString(),
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '23',
      outputPath
    );
    
    console.log('Executing FFMPEG with args:', ffmpegArgs.join(' '));
    
    // Spawn ffmpeg process
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    let stdout = '';
    let stderr = '';
    
    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('error', (error) => {
      console.error('FFMPEG process error:', error);
      reject(error);
    });
    
    ffmpeg.on('close', (code) => {
      // Clean up the filter script
      try {
        fs.unlinkSync(filterScriptPath);
      } catch (err) {
        console.error('Error deleting filter script:', err);
      }
      
      if (code === 0) {
        console.log('FFMPEG process completed successfully');
        resolve(outputPath);
      } else {
        console.error(`FFMPEG process exited with code ${code}`);
        console.error('STDERR:', stderr);
        reject(new Error(`FFMPEG exited with code ${code}: ${stderr}`));
      }
    });
  });
}

// Define a type for pip position
export type PipPosition = 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';

// Merge main video with broll (picture-in-picture)
export async function mergeVideos(
  mainVideoPath: string,
  brollVideoPath: string,
  outputPath: string,
  pipPosition: PipPosition = 'bottom_right',
  pipSize: number = 0.3
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Calculate PIP position coordinates
    let x: string, y: string;
    switch (pipPosition) {
      case 'bottom_right':
        x = `main_w-overlay_w-10`;
        y = `main_h-overlay_h-10`;
        break;
      case 'bottom_left':
        x = '10';
        y = `main_h-overlay_h-10`;
        break;
      case 'top_right':
        x = `main_w-overlay_w-10`;
        y = '10';
        break;
      case 'top_left':
        x = '10';
        y = '10';
        break;
    }
    
    // Build the filter complex for picture-in-picture
    const filterComplex = `[0:v]setpts=PTS-STARTPTS[main];[1:v]setpts=PTS-STARTPTS,scale=iw*${pipSize}:ih*${pipSize}[pip];[main][pip]overlay=${x}:${y}:enable='between(t,0,999999)'[v]`;
    
    // Build ffmpeg command
    const ffmpegArgs: string[] = [
      '-y', // Overwrite output file if it exists
      '-i', mainVideoPath, // Main video
      '-i', brollVideoPath, // B-roll video
      '-filter_complex', filterComplex,
      '-map', '[v]', // Map the output video
      '-map', '0:a', // Use audio from the main video
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'medium',
      '-crf', '23',
      outputPath
    ];
    
    console.log('Executing FFMPEG for video merge with args:', ffmpegArgs.join(' '));
    
    // Spawn ffmpeg process
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    let stdout = '';
    let stderr = '';
    
    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('error', (error) => {
      console.error('FFMPEG process error:', error);
      reject(error);
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('FFMPEG video merge completed successfully');
        resolve(outputPath);
      } else {
        console.error(`FFMPEG video merge exited with code ${code}`);
        console.error('STDERR:', stderr);
        reject(new Error(`FFMPEG exited with code ${code}: ${stderr}`));
      }
    });
  });
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

// Enhanced portrait video merge function for ffmpeg-utils.ts

// Merge main video with broll (portrait format with broll as background)
// Fixed portrait video merge function for ffmpeg-utils.ts

// Merge main video with broll (portrait format with broll as background)
// Split-screen portrait video merge function for ffmpeg-utils.ts

// Merge main video with broll (portrait format with split screen)
// Improved split-screen portrait video merge function for ffmpeg-utils.ts

// Merge main video with broll (portrait format with split screen)
export async function mergePortraitVideo(
    personVideoPath: string,
    brollVideoPath: string,
    outputPath: string,
    personSize: number = 1.0, // Default to fill the bottom half completely
    personPosition: 'bottom' | 'bottom_left' | 'bottom_right' = 'bottom'
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Get video duration and dimensions first
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
          // Parse probe data
          const probe = JSON.parse(probeData);
          const personDuration = parseFloat(probe.streams[0].duration);
          const personWidth = parseInt(probe.streams[0].width, 10);
          const personHeight = parseInt(probe.streams[0].height, 10);
          
          // For portrait mode with split screen
          const outputWidth = 1080;
          const outputHeight = 1920;
          
          // Calculate dimensions for the split screen
          // Top half for broll, bottom half for person
          const halfHeight = outputHeight / 2;
          
          // Calculate person video size to fill bottom half horizontally
          // and maintain aspect ratio
          const personOutputWidth = outputWidth;
          const personOutputHeight = Math.round(personOutputWidth * personHeight / personWidth);
          
          // Crop person video if it's too tall for the bottom half
          let yOffset = 0;
          let cropCommand = '';
          
          if (personOutputHeight > halfHeight) {
            // Person video is taller than the bottom half, so crop it
            // Calculate how much to crop from top and bottom equally
            const cropAmount = personOutputHeight - halfHeight;
            const topCrop = Math.round(cropAmount / 2);
            
            // Add crop filter
            cropCommand = `,crop=${personOutputWidth}:${halfHeight}:0:${topCrop}`;
          } else {
            // Center vertically in bottom half if smaller
            yOffset = Math.round((halfHeight - personOutputHeight) / 2);
          }
          
          // Position person video in bottom half
          let xPosition = 0; // Default to full width
          
          if (personSize < 1.0) {
            // If person size is less than 1.0, scale it down and position accordingly
            const scaledWidth = Math.round(outputWidth * personSize);
            const scaledHeight = Math.round(scaledWidth * personHeight / personWidth);
            
            switch (personPosition) {
              case 'bottom_left':
                xPosition = 0;
                break;
              case 'bottom_right':
                xPosition = outputWidth - scaledWidth;
                break;
              case 'bottom':
              default:
                // Center horizontally
                xPosition = Math.round((outputWidth - scaledWidth) / 2);
                break;
            }
          }
          
          // Create filter complex - using a simpler approach that's more compatible
          const filterComplex = [
            // Create black background for the whole frame
            `color=black:s=${outputWidth}x${outputHeight}:r=30[base]`,
            
            // For the broll, we'll directly scale each image and create a sequence
            // This avoids zoompan filter which can be problematic in some ffmpeg versions
            `[1:v]scale=${outputWidth}:${halfHeight}:force_original_aspect_ratio=increase,` +
            `crop=${outputWidth}:${halfHeight}:(in_w-out_w)/2:(in_h-out_h)/2,setpts=PTS-STARTPTS[broll]`,
            
            // Scale person video for bottom half (and crop if needed)
            `[0:v]scale=${personOutputWidth}:${personOutputHeight}${cropCommand},setpts=PTS-STARTPTS[person]`,
            
            // Overlay broll on top half of base
            `[base][broll]overlay=0:0[withbroll]`,
            
            // Overlay person video on bottom half
            `[withbroll][person]overlay=${xPosition}:${halfHeight + yOffset}[v]`
          ].join(';');
          
          // Build ffmpeg command
          const ffmpegArgs = [
            '-y', // Overwrite output file if it exists
            
            // Input files
            '-i', personVideoPath, // Person video
            '-i', brollVideoPath,  // Broll video
            
            // Complex filter
            '-filter_complex', filterComplex,
            
            // Map video and audio streams
            '-map', '[v]',      // Use the output of our filter complex
            '-map', '0:a',      // Use audio from the person video
            
            // Set duration to match person video
            '-t', personDuration.toString(),
            
            // Output settings
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast', // Use fast preset for quicker encoding
            '-crf', '23',
            outputPath
          ];
          
          console.log('Executing FFMPEG for improved split-screen video merge with args:', ffmpegArgs.join(' '));
          
          // Spawn ffmpeg process
          const ffmpeg = spawn('ffmpeg', ffmpegArgs);
          
          let stderr = '';
          
          ffmpeg.stderr.on('data', (data) => {
            const line = data.toString();
            stderr += line;
            // Log progress
            if (line.includes('time=') || line.includes('frame=')) {
              process.stdout.write(`\rFFMPEG: ${line.trim()}`);
            }
          });
          
          ffmpeg.on('error', (error) => {
            console.error('FFMPEG process error:', error);
            reject(error);
          });
          
          ffmpeg.on('close', (code) => {
            if (code === 0) {
              console.log('\nFFMPEG split-screen video merge completed successfully');
              resolve(outputPath);
            } else {
              console.error(`\nFFMPEG split-screen video merge exited with code ${code}`);
              console.error('STDERR:', stderr);
              
              // Try an even simpler approach as a last resort
              const lastResortFilter = [
                // Create black background
                `color=black:s=${outputWidth}x${outputHeight}:r=30[base]`,
                
                // Scale broll for top half
                `[1:v]scale=${outputWidth}:${halfHeight},setpts=PTS-STARTPTS[broll]`,
                
                // Scale person video
                `[0:v]scale=${outputWidth}:${halfHeight},setpts=PTS-STARTPTS[person]`,
                
                // Place broll on top
                `[base][broll]overlay=0:0[top]`,
                
                // Place person on bottom
                `[top][person]overlay=0:${halfHeight}[v]`
              ].join(';');
              
              const simpleArgs = [
                '-y',
                '-i', personVideoPath,
                '-i', brollVideoPath,
                '-filter_complex', lastResortFilter,
                '-map', '[v]',
                '-map', '0:a',
                '-t', personDuration.toString(),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'fast',
                '-crf', '23',
                outputPath
              ];
              
              console.log('Trying last resort approach...');
              const lastResort = spawn('ffmpeg', simpleArgs);
              
              let lastResortErr = '';
              
              lastResort.stderr.on('data', (data) => {
                lastResortErr += data.toString();
              });
              
              lastResort.on('close', (code2) => {
                if (code2 === 0) {
                  console.log('Last resort approach succeeded!');
                  resolve(outputPath);
                } else {
                  reject(new Error(`FFMPEG failed with both approaches. Last error: ${lastResortErr}`));
                }
              });
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Create a slideshow with smooth transitions and Ken Burns effect
// Create a simplified slideshow with Ken Burns effect
async function createEnhancedSlideshow(
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
      
      // Create a simplified filter complex
      let filterComplex = '';
      
      // Process each image with scale and pad first
      imagePaths.forEach((_, i) => {
        filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
          `pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v${i}];`;
      });
      
      // Create segments with the correct durations
      const segments : string[]= [];
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
      
      console.log('FFmpeg simplified slideshow command:', ffmpegArgs.join(' '));
      
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
          console.log('\nFFmpeg slideshow created successfully');
          resolve(outputPath);
        } else {
          console.error(`\nFFmpeg process exited with code ${code}`);
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });
    } catch (error) {
      console.error('Error creating enhanced slideshow:', error);
      reject(error);
    }
  });
}

// Create a basic slideshow as a fallback option
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
      
      // Simple FFmpeg command using concat demuxer
      const ffmpegArgs = [
        '-y',                        // Overwrite output file
        '-f', 'concat',              // Use concat demuxer
        '-safe', '0',                // Allow unsafe file paths
        '-i', inputListPath,         // Input file list
        '-i', audioPath,             // Audio input
        '-c:v', 'libx264',           // Video codec
        '-c:a', 'aac',               // Audio codec
        '-pix_fmt', 'yuv420p',       // Pixel format
        '-shortest',                 // End with shortest input
        outputPath                   // Output file
      ];
      
      console.log('FFmpeg basic slideshow command:', ffmpegArgs.join(' '));
      
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
          console.log('\nFFmpeg basic slideshow created successfully');
          resolve(outputPath);
        } else {
          console.error(`\nFFmpeg process exited with code ${code}`);
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg basic slideshow failed with code ${code}: ${stderr}`));
        }
      });
    } catch (error) {
      console.error('Error creating basic slideshow:', error);
      reject(error);
    }
  });
}

// Function to merge slideshow and person video into a split-screen format
export async function createSplitScreenVideo(
  slideshowPath: string,
  personVideoPath: string,
  outputPath: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      // Build FFmpeg command for split-screen merge
      const ffmpegArgs = [
        '-y',                                 // Overwrite output file if it exists
        '-i', slideshowPath,                  // Slideshow input (with Ken Burns effect)
        '-i', personVideoPath,                // Person video input (lip-synced)
        '-filter_complex',                    // Start complex filtergraph
        // Create a 16:9 split-screen video with images on top and person on bottom
        `[0:v]scale=1920:1080,setsar=1[top];` +  // Scale slideshow to 1920x1080
        `[1:v]scale=1920:1080,setsar=1[bottom];` + // Scale person video to 1920x1080
        // Stack the videos vertically (top 50%, bottom 50%)
        `[top][bottom]vstack=inputs=2[v]`,
        '-map', '[v]',                       // Map combined video
        '-map', '0:a',                       // Use audio from slideshow (which has the full audio)
        '-c:v', 'libx264',                   // Video codec
        '-c:a', 'aac',                       // Audio codec
        '-preset', 'medium',                  // Encoding preset
        '-crf', '23',                         // Quality level
        '-shortest',                          // End when shortest input ends
        outputPath                            // Output file
      ];
      
      console.log('FFmpeg split-screen command:', ffmpegArgs.join(' '));
      
      // Execute the FFmpeg command
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress
        process.stdout.write(`\rFFmpeg Merge: ${data.toString().trim()}`);
      });
      
      ffmpeg.on('error', (error) => {
        console.error('\nFFmpeg merge error:', error);
        reject(error);
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('\nFFmpeg split-screen merge completed successfully');
          resolve(outputPath);
        } else {
          console.error(`\nFFmpeg merge exited with code ${code}`);
          console.error('FFmpeg merge stderr:', stderr);
          reject(new Error(`FFmpeg merge exited with code ${code}`));
        }
      });
    } catch (error) {
      console.error('Error creating split-screen video:', error);
      reject(error);
    }
  });
}