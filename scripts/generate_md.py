import json

with open('scripts/extracted_prompts.json', 'r', encoding='utf-8') as f:
    prompts = json.load(f)

md_content = """# 谣言终结者 (VeriFlow-AntiRumor) 后端大模型与智能体节点提示词汇总

本文件汇集了 **Dify 双智能体级联编排事实核查工作流** 中所有大模型（LLM）节点、智能体（Agent）节点的提示词与核心指令。该工作流是系统的核心后台逻辑，实现了从多模态输入特征提取、红蓝逻辑对抗、全球多源检索、死链自愈合规，到适老化有声广播和大字报生成的全链路事实核查。

---

## 目录
"""

# Generate TOC
for i, p in enumerate(prompts):
    md_content += f"{i+1}. [{p['title']} (ID: {p['id']})](#{p['title'].replace(' ', '-').lower()})\n"

md_content += "\n---\n"

# Generate content
for p in prompts:
    md_content += f"## {p['title']}\n"
    md_content += f"- **节点 ID**: `{p['id']}`\n"
    md_content += f"- **节点类型**: `{p['type']}`\n\n"
    md_content += "### 提示词/系统指令 (Prompt/Instruction)\n"
    
    # If it's markdown, format it nicely or put in code block
    prompt = p['prompt']
    
    # Check if prompt contains markdown headers, code blocks, etc.
    # To keep it readable, we can render it inside a blockquote or a markdown block,
    # or wrap in a markdown block. Let's wrap in a fenced block to show the exact text.
    md_content += "```markdown\n"
    md_content += prompt
    md_content += "\n```\n\n"
    md_content += "---\n\n"

# Remove the trailing line separator
md_content = md_content.rstrip('\n-')

with open('BACKEND_PROMPTS.md', 'w', encoding='utf-8') as out:
    out.write(md_content)

print("Markdown generated successfully in BACKEND_PROMPTS.md!")
