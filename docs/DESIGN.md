---
name: VeriFlow-AntiRumor
description: 谣言终结者：基于多源异构对抗博弈的多模态事实核查系统
colors:
  primary-verified: "#00B86B"
  primary-fake: "#FF3B30"
  primary-doubtful: "#FFCC00"
  neutral-bg: "#EAE6DF"
  neutral-text: "#2C2C2C"
  receipt-bg: "#FAF8F5"
  elderly-bg: "#001a33"
  elderly-text: "#000000"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 900
    lineHeight: 1.2
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Space Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.05em"
rounded:
  sm: "8px"
  md: "16px"
  lg: "24px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-verified}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
  glass-input:
    backgroundColor: "rgba(255, 255, 255, 0.4)"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: VeriFlow-AntiRumor

## 1. Overview

**Creative North Star: "纸质账单与印章核据 (The Stamped Invoice)"**

本设计系统旨在为视力、交互反应处于退化阶段的数字银发族，营造一种极具安全感与直观度的数字事实核查环境。核心隐喻是**“实体纸质消费账单/核查小票”**与**“朱红防伪物理印章”**。小票顶部采用锯齿切割纹理，底部为经典的撕裂锯齿，加载时输出打字机的摩擦声，完成时伴随沉稳有力的盖章回响，这让冰冷的网络数据流显影为长辈熟悉的实体凭证。

系统界面通过“温暖麦田”主色调防疲劳，提供普通模式（高透光玻璃化）与长辈模式（强对比纯黑/海蓝）的双向无缝重组，彻底杜绝悬浮、游离的抽象弹窗，力求将交互颗粒度打磨至日常实物操作的水准。

**Key Characteristics:**
- **实体触感**：通过 3D 透视视角的拟物理玻璃卡片、厚重的边框与撕裂锯齿，让网页交互具有实体存在感。
- **高确定性**：所有的核查状态最终收拢为明确的色块大印章，绝无模糊的 AI 幻觉和推辞性文字。
- **听觉辅助**：全流程引入环境音效配合（打字音效代表处理，盖章音效代表定夺），强化用户的操作确定性。

## 2. Colors

本系统采用极富承诺感与语义边界清晰的“限制性”色彩策略，拒绝使用无意义的装饰性渐变。

