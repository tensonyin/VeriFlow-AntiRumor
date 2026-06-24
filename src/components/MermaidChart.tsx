import { useEffect, useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export default function MermaidChart({ chart }: { chart: string }) {
  const [srcDoc, setSrcDoc] = useState('');
  const [iframeHeight, setIframeHeight] = useState(400);
  const [zoom, setZoom] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!chart) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 16px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            background: transparent;
            font-family: 'Inter', sans-serif;
            overflow: visible;
            min-height: 100%;
          }
          .mermaid {
            background: transparent;
            width: 100%;
          }
          .mermaid svg {
            max-width: 100%;
            height: auto !important;
          }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"><\/script>
        <script>
          document.addEventListener("DOMContentLoaded", () => {
            mermaid.initialize({
              startOnLoad: true,
              theme: 'base',
              themeVariables: {
                primaryColor: 'transparent',
                primaryTextColor: '#2C2C2C',
                primaryBorderColor: '#A39C94',
                lineColor: '#A39C94',
                secondaryColor: '#EAE6DF',
                tertiaryColor: '#FAF8F5',
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px'
              },
              securityLevel: 'loose',
              flowchart: { useMaxWidth: true, htmlLabels: true }
            });

            // Wait for mermaid to finish rendering, then report height
            const observer = new MutationObserver(() => {
              const svg = document.querySelector('.mermaid svg');
              if (svg) {
                observer.disconnect();
                setTimeout(() => {
                  const rect = document.body.getBoundingClientRect();
                  const contentHeight = Math.max(rect.height, svg.getBoundingClientRect().height + 40);
                  window.parent.postMessage({ type: 'mermaid-height', height: contentHeight }, '*');
                }, 200);
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
          });
        <\/script>
      </head>
      <body>
        <div class="mermaid">
          ${chart}
        </div>
      </body>
      </html>
    `;
    setSrcDoc(htmlContent);
  }, [chart]);

  // Listen for height messages from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'mermaid-height' && typeof e.data.height === 'number') {
        setIframeHeight(Math.max(200, Math.ceil(e.data.height)));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.2, 2.5)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.2, 0.4)), []);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset position when zoom resets
  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return; // Only allow drag when zoomed
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!chart) return null;

  return (
    <div className="relative w-full my-6">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white/70 backdrop-blur-sm rounded-lg border border-[#d0ccc4]/40 p-0.5 shadow-sm">
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded hover:bg-[#FAF8F5] transition-colors"
          title="缩小 (Zoom out)"
        >
          <ZoomOut className="w-3.5 h-3.5 text-[#2C2C2C]/60" />
        </button>
        <button
          onClick={handleZoomReset}
          className="px-2 py-1 text-[10px] font-mono text-[#2C2C2C]/50 hover:text-[#2C2C2C] rounded hover:bg-[#FAF8F5] transition-colors min-w-[40px]"
          title="重置 (Reset zoom)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded hover:bg-[#FAF8F5] transition-colors"
          title="放大 (Zoom in)"
        >
          <ZoomIn className="w-3.5 h-3.5 text-[#2C2C2C]/60" />
        </button>
      </div>

      {/* Chart container */}
      <div 
        className="w-full overflow-hidden rounded-lg border border-[#d0ccc4]/20 bg-white/30"
        style={{ maxHeight: '70vh' }}
      >
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            width: '100%',
            transition: isDragging ? 'none' : 'transform 0.2s ease',
            cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            title="Mermaid Chart"
            className="w-full border-none bg-transparent pointer-events-none"
            scrolling="no"
            style={{
              height: `${iframeHeight}px`,
              colorScheme: 'auto',
              display: 'block',
            }}
          />
        </div>
      </div>
    </div>
  );
}
