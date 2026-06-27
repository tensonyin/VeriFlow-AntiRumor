import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidChart from './MermaidChart';
import { Eye, Share2, Download, X, ClipboardCopy, Loader2 } from 'lucide-react';
import { toBlob } from 'html-to-image';
import katex from 'katex';
import 'katex/dist/katex.min.css';


export type StatusType = "Verified" | "Fake" | "Doubtful";

export interface AnalysisResult {
  status: StatusType;
  content: string;
  sourceText: string;
  timestamp: string;
  imageUrl?: string;
  elderlyContent?: string;
  latexPoster?: string;
  systemId?: string;
}

const getDeterministicId = (text: string, time: string) => {
  const str = (text || "") + (time || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const positiveHash = Math.abs(hash);
  return Math.floor((positiveHash % 899999) + 100000);
};

const sanitizeLatex = (raw: string): string => {
  if (!raw) return "";
  let clean = raw.trim();
  
  // 1. Strip markdown fences like ```latex or ```
  clean = clean.replace(/```latex/gi, "");
  clean = clean.replace(/```/g, "");
  clean = clean.trim();
  
  // 2. Ensure outer wrapper has $$ if not already present
  if (!clean.startsWith("$$")) {
    clean = "$$\n" + clean;
  }
  if (!clean.endsWith("$$")) {
    clean = clean + "\n$$";
  }
  
  // 3. Replace standard row break double backslashes (\\) with spacing \\[1.4em] to avoid overlap
  clean = clean.replace(/\\\\(?!\s*\[)/g, "\\\\[1.4em]");

  // 4. Wrap Chinese characters, emojis, and CJK punctuation in \text{...} to fix KaTeX font-size layout and alignment bugs
  clean = clean.replace(/([^\x00-\x7f\s~]+|\\\s|[\s~])+/g, (match) => {
    const trimmed = match.trim();
    if (!trimmed || /^[\s~\\_]+$/.test(trimmed)) {
      return match;
    }
    return `\\text{${match}}`;
  });


  return clean;
};

const LatexRenderer = ({ latex }: { latex: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const updateScale = () => {
    if (containerRef.current && wrapperRef.current) {
      const targetEl = containerRef.current.querySelector('.katex-display') as HTMLElement;
      if (targetEl) {
        requestAnimationFrame(() => {
          if (!wrapperRef.current || !containerRef.current) return;
          
          const container = containerRef.current;
          const wrapper = wrapperRef.current;
          
          // Batch resets and reads in the same frame to prevent layout thrashing and visual flicker
          container.style.fontSize = '16px';
          targetEl.style.transform = 'none';
          targetEl.style.width = 'auto';
          targetEl.style.display = 'block';
          targetEl.style.margin = '0';
          
          // Measure values immediately after write in the animation frame
          const parentWidth = wrapper.clientWidth - 16;
          const elementWidth = targetEl.scrollWidth || targetEl.offsetWidth;
          
          if (elementWidth > parentWidth && parentWidth > 0) {
            const ratio = parentWidth / elementWidth;
            // Let the font size scale down dynamically to fit smaller screens (min 6px font size)
            const newFontSize = Math.max(6, Math.floor(16 * ratio));
            container.style.fontSize = `${newFontSize}px`;
          } else {
            container.style.fontSize = '16px';
          }
        });
      }
    }
  };

  useEffect(() => {
    if (containerRef.current) {
      try {
        let math = latex.trim();
        if (math.startsWith('$$') && math.endsWith('$$')) {
          math = math.slice(2, -2).trim();
        } else if (math.startsWith('$') && math.endsWith('$')) {
          math = math.slice(1, -1).trim();
        }
        
        katex.render(math, containerRef.current, {
          displayMode: true,
          throwOnError: false,
          strict: 'ignore',
          trust: true
        });

        // Trigger measurement and scale adjustment
        updateScale();
      } catch (err) {
        console.error("KaTeX rendering error:", err);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div class="text-red-500 font-mono text-sm break-all">${latex}</div>`;
        }
      }
    }
  }, [latex]);

  // Use ResizeObserver for reliable responsiveness on mount, window resize,
  // dialog animations, or viewport adjustments.
  useEffect(() => {
    if (!wrapperRef.current) return;

    const observer = new ResizeObserver(() => {
      updateScale();
    });
    observer.observe(wrapperRef.current);

    return () => {
      observer.disconnect();
    };
  }, [latex]);

  return (
    <div 
      ref={wrapperRef} 
      className="w-full flex justify-center items-start overflow-hidden px-4"
    >
      <div 
        ref={containerRef} 
        className="latex-render-container w-full overflow-hidden py-2 text-center flex justify-center" 
        style={{ fontSize: '16px' }}
      />
    </div>
  );
};

const originalStatusColors = {
  Verified: "#405948", // Darker Morandi Green (Contrast ~7.2:1)
  Fake: "#91463C", // Darker Dried Rose Red (Contrast ~5.4:1)
  Doubtful: "#9E7B3B", // Darker Mustard Yellow (Contrast ~3.5:1, passes large text)
};

const elderlyStatusColors = {
  Verified: "#00663C", // Deep accessible green (Contrast ~8.5:1, AAA)
  Fake: "#C21E17", // Deep accessible red (Contrast ~5.8:1, AA)
  Doubtful: "#8A6600", // Deep accessible amber (Contrast ~4.7:1, AA)
};

const statusText = {
  Verified: "证实",
  Fake: "伪造",
  Doubtful: "存疑",
};

export default function ResultTicket({ result, onReviewWorkflow, isElderlyMode = false, mermaidChart }: { result: AnalysisResult, onReviewWorkflow?: () => void, isElderlyMode?: boolean, mermaidChart?: string }) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const shareImageModalRef = useRef<HTMLDivElement>(null);
  const posterModalRef = useRef<HTMLDivElement>(null);
  
  const statusColors = isElderlyMode ? elderlyStatusColors : originalStatusColors;

  const [ttsState, setTtsState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [selectedVoice, setSelectedVoice] = useState<'zh-CN-XiaoyiNeural' | 'zh-CN-YunxiNeural'>('zh-CN-XiaoyiNeural');
  const [isSaving, setIsSaving] = useState(false);
  const [shareImageBlob, setShareImageBlob] = useState<Blob | null>(null);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [canShareNative, setCanShareNative] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);

  // LaTeX Poster Sharing States
  const [isPosterSaving, setIsPosterSaving] = useState(false);
  const [posterImageBlob, setPosterImageBlob] = useState<Blob | null>(null);
  const [posterImageUrl, setPosterImageUrl] = useState<string | null>(null);
  const [canShareNativePoster, setCanShareNativePoster] = useState(false);
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  // Component mount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Focus trap and accessibility control for Share Image Modal
  useEffect(() => {
    if (!shareImageUrl) return;
    const modal = shareImageModalRef.current;
    if (!modal) return;

    // Focus first focusable element
    const focusable = modal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) {
      (focusable[0] as HTMLElement).focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShareImageUrl(null);
        return;
      }
      if (e.key === 'Tab') {
        const focusableEls = modal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
        if (focusableEls.length > 0) {
          const first = focusableEls[0] as HTMLElement;
          const last = focusableEls[focusableEls.length - 1] as HTMLElement;
          if (e.shiftKey) {
            if (document.activeElement === first) {
              last.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === last) {
              first.focus();
              e.preventDefault();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shareImageUrl]);

  // Focus trap and accessibility control for LaTeX Poster Modal
  useEffect(() => {
    if (!isPosterModalOpen) return;
    const modal = posterModalRef.current;
    if (!modal) return;

    // Focus first focusable element
    const focusable = modal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) {
      (focusable[0] as HTMLElement).focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPosterModalOpen(false);
        setPosterImageUrl(null);
        setPosterImageBlob(null);
        return;
      }
      if (e.key === 'Tab') {
        const focusableEls = modal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
        if (focusableEls.length > 0) {
          const first = focusableEls[0] as HTMLElement;
          const last = focusableEls[focusableEls.length - 1] as HTMLElement;
          if (e.shiftKey) {
            if (document.activeElement === first) {
              last.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === last) {
              first.focus();
              e.preventDefault();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPosterModalOpen]);

  // Generate poster image blob dynamically on demand
  const generatePosterImage = async (): Promise<Blob | null> => {
    if (posterImageBlob) return posterImageBlob;
    if (!posterRef.current) return null;
    
    setIsPosterSaving(true);
    try {
      // Use html-to-image to generate the blob of the poster card
      const blob = await toBlob(posterRef.current, {
        backgroundColor: '#FAF8F5',
        pixelRatio: 2.0, // High definition
        skipFonts: true
      });
      if (blob) {
        const url = URL.createObjectURL(blob);
        setPosterImageBlob(blob);
        setPosterImageUrl(url);
        return blob;
      }
      return null;
    } catch (err) {
      console.error("生成大字报图片失败", err);
      alert("生成大字报图片失败，请稍后再试。");
      return null;
    } finally {
      setIsPosterSaving(false);
    }
  };

  const handleDirectDownloadPoster = async () => {
    try {
      let blob = posterImageBlob;
      let url = posterImageUrl;
      if (!blob) {
        blob = await generatePosterImage();
        if (blob) {
          url = URL.createObjectURL(blob);
        }
      }
      if (!url) return;
      const link = document.createElement('a');
      link.download = `避谣大字报_${new Date().getTime()}.png`;
      link.href = url;
      link.click();
    } catch (e) {
      console.error("下载失败", e);
      alert("下载大字报失败，请长按图片保存。");
    }
  };

  const handleCopyToClipboardPoster = async () => {
    try {
      let blob = posterImageBlob;
      if (!blob) {
        blob = await generatePosterImage();
      }
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      alert('大字报图片已成功复制到剪贴板，您可以直接粘贴发送！');
    } catch (e) {
      console.error("复制失败", e);
      alert("您的浏览器不支持直接复制图片，请长按/另存图片。");
    }
  };

  const handleNativeSharePoster = async () => {
    try {
      let blob = posterImageBlob;
      if (!blob) {
        blob = await generatePosterImage();
      }
      if (!blob) return;
      const file = new File([blob], `避谣大字报_${new Date().getTime()}.png`, { type: 'image/png' });
      await navigator.share({
        files: [file],
        title: '避谣大字报',
        text: '这是为您生成的辟谣大字报，大字易读，快转发给家人看看吧！',
      });
    } catch (e) {
      console.error("分享失败", e);
      if (e instanceof Error && e.name !== 'AbortError') {
        alert("分享失败，请重试或长按/另存图片。");
      }
    }
  };

  // Check native share support for poster
  useEffect(() => {
    if (posterImageBlob && navigator.share && navigator.canShare) {
      const file = new File([posterImageBlob], 'poster.png', { type: 'image/png' });
      try {
        setCanShareNativePoster(navigator.canShare({ files: [file] }));
      } catch (e) {
        setCanShareNativePoster(false);
      }
    } else {
      setCanShareNativePoster(false);
    }
  }, [posterImageBlob]);

  // Clean up poster URL object on unmount
  useEffect(() => {
    return () => {
      if (posterImageUrl && posterImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(posterImageUrl);
      }
    };
  }, [posterImageUrl]);

  useEffect(() => {
    return () => {
      if (shareImageUrl && shareImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(shareImageUrl);
      }
    };
  }, [shareImageUrl]);

  useEffect(() => {
    if (shareImageBlob && navigator.share && navigator.canShare) {
      const file = new File([shareImageBlob], 'test.png', { type: 'image/png' });
      try {
        setCanShareNative(navigator.canShare({ files: [file] }));
      } catch (e) {
        setCanShareNative(false);
      }
    } else {
      setCanShareNative(false);
    }
  }, [shareImageBlob]);


  const cleanMarkdownForSpeech = (text: string) => {
    // Strip emojis and non-BMP symbols first to prevent TTS from reading them literally
    const noEmojis = text
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // Surrogate pairs (emojis)
      .replace(/[\u2600-\u27BF]/g, '') // Common symbols
      .replace(/[⚠️🔬💡📸📝🔗]/g, ''); // Specific UI emojis

    return noEmojis
      .replace(/#+\s+/g, '') // Headings
      .replace(/\*\*|__/g, '') // Bold
      .replace(/\*|_/g, '') // Italic
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Links [text](url) -> text
      .replace(/`[^`]+`/g, '') // Inline code
      .replace(/```[\s\S]*?```/g, '') // Code blocks
      .replace(/[-\*]\s+/g, '') // List items
      .replace(/\d+\.\s+/g, '') // Numbered list items
      .replace(/>\s+/g, '') // Blockquotes
      .trim();
  };

  const cleanupTts = () => {
    if (ttsAbortControllerRef.current) {
      ttsAbortControllerRef.current.abort();
      ttsAbortControllerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const fallbackSpeechSynthesis = (textToRead: string) => {
    if (!('speechSynthesis' in window)) {
      setTtsState('idle');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.lang = 'zh-CN';
              utterance.onend = () => {
        setTtsState('idle');
      };
      utterance.onerror = () => {
        setTtsState('idle');
      };

      utteranceRef.current = utterance;

      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
        setTtsState('playing');
      }, 100);
    } catch (err) {
      console.error("Speech synthesis fallback failed", err);
      setTtsState('idle');
    }
  };

  const startSpeech = async () => {
    cleanupTts();
    
    const baseContent = (isElderlyMode && result.elderlyContent) ? result.elderlyContent : result.content;
    const textToRead = "核查结论为：" + statusText[result.status] + "。详细报告如下：" + cleanMarkdownForSpeech(baseContent);
    
    setTtsState('loading');
    
    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToRead,
          voice: selectedVoice
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error('TTS API returned ' + response.status);
      }

      const blob = await response.blob();
      
      // Stop execution if unmounted or aborted
      if (!isMountedRef.current || controller.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setTtsState('idle');
      };
      
      audio.onerror = () => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        console.warn("Backend TTS playback error, falling back to client speechSynthesis");
        fallbackSpeechSynthesis(textToRead);
      };

      await audio.play();
      
      if (!isMountedRef.current || controller.signal.aborted) {
        audio.pause();
        return;
      }
      
      setTtsState('playing');
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return;
      }
      if (!isMountedRef.current || controller.signal.aborted) return;
      console.warn("Failed to fetch/play backend TTS, falling back to client speechSynthesis", e);
      fallbackSpeechSynthesis(textToRead);
    } finally {
      if (ttsAbortControllerRef.current === controller) {
        ttsAbortControllerRef.current = null;
      }
    }
  };

  const pauseSpeech = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setTtsState('paused');
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setTtsState('paused');
    }
  };

  const resumeSpeech = () => {
    if (ttsState === 'paused') {
      if (audioRef.current) {
        audioRef.current.play().catch(err => {
          console.error("Failed to resume backend audio", err);
          startSpeech();
        });
        setTtsState('playing');
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
        setTtsState('playing');
      } else {
        startSpeech();
      }
    } else {
      startSpeech();
    }
  };

  useEffect(() => {
    if (!isElderlyMode) {
      cleanupTts();
      return;
    }
    
    // Auto-play TTS 3 seconds after load (once printing/stamping finishes)
    const timer = setTimeout(() => {
      startSpeech();
    }, 2800);

    return () => {
      clearTimeout(timer);
      cleanupTts();
    };
  }, [result, isElderlyMode]);

  // Hot-swap voice instantly if toggled during speech
  useEffect(() => {
    if (ttsState === 'playing') {
      startSpeech();
    }
  }, [selectedVoice]);

  const handleGenerateShareImage = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (!ticketRef.current) return;
      
      if (shareImageUrl && shareImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(shareImageUrl);
      }

      const blob = await toBlob(ticketRef.current, { 
        backgroundColor: '#FAF8F5', 
        pixelRatio: 1.5,
        skipFonts: true,
      });

      if (!blob) {
        throw new Error("生成图片为空");
      }

      const url = URL.createObjectURL(blob);
      setShareImageBlob(blob);
      setShareImageUrl(url);
    } catch (e) {
      console.error("生成图片失败", e);
      alert(`生成分享图片失败，请稍后再试。错误信息: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDirectDownload = async () => {
    try {
      if (!shareImageUrl) return;
      const link = document.createElement('a');
      link.download = `核查报告_${new Date().getTime()}.png`;
      link.href = shareImageUrl;
      link.click();
    } catch (e) {
      console.error("下载失败", e);
      alert("下载失败，请长按图片进行保存。");
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      if (!shareImageBlob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': shareImageBlob })]);
      alert('图片已成功复制到剪贴板，您可以直接进行粘贴发送！');
    } catch (e) {
      console.error("复制失败", e);
      alert("您的浏览器不支持直接复制图片，请长按图片进行保存或发送。");
    }
  };

  const handleNativeShare = async () => {
    try {
      if (!shareImageBlob) return;
      const file = new File([shareImageBlob], `核查报告_${new Date().getTime()}.png`, { type: 'image/png' });
      await navigator.share({
        files: [file],
        title: '事实核查报告',
        text: '这是为您生成的谣言终结者事实核查小票报告。',
      });
    } catch (e) {
      console.error("分享失败", e);
      if (e instanceof Error && e.name !== 'AbortError') {
        alert("分享失败，请重试或长按图片进行保存。");
      }
    }
  };


  return (
    <div className="w-full flex flex-col items-center mt-8">
      {/* 打印机槽口 / Printer Slot */}
      <motion.div 
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-xl h-[2px] bg-gradient-to-r from-transparent via-[#2C2C2C]/15 to-transparent relative z-20 shadow-[0_1px_2px_rgba(0,0,0,0.03)] rounded-[100%]"
      />
      
      {/* 纸张容器 / Paper Container */}
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: "auto" }}
        transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.4 }}
        className="w-full max-w-xl origin-top relative z-10 overflow-hidden px-2 sm:px-4"
        style={{ marginTop: "-2px" }}
      >
        <motion.div
          initial={{ y: "-100%" }}
          animate={{ y: "0%" }}
          transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.4 }}
          className="pb-4 pt-2"
        >
          <div ref={ticketRef} className="flex flex-col gap-6 p-2 sm:p-6 bg-[#FAF8F5] rounded-lg">
            {/* If there's an image generated, render it before the ticket */}
            {result.imageUrl && isElderlyMode && (
              <img 
                src={`/api/proxy-image?url=${encodeURIComponent(result.imageUrl)}`} 
                alt="生成配图" 
                className="w-full h-auto object-cover rounded-2xl shadow-md border border-[#d0ccc4]/30" 
              />
            )}
            
            <div className={`receipt p-5 sm:p-8 font-mono ${isElderlyMode ? 'text-lg leading-[1.6]' : 'text-sm'} tracking-tight ${isElderlyMode ? 'text-black' : 'text-[#2C2C2C]'}`}>
              <div className="sawtooth-top"></div>
              <div className="sawtooth-bottom"></div>
            
            <div className="text-center border-b border-dashed border-[#d0ccc4] pb-6 mb-6 relative">
              <h2 className={`${isElderlyMode ? 'text-2xl' : 'text-lg'} font-bold tracking-widest uppercase mb-1 ${isElderlyMode ? 'opacity-100 text-black' : 'opacity-80'}`}>真相核查小票</h2>
              <p className="text-xs text-black/65">系统编号 {result.systemId || getDeterministicId(result.sourceText, result.timestamp)}</p>
              <p className="text-xs text-black/65">{result.timestamp}</p>
              
               {/* 盖章动效 / Stamp Animation Moved to Top */}
               <motion.div 
                 initial={{ scale: 5, opacity: 0, rotateX: 65, rotateY: 35, rotateZ: 15, z: 300 }}
                 animate={{ 
                   scale: [5, 0.9, 1], 
                   opacity: [0, 1, 0.85], 
                   rotateX: [65, -15, 0], 
                   rotateY: [35, -10, 0], 
                   rotateZ: [15, -14, -12],
                   z: [300, 0, 0]
                 }}
                 transition={{ 
                   delay: 2.3, 
                   duration: 0.45, 
                   times: [0, 0.75, 1],
                   ease: ["easeIn", "easeOut"] 
                 }}
                 className={`absolute right-0 top-0 border-4 rounded-sm px-3 py-1 font-bold text-2xl tracking-[0.2em] mix-blend-multiply origin-center`}
                 style={{
                   borderColor: statusColors[result.status],
                   color: statusColors[result.status],
                 }}
               >
                 {statusText[result.status]}
               </motion.div>
            </div>

            <div className="space-y-6 mb-12 leading-relaxed">
              <div className={isElderlyMode ? "opacity-100 font-bold" : "opacity-90"}>
                <span className="text-xs text-black/65 block mb-1">传言原文 / 问题：</span>
                "{result.sourceText}"
              </div>
              <div className={`pl-4 border-l border-[#d0ccc4] ${isElderlyMode ? 'opacity-100' : 'opacity-90'} markdown-body prose ${isElderlyMode ? 'prose-lg' : 'prose-sm'} prose-stone max-w-none break-all`}>
                <span className="text-xs text-black/65 block mb-2 font-mono tracking-widest uppercase">核查过程与结论：</span>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!inline && match && match[1] === 'mermaid') {
                        return <MermaidChart chart={String(children).replace(/\n$/, '')} />;
                      }
                      return <code className={className} {...props}>{children}</code>;
                    },
                    a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-[#C29F68] underline decoration-[#C29F68]/30 hover:decoration-[#C29F68] transition-colors break-all" />,
                    h1: ({node, ...props}) => <h1 {...props} className={`${isElderlyMode ? 'text-2xl font-black mt-6 mb-3' : 'text-lg font-bold mt-4 mb-2'}`} />,
                    h2: ({node, ...props}) => <h2 {...props} className={`${isElderlyMode ? 'text-xl font-black mt-5 mb-3' : 'text-base font-bold mt-3 mb-2'}`} />,
                    h3: ({node, ...props}) => <h3 {...props} className={`${isElderlyMode ? 'text-lg font-black mt-4 mb-2' : 'text-sm font-bold mt-2 mb-1'}`} />,
                    ul: ({node, ...props}) => <ul {...props} className="list-disc pl-4 space-y-2 my-3" />,
                    ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-4 space-y-2 my-3" />,
                    li: ({node, ...props}) => <li {...props} className={`leading-relaxed ${isElderlyMode ? 'text-black text-xl font-bold' : 'text-[#2C2C2C]/80'}`} />,
                    p: ({node, ...props}) => <p {...props} className={`mb-4 leading-relaxed break-all ${isElderlyMode ? 'text-black text-xl font-bold' : 'text-[#2C2C2C]/90'}`} />,
                    blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-2 border-[#d0ccc4] pl-3 italic opacity-70 my-3" />
                  }}
                >
                  {result.content}
                </ReactMarkdown>
              </div>
            </div>

            <div 
              className="border-t border-dashed border-[#d0ccc4] pt-6 flex justify-between items-end relative min-h-[60px]"
              style={{ perspective: "800px" }}
            >
               <div className="text-xs text-black/60 font-medium">
                  [ 报告完毕 ]
               </div>
            </div>
            </div>
          </div>
          
          {mermaidChart && (
            <div className="mt-8 w-full max-w-4xl mx-auto px-4">
              <div className="flex items-center mb-6">
                <div className="flex-1 h-px bg-[#d0ccc4]"></div>
                <div className={`px-4 ${isElderlyMode ? 'text-lg font-bold' : 'text-xs font-mono tracking-widest uppercase'} text-[#2C2C2C] opacity-65`}>
                  逻辑链路图
                </div>
                <div className="flex-1 h-px bg-[#d0ccc4]"></div>
              </div>
              <MermaidChart chart={mermaidChart} />
            </div>
          )}

          <div className={`mt-8 flex flex-col sm:flex-row justify-center items-center gap-4 px-8 ${isElderlyMode ? 'pb-24 sm:pb-0' : ''}`}>
            <button
              onClick={handleGenerateShareImage}
              disabled={isSaving}
              className={`px-6 py-3 rounded-full flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg w-full sm:w-auto ${isElderlyMode ? 'bg-verified-dark text-white text-lg font-bold border-none hover:bg-verified' : 'bg-[#2C2C2C] text-white text-sm border-none hover:bg-[#1C1C1C]'} ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
            >
              <Share2 className={`w-5 h-5 ${isSaving ? 'animate-pulse' : ''}`} />
              {isSaving ? "生成中..." : (isElderlyMode ? "保存与分享给好友" : "保存与分享报告")}
            </button>

            {result.latexPoster && (
              <button
                onClick={() => setIsPosterModalOpen(true)}
                className={`px-6 py-3 rounded-full flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg w-full sm:w-auto bg-[#FF3B30] text-white text-lg font-bold border-none hover:bg-[#E0241B]`}
              >
                <Share2 className="w-5 h-5" />
                分享大字报
              </button>
            )}

            {!isElderlyMode && onReviewWorkflow && (
              <button
                onClick={onReviewWorkflow}
                className="px-6 py-3 rounded-full border border-[#d0ccc4] text-[#2C2C2C]/70 hover:text-[#2C2C2C] hover:bg-[#FAF8F5] transition-colors flex items-center justify-center gap-2 text-sm font-mono w-full sm:w-auto"
              >
                <Eye className="w-4 h-4" />
                查看思考过程
              </button>
            )}
          </div>

        </motion.div>
      </motion.div>

      {/* Floating Audio Controller for Elderly Mode */}
      {isElderlyMode && (
        <div className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:right-6 sm:left-auto z-50 bg-white/95 backdrop-blur-md px-4 py-3 sm:px-6 sm:py-4 rounded-t-2xl sm:rounded-3xl border-t-4 border-x-0 border-b-0 sm:border-4 border-verified-dark shadow-2xl flex items-center justify-between gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <span className="text-2xl sm:text-3xl flex items-center justify-center">
              {ttsState === 'loading' ? (
                <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-verified-dark" />
              ) : ttsState === 'playing' ? (
                <span className="animate-pulse">🔊</span>
              ) : (
                <span>🔇</span>
              )}
            </span>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-black text-black leading-tight">语音播报</span>
              <span className="text-[10px] sm:text-xs text-black/75 font-bold hidden sm:inline-block">
                {ttsState === 'loading' 
                  ? '合成中...' 
                  : ttsState === 'playing' 
                    ? '朗读中...' 
                    : ttsState === 'paused' 
                      ? '已暂停' 
                      : '已停止'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2 border-l border-black/10 pl-2 sm:pl-3 flex-shrink-0">
            {ttsState === 'playing' ? (
              <button 
                onClick={pauseSpeech}
                className="px-2.5 py-1.5 sm:px-4 sm:py-2 bg-black text-white rounded-lg sm:rounded-xl text-sm sm:text-base font-bold shadow hover:bg-black/80 cursor-pointer border-none flex-shrink-0"
              >
                ⏸ <span className="hidden sm:inline">暂停</span>
              </button>
            ) : (
              <button 
                onClick={resumeSpeech}
                disabled={ttsState === 'loading'}
                className={`px-2.5 py-1.5 sm:px-4 sm:py-2 bg-verified-dark text-white rounded-lg sm:rounded-xl text-sm sm:text-base font-bold shadow hover:bg-verified cursor-pointer border-none flex-shrink-0 ${ttsState === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {ttsState === 'loading' ? '⏳' : '▶'} <span className="hidden sm:inline">{ttsState === 'paused' ? '继续' : '播报'}</span>
              </button>
            )}
            
            <button
              onClick={() => setSelectedVoice(prev => prev === 'zh-CN-XiaoyiNeural' ? 'zh-CN-YunxiNeural' : 'zh-CN-XiaoyiNeural')}
              disabled={ttsState === 'loading'}
              className={`px-2 py-1.5 sm:px-3 sm:py-2 bg-black/5 text-black hover:bg-black/10 rounded-lg sm:rounded-xl text-sm sm:text-base font-bold cursor-pointer border-none flex items-center gap-1 flex-shrink-0 ${ttsState === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="点击切换播报人声音"
            >
              {selectedVoice === 'zh-CN-XiaoyiNeural' ? '👩' : '🧑'}<span className="hidden sm:inline">{selectedVoice === 'zh-CN-XiaoyiNeural' ? ' 女儿' : ' 儿子'}</span>
            </button>

            <button 
              onClick={startSpeech}
              disabled={ttsState === 'loading'}
              className={`p-1.5 sm:p-2 bg-black/5 text-black hover:bg-black/10 rounded-lg sm:rounded-xl text-sm sm:text-base font-bold cursor-pointer border-none flex-shrink-0 ${ttsState === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="从头重新播报"
            >
              🔄
            </button>
          </div>
        </div>
      )}

      {/* Share Image Modal Overlay */}
      {shareImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div ref={shareImageModalRef} className="bg-[#FAF8F5] rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 border border-black/10 max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-dashed border-[#d0ccc4] pb-3">
              <span className="text-lg font-bold text-[#2C2C2C]">保存与分享核查报告</span>
              <button 
                onClick={() => setShareImageUrl(null)}
                aria-label="关闭弹窗"
                className="w-11 h-11 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 cursor-pointer border-none text-[#2C2C2C]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* The Image container */}
            <div className="overflow-y-auto flex-1 flex justify-center py-2 bg-black/5 rounded-2xl border border-black/5">
              <img 
                src={shareImageUrl} 
                alt="核查小票报告" 
                className="max-h-[50vh] object-contain shadow-lg rounded-lg border border-white"
              />
            </div>

            {/* Instruction prompts */}
            <div className="text-center space-y-2 py-2">
              <p className="text-sm font-bold text-black/80">
                📱 手机端：长按图片，选择「保存到相册」或「发送给朋友」
              </p>
              <p className="text-xs text-black/70">
                💻 电脑端：鼠标右键选择「图片另存为」保存到本地
              </p>
            </div>

            {/* Extra action buttons */}
            <div className="flex gap-3">
              {canShareNative && (
                <button
                  onClick={handleNativeShare}
                  className="flex-1 py-3 rounded-full bg-verified-dark text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-verified cursor-pointer border-none"
                >
                  <Share2 className="w-4 h-4" />
                  发送给朋友
                </button>
              )}
              <button
                onClick={handleCopyToClipboard}
                className="flex-1 py-3 rounded-full bg-black/5 text-[#2C2C2C] text-sm font-bold flex items-center justify-center gap-2 hover:bg-black/10 cursor-pointer border-none"
              >
                <ClipboardCopy className="w-4 h-4" />
                复制图片
              </button>
              <button
                onClick={handleDirectDownload}
                className="flex-1 py-3 rounded-full bg-[#2C2C2C] text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-black cursor-pointer border-none"
              >
                <Download className="w-4 h-4" />
                直接下载
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LaTeX Poster Share Modal */}
      {isPosterModalOpen && result.latexPoster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div ref={posterModalRef} className="bg-[#FAF8F5] rounded-3xl p-6 w-full max-w-2xl shadow-2xl flex flex-col gap-4 border border-black/10 max-h-[95vh] overflow-hidden">
            <div className="flex justify-between items-center border-b border-dashed border-[#d0ccc4] pb-3">
              <span className="text-lg font-bold text-[#2C2C2C]">生成辟谣大字报</span>
              <button 
                onClick={() => {
                  setIsPosterModalOpen(false);
                  setPosterImageUrl(null);
                  setPosterImageBlob(null);
                }}
                aria-label="关闭弹窗"
                className="w-11 h-11 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 cursor-pointer border-none text-[#2C2C2C]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Container */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col items-center gap-6 py-2">
              {/* Rendered Poster Container - Adaptive dimension wrapper */}
              <div className="w-full overflow-hidden flex justify-center py-2">
                <div 
                  ref={posterRef}
                  className="w-[540px] max-w-full bg-[#FAF8F5] border-[6px] sm:border-[12px] border-[#C21E17] rounded-xl p-4 sm:p-8 shadow-md flex flex-col items-center text-center relative flex-shrink-0 overflow-hidden"
                  style={{ fontFamily: 'SimSun, STSong, "PingFang SC", sans-serif' }}
                >
                  {/* Visual decorations for the traditional notice board */}
                  <div className="absolute top-2 left-2 right-2 bottom-2 border border-dashed border-[#C21E17]/30 pointer-events-none rounded" />
                  
                  {/* Render the KaTeX formula */}
                  <LatexRenderer latex={sanitizeLatex(result.latexPoster)} />
                </div>
              </div>

              {/* Explanations */}
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-black/80">
                  🏮 大字报已生成！特别针对长辈视力优化，字大易读。
                </p>
                <p className="text-xs text-black/70">
                  点击下方按钮可直接保存到相册、复制或发送给家人。
                </p>
              </div>
            </div>

            {/* Poster Actions */}
            <div className="flex gap-3 pt-2 border-t border-dashed border-[#d0ccc4]">
              {canShareNativePoster && (
                <button
                  onClick={handleNativeSharePoster}
                  disabled={isPosterSaving}
                  className="flex-1 py-3 rounded-full bg-verified-dark text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-verified cursor-pointer border-none disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4" />
                  发送给朋友
                </button>
              )}
              <button
                onClick={handleCopyToClipboardPoster}
                disabled={isPosterSaving}
                className="flex-1 py-3 rounded-full bg-black/5 text-[#2C2C2C] text-sm font-bold flex items-center justify-center gap-2 hover:bg-black/10 cursor-pointer border-none disabled:opacity-50"
              >
                <ClipboardCopy className="w-4 h-4" />
                {isPosterSaving ? "生成中..." : "复制图片"}
              </button>
              <button
                onClick={handleDirectDownloadPoster}
                disabled={isPosterSaving}
                className="flex-1 py-3 rounded-full bg-[#2C2C2C] text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-black cursor-pointer border-none disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isPosterSaving ? "生成中..." : "下载大字报"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
