# 使用 Node 基础镜像进行前端和后端构建
FROM node:20-alpine AS builder
WORKDIR /app

# 安装依赖并构建项目
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 运行阶段使用轻量级 Node 基础镜像
FROM node:20-alpine
WORKDIR /app

# 安装 Python3 以及 venv 并部署 edge-tts
RUN apk add --no-cache python3 py3-pip && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install edge-tts

# 建立 edge-tts 全局软链接，使 Node 脚本可以通过 execFile("edge-tts") 调用
RUN ln -s /opt/venv/bin/edge-tts /usr/local/bin/edge-tts

# 从构建阶段复制必要的文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/config.json ./

# 仅安装生产环境所需的 Node 模块
RUN npm ci --omit=dev

# 暴露端口：3001（本地/1Panel默认）与 7860（Hugging Face Spaces默认）
# Node 服务会读取 PORT 环境变量，如果没有则回退至 3001
EXPOSE 3001
EXPOSE 7860

CMD ["node", "server.js"]