### Primary
- **证实绿 (primary-verified)** (#00B86B): 用于“证实”状态的印章、按钮及成功标志，传递绝对的安全与真实。
- **伪造红 (primary-fake)** (#FF3B30): 用于“谣言 / 伪造”状态的印章、警告按钮，强对比警示，代表危险和谎言。
- **存疑黄 (primary-doubtful)** (#FFCC00): 用于“存疑 / 数据不足”状态的印章，提示注意。

### Neutral
- **温暖麦田 (neutral-bg)** (#EAE6DF): 默认状态下的防疲劳背景，带有自然的暖纸质感。
- **深木炭灰 (neutral-text)** (#2C2C2C): 默认模式下的正文字体，柔和且高清晰，不伤眼。
- **宣纸纯白 (receipt-bg)** (#FAF8F5): 辟谣小票的纸质底色，模拟真实的纸张纤维感。
- **深海幽蓝 (elderly-bg)** (#001a33): 长辈模式下强制启动的高对比度背景。
- **硬石漆黑 (elderly-text)** (#000000): 长辈模式下小票正文字体的强覆盖，提供最大对比度。

### Named Rules
**The Rare Accent Rule.** 证实绿、伪造红、存疑黄仅能出现在状态印章、首要提交动作、及对应分类卡片的描边上，任何页面中上述三种高饱和度语义色的覆盖面积不得超过 10%，用稀缺性巩固警示权威。

## 3. Typography

**Display Font:** Inter, ui-sans-serif, system-ui, sans-serif
**Body Font:** Inter, ui-sans-serif, system-ui, sans-serif
**Label/Mono Font:** Space Mono, ui-monospace, SFMono-Regular, monospace

**Character:** 采用无衬线几何字体（Inter）支撑排版骨架，保证在各类屏幕分辨率下文字视认性最高。数据与技术指标使用等宽字体（Space Mono）呈现。

### Hierarchy
- **Display** (Heavy (900), 36px/clamp, 1.2): 页面核心大标题，以及长辈模式下的辟谣通知标题。
- **Headline** (Bold (700), 24px, 1.3): 小票的结论状态及各个推理节点的手风琴标题。
- **Title** (Semi-Bold (600), 18px, 1.4): 输入确认和卡片副标题。
- **Body** (Regular (400), 16px, 1.5): 正文事实陈述、论据细节。最大行宽限制在 65ch 以防行尾扫视疲劳。
- **Label** (Medium (500), 12px, tracking 0.05em): 时间戳、哈希编码、流程图节点类型标签。

### Named Rules
**The Non-Fluid Product Rule.** 为了防止在不同分辨率下字体无极缩放导致界面结构错位（特别是长辈大字重组），禁止在应用内部使用流式排版（如 `vw` 字体单位），必须使用明确的响应式字号（`rem` / `px`）双轨覆盖。

## 4. Elevation

系统坚持“平贴为主、交互微凸”的深度理念。拒绝浮夸的、为了质感而做的投影堆叠，将所有的物理悬浮感留给“操作状态反馈”。

### Shadow Vocabulary
- **账单边缘阴影 (ambient-low)** (`0 12px 48px rgba(44, 44, 44, 0.06)`): 赋予小票和输入容器悬立于麦田背景之上的微弱纵深。
- **物理悬浮阴影 (ambient-high)** (`0.5em -0.5em 1em rgba(0, 0, 0, 0.18)`): 赋予大图标输入按钮在鼠标悬停或焦点激活时的微凸纵深。

### Named Rules
**The Flat At Rest Rule.** 所有卡片、按钮在静止（At Rest）状态下均无明显厚重阴影。投影仅在用户产生悬停（Hover）或焦点激活（Focus）时作为微小的物理力学弹力回馈呈现。

## 5. Components

### Buttons
- **Shape:** 柔和边缘 (8px 倒角) 或超大椭圆 (999px)
- **Primary:** 主色背景 + 纯白文字。长辈模式下首要按钮强制转化为高亮色（#00B86B）。
- **Hover / Focus:** 按下时伴随 `-translate-y-0.5` 与微增的 `box-shadow`。长辈模式不采用微移，直接高亮边界。

### Cards / Containers (辟谣小票)
- **Corner Style:** 经典直角与锯齿边缘。
- **Background:** #FAF8F5 (宣纸白)
- **Border:** 默认无边框；长辈模式强制附带 `3px solid #000000` 强对比粗黑线。
- **Internal Padding:** 1.5rem (24px) 保证内容绝不拥挤。

### Inputs / Fields
- **Style:** 40% 不透明度白色玻璃微透，带 1px 细线边框。
- **Focus:** `border-color` 转化为 neutral-text (墨黑)，去除蓝色的默认发光。

## 6. Do's and Don'ts

### Do:
- **Do** 保证长辈模式下的段落行高至少为 1.6 倍以上，预防长辈阅读发生视觉串行。
- **Do** 在渲染 Mermaid 逻辑因果图时提供自适应的手势缩放（Zoom）和滚轮拖拽事件，以便放大查看细节。
- **Do** 每一个页面图片资源都经过同源接口 `/api/proxy-image` 中转，以防 Canvas 污染破坏截图卡片的正常导出。

### Don't:
- **Don't** 在正文背景与文本之间使用低于 4.5:1 的对比度。严禁使用浅灰色文字表示说明。
- **Don't** 对大图标或图像直接在 hover 时施加缩放动画，避免老年用户产生视觉错乱（遵循禁止悬停缩放图片准则）。
- **Don't** 嵌套卡片。小票即为唯一的内容承载卡，小票内不得再嵌套次级白底卡片。
