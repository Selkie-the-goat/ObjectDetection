import React, { useState, useRef, useEffect, useCallback } from 'react';
import { geminiLive } from './services/geminiLive';
import { Navigation } from './components/Navigation';
import { Eye, Mic, Map as MapIcon, Video as VideoIcon, Power, Clock } from 'lucide-react';

enum AppMode {
  IDLE,
  LIVE,
  NAVIGATION
}

const DEMO_SESSION_LIMIT = 180; // 3 minutes in seconds

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.IDLE);
  const [status, setStatus] = useState<string>("Ready");
  const [transcriptions, setTranscriptions] = useState<{ text: string; isUser: boolean }[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // Auto-scroll transcriptions
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptions]);

  // Session Timer Logic
  useEffect(() => {
    if (isConnected && timeLeft > 0) {
        timerRef.current = window.setTimeout(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);
    } else if (isConnected && timeLeft === 0) {
        // Time up
        stopLiveSession();
        setStatus("Demo Session Timed Out");
    }
    return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isConnected, timeLeft]);

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startLiveSession = async () => {
    setMode(AppMode.LIVE);
    setStatus("Initializing Camera & AI...");
    setTranscriptions([]);
    setTimeLeft(DEMO_SESSION_LIMIT);
    
    try {
      // 1. Setup Camera
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // 2. Connect to Gemini Live
      await geminiLive.connect({
        onAudioData: () => {
          // Can implement visualizer here
        },
        onTranscription: (text, isUser) => {
          setTranscriptions(prev => [...prev.slice(-4), { text, isUser }]); // Keep last 5
        },
        onClose: () => {
          setIsConnected(false);
          setStatus("Disconnected");
          stopLiveSession();
        },
        onError: (e) => {
          setStatus(`Error: ${e.message}`);
          setIsConnected(false);
          stopLiveSession();
        }
      });

      setIsConnected(true);
      setStatus("Monitoring Environment");

      // 3. Start Video Streaming Loop (1 FPS to save bandwidth but frequent enough for warnings)
      intervalRef.current = window.setInterval(() => {
        captureAndSendFrame();
      }, 1000);

    } catch (err) {
      console.error(err);
      setStatus("Failed to start. Check permissions.");
      setMode(AppMode.IDLE);
    }
  };

  const stopLiveSession = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    
    await geminiLive.disconnect();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    
    setIsConnected(false);
    setMode(AppMode.IDLE);
    // Don't reset status immediately if it was set by error/timeout logic
    if (status === "Monitoring Environment") {
        setStatus("Ready");
    }
  }, [status]);

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Low quality JPEG for speed
    const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
    geminiLive.sendVideoFrame(base64);
  };

  // Views
  if (mode === AppMode.NAVIGATION) {
    return <Navigation onClose={() => setMode(AppMode.IDLE)} />;
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white relative">
      {/* Hidden processing elements */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        
        {/* Header / Status Bar */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="font-mono text-sm font-bold tracking-wider uppercase text-yellow-400">
                        {status}
                    </span>
                </div>
                {isConnected && (
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1 rounded-full backdrop-blur border border-slate-600">
                            <Clock size={16} className={timeLeft < 30 ? "text-red-500 animate-pulse" : "text-white"} />
                            <span className={`font-mono font-bold ${timeLeft < 30 ? "text-red-500" : "text-white"}`}>
                                {formatTime(timeLeft)}
                            </span>
                        </div>
                        <button onClick={stopLiveSession} className="bg-red-600/80 p-2 rounded-full backdrop-blur-md">
                            <Power size={20} />
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* Video Viewport or Idle Placeholder */}
        {mode === AppMode.LIVE ? (
            <div className="flex-1 relative bg-black flex items-center justify-center">
                 {/* Video is full cover */}
                 <video 
                    ref={videoRef} 
                    className="w-full h-full object-cover opacity-80" 
                    autoPlay 
                    playsInline 
                    muted 
                 />
                 
                 {/* Overlay HUD */}
                 <div className="absolute inset-0 pointer-events-none border-[12px] border-slate-900/30"></div>
                 <div className="absolute bottom-32 left-0 right-0 p-6 flex flex-col items-center justify-end z-10 gap-2">
                    {transcriptions.length > 0 && (
                        <div 
                            ref={scrollRef}
                            className="w-full max-h-48 overflow-y-auto flex flex-col gap-2 mask-gradient-top"
                        >
                            {transcriptions.map((t, i) => (
                                <div 
                                    key={i} 
                                    className={`p-3 rounded-xl max-w-[85%] backdrop-blur-md border ${
                                        t.isUser 
                                        ? 'self-end bg-blue-600/40 border-blue-400/50 text-right' 
                                        : 'self-start bg-slate-800/60 border-yellow-400/50 text-yellow-100'
                                    }`}
                                >
                                    <p className="text-lg font-medium leading-snug high-contrast-text">
                                        {t.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                 </div>
            </div>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-12 bg-slate-900">
                <div className="text-center space-y-4">
                    <div className="inline-block p-6 rounded-full bg-slate-800 border-4 border-yellow-500 mb-4 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                        <Eye size={64} className="text-yellow-500" />
                    </div>
                    <h1 className="text-5xl font-black text-white tracking-tighter">
                        VISION<span className="text-yellow-500">GUIDE</span>
                    </h1>
                    <p className="text-slate-400 text-xl max-w-md mx-auto">
                        Your AI-powered assistant for navigation and object detection.
                    </p>
                    {status === "Demo Session Timed Out" && (
                         <div className="bg-red-900/50 text-red-200 px-4 py-2 rounded-lg border border-red-700/50 inline-block animate-bounce">
                             Demo Session Ended (Quota Saver)
                         </div>
                    )}
                </div>

                <div className="w-full max-w-sm grid grid-cols-1 gap-6">
                    <button 
                        onClick={startLiveSession}
                        className="group relative flex items-center justify-center gap-4 bg-yellow-500 text-slate-950 p-6 rounded-2xl shadow-xl hover:bg-yellow-400 hover:scale-[1.02] transition-all duration-200"
                    >
                        <div className="absolute inset-0 bg-white/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <VideoIcon size={32} />
                        <span className="text-2xl font-black uppercase tracking-wide">
                            {status === "Demo Session Timed Out" ? "Resume Session" : "Start Assistant"}
                        </span>
                    </button>

                    <button 
                        onClick={() => setMode(AppMode.NAVIGATION)}
                        className="group flex items-center justify-center gap-4 bg-slate-800 text-white p-6 rounded-2xl border-2 border-slate-700 shadow-xl hover:border-yellow-500 hover:bg-slate-750 transition-all duration-200"
                    >
                        <MapIcon size={32} className="text-slate-300 group-hover:text-yellow-500 transition-colors" />
                        <span className="text-2xl font-bold uppercase tracking-wide">Plan Route</span>
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Bottom Controls (Only visible in LIVE mode for interaction) */}
      {mode === AppMode.LIVE && (
          <div className="bg-slate-900 p-6 pb-8 border-t border-slate-800 flex items-center justify-center gap-8">
             <div className="flex items-center gap-2 text-slate-400">
                <Mic size={24} className={isConnected ? "text-green-500 animate-pulse" : "text-slate-600"} />
                <span className="font-semibold text-sm">Listening...</span>
             </div>
             
             {/* Visualizer placeholder lines */}
             <div className="flex gap-1 h-8 items-center">
                {[...Array(5)].map((_, i) => (
                    <div 
                        key={i} 
                        className="w-1.5 bg-yellow-500 rounded-full animate-pulse" 
                        style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }} 
                    />
                ))}
             </div>
          </div>
      )}
    </div>
  );
};

export default App;