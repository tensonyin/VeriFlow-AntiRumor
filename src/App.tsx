import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, RotateCcw, Paperclip, X } from "lucide-react";
import ResultTicket, { AnalysisResult } from "./components/ResultTicket";
import EvidenceSection from "./components/EvidenceSection";
import RoseFourLoader from "./components/RoseFourLoader";
import ThinkingWorkflow, { WorkflowStep } from "./components/ThinkingWorkflow";

type AppState = "initial" | "analyzing" | "result" | "review_workflow";

export default function App() {
  const [appState, setAppState] = useState<AppState>("initial");
  const [query, setQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [recentSearches, setRecentSearches] = useState([
    "The Great Wall of China is visible from space",
    "Goldfish have a three-second memory",
    "Lightning never strikes the same place twice"
  ]);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [firstResponseReceived, setFirstResponseReceived] = useState(false);
  const [mermaidChart, setMermaidChart] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles].slice(0, 5));
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
  
  const executeAnalysis = async (q: string, files: File[] = selectedFiles) => {
    if (!q.trim() && files.length === 0) return;
    setQuery(q);
    setAppState("analyzing");
    setFirstResponseReceived(false);
    setWorkflowSteps([]);
    setMermaidChart("");
    
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

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
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
                  setWorkflowSteps(prev => [...prev, {
                    id: data.data.node_id,
                    type: data.data.node_type,
                    title: data.data.title || data.data.node_type,
                    status: 'processing',
                    details: []
                  }]);
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
                  const cleaned = mermaidText
                    .replace(/^```mermaid\s*/i, '')
                    .replace(/\s*```\s*$/, '')
                    .trim();
                  // Ensure we only set it if it actually looks like a mermaid chart
                  if (cleaned && (cleaned.startsWith('graph') || cleaned.startsWith('flowchart'))) {
                    setMermaidChart(cleaned);
                  }
                }

                // In the new DSL, the correct report is aggregated and output at the end.
                // We'll capture report text from explicitly named output nodes, or we can just
                // rely on workflow_finished. For safety, let's also capture from Report Out nodes.
                if (nodeTitle === 'Report Out' || nodeTitle === 'Report Adjustment Out' || nodeTitle === 'Insufficiency Out') {
                   const endText = data.data.outputs?.text || "";
                   if (endText.trim()) capturedReportText = endText.trim();
                }

                // Update workflow step details — extract only the 'text' field
                const textOutput = data.data.outputs?.text || '';
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

                const fileNames = files.map(f => f.name).join(", ");
                const searchStr = q || fileNames;
                
                setResult({
                  status: finalStatus,
                  content: resultText,
                  sourceText: searchStr,
                  timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
                });
                
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

  const resetState = () => {
    setAppState("initial");
    setQuery("");
    setResult(null);
    setSelectedFiles([]);
  };

  return (
    <div className="min-h-screen relative selection:bg-[#c0bba6] selection:text-white">
      {/* Background grain texture for "paper/sand" feel (optional) */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

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
              <motion.div 
                layoutId="search-bar"
                transition={{ type: "spring", stiffness: 140, damping: 18, mass: 0.8 }}
                className="w-full max-w-2xl relative"
              >
                <form onSubmit={handleAnalyzeSubmit}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    multiple
                    accept=".txt,.md,.mdx,.markdown,.pdf,.html,.xlsx,.xls,.doc,.docx,.csv,.eml,.msg,.pptx,.ppt,.xml,.epub,image/jpeg,image/png,image/gif,image/webp,image/svg+xml,audio/mpeg,audio/mp3,audio/m4a,audio/wav,audio/amr,video/mp4,video/quicktime,video/mpeg,video/webm"
                    className="hidden"
                  />
                  <div className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={appState === "analyzing" || selectedFiles.length >= 5}
                      className="p-2 flex-shrink-0 sm:p-3 rounded-xl w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed border border-transparent hover:border-black/5"
                      title="Upload file (Max 5)"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    {selectedFiles.length > 0 && (
                      <div className="flex gap-1 overflow-x-auto max-w-[150px] sm:max-w-[250px] scrollbar-hide no-scrollbar pr-2 items-center m-0 flex-shrink-0">
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} className="flex-shrink-0 flex items-center gap-1 bg-white/40 backdrop-blur-md px-2 py-1 sm:px-3 sm:py-1.5 rounded-full border border-white/50 text-xs font-mono max-w-[80px] sm:max-w-[120px]">
                            <span className="truncate">{file.name}</span>
                            <button type="button" onClick={() => removeFile(idx)} className="opacity-60 hover:opacity-100 p-0.5" title="Remove file">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    disabled={appState === "analyzing"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={selectedFiles.length > 0 ? "Add context..." : "Enter a claim, URL, or rumor to verify..."}
                    className={`w-full h-16 sm:h-20 rounded-2xl glass-input ${selectedFiles.length > 0 ? 'pl-[130px] sm:pl-[240px]' : 'pl-[60px] sm:pl-[76px]'} pr-16 sm:pr-20 text-lg sm:text-xl font-light outline-none transition-all duration-300 placeholder:text-[#2C2C2C] placeholder:opacity-30`}
                  />
                  <button 
                    type="submit" 
                    disabled={appState === "analyzing" || (!query.trim() && selectedFiles.length === 0)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 sm:p-4 rounded-xl opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30"
                  >
                    {appState === "analyzing" ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                        <Search className="w-5 h-5 sm:w-6 sm:h-6" />
                      </motion.div>
                    ) : (
                      <Search className="w-5 h-5 sm:w-6 sm:h-6" />
                    )}
                  </button>
                </form>
              </motion.div>
              
              {appState === "initial" && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="w-full max-w-2xl mt-4 overflow-x-auto"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  <div className="flex gap-2 px-1 pb-2 w-max mx-auto sm:mx-0">
                    {recentSearches.map((search, idx) => (
                      <button
                        key={idx}
                        onClick={() => executeAnalysis(search)}
                        className="px-4 py-1.5 rounded-full border border-white/40 bg-white/30 backdrop-blur-md text-xs font-mono text-[#2C2C2C]/60 hover:text-[#2C2C2C] hover:bg-white/60 transition-all cursor-pointer truncate max-w-[200px] sm:max-w-[300px]"
                      >
                        {search}
                      </button>
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
                  Multimodal Rumor Terminator
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
                        className={`flex w-full ${(firstResponseReceived || appState === "review_workflow") ? "flex-row items-start gap-4 sm:gap-6" : "flex-col items-center justify-center mt-12"}`}
                      >
                        {appState !== "review_workflow" && (
                          <motion.div
                            layout
                            initial={false}
                            animate={{ 
                              width: firstResponseReceived ? 56 : 280,
                              height: firstResponseReceived ? 56 : 280,
                            }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="relative flex flex-col items-center justify-center flex-shrink-0"
                          >
                            <RoseFourLoader className="w-full h-full opacity-80" color="#2C2C2C" />
                            
                            <AnimatePresence>
                              {!firstResponseReceived && (
                                <motion.p 
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="font-mono text-sm uppercase tracking-widest opacity-50 absolute -bottom-16 whitespace-nowrap flex items-center"
                                >
                                  Initializing AI agent
                                  <span className="inline-flex ml-1 w-6">
                                    <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0 }}>.</motion.span>
                                    <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0.2 }}>.</motion.span>
                                    <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0.4 }}>.</motion.span>
                                  </span>
                                </motion.p>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )}

                        <AnimatePresence>
                          {(firstResponseReceived || appState === "review_workflow") && (
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              className="flex-1 w-full pt-1"
                            >
                              <ThinkingWorkflow steps={workflowSteps} isFinished={appState === "review_workflow"} />
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
                      <ResultTicket result={result} onReviewWorkflow={() => setAppState("review_workflow")} />
                      <EvidenceSection 
                        chart={mermaidChart || fallbackChart} 
                        sources={[]} 
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

