import { motion } from "motion/react";
import MermaidChart from "./MermaidChart";

interface Source {
  title: string;
  url: string;
}

export default function EvidenceSection({ chart, sources, isElderlyMode = false }: { chart: string, sources: Source[], isElderlyMode?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2.2, duration: 0.8, ease: "easeOut" }}
      className="max-w-2xl mx-auto pb-24 px-4"
    >
      <div className="flex items-center mb-8 mt-12">
        <div className="flex-1 h-px bg-[#d0ccc4]"></div>
        <div className={`px-4 ${isElderlyMode ? 'text-lg font-bold' : 'text-xs font-mono tracking-widest uppercase'} text-[#2C2C2C] opacity-40`}>
          证据链 / 核查时间线
        </div>
        <div className="flex-1 h-px bg-[#d0ccc4]"></div>
      </div>

      {isElderlyMode ? (
         <div className="w-full bg-white p-8 rounded-2xl border-2 border-black/10 shadow-sm text-center">
            <h3 className="text-xl font-bold mb-4 text-black">极简连环画大事件时间轴</h3>
            <p className="text-[#2C2C2C]/60">此区域将展示后端返回的图片/时间线动画。</p>
            <div className="mt-6 flex flex-col gap-4 text-left">
               <div className="flex gap-4 items-center bg-[#FAF8F5] p-4 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-[#00B86B] text-white flex items-center justify-center font-bold">1</div>
                  <div className="text-lg">已前往全网检索该传言...</div>
               </div>
               <div className="flex gap-4 items-center bg-[#FAF8F5] p-4 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-[#FFCC00] text-black flex items-center justify-center font-bold">2</div>
                  <div className="text-lg">提取视频原画面，未发现修改痕迹...</div>
               </div>
               <div className="flex gap-4 items-center bg-[#FAF8F5] p-4 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-[#FF3B30] text-white flex items-center justify-center font-bold">3</div>
                  <div className="text-lg">但原话已被掐头去尾，改变了原本含义！</div>
               </div>
            </div>
         </div>
      ) : (
        <MermaidChart chart={chart} />
      )}

      {sources && sources.length > 0 && (
        <div className="mt-12 space-y-3">
          <p className="text-xs font-mono opacity-40 mb-4 px-2 uppercase">参考链接 (References)</p>
          {sources.map((src, i) => (
             <motion.a
               key={i}
               initial={{ opacity: 0, x: -10 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: 2.4 + i * 0.15, duration: 0.6, ease: "easeOut" }}
               href={src.url}
               target="_blank"
               rel="noopener noreferrer"
               className="block p-4 border border-[#d0ccc4]/50 hover:bg-[#FAF8F5]/50 hover:border-[#c0bba6] rounded transition-all group"
             >
               <h4 className="text-sm font-medium opacity-80 group-hover:opacity-100 mb-1">{src.title}</h4>
               <p className="text-xs font-mono opacity-40 truncate">{src.url}</p>
             </motion.a>
          ))}
        </div>
      )}
    </motion.div>
  );
}
