import { motion } from "motion/react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidChart from './MermaidChart';
import { Eye } from 'lucide-react';

export type StatusType = "Verified" | "Fake" | "Doubtful";

export interface AnalysisResult {
  status: StatusType;
  content: string;
  sourceText: string;
  timestamp: string;
}

const statusColors = {
  Verified: "#5A7863", // Morandi Green
  Fake: "#A96159", // Dried Rose Red
  Doubtful: "#C29F68", // Dark Mustard Yellow
};

const statusText = {
  Verified: "证实",
  Fake: "伪造",
  Doubtful: "存疑",
};

export default function ResultTicket({ result, onReviewWorkflow }: { result: AnalysisResult, onReviewWorkflow?: () => void }) {
  return (
    <div className="w-full flex flex-col items-center mt-8">
      {/* 打印机槽口 / Printer Slot */}
      <motion.div 
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-xl h-[2px] bg-gradient-to-r from-transparent via-[#2C2C2C]/15 to-transparent relative z-20 shadow-[0_1px_2px_rgba(0,0,0,0.03)] rounded-[100%]"
      />
      
      {/* 纸张容器 / Paper Container - 高度自顶向下展开配合内部元素反向平移，完美模拟真实吐纸 */}
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: "auto" }}
        transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.4 }}
        className="w-full max-w-xl origin-top relative z-10 overflow-hidden px-4"
        style={{ marginTop: "-2px" }}
      >
        <motion.div
          initial={{ y: "-100%" }}
          animate={{ y: "0%" }}
          transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.4 }}
          className="pb-4 pt-2"
        >
          <div className="receipt p-8 font-mono text-sm tracking-tight text-[#2C2C2C]">
            <div className="sawtooth-top"></div>
            <div className="sawtooth-bottom"></div>
            
            <div className="text-center border-b border-dashed border-[#d0ccc4] pb-6 mb-6">
              <h2 className="text-lg font-bold tracking-widest uppercase mb-1 opacity-80">FACT CHECK TICKET</h2>
              <p className="text-xs opacity-50">SYS.ID {Math.floor(Math.random() * 899999 + 100000)}</p>
              <p className="text-xs opacity-50">{result.timestamp}</p>
            </div>

            <div className="space-y-6 mb-12 leading-relaxed">
              <div className="opacity-90">
                <span className="text-xs opacity-50 block mb-1">CLAIM:</span>
                "{result.sourceText}"
              </div>
              <div className="pl-4 border-l border-[#d0ccc4] opacity-90 markdown-body prose prose-sm prose-stone max-w-none">
                <span className="text-xs opacity-50 block mb-2 font-mono tracking-widest uppercase">ANALYSIS:</span>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      if (!inline && match && match[1] === 'mermaid') {
                        return <MermaidChart chart={String(children).replace(/\n$/, '')} />
                      }
                      return <code className={className} {...props}>{children}</code>
                    },
                    a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-[#C29F68] underline decoration-[#C29F68]/30 hover:decoration-[#C29F68] transition-colors" />,
                    h1: ({node, ...props}) => <h1 {...props} className="text-lg font-bold mt-4 mb-2" />,
                    h2: ({node, ...props}) => <h2 {...props} className="text-base font-bold mt-3 mb-2" />,
                    h3: ({node, ...props}) => <h3 {...props} className="text-sm font-bold mt-2 mb-1" />,
                    ul: ({node, ...props}) => <ul {...props} className="list-disc pl-4 space-y-1 my-2" />,
                    ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-4 space-y-1 my-2" />,
                    li: ({node, ...props}) => <li {...props} className="leading-relaxed text-[#2C2C2C]/80" />,
                    p: ({node, ...props}) => <p {...props} className="mb-3 leading-relaxed text-[#2C2C2C]/90" />,
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
               <div className="text-xs opacity-40">
                  [ END OF REPORT ]
               </div>
               
               {/* 盖章动效 / Stamp Animation */}
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
                 className="absolute right-0 bottom-0 border-4 rounded-sm px-4 py-1.5 font-bold text-3xl tracking-[0.2em] mix-blend-multiply origin-center"
                 style={{
                   borderColor: statusColors[result.status],
                   color: statusColors[result.status],
                 }}
               >
                 {statusText[result.status]}
               </motion.div>
            </div>
            
            {onReviewWorkflow && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={onReviewWorkflow}
                  className="px-6 py-2.5 rounded-full border border-[#d0ccc4] text-[#2C2C2C]/70 hover:text-[#2C2C2C] hover:bg-[#FAF8F5] transition-colors flex items-center gap-2 text-xs font-mono uppercase tracking-widest"
                >
                  <Eye className="w-4 h-4" />
                  查看思考过程 (View Workflow)
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
