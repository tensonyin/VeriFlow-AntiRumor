# 谣言终结者 (VeriFlow-AntiRumor) 更新日志 (Changelog)

所有项目的重要更新和迭代记录都将在此文档中存档。

---

## [v1.2.0] - 2026-08-09

### 🚀 核心新增功能与数据库优化
- **Supabase 事实核查缓存网络化 (Supabase Cache Integration)**:
  - 弃用本地 `pg` PostgreSQL 驱动，改用 `@supabase/supabase-js` SDK，通过 HTTPS (Port 443) 协议通信。解决了本地代理（如 Clash 假 IP 模式）导致 5432/6543 TCP 端口被封锁的技术瓶颈。
  - 新增 `/api/check-cache` 接口。用户提交重复谣言时自动触发缓存比对。
  - **缓存命中选择弹窗 (Prompt Choice Modal)**: 发现相同谣言后，弹窗供用户选择“直接查看已有报告”（瞬间跳过研判等待）或“重新生成报告”（强制调用 Dify 工作流）。
- **即时分析加载响应 (Instant UI Transition)**:
  - 移除了提问/点击后等待缓存比对的 2 秒界面悬停卡顿。现在点击或提交的瞬间会直接切换到 `analyzing` 等待进度条页面。
  - 优化缓存弹窗关闭（✕）逻辑，点击后安全触发全局 `resetState` 返回搜索主页。

### 🛠️ 交互与系统稳定性提升
- **Mermaid 推导图语法自愈 (Mermaid Syntax Self-Repair)**:
  - 在 [MermaidChart.tsx](./src/components/MermaidChart.tsx) 渲染前自动对 Dify 吐出的流程图语法进行正则过滤与自愈，剔除未加引号的特殊字符、非法的虚线箭头等干扰，彻底解决 Mermaid 语法报错无法渲染的问题。
- **历史记录单条删除 (Single History Item Deletion)**:
  - 侧边栏历史记录卡片新增红色垃圾桶垃圾箱图标。用户可鼠标悬停并一键点击“删除该条记录”，不再强制一键清空全部历史。
- **Dify 流式调用中途终止 (Dify Workflow Execution Abort)**:
  - 监听 Express 请求的 `close` 事件（`req.on('close')`），配合前端的 `AbortController` 信号。当用户在生成中途点击“取消/返回”时，后端会立即终止对 Dify 工作流的流式请求，让 Dify 服务端释放算力并中断运行，省去不必要的 Token 计费。

### 🎨 适老化（长辈模式）与音视频播报升级
- **长辈模式播放器按钮重绘**:
  - 全面剔除各系统间表现不一的原生 Emoji（⏸, ▶, ⏳），全部重构为统一的 SVG 矢量组件：`<Pause />`、`<Play />` 与带旋转特效的 `<Loader2 />`。
  - 修复 [index.css](./src/index.css) 中 `.elderly-mode` 高对比度强制黑字（`color: #000000 !important`）规则污染按钮字体的 Bug，使按钮内部文字在深色背景下保持清晰的高对比度白色。
- **音色热切与进度无缝恢复 (Seamless Voice Switch & Seek)**:
  - **暂停切换**：支持在暂停状态下更换发音人（女儿/儿子）。在点击继续播放时，自动定位到已播报的毫秒处（`currentTime`）用新音色继续，避免重新从头开始播报。
  - **播放中切换**：支持在播放进行时直接一键换音色。通过绑定 HTML5 Audio 的多重状态事件（`onloadedmetadata`, `oncanplay`, `onplaying`, `ontimeupdate`），确保在不同网络速度和浏览器内核中都能精确、无缝地在当前播放位置切换发音人，并完美承接当前进度。
- **静态“参考谣言”推荐流**:
  - 锁定主页的“大家都在问/参考谣言”卡片列表的顺序，防止每次提问后发生推荐卡片布局闪烁或移位，提升版面稳定性。

### 🧹 文本净化
- **中英混杂连接词清洗 (Text Cleaner)**:
  - 前端渲染时增加过滤器，自动清除文本在生成中偶尔夹杂的英文连接词（如 `and`, `or`）将其转换为对应中文，使文本阅读更具本地化亲和力。
