import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type StepStatus = "pending" | "processing" | "done";

export interface WorkflowStep {
  id: string;
  type: "search" | "ai_check" | "metadata" | "conclusion";
  title: string;
  status: StepStatus;
  details: string[];
}

export default function ThinkingWorkflow({ steps, isFinished = false, isElderlyMode = false }: { steps: WorkflowStep[], isFinished?: boolean, isElderlyMode?: boolean }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Track which node we last auto-expanded so we don't re-trigger on the same node
  const lastAutoExpandedRef = useRef<string | null>(null);

  // Auto-expand: when a NEW done node appears, expand it.
  useEffect(() => {
    if (isFinished) return; // In review mode, don't auto-expand

    const doneSteps = steps.filter(s => s.status === "done" && s.details.length > 0 && !!s.details[0]);
    const latestDone = doneSteps.length > 0 ? doneSteps[doneSteps.length - 1] : null;

    if (latestDone && latestDone.id !== lastAutoExpandedRef.current) {
      // A new node just completed — auto-expand it without closing others
      lastAutoExpandedRef.current = latestDone.id;
      setExpandedIds(prev => new Set(prev).add(latestDone.id));
      
      // Auto-scroll the window to the bottom when a new node expands
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  }, [steps, isFinished]);

  const toggleExpand = (id: string, status: StepStatus, hasContent: boolean) => {
    // Only allow expanding done nodes that actually have content
    if (status !== "done" || !hasContent) return;
    
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-col relative">
        {/* Continuous Timeline line */}
        <div className="absolute left-[15px] top-4 bottom-8 w-px bg-[#d0ccc4]/50 z-0"></div>

        <motion.div layout className="relative z-10 w-full">
          <AnimatePresence initial={false}>
          {steps.map((step, index) => {
            const hasContent = !isElderlyMode && step.status === "done" && step.details.length > 0 && !!step.details[0];
            const isExpanded = !isElderlyMode && expandedIds.has(step.id);
            
            // Extract Chinese portion of the title if in elderly mode
            const displayTitle = isElderlyMode ? step.title.replace(/[a-zA-Z\s_-]+$/, '').trim() : step.title;
            
            return (
              <motion.div
                layout
                key={step.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative z-10 flex flex-col mb-4"
              >
                <motion.div 
                  layout="position"
                  className={`flex items-start gap-4 ${
                    hasContent
                      ? "cursor-pointer hover:opacity-80"
                      : "cursor-default"
                  }`}
                  onClick={() => toggleExpand(step.id, step.status, hasContent)}
                >
                  {/* Icon/Status Indicator */}
                  <div className="relative flex-shrink-0 w-[30px] h-[30px] rounded-full bg-[#FAF8F5] border border-[#d0ccc4] flex items-center justify-center mt-0.5">
                    {step.status === "done" ? (
                      <Check className="w-3.5 h-3.5 text-[#A39C94]" />
                    ) : step.status === "processing" ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#8E9B90] shadow-[0_0_8px_#8E9B90] animate-pulse"></div>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d0ccc4]/50"></div>
                    )}
                  </div>

                  {/* Title & Chevron */}
                  <div className={`flex-1 flex items-center pt-1 transition-opacity duration-300 ${step.status === "pending" ? "opacity-30" : "opacity-90"}`}>
                    <span className={`${isElderlyMode ? 'text-lg font-bold' : 'text-sm font-medium'} tracking-wide text-[#2C2C2C]`}>
                      {displayTitle}
                    </span>
                    {hasContent && (
                      <ChevronRight 
                        className={`w-4 h-4 ml-2 opacity-30 transition-transform duration-300 ${isExpanded ? "rotate-90" : ""}`} 
                      />
                    )}
                    {step.status === "processing" && (
                      <Loader2 className="w-3.5 h-3.5 ml-2 opacity-40 animate-spin" />
                    )}
                  </div>
                </motion.div>

                {/* Collapsible Details — only for done nodes with content */}
                <AnimatePresence initial={false}>
                  {isExpanded && step.status === "done" && (
                    <motion.div
                      layout
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="py-3 px-4 mt-2 bg-white/40 border border-[#d0ccc4]/30 rounded-lg backdrop-blur-sm max-h-[40vh] overflow-y-auto custom-scrollbar">
                        <div className="text-xs text-[#2C2C2C]/80 leading-relaxed prose prose-xs prose-stone max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                              a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-[#C29F68] underline decoration-[#C29F68]/30" />,
                              ul: (props) => <ul {...props} className="list-disc pl-4 space-y-0.5 my-1" />,
                              ol: (props) => <ol {...props} className="list-decimal pl-4 space-y-0.5 my-1" />,
                              li: (props) => <li {...props} className="leading-relaxed" />,
                              h1: (props) => <h1 {...props} className="text-sm font-bold mt-2 mb-1" />,
                              h2: (props) => <h2 {...props} className="text-xs font-bold mt-2 mb-1" />,
                              h3: (props) => <h3 {...props} className="text-xs font-semibold mt-1 mb-0.5" />,
                              blockquote: (props) => <blockquote {...props} className="border-l-2 border-[#d0ccc4] pl-2 italic opacity-70 my-1" />,
                              code: ({children, className}) => {
                                const isBlock = className?.includes('language-');
                                if (isBlock) {
                                  return <pre className="bg-[#FAF8F5] p-2 rounded text-[10px] overflow-x-auto my-1"><code>{children}</code></pre>;
                                }
                                return <code className="bg-[#FAF8F5] px-1 rounded text-[10px]">{children}</code>;
                              },
                            }}
                          >
                            {step.details[0]}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
