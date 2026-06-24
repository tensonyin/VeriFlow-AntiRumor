import { motion } from "motion/react";
import MermaidChart from "./MermaidChart";

interface Source {
  title: string;
  url: string;
}

export default function EvidenceSection({ chart, sources }: { chart: string, sources: Source[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2.2, duration: 0.8, ease: "easeOut" }}
      className="max-w-2xl mx-auto pb-24 px-4"
    >
      <div className="flex items-center mb-8 mt-12">
        <div className="flex-1 h-px bg-[#d0ccc4]"></div>
        <div className="px-4 text-xs font-mono tracking-widest text-[#2C2C2C] opacity-40 uppercase">Evidence Chain</div>
        <div className="flex-1 h-px bg-[#d0ccc4]"></div>
      </div>

      <MermaidChart chart={chart} />

      {sources && sources.length > 0 && (
        <div className="mt-12 space-y-3">
          <p className="text-xs font-mono opacity-40 mb-4 px-2 uppercase">References</p>
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
