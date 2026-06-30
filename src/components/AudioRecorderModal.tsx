import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square, Play, Pause, RotateCcw, Check, X, AlertCircle } from "lucide-react";

interface AudioRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (file: File) => void;
}

type RecordingState = "idle" | "recording" | "preview";

export default function AudioRecorderModal({ isOpen, onClose, onSave }: AudioRecorderModalProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [timer, setTimer] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Maximum recording time in seconds (1 minute)
  const MAX_RECORDING_TIME = 60;

  // Format timer as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Cleanup helper
  const cleanupRecordingResources = () => {
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    
    // Clear recording timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Stop canvas animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close Web Audio Context
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Handle closing modal
  const handleClose = () => {
    cleanupRecordingResources();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setRecordingState("idle");
    setTimer(0);
    setRecordedBlob(null);
    setAudioUrl(null);
    setIsPlayingPreview(false);
    setPermissionError(null);
    onClose();
  };

  // Start recording voice
  const startRecording = async () => {
    chunksRef.current = [];
    setPermissionError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError("由于浏览器安全策略限制，麦克风录音必须在 HTTPS 或 localhost 环境下使用。请使用 Chrome 的安全测试设置，或在服务器上启用 HTTPS 证书。");
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Determine best mimeType supported
      let options = { mimeType: "audio/webm" };
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        if (MediaRecorder.isTypeSupported("audio/mp4")) {
          options = { mimeType: "audio/mp4" };
        } else {
          options = { mimeType: "" }; // default
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setAudioUrl(url);
        setRecordingState("preview");
        
        // Create audio preview element
        const audio = new Audio(url);
        audio.onended = () => setIsPlayingPreview(false);
        audioRef.current = audio;
      };

      // Set up real-time audio visualizer on canvas
      setupVisualizer(stream);

      // Start actual recording
      mediaRecorder.start();
      setRecordingState("recording");
      setTimer(0);

      // Setup timer interval
      timerIntervalRef.current = window.setInterval(() => {
        setTimer((prev) => {
          if (prev >= MAX_RECORDING_TIME - 1) {
            stopRecording();
            return MAX_RECORDING_TIME;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPermissionError("请允许系统使用您的麦克风，否则无法录音。您可以检查浏览器地址栏左侧的权限设置。");
      } else {
        setPermissionError("无法启动录音设备，请检查麦克风是否已插入并正确连接。");
      }
    }
  };

  // Stop recording voice
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    cleanupRecordingResources();
  };

  // Visualizer setup using Web Audio API and Canvas
  const setupVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const draw = () => {
        if (recordingState !== "recording" && mediaRecorderRef.current?.state !== "recording") {
          return;
        }

        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        // Clear canvas
        ctx.fillStyle = "#FAF8F5"; // matches receipt-bg
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw nice pulsing circular/bar waveform
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i] / 2;

          // Make it taller for visual effect
          const finalHeight = Math.max(4, barHeight * 0.7);

          // Render styled green bars that fade on the edges
          const ratio = i / bufferLength;
          ctx.fillStyle = `rgba(0, 184, 107, ${0.3 + (1 - ratio) * 0.7})`; // Fade Verified green

          // Draw symmetrical wave from center line
          const y = (canvas.height - finalHeight) / 2;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, barWidth - 2, finalHeight, 4);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barWidth - 2, finalHeight);
          }

          x += barWidth;
        }
      };

      draw();
    } catch (e) {
      console.warn("Failed to initialize Web Audio visualizer:", e);
    }
  };

  // Preview controls
  const togglePlayPreview = () => {
    if (!audioRef.current) return;
    if (isPlayingPreview) {
      audioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlayingPreview(true);
    }
  };

  const handleUseRecording = () => {
    if (!recordedBlob) return;
    
    // Determine extension
    const mimeType = recordedBlob.type;
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const filename = `recording_voice.${ext}`;
    
    const file = new File([recordedBlob], filename, { type: mimeType });
    onSave(file);
    handleClose();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRecordingResources();
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border-4 border-black/10 flex flex-col gap-6"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b-2 border-black/5 pb-3">
          <h3 className="text-2xl font-black text-black flex items-center gap-2">
            🎤 <span>说话录音</span>
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭弹窗"
            className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center text-lg font-bold text-black/50 hover:bg-black/10 cursor-pointer border-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Panel */}
        <div className="flex flex-col items-center justify-center min-h-[220px] bg-[#FAF8F5] rounded-2xl border-2 border-black/5 p-6 relative overflow-hidden">
          
          {/* Permission Error Display */}
          {permissionError && (
            <div className="flex flex-col items-center text-center gap-3 text-red-600 px-2 py-4">
              <AlertCircle className="w-12 h-12 text-[#FF3B30]" />
              <p className="text-lg font-bold leading-relaxed">{permissionError}</p>
            </div>
          )}

          {/* Idle State */}
          {!permissionError && recordingState === "idle" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-[#00B86B]/10 flex items-center justify-center animate-pulse">
                <Mic className="w-10 h-10 text-[#00B86B]" />
              </div>
              <h4 className="text-2xl font-black text-black">准备就绪</h4>
              <p className="text-lg text-black/60 font-bold">请点击下方绿色按钮，大声说出您想核查的传言。</p>
            </div>
          )}

          {/* Recording State */}
          {!permissionError && recordingState === "recording" && (
            <div className="flex flex-col items-center w-full gap-4">
              {/* Pulse circle */}
              <div className="relative w-16 h-16 rounded-full bg-[#FF3B30]/10 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[#FF3B30]/30 animate-ping"></div>
                <Mic className="w-8 h-8 text-[#FF3B30]" />
              </div>

              <h4 className="text-xl font-black text-red-600 animate-pulse">正在录音中...</h4>
              
              {/* Waveform visualizer */}
              <canvas
                ref={canvasRef}
                width={320}
                height={60}
                className="w-full h-[60px] rounded-lg pointer-events-none"
              />

              <div className="text-3xl font-mono font-black text-black mt-2">
                {formatTime(timer)} <span className="text-lg text-black/40">/ {formatTime(MAX_RECORDING_TIME)}</span>
              </div>
            </div>
          )}

          {/* Preview State */}
          {!permissionError && recordingState === "preview" && (
            <div className="flex flex-col items-center w-full gap-4 py-2">
              <div className="w-16 h-16 rounded-full bg-[#00B86B]/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-[#00B86B]" />
              </div>
              
              <h4 className="text-xl font-black text-[#00B86B]">录音完成</h4>
              
              {/* Simulated visualizer or dynamic player */}
              <div className="w-full flex items-center justify-center gap-4 py-3">
                <button
                  type="button"
                  onClick={togglePlayPreview}
                  className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md cursor-pointer border-none ${
                    isPlayingPreview ? "bg-black text-white hover:bg-black/90" : "bg-[#00B86B] text-white hover:bg-[#009E5B]"
                  }`}
                >
                  {isPlayingPreview ? (
                    <Pause className="w-8 h-8 fill-current" />
                  ) : (
                    <Play className="w-8 h-8 fill-current translate-x-0.5" />
                  )}
                </button>
                <div className="flex flex-col">
                  <span className="text-lg font-black text-black">您的录音</span>
                  <span className="text-sm font-mono text-black/50 font-bold">{formatTime(timer)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-4">
          
          {/* Active Recording Actions */}
          {!permissionError && recordingState === "recording" && (
            <button
              type="button"
              onClick={stopRecording}
              className="w-full py-5 rounded-2xl bg-[#FF3B30] hover:bg-[#E0241B] text-white text-2xl font-black shadow-lg cursor-pointer border-none flex items-center justify-center gap-3 transition-colors"
            >
              <Square className="w-7 h-7 fill-current" />
              <span>说完了，停止录音</span>
            </button>
          )}

          {/* Preview State Actions */}
          {!permissionError && recordingState === "preview" && (
            <div className="flex gap-4">
              <button
                type="button"
                onClick={startRecording}
                className="flex-1 py-5 rounded-2xl bg-black/5 hover:bg-black/10 text-black text-xl font-black cursor-pointer border-none flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-6 h-6" />
                <span>重新录音</span>
              </button>
              <button
                type="button"
                onClick={handleUseRecording}
                className="flex-1 py-5 rounded-2xl bg-[#00B86B] hover:bg-[#009E5B] text-white text-xl font-black shadow-md cursor-pointer border-none flex items-center justify-center gap-2 transition-colors"
              >
                <Check className="w-6 h-6" />
                <span>确定使用</span>
              </button>
            </div>
          )}

          {/* Idle / Error State Action */}
          {(permissionError || recordingState === "idle") && (
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-4 text-xl font-bold bg-black/5 hover:bg-black/10 rounded-2xl text-black cursor-pointer border-none"
              >
                取消
              </button>
              {!permissionError && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex-[2] py-4 text-xl font-black bg-[#00B86B] hover:bg-[#009E5B] text-white rounded-2xl shadow-lg cursor-pointer border-none flex items-center justify-center gap-2"
                >
                  <Mic className="w-6 h-6" />
                  <span>开始录音</span>
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
