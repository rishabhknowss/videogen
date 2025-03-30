// app/lib/assemblyai.ts
import { default as axios } from 'axios';

// Define interfaces for AssemblyAI response
export interface WordTimestamp {
  text: string;
  start: number; // Start time in milliseconds
  end: number;   // End time in milliseconds
  confidence: number;
}

export interface UtteranceTimestamp {
  text: string;
  start: number;
  end: number;
  words: WordTimestamp[];
}

export interface TranscriptResult {
  text: string;
  words: WordTimestamp[];
  utterances?: UtteranceTimestamp[];
  audio_duration: number;
}

/**
 * Submit audio to AssemblyAI for transcription with word-level timestamps
 * @param audioUrl URL of the audio file to transcribe
 * @returns Transcript with word-level timestamps
 */
export async function getTranscriptWithTimestamps(audioUrl: string): Promise<TranscriptResult> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not set in environment variables');
  }
  
  // Submit transcription request
  console.log(`Submitting audio URL to AssemblyAI: ${audioUrl}`);
  const headers = {
    'Authorization': apiKey,
    'Content-Type': 'application/json'
  };
  
  try {
    // Step 1: Submit the audio file to AssemblyAI
    const submitResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: audioUrl,
        word_boost: [],
        boost_param: "high",
        speaker_labels: true,
        auto_chapters: true,
        entity_detection: true,
        auto_highlights: true,
      },
      { headers }
    );
    
    const transcriptId = submitResponse.data.id;
    console.log(`Transcription job submitted with ID: ${transcriptId}`);
    
    // Step 2: Poll for the transcription result
    let result = null;
    while (true) {
      const pollingResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers }
      );
      
      const transcriptionResult = pollingResponse.data;
      
      if (transcriptionResult.status === 'completed') {
        console.log('Transcription completed successfully');
        result = transcriptionResult;
        break;
      } else if (transcriptionResult.status === 'error') {
        throw new Error(`Transcription failed: ${transcriptionResult.error}`);
      } else {
        console.log(`Transcription status: ${transcriptionResult.status}, waiting...`);
        // Wait for 3 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    return {
      text: result.text,
      words: result.words,
      utterances: result.utterances,
      audio_duration: result.audio_duration
    };
    
  } catch (error) {
    console.error('Error in AssemblyAI transcription:', error);
    if (error instanceof Error) {
      throw new Error(`AssemblyAI transcription failed: ${error.message}`);
    } else {
      throw new Error('AssemblyAI transcription failed with an unknown error');
    }
  }
}

/**
 * Group words into scenes based on a target duration
 * @param words Array of word timestamps
 * @param targetDuration Target duration for each scene in seconds
 * @returns Array of scenes with start and end times
 */
export function groupWordsIntoScenes(
  words: WordTimestamp[], 
  imagePrompts: string[],
  audioDuration: number
): { start: number; end: number; imagePrompt: string }[] {
 
  if (!words.length || !imagePrompts.length) {
    return [];
  }
  
  const scenes = [];
  const totalDuration = audioDuration * 1000;
  const sceneCount = imagePrompts.length;
  
  
  const targetDurationPerScene = totalDuration / sceneCount;
  
  let currentSceneStart = words[0].start;
  let currentWordIndex = 0;
  let currentSceneIndex = 0;
  
  while (currentWordIndex < words.length && currentSceneIndex < imagePrompts.length) {
    
    const targetEndTime = currentSceneStart + targetDurationPerScene;
    
    
    let bestMatchIndex = currentWordIndex;
    while (
      bestMatchIndex + 1 < words.length && 
      words[bestMatchIndex + 1].start < targetEndTime
    ) {
      bestMatchIndex++;
    }
    
   
    scenes.push({
      start: currentSceneStart,
      end: words[bestMatchIndex].end,
      imagePrompt: imagePrompts[currentSceneIndex]
    });
    
    
    currentSceneStart = words[bestMatchIndex].end;
    currentWordIndex = bestMatchIndex + 1;
    currentSceneIndex++;
  }
  
 
  if (currentSceneIndex < imagePrompts.length) {
    const lastEndTime = scenes.length > 0 ? scenes[scenes.length - 1].end : 0;
    const remainingTime = totalDuration - lastEndTime;
    const remainingScenes = imagePrompts.length - currentSceneIndex;
    
    if (remainingTime > 0 && remainingScenes > 0) {
      const durationPerRemainingScene = remainingTime / remainingScenes;
      
      for (let i = 0; i < remainingScenes; i++) {
        const sceneStart = lastEndTime + (i * durationPerRemainingScene);
        const sceneEnd = sceneStart + durationPerRemainingScene;
        
        scenes.push({
          start: sceneStart,
          end: sceneEnd,
          imagePrompt: imagePrompts[currentSceneIndex + i]
        });
      }
    }
  }
  
  return scenes;
}