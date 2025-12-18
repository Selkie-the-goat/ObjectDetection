import { GoogleGenAI, LiveSession, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, base64ToUint8Array, decodeAudioData, arrayBufferToBase64 } from '../utils/audioUtils';

// Types
export interface LiveConfig {
  onAudioData: (buffer: AudioBuffer) => void;
  onTranscription: (text: string, isUser: boolean) => void;
  onClose: () => void;
  onError: (error: Error) => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<LiveSession> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private currentStream: MediaStream | null = null;
  private frameIntervalId: number | null = null;
  
  // Output Audio Queue
  private nextStartTime = 0;
  private audioSources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  public async connect(config: LiveConfig) {
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    // Resume contexts if suspended (browser policy)
    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

    this.sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: `You are VisionGuide, an intelligent assistant for visually impaired users. 
        Your tasks:
        1. Continuously monitor the video feed.
        2. IMMEDIATELY WARN the user of obstacles, hazards (stairs, cars, holes), or people in front.
        3. Be concise, clear, and reassuring. 
        4. If asked, read text or describe the scene in detail.
        5. Provide navigation hints if the user asks (e.g., "Where is the door?").`,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: async () => {
          console.log("Gemini Live Session Opened");
          await this.startAudioStream();
        },
        onmessage: async (message: LiveServerMessage) => {
          this.handleMessage(message, config);
        },
        onclose: () => {
          console.log("Gemini Live Session Closed");
          config.onClose();
        },
        onerror: (err) => {
          console.error("Gemini Live Error:", err);
          config.onError(new Error("Connection error"));
        }
      }
    });

    return this.sessionPromise;
  }

  private async startAudioStream() {
    try {
      this.currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.inputAudioContext) return;

      this.inputSource = this.inputAudioContext.createMediaStreamSource(this.currentStream);
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData);
        
        this.sessionPromise?.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      this.inputSource.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      throw error;
    }
  }

  private async handleMessage(message: LiveServerMessage, config: LiveConfig) {
    // 1. Handle Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.outputAudioContext) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      
      const audioBytes = base64ToUint8Array(audioData);
      const audioBuffer = await decodeAudioData(audioBytes, this.outputAudioContext);
      
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      
      this.audioSources.add(source);
      source.onended = () => this.audioSources.delete(source);
      
      config.onAudioData(audioBuffer); // Optional visualization
    }

    // 2. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.stopAudioOutput();
    }

    // 3. Handle Transcription
    if (message.serverContent?.outputTranscription?.text) {
        config.onTranscription(message.serverContent.outputTranscription.text, false);
    }
    if (message.serverContent?.inputTranscription?.text) {
        config.onTranscription(message.serverContent.inputTranscription.text, true);
    }
  }

  private stopAudioOutput() {
    this.audioSources.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    this.audioSources.clear();
    if (this.outputAudioContext) {
        this.nextStartTime = this.outputAudioContext.currentTime;
    }
  }

  public sendVideoFrame(base64Image: string) {
    this.sessionPromise?.then(session => {
      session.sendRealtimeInput({
        media: {
          mimeType: 'image/jpeg',
          data: base64Image
        }
      });
    });
  }

  public async disconnect() {
    if (this.processor && this.inputSource) {
      this.inputSource.disconnect();
      this.processor.disconnect();
    }
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
    }
    if (this.inputAudioContext) {
      await this.inputAudioContext.close();
    }
    if (this.outputAudioContext) {
      await this.outputAudioContext.close();
    }
    
    // Clean up session (the SDK doesn't expose a direct close on the session object easily in all versions, 
    // but stopping stream usually triggers backend close or we can let it timeout/close manually if supported)
    // There is no explicit .close() on LiveSession in the types provided in prompt, 
    // but the WebSocket usually closes when object is destroyed or effectively abandoned/garbage collected.
    // However, the prompt mentions `session.close()` in "Live API Rules".
    this.sessionPromise?.then(session => {
        // @ts-ignore - Assuming close exists based on prompt guidance
        if (typeof session.close === 'function') {
            // @ts-ignore
            session.close();
        }
    });

    this.sessionPromise = null;
    this.nextStartTime = 0;
  }
}

export const geminiLive = new GeminiLiveService();