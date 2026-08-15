import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, RotateCcw, Paperclip, X, Clock, Mic, Camera, FileText, Trash2 } from "lucide-react";
import ResultTicket, { AnalysisResult } from "./components/ResultTicket";
import RoseFourLoader from "./components/RoseFourLoader";
import ThinkingWorkflow, { WorkflowStep } from "./components/ThinkingWorkflow";
import HorizontalScrollList from "./components/HorizontalScrollList";
import GlassIcons, { GlassIconsItem } from "./components/GlassIcons";
import SplitText from "./components/SplitText";
import ShinyText from "./components/ShinyText";
import AudioRecorderModal from "./components/AudioRecorderModal";
import { supabase } from "./supabaseClient";
import LoginModal from "./components/LoginModal";
import RechargeModal from "./components/RechargeModal";
type AppState = "initial" | "analyzing" | "result" | "review_workflow";

const cleanText = (text: string): string => {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/([\u4e00-\u9fa5])\s*and\s*([\u4e00-\u9fa5])/gi, "$1与$2")
    .replace(/([\u4e00-\u9fa5])\s*or\s*([\u4e00-\u9fa5])/gi, "$1或$2");
};

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
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isElderlyMode, setIsElderlyMode] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [tempText, setTempText] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Cache modal states
  const [cacheModalOpen, setCacheModalOpen] = useState(false);
  const [cachedResult, setCachedResult] = useState<any>(null);
  const [pendingQuery, setPendingQuery] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [history, setHistory] = useState<Array<{query: string, status: string, time: string, steps?: WorkflowStep[], result?: AnalysisResult, mermaidChart?: string, cache_key?: string}>>(() => {
    const savedNormal = localStorage.getItem('terminator_history_normal');
    if (savedNormal) return JSON.parse(savedNormal);
    const savedOld = localStorage.getItem('terminator_history');
    return savedOld ? JSON.parse(savedOld) : [];
  });

  // Account & credit system states
  const [session, setSession] = useState<any>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  const [guestUUID, setGuestUUID] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [creditAlertOpen, setCreditAlertOpen] = useState(false);
  const [creditAlertMsg, setCreditAlertMsg] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLoadingMsg, setSyncLoadingMsg] = useState("正在同步云端数据与历史记录...");
  
  // Audio references
  const printerAudioRef = useRef<HTMLAudioElement | null>(null);
  const stampAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentCacheKeyRef = useRef<string>("");

  const fetchProfile = async (currentSession: any, currentGuestUUID: string | null) => {
    try {
      const headers: any = {};
      if (currentSession) {
        headers['Authorization'] = `Bearer ${currentSession.access_token}`;
      } else if (currentGuestUUID) {
        headers['x-guest-uuid'] = currentGuestUUID;
      } else {
        return;
      }
      const res = await fetch('/api/user/profile', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setCredits(data.profile.credits);
          setLastCheckIn(data.profile.last_check_in);
        }
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    }
  };

  const fetchHistory = async (currentSession: any) => {
    if (!currentSession) return;
    try {
      const modeParam = isElderlyMode ? 'elderly' : 'normal';
      const res = await fetch(`/api/user/history?mode=${modeParam}`, {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.history) {
          const mappedHistory = data.history.map((h: any) => ({
            query: h.query,
            status: h.status,
            time: h.time,
            cache_key: h.cache_key,
            mermaidChart: h.mermaid_chart || "",
            steps: Array.isArray(h.steps) ? h.steps : [],
            result: h.content ? {
              status: h.status,
              content: cleanText(h.content),
              sourceText: h.query,
              timestamp: h.time,
              imageUrl: h.image_url || "",
              elderlyContent: cleanText(h.elderly_content || ""),
              latexPoster: cleanText(h.latex_poster || ""),
              systemId: String(Math.floor(Math.random() * 899999 + 100000))
            } : undefined
          }));
          setHistory(mappedHistory);
        }
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const handleAuthSuccess = async (newSession: any) => {
    setIsSyncing(true);
    setSyncLoadingMsg("正在合并本地核查记录与同步额度...");
    setSession(newSession);
    
    // Migrate local history & remaining guest credits
    const savedNormal = localStorage.getItem('terminator_history_normal') || localStorage.getItem('terminator_history') || '[]';
    const savedElderly = localStorage.getItem('terminator_history_elderly') || '[]';
    let localHist = [];
    try {
      localHist = [...JSON.parse(savedNormal), ...JSON.parse(savedElderly)];
    } catch (e) {}

    const uniqueLocalHist = Array.from(new Map(localHist.map((item: any) => [item.cache_key || item.query, item])).values());
    const sanitizedLocalHist = uniqueLocalHist.map((item: any) => ({
      query: item.query,
      status: item.status,
      time: item.time,
      cache_key: item.cache_key || item.id || ''
    }));

    try {
      const headers: any = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newSession.access_token}`
      };
      if (guestUUID) {
        headers['x-guest-uuid'] = guestUUID;
      }

      const res = await fetch('/api/user/migrate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ localHistory: sanitizedLocalHist })
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (e) {
        throw new Error(`服务器响应异常 (${res.status}): ${resText.slice(0, 100)}`);
      }

      if (res.ok && data.success && data.profile) {
        setCredits(data.profile.credits);
        setLastCheckIn(data.profile.last_check_in);
        localStorage.removeItem('terminator_history_normal');
        localStorage.removeItem('terminator_history_elderly');
        localStorage.removeItem('terminator_history');
      } else {
        throw new Error(data.error || `数据迁移合并失败 (状态码 ${res.status})`);
      }
    } catch (err: any) {
      console.error('Error during data migration:', err);
      alert('同步本地历史及额度到云端失败：\n' + err.message);
    } finally {
      await Promise.all([
        fetchProfile(newSession, guestUUID),
        fetchHistory(newSession)
      ]);
      setIsSyncing(false);
    }
  };

  const handleSignOut = async () => {
    setIsSyncing(true);
    setSyncLoadingMsg("正在退出登录并切换访客环境...");
    try {
      await supabase.auth.signOut();
      setSession(null);
      setCredits(null);
      setLastCheckIn(null);
      await fetchProfile(null, guestUUID);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCheckIn = async () => {
    if (!session) return;
    const clientLocalDate = new Date().toLocaleDateString('sv');
    try {
      const res = await fetch('/api/user/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ clientLocalDate })
      });
      const data = await res.json();
      if (res.ok) {
        setCredits(data.credits);
        setLastCheckIn(clientLocalDate);
        alert(data.message || '签到成功！已获得 3 个额度。');
      } else {
        alert(data.error || '签到失败，请重试。');
      }
    } catch (err) {
      console.error('Check-in error:', err);
      alert('签到失败，请检查网络。');
    }
  };

  // Initialize session & guest credentials
  useEffect(() => {
    let currentGuestUUID = localStorage.getItem("terminator_guest_uuid");
    if (!currentGuestUUID) {
      const match = document.cookie.match(/terminator_guest_uuid=([^;]+)/);
      if (match) currentGuestUUID = match[1];
    }
    if (!currentGuestUUID) {
      currentGuestUUID = window.crypto?.randomUUID ? window.crypto.randomUUID() : (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
      localStorage.setItem("terminator_guest_uuid", currentGuestUUID);
      document.cookie = `terminator_guest_uuid=${currentGuestUUID}; path=/; max-age=31536000; SameSite=Lax`;
    }
    setGuestUUID(currentGuestUUID);

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession) {
        fetchProfile(currentSession, null);
        fetchHistory(currentSession);
      } else {
        fetchProfile(null, currentGuestUUID);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession) {
        fetchProfile(currentSession, null);
        fetchHistory(currentSession);
      } else {
        setCredits(null);
        setLastCheckIn(null);
        fetchProfile(null, currentGuestUUID);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Synchronize history key based on current active mode or authentication session
  useEffect(() => {
    if (session) {
      fetchHistory(session);
    } else {
      const key = isElderlyMode ? 'terminator_history_elderly' : 'terminator_history_normal';
      const saved = localStorage.getItem(key);
      if (saved) {
        setHistory(JSON.parse(saved));
      } else if (!isElderlyMode) {
        const savedOld = localStorage.getItem('terminator_history');
        setHistory(savedOld ? JSON.parse(savedOld) : []);
      } else {
        setHistory([]);
      }
    }
  }, [isElderlyMode, session]);

  useEffect(() => {
    printerAudioRef.current = new Audio('/printer.mp3');
    printerAudioRef.current.loop = true;
    stampAudioRef.current = new Audio('/stamp.mp3');
  }, []);

  useEffect(() => {
    let interval: any;
    if (appState === "analyzing") {
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [appState]);

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
        
        setIsDemoMode(true);
        setAppState("analyzing");
        setFirstResponseReceived(true);
        setWorkflowSteps([]);
        setMermaidChart("");
        setElapsedSeconds(0);
        
        if (isElderlyMode && printerAudioRef.current) {
          printerAudioRef.current.play().catch(() => {});
        }
        
        const mockStepsData = [
          {
            id: "sens",
            type: "sensing",
            title: "特征提取 Content Sensing",
            details: `### 多模态物理特征检测报告
- **输入文本检测**：对用户输入的陈述进行文本分词与特征提炼。
- **多模态文件分析**：未检测到伴随音视频文件，激活文本事实检测。
- **物理特征结论**：未发现物理层面的剪辑、拼接或图像篡改痕迹。`
          },
          {
            id: "fore",
            type: "search",
            title: "事实核查取证 Forensic Agent",
            details: `### 🔍 Tavily 多源实时跨境检索
- **检索关键词**：提炼关键词 \`测试案例 谣言 辟谣\`。
- **跨境双向检索**：自动翻译为英文并配以 \`test case rumor debunk\` 后缀进行全球检索。
- **证据链召回**：
  1. 检索到人民网辟谣平台和新华社相关主题报道 3 篇。
  2. 检索到国际前沿事实校验论文 1 篇。
- **网页链接存活测试**：测试 URL \`https://tavily.com\` 响应率正常，建立证据副本。`
          },
          {
            id: "logi",
            type: "ai_check",
            title: "逻辑漏洞检查 Logic Judgment",
            details: `### 🔬 常识与逻辑漏洞分析
- **语境扫描**：文本中包含“绝对别信”、“假货！”等极端情绪词。
- **逻辑谬误断定**：
  - **圈套 1**：强行建立“测试模式”与“谣言”的等价关系，犯了“概念偷换”的谬误。
  - **圈套 2**：恐吓度评分（75分），极易造成数字银发长辈的心理焦虑。`
          },
          {
            id: "cros",
            type: "ai_check",
            title: "多源内容比对 Cross-Verification",
            details: `### ⚖️ 多源证据交叉比对
- **独立审计矩阵**：
  - 传言内容：“这是一个测试案例，结论是虚假”。
  - 搜索证据：无爆发性社会谣言关联，指向局部开发演练。
  - 逻辑结论：确认为模拟性质的非真实虚假言论。
- **交叉结果**：三方内容判定该传言属于人工模拟产生的测试内容。`
          },
          {
            id: "judg",
            type: "ai_check",
            title: "定性裁决 Final Judge",
            details: `### ⚖️ 首席大法官终审裁决
- **定性标签**：\`伪造\` (Fake)
- **判定理由依据**：经比对，此信息属于人工调试期间的特定快捷测试文本，结论为虚假。`
          },
          {
            id: "merm",
            type: "ai_check",
            title: "流程图生成 Mermaid Generator",
            details: `### 📊 Mermaid 拓扑逻辑生成
- **拓扑结构**：定性为[伪造]，输出“左右分栏错位对比结构”，指出伪造点与真实源流的分歧。
- **视觉风格**：已去除所有与 MathJax 渲染冲突的符号，自动注入莫兰迪淡红配色。`
          },
          {
            id: "comp",
            type: "ai_check",
            title: "报告合规修正专家 Compliance Agent",
            details: `### 🛡️ Python 代码沙箱存活自愈修正
- **URL可用性验证**：代码沙箱执行 Python 连通性测试。
- **链接清洗**：检测并清洗失效 URL 1 处，自动转换为 \`[已过滤失效链接]\`。
- **报告最终签名**：事实一致性与语法合规性校验通过。`
          },
          {
            id: "elder",
            type: "ai_check",
            title: "安心播报与 LaTeX 生成 Elderly Rewrite",
            details: `### 👵 适老化与视觉渲染优化
- **安心有声书生成**：将学术性研究结论重写为口语化、接地气的有声播报，语速降低 12%。
- **LaTeX 排版大字报**：已编译 LaTeX 顺口溜大字报，设置高对比度红头板式。`
          }
        ];

        let stepIndex = 0;
        
        const runNextStep = () => {
          if (stepIndex < mockStepsData.length) {
            const currentMock = mockStepsData[stepIndex];
            
            setWorkflowSteps(prev => {
              const updated = prev.map((s, idx) => 
                s.status === 'processing' 
                  ? { ...s, status: 'done' as const, details: [mockStepsData[idx]?.details || ""] } 
                  : s
              );
              return [...updated, {
                id: currentMock.id,
                type: currentMock.type,
                title: currentMock.title,
                status: 'processing' as const,
                details: []
              }];
            });
            
            if (currentMock.id === 'merm') {
              setMermaidChart("graph TD\n  A[传言] --> B(全网检索)\n  B --> C{交叉比对}\n  C -->|时间线冲突| D[证实造假]\n  C -->|画面被剪辑| D");
            }
            
            stepIndex++;
            // Slightly offset times for visual interest (1.0s to 1.3s per step)
            setTimeout(runNextStep, 900 + Math.random() * 400);
          } else {
            setWorkflowSteps(prev => 
              prev.map((s, idx) => 
                s.status === 'processing' 
                  ? { ...s, status: 'done' as const, details: [mockStepsData[idx]?.details || ""] } 
                  : s
              )
            );
            
            setResult({
              status: "Fake",
              sourceText: "这是一个通过 Ctrl+Alt+T 快捷键生成的测试案例！",
              content: "这是一个**纯前端模拟**的核查报告，您刚刚使用了测试模式跳过了后端的大模型等待时间。\n\n## 结论\n此传言是**虚假**的！通过这个模式您可以快速测试前端界面的各种渲染效果，特别是长辈模式、全屏展示、打字机动画、图片保存等。\n\n*注意：此模式不会消耗任何大模型 Token。*",
              timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }).replace(/\//g, '-'),
              imageUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop", // placeholder image
              elderlyContent: "亲爱的长辈朋友们，这个测试案例是假货！请大家一定注意防范，不要轻信网络谣言。我们核实了这个案例只是一个纯前端模拟的测试，请您放心！",
              latexPoster: "$$\\begin{array}{c}\\mathbf{\\color{Red}{\\Huge 🌟\\ 测试大字报标题\\ 🌟}} \\\\\\hdashline\\\\\\mathbf{\\color{Crimson}{\\huge 【\\ 辟\\ 谣\\ 通\\ 知\\ 】}} \\\\\\\\\\mathbf{\\color{DarkBlue}{\\Large 亲\\ 爱\\ 的\\ 老\\ 年\\ 朋\\ 友\\ 们\\ ：}} \\\\\\\\\\mathbf{\\color{Black}{\\huge 测\\ 试\\ 案\\ 例\\ 为\\ 假\\ ．\\ 绝\\ 对\\ 别\\ 信\\ ！}} \\\\\\mathbf{\\color{Black}{\\huge 前\\ 端\\ 模\\ 拟\\ 功\\ 模\\ 式\\ ．\\ 只\\ 为\\ 测试\\ ！}} \\\\\\mathbf{\\color{Green}{\\huge 大\\ 字\\ 报\\ 已\\ 生成\\ ．\\ 顺\\ 利\\ 体验\\ ！}} \\\\\\\\\\hdashline\\\\\\mathbf{\\color{OrangeRed}{\\Large 💡\\ 健\\ 康\\ 养\\ 生\\ 小\\ 顺\\ 口\\ 溜\\ 💡}} \\\\\\\\\\mathbf{\\color{DarkCyan}{\\LARGE 测试功能经常用\\ ，\\ 没烦恼\\ ！}} \\\\\\mathbf{\\color{DarkCyan}{\\LARGE 谣言终结保平安\\ ，\\ 身体好\\ ！}} \\\\\\\\\\hdashline\\\\\\mathbf{\\color{Gold}{\\Large 💖\\ 祝\\ 您\\ 身体\\ 健\\ 康\\ ．\\ 万\\ 事\\ 如\\ 意\\ 💖}}\\end{array}$$",
              systemId: String(Math.floor(Math.random() * 899999 + 100000))
            });
            
            if (isElderlyMode) {
              if (printerAudioRef.current) {
                printerAudioRef.current.pause();
                printerAudioRef.current.currentTime = 0;
              }
              if (stampAudioRef.current) {
                stampAudioRef.current.play().catch(() => {});
              }
            }
            
            setTimeout(() => setAppState("result"), 800);
          }
        };
        
        setTimeout(runNextStep, 400);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isElderlyMode]);

  const executeAnalysisDirect = async (q: string, files: File[] = selectedFiles, bypassCache = false) => {
    if (!q.trim() && files.length === 0) return;

    // Check credits before executing new generation (bypassCache or cache miss)
    if (credits !== null && credits <= 0) {
      if (!session) {
        setIsLoginModalOpen(true);
        return;
      } else {
        setIsRechargeModalOpen(true);
        return;
      }
    }

    currentCacheKeyRef.current = "";
    setQuery(q);
    setAppState("analyzing");
    setFirstResponseReceived(false);
    setWorkflowSteps([]);
    setMermaidChart("");
    setIsDemoMode(false);
    
    if (isElderlyMode && printerAudioRef.current) {
      printerAudioRef.current.play().catch(() => {});
    }

    try {
      const formData = new FormData();
      if (q.trim()) formData.append('query', q);
      files.forEach(f => formData.append('files', f));
      formData.append('isElderlyMode', String(isElderlyMode));
      formData.append('bypassCache', String(bypassCache));

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const headers: any = {};
      if (session) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      } else if (guestUUID) {
        headers['x-guest-uuid'] = guestUUID;
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: headers,
        body: formData,
        signal: abortController.signal
      });

      if (!response.ok) {
        let errMsg = "Analysis failed";
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
          if (response.status === 403) {
            if (errData.needLogin) {
              setIsLoginModalOpen(true);
            } else if (errData.needRecharge) {
              setIsRechargeModalOpen(true);
            } else {
              setCreditAlertMsg(errData.message || errMsg);
              setCreditAlertOpen(true);
            }
            setAppState("initial");
            return;
          }
        } catch (e) {}
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
              
              if (data.event === 'cache_key') {
                currentCacheKeyRef.current = data.cache_key;
              } else if (data.event === 'workflow_started') {
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
                  const judgeText = data.data.outputs?.text || data.data.outputs?.answer || data.data.outputs?.string || "";
                  const firstTwoChars = judgeText.substring(0, 2);
                  if (firstTwoChars === "证实") finalStatus = "Verified";
                  else if (firstTwoChars === "伪造") finalStatus = "Fake";
                  else if (firstTwoChars === "存疑") finalStatus = "Doubtful";
                }

                // Capture Mermaid output (handles both old and new DSL node names)
                if (nodeTitle.includes('Mermaid') || nodeTitle.includes('流程图代码')) {
                  const mermaidText = data.data.outputs?.text || data.data.outputs?.answer || data.data.outputs?.string || "";
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
                if (nodeTitle.includes('Report Adjustment Out') || nodeTitle.includes('Report Adjustment') || nodeTitle.includes('报告修正') || nodeTitle.includes('Compliance Agent') || nodeTitle.includes('报告合规修正专家')) {
                   const txt = data.data.outputs?.text || data.data.outputs?.answer || data.data.outputs?.string || "";
                   if (txt.trim()) {
                     capturedReportText = cleanText(txt.trim());
                   }
                } else if (nodeTitle.includes('Report Out') || nodeTitle === '结束' || nodeTitle.includes('变量聚合器')) {
                   const txt = data.data.outputs?.text || data.data.outputs?.answer || data.data.outputs?.string || "";
                   if (txt.trim() && !capturedReportText) {
                     capturedReportText = cleanText(txt.trim());
                   }
                }

                // Capture "安心报告生成 Elderly Report Generation" output
                if (nodeTitle.includes('安心报告') || nodeTitle.includes('Elderly Report') || data.data.node_id === '1782465366127') {
                   const elderlyText = data.data.outputs?.text || data.data.outputs?.answer || data.data.outputs?.string || "";
                   if (elderlyText.trim()) {
                     capturedElderlyReport = cleanText(elderlyText.trim());
                   }
                }

                // Capture "LaTex大字报生成 LaTex Poster Generation" output
                if (nodeTitle.includes('LaTex') || nodeTitle.includes('Poster') || data.data.node_id === '1782470849360') {
                   const latexText = data.data.outputs?.text || data.data.outputs?.answer || data.data.outputs?.string || "";
                   if (latexText.trim()) {
                     capturedLatexPoster = cleanText(latexText.trim());
                   }
                }

                // Update workflow step details — extract only the 'text' field
                const textOutput = cleanText(data.data.outputs?.text || data.data.outputs?.answer || data.data.outputs?.string || '');
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
                    resultText = cleanText(rawText);
                  } else {
                    // Scan all output values for a non-mermaid string
                    for (const val of Object.values(outputs)) {
                      if (val && typeof val === 'string' && val.trim() 
                          && !val.trim().startsWith('graph ') 
                          && !val.trim().startsWith('flowchart ')) {
                        resultText = cleanText(val.trim());
                        break;
                      }
                    }
                  }
                  if (!resultText) {
                    resultText = cleanText(JSON.stringify(outputs, null, 2));
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
                
                setHistory(prev => {
                  const targetKey = currentCacheKeyRef.current || "";
                  const newItem = { 
                    query: searchStr, 
                    status: finalStatus, 
                    time: timeStr,
                    steps: localSteps,
                    result: finalResultObj,
                    mermaidChart: localMermaidChart,
                    cache_key: targetKey
                  };
                  const filtered = prev.filter(item => {
                    if (targetKey && item.cache_key) {
                      return item.cache_key !== targetKey;
                    }
                    return item.query !== searchStr;
                  });
                  const newHistory = [newItem, ...filtered].slice(0, 20);
                  if (!session) {
                    const key = isElderlyMode ? 'terminator_history_elderly' : 'terminator_history_normal';
                    localStorage.setItem(key, JSON.stringify(newHistory));
                  }
                  return newHistory;
                });

                // Refresh credits
                if (session) {
                  fetchProfile(session, null);
                } else if (guestUUID) {
                  fetchProfile(null, guestUUID);
                }
                
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

  const executeAnalysis = async (q: string, files: File[] = selectedFiles) => {
    if (!q.trim() && files.length === 0) return;
    
    // Transition to loading state immediately to prevent user delay on home page
    setQuery(q);
    setAppState("analyzing");
    setFirstResponseReceived(false);
    setWorkflowSteps([]);
    setMermaidChart("");
    setIsDemoMode(false);
    
    if (isElderlyMode && printerAudioRef.current) {
      printerAudioRef.current.play().catch(() => {});
    }
    
    try {
      const formData = new FormData();
      if (q.trim()) formData.append('query', q);
      files.forEach(f => formData.append('files', f));
      formData.append('isElderlyMode', String(isElderlyMode));
      
      const headers: any = {};
      if (session) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      } else if (guestUUID) {
        headers['x-guest-uuid'] = guestUUID;
      }

      const checkRes = await fetch('/api/check-cache', {
        method: 'POST',
        headers: headers,
        body: formData
      });
      
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.cached && checkData.result) {
          setCachedResult(checkData.result);
          setPendingQuery(q);
          setPendingFiles(files);
          setCacheModalOpen(true);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to check cache, falling back to direct analysis:', e);
    }
    
    await executeAnalysisDirect(q, files, false);
  };

  const handleLoadCachedReport = () => {
    if (!cachedResult) return;
    setCacheModalOpen(false);
    
    setQuery(pendingQuery);
    
    const displayQuery = pendingQuery || pendingFiles.map(f => f.name).join(", ");
    
    const finalResultObj: AnalysisResult = {
      status: cachedResult.status,
      content: cleanText(cachedResult.content),
      sourceText: displayQuery,
      timestamp: cachedResult.created_at ? new Date(cachedResult.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }).replace(/\//g, '-') : new Date().toLocaleString(),
      imageUrl: cachedResult.image_url || "",
      elderlyContent: cleanText(cachedResult.elderly_content) || "",
      latexPoster: cleanText(cachedResult.latex_poster) || "",
      systemId: String(Math.floor(Math.random() * 899999 + 100000)),
    };
    
    setResult(finalResultObj);
    setMermaidChart(cachedResult.mermaid_chart || "");
    setWorkflowSteps(Array.isArray(cachedResult.steps) ? cachedResult.steps : []);
    
    setHistory(prev => {
      const timeStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }).replace(/\//g, '-');
      const targetKey = cachedResult.cache_key || cachedResult.id?.toString() || "";
      const newItem = { 
        query: displayQuery, 
        status: cachedResult.status, 
        time: timeStr,
        steps: Array.isArray(cachedResult.steps) ? cachedResult.steps : [],
        result: finalResultObj,
        mermaidChart: cachedResult.mermaid_chart || "",
        cache_key: targetKey
      };
      const filtered = prev.filter(item => {
        if (targetKey && item.cache_key) {
          return item.cache_key !== targetKey;
        }
        return item.query !== displayQuery;
      });
      const newHistory = [newItem, ...filtered].slice(0, 20);
      if (!session) {
        const key = isElderlyMode ? 'terminator_history_elderly' : 'terminator_history_normal';
        localStorage.setItem(key, JSON.stringify(newHistory));
      } else {
        // Upsert to user_history on cache load with latest snapshot
        supabase.from('user_history').upsert({
          user_id: session.user.id,
          query: displayQuery,
          status: cachedResult.status,
          time: timeStr,
          cache_key: targetKey,
          content: cachedResult.content,
          elderly_content: cachedResult.elderly_content || null,
          latex_poster: cachedResult.latex_poster || null,
          mermaid_chart: cachedResult.mermaid_chart || null,
          steps: Array.isArray(cachedResult.steps) ? cachedResult.steps : [],
          image_url: cachedResult.image_url || null,
          created_at: new Date().toISOString()
        }, { onConflict: 'user_id,cache_key' }).then(({ error }) => {
          if (error) console.error('Failed to save cloud history on cache hit:', error);
        });
      }
      return newHistory;
    });
    
    setAppState("result");
  };

  const handleRegenerateReport = () => {
    setCacheModalOpen(false);
    executeAnalysisDirect(pendingQuery, pendingFiles, true);
  };

  const handleAnalyzeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeAnalysis(query, selectedFiles);
  };

  const loadFromHistory = (h: any) => {
    if (h.result) {
      setQuery(h.query);
      setResult(h.result);
      setWorkflowSteps(Array.isArray(h.steps) ? h.steps : []);
      setMermaidChart(h.mermaidChart || "");
      setAppState("result");
    } else {
      executeAnalysis(h.query);
    }
  };

  const deleteHistoryItem = async (indexToDelete: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = history[indexToDelete];
    if (session && item.cache_key) {
      try {
        await fetch('/api/user/history/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ cacheKey: item.cache_key })
        });
      } catch (err) {
        console.error('Failed to delete history item on server:', err);
      }
    }
    
    setHistory(prev => {
      const newHistory = prev.filter((_, idx) => idx !== indexToDelete);
      if (!session) {
        const key = isElderlyMode ? 'terminator_history_elderly' : 'terminator_history_normal';
        localStorage.setItem(key, JSON.stringify(newHistory));
      }
      return newHistory;
    });
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

      {/* Top Header Controls (Auth & Elderly Mode Toggle) */}
      {appState === "initial" && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-white/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/30 shadow-sm">
          {/* User Profile / Auth Area */}
          <div className="flex items-center gap-2 border-r border-[#d0ccc4]/30 pr-3">
            {credits !== null && (
              <button
                type="button"
                onClick={() => {
                  if (session) {
                    setIsRechargeModalOpen(true);
                  } else {
                    setIsLoginModalOpen(true);
                  }
                }}
                title={session ? "充值额度" : "登录获取额度"}
                className={`text-xs font-mono px-2 py-0.5 rounded-full cursor-pointer hover:scale-105 transition-transform border-none ${
                  credits <= 1 
                    ? "bg-red-500/10 text-red-600 font-bold" 
                    : (isElderlyMode ? "bg-[#00B86B]/15 text-[#00663C] text-sm font-bold" : "bg-[#A96159]/10 text-[#A96159]")
                }`}
              >
                {isElderlyMode ? `可用额度: ${credits} 次` : `${credits} credits`}
                <span className="ml-1 opacity-75 font-sans font-bold">+</span>
              </button>
            )}

            {session ? (
              <div className="flex items-center gap-2">
                <span 
                  className={`text-xs font-bold truncate max-w-[120px] ${isElderlyMode ? 'text-black text-sm' : 'text-[#2C2C2C]/80'}`} 
                  title={session.user.email}
                >
                  {session.user.email?.split('@')[0]}
                </span>
                
                {/* Check-in Button */}
                {lastCheckIn !== new Date().toLocaleDateString('sv') ? (
                  <button
                    onClick={handleCheckIn}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      isElderlyMode 
                        ? "bg-[#00B86B] text-white hover:bg-[#009E5B]" 
                        : "bg-[#A96159] text-white hover:bg-[#8e4f48]"
                    }`}
                  >
                    签到 (+3)
                  </button>
                ) : (
                  <span className="text-[10px] opacity-40 font-mono">已签到</span>
                )}

                <button
                  onClick={handleSignOut}
                  className={`text-xs opacity-50 hover:opacity-100 cursor-pointer underline transition-opacity ${isElderlyMode ? 'text-black text-sm font-bold' : ''}`}
                >
                  退出
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className={`text-xs font-bold hover:underline cursor-pointer ${
                  isElderlyMode 
                    ? "text-black text-lg font-black bg-black/5 px-3 py-1 rounded-lg border border-black/10" 
                    : "text-[#A96159] hover:text-[#8e4f48]"
                }`}
              >
                登录 / 注册
              </button>
            )}
          </div>

          {/* Elderly Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className={`font-bold opacity-60 ${isElderlyMode ? 'text-lg text-black' : 'text-xs'}`}>👴 长辈</span>
            <button 
              onClick={() => setIsElderlyMode(!isElderlyMode)}
              className={`w-10 h-5 rounded-full transition-colors relative flex items-center ${isElderlyMode ? 'bg-[#00B86B]' : 'bg-[#d0ccc4]'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute transition-transform shadow-sm ${isElderlyMode ? 'left-[22px]' : 'left-[2px]'}`} />
            </button>
          </div>
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
                            label: '🎤 说话录音',
                            onClick: () => setIsAudioModalOpen(true)
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
                      </div>
                      <input
                        type="text"
                        disabled={(appState as AppState) === "analyzing"}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder=""
                        className="w-full h-16 sm:h-20 rounded-2xl glass-input pl-[60px] sm:pl-[76px] pr-16 sm:pr-20 text-lg sm:text-xl font-light outline-none transition-all duration-300"
                      />
                      {!query && (
                        <div className="pointer-events-none absolute top-1/2 -translate-y-1/2 left-[60px] sm:left-[76px]">
                          <ShinyText
                            text="输入要核查的传言、链接或问题..."
                            disabled={false}
                            speed={2.5}
                            color="#2C2C2C"
                            shineColor="#c0bba6"
                            spread={90}
                            className="text-lg sm:text-xl font-light opacity-50"
                          />
                        </div>
                      )}
                      
                      {/* Submit button aligned perfectly inside the input container for standard mode */}
                      <button 
                        type="submit" 
                        disabled={(appState as AppState) === "analyzing" || (!query.trim() && selectedFiles.length === 0)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 sm:p-4 rounded-xl opacity-80 hover:opacity-100 transition-opacity disabled:opacity-30 flex items-center justify-center gap-2 cursor-pointer border-none"
                      >
                        {(appState as AppState) === "analyzing" ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                            <Search className="w-6 h-6" />
                          </motion.div>
                        ) : (
                          <Search className="w-6 h-6" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Standard Mode Uploaded Files Display: rendered cleanly below the search bar */}
                  {!isElderlyMode && selectedFiles.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 justify-start px-2">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex-shrink-0 flex items-center gap-1.5 bg-white/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-black/5 text-xs font-mono max-w-[180px] shadow-sm">
                          <span className="truncate text-[#2C2C2C]/80">{file.name}</span>
                          <button type="button" onClick={() => removeFile(idx)} className="opacity-60 hover:opacity-100 p-0.5 text-red-500 cursor-pointer" title="移除文件">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Elderly Mode Submit Button: kept outside the inputs container */}
                  {isElderlyMode && (
                    <button 
                      type="submit" 
                      disabled={(appState as AppState) === "analyzing" || (!query.trim() && selectedFiles.length === 0)}
                      className="w-full mt-6 bg-[#00B86B] text-white py-5 rounded-3xl text-2xl font-black shadow-lg hover:bg-[#009E5B] p-3 sm:p-4 opacity-80 hover:opacity-100 transition-opacity disabled:opacity-30 flex items-center justify-center gap-2 cursor-pointer border-none"
                    >
                      {(appState as AppState) === "analyzing" ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                          <Search className="w-6 h-6" />
                        </motion.div>
                      ) : (
                        <Search className="w-6 h-6" />
                      )}
                      <span className="ml-2">开始核查真实性</span>
                    </button>
                  )}
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
                          <button 
                            onClick={(e) => deleteHistoryItem(i, e)}
                            className="p-1 rounded-full text-black/30 hover:text-[#FF3B30] hover:bg-black/5 transition-colors"
                            title="删除此记录"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                          isElderlyMode ? (
                            // Elderly Mode Progress Bar: Rendered directly to avoid fixed height constraint of motion.div
                            <div className="w-full max-w-xl flex flex-col items-center gap-6 mt-8 p-6 bg-white/80 rounded-3xl border-4 border-black/10 shadow-lg z-10">
                              <div className="text-2xl font-black text-black animate-pulse text-center">
                                👵 正在为您全力核查真实性，请稍候...
                              </div>
                              <div className="w-full h-8 bg-white rounded-full overflow-hidden border-2 border-black/10 p-0.5 shadow-inner">
                                <motion.div 
                                  className="h-full bg-[#00B86B] rounded-full"
                                  animate={{ 
                                    width: `${Math.max(5, Math.min(99, Math.max(
                                      (workflowSteps.filter(s => s.status === 'done').length / (isDemoMode ? 8 : 16)) * 100,
                                      (elapsedSeconds / (isDemoMode ? 8 : 120)) * 100
                                    )))}%` 
                                  }}
                                  transition={{ type: "spring", stiffness: 60, damping: 15 }}
                                />
                              </div>
                              <div className="w-full text-center flex flex-col gap-2">
                                <div className="text-xl font-bold text-black">
                                  正在进行第 {Math.min(workflowSteps.filter(s => s.status === 'done').length + 1, isDemoMode ? 8 : 16)}/{isDemoMode ? 8 : 16} 项分析
                                </div>
                                <div className="text-lg font-bold text-[#00B86B] bg-[#00B86B]/5 py-2 px-4 rounded-xl border border-[#00B86B]/15">
                                  当前分析：{
                                    workflowSteps[workflowSteps.length - 1]
                                      ? workflowSteps[workflowSteps.length - 1].title.replace(/[a-zA-Z\s_-]+$/, '').trim()
                                      : '系统初始化'
                                  }
                                </div>
                                <div className="text-lg text-black/60 font-bold mt-1">
                                  预计还需要：约 {
                                    isDemoMode ? (
                                      `${Math.max(1, 8 - elapsedSeconds)} 秒`
                                    ) : (
                                      Math.floor(Math.max(5, 120 - elapsedSeconds) / 60) > 0
                                        ? `${Math.floor(Math.max(5, 120 - elapsedSeconds) / 60)} 分 ${Math.max(5, 120 - elapsedSeconds) % 60} 秒`
                                        : `${Math.max(5, 120 - elapsedSeconds)} 秒`
                                    )
                                  }，请长辈耐心等待
                                </div>
                              </div>
                            </div>
                          ) : (
                            // Normal Mode: Loader and Init states
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
                                    正在初始化 AI 探员
                                    <span className="inline-flex ml-1 w-6">
                                      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0 }}>.</motion.span>
                                      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0.2 }}>.</motion.span>
                                      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, times: [0, 0.5, 1], delay: 0.4 }}>.</motion.span>
                                    </span>
                                  </motion.p>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          )
                        )}

 
                         <AnimatePresence>
                           {((firstResponseReceived && !isElderlyMode) || appState === "review_workflow") && (
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

      {/* Audio Recorder Modal for Elderly Mode */}
      <AnimatePresence>
        {isAudioModalOpen && (
          <AudioRecorderModal
            isOpen={isAudioModalOpen}
            onClose={() => setIsAudioModalOpen(false)}
            onSave={(file) => {
              setSelectedFiles((prev) => [...prev, file].slice(0, 5));
            }}
          />
        )}
      </AnimatePresence>

      {/* Cache Hit Dialog Modal */}
      <AnimatePresence>
        {cacheModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl flex flex-col gap-5 text-left relative ${
                isElderlyMode 
                  ? "bg-white border-4 border-black text-black" 
                  : "bg-[#FAF8F5] border border-[#d0ccc4]/50 text-[#2C2C2C]"
              }`}
            >
              <div className={`flex justify-between items-center pb-3 ${
                isElderlyMode ? "border-b-2 border-black/10" : "border-b border-[#d0ccc4]/30"
              }`}>
                <h3 className={isElderlyMode ? "text-2xl sm:text-3xl font-black text-black flex items-center gap-2" : "text-lg font-bold text-[#2C2C2C] flex items-center gap-2"}>
                  🔍 发现已有核查报告
                </h3>
                <button 
                  type="button" 
                  onClick={() => {
                    setCacheModalOpen(false);
                    resetState();
                  }}
                  className={`rounded-full flex items-center justify-center font-bold cursor-pointer border-none transition-colors ${
                    isElderlyMode 
                      ? "w-10 h-10 bg-black/10 hover:bg-black/20 text-black text-xl" 
                      : "w-8 h-8 bg-black/5 hover:bg-black/10 text-[#2C2C2C]/50"
                  }`}
                >
                  ✕
                </button>
              </div>

              <div className={isElderlyMode ? "text-xl font-bold text-gray-800 leading-relaxed" : "text-sm text-[#2C2C2C]/80 leading-relaxed"}>
                {isElderlyMode 
                  ? "系统已为您找到针对该内容的安心核查报告，点击下方绿色按钮可直接秒开查看结果！" 
                  : "系统检测到数据库中已存有针对该谣言的深度分析报告。直接查看可免去大约 1-2 分钟的智能体研判过程。"}
              </div>

              <div className={`rounded-2xl p-4 ${
                isElderlyMode 
                  ? "bg-amber-50 border-2 border-amber-300 text-amber-950 font-bold text-base" 
                  : "bg-[#FAF8F5] border border-[#d0ccc4]/30 text-xs text-[#2C2C2C]/70"
              }`}>
                <div className={isElderlyMode ? "font-black text-amber-900 mb-1.5 text-lg" : "font-bold mb-1"}>核查内容：</div>
                <div className={isElderlyMode ? "line-clamp-3 text-lg leading-snug" : "line-clamp-3 italic"}>“{pendingQuery || "多媒体附件核查"}”</div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleRegenerateReport}
                  className={`flex-grow py-3.5 rounded-2xl font-bold cursor-pointer transition-all ${
                    isElderlyMode 
                      ? "text-xl border-2 border-black text-black bg-white hover:bg-gray-100" 
                      : "text-sm border border-[#d0ccc4]/80 text-[#2C2C2C]/70 hover:bg-[#FAF8F5] hover:text-[#2C2C2C] bg-white rounded-xl font-medium"
                  }`}
                >
                  {isElderlyMode ? "重新核查一次" : "重新生成报告"}
                </button>
                <button
                  type="button"
                  onClick={handleLoadCachedReport}
                  className={`flex-grow py-3.5 rounded-2xl font-bold shadow-md cursor-pointer transition-all border-none flex items-center justify-center gap-1.5 ${
                    isElderlyMode 
                      ? "text-2xl bg-green-600 hover:bg-green-700 text-white" 
                      : "text-sm bg-[#A96159] hover:bg-[#8e4f48] text-white rounded-xl font-medium"
                  }`}
                >
                  <span>{isElderlyMode ? "直接看报告 ➔" : "直接查看报告"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Credit Exhausted Warning Modal */}
      <AnimatePresence>
        {creditAlertOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl flex flex-col gap-5 text-left ${
                isElderlyMode 
                  ? "bg-white border-black border-4 text-black" 
                  : "bg-[#FAF8F5] border-[#d0ccc4]/50 text-[#2C2C2C]"
              }`}
            >
              <div className="flex justify-between items-center border-b border-[#d0ccc4]/30 pb-3">
                <h3 className={`font-bold flex items-center gap-2 ${isElderlyMode ? 'text-2xl text-black' : 'text-lg text-[#2C2C2C]'}`}>
                  ⚠️ 核查额度不足
                </h3>
                <button 
                  type="button" 
                  onClick={() => setCreditAlertOpen(false)}
                  className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center font-bold cursor-pointer border-none"
                >
                  ✕
                </button>
              </div>

              <div className={`leading-relaxed ${isElderlyMode ? 'text-xl font-bold text-black' : 'text-sm text-[#2C2C2C]/80'}`}>
                {creditAlertMsg}
              </div>

              <div className="flex gap-3 mt-3">
                {!session ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCreditAlertOpen(false)}
                      className={`flex-grow py-3 border rounded-xl font-medium cursor-pointer transition-all bg-white text-center ${
                        isElderlyMode ? 'text-lg border-black text-black' : 'text-sm border-[#d0ccc4]/80 text-[#2C2C2C]/70'
                      }`}
                    >
                      返回
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreditAlertOpen(false);
                        setIsLoginModalOpen(true);
                      }}
                      className={`flex-grow py-3 text-white rounded-xl font-medium shadow-sm cursor-pointer transition-all border-none text-center ${
                        isElderlyMode ? 'bg-[#00B86B] hover:bg-[#009E5B] text-lg' : 'bg-[#A96159] hover:bg-[#8e4f48] text-sm'
                      }`}
                    >
                      登录 / 注册
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreditAlertOpen(false)}
                    className={`w-full py-3 text-white rounded-xl font-medium shadow-sm cursor-pointer transition-all border-none text-center ${
                      isElderlyMode ? 'bg-[#00B86B] hover:bg-[#009E5B] text-lg' : 'bg-[#A96159] hover:bg-[#8e4f48] text-sm'
                    }`}
                  >
                    我知道了
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Supabase Registration & Login Modal */}
      <AnimatePresence>
        {isLoginModalOpen && (
          <LoginModal
            isOpen={isLoginModalOpen}
            onClose={() => setIsLoginModalOpen(false)}
            onAuthSuccess={handleAuthSuccess}
            isElderlyMode={isElderlyMode}
          />
        )}
      </AnimatePresence>

      {/* Credit Recharge Modal */}
      <AnimatePresence>
        {isRechargeModalOpen && (
          <RechargeModal
            isOpen={isRechargeModalOpen}
            onClose={() => setIsRechargeModalOpen(false)}
            onCheckInClick={handleCheckIn}
            isElderlyMode={isElderlyMode}
          />
        )}
      </AnimatePresence>

      {/* Global Sync / Loading Screen */}
      <AnimatePresence>
        {isSyncing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`rounded-3xl p-8 flex flex-col items-center gap-5 shadow-2xl max-w-sm w-full text-center ${
                isElderlyMode 
                  ? "bg-white border-4 border-black text-black" 
                  : "bg-[#FAF8F5] border border-[#d0ccc4]/60 text-[#2C2C2C]"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <div className={`w-14 h-14 rounded-full border-4 animate-spin ${
                  isElderlyMode ? "border-green-600 border-t-transparent" : "border-[#A96159] border-t-transparent"
                }`} />
                <span className="absolute text-xl">⏳</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className={isElderlyMode ? "text-2xl font-black text-black" : "text-base font-bold text-[#2C2C2C]"}>
                  数据同步中
                </h3>
                <p className={isElderlyMode ? "text-lg font-bold text-gray-700" : "text-xs text-[#2C2C2C]/70"}>
                  {syncLoadingMsg}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


