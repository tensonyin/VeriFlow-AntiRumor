import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, RotateCcw, Paperclip, X, Clock, Mic, Camera, FileText } from "lucide-react";
import ResultTicket, { AnalysisResult } from "./components/ResultTicket";
import RoseFourLoader from "./components/RoseFourLoader";
import ThinkingWorkflow, { WorkflowStep } from "./components/ThinkingWorkflow";
import HorizontalScrollList from "./components/HorizontalScrollList";
import GlassIcons, { GlassIconsItem } from "./components/GlassIcons";
import SplitText from "./components/SplitText";
import ShinyText from "./components/ShinyText";
type AppState = "initial" | "analyzing" | "result" | "review_workflow";

export default function App() {
  const [appState, setAppState] = useState<AppState>("initial");
  const [query, setQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [recentSearches, setRecentSearches] = useState([
    "长城在太空中肉眼可见",
    "金鱼只有七秒钟的记忆",
    "闪电绝不会两次击中同一个地方",
    "可乐和曼妥思一起吃会爆炸",
    "吃核桃能补脑"
  ]);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [firstResponseReceived, setFirstResponseReceived] = useState(false);
  const [mermaidChart, setMermaidChart] = useState<string>("");
  
  // New features states
  const [isElderlyMode, setIsElderlyMode] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [tempText, setTempText] = useState("");
  const [history, setHistory] = useState<Array<{query: string, status: string, time: string, steps?: WorkflowStep[], result?: AnalysisResult, mermaidChart?: string}>>(() => {
    const savedNormal = localStorage.getItem('terminator_history_normal');
    if (savedNormal) return JSON.parse(savedNormal);
    const savedOld = localStorage.getItem('terminator_history');
    return savedOld ? JSON.parse(savedOld) : [];
  });
  
  // Audio references
  const printerAudioRef = useRef<HTMLAudioElement | null>(null);
  const stampAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Synchronize history key based on current active mode
  useEffect(() => {
    const key = isElderlyMode ? 'terminator_history_elderly' : 'terminator_history_normal';
    const saved = localStorage.getItem(key);
    if (saved) {
      setHistory(JSON.parse(saved));
    } else if (!isElderlyMode) {
      // Fallback to legacy history for normal mode
      const savedOld = localStorage.getItem('terminator_history');
      setHistory(savedOld ? JSON.parse(savedOld) : []);
    } else {
      setHistory([]);
    }
  }, [isElderlyMode]);

  useEffect(() => {
    printerAudioRef.current = new Audio('/printer.mp3');
    printerAudioRef.current.loop = true;
    stampAudioRef.current = new Audio('/stamp.mp3');
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      
      // Auto-compress fake logic for elderly mode
      const hasLargeFile = newFiles.some(f => f.size > 15 * 1024 * 1024);
      if (hasLargeFile && isElderlyMode) {
        setIsCompressing(true);
        setTimeout(() => {
          setIsCompressing(false);
          setSelectedFiles(prev => [...prev, ...newFiles].slice(0, 5));
        }, 2000);
      } else {
        setSelectedFiles(prev => [...prev, ...newFiles].slice(0, 5));
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };
  
  // Placeholder chart used only when Mermaid_Generator didn't produce output
  const fallbackChart = `graph TD
    A[Public Claim] -->|Fact Checking| B{Sources}
    B --> C[News Outlet]
    B --> D[Scientific Paper]
    C --> E[Misinterpreted Data]
    D --> F[Original Context]
    E --> G((Conclusion))
    F --> G`;
  
  // Test Mode triggered by Ctrl + Alt + T
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        
        setAppState("analyzing");
        setFirstResponseReceived(true);
        setWorkflowSteps([
          { id: "mock1", type: "search", title: "多语言信息源检索", status: "done", details: ["- 已检索中英文报道\n- 找到3篇相关新闻"] },
          { id: "mock2", type: "ai_check", title: "多模态交叉验证", status: "done", details: ["- 视频帧未发现PS痕迹\n- 音频存在明显剪辑断层"] },
          { id: "mock3", type: "metadata", title: "证据链逻辑重构", status: "done", details: ["- 核心矛盾点：事发时间对不上\n- 逻辑重构完成"] }
        ]);
        setMermaidChart("graph TD\n  A[传言] --> B(全网检索)\n  B --> C{交叉比对}\n  C -->|时间线冲突| D[证实造假]\n  C -->|画面被剪辑| D");
        
        if (isElderlyMode && printerAudioRef.current) {
          printerAudioRef.current.play().catch(() => {});
        }

        setTimeout(() => {
          setResult({
            status: "Fake",
            sourceText: "这是一个通过 Ctrl+Alt+T 快捷键生成的测试案例！",
            content: "这是一个**纯前端模拟**的核查报告，您刚刚使用了测试模式跳过了后端的大模型等待时间。\n\n## 结论\n此传言是**虚假**的！通过这个模式您可以快速测试前端界面的各种渲染效果，特别是长辈模式、全屏展示、打字机动画、图片保存等。\n\n*注意：此模式不会消耗任何大模型 Token。*",
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            imageUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop", // placeholder image
            elderlyContent: "亲爱的长辈朋友们，这个测试案例是假货！请大家一定注意防范，不要轻信网络谣言。我们核实了这个案例只是一个纯前端模拟的测试，请您放心！",
            latexPoster: "$$\\begin{array}{c}\\mathbf{\\color{Red}{\\Huge 🌟\\ 测试大字报标题\\ 🌟}} \\\\\\hdashline\\\\\\mathbf{\\color{Crimson}{\\huge 【\\ 辟\\ 谣\\ 通\\ 知\\ 】}} \\\\\\\\\\mathbf{\\color{DarkBlue}{\\Large 亲\\ 爱\\ 的\\ 老\\ 年\\ 朋\\ 友\\ 们\\ ：}} \\\\\\\\\\mathbf{\\color{Black}{\\huge 测\\ 试\\ 案\\ 例\\ 为\\ 假\\ ．\\ 绝\\ 对\\ 别\\ 信\\ ！}} \\\\\\mathbf{\\color{Black}{\\huge 前\\ 端\\ 模\\ 拟\\ 功\\ 模\\ 式\\ ．\\ 只\\ 为\\ 测试\\ ！}} \\\\\\mathbf{\\color{Green}{\\huge 大\\ 字\\ 报\\ 已\\ 生成\\ ．\\ 顺\\ 利\\ 体验\\ ！}} \\\\\\\\\\hdashline\\\\\\mathbf{\\color{OrangeRed}{\\Large 💡\\ 健\\ 康\\ 养\\ 生\\ 小\\ 顺\\ 口\\ 溜\\ 💡}} \\\\\\\\\\mathbf{\\color{DarkCyan}{\\LARGE 测试功能经常用\\ ，\\ 没烦恼\\ ！}} \\\\\\mathbf{\\color{DarkCyan}{\\LARGE 谣言终结保平安\\ ，\\ 身体好\\ ！}} \\\\\\\\\\hdashline\\\\\\mathbf{\\color{Gold}{\\Large 💖\\ 祝\\ 您\\ 身体\\ 健\\ 康\\ ．\\ 万\\ 事\\ 如\\ 意\\ 💖}}\\end{array}$$",
          });
          setAppState("review_workflow");
        }, 3000); // 3 seconds mock delay
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isElderlyMode]);

  const executeAnalysis = async (q: string, files: File[] = selectedFiles) => {
    if (!q.trim() && files.length === 0) return;
    setQuery(q);
    setAppState("analyzing");
    setFirstResponseReceived(false);
    setWorkflowSteps([]);
    setMermaidChart("");
    
    if (isElderlyMode && printerAudioRef.current) {
      printerAudioRef.current.play().catch(() => {});
    }
    
    if (q.trim()) {
      setRecentSearches(prev => {
        const filtered = prev.filter(item => item !== q);
        return [q, ...filtered].slice(0, 5);
      });
    }

    try {
      const formData = new FormData();
      if (q.trim()) formData.append('query', q);
      files.forEach(f => formData.append('files', f));
      formData.append('isElderlyMode', String(isElderlyMode));

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
        signal: abortController.signal
      });

      if (!response.ok) {
        let errMsg = "Analysis failed";
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch(e) {}
        throw new Error(errMsg);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      let finalStatus: "Verified" | "Fake" | "Doubtful" = "Doubtful"; // default fallback
      let capturedReportText = ''; // Captured from the correct report end node
      let capturedElderlyReport = '';
      let capturedLatexPoster = '';
      let localMermaidChart = '';
      let localSteps: WorkflowStep[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            
            try {
              const data = JSON.parse(dataStr);
              
              if (data.event === 'workflow_started') {
                setFirstResponseReceived(true);
              } else if (data.event === 'node_started') {
                if (!firstResponseReceived) setFirstResponseReceived(true);
                // Do not show the end nodes in the thinking tree
                if (data.data.node_type !== 'end') {
                  const newStep: WorkflowStep = {
                    id: data.data.node_id,
                    type: data.data.node_type,
                    title: data.data.title || data.data.node_type,
                    status: 'processing',
                    details: []
                  };
                  localSteps.push(newStep);
                  setWorkflowSteps(prev => [...prev, newStep]);
                }
              } else if (data.event === 'node_finished') {
                const nodeTitle = data.data.title || "";
                
                // Determine final status from "定性裁决 Final Judge"
                if (nodeTitle.includes("定性裁决") || nodeTitle.includes("Final Judge")) {
                  const judgeText = data.data.outputs?.text || "";
                  const firstTwoChars = judgeText.substring(0, 2);
                  if (firstTwoChars === "证实") finalStatus = "Verified";
                  else if (firstTwoChars === "伪造") finalStatus = "Fake";
                  else if (firstTwoChars === "存疑") finalStatus = "Doubtful";
                }

                // Capture Mermaid output (handles both old and new DSL node names)
                if (nodeTitle.includes('Mermaid') || nodeTitle.includes('流程图代码')) {
                  const mermaidText = data.data.outputs?.text || "";
                  const match = mermaidText.match(/```mermaid([\s\S]*?)```/i);
                  let cleaned = mermaidText;
                  if (match) {
                    cleaned = match[1].trim();
                  } else {
                    cleaned = mermaidText.replace(/^```mermaid\s*/i, '').replace(/\s*```\s*$/, '').trim();
                  }
                  // Ensure we only set it if it actually looks like a mermaid chart
                  if (cleaned && (cleaned.startsWith('graph') || cleaned.startsWith('flowchart'))) {
                    setMermaidChart(cleaned);
                    localMermaidChart = cleaned;
                  }
                }

                // In the new DSL, the correct report is aggregated and output at the end.
                if (nodeTitle.includes('Report Adjustment Out') || nodeTitle.includes('Report Adjustment') || nodeTitle.includes('报告修正')) {
                   const txt = data.data.outputs?.text || "";
                   if (txt.trim()) {
                     capturedReportText = txt.trim();
                   }
                } else if (nodeTitle.includes('Report Out') || nodeTitle === '结束' || nodeTitle.includes('变量聚合器')) {
                   const txt = data.data.outputs?.text || "";
                   if (txt.trim() && !capturedReportText) {
                     capturedReportText = txt.trim();
                   }
                }

                // Capture "安心报告生成 Elderly Report Generation" output
                if (nodeTitle.includes('安心报告') || nodeTitle.includes('Elderly Report') || data.data.node_id === '1782465366127') {
                   const elderlyText = data.data.outputs?.text || "";
                   if (elderlyText.trim()) {
                     capturedElderlyReport = elderlyText.trim();
                   }
                }

                // Capture "LaTex大字报生成 LaTex Poster Generation" output
                if (nodeTitle.includes('LaTex') || nodeTitle.includes('Poster') || data.data.node_id === '1782470849360') {
                   const latexText = data.data.outputs?.text || "";
                   if (latexText.trim()) {
                     capturedLatexPoster = latexText.trim();
                   }
                }

                // Update workflow step details — extract only the 'text' field
                const textOutput = data.data.outputs?.text || '';
                localSteps = localSteps.map(step => 
                  step.id === data.data.node_id 
                    ? { ...step, status: 'done', details: textOutput ? [textOutput] : [] } 
                    : step
                );
                setWorkflowSteps(prev => prev.map(step => 
                  step.id === data.data.node_id 
                    ? { ...step, status: 'done', details: textOutput ? [textOutput] : [] } 
                    : step
                ));
              } else if (data.event === 'workflow_finished') {
                const outputs = data.data.outputs || {};
                
                // Prefer the report text we captured from the specific end node.
                // Fall back to workflow_finished.outputs.text only if we didn't capture anything.
                let resultText = capturedReportText;
                
                if (!resultText) {
                  // Fallback: try outputs.text, but filter out mermaid content
                  const rawText = outputs.text ? String(outputs.text).trim() : '';
                  if (rawText && !rawText.startsWith('graph ') && !rawText.startsWith('flowchart ')) {
                    resultText = rawText;
                  } else {
                    // Scan all output values for a non-mermaid string
                    for (const val of Object.values(outputs)) {
                      if (val && typeof val === 'string' && val.trim() 
                          && !val.trim().startsWith('graph ') 
                          && !val.trim().startsWith('flowchart ')) {
                        resultText = val.trim();
                        break;
                      }
                    }
                  }
                  if (!resultText) {
                    resultText = JSON.stringify(outputs, null, 2);
                  }
                }

                // Ensure no mermaid block is left in the report text
                if (resultText && typeof resultText === 'string') {
                  const mermaidMatch = resultText.match(/```mermaid\n?([\s\S]*?)```/i);
                  if (mermaidMatch && !localMermaidChart) {
                    setMermaidChart(mermaidMatch[1].trim());
                    localMermaidChart = mermaidMatch[1].trim();
                  }

                  const cleanedText = resultText.replace(/```mermaid[\s\S]*?```/gi, '').trim();
                  // We only replace if there's still some text left (in case it was exclusively a mermaid block, though unlikely)
                  if (cleanedText) {
                    resultText = cleanedText;
                  }
                }

                const fileNames = files.map(f => f.name).join(", ");
                const searchStr = q || fileNames;
                
                const timeStr = new Date().toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  hour12: false
                }).replace(/\//g, '-');
                const generatedSystemId = String(Math.floor(Math.random() * 899999 + 100000));
                
                let imageUrlStr = "";
                for (const val of Object.values(outputs)) {
                  if (Array.isArray(val) && val.length > 0 && val[0].url) {
                    imageUrlStr = val[0].url;
                    break;
                  }
                }
                
                const finalResultObj: AnalysisResult = {
                  status: finalStatus,
                  content: resultText,
                  sourceText: searchStr,
                  timestamp: timeStr,
                  imageUrl: imageUrlStr,
                  elderlyContent: capturedElderlyReport,
                  latexPoster: capturedLatexPoster,
                  systemId: generatedSystemId,
                };
                
                setResult(finalResultObj);
                
                // Save to history using localSteps to capture latest steps synchronously and safely
                setHistory(prev => {
                  const newHistory = [{ 
                    query: searchStr, 
                    status: finalStatus, 
                    time: timeStr,
                    steps: localSteps,
                    result: finalResultObj,
                    mermaidChart: localMermaidChart
                  }, ...prev].slice(0, 20);
                  const key = isElderlyMode ? 'terminator_history_elderly' : 'terminator_history_normal';
                  localStorage.setItem(key, JSON.stringify(newHistory));
                  return newHistory;
                });
                
                // Stop printer and play stamp
                if (isElderlyMode) {
                  if (printerAudioRef.current) {
                    printerAudioRef.current.pause();
                    printerAudioRef.current.currentTime = 0;
                  }
                  if (stampAudioRef.current) {
                    stampAudioRef.current.play().catch(() => {});
                  }
                  if (navigator.vibrate) {
                    navigator.vibrate([200, 100, 200]);
                  }
                }
                
                // Add a small delay for animation completion before showing result
                setTimeout(() => setAppState("result"), 800);
              }
            } catch (e) {
              // Ignore parse errors from partial lines or ping messages
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Analysis aborted by user.');
        return;
      }
      console.error("Error running analysis:", err);
      // Fallback or error handling
      setResult({
        status: "Doubtful",
        content: `分析失败: ${err.message || 'Error connecting to the backend analysis engine. Please try again later.'}`,
        sourceText: q,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
      });
      setAppState("result");
    }
  };

  const handleAnalyzeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeAnalysis(query, selectedFiles);
  };

  const loadFromHistory = (h: any) => {
    if (h.result && h.steps) {
      setQuery(h.query);
      setResult(h.result);
      setWorkflowSteps(h.steps);
      setMermaidChart(h.mermaidChart || "");
      setAppState("result");
    } else {
      executeAnalysis(h.query);
    }
  };

  const resetState = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAppState("initial");
    setQuery("");
    setResult(null);
    setSelectedFiles([]);
  };

  return (
    <div className={`min-h-screen relative selection:bg-[#c0bba6] selection:text-white ${isElderlyMode ? 'text-black elderly-mode' : 'text-[#2C2C2C]'}`}>
      {/* Background grain texture for "paper/sand" feel (optional) */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

      {/* Elderly Mode Toggle */}
      {appState === "initial" && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
          <span className="text-xs sm:text-sm font-medium opacity-60">👴 长辈模式</span>
          <button 
            onClick={() => setIsElderlyMode(!isElderlyMode)}
            className={`w-12 h-6 rounded-full transition-colors relative ${isElderlyMode ? 'bg-[#00B86B]' : 'bg-[#d0ccc4]'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${isElderlyMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}

      <div className="relative z-10 p-6 sm:p-8">
        
        <AnimatePresence mode="popLayout">
          {appState === "initial" ? (
            <motion.div
              key="center-search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center min-h-[80vh]"
            >
              {/* Title Section with SplitText Animation */}
              <div className="mb-10 text-center select-none flex flex-col items-center">
                <SplitText
                  text="多模态谣言终结者"
                  className="text-4xl sm:text-6xl font-black tracking-wider text-[#2C2C2C] mb-3"
                  delay={100}
                  duration={0.8}
                  ease="power3.out"
                  splitType="chars"
                  tag="h1"
                />
                <p className="text-sm sm:text-base opacity-40 font-mono tracking-widest uppercase">
                  基于多源异构对抗博弈的多模态事实核查系统
                </p>
              </div>

              <motion.div 
                layoutId="search-bar"
                transition={{ type: "spring", stiffness: 140, damping: 18, mass: 0.8 }}
                className="w-full max-w-2xl relative"
              >
                {isCompressing && (
                  <div className="absolute -top-12 left-0 right-0 text-center text-[#00B86B] font-bold text-lg animate-pulse">
                    正在为您压缩优化文件，请稍候...
                  </div>
                )}
                <form onSubmit={handleAnalyzeSubmit}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    multiple
                    accept=".txt,.md,.mdx,.markdown,.pdf,.html,.xlsx,.xls,.doc,.docx,.csv,.eml,.msg,.pptx,.ppt,.xml,.epub,image/jpeg,image/png,image/gif,image/webp,image/svg+xml,audio/mpeg,audio/mp3,audio/m4a,audio/wav,audio/amr,video/mp4,video/quicktime,video/mpeg,video/webm"
                    className="hidden"
                  />
                  
                  {isElderlyMode ? (
                    // Elderly Mode Super Buttons and Large Preview
                    <div className="flex flex-col gap-6 w-full items-center">
                      <GlassIcons 
                        items={[
                          {
                            icon: <FileText className="text-[#0052cc]" />,
                            color: 'blue',
                            label: '📝 输入想问的话',
                            onClick: () => {
                              setTempText(query);
                              setIsTextModalOpen(true);
                            }
                          },
                          {
                            icon: <Camera className="text-[#7a00e6]" />,
                            color: 'purple',
                            label: '📸 拍张照片/发图',
                            onClick: () => fileInputRef.current?.click()
                          },
                          {
                            icon: <Mic className="text-[#008a4f]" />,
                            color: 'green',
                            label: '🎤 录段语音/视频',
                            onClick: () => fileInputRef.current?.click()
                          }
                        ]}
                      />

                      {/* Large Input/File Preview Area */}
                      {(query.trim() || selectedFiles.length > 0) && (
                        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 border-4 border-black/10 shadow-2xl flex flex-col gap-5 text-left mt-4">
                          <div className="flex justify-between items-center border-b-2 border-black/5 pb-3">
                            <span className="text-xl font-black text-black">📋 已选择核查内容</span>
                            <button
                              type="button"
                              onClick={() => {
                                setQuery("");
                                setSelectedFiles([]);
                              }}
                              className="text-lg font-bold text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl border border-red-200 cursor-pointer"
                            >
                              清空重选
                            </button>
                          </div>

                          {query.trim() && (
                            <div className="flex flex-col gap-2">
                              <span className="text-base text-black/60 font-bold">已输入的字：</span>
                              <div className="text-2xl font-black text-black bg-[#FAF8F5] p-5 rounded-2xl border-2 border-black/5 leading-relaxed relative group">
                                "{query}"
                                <button
                                  type="button"
                                  onClick={() => setQuery("")}
                                  className="absolute right-4 top-4 text-base text-red-600 font-bold bg-white px-3 py-1 rounded-lg border border-red-200 shadow-sm cursor-pointer hover:bg-red-50"
                                >
                                  删除文字
                                </button>
                              </div>
                            </div>
                          )}

                          {selectedFiles.length > 0 && (
                            <div className="flex flex-col gap-2">
                              <span className="text-base text-black/60 font-bold">选中的照片或文件：</span>
                              <div className="flex flex-col gap-3">
                                {selectedFiles.map((file, idx) => (
                                  <div key={idx} className="flex items-center justify-between bg-[#FAF8F5] p-4 rounded-2xl border-2 border-black/5">
                                    <div className="flex items-center gap-4 min-w-0">
                                      <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center text-3xl flex-shrink-0">
                                        {file.type.startsWith('image/') ? '🖼️' : file.type.startsWith('audio/') ? '🎵' : file.type.startsWith('video/') ? '🎥' : '📄'}
                                      </div>
                                      <span className="text-xl font-bold text-black truncate">{file.name}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeFile(idx)}
                                      className="text-red-600 font-bold px-4 py-2 bg-white border border-red-200 hover:bg-red-50 rounded-xl text-base shadow-sm cursor-pointer"
                                    >
                                      删除文件
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Standard Input Mode
                    <div className="relative w-full">
                      <div className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={(appState as AppState) === "analyzing" || selectedFiles.length >= 5}
                          className="p-2 flex-shrink-0 sm:p-3 rounded-xl w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed border border-transparent hover:border-black/5"
                          title="上传文件 (最多 5 个)"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                        {selectedFiles.length > 0 && (
                          <div className="flex gap-1 overflow-x-auto max-w-[150px] sm:max-w-[250px] scrollbar-hide no-scrollbar pr-2 items-center m-0 flex-shrink-0">
                            {selectedFiles.map((file, idx) => (
                              <div key={idx} className="flex-shrink-0 flex items-center gap-1 bg-white/40 backdrop-blur-md px-2 py-1 sm:px-3 sm:py-1.5 rounded-full border border-white/50 text-xs font-mono max-w-[80px] sm:max-w-[120px]">
                                <span className="truncate">{file.name}</span>
                                <button type="button" onClick={() => removeFile(idx)} className="opacity-60 hover:opacity-100 p-0.5" title="移除文件">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        disabled={(appState as AppState) === "analyzing"}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder=""
                        className={`w-full h-16 sm:h-20 rounded-2xl glass-input ${selectedFiles.length > 0 ? 'pl-[130px] sm:pl-[240px]' : 'pl-[60px] sm:pl-[76px]'} pr-16 sm:pr-20 text-lg sm:text-xl font-light outline-none transition-all duration-300`}
                      />
                      {!query && (
                        <div className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${selectedFiles.length > 0 ? 'left-[130px] sm:left-[240px]' : 'left-[60px] sm:left-[76px]'}`}>
                          <ShinyText
                            text={selectedFiles.length > 0 ? "补充文字说明..." : "输入要核查的传言、链接或问题..."}
                            disabled={false}
                            speed={2.5}
                            color="#2C2C2C"
                            shineColor="#c0bba6"
                            spread={90}
                            className="text-lg sm:text-xl font-light opacity-50"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={(appState as AppState) === "analyzing" || (!query.trim() && selectedFiles.length === 0)}
                    className={`${isElderlyMode ? 'w-full mt-6 bg-[#00B86B] text-white py-5 rounded-3xl text-2xl font-black shadow-lg hover:bg-[#009E5B]' : 'absolute right-4 top-1/2 -translate-y-1/2'} p-3 sm:p-4 rounded-xl opacity-80 hover:opacity-100 transition-opacity disabled:opacity-30 flex items-center justify-center gap-2 cursor-pointer border-none`}
                  >
                    {(appState as AppState) === "analyzing" ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                        <Search className="w-6 h-6" />
                      </motion.div>
                    ) : (
                      <Search className="w-6 h-6" />
                    )}
                    {isElderlyMode ? <span className="ml-2">开始核查真实性</span> : null}
                  </button>
                </form>
              </motion.div>
              
              {appState === "initial" && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="w-full mt-8"
                >
                  <HorizontalScrollList>
                    {recentSearches.map((search, idx) => (
                      <button
                        key={idx}
                        onClick={() => executeAnalysis(search)}
                        className={`px-4 py-2 flex-shrink-0 rounded-full border border-white/40 bg-white/30 backdrop-blur-md font-mono transition-all cursor-pointer truncate max-w-[200px] sm:max-w-[300px] ${isElderlyMode ? 'text-lg text-black bg-white/70 shadow-sm border-black/10' : 'text-xs text-[#2C2C2C]/60 hover:text-[#2C2C2C] hover:bg-white/60'}`}
                      >
                        {search}
                      </button>
                    ))}
                  </HorizontalScrollList>
                </motion.div>
              )}

              {appState === "initial" && history.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-12 w-full max-w-2xl text-left">
                  <div className="flex items-center gap-2 mb-4 opacity-50">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-bold">历史核查记录</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {history.slice(0, 5).map((h, i) => (
                      <div key={i} className="flex justify-between items-center bg-white/30 p-3 rounded-lg text-sm border border-black/5 hover:bg-white/50 cursor-pointer transition-colors" onClick={() => loadFromHistory(h)}>
                        <span className="truncate max-w-[60%] text-[#2C2C2C]">{h.query}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs opacity-40 font-mono">{h.time}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-bold ${h.status === 'Verified' ? 'bg-[#00B86B]/10 text-[#00B86B]' : h.status === 'Fake' ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 'bg-[#FFCC00]/20 text-[#D4A000]'}`}>{h.status === 'Verified' ? '证实' : h.status === 'Fake' ? '伪造' : '存疑'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {appState === "initial" && (
                <motion.p
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   transition={{ delay: 0.5 }}
                   className="mt-8 text-xs font-mono uppercase tracking-widest opacity-40 text-center"
                >
                  多模态谣言终结者
                </motion.p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="result-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <motion.button
                layoutId="search-bar"
                transition={{ type: "spring", stiffness: 140, damping: 18, mass: 0.8 }}
                onClick={resetState}
                className="fixed top-6 left-6 w-12 h-12 rounded-full glass-input flex items-center justify-center z-50 hover:bg-white/50 transition-colors"
                title="Return to search"
              >
                <RotateCcw className="w-5 h-5 opacity-60" />
              </motion.button>
              
              <div className="pt-24 mt-4">
                <AnimatePresence mode="wait">
                  {(appState === "analyzing" || appState === "review_workflow") && (
                    <motion.div 
                      key="loader"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.5 }}
                      className="flex flex-col min-h-[50vh] w-full max-w-3xl mx-auto pt-10"
                    >
                      <motion.div 
                        layout
                        className={`flex w-full ${(!isElderlyMode && (firstResponseReceived || appState === "review_workflow")) ? "flex-row items-start gap-4 sm:gap-6" : "flex-col items-center justify-center mt-6"}`}
                      >
                        {appState !== "review_workflow" && (
                          <motion.div
                            layout
                            initial={false}
                            animate={{ 
                              width: firstResponseReceived && !isElderlyMode ? 56 : 280,
                              height: firstResponseReceived && !isElderlyMode ? 56 : 280,
                            }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="relative flex flex-col items-center justify-center flex-shrink-0"
                          >
                            {!isElderlyMode ? (
                              <>
                                <RoseFourLoader className="w-full h-full opacity-80" color="#2C2C2C" />
                                <AnimatePresence>
                                  {!firstResponseReceived && (
                                    <motion.p 
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      className="font-mono text-sm uppercase tracking-widest opacity-50 absolute -bottom-16 whitespace-nowrap flex items-center"
                                    >
                                      正在初始化 AI 探员
                                      <span className="inline-flex ml-1 w-6">
                                        <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0 }}>.</motion.span>
                                        <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0.2 }}>.</motion.span>
                                        <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0.4 }}>.</motion.span>
                                      </span>
                                    </motion.p>
                                  )}
                                </AnimatePresence>
                              </>
                            ) : (
                               // Elderly Mode Progress Bar
                              <div className="w-full max-w-sm flex flex-col items-center gap-6 mt-8">
                                <div className="text-2xl font-bold text-black animate-pulse">
                                  机器正在为您全力运转核查中...
                                </div>
                                <div className="w-full h-6 bg-white/50 rounded-full overflow-hidden border border-black/20 shadow-inner">
                                  <motion.div 
                                    className="h-full bg-[#00B86B]"
                                    initial={{ width: "5%" }}
                                    animate={{ width: "95%" }}
                                    transition={{ duration: 30, ease: "linear" }}
                                  />
                                </div>
                                <div className="text-lg text-black/60 font-medium">
                                  预计还需要约 20 秒，请稍候
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}

                        <AnimatePresence>
                          {(firstResponseReceived || appState === "review_workflow") && (
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              className={`flex-1 w-full pt-1 ${isElderlyMode ? 'max-w-xl mx-auto mt-6' : ''}`}
                            >
                              <ThinkingWorkflow steps={workflowSteps} isFinished={appState === "review_workflow"} isElderlyMode={isElderlyMode} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </motion.div>
                  )}
                  
                  {appState === "review_workflow" && (
                    <motion.div
                      key="review-controls"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="fixed top-6 right-6 z-50"
                    >
                      <button
                        onClick={() => setAppState("result")}
                        className="px-4 py-2 rounded-xl bg-white/50 backdrop-blur-md border border-[#d0ccc4] text-xs font-mono text-[#2C2C2C] hover:bg-white transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                        返回小票 (Back to Result)
                      </button>
                    </motion.div>
                  )}
                  
                  {appState === "result" && result && (
                    <motion.div
                      key="result-content"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <ResultTicket result={result} onReviewWorkflow={() => setAppState("review_workflow")} isElderlyMode={isElderlyMode} mermaidChart={mermaidChart} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
      
      {/* Custom Text Input Modal for Elderly Mode */}
      <AnimatePresence>
        {isTextModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border-4 border-black/10 flex flex-col gap-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold text-black">📝 请输入您要核查的话</h3>
                <button 
                  type="button" 
                  onClick={() => setIsTextModalOpen(false)}
                  className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center text-lg font-bold text-black/50 hover:bg-black/10 cursor-pointer border-none"
                >
                  ✕
                </button>
              </div>
              
              <textarea
                value={tempText}
                onChange={(e) => setTempText(e.target.value)}
                placeholder="在此输入或粘贴您听到的传言、消息。例如：'吃核桃能补脑吗？'..."
                className="w-full h-40 p-4 border-2 border-black/20 focus:border-black rounded-2xl text-xl font-bold text-black bg-[#FAF8F5] resize-none outline-none leading-relaxed"
                autoFocus
              />
              
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsTextModalOpen(false)}
                  className="flex-1 py-4 text-xl font-bold bg-black/5 hover:bg-black/10 rounded-2xl text-black cursor-pointer border-none"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuery(tempText);
                    setIsTextModalOpen(false);
                  }}
                  className="flex-1 py-4 text-xl font-bold bg-[#00B86B] hover:bg-[#009E5B] text-white rounded-2xl shadow-md cursor-pointer border-none"
                >
                  确定输入
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


