# 使用轻量级 Node 运行环境
FROM node:20-alpine
WORKDIR /app

# 安装 Python3 和 edge-tts (语音合成所需)
RUN apk add --no-cache python3 py3-pip && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install edge-tts

# 软链接到全局环境
RUN ln -s /opt/venv/bin/edge-tts /usr/local/bin/edge-tts

# 直接复制本地已经编译好的前端 dist 和后端 server.js
COPY dist ./dist
COPY server.js ./server.js
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY config.json ./config.json

# 仅安装生产环境依赖
RUN npm ci --omit=dev --jobs=1 --no-audit --no-fund && npm cache clean --force

# 强制注入 PORT 环境变量为 Hugging Face 所需的 7860
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]
